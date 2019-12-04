'use strict';
const URI = require('urijs');
const request = require('request');
const async = require('async');
const macm = require('./macm')();
const config = require('./config');
const logger = require('./winston');
module.exports = function () {
  return {
    /**
     *
     * @param {Date} since
     */
    getWorkflows(url, since, callback) {
      let flows1 = require('./flows.json')
      return callback(flows1.results)
      if (!url) {
        var url = URI(config.get('rapidpro:url'))
          .segment('api')
          .segment('v2')
          .segment('flows.json');
        if (since) {
          url.addQuery('after', since);
        }
        url = url.toString();
      }
      //need to make this variable independent of this function so that to handle throttled
      var flows = [];
      async.whilst(
        callback => {
          if (url) {
            logger.info(`Fetching Flows From ${url}`);
          }
          return callback(null, url != false);
        },
        callback => {
          let options = {
            url,
            headers: {
              Authorization: `Token ${config.get('rapidpro:token')}`,
            },
          };
          request(options, (err, res, body) => {
            if (err) {
              logger.error(err);
              return callback(err);
            }
            this.isThrottled(JSON.parse(body), wasThrottled => {
              if (wasThrottled) {
                getWorkflows(url, since, flows => {
                  url = false;
                  return callback(false, false);
                });
              } else {
                if (err) {
                  return callback(err);
                }
                body = JSON.parse(body);
                if (!body.hasOwnProperty('results')) {
                  logger.error(JSON.stringify(body));
                  logger.error(
                    'An error occured while fetching contacts to rapidpro'
                  );
                  return callback();
                }
                flows = flows.concat(body.results);
                if (body.next) {
                  url = body.next;
                } else {
                  url = false;
                }
                return callback(null, url);
              }
            });
          });
        },
        () => {
          return callback(flows);
        }
      );
    },
    processCommunications(commReqs, callback) {
      let flowBody
      let smsBody
      let sendFailed = false
      async.each(commReqs, (commReq, nxtComm) => {
        let msg;
        let workflows = [];
        for (let payload of commReq.resource.payload) {
          if (payload.contentString) {
            msg = payload.contentString;
          }
          if (payload.contentAttachment && payload.contentAttachment.url) {
            workflows.push(payload.contentAttachment.url);
          }
        }
        if (!msg) {
          for (let payload of commReq.resource.payload) {
            if (payload.contentAttachment && payload.contentAttachment.title) {
              msg = payload.contentAttachment.title;
            }
          }
        }

        if (!msg && workflows.length === 0) {
          logger.warn(`No message/workflow found for communication request ${commReq.resource.resourceType}/${commReq.resource.id}`)
          return nxtComm()
        }
        let recipients = []
        let recPromises = []
        for (let recipient of commReq.resource.recipient) {
          recPromises.push(new Promise((resolve) => {
            if (recipient.reference) {
              let resource
              let promise1 = new Promise((resolve1) => {
                if (recipient.reference.startsWith('#')) {
                  if (resource.contained) {
                    let contained = resource.contained.find((contained) => {
                      return contained.id === recipient.reference.substring(1)
                    })
                    if (contained) {
                      resource = {
                        resource: contained
                      }
                    } else {
                      logger.error(`Recipient refers to a # (${recipient.reference}) but was not found on the contained element for a resource ${commReq.resource.resourceType}/${commReq.resource.id}`)
                    }
                  } else {
                    logger.error(`Recipient refers to a # but resource has no contained element ${commReq.resource.resourceType}/${commReq.resource.id}`)
                  }
                  resolve1()
                } else {
                  macm.getResource(recipient.reference, (recResource) => {
                    if (Array.isArray(recResource) && recResource.length === 1) {
                      resource = recResource[0]
                    } else if (Array.isArray(recResource) && recResource.length === 0) {
                      logger.error(`Reference ${recipient.reference} was not found on the server`)
                    }
                    resolve1()
                  })
                }
              })
              promise1.then(() => {
                if (resource) {
                  if (resource.telecom && Array.isArray(resource.telecom) && resource.telecom.length > 0) {
                    for (let telecom of recipient.telecom) {
                      if (telecom.use && telecom.use === 'mobile') {
                        recipients.push("tel:" + telecom.value)
                      }
                    }
                  }
                }
                resolve()
              }).catch((err) => {
                logger.error(err)
                resolve()
              })
            } else {
              resolve()
            }
          }))
        }

        Promise.all(recPromises).then(() => {
          if (workflows.length > 0) {
            for (let workflow of workflows) {
              flowBody.push({
                "flow": workflow,
                "urns": recipients
              })
            }
          }
          if (sms) {
            smsBody = {
              "text": sms,
              "urns": recipients
            }
          }
          async.parallel({
            startFlow: (callback) => {
              if (workflows.length > 0) {
                for (let workflow of workflows) {
                  let flowBody = {}
                  flowBody.flow = workflow
                  flowBody.urns = []
                  let promises = []
                  for (let recipient of recipients) {
                    promises.push(new promises((resolve) => {
                      flowBody.urns.push(recipient)
                      if (flowBody.urns.length > 90) {
                        let tmpFlowBody = {
                          ...flowBody
                        }
                        flowBody.urns = []
                        this.sendMessage(tmpFlowBody, 'workflow', (err, res, body) => {
                          if (res.statusCode < 200 || res.statusCode > 299) {
                            sendFailed = true
                          }
                          resolve()
                        })
                      }
                      resolve()
                    }))
                  }
                  Promise.all(promises).then(() => {
                    if (flowBody.urns.length > 0) {
                      flowBody.urns = []
                      this.sendMessage(flowBody, 'workflow', (err, res, body) => {
                        if (res.statusCode < 200 || res.statusCode > 299) {
                          sendFailed = true
                        }
                        return callback(null)
                      })
                    } else {
                      return callback(null)
                    }
                  })
                }
              } else {
                return callback(null)
              }
            },
            sendSMS: (callback) => {
              if (!smsBody) {
                return callback(null)
              }
              this.sendMessage(smsBody, 'sms', () => {
                return callback(null)
              })
            }
          }, () => {
            // if alert sent successfuly then delete comm request
            if (!sendFailed) {
              macm.deleteResource(`${commReq.resource.resourceType}/${resource.id}`, () => {
                return nxtComm()
              })
            } else {
              return nxtComm()
            }
          })
        }).catch((err) => {
          logger.error(err)
        })
      })
    },

    sendMessage(flowBody, type, callback) {
      let endPoint
      if (type === 'sms') {
        endPoint = 'broadcasts.json'
      } else if (type === 'workflow') {
        endPoint = 'flow_starts.json'
      }
      let url = URI(config.get('rapidpro:url'))
        .segment('api')
        .segment('v2')
        .segment(endPoint)
        .toString();
      let options = {
        url,
        headers: {
          Authorization: `Token ${config.get('rapidpro:token')}`,
        },
        body: flowBody,
        json: true
      };
      request(options, (err, res, body) => {
        if (err) {
          logger.error(err);
          return callback(err);
        }
        this.isThrottled(JSON.parse(body), wasThrottled => {
          if (wasThrottled) {
            startFlow(flowBody, type, (err, res, body) => {
              return callback(err, res, body);
            });
          } else {
            return callback(err, res, body);
          }
        })
      })
    },

    isThrottled(results, callback) {
      if (results === undefined || results === null || results === '') {
        winston.error('An error has occured while checking throttling,empty rapidpro results were submitted');
        return callback(true);
      }
      if (results.hasOwnProperty('detail')) {
        var detail = results.detail.toLowerCase();
        if (detail.indexOf('throttled') != -1) {
          var detArr = detail.split(' ');
          async.eachSeries(
            detArr,
            (det, nxtDet) => {
              if (!isNaN(det)) {
                //add 5 more seconds on top of the wait time expected by rapidpro then convert to miliseconds
                var wait_time = parseInt(det) * 1000 + 5;
                winston.warn(
                  'Rapidpro has throttled my requests,i will wait for ' +
                  wait_time / 1000 +
                  ' Seconds Before i proceed,please dont interrupt me'
                );
                setTimeout(function () {
                  return callback(true);
                }, wait_time);
              } else return nxtDet();
            },
            function () {
              return callback(false);
            }
          );
        } else return callback(false);
      } else {
        callback(false);
      }
    },
  };
};