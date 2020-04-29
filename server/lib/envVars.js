/*global process, __dirname */
const moment = require('moment');
const logger = require('./winston');
const config = require('./config');

const set = (callback) => {
  //APP env variables
  if (process.env.APP_INSTALLED || process.env.APP_INSTALLED === false || process.env.APP_INSTALLED === true) {
    if (typeof process.env.APP_INSTALLED === 'string') {
      config.set("app:installed", JSON.parse(process.env.APP_INSTALLED));
    } else {
      config.set("app:installed", process.env.APP_INSTALLED);
    }
  }
  if (process.env.APP_PORT) {
    let port = parseInt(process.env.APP_PORT);
    if (isNaN(port)) {
      logger.error('Environment variable APP_PORT is not an integer, starting app using default port instead');
    } else {
      config.set("app:port", process.env.APP_PORT);
    }
  }
  if (process.env.APP_BASE_URL) {
    try {
      new URL(process.env.APP_BASE_URL);
    } catch (err) {
      logger.error('Invalid APP_BASE_URL');
      throw err;
    }
    config.set("app:baseURL", process.env.APP_BASE_URL);
  }

  //openhim env variables
  if (process.env.MEDIATOR_API_USERNAME) {
    config.set("mediator:api:username", process.env.MEDIATOR_API_USERNAME);
  }
  if (process.env.MEDIATOR_API_PASSWORD) {
    config.set("mediator:api:password", process.env.MEDIATOR_API_PASSWORD);
  }
  if (process.env.MEDIATOR_API_URL) {
    config.set("mediator:api:apiURL", process.env.MEDIATOR_API_URL);
  }
  if (process.env.MEDIATOR_API_TRUST_SELF_SIGNED) {
    config.set("mediator:api:trustSelfSigned", process.env.MEDIATOR_API_TRUST_SELF_SIGNED);
  }
  if (process.env.MEDIATOR_ROUTER_URL) {
    try {
      new URL(process.env.MEDIATOR_ROUTER_URL);
    } catch (err) {
      logger.error('Invalid MEDIATOR_ROUTER_URL');
      throw err;
    }
    config.set("mediator:api:routerURL", process.env.MEDIATOR_ROUTER_URL);
  }
  if (process.env.MEDIATOR_REGISTER || process.env.MEDIATOR_REGISTER === false || process.env.MEDIATOR_REGISTER === true) {
    if (typeof process.env.MEDIATOR_REGISTER === 'string') {
      config.set("mediator:register", JSON.parse(process.env.MEDIATOR_REGISTER));
    } else {
      config.set("mediator:register", process.env.MEDIATOR_REGISTER);
    }
  }

  // rapidpro env variables
  if (process.env.RAPIDPRO_BASE_URL) {
    try {
      new URL(process.env.RAPIDPRO_BASE_URL);
    } catch (err) {
      logger.error('Invalid RAPIDPRO_BASE_URL');
      throw err;
    }
    config.set("rapidpro:baseURL", process.env.RAPIDPRO_BASE_URL);
  }
  if (process.env.RAPIDPRO_TOKEN) {
    config.set("rapidpro:token", process.env.RAPIDPRO_TOKEN);
  }
  if (process.env.RAPIDPRO_SYNC_ALL_CONTACTS) {
    config.set("rapidpro:syncAllContacts", process.env.RAPIDPRO_SYNC_ALL_CONTACTS);
  }

  //MACM env variables
  if (process.env.MACM_BASE_URL) {
    try {
      new URL(process.env.MACM_BASE_URL);
    } catch (err) {
      logger.error('Invalid MACM_BASE_URL');
      throw err;
    }
    config.set("macm:baseURL", process.env.MACM_BASE_URL);
  }
  if (process.env.MACM_USERNAME) {
    config.set("macm:username", process.env.MACM_USERNAME);
  }
  if (process.env.MACM_PASSWORD) {
    config.set("macm:password", process.env.MACM_PASSWORD);
  }

  //Elasticsearch env variables
  if (process.env.ELASTIC_BASE_URL) {
    try {
      new URL(process.env.ELASTIC_BASE_URL);
    } catch (err) {
      logger.error('Invalid ELASTIC_BASE_URL');
      throw err;
    }
    config.set("elastic:baseURL", process.env.ELASTIC_BASE_URL);
  }
  if (process.env.ELASTIC_USERNAME) {
    config.set("elastic:username", process.env.ELASTIC_USERNAME);
  }
  if (process.env.ELASTIC_PASSWORD) {
    config.set("elastic:password", process.env.ELASTIC_PASSWORD);
  }

  //Kibana env variables
  if (process.env.KIBANA_BASE_URL) {
    try {
      new URL(process.env.KIBANA_BASE_URL);
    } catch (err) {
      logger.error('Invalid KIBANA_BASE_URL');
      throw err;
    }
    config.set("kibana:baseURL", process.env.KIBANA_BASE_URL);
  }
  if (process.env.ELASTIC_USERNAME) {
    config.set("kibana:username", process.env.KIBANA_USERNAME);
  }
  if (process.env.ELASTIC_PASSWORD) {
    config.set("kibana:password", process.env.KIBANA_PASSWORD);
  }

  //Last sync env variables
  if (process.env.LAST_SYNC_WORKFLOWS) {
    let valid = moment(process.env.LAST_SYNC_WORKFLOWS, "YYYY-MM-DDTHH:mm:ss").isValid();
    if (valid) {
      config.set("lastSync:syncWorkflows", moment(process.env.LAST_SYNC_WORKFLOWS).format("YYYY-MM-DDTHH:mm:ss"));
    } else {
      logger.error('Invalid date format for LAST_SYNC_WORKFLOWS');
    }
  }
  if (process.env.LAST_SYNC_WORKFLOW_RUN_MESSAGES) {
    let valid = moment(process.env.LAST_SYNC_WORKFLOW_RUN_MESSAGES, "YYYY-MM-DDTHH:mm:ss").isValid();
    if (valid) {
      config.set("lastSync:syncWorkflowRunMessages", moment(process.env.LAST_SYNC_WORKFLOW_RUN_MESSAGES).format("YYYY-MM-DDTHH:mm:ss"));
    } else {
      logger.error('Invalid date format for LAST_SYNC_WORKFLOW_RUN_MESSAGES');
    }
  }
  if (process.env.LAST_SYNC_CONTACTS) {
    let valid = moment(process.env.LAST_SYNC_CONTACTS, "YYYY-MM-DDTHH:mm:ss").isValid();
    if (valid) {
      config.set("lastSync:syncContacts", moment(process.env.LAST_SYNC_CONTACTS).format("YYYY-MM-DDTHH:mm:ss"));
    } else {
      logger.error('Invalid date format for LAST_SYNC_CONTACTS');
    }
  }
  return callback();
};

module.exports = {
  set
};