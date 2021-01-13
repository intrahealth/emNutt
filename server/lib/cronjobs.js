const cron = require('node-cron');
const macm = require('./macm')();
const rapidpro = require('./rapidpro')();
const dataSync = require('./dataSync');
const config = require('./config');
const logger = require('./winston');

const scheduledCommReqs = []
function scheduleCommunicationRequests() {
  logger.info('Checking Scheduled Communication Requests');
  macm.getResource({
    resource: 'CommunicationRequest',
    query: '_total=accurate&status=on-hold',
    noCaching: true,
  }, (err, commReqs) => {
    logger.info(`Scheduling ${commReqs.entry.length} Communication Requests`);
    if(err) {
      logger.error('An error occured while getting scheduled communication requests');
      return;
    }
    for(let commReq of commReqs.entry) {
      let schedule = commReq.resource.extension && commReq.resource.extension.find((ext) => {
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
      if(!cronExpression) {
        continue;
      }
      let task = cron.schedule(cronExpression, () => {
        logger.info(`Processing scheduled communication request with id ${commReq.resource.id}`);
        rapidpro.processSchedCommReq(commReq.resource.id, (err) => {
          if(err) {
            logger.error(`An error occured while processing scheduled communication request with id ${commReq.resource.id}`);
          } else {
            logger.info(`Scheduled communication request with id ${commReq.resource.id} processed successfully`);
          }
        });
      });
      scheduledCommReqs[commReq.resource.id] = task
    }
  });
}

function scheduleDataSync() {
  if (config.get('mediator:register')) {
    return false;
  }
  let cronWorkflowsSync = config.get("lastSync:syncWorkflows:cronTime");
  let cronContactsSync = config.get("lastSync:syncContacts:cronTime");
  let cronContactGroupsSync = config.get("lastSync:syncContactsGroups:cronTime");
  let cronRunMsgsSync = config.get("lastSync:syncWorkflowRunMessages:cronTime");
  let cronFloipFlowResSync = config.get("lastSync:syncFloipFlowResults:cronTime");
  let cronFHIR2ESSync = config.get("lastSync:fhir2esSync:cronTime");

  cron.schedule(cronWorkflowsSync, () => {
    logger.info('Running cron job for workflows synchronization');
    dataSync.syncWorkflows(() => {
      logger.info('Done running cron job for workflows synchronization');
    });
  });

  cron.schedule(cronContactsSync, () => {
    logger.info('Running cron job for contacts synchronization');
    dataSync.syncContacts(() => {
      logger.info('Done running cron job for contacts synchronization');
    });
  });

  cron.schedule(cronContactGroupsSync, () => {
    logger.info('Running cron job for contact groups synchronization');
    dataSync.syncContactsGroups(() => {
      logger.info('Done running cron job for contact groups synchronization');
    });
  });

  cron.schedule(cronRunMsgsSync, () => {
    logger.info('Running cron job for workflows run messages synchronization');
    dataSync.syncWorkflowRunMessages(() => {
      logger.info('Done running cron job for workflows run messages synchronization');
    });
  });

  cron.schedule(cronFloipFlowResSync, () => {
    logger.info('Running cron job for FLOIP flow results synchronization');
    dataSync.syncFloipFlowResults(() => {
      logger.info('Done running cron job for FLOIP flow results synchronization');
    });
  });

  cron.schedule(cronFHIR2ESSync, () => {
    logger.info('Running cron job for FHIR2ES synchronization');
    dataSync.cacheFHIR2ES(() => {
      logger.info('Done running cron job for FHIR2ES synchronization');
    });
  });
}

scheduleCommunicationRequests();
scheduleDataSync();

module.exports = {
  scheduledCommReqs
}