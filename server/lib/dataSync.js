const async = require('async');
const moment = require('moment');
const {
  CacheFhirToES
} = require('fhir2es');
const config = require('./config');
const logger = require('./winston');
const mixin = require('./mixin');
const floip = require('./floip');
const rapidpro = require('./rapidpro')();
const macm = require('./macm')();

function syncWorkflows (callback) {
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
    cacheFHIR2ES(() => {});
    return callback(processingError);
  });
}

function syncContacts(callback) {
  let bundleModified = false;
  let runsLastSync = config.get('lastSync:syncContacts:time');
  const isValid = moment(runsLastSync, 'Y-MM-DD').isValid();
  if (!isValid) {
    runsLastSync = moment('1970-01-01').format('Y-MM-DD');
  }
  let processingError = false;
  let bundle = {
    type: 'batch',
    resourceType: 'Bundle',
    entry: []
  };
  let modifiedBundle = {
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
        rapidpro.syncContacts(bundle, modifiedBundle, (err, modified) => {
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
        return callback(processingError);
      }
      let tmpBundle = {
        type: 'batch',
        resourceType: 'Bundle',
        entry: []
      };
      const promises = [];
      for(let counter in modifiedBundle.entry) {
        promises.push(new Promise((resolve) => {
          let entry = bundle.entry[counter];
          tmpBundle.entry.push(entry);
          if(tmpBundle.entry.length > 2) {
            const saveBundle = {
              ...tmpBundle,
            };
            tmpBundle = {
              resourceType: 'Bundle',
              type: 'batch',
              entry: [],
            };
            macm.saveResource(saveBundle, (err) => {
              if (err) {
                processingError = err;
              }
              return resolve();
            });
          } else {
            return resolve();
          }
        }));
      }
      Promise.all(promises).then(() => {
        if(tmpBundle.entry.length > 0) {
          macm.saveResource(tmpBundle, (err) => {
            if (err) {
              processingError = err;
            }
            cacheFHIR2ES(() => {});
            logger.info('Contacts Sync Done');
            return callback(processingError);
          });
        } else {
          cacheFHIR2ES(() => {});
          logger.info('Contacts Sync Done');
          return callback(processingError);
        }
      });
    });
  });
}

function syncContactsGroups(callback) {
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
      mixin.updateConfigFile(['lastSync', 'syncContactsGroups', 'time'], runsLastSync, () => {});
    }
    cacheFHIR2ES(() => {});
    return callback(processingError);
  });
}

function syncWorkflowRunMessages(callback) {
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
    cacheFHIR2ES(() => {});
    return callback(processingError);
  });
}

function syncFloipFlowResults(callback) {
  floip.flowResultsToQuestionnaire((err) => {
    logger.info("Done Synchronizing flow results from FLOIP server");
    if(!err) {
      let runsLastSync = moment()
        .subtract('10', 'minutes')
        .format('Y-MM-DD HH:mm:ss');
      mixin.updateConfigFile(['lastSync', 'syncFloipFlowResults', 'time'], runsLastSync, () => {});
    }
    cacheFHIR2ES(() => {});
    return callback(err);
  });
}

function checkCommunicationRequest(callback) {
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
      cacheFHIR2ES(() => {});
      return callback(processingError);
    });
  });
}

function cacheFHIR2ES(callback) {
  let caching = new CacheFhirToES({
    ESBaseURL: config.get('elastic:baseURL'),
    ESUsername: config.get('elastic:username'),
    ESPassword: config.get('elastic:password'),
    ESMaxCompilationRate: config.get('elastic:max_compilations_rate'),
    FHIRBaseURL: config.get('macm:baseURL'),
    FHIRUsername: config.get('macm:username'),
    FHIRPassword: config.get('macm:password'),
  });
  caching.cache().then(() => {
    return callback();
  });
}

module.exports = {
  syncWorkflows,
  syncWorkflowRunMessages,
  syncFloipFlowResults,
  checkCommunicationRequest,
  syncContacts,
  syncContactsGroups,
  cacheFHIR2ES
};