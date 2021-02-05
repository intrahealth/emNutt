const macm = require('./macm')();
const moment = require('moment');
const async = require('async');
const config = require('./config');
const logger = require('./winston');
const { FlowResultsClient, fhirQuestionnaireResponsesFromFlowResultsResponseSet } = require('@floip/flow-results-utils');
module.exports = {
  flowResultsToQuestionnaire
};

async function flowResultsToQuestionnaire(callback) {
  let errorOccured = false;
  const bundle = {};
  bundle.type = 'batch';
  bundle.resourceType = 'Bundle';
  bundle.entry = [];
  let runsLastSync = config.get('lastSync:syncFloipFlowResults:time');
  const isValid = moment(runsLastSync, 'Y-MM-DD HH:mm:ss').isValid();
  if (!isValid) {
    runsLastSync = moment('1970-01-01').format('Y-MM-DD HH:mm:ss');
  }
  let baseURL = config.get("floip:baseURL");
  let authHeader = `Token ${config.get("floip:token")}`;
  const client = new FlowResultsClient(baseURL, authHeader);

  const packageIds = await client.getPackagesIds().then((r) => r.data).catch((e) => { logger.error('Error', e);});
  if(!packageIds) {
    return callback();
  }
  async.eachSeries(packageIds, async (packageId, nxtId) => {
    const frPackage = await client.getPackage(packageId).then((r) => r.data).catch((e) => {
      errorOccured = true;
      logger.error('Error', e);
      return nxtId();
    });

    if(frPackage) {
      // Convert all Responses to QuestionnaireResponse
      let options = {
        'filter[start-timestamp]' : runsLastSync,
        'page[size]': '500' // Adjust page size for memory consumption, up to the limits of server. Larger page sizes will be faster but consume more memory in the converter.
      };
      let questionnaireResponses;
      await fhirQuestionnaireResponsesFromFlowResultsResponseSet(frPackage, client.getResponsesFromPackage(frPackage, options),  qtnRespnses => {
          questionnaireResponses = qtnRespnses;
        }
      ).catch((e) => {
        errorOccured = true;
        logger.error('Error', e);
        return nxtId();
      });

      async.eachSeries(questionnaireResponses, (questionnaireResponse, nxtQuest) => {
        if(bundle.entry.length >= 250) {
          macm.saveResource(bundle, (err) => {
            if(err) {
              errorOccured = true;
            }
            bundle.entry = [];
            return nxtQuest();
          });
        } else {
          bundle.entry.push({
            resource: questionnaireResponse,
            request: {
              method: 'PUT',
              url: questionnaireResponse.resourceType + "/" + questionnaireResponse.id
            }
          });
          return nxtQuest();
        }
      }, () => {
        return nxtId();
      });
    } else {
      return nxtId();
    }
  }, () => {
    if(bundle.entry.length > 0) {
      macm.saveResource(bundle, (err) => {
        if(err) {
          errorOccured = true;
        }
        return callback(errorOccured);
      });
    } else {
      return callback(errorOccured);
    }
  });
}