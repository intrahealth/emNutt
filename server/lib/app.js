'use strict';
/*global process, __dirname */
const express = require('express');
const bodyParser = require('body-parser');
const cronstrue = require('cronstrue');
const medUtils = require('openhim-mediator-utils');
const cors = require('cors');
const fs = require('fs');
const request = require('request');
const cron = require('node-cron');
const uuid4 = require('uuid/v4');
const isJSON = require('is-json');
const URI = require('urijs');
const async = require('async');
const moment = require('moment');
const lodash = require('lodash');
const redis = require('redis');
const redisClient = redis.createClient({
  host: process.env.REDIS_HOST || '127.0.0.1',
});
const cronjobs = require('./cronjobs');
const logger = require('./winston');
const config = require('./config');
const envVars = require('./envVars');
const rapidpro = require('./rapidpro')();
const eidsr = require('./routes/eidsr');
const dataSync = require('./routes/dataSync');
const dataSyncUtil = require('./dataSync');

const macm = require('./macm')();
const prerequisites = require('./prerequisites');
const mixin = require('./mixin');

const env = process.env.NODE_ENV || 'development';
const mediatorConfig = require(`${__dirname}/../config/mediator_${env}`);
if (config.get('mediator:register')) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = 0;
}
envVars.set();

//this variables tracks processed messages to avoid sending one message to a single practitioner twice
const processedMessages = {}
/**
 * @returns {express.app}
 */
function appRoutes() {
  const app = express();

  app.get('/site-up', cors(), function (req, res, next) {
    res.status(201).json({
      message: 'site is up',
    });
  });

  app.use(cors());
  app.use(bodyParser.json({
    limit: '100mb'
  }));
  app.use(bodyParser.urlencoded({
    limit: '100mb',
    parameterLimit: 100000,
    extended: true
  }));
  app.use('/eidsr', eidsr);
  app.use('/sync', dataSync);

  app.get('/emNutt/fhir/getProgress', (req, res) => {
    const requestIDs = JSON.parse(req.query.requestIDs);
    let progress = []
    async.each(requestIDs.childrenReqIDs, (requestID, nxt) => {
      redisClient.get(requestID, (error, results) => {
        if (error) {
          logger.error(error);
          logger.error(`An error has occured while getting progress for requestID ${requestID}`);
        }
        results = JSON.parse(results);
        progress.push(results)
        return nxt()
      });
    }, () => {
      res.status(200).json(progress);
    })
  });

  app.put('/optout', (req, res) => {
    let globalid = req.query.globalid
    let resourceType = req.query.entitytype
    if(!globalid || !resourceType) {
      return res.status(400).send()
    }
    macm.getResource({
      resource: resourceType,
      id: globalid
    }, (err, resourceData) => {
      if(err || !resourceData) {
        return res.status(400).send()
      }
      if(!resourceData.meta) {
        resourceData.meta = {}
      }
      if(!resourceData.meta.tag) {
        resourceData.meta.tag = []
      }
      for(let index in resourceData.meta.tag) {
        let tag = resourceData.meta.tag[index]
        if(tag.system === 'http://mhero.org/codesystem' && tag.code === 'optedout') {
          resourceData.meta.tag.splice(index, 1)
          break
        }
      }
      resourceData.meta.tag.push({
        system: 'http://mhero.org/codesystem',
        code: 'optedout',
        display: 'Opted Out'
      })
      const bundle = {
        resourceType: 'Bundle',
        type: 'batch',
        entry: [{
          resource: resourceData,
          request: {
            method: 'PUT',
            url: `${resourceType}/${globalid}`
          }
        }]
      };
      macm.saveResource(bundle, (err) => {
        if(err) {
          return res.status(500).send()
        }
        return res.status(201).send()
      })
    })
  })

  app.get('/emNutt/fhir/clearProgress', (req, res) => {
    res.status(200).send();
    const requestIDs = JSON.parse(req.query.requestIDs);
    if(requestIDs.parentReqId) {
      delete processedMessages[requestIDs.parentReqId]
    }
    for(let requestID of requestIDs.childrenReqIDs) {
      logger.info(`Clearing progress data for clientID ${requestID}`);
      let data = JSON.stringify({})
      redisClient.set(requestID, data, (err, reply) => {
        if (err) {
          logger.error(err);
          logger.error(`An error has occured while clearing progress data for ${type} and requestID ${requestID}`);
        }
      });
    }
  });

  app.post('/emNutt/fhir/CommunicationRequest', (req, res) => {
    let parentResource = req.body;
    parentResource.id = uuid4();
    if (!parentResource) {
      return res.status(400).send();
    }
    let parentReqId
    if(parentResource.meta && parentResource.meta.tag && Array.isArray(parentResource.meta.tag)) {
      for(let index in parentResource.meta.tag) {
        let tag = parentResource.meta.tag[index]
        if(tag.system === 'parentReqId') {
          parentReqId = tag.code
          parentResource.meta.tag.splice(index, 1)
          break
        }
      }
    }
    res.status(200).json({
      status: 'Processing',
      reqID: parentResource.id
    })
    let schedule = parentResource.extension && parentResource.extension.find((ext) => {
      return ext.url === config.get("extensions:CommReqSchedule");
    });
    let cronExpression;
    if(schedule) {
      let cronDet = schedule.extension.find((ext) => {
        return ext.url === 'cronExpression';
      });
      if(cronDet && cronDet.valueString) {
        cronExpression = cronDet.valueString;
      }
    }
    if(cronExpression) {
      let cronExpressionParsed = cronstrue.toString(cronExpression);
      logger.info('Scheduling to send this message with cron expression ' + cronExpressionParsed);
      parentResource.status = 'on-hold';
      let schedTask = cron.schedule(cronExpression, () => {
        logger.info('Processing scheduled communication request with id ' + parentResource.id);
        rapidpro.processSchedCommReq(parentResource.id, (err) => {
          if(err) {
            logger.error('An error occured while processing scheduled communication request with id ' + parentResource.id);
          } else {
            logger.info(`Scheduled communication request with id ${parentResource.id} processed successfully`);
          }
        });
      });
      cronjobs.scheduledCommReqs[parentResource.id] = schedTask;
      for(let index in parentResource.extension) {
        let ext = parentResource.extension[index];
        if(ext.url === config.get("extensions:CommReqSchedule")) {
          let isParsed = ext.extension.find((sched) => {
            return sched.url === "cronExpressionParsed";
          });
          if(!isParsed) {
            parentResource.extension[index].extension.push({
              url: "cronExpressionParsed",
              valueString: cronExpressionParsed
            });
          }
        }
      }

      let commType
      if(parentResource.payload.contentReference && parentResource.payload.contentReference.reference) {
        commType = 'Workflow'
      } else {
        commType = 'Message'
      }
      let statusResData = JSON.stringify({
        id: parentResource.id,
        step: 1,
        totalSteps: 1,
        status: `Saving Scheduled ${commType} To Run ${cronExpressionParsed}`,
        error: null,
        percent: null,
      });
      redisClient.set(parentResource.id, statusResData);

      if(parentResource.recipient.length > 300) {
        let processingError = false
        let recipients = lodash.cloneDeep(parentResource.recipient)
        delete parentResource.recipient
        let bundle = {
          resourceType: 'Bundle',
          type: 'batch',
          entry: [{
            resource: parentResource,
            request: {
              method: 'PUT',
              url: `${parentResource.resourceType}/${parentResource.id}`,
            },
          }],
        };
        macm.saveResource(bundle, (err) => {
          if(err) {
            processingError = true
          }

          let resourceTemplate = {
            resourceType: 'CommunicationRequest',
            recipient: [],
            status: 'unknown'
          }
          // delete resourceTemplate.status

          let promises = []
          for(let index in recipients) {
            let recipient = recipients[index]
            promises.push(new Promise((resolve) => {
              resourceTemplate.recipient.push(recipient)
              if(resourceTemplate.recipient.length >= 300 || index == recipients.length - 1) {
                let tmpResource = lodash.cloneDeep(resourceTemplate)
                tmpResource.id = uuid4();
                tmpResource.basedOn = [{
                  reference: `CommunicationRequest/${parentResource.id}`
                }]
                resourceTemplate.recipient = []
                let bundle = {
                  resourceType: 'Bundle',
                  type: 'batch',
                  entry: [{
                    resource: tmpResource,
                    request: {
                      method: 'PUT',
                      url: `${tmpResource.resourceType}/${tmpResource.id}`,
                    },
                  }],
                };
                macm.saveResource(bundle, (err) => {
                  if(err) {
                    processingError = true
                  }
                  return resolve()
                });
              } else {
                return resolve()
              }
            }))
          }

          Promise.all(promises).then(() => {
            let statusResData = JSON.stringify({
              id: parentResource.id,
              step: 1,
              totalSteps: 1,
              status: 'done',
              error: null,
              percent: null,
            });
            redisClient.set(parentResource.id, statusResData);
            dataSyncUtil.cacheFHIR2ES(() => {});
            logger.info('Done processing scheduled communication request');
          })
        });
      } else {
        let bundle = {
          resourceType: 'Bundle',
          type: 'batch',
          entry: [{
            resource: parentResource,
            request: {
              method: 'PUT',
              url: `${parentResource.resourceType}/${parentResource.id}`,
            },
          }],
        };
        macm.saveResource(bundle, (err) => {
          let statusResData = JSON.stringify({
            id: parentResource.id,
            step: 1,
            totalSteps: 1,
            status: 'done',
            error: null,
            percent: null,
          });
          redisClient.set(parentResource.id, statusResData);
          dataSyncUtil.cacheFHIR2ES(() => {});
          logger.info('Done processing scheduled communication request');
        });
      }
    } else {
      logger.info('Sending message now');
      let commBundle = {
        entry: [{
          resource: parentResource,
        }]
      };
      if(!processedMessages[parentReqId]) {
        processedMessages[parentReqId] = {
          startTime: moment().format(),
          recipients: []
        }
      }
      rapidpro.processCommunications({
        commReqs: commBundle,
        processedRecipients: processedMessages[parentReqId]
      }, (err, status) => {
        logger.info('Done processing communication requests');
        dataSyncUtil.cacheFHIR2ES(() => {});
      });
    }
  });

  app.post('/emNutt/fhir/cancelMessageSchedule', (req, res) => {
    logger.info("Received a request to cancel schedule")
    let schedules = req.body.schedules;
    let errOccured = false
    let reqID = uuid4();
    res.status(200).json({
      status: 'Processing',
      reqID: reqID
    })
    let statusResData = JSON.stringify({
      id: reqID,
      step: 1,
      totalSteps: 1,
      status: `Canceling Schedules`,
      error: null,
      percent: null,
    });
    redisClient.set(reqID, statusResData);
    async.each(schedules, (schedule, nxt) => {
      let schArr = schedule.split('/');
      if(schArr.length === 2) {
        schedule = schArr[1];
      }
      let patchReq = [{
        op: "replace",
        path: "/status",
        value: "completed"
      }]
      let url = URI(config.get('macm:baseURL'))
        .segment("CommunicationRequest")
        .segment(schedule)
        .toString()
      const options = {
        url,
        withCredentials: true,
        auth: {
          username: config.get('macm:username'),
          password: config.get('macm:password'),
        },
        headers: {
          'Content-Type': 'application/json-patch+json',
        },
        json: patchReq
      };
      request.patch(options, (err, res, body) => {
        if(err || !res || res.statusCode < 200 || res.statusCode > 399) {
          errOccured = true
        } else {
          if(cronjobs.scheduledCommReqs[schedule]) {
            cronjobs.scheduledCommReqs[schedule].stop()
          }
        }
        return nxt()
      })
    }, () => {
      dataSyncUtil.cacheFHIR2ES(() => {});
      let error = null
      if(errOccured) {
        error = 'Some errors occured while canceling schedule'
      }
      let statusResData = JSON.stringify({
        id: reqID,
        step: 1,
        totalSteps: 1,
        status: 'done',
        error: error,
        percent: null,
      });
      redisClient.set(reqID, statusResData);
    })
  });

  app.post('/emNutt/fhir', (req, res) => {
    let resource = req.body;
    if (!resource) {
      return res.status(400).send();
    }
    macm.saveResource(resource, (err, response, body) => {
      dataSyncUtil.cacheFHIR2ES(() => {});
      let statusCode;
      if (response.statusCode) {
        statusCode = response.statusCode;
      }
      if (err) {
        if (!statusCode) {
          statusCode = 500;
        }
        return res.status(statusCode).send(body);
      }
      if (!statusCode) {
        statusCode = 201;
      }
      return res.status(statusCode).json(body);
    });
  });

  app.get('/emNutt/fhir/:resource?/:id?', (req, res) => {
    logger.info('Received a request to get data for resource ' + req.params.resource);
    const resource = req.params.resource;
    const id = req.params.id;
    let url = URI(config.get('macm:baseURL'));
    if (resource) {
      url = url.segment(resource);
    }
    if (id) {
      url = url.segment(id);
    }
    for (const param in req.query) {
      url.addQuery(param, req.query[param]);
    }
    url = url.toString();
    const options = {
      url,
      withCredentials: true,
      auth: {
        username: config.get('macm:username'),
        password: config.get('macm:password'),
      },
    };
    request.get(options, (err, response, body) => {
      let statusCode;
      if (response.statusCode) {
        statusCode = response.statusCode;
      } else if (body.entry) {
        statusCode = 200;
      } else {
        statusCode = 500;
      }
      if (isJSON(body)) {
        body = JSON.parse(body);
      }
      if (body.link) {
        let routerBaseURL;
        if (config.get('mediator:register')) {
          routerBaseURL = URI(config.get('mediator:api:routerURL'))
            .segment('emNutt')
            .segment('fhir')
            .toString();
          if (!config.get('mediator:api:routerURL')) {
            logger.error('Cant find openHIM router base URL, this may cause an issue querying data from emNutt');
          }
        } else {
          routerBaseURL = URI(config.get('app:baseURL'))
            .segment('fhir')
            .toString();
        }
        for (const index in body.link) {
          if (!body.link[index].url) {
            continue;
          }
          body.link[index].url = body.link[index].url.replace(
            config.get('macm:baseURL'),
            routerBaseURL
          );
        }
      }
      return res.status(statusCode).send(body);
    });
  });

  app.get('/emNutt/getConfig', (req, res) => {
    logger.info('Received a request to get configuration');
    if (!req.query.parameter) {
      logger.error('Bad Request');
      return res.status(400).send();
    }
    let paramValue = config.get(req.query.parameter);
    if (!paramValue) {
      return res.status(204).send();
    }
    return res.status(200).send(paramValue);
  });
  return app;
}

/**
 * start - starts the mediator
 *
 * @param  {Function} callback a node style callback that is called once the
 * server is started
 */
function reloadConfig(data, callback) {
  const tmpFile = `${__dirname}/../config/tmpConfig.json`;
  fs.writeFile(tmpFile, JSON.stringify(data, 0, 2), (err) => {
    if (err) {
      throw err;
    }
    config.file(tmpFile);
    envVars.set();
    return callback();
  });
}

function start(callback) {
  prerequisites.checkDependencies(() => {
    if (config.get('mediator:register')) {
      logger.info('Running emNutt as a mediator');
      medUtils.registerMediator(
        config.get('mediator:api'),
        mediatorConfig,
        (err) => {
          if (err) {
            logger.error('Failed to register this mediator, check your config');
            logger.error(err.stack);
            process.exit(1);
          }
          config.set('mediator:api:urn', mediatorConfig.urn);
          medUtils.fetchConfig(config.get('mediator:api'), (err, newConfig) => {
            if (err) {
              logger.info('Failed to fetch initial config');
              logger.info(err.stack);
              process.exit(1);
            }
            const configFile = require(`${__dirname}/../config/config_${env}.json`);
            const updatedConfig = Object.assign(configFile, newConfig);
            reloadConfig(updatedConfig, () => {
              config.set('mediator:api:urn', mediatorConfig.urn);
              logger.info('Received initial config:', newConfig);
              logger.info('Successfully registered emNutt mediator!');
              if (!config.get('app:installed')) {
                prerequisites.init((err) => {
                  if (!err) {
                    newConfig.app.installed = true;
                    mixin.updateopenHIMConfig(
                      mediatorConfig.urn,
                      newConfig,
                      () => {}
                    );
                  }
                });
              }
              const app = appRoutes();
              const server = app.listen(config.get('app:port'), () => {
                const configEmitter = medUtils.activateHeartbeat(
                  config.get('mediator:api')
                );
                configEmitter.on('config', (newConfig) => {
                  logger.info('Received updated config:', newConfig);
                  const updatedConfig = Object.assign(configFile, newConfig);
                  reloadConfig(updatedConfig, () => {
                    if (!config.get('app:installed')) {
                      prerequisites.init((err) => {
                        if (!err) {
                          newConfig.app.installed = true;
                          mixin.updateopenHIMConfig(
                            mediatorConfig.urn,
                            newConfig,
                            () => {}
                          );
                        }
                      });
                    }
                    config.set('mediator:api:urn', mediatorConfig.urn);
                  });
                });
                callback(server);
              });
            });
          });
        }
      );
    } else {
      logger.info('Running emNutt as a stand alone');
      const app = appRoutes();
      const server = app.listen(config.get('app:port'), () => {
        if (!config.get('app:installed')) {
          prerequisites.init(() => {
            mixin.updateConfigFile(['app', 'installed'], true, () => {});
          });
        }
        callback(server);
      });
    }
  });
}

exports.start = start;

if (!module.parent) {
  // if this script is run directly, start the server
  prerequisites.checkDependencies(() => {
    start(() =>
      logger.info(
        `emNutt Server is running and listening on port: ${config.get(
          'app:port'
        )}`
      )
    );
  });
}