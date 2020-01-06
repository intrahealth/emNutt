'use strict';
const express = require('express');
const bodyParser = require('body-parser');
const async = require('async');
const medUtils = require('openhim-mediator-utils');
const fs = require('fs');
const moment = require('moment');
const logger = require('./winston');
const config = require('./config');
const rapidpro = require('./rapidpro')();
const macm = require('./macm')();
const prerequisites = require('./prerequisites');
const mixin = require('./mixin');
const mediatorConfig = require(`${__dirname}/../config/mediator`);

const env = process.env.NODE_ENV || 'development';
if (config.get('mediator:register')) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = 0;
}

/**
 * @returns {express.app}
 */
function appRoutes () {
  const app = express();
  app.use(bodyParser.json());

  app.get('/syncWorkflows', (req, res) => {
    logger.info('Received a request to synchronize workflows');
    rapidpro.getEndPointData({
      endPoint: 'flows.json',
    },
    flows => {
      macm.rpFlowsToFHIR(flows, (err, body) => {
        logger.error(body);
        logger.info('Done Synchronizing flows');
        if (err) {
          res.status(500).send(err);
        } else {
          res.status(200).send('Done');
        }
      });
    }
    );
  });

  app.get('/syncWorkflowRunMessages', (req, res) => {
    logger.info('Received a request to sync workflow messages');
    const query = '_profile=http://mhero.org/fhir/StructureDefinition/mHeroWorkflows';
    let runsLastSync = moment('1970-01-01').format('Y-MM-DDTH:mm:ss');
    macm.getResource({
      resource: 'Basic',
      query,
    }, flows => {
      async.eachSeries(flows.entry, (flow, nxtFlow) => {
        const promise1 = new Promise(resolve => {
          runsLastSync = config.get('lastSync:syncWorkflowRunMessages:time');
          const isValid = moment(runsLastSync, 'Y-MM-DDTH:mm:ss').isValid();
          if (!isValid) {
            runsLastSync = moment('1970-01-01').format('Y-MM-DDTH:mm:ss');
          }
          const queries = [{
            name: 'flow',
            value: flow.resource.id,
          }, {
            name: 'after',
            value: runsLastSync,
          }];
          rapidpro.getEndPointData({
            endPoint: 'runs.json',
            queries,
          }, runs => {
            runsLastSync = moment().subtract('10', 'minutes').format('Y-MM-DDTH:mm:ss');
            resolve(runs);
          });
        });
        const promise2 = new Promise(resolve => {
          const queries = [{
            name: 'flow',
            value: flow.resource.id,
          }];
          rapidpro.getEndPointData({
            endPoint: 'definitions.json',
            queries,
            hasResultsKey: false,
          }, definitions => {
            resolve(definitions);
          });
        });
        Promise.all([promise1, promise2]).then(responses => {
          const runs = responses[0];
          const definitions = responses[1];
          async.each(runs, (run, nxtRun) => {
            const queries = [{
              name: 'uuid',
              value: run.contact.uuid,
            }];
            rapidpro.getEndPointData({
              endPoint: 'contacts.json',
              queries,
            }, contact => {
              if (!Array.isArray(contact) || contact.length !== 1 || !contact[0].fields.globalid) {
                return;
              }
              run.contact.globalid = contact[0].fields.globalid;
              macm.createCommunicationsFromRPRuns(run, definitions[0], () => {
                return nxtRun();
              });
            });
          }, () => {
            return nxtFlow();
          });
        });
      }, () => {
        mixin.updateConfigFile(['lastSync', 'syncWorkflowRunMessages', 'time'], runsLastSync, () => {});
        logger.info('Done synchronizing flow messages');
        res.status(200).send('Done');
      });
    });
  });

  app.get('/checkCommunicationRequest', (req, res) => {
    const promise = new Promise((resolve, reject) => {
      if (!config.get('rapidpro:syncAllContacts')) {
        rapidpro.getEndPointData({
          endPoint: 'contacts.json',
        }, rpContacts => {
          resolve(rpContacts);
        });
      } else {
        return resolve([]);
      }
    });
    promise.then(rpContacts => {
      macm.getResource({
        resource: 'CommunicationRequest',
      }, commReqs => {
        rapidpro.processCommunications(commReqs, rpContacts, () => {
          logger.info('Done checking communication requests');
          res.status(200).send('Done');
        });
      });
    }).catch(err => {
      throw err;
    });
  });

  app.post('/syncContacts', (req, res) => {
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
    }
    rapidpro.getEndPointData({
      endPoint: 'contacts.json',
    },
    rpContacts => {
      let bundleModified = false;
      async.eachOf(
        bundle.entry,
        (entry, index, nxtEntry) => {
          rapidpro.addContact({
            contact: entry.resource,
            rpContacts,
          },
          (err, response, body) => {
            if (!err) {
              const rpUUID = body.uuid;
              if (rpUUID) {
                bundleModified = true;
                if (!bundle.entry[index].resource.identifier) {
                  bundle.entry[index].resource.identifier = [];
                }
                bundle.entry[index].resource.identifier.push({
                  system: 'http://app.rapidpro.io/contact-uuid',
                  value: rpUUID,
                });
                bundle.entry[index].request = {
                  method: 'PUT',
                  url: `${bundle.entry[index].resource.resourceType}/${bundle.entry[index].resource.id}`,
                };
              }
            }
            return nxtEntry();
          }
          );
        },
        () => {
          if (bundleModified) {
            bundle.type = 'batch';
            macm.saveResource(bundle, () => {
              logger.info('Contacts Sync Done');
              res.status(200).send('Suceessfully');
            });
          } else {
            logger.info('Contacts Sync Done');
            res.status(200).send('Suceessfully');
          }
        }
      );
    }
    );
  });

  app.get('/syncContacts', (req, res) => {
    logger.info('Received a request to sync DB contacts');
    if (!config.get('rapidpro:syncAllContacts')) {
      logger.warn(
        'All Contacts sync is disabled, the server will sync only communicated contacts'
      );
      res
        .status(403)
        .send(
          'All Contacts sync is disabled, the server will sync only communicated contacts'
        );
    }
    let contacts = [];
    async.series({
      practitioners: callback => {
        macm.getResource('Practitioner', practs => {
          contacts = contacts.concat(practs.entry);
        });
      },
      person: callback => {
        macm.getResource('Person', pers => {
          contacts = contacts.concat(pers.entry);
        });
      },
    },
    () => {
      rapidpro.getEndPointData({
        endPoint: 'contacts.json',
      },
      rpContacts => {
        let contModified = false;
        async.eachOf(
          contacts,
          (contact, index, nxtEntry) => {
            rapidpro.addContact({
              contact: contact.resource,
              rpContacts,
            },
            (err, response, body) => {
              if (!err) {
                const rpUUID = body.uuid;
                if (rpUUID) {
                  contModified = true;
                  if (!contacts[index].resource.identifier) {
                    contacts[index].resource.identifier = [];
                  }
                  contacts[index].resource.identifier.push({
                    system: 'http://app.rapidpro.io/contact-uuid',
                    value: rpUUID,
                  });
                  contacts[index].request = {
                    method: 'PUT',
                    url: `${contacts[index].resource.resourceType}/${contacts[index].resource.id}`,
                  };
                }
              }
              return nxtEntry();
            }
            );
          },
          () => {
            if (contModified) {
              const bundle = {};
              bundle.type = 'batch';
              bundle.resourceType = 'Bundle';
              bundle.entry = [];
              bundle.entry = bundle.entry.concat(contacts);
              macm.saveResource(bundle, () => {
                logger.info('Contacts Sync Done');
                res.status(200).send('Suceessfully');
              });
            } else {
              logger.info('Contacts Sync Done');
              res.status(200).send('Successfully');
            }
          }
        );
      }
      );
    }
    );
  });
  return app;
}

/**
 * start - starts the mediator
 *
 * @param  {Function} callback a node style callback that is called once the
 * server is started
 */
function reloadConfig (data, callback) {
  const tmpFile = `${__dirname}/../config/tmpConfig.json`;
  fs.writeFile(tmpFile, JSON.stringify(data, 0, 2), err => {
    if (err) {
      throw err;
    }
    config.file(tmpFile);
    return callback();
  });
}

function start (callback) {
  if (config.get('mediator:register')) {
    logger.info('Running emNutt as a mediator');
    medUtils.registerMediator(
      config.get('mediator:api'),
      mediatorConfig,
      err => {
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
              prerequisites.loadResources();
            }
            const app = appRoutes();
            const server = app.listen(config.get('app:port'), () => {
              const configEmitter = medUtils.activateHeartbeat(
                config.get('mediator:api')
              );
              configEmitter.on('config', newConfig => {
                logger.info('Received updated config:', newConfig);
                const updatedConfig = Object.assign(configFile, newConfig);
                reloadConfig(updatedConfig, () => {
                  if (!config.get('app:installed')) {
                    prerequisites.loadResources();
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
        prerequisites.loadResources(() => {
          mixin.updateConfigFile(['app', 'installed'], true, () => {});
        });
      }
      callback(server);
    });
  }
}

exports.start = start;

if (!module.parent) {
  // if this script is run directly, start the server
  start(() =>
    logger.info(
      `emNutt Server is running and listening on port: ${config.get(
        'app:port'
      )}`
    )
  );
}
