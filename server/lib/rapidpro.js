/* eslint-disable promise/param-names */
'use strict';
const URI = require('urijs');
const request = require('request');
const async = require('async');
const uuid4 = require('uuid/v4');
const macm = require('./macm')();
const config = require('./config');
const logger = require('./winston');
module.exports = function () {
  return {
    /**
     *
     * @param {*} callback
     */
    getContacts ({
      url,
      groupUUID
    }, callback) {
      if (!url) {
        url = URI(config.get('rapidpro:url'))
          .segment('api')
          .segment('v2')
          .segment('contacts.json');
        if (groupUUID) {
          url = url.addQuery('group', groupUUID);
        }
        url = url.toString();
      }
      // need to make this variable independent of this function so that to handle throttled
      var contacts = [];
      async.whilst(
        callback => {
          if (url) {
            logger.info('Fetching contacts in ' + url);
          }
          return callback(null, url !== false);
        }, (callback) => {
          const options = {
            url,
            headers: {
              Authorization: `Token ${config.get('rapidpro:token')}`,
            }
          };
          request.get(options, (err, res, body) => {
            if (err) {
              logger.error(err);
              return callback(err);
            }
            this.isThrottled(JSON.parse(body), (wasThrottled) => {
              if (wasThrottled) {
                // reprocess this contact
                this.getContacts(url, groupUUID, (rp_contacts) => {
                  contacts = contacts.concat(body.results);
                  return callback(null);
                });
              } else {
                body = JSON.parse(body);
                if (!body.hasOwnProperty('results')) {
                  logger.error(JSON.stringify(body));
                  logger.error('An error occured while fetching contacts to rapidpro');
                  return callback();
                }
                if (body.next) {
                  url = body.next;
                } else {
                  url = false;
                }
                contacts = contacts.concat(body.results);
                return callback(null, url);
              }
            });
          });
        }, () => {
          return callback(contacts);
        }
      );
    },
    /**
     *
     * @param {Object} param0
     * @param {*} callback
     */
    addContact ({
      contact,
      rpContacts
    }, callback) {
      let urns = generateURNS(contact);
      const rpContactWithGlobalid = rpContacts.find((cntct) => {
        return cntct.fields && cntct.fields.globalid === contact.id;
      });
      const rpContactWithoutGlobalid = rpContacts.find((cntct) => {
        return cntct.urns.find((urn) => {
          return urns.includes(urn);
        });
      });
      let body = {};
      let fullName;
      if (Array.isArray(contact.name) && contact.name.length > 0) {
        const name = contact.name[0];
        if (name.text) {
          fullName = name.text;
        } else {
          if (name.given) {
            fullName = name.given;
          }
          if (name.family) {
            fullName += name.family;
          }
        }
      }
      if (!rpContactWithGlobalid && !rpContactWithoutGlobalid) {
        body.name = fullName;
        body.fields = {};
        body.fields.globalid = contact.id;
        body.urns = urns;
      } else {
        if (rpContactWithGlobalid) {
          body = rpContactWithGlobalid;
        } else {
          body = rpContactWithoutGlobalid;
        }
        body.name = fullName;
        urns = body.urns.concat(urns);
        // ensure urns are unique
        const urnsSet = new Set(urns);
        urns = [...urnsSet];
        // end of ensuring urns are unique
        body.urns = urns;
        if (rpContactWithoutGlobalid && !rpContactWithGlobalid) {
          body.fields.globalid = contact.id;
        }
      }
      const url = URI(config.get('rapidpro:url'))
        .segment('api')
        .segment('v2')
        .segment('contacts.json')
        .toString();
      const options = {
        url,
        headers: {
          Authorization: `Token ${config.get('rapidpro:token')}`,
        },
        json: body,
      };
      request.post(options, (err, res, body) => {
        logger.info(body);
        if (err) {
          logger.error(err);
        }
        return callback(err, res, body);
      });
    },
    /**
     *
     * @param {Date} since
     */
    getWorkflows (url, since, callback) {
      // const flows1 = require('./flows.json');
      // return callback(flows1.results);
      if (!url) {
        url = URI(config.get('rapidpro:url'))
          .segment('api')
          .segment('v2')
          .segment('flows.json');
        if (since) {
          url.addQuery('after', since);
        }
        url = url.toString();
      }
      // need to make this variable independent of this function so that to handle throttled
      var flows = [];
      async.whilst(
        callback => {
          if (url) {
            logger.info(`Fetching Flows From ${url}`);
          }
          return callback(null, url != false);
        },
        callback => {
          const options = {
            url,
            headers: {
              Authorization: `Token ${config.get('rapidpro:token')}`,
            },
          };
          request.get(options, (err, res, body) => {
            if (err) {
              logger.error(err);
              return callback(err);
            }
            this.isThrottled(JSON.parse(body), wasThrottled => {
              if (wasThrottled) {
                this.getWorkflows(url, since, flows => {
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
    processCommunications (commReqs, rpContacts, callback) {
      let sendFailed = false;
      logger.info(`Processing ${commReqs.entry.length} communication requests`);
      async.each(commReqs.entry, (commReq, nxtComm) => {
        let msg;
        const workflows = [];
        for (const payload of commReq.resource.payload) {
          if (payload.contentString) {
            msg = payload.contentString;
          }
          if (payload.contentAttachment && payload.contentAttachment.url) {
            workflows.push(payload.contentAttachment.url);
          }
        }
        if (!msg) {
          for (const payload of commReq.resource.payload) {
            if (payload.contentAttachment && payload.contentAttachment.title) {
              msg = payload.contentAttachment.title;
            }
          }
        }

        if (!msg && workflows.length === 0) {
          logger.warn(`No message/workflow found for communication request ${commReq.resource.resourceType}/${commReq.resource.id}`);
          return nxtComm();
        }
        const recipients = [];
        const recPromises = [];
        for (const recipient of commReq.resource.recipient) {
          recPromises.push(new Promise(resolve => {
            if (recipient.reference) {
              let resource;
              const promise1 = new Promise(resolve1 => {
                if (recipient.reference.startsWith('#')) {
                  if (commReq.resource.contained) {
                    const contained = commReq.resource.contained.find(contained => {
                      return contained.id === recipient.reference.substring(1);
                    });
                    if (contained) {
                      resource = {
                        resource: contained,
                      };
                    } else {
                      logger.error(`Recipient refers to a # (${recipient.reference}) but was not found on the contained element for a resource ${commReq.resource.resourceType}/${commReq.resource.id}`);
                    }
                  } else {
                    logger.error(`Recipient refers to a # but resource has no contained element ${commReq.resource.resourceType}/${commReq.resource.id}`);
                  }
                  resolve1();
                } else {
                  macm.getResource(recipient.reference, recResource => {
                    if (Array.isArray(recResource) && recResource.length === 1) {
                      resource = recResource[0];
                    } else if (Array.isArray(recResource) && recResource.length === 0) {
                      logger.error(`Reference ${recipient.reference} was not found on the server`);
                    }
                    resolve1();
                  });
                }
              });
              promise1.then(() => {
                if (resource) {
                  if (resource.resource.telecom && Array.isArray(resource.resource.telecom) && resource.resource.telecom.length > 0) {
                    for (const telecom of resource.resource.telecom) {
                      if (telecom.system && telecom.system === 'phone') {
                        recipients.push('tel:' + telecom.value);
                      }
                    }
                  }
                }
                if (resource && !config.get('rapidpro:syncAllContacts')) {
                  this.addContact({
                    contact: resource.resource,
                    rpContacts
                  }, () => {
                    resolve();
                  });
                } else {
                  resolve();
                }
              }).catch(err => {
                logger.error(err);
                resolve();
              });
            } else {
              resolve();
            }
          }));
        }
        Promise.all(recPromises).then(() => {
          async.parallel({
            startFlow: callback => {
              if (workflows.length > 0) {
                let createNewReq = false;
                let counter = 0;
                for (const workflow of workflows) {
                  logger.info('Starting workflow ' + workflow);
                  if (counter > 0) {
                    createNewReq = true;
                  }
                  counter += 1;
                  const flowBody = {};
                  flowBody.flow = workflow;
                  flowBody.urns = [];
                  const promises = [];
                  for (const recipient of recipients) {
                    promises.push(new Promise(resolve => {
                      flowBody.urns.push(recipient);
                      if (flowBody.urns.length > 90) {
                        const tmpFlowBody = {
                          ...flowBody,
                        };
                        flowBody.urns = [];
                        this.sendMessage(tmpFlowBody, 'workflow', (err, res, body) => {
                          if (err) {
                            logger.error(err);
                            sendFailed = true;
                          }
                          if (res.statusCode < 200 || res.statusCode > 299) {
                            sendFailed = true;
                          }
                          this.updateCommunicationRequest(commReq, body, 'workflow', createNewReq);
                          resolve();
                        });
                        createNewReq = true;
                      }
                      resolve();
                    }));
                  }
                  Promise.all(promises).then(() => {
                    if (flowBody.urns.length > 0) {
                      this.sendMessage(flowBody, 'workflow', (err, res, body) => {
                        if (err) {
                          logger.error(err);
                          sendFailed = true;
                        }
                        if (res.statusCode < 200 || res.statusCode > 299) {
                          sendFailed = true;
                        }
                        this.updateCommunicationRequest(commReq, body, 'workflow', createNewReq);
                        return callback(null);
                      });
                    } else {
                      return callback(null);
                    }
                  });
                }
              } else {
                return callback(null);
              }
            },
            sendSMS: callback => {
              if (!msg) {
                return callback(null);
              }
              const smsBody = {};
              smsBody.text = msg;
              smsBody.urns = [];
              const promises = [];
              let createNewReq = false;
              for (const recipient of recipients) {
                promises.push(new Promise(resolve => {
                  smsBody.urns.push(recipient);
                  if (smsBody.urns.length > 90) {
                    const tmpSmsBody = {
                      ...smsBody,
                    };
                    smsBody.urns = [];
                    this.sendMessage(tmpSmsBody, 'sms', (err, res, body) => {
                      this.updateCommunicationRequest(commReq, body, 'sms', createNewReq);
                      if (err) {
                        logger.error(err);
                        sendFailed = true;
                      }
                      if (res.statusCode < 200 || res.statusCode > 299) {
                        sendFailed = true;
                      }
                      resolve();
                    });
                    createNewReq = true;
                  }
                  resolve();
                }));
              }
              Promise.all(promises).then(() => {
                if (smsBody.urns.length > 0) {
                  this.sendMessage(smsBody, 'sms', (err, res, body) => {
                    if (err) {
                      logger.error(err);
                      sendFailed = true;
                    }
                    if (res.statusCode < 200 || res.statusCode > 299) {
                      sendFailed = true;
                    }
                    return callback(null);
                  });
                } else {
                  return callback(null);
                }
              });
            },
          }, () => {
            return nxtComm();
          });
        }).catch(err => {
          logger.error(err);
        });
      }, () => {
        return callback();
      });
    },

    sendMessage (flowBody, type, callback) {
      let endPoint;
      if (type === 'sms') {
        endPoint = 'broadcasts.json';
      } else if (type === 'workflow') {
        endPoint = 'flow_starts.json';
      } else {
        logger.error('Cant determine the message type ' + type);
        return callback(true);
      }
      const url = URI(config.get('rapidpro:url'))
        .segment('api')
        .segment('v2')
        .segment(endPoint)
        .toString();
      const options = {
        url,
        headers: {
          Authorization: `Token ${config.get('rapidpro:token')}`,
        },
        json: flowBody,
      };
      request.post(options, (err, res, body) => {
        if (err) {
          logger.error(err);
          return callback(err);
        }
        this.isThrottled(body, wasThrottled => {
          if (wasThrottled) {
            this.sendMessage(flowBody, type, (err, res, body) => {
              return callback(err, res, body);
            });
          } else {
            return callback(err, res, body);
          }
        });
      });
    },

    isThrottled (results, callback) {
      if (results === undefined || results === null || results === '') {
        logger.error(
          'An error has occured while checking throttling,empty rapidpro results were submitted'
        );
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
                // add 5 more seconds on top of the wait time expected by rapidpro then convert to miliseconds
                var wait_time = parseInt(det) * 1000 + 5;
                logger.warn(
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

    updateCommunicationRequest (commReq, rpRunStatus, type, createNewReq) {
      logger.info('Updating communication request ' + commReq.resource.id + ' to completed');
      let extUrl;
      if (type === 'sms') {
        extUrl = 'http://mhero.org/extensions/rp_broadcast_starts';
      } else if (type === 'workflow') {
        extUrl = 'http://mhero.org/extensions/rp_flow_starts';
      }
      if (createNewReq) {
        commReq.resource.id = uuid4();
      }
      if (!commReq.resource.extension) {
        commReq.resource.extension = [];
      }
      commReq.resource.status = 'completed';

      let extIndex = 0;
      for (const index in commReq.resource.extension) {
        const ext = commReq.resource.extension[index];
        if (ext.url === extUrl) {
          extIndex = index;
          break;
        }
      }

      const contactsExt = [];
      for (const rpCont of rpRunStatus.contacts) {
        contactsExt.push({
          url: 'uuid',
          valueString: rpCont.uuid
        });
      }
      commReq.resource.extension[extIndex] = {
        url: extUrl,
        extension: [{
          url: 'id',
          valueString: rpRunStatus.id
        }, {
          url: `${extUrl}/extension/contacts`,
          extension: contactsExt
        }, {
          url: 'created_on',
          valueDateTime: rpRunStatus.created_on
        }]
      };
      if (type === 'workflow') {
        commReq.resource.extension[extIndex].extension.push({
          url: 'modified_on',
          valueDateTime: rpRunStatus.modified_on
        }, {
          url: 'flow',
          valueString: rpRunStatus.flow.uuid
        }, {
          url: 'status',
          valueString: rpRunStatus.status
        }, {
          url: 'uuid',
          valueString: rpRunStatus.uuid
        });
      }

      const bundle = {};
      bundle.type = 'batch';
      bundle.resourceType = 'Bundle';
      bundle.entry = [{
        resource: commReq.resource,
        request: {
          method: 'PUT',
          url: `CommunicationRequest/${commReq.resource.id}`,
        }
      }];
      macm.saveResource(bundle, () => {

      });
    }
  };
};

function generateURNS (resource) {
  const urns = [];
  if (resource.telecom && Array.isArray(resource.telecom) && resource.telecom.length > 0) {
    for (const telecom of resource.telecom) {
      if (resource.telecom.system && resource.telecom.system === 'phone') {
        urns.push('tel:' + telecom.value);
      }
    }
  }
  return urns;
}
