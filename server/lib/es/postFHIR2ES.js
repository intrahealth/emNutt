'use strict';
const {
  CacheFhirToES
} = require('fhir2es');
const async = require('async')
const moment = require('moment')
const uuid5 = require('uuid/v5');
const URI = require('urijs');
const axios = require('axios');
const config = require('../config')
const logger = require('../winston')

const populateMessageSendingSummary = (reset, callback) => {
  let modConfig = {
    ESBaseURL: config.get('elastic:baseURL'),
    ESUsername: config.get('elastic:username'),
    ESPassword: config.get('elastic:password'),
    ESMaxCompilationRate: config.get('elastic:max_compilations_rate'),
    ESMaxScrollContext: config.get('elastic:max_scroll_context'),
    FHIRBaseURL: config.get('macm:baseURL'),
    FHIRUsername: config.get('macm:username'),
    FHIRPassword: config.get('macm:password'),
  }
  if(reset === true) {
    modConfig.reset = reset
  }
  let caching = new CacheFhirToES(modConfig);
  const cacheToIndex = {
    highLevel: 'mheromessagesendsummary',
    byCadre: 'mheromessagesendsummarybycadre',
    byRegion: 'mheromessagesendsummarybyregion'
  }
  const cacheFromIndex = 'mheromessagesendbreakdown'
  caching.getLastIndexingTime(cacheToIndex.highLevel).then(() => {
    async.parallel([
      (callback) => {
        caching.createESIndex(cacheToIndex.highLevel, [], (err) => {
          return callback(null)
        })
      },
      (callback) => {
        caching.createESIndex(cacheToIndex.byCadre, [], (err) => {
          return callback(null)
        })
      },
      (callback) => {
        caching.createESIndex(cacheToIndex.byRegion, [], (err) => {
          return callback(null)
        })
      }
    ], () => {
      caching.updateESScrollContext().then(() => {
        caching.updateESCompilationsRate(() => {
          let query = {
            query: {
              range: {
                started: {
                  gt: caching.lastBeganIndexingTime
                }
              }
            }
          }
          caching.getESDocument(cacheFromIndex, query, (err, documents) => {
            let mergedDocs = []
            let mergedDocsByCadre = []
            let mergedDocsByCounty = []
            let recentRun = caching.lastBeganIndexingTime
            for(let doc of documents) {
              //high level summary
              let exist = mergedDocs.findIndex((merged) => {
                let started = merged.startedDate + 'T' + merged.startedTime
                return merged.flowID === doc._source.workflow && started == doc._source.started
              })
              if(exist !== -1) {
                if(doc._source.send_status === 'entered-in-error') {
                  mergedDocs[exist].failed++
                } else if(doc._source.send_status === 'completed') {
                  mergedDocs[exist].sent++
                }
              } else {
                let flattened = {
                  message: doc._source.message,
                  startedDate: doc._source.started.split('T')[0],
                  startedTime: doc._source.started.split('T')[1],
                  failed: 0,
                  sent: 0
                }
                if(doc._source.send_status === 'entered-in-error') {
                  flattened.failed = 1
                } else if(doc._source.send_status === 'completed') {
                  flattened.sent = 1
                }
                mergedDocs.push(flattened)
              }

              //summary by cadre
              let existByCadre = mergedDocsByCadre.findIndex((merged) => {
                let started = merged.startedDate + 'T' + merged.startedTime
                return merged.flowID === doc._source.workflow && started == doc._source.started && merged.cadre === doc._source.cadre
              })
              if(existByCadre !== -1) {
                if(doc._source.send_status === 'entered-in-error') {
                  mergedDocsByCadre[existByCadre].failed++
                } else if(doc._source.send_status === 'completed') {
                  mergedDocsByCadre[existByCadre].sent++
                }
              } else {
                let flattened = {
                  message: doc._source.message,
                  cadre: doc._source.cadre,
                  startedDate: doc._source.started.split('T')[0],
                  startedTime: doc._source.started.split('T')[1],
                  failed: 0,
                  sent: 0
                }
                if(doc._source.send_status === 'entered-in-error') {
                  flattened.failed = 1
                } else if(doc._source.send_status === 'completed') {
                  flattened.sent = 1
                }
                mergedDocsByCadre.push(flattened)
              }

              //summary by region/county
              let existByRegion = mergedDocsByCounty.findIndex((merged) => {
                let started = merged.startedDate + 'T' + merged.startedTime
                return merged.flowID === doc._source.workflow && started == doc._source.started && merged.regionName === doc._source.regionName
              })
              if(existByRegion !== -1) {
                if(doc._source.send_status === 'entered-in-error') {
                  mergedDocsByCounty[existByRegion].failed++
                } else if(doc._source.send_status === 'completed') {
                  mergedDocsByCounty[existByRegion].sent++
                }
              } else {
                let flattened = {
                  message: doc._source.message,
                  regionName: doc._source.regionName,
                  startedDate: doc._source.started.split('T')[0],
                  startedTime: doc._source.started.split('T')[1],
                  failed: 0,
                  sent: 0
                }
                if(doc._source.send_status === 'entered-in-error') {
                  flattened.failed = 1
                } else if(doc._source.send_status === 'completed') {
                  flattened.sent = 1
                }
                mergedDocsByCounty.push(flattened)
              }

              let flowRunDate = moment(doc._source.started)
              let recent = moment(recentRun)
              if(flowRunDate > recent) {
                recentRun = doc._source.started
              }
            }

            //save to elasticsearch
            async.parallel({
              highlevel: (callback) => {
                async.eachSeries(mergedDocs, (mergedDoc, nxt) => {
                  mergedDoc.lastUpdated = moment().format('Y-MM-DDTHH:mm:ss');
                  let id = uuid5(mergedDoc.flowID + mergedDoc.startedDate + 'T' + mergedDoc.startedTime, config.get("namespaces:broadcastID"));
                  let url = URI(config.get('elastic:baseURL')).segment(cacheToIndex.highLevel).segment('_doc').segment(id).toString()
                  axios({
                    method: 'POST',
                    url,
                    auth: {
                      username: config.get('elastic:username'),
                      password: config.get('elastic:password'),
                    },
                    data: mergedDoc
                  }).then((response) => {
                    return nxt()
                  }).catch((err) => {
                    logger.error(err);
                    logger.error('Req Data: ' + JSON.stringify(mergedDoc,0,2));
                    return nxt()
                  })
                }, () => {
                  let newLastEndedIndexingTime = moment().format('Y-MM-DDTHH:mm:ss');
                  caching.updateLastIndexingTime(recentRun, newLastEndedIndexingTime, cacheToIndex.highLevel)
                  return callback(null)
                })
              },
              byCadre: (callback) => {
                async.eachSeries(mergedDocsByCadre, (mergedDoc, nxt) => {
                  mergedDoc.lastUpdated = moment().format('Y-MM-DDTHH:mm:ss');
                  let id = uuid5(mergedDoc.flowID + mergedDoc.startedDate + 'T' + mergedDoc.startedTime + mergedDoc.cadre, config.get("namespaces:broadcastID"));
                  let url = URI(config.get('elastic:baseURL')).segment(cacheToIndex.byCadre).segment('_doc').segment(id).toString()
                  axios({
                    method: 'POST',
                    url,
                    auth: {
                      username: config.get('elastic:username'),
                      password: config.get('elastic:password'),
                    },
                    data: mergedDoc
                  }).then((response) => {
                    return nxt()
                  }).catch((err) => {
                    logger.error(err);
                    logger.error('Req Data: ' + JSON.stringify(mergedDoc,0,2));
                    return nxt()
                  })
                }, () => {
                  return callback(null)
                })
              },
              byRegion: (callback) => {
                async.eachSeries(mergedDocsByCounty, (mergedDoc, nxt) => {
                  mergedDoc.lastUpdated = moment().format('Y-MM-DDTHH:mm:ss');
                  let id = uuid5(mergedDoc.flowID + mergedDoc.startedDate + 'T' + mergedDoc.startedTime + mergedDoc.regionName, config.get("namespaces:broadcastID"));
                  let url = URI(config.get('elastic:baseURL')).segment(cacheToIndex.byRegion).segment('_doc').segment(id).toString()
                  axios({
                    method: 'POST',
                    url,
                    auth: {
                      username: config.get('elastic:username'),
                      password: config.get('elastic:password'),
                    },
                    data: mergedDoc
                  }).then((response) => {
                    return nxt()
                  }).catch((err) => {
                    logger.error(err);
                    logger.error('Req Data: ' + JSON.stringify(mergedDoc,0,2));
                    return nxt()
                  })
                }, () => {
                  return callback(null)
                })
              }
            }, () => {
              return callback()
            })
          })
        })
      }).catch((err) => {
        logger.error(err);
        return callback()
      })
    })
  }).catch((err) => {
    logger.error(err);
    return callback()
  })
}

const populateFlowRunSummary = (reset, callback) => {
  let modConfig = {
    ESBaseURL: config.get('elastic:baseURL'),
    ESUsername: config.get('elastic:username'),
    ESPassword: config.get('elastic:password'),
    ESMaxCompilationRate: config.get('elastic:max_compilations_rate'),
    ESMaxScrollContext: config.get('elastic:max_scroll_context'),
    FHIRBaseURL: config.get('macm:baseURL'),
    FHIRUsername: config.get('macm:username'),
    FHIRPassword: config.get('macm:password'),
  }
  if(reset === true) {
    modConfig.reset = reset
  }
  let caching = new CacheFhirToES(modConfig);
  const cacheToIndex = {
    highLevel: 'mheroflowrunsummary',
    byCadre: 'mheroflowrunsummarybycadre',
    byRegion: 'mheroflowrunsummarybyregion'
  }
  const cacheFromIndex = 'mheroflowrunbreakdown'
  caching.getLastIndexingTime(cacheToIndex.highLevel).then(() => {
    async.parallel([
      (callback) => {
        caching.createESIndex(cacheToIndex.highLevel, [], (err) => {
          return callback(null)
        })
      },
      (callback) => {
        caching.createESIndex(cacheToIndex.byCadre, [], (err) => {
          return callback(null)
        })
      },
      (callback) => {
        caching.createESIndex(cacheToIndex.byRegion, [], (err) => {
          return callback(null)
        })
      }
    ], () => {
      caching.updateESScrollContext().then(() => {
        caching.updateESCompilationsRate(() => {
          let query = {
            query: {
              range: {
                started: {
                  gt: caching.lastIndexingTime
                }
              }
            }
          }
          caching.getESDocument(cacheFromIndex, query, (err, documents) => {
            let mergedDocs = []
            let mergedDocsByCadre = []
            let mergedDocsByCounty = []
            let recentRun = caching.lastIndexingTime
            for(let doc of documents) {
              if(!doc._source.workflow) {
                continue
              }
              //high level summary
              let exist = mergedDocs.findIndex((merged) => {
                let started = merged.startedDate + 'T' + merged.startedTime
                return merged.flowID === doc._source.workflow && started == doc._source.started
              })
              if(exist !== -1) {
                if(doc._source.send_status === 'entered-in-error') {
                  mergedDocs[exist].failed++
                } else if(doc._source.send_status === 'completed') {
                  mergedDocs[exist].sent++
                }

                if(doc._source.responded === 'Yes') {
                  mergedDocs[exist].responded++
                } else if(doc._source.responded === 'No') {
                  mergedDocs[exist].didntRespond++
                }

                if(doc._source.exit_type === 'interrupted') {
                  mergedDocs[exist].interrupted++
                } else if(doc._source.exit_type === 'completed') {
                  mergedDocs[exist].completed++
                } else if(doc._source.exit_type === 'expired') {
                  mergedDocs[exist].expired++
                }
              } else {
                let flattened = {
                  flowID: doc._source.workflow,
                  flowName: doc._source.WorkflowName,
                  startedDate: doc._source.started.split('T')[0],
                  startedTime: doc._source.started.split('T')[1],
                  failed: 0,
                  sent: 0,
                  responded: 0,
                  didntRespond: 0,
                  interrupted: 0,
                  completed: 0,
                  expired: 0
                }
                if(doc._source.send_status === 'entered-in-error') {
                  flattened.failed = 1
                } else if(doc._source.send_status === 'completed') {
                  flattened.sent = 1
                }

                if(doc._source.responded === 'Yes') {
                  flattened.responded = 1
                } else if(doc._source.responded === 'No') {
                  flattened.didntRespond = 1
                }

                if(doc._source.exit_type === 'interrupted') {
                  flattened.interrupted = 1
                } else if(doc._source.exit_type === 'completed') {
                  flattened.completed = 1
                } else if(doc._source.exit_type === 'expired') {
                  flattened.expired = 1
                }
                mergedDocs.push(flattened)
              }

              //summary by cadre
              let existByCadre = mergedDocsByCadre.findIndex((merged) => {
                let started = merged.startedDate + 'T' + merged.startedTime
                return merged.flowID === doc._source.workflow && started == doc._source.started && merged.cadre === doc._source.cadre
              })
              if(existByCadre !== -1) {
                if(doc._source.send_status === 'entered-in-error') {
                  mergedDocsByCadre[existByCadre].failed++
                } else if(doc._source.send_status === 'completed') {
                  mergedDocsByCadre[existByCadre].sent++
                }

                if(doc._source.responded === 'Yes') {
                  mergedDocsByCadre[existByCadre].responded++
                } else if(doc._source.responded === 'No') {
                  mergedDocsByCadre[existByCadre].didntRespond++
                }

                if(doc._source.exit_type === 'interrupted') {
                  mergedDocsByCadre[existByCadre].interrupted++
                } else if(doc._source.exit_type === 'completed') {
                  mergedDocsByCadre[existByCadre].completed++
                } else if(doc._source.exit_type === 'expired') {
                  mergedDocsByCadre[existByCadre].expired++
                }
              } else {
                let flattened = {
                  flowID: doc._source.workflow,
                  flowName: doc._source.WorkflowName,
                  cadre: doc._source.cadre,
                  startedDate: doc._source.started.split('T')[0],
                  startedTime: doc._source.started.split('T')[1],
                  failed: 0,
                  sent: 0,
                  responded: 0,
                  didntRespond: 0,
                  interrupted: 0,
                  completed: 0,
                  expired: 0
                }
                if(doc._source.send_status === 'entered-in-error') {
                  flattened.failed = 1
                } else if(doc._source.send_status === 'completed') {
                  flattened.sent = 1
                }

                if(doc._source.responded === 'Yes') {
                  flattened.responded = 1
                } else if(doc._source.responded === 'No') {
                  flattened.didntRespond = 1
                }

                if(doc._source.exit_type === 'interrupted') {
                  flattened.interrupted = 1
                } else if(doc._source.exit_type === 'completed') {
                  flattened.completed = 1
                } else if(doc._source.exit_type === 'expired') {
                  flattened.expired = 1
                }
                mergedDocsByCadre.push(flattened)
              }

              //summary by region/county
              let existByRegion = mergedDocsByCounty.findIndex((merged) => {
                let started = merged.startedDate + 'T' + merged.startedTime
                return merged.flowID === doc._source.workflow && started == doc._source.started && merged.regionName === doc._source.regionName
              })
              if(existByRegion !== -1) {
                if(doc._source.send_status === 'entered-in-error') {
                  mergedDocsByCounty[existByRegion].failed++
                } else if(doc._source.send_status === 'completed') {
                  mergedDocsByCounty[existByRegion].sent++
                }

                if(doc._source.responded === 'Yes') {
                  mergedDocsByCounty[existByRegion].responded++
                } else if(doc._source.responded === 'No') {
                  mergedDocsByCounty[existByRegion].didntRespond++
                }

                if(doc._source.exit_type === 'interrupted') {
                  mergedDocsByCounty[existByRegion].interrupted++
                } else if(doc._source.exit_type === 'completed') {
                  mergedDocsByCounty[existByRegion].completed++
                } else if(doc._source.exit_type === 'expired') {
                  mergedDocsByCounty[existByRegion].expired++
                }
              } else {
                let flattened = {
                  flowID: doc._source.workflow,
                  flowName: doc._source.WorkflowName,
                  regionName: doc._source.regionName,
                  startedDate: doc._source.started.split('T')[0],
                  startedTime: doc._source.started.split('T')[1],
                  failed: 0,
                  sent: 0,
                  responded: 0,
                  didntRespond: 0,
                  interrupted: 0,
                  completed: 0,
                  expired: 0
                }
                if(doc._source.send_status === 'entered-in-error') {
                  flattened.failed = 1
                } else if(doc._source.send_status === 'completed') {
                  flattened.sent = 1
                }

                if(doc._source.responded === 'Yes') {
                  flattened.responded = 1
                } else if(doc._source.responded === 'No') {
                  flattened.didntRespond = 1
                }

                if(doc._source.exit_type === 'interrupted') {
                  flattened.interrupted = 1
                } else if(doc._source.exit_type === 'completed') {
                  flattened.completed = 1
                } else if(doc._source.exit_type === 'expired') {
                  flattened.expired = 1
                }
                mergedDocsByCounty.push(flattened)
              }
              let flowRunDate = moment(doc._source.started)
              let recent = moment(recentRun)
              if(flowRunDate > recent) {
                recentRun = doc._source.started
              }
            }

            //save to elasticsearch
            async.parallel({
              highlevel: (callback) => {
                async.eachSeries(mergedDocs, (mergedDoc, nxt) => {
                  mergedDoc.lastUpdated = moment().format('Y-MM-DDTHH:mm:ss');
                  let id = uuid5(mergedDoc.flowID + mergedDoc.startedDate + 'T' + mergedDoc.startedTime, config.get("namespaces:broadcastID"));
                  let url = URI(config.get('elastic:baseURL')).segment(cacheToIndex.highLevel).segment('_doc').segment(id).toString()
                  axios({
                    method: 'POST',
                    url,
                    auth: {
                      username: config.get('elastic:username'),
                      password: config.get('elastic:password'),
                    },
                    data: mergedDoc
                  }).then((response) => {
                    return nxt()
                  }).catch((err) => {
                    logger.error(err);
                    logger.error('Req Data: ' + JSON.stringify(mergedDoc,0,2));
                    return nxt()
                  })
                }, () => {
                  caching.updateLastIndexingTime(recentRun, cacheToIndex.highLevel)
                  return callback(null)
                })
              },
              byCadre: (callback) => {
                async.eachSeries(mergedDocsByCadre, (mergedDoc, nxt) => {
                  mergedDoc.lastUpdated = moment().format('Y-MM-DDTHH:mm:ss');
                  let id = uuid5(mergedDoc.flowID + mergedDoc.startedDate + 'T' + mergedDoc.startedTime + mergedDoc.cadre, config.get("namespaces:broadcastID"));
                  let url = URI(config.get('elastic:baseURL')).segment(cacheToIndex.byCadre).segment('_doc').segment(id).toString()
                  axios({
                    method: 'POST',
                    url,
                    auth: {
                      username: config.get('elastic:username'),
                      password: config.get('elastic:password'),
                    },
                    data: mergedDoc
                  }).then((response) => {
                    return nxt()
                  }).catch((err) => {
                    logger.error(err);
                    logger.error('Req Data: ' + JSON.stringify(mergedDoc,0,2));
                    return nxt()
                  })
                }, () => {
                  return callback(null)
                })
              },
              byRegion: (callback) => {
                async.eachSeries(mergedDocsByCounty, (mergedDoc, nxt) => {
                  mergedDoc.lastUpdated = moment().format('Y-MM-DDTHH:mm:ss');
                  let id = uuid5(mergedDoc.flowID + mergedDoc.startedDate + 'T' + mergedDoc.startedTime + mergedDoc.regionName, config.get("namespaces:broadcastID"));
                  let url = URI(config.get('elastic:baseURL')).segment(cacheToIndex.byRegion).segment('_doc').segment(id).toString()
                  axios({
                    method: 'POST',
                    url,
                    auth: {
                      username: config.get('elastic:username'),
                      password: config.get('elastic:password'),
                    },
                    data: mergedDoc
                  }).then((response) => {
                    return nxt()
                  }).catch((err) => {
                    logger.error(err);
                    logger.error('Req Data: ' + JSON.stringify(mergedDoc,0,2));
                    return nxt()
                  })
                }, () => {
                  return callback(null)
                })
              }
            }, () => {
              return callback()
            })
          })
        })
      })
    })
  }).catch((err) => {
    logger.error(err);
    return callback()
  })
}

const populateAll = (reset, callback) => {
  async.series([
    (cb) => {
      populateMessageSendingSummary(reset, () => {
        return cb(null)
      })
    },
    (cb) => {
      populateFlowRunSummary(reset, () => {
        return cb(null)
      })
    }
  ], () => {
    console.log('done');
    return callback()
  })
}

module.exports = {
  populateMessageSendingSummary,
  populateFlowRunSummary,
  populateAll
}