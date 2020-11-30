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
  let newRunsLastSync = moment().format('Y-MM-DDTHH:mm:ss');
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
      mixin.updateConfigFile(['lastSync', 'syncWorkflows', 'time'], newRunsLastSync, () => {});
    }
    cacheFHIR2ES(() => {});
    return callback(processingError);
  });
}

function syncContacts(callback) {
  let newRunsLastSync = moment().format('Y-MM-DDTHH:mm:ss');
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
        rapidpro.syncContacts(bundle, (err) => {
          if (err) {
            processingError = err;
          }
          return callback(null);
        });
      }
    }, () => {
      if(!processingError) {
        mixin.updateConfigFile(['lastSync', 'syncContacts', 'time'], newRunsLastSync, () => {});
        cacheFHIR2ES(() => {});
        logger.info('Contacts Sync Done');
        return callback()
      } else {
        return callback(processingError)
      }
    });
  });
}

function syncContactsGroups(callback) {
  let enabledChannels = config.get("enabledCommChannels");
  let processingError = false;
  let newRunsLastSync = moment().format('Y-MM-DDTHH:mm:ss');
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
      mixin.updateConfigFile(['lastSync', 'syncContactsGroups', 'time'], newRunsLastSync, () => {});
    }
    cacheFHIR2ES(() => {});
    return callback(processingError);
  });
}

function syncWorkflowRunMessages(callback) {
  let enabledChannels = config.get("enabledCommChannels");
  let processingError = false;
  let newRunsLastSync = moment().format('Y-MM-DDTHH:mm:ss');
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
      mixin.updateConfigFile(['lastSync', 'syncWorkflowRunMessages', 'time'], newRunsLastSync, () => {});
    }
    cacheFHIR2ES(() => {});
    return callback(processingError);
  });
}

function syncFloipFlowResults(callback) {
  let newRunsLastSync = moment().format('Y-MM-DD HH:mm:ss');
  floip.flowResultsToQuestionnaire((err) => {
    logger.info("Done Synchronizing flow results from FLOIP server");
    if(!err) {
      mixin.updateConfigFile(['lastSync', 'syncFloipFlowResults', 'time'], newRunsLastSync, () => {});
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
    ESMaxScrollContext: config.get('elastic:max_scroll_context'),
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