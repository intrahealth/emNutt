const fs = require('fs');
const medUtils = require('openhim-mediator-utils');
const request = require('request');
const logger = require('./winston');
const config = require('./config');
const env = process.env.NODE_ENV || 'development';

const setNestedKey = (obj, path, value, callback) => {
  if (path.length === 1) {
    obj[path] = value;
    return callback();
  }
  setNestedKey(obj[path[0]], path.slice(1), value, () => {
    return callback();
  });
};

const updateConfigFile = (path, newValue, callback) => {
  const pathString = path.join(':');
  config.set(pathString, newValue);
  logger.info('Updating config file');
  const configFile = `${__dirname}/../config/config_${env}.json`;
  const configData = require(configFile);
  setNestedKey(configData, path, newValue, () => {
    fs.writeFile(configFile, JSON.stringify(configData, 0, 2), (err) => {
      if (err) {
        throw err;
      }
      logger.info('Done updating config file');
      return callback();
    });
  });
};

const updateopenHIMConfig = (urn, updatedConfig, callback) => {
  medUtils.authenticate(config.get("mediator:api"), () => {
    const options = {
      url: `${config.get("mediator:api:apiURL")}/mediators/${urn}/config`,
      headers: medUtils.genAuthHeaders(config.get("mediator:api")),
      body: updatedConfig,
      json: true
    };
    request.put(options, (err, res, body) => {
      if (err) {
        return callback(err);
      }
      callback();
    });
  });
};

module.exports = {
  updateConfigFile,
  updateopenHIMConfig
};