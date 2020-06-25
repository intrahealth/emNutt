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

const updatePhoneNumber = (phone) => {
  let countryCode = config.get("app:phoneCountryCode");
  phone = phone.toString();
  phone = phone.trim();
  phone = phone.replace(/-/gi, '');
  phone = phone.replace(/ /g, '');

  if (!countryCode) {
    return phone;
  }

  if (phone.startsWith(countryCode)) {
    return '+' + phone;
  }
  if (phone.startsWith('0')) {
    phone = phone.replace('0', countryCode);
    return phone;
  } else {
    return countryCode + phone;
  }
};

const validatePhone = (phoneNumber) => {
  var re = /^\+{0,2}([\-\. ])?(\(?\d{0,3}\))?([\-\. ])?\(?\d{0,3}\)?([\-\. ])?\d{3}([\-\. ])?\d{4}/;
  return re.test(phoneNumber);
};

module.exports = {
  updateConfigFile,
  updateopenHIMConfig,
  updatePhoneNumber,
  validatePhone
};