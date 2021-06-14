const fs = require('fs');
const medUtils = require('openhim-mediator-utils');
const request = require('request');
const axios = require('axios');
const URI = require('urijs');
const logger = require('./winston');
const config = require('./config');
const env = process.env.NODE_ENV || 'development';

const getEnabledChannel = (type, name) => {
  let enabledChannels = config.get("enabledCommChannels");
  let channel = enabledChannels.filter((ch) => {
    return ch.type === type
  })
  if(name && channel) {
    return channel.find((ch) => {
      return ch.name === name
    })
  } else {
    return channel
  }
}
const updateLastIndexingTime = (time, syncType) => {
  return new Promise((resolve, reject) => {
    logger.info('Updating lastIndexingTime')
    axios({
      url: URI(config.get("elastic:baseURL")).segment('emnuttsyncdata').segment("_doc").segment(syncType).toString(),
      method: 'PUT',
      auth: {
        username: config.get("elastic:username"),
        password: config.get("elastic:password")
      },
      data: {
        "lastIndexingTime": time
      }
    }).then((response) => {
      if(response.status < 200 && response.status > 299) {
        logger.error('An error occured while updating lastIndexingTime')
        return reject()
      }
      return resolve(false)
    }).catch((err) => {
      logger.error(err)
      logger.error('An error occured while updating lastIndexingTime')
      return reject(true)
    })
  })
}

const getLastIndexingTime = (syncType, reset) => {
  return new Promise((resolve, reject) => {
    logger.info('Getting lastIndexingTime')
    let query = {
      query: {
        term: {
          _id: syncType
        }
      }
    }
    axios({
      method: "GET",
      url: URI(config.get("elastic:baseURL")).segment('emnuttsyncdata').segment("_search").toString(),
      data: query,
      auth: {
        username: config.get("elastic:username"),
        password: config.get("elastic:password")
      }
    }).then((response) => {
      if(reset) {
        logger.info('Returning lastIndexingTime of 1970-01-01T00:00:00')
        return resolve('1970-01-01T00:00:00')
      }
      if(response.data.hits.hits.length === 0) {
        logger.info('Returning lastIndexingTime of 1970-01-01T00:00:00')
        return resolve('1970-01-01T00:00:00')
      }
      logger.info('Returning lastIndexingTime of ' + response.data.hits.hits[0]._source.lastIndexingTime)
      return resolve(response.data.hits.hits[0]._source.lastIndexingTime)
    }).catch((err) => {
      if (err.response && err.response.status && err.response.status === 404) {
        logger.info('Index not found, creating index syncData');
        let mappings = {
          mappings: {
            properties: {
              lastIndexingTime: {
                type: "text"
              }
            },
          },
        };
        axios({
            method: 'PUT',
            url: URI(config.get("elastic:baseURL")).segment('emnuttsyncdata').toString(),
            data: mappings,
            auth: {
              username: config.get("elastic:username"),
              password: config.get("elastic:password")
            }
          })
          .then(response => {
            if (response.status !== 200) {
              logger.error('Something went wrong and index was not created');
              logger.error(response.data);
              logger.info('Returning lastIndexingTime of 1970-01-01T00:00:00')
              return reject()
            } else {
              logger.info('Index syncdata created successfully');
              logger.info('Adding default lastIndexTime which is 1970-01-01T00:00:00')
              axios({
                method: 'PUT',
                auth: {
                  username: config.get("elastic:username"),
                  password: config.get("elastic:password")
                },
                url: URI(config.get("elastic:baseURL")).segment('emnuttsyncdata').segment("_doc").segment(syncType).toString(),
                data: {
                  "lastIndexingTime": "1970-01-01T00:00:00"
                }
              }).then((response) => {
                if(response.status >= 200 && response.status <= 299) {
                  logger.info('Default lastIndexTime added')
                } else {
                  logger.error('An error has occured while saving default lastIndexTime');
                  return reject("1970-01-01T00:00:00")
                }
                logger.info('Returning lastIndexingTime of 1970-01-01T00:00:00')
                return resolve("1970-01-01T00:00:00")
              }).catch((err) => {
                logger.error('An error has occured while saving default lastIndexTime');
                if (err.response && err.response.data) {
                  logger.error(err.response.data);
                }
                if (err.error) {
                  logger.error(err.error);
                }
                if (!err.response) {
                  logger.error(err);
                }
                return reject("1970-01-01T00:00:00")
              })
            }
          })
          .catch(err => {
            logger.error('Error: ' + err);
            logger.info('Returning lastIndexingTime of 1970-01-01T00:00:00')
            return reject("1970-01-01T00:00:00")
          });
      } else {
        logger.error('Error occured while getting last indexing time in ES');
        logger.error(err);
        logger.info('Returning lastIndexingTime of 1970-01-01T00:00:00')
        return reject("1970-01-01T00:00:00")
      }
    })
  })
}

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
  if(!phone) {
    return
  }
  let countryCode = config.get("app:phone:countryCode");
  phone = phone.toString();
  phone = phone.trim();
  phone = phone.replace(/-/gi, '');
  phone = phone.replace(/\//gi, '');
  phone = phone.replace(/ /g, '');

  if (!countryCode) {
    return phone;
  }

  phone = phone.replace('++', '+');
  phone = phone.replace('+++', '+');
  phone = phone.replace('++++', '+');
  if (phone.startsWith(countryCode)) {
    return phone;
  }
  if (phone.startsWith('0')) {
    phone = phone.replace('0', countryCode);
    return phone;
  } else if(phone.startsWith('+')) {
    return phone
  } else {
    return countryCode + phone;
  }
};

const validatePhone = (phoneNumber) => {
  const re = /^\+{0,2}([\-\. ])?(\(?\d{0,3}\))?([\-\. ])?\(?\d{0,3}\)?([\-\. ])?\d{3}([\-\. ])?\d{4}/;
  if(!re.test(phoneNumber)) {
    return re.test(phoneNumber);
  }
  let invalid = false;
  const countryCode = config.get("app:phone:countryCode");
  const defaultLength = config.get("app:phone:defaultLength");
  if (phoneNumber.startsWith(countryCode)) {
    let phone = phoneNumber.replace(countryCode, '');
    let lengthByMNO = config.get("app:phone:lengthByMNO");
    let hasLengthByMNO = false;
    for(let mno in lengthByMNO) {
      let length = lengthByMNO[mno];
      if(phone.startsWith(mno)) {
        hasLengthByMNO = true;
        if(phone.length != length) {
          invalid = true;
        }
      }
    }
    if(!hasLengthByMNO && defaultLength && phone.length != defaultLength) {
      invalid = true;
    }
  }
  return !invalid;
};

const getNameFromResource = (resource) => {
  let name = '';
  if(resource && resource.name && Array.isArray(resource.name) && resource.name.length > 0) {
    if(resource.name[0].text) {
      name = resource.name[0].text;
    } else {
      if(resource.name[0].given && resource.name[0].given.length > 0) {
        name = resource.name[0].given.join(" ");
      }
      if(resource.name[0].family) {
        if(name) {
          name += ", " + resource.name[0].family;
        } else {
          name = resource.name[0].family;
        }
      }
    }
  }
  return name
}

module.exports = {
  updateLastIndexingTime,
  getLastIndexingTime,
  updateConfigFile,
  updateopenHIMConfig,
  updatePhoneNumber,
  validatePhone,
  getNameFromResource,
  getEnabledChannel
};