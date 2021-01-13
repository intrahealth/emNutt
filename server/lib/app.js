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
    const clientIDs = JSON.parse(req.query.clientIDs);
    let progress = []
    async.each(clientIDs, (clientId, nxt) => {
      redisClient.get(clientId, (error, results) => {
        if (error) {
          logger.error(error);
          logger.error(`An error has occured while getting progress for clientID ${clientId}`);
        }
        results = JSON.parse(results);
        progress.push(results)
        return nxt()
      });
    }, () => {
      res.status(200).json(progress);
    })
  });

  app.get('/emNutt/fhir/clearProgress', (req, res) => {
    const clientIDs = JSON.parse(req.query.clientIDs);
    let errorOccured = false
    async.each(clientIDs, (clientId, nxt) => {
      logger.info(`Clearing progress data for clientID ${clientId}`);
      const data = JSON.stringify({
        status: null,
        error: null,
        percent: null,
        responseData: null,
      });
      redisClient.set(clientId, data, (err, reply) => {
        if (err) {
          errorOccured = true
          logger.error(err);
          logger.error(`An error has occured while clearing progress data for clientID ${clientId}`);
        }
        return nxt()
      });
    }, () => {
      if(errorOccured) {
        return res.status(500).send();
      }
      res.status(200).send();
    })
  });

  app.post('/emNutt/fhir/CommunicationRequest', (req, res) => {
    let resource = req.body;
    resource.id = uuid4();
    if (!resource) {
      return res.status(400).send();
    }
    res.status(200).json({
      status: 'Processing',
      reqID: resource.id
    })
    let schedule = resource.extension && resource.extension.find((ext) => {
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
      resource.status = 'on-hold';
      let schedTask = cron.schedule(cronExpression, () => {
        logger.info('Processing scheduled communication request with id ' + resource.id);
        rapidpro.processSchedCommReq(resource.id, (err) => {
          if(err) {
            logger.error('An error occured while processing scheduled communication request with id ' + resource.id);
          } else {
            logger.info(`Scheduled communication request with id ${resource.id} processed successfully`);
          }
        });
      });
      cronjobs.scheduledCommReqs[resource.id] = schedTask;
      for(let index in resource.extension) {
        let ext = resource.extension[index];
        if(ext.url === config.get("extensions:CommReqSchedule")) {
          let isParsed = ext.extension.find((sched) => {
            return sched.url === "cronExpressionParsed";
          });
          if(!isParsed) {
            resource.extension[index].extension.push({
              url: "cronExpressionParsed",
              valueString: cronExpressionParsed
            });
          }
        }
      }
      let bundle = {
        resourceType: 'Bundle',
        type: 'batch',
        entry: [{
          resource,
          request: {
            method: 'PUT',
            url: `${resource.resourceType}/${resource.id}`,
          },
        }],
      };
      let commType
      if(resource.payload.contentReference && resource.payload.contentReference.reference) {
        commType = 'Workflow'
      } else {
        commType = 'Message'
      }
      let statusResData = JSON.stringify({
        id: resource.id,
        step: 1,
        totalSteps: 1,
        status: `Saving Scheduled ${commType} To Run ${cronExpressionParsed}`,
        error: null,
        percent: null,
      });
      redisClient.set(resource.id, statusResData);
      macm.saveResource(bundle, (err) => {
        let statusResData = JSON.stringify({
          id: resource.id,
          step: 1,
          totalSteps: 1,
          status: 'done',
          error: null,
          percent: null,
        });
        redisClient.set(resource.id, statusResData);
        dataSyncUtil.cacheFHIR2ES(() => {});
        if (err) {
          return res.status(500).send();
        }
        logger.info('Done processing scheduled communication request');
        res.status(200).send();
      });
    } else {
      logger.info('Sending message now');
      let commBundle = {
        entry: [{
          resource,
        }]
      };
      rapidpro.processCommunications(commBundle, (err, status) => {
        logger.info('Done processing communication requests');
        dataSyncUtil.cacheFHIR2ES(() => {});
      });
    }
  });

  app.post('/emNutt/fhir/cancelMessageSchedule', (req, res) => {
    let schedules = req.body.schedules;
    let query;
    for(let schedule of schedules) {
      let schArr = schedule.split('/');
      if(schArr.length === 2) {
        schedule = schArr[1];
      }
      if(!query) {
        query = `_id=${schedule}`;
      } else {
        query += `,${schedule}`;
      }
    }
    macm.getResource({
      resource: 'CommunicationRequest',
      query
    }, (err, schedulesRes) => {
      if(err) {
        return res.status(500).send();
      }
      for(let entryIndex in schedulesRes.entry) {
        schedulesRes.entry[entryIndex].resource.status = 'completed';
        delete schedulesRes.entry[entryIndex].search;
        delete schedulesRes.entry[entryIndex].fullUrl;
        schedulesRes.entry[entryIndex].request = {
          method: 'PUT',
          url: `${schedulesRes.entry[entryIndex].resource.resourceType}/${schedulesRes.entry[entryIndex].resource.id}`
        };
        cronjobs.scheduledCommReqs[schedulesRes.entry[entryIndex].resource.id].stop()
      }
      schedulesRes.resourceType = 'Bundle';
      schedulesRes.type = 'batch';
      macm.saveResource(schedulesRes, (err) => {
        dataSyncUtil.cacheFHIR2ES(() => {});
        if(err) {
          return res.status(500).send();
        }
        return res.status(200).send();
      });
    });
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