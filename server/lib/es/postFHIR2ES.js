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

let caching = new CacheFhirToES({
  ESBaseURL: config.get('elastic:baseURL'),
  ESUsername: config.get('elastic:username'),
  ESPassword: config.get('elastic:password'),
  ESMaxCompilationRate: config.get('elastic:max_compilations_rate'),
  ESMaxScrollContext: config.get('elastic:max_scroll_context'),
  FHIRBaseURL: config.get('macm:baseURL'),
  FHIRUsername: config.get('macm:username'),
  FHIRPassword: config.get('macm:password'),
});

const populateMessageSendingSummary = (callback) => {
  const cacheToIndex = 'mheromessagesendsummary'
  const cacheFromIndex = 'mheromessagesendbreakdown'
  caching.getLastIndexingTime(cacheToIndex).then(() => {
    caching.createESIndex(cacheToIndex, ['id'], (err) => {
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
            let recentRun = caching.lastIndexingTime
            for(let doc of documents) {
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
                  type: 'message',
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
              let flowRunDate = moment(doc._source.started)
              let recent = moment(recentRun)
              if(flowRunDate > recent) {
                recentRun = doc._source.started
              }
            }


            async.eachSeries(mergedDocs, (mergedDoc, nxt) => {
              mergedDoc.lastUpdated = moment().format('Y-MM-DDTHH:mm:ss');
              let id = uuid5(mergedDoc.flowID + mergedDoc.startedDate + 'T' + mergedDoc.startedTime, config.get("namespaces:broadcastID"));
              let url = URI(config.get('elastic:baseURL')).segment(cacheToIndex).segment('_doc').segment(id).toString()
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
              caching.updateLastIndexingTime(recentRun, cacheToIndex)
              return callback()
            })
          })
        })
      })
    })
  })
}

const populateFlowRunSummary = (callback) => {
  const cacheToIndex = 'mheroflowrunsummary'
  const cacheFromIndex = 'mheroflowrunbreakdown'
  caching.getLastIndexingTime(cacheToIndex).then(() => {
    caching.createESIndex(cacheToIndex, ['id'], (err) => {
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
            let recentRun = caching.lastIndexingTime
            for(let doc of documents) {
              if(!doc._source.workflow) {
                continue
              }
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
                  type: 'Flow',
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
              let flowRunDate = moment(doc._source.started)
              let recent = moment(recentRun)
              if(flowRunDate > recent) {
                recentRun = doc._source.started
              }
            }


            async.eachSeries(mergedDocs, (mergedDoc, nxt) => {
              mergedDoc.lastUpdated = moment().format('Y-MM-DDTHH:mm:ss');
              let id = uuid5(mergedDoc.flowID + mergedDoc.startedDate + 'T' + mergedDoc.startedTime, config.get("namespaces:broadcastID"));
              let url = URI(config.get('elastic:baseURL')).segment(cacheToIndex).segment('_doc').segment(id).toString()
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
              caching.updateLastIndexingTime(recentRun, cacheToIndex)
              return callback()
            })
          })
        })
      })
    })
  })
}

const populateAll = (callback) => {
  async.series([
    (callback) => {
      populateMessageSendingSummary(() => {
        return callback(null)
      })
    },
    (callback) => {
      populateFlowRunSummary(() => {
        return callback(null)
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