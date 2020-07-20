'use strict';
/*global process, __dirname */
const express = require('express');
const bodyParser = require('body-parser');
const async = require('async');
const medUtils = require('openhim-mediator-utils');
const cors = require('cors');
const fs = require('fs');
const moment = require('moment');
const request = require('request');
const {
  CacheFhirToES
} = require('fhir2es');
const isJSON = require('is-json');
const URI = require('urijs');
const logger = require('./winston');
const config = require('./config');
const envVars = require('./envVars');
const rapidpro = require('./rapidpro')();
const eidsr = require('./eidsr');
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
  app.use(bodyParser.json());
  app.use('/emNutt/eidsr/', eidsr);

  app.post('/emNutt/fhir/CommunicationRequest', (req, res) => {
    let resource = req.body;
    if (!resource) {
      return res.status(400).send();
    }
    let commBundle = {
      entry: [{
        resource,
      }, ],
    };
    rapidpro.processCommunications(commBundle, (err) => {
      if (err) {
        return res.status(500).send('Done');
      }
      logger.info('Done checking communication requests');
      res.status(200).send();
    });
  });

  app.post('/emNutt/fhir', (req, res) => {
    let resource = req.body;
    if (!resource) {
      return res.status(400).send();
    }
    macm.saveResource(resource, (err, response, body) => {
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
    logger.info(
      'Received a request to get data for resource ' + req.params.resource
    );
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
            logger.error(
              'Cant find openHIM router base URL, this may cause an issue querying data from emNutt'
            );
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

  app.get('/emNutt/syncWorkflows', (req, res) => {
    logger.info('Received a request to synchronize workflows');
    let enabledChannels = config.get("enabledCommChannels");
    let processingError = false;
    async.parallel({
      rapidpro: (callback) => {
        if (!enabledChannels.includes('rapidpro')) {
          logger.warn('Rapidpro is not enabled, not syncing workflows');
          return callback(null);
        }
        rapidpro.syncWorkflows((err) => {
          if (err) {
            processingError = err;
          }
          return callback(null);
        });
      }
    }, () => {
      if (!processingError) {
        let runsLastSync = moment()
          .subtract('30', 'minutes')
          .format('Y-MM-DDTHH:mm:ss');
        mixin.updateConfigFile(['lastSync', 'syncWorkflows', 'time'], runsLastSync, () => {});
      }
      if (processingError) {
        return res.status(500).send('Internal error occured');
      }
      res.status(200).send('Done');
    });
  });

  app.get('/emNutt/syncWorkflowRunMessages', (req, res) => {
    logger.info('Received a request to sync workflow messages');
    let enabledChannels = config.get("enabledCommChannels");
    let processingError = false;
    async.parallel({
      rapidpro: (callback) => {
        if (!enabledChannels.includes('rapidpro')) {
          logger.warn('Rapidpro is not enabled, not syncing workflows');
          return callback(null);
        }
        rapidpro.syncWorkflowRunMessages((err) => {
          if (err) {
            processingError = err;
          }
          return callback(null);
        });
      }
    }, () => {
      if (!processingError) {
        let runsLastSync = moment()
          .subtract('10', 'minutes')
          .format('Y-MM-DDTHH:mm:ss');
        mixin.updateConfigFile(['lastSync', 'syncWorkflowRunMessages', 'time'], runsLastSync, () => {});
      }
      if (processingError) {
        return res.status(500).send('Internal error occured');
      }
      res.status(200).send('Done');
    });
  });

  app.get('/emNutt/checkCommunicationRequest', (req, res) => {
    let processingError = false;
    let query = `status:not=completed`;
    macm.getResource({
      resource: 'CommunicationRequest',
      query,
    }, (err, commReqs) => {
      if (err) {
        processingError = true;
      }
      rapidpro.processCommunications(commReqs, (err) => {
        if (err) {
          processingError = true;
        }
        logger.info('Done checking communication requests');
        if (processingError) {
          return res.status(500).send('Done');
        }
        res.status(200).send();
      });
    });
  });

  app.post('/emNutt/syncContacts', (req, res) => {
    let processingError = false;
    logger.info('Received a bundle of contacts to be synchronized');
    if (!config.get('rapidpro:syncAllContacts')) {
      logger.warn('All Contacts sync is disabled, the server will sync only communicated contacts');
      res.status(403).send('All Contacts sync is disabled, the server will sync only communicated contacts');
    }
    const bundle = req.body;
    if (!bundle) {
      logger.error('Received empty request');
      res.status(400).send('Empty request body');
      return;
    }
    if (bundle.resourceType !== 'Bundle') {
      logger.error('Request is not a bundle');
      res.status(400).send('Request is not a bundle');
      return;
    }
    async.series({
      rapidpro: (callback) => {
        rapidpro.syncContacts(bundle, (err) => {
          if (err) {
            processingError = err;
          }
          return callback(null);
        });
      }
    }, () => {
      bundle.type = 'batch';
      macm.saveResource(bundle, () => {
        logger.info('Contacts Sync Done');
        if (processingError) {
          return res.status(500).send('Some errors occured');
        }
        res.status(200).send('Suceessfully');
      });
    });
  });

  app.get('/emNutt/syncContacts', (req, res) => {
    logger.info('Received a request to sync DB contacts');
    let bundleModified = false;
    let runsLastSync = config.get('lastSync:syncContacts:time');
    const isValid = moment(runsLastSync, 'Y-MM-DD').isValid();
    if (!isValid) {
      runsLastSync = moment('1970-01-01').format('Y-MM-DD');
    }
    if (!config.get('rapidpro:syncAllContacts')) {
      logger.warn(
        'All Contacts sync is disabled, the server will sync only communicated contacts'
      );
      return res
        .status(403)
        .send(
          'All Contacts sync is disabled, the server will sync only communicated contacts'
        );
    }
    let processingError = false;
    let bundle = {
      type: 'batch',
      resourceType: 'Bundle',
      entry: []
    };
    async.series({
      practitioners: (callback) => {
        let query = `_lastUpdated=ge${runsLastSync}`;
        macm.getResource({
          resource: 'Practitioner',
          query,
        }, (err, practs) => {
          if (err) {
            processingError = true;
          }
          bundle.entry = bundle.entry.concat(practs.entry);
          return callback(null);
        });
      },
      person: (callback) => {
        let query = `_lastUpdated=ge${runsLastSync}`;
        macm.getResource({
          resource: 'Person',
          query,
        }, (err, pers) => {
          if (err) {
            processingError = true;
          }
          bundle.entry = bundle.entry.concat(pers.entry);
          return callback(null);
        });
      },
      patients: (callback) => {
        let query = `_lastUpdated=ge${runsLastSync}`;
        macm.getResource({
          resource: 'Patient',
          query,
        }, (err, pers) => {
          if (err) {
            processingError = true;
          }
          bundle.entry = bundle.entry.concat(pers.entry);
          return callback(null);
        });
      },
    }, () => {
      async.series({
        rapidpro: (callback) => {
          rapidpro.syncContacts(bundle, (err, modified) => {
            if (modified) {
              bundleModified = true;
            }
            if (err) {
              processingError = err;
            }
            return callback(null);
          });
        }
      }, () => {
        if (!bundleModified) {
          if (processingError) {
            return res.status(500).send('Some errors occured');
          }
          return res.status(200).send('Suceessfully');
        }
        macm.saveResource(bundle, () => {
          logger.info('Contacts Sync Done');
          if (processingError) {
            return res.status(500).send('Some errors occured');
          }
          res.status(200).send('Suceessfully');
        });
      });
    });
  });

  app.get('/emNutt/syncContactsGroups', (req, res) => {
    logger.info('Received a request to sync workflow messages');
    let enabledChannels = config.get("enabledCommChannels");
    let processingError = false;
    async.parallel({
      rapidpro: (callback) => {
        if (!enabledChannels.includes('rapidpro')) {
          logger.warn('Rapidpro is not enabled, not syncing contacts groups for rapidpro');
          return callback(null);
        }
        let source = config.get('app:contactGroupsSource');
        if (source === 'pos') {
          rapidpro.POSContactGroupsSync((err) => {
            if (err) {
              processingError = err;
            }
            return callback(null);
          });
        } else {
          rapidpro.RPContactGroupsSync((err) => {
            if (err) {
              processingError = err;
            }
            return callback(null);
          });
        }
      }
    }, () => {
      if (!processingError) {
        let runsLastSync = moment()
          .subtract('30', 'minutes')
          .format('Y-MM-DDTHH:mm:ss');
        //mixin.updateConfigFile(['lastSync', 'syncContactsGroups', 'time'], runsLastSync, () => {});
      }
      if (processingError) {
        return res.status(500).send('Internal error occured');
      }
      res.status(200).send('Done');
    });
  });

  app.get('/emNutt/cacheFHIR2ES', (req, res) => {
    let caching = new CacheFhirToES({
      ESBaseURL: config.get('elastic:baseURL'),
      ESUsername: config.get('elastic:username'),
      ESPassword: config.get('elastic:password'),
      ESMaxCompilationRate: config.get('elastic:max_compilations_rate'),
      FHIRBaseURL: config.get('macm:baseURL'),
      FHIRUsername: config.get('macm:username'),
      FHIRPassword: config.get('macm:password'),
    });
    caching.cache();
    res.status(200).send();
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