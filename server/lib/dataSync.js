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
const postFHIR2ES = require('./es/postFHIR2ES')

const syncStatus = {
  syncWorkflows: 'not_running',
  syncContacts: 'not_running',
  syncContactsGroups: 'not_running',
  syncWorkflowRunMessages: 'not_running',
  syncFloipFlowResults: 'not_running',
  cacheFHIR2ES: 'not_running'
}
async function syncWorkflows (callback) {
  if(syncStatus.syncWorkflows === 'running') {
    return callback()
  }
  syncStatus.syncWorkflows = 'running'
  let rpChEnabled = mixin.getEnabledChannel('flow', 'rapidpro')
  let processingError = false;
  let newRunsLastSync = moment().format('Y-MM-DDTHH:mm:ss');
  async.parallel({
    rapidpro: (callback) => {
      if (!rpChEnabled) {
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
    syncStatus.syncWorkflows = 'not_running'
    if (!processingError) {
      mixin.updateLastIndexingTime(newRunsLastSync, 'syncWorkflows')
    }
    return callback(processingError);
  });
}

async function syncContacts(callback) {
  if(syncStatus.syncContacts === 'running') {
    return callback()
  }
  syncStatus.syncContacts = 'running'
  let newRunsLastSync = moment().format('Y-MM-DDTHH:mm:ss');

  let runsLastSync
  await mixin.getLastIndexingTime('syncContacts', false).then((time) => {
    runsLastSync = time
  }).catch((time) => {
    runsLastSync = moment('1970-01-01').format('Y-MM-DDTHH:mm:ss');
  })

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
      syncStatus.syncContacts = 'not_running'
      if(!processingError) {
        mixin.updateLastIndexingTime(newRunsLastSync, 'syncContacts')
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
  if(syncStatus.syncContactsGroups === 'running') {
    return callback()
  }
  syncStatus.syncContactsGroups = 'running'
  let rpChEnabled = mixin.getEnabledChannel('flow', 'rapidpro')
  let processingError = false;
  let newRunsLastSync = moment().format('Y-MM-DDTHH:mm:ss');
  async.parallel({
    rapidpro: (callback) => {
      if (!rpChEnabled) {
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
    syncStatus.syncContactsGroups = 'not_running'
    if (!processingError) {
      mixin.updateLastIndexingTime(newRunsLastSync, 'syncContactsGroups')
    }
    return callback(processingError);
  });
}

function syncWorkflowRunMessages(callback) {
  if(syncStatus.syncWorkflowRunMessages === 'running') {
    return callback()
  }
  syncStatus.syncWorkflowRunMessages = 'running'
  let rpChEnabled = mixin.getEnabledChannel('flow', 'rapidpro')
  let processingError = false;
  let newRunsLastSync = moment().format('Y-MM-DDTHH:mm:ss');
  async.parallel({
    rapidpro: (callback) => {
      if (!rpChEnabled) {
        logger.warn('Rapidpro is not enabled, not syncing flow run messages');
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
    syncStatus.syncWorkflowRunMessages = 'not_running'
    if (!processingError) {
      mixin.updateLastIndexingTime(newRunsLastSync, 'syncWorkflowRunMessages')
    }
    return callback(processingError);
  });
}

function syncRPInboxMessages(callback) {
  if(syncStatus.syncWorkflowRunMessages === 'running') {
    return callback()
  }
  syncStatus.syncRPInboxMessages = 'running'
  let rpChEnabled = mixin.getEnabledChannel('flow', 'rapidpro')
  let processingError = false;
  let newRunsLastSync = moment().format('Y-MM-DDTHH:mm:ss');
  if (!rpChEnabled) {
    logger.warn('Rapidpro is not enabled, not syncing inbox messages');
    return callback(null);
  }
  rapidpro.syncInboxMessages().then(() => {
    syncStatus.syncRPInboxMessages = 'not_running'
    mixin.updateLastIndexingTime(newRunsLastSync, 'syncRPInboxMessages')
    return callback();
  }).catch(() => {
    return callback(processingError);
  })
}

function syncFloipFlowResults(callback) {
  if(syncStatus.syncFloipFlowResults === 'running') {
    return callback()
  }
  syncStatus.syncFloipFlowResults = 'running'
  let newRunsLastSync = moment().format('Y-MM-DD HH:mm:ss');
  floip.flowResultsToQuestionnaire((err) => {
    syncStatus.syncFloipFlowResults = 'not_running'
    logger.info("Done Synchronizing flow results from FLOIP server");
    if(!err) {
      mixin.updateLastIndexingTime(newRunsLastSync, 'syncFloipFlowResults')
    }
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
    let processedRecipients = {
      recipients: []
    }
    rapidpro.processCommunications({
      commReqs: commReqs,
      processedRecipients: processedRecipients
    }, (err) => {
      if (err) {
        processingError = true;
      }
      logger.info('Done checking communication requests');
      return callback(processingError);
    });
  });
}

function cacheFHIR2ES(callback) {
  if(syncStatus.cacheFHIR2ES === 'running') {
    return callback()
  }
  syncStatus.cacheFHIR2ES = 'running'
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
    syncStatus.cacheFHIR2ES = 'not_running'
    postFHIR2ES.populateAll(false, () => {
      return callback()
    })
  });
}

module.exports = {
  syncWorkflows,
  syncWorkflowRunMessages,
  syncRPInboxMessages,
  syncFloipFlowResults,
  checkCommunicationRequest,
  syncContacts,
  syncContactsGroups,
  cacheFHIR2ES
};