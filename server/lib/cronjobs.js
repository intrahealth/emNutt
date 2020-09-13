const cron = require('node-cron');
const macm = require('./macm')();
const rapidpro = require('./rapidpro')();
const config = require('./config');
const logger = require('./winston');

function scheduleCommunicationRequests() {
  logger.info('Checking Scheduled Communication Requests');
  macm.getResource({
    resource: 'CommunicationRequest',
    query: '_total=accurate&scheduletime=',
    noCaching: true,
  }, (err, commReqs) => {
    logger.info(`Scheduling ${commReqs.entry.length} Communication Requests`);
    if(err) {
      logger.error('An error occured while getting scheduled communication requests');
      return;
    }
    for(let commReq of commReqs.entry) {
      let recurrance = commReq.resource.extension && commReq.resource.extension.find((ext) => {
        return ext.url === config.get("extensions:CommReqRecurrance");
      });
      if(!recurrance) {
        continue;
      }
      let cronExpression = recurrance.valueString;
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