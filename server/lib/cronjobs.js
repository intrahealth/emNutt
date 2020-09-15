const cron = require('node-cron');
const macm = require('./macm')();
const rapidpro = require('./rapidpro')();
const config = require('./config');
const logger = require('./winston');

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
      cron.schedule(cronExpression, () => {
        logger.info(`Processing scheduled communication request with id ${commReq.resource.id}`);
        rapidpro.processSchedCommReq(commReq.resource.id, (err) => {
          if(err) {
            logger.error(`An error occured while processing scheduled communication request with id ${commReq.resource.id}`);
          } else {
            logger.info(`Scheduled communication request with id ${commReq.resource.id} processed successfully`);
          }
        });
      });
    }
  });
}

scheduleCommunicationRequests();