const request = require('request');
const URI = require('urijs');
const async = require('async');
const config = require('./config');
const logger = require('./winston');
const fs = require('fs');
const Fhir = require('fhir').Fhir;

const convert = new Fhir();
const checkDependencies = (callback) => {
  let dependencies = [{
    name: 'hapi',
    url: URI(config.get('macm:baseURL')).segment('Communication').toString(),
    auth: {
      username: config.get('macm:username'),
      password: config.get('macm:password')
    }
  }, {
    name: 'kibana',
    url: URI(config.get('kibana:baseURL')).segment('api').segment("kibana").segment("dashboards").segment("export").addQuery("dashboard", "XXX").toString(),
    auth: {
      username: config.get('kibana:username'),
      password: config.get('kibana:password')
    }
  }, {
    name: 'elasticsearch',
    url: URI(config.get('elastic:baseURL')).toString(),
    auth: {
      username: config.get('elastic:username'),
      password: config.get('elastic:password')
    }
  }];
  async.each(dependencies, (dependence, nxt) => {
    isRunning(dependence, () => {
      return nxt();
    });
  }, () => {
    return callback();
  });

  function isRunning(dependence, callback) {
    logger.info('Checking if ' + dependence.name + ' is running');
    if(dependence.name === 'kibana') {
      return callback(true)
    }
    const options = {
      url: dependence.url,
      auth: dependence.auth
    };
    request.get(options, (err, res) => {
      if (res && res.statusCode) {
        logger.info(dependence.name + ' responded with code ' + res.statusCode);
      }
      if (!res || (res && res.statusCode == 503)) {
        logger.error(dependence.name + ' Is not ready, waiting for 2 more seconds');
        setTimeout(() => {
          isRunning(dependence, (status) => {
            return callback(status);
          });
        }, 2000);
      } else {
        logger.info(dependence.name + ' is running...');
        return callback(true);
      }
    });
  }
};

const loadResources = (callback) => {
  let processingError = false;
  const folders = [
    `${__dirname}/../../resources/StructureDefinition`,
    `${__dirname}/../../resources/Relationships`,
    `${__dirname}/../../resources/SearchParameter`
  ];
  const promises = [];
  for (const folder of folders) {
    fs.readdirSync(folder).forEach(file => {
      promises.push(new Promise((resolve) => {
        logger.info('Loading ' + file + ' into FHIR server...');
        fs.readFile(`${folder}/${file}`, (err, data) => {
          if (err) {
	    console.log(err);
	    return;
	  }
          let fhir;
          if (file.substring(file.length - 3) === 'xml') {
            fhir = convert.xmlToObj(data);
          } else {
            fhir = JSON.parse(data);
          }
          const dest = URI(config.get('macm:baseURL')).segment(fhir.resourceType).segment(fhir.id).toString();
          const options = {
            url: dest,
            withCredentials: true,
            auth: {
              username: config.get('macm:username'),
              password: config.get('macm:password')
            },
            headers: {
              'Content-Type': 'application/json',
            },
            json: fhir,
          };
          if (fhir.resourceType === 'Bundle' &&
            (fhir.type === 'transaction' || fhir.type === 'batch')) {
            logger.info('Saving ' + fhir.type);
            request.post(options, (err, res, body) => {
              resolve();
              if (err) {
                logger.error(err);
                processingError = true;
              }
              if (res.statusCode && (res.statusCode < 200 || res.statusCode > 399)) {
                processingError = true;
              }
              logger.info(dest + ': ' + res.statusCode);
              logger.info(JSON.stringify(res.body, null, 2));
            });
          } else {
            logger.info('Saving ' + fhir.resourceType + ' - ' + fhir.id);
            request.put(options, (err, res, body) => {
              if (!res) {
                logger.error('Something went wrong, this might be caused by unreachable FHIR server');
                return resolve;
              }
              resolve();
              if (err) {
                logger.error(err);
                processingError = true;
              }
              if (res && res.statusCode && (res.statusCode < 200 || res.statusCode > 399)) {
                processingError = true;
              }
              logger.info(dest + ': ' + res.statusCode);
              logger.info(res.headers['content-location']);
            });
          }
        });
      }));
    });
  }

  Promise.all(promises).then(() => {
    logger.info('Done loading required resources');
    return callback(processingError);
  }).catch((err) => {
    throw err;
  });
};

const addRapidproDefaultData = (callback) => {
  logger.info('Adding Fields into Rapidpro');
  let url = URI(config.get('rapidpro:baseURL'))
    .segment('api')
    .segment('v2')
    .segment('fields.json');
  url = url.toString();
  let labels = [{
    key: 'globalid',
    label: 'globalid',
    value_type: 'text'
  }, {
    key: 'mheroentitytype',
    label: 'mheroentitytype',
    value_type: 'text'
  }];
  let error = false;
  async.each(labels, (label, nxtLabel) => {
    const options = {
      url,
      headers: {
        Authorization: `Token ${config.get('rapidpro:token')}`,
      },
      json: label,
    };
    request.post(options, (err, res, body) => {
      logger.info(`Done adding field ${label.key} into Rapidpro`);
      if (!res) {
        logger.error(`An error occured while adding field ${label.key} into Rapidpro, this might be due to unreachable Rapidpro instance`);
        error = true;
      } else if (res.statusCode === 400) {
        logger.info(`Field ${label.key} already exists`);
      } else if (!err && res.statusCode && (res.statusCode < 200 || res.statusCode > 399)) {
        err = `An error occured while adding field ${label.key}, Err Code ${res.statusCode}`;
        error = true;
        logger.info(body);
      }
      if (err) {
        logger.error(err);
      }
      return nxtLabel();
    });
  }, () => {
    return callback(error);
  });
};

const loadmHeroDashboards = (callback) => {
  let processingError = false;
  const folders = [
    `${__dirname}/../../resources/kibana/dashboards`
  ];
  const promises = [];
  for (const folder of folders) {
    fs.readdirSync(folder).forEach(file => {
      promises.push(new Promise((resolve) => {
        logger.info('Loading ' + file + ' into Kibana...');
        fs.readFile(`${folder}/${file}`, (err, data) => {
          if (err) throw err;
          try {
            data = JSON.parse(data);
          } catch (error) {
            logger.error(error);
            throw error;
          }


          const dest = URI(config.get('kibana:baseURL'))
            .segment('api')
            .segment('kibana')
            .segment('dashboards')
            .segment('import')
            .addQuery('force', true)
            .toString();
          const options = {
            url: dest,
            withCredentials: true,
            auth: {
              username: config.get('kibana:username'),
              password: config.get('kibana:password')
            },
            headers: {
              'kbn-xsrf': true,
              'Content-Type': 'application/json',
            },
            json: data,
          };
          request.post(options, (err, res, body) => {
            resolve();
            if (err) {
              logger.error(err);
              processingError = true;
            }
            if (res.statusCode && (res.statusCode < 200 || res.statusCode > 399)) {
              processingError = true;
            }
            logger.info(dest + ': ' + res.statusCode);
            logger.info(JSON.stringify(res.body, null, 2));
          });
        });
      }));
    });
  }
  Promise.all(promises).then(() => {
    logger.info('Done loading required resources');
    return callback(processingError);
  }).catch((err) => {
    throw err;
  });
};

const init = (callback) => {
  let error = false;
  async.parallel({
    loadResources: (callback) => {
      loadResources((err) => {
        if (err) {
          error = err;
        }
        return callback(null);
      });
    },
    loadmHeroDashboards: (callback) => {
      loadmHeroDashboards((err) => {
        if (err) {
          error = err;
        }
        return callback(null);
      });
    },
    addRapidproDefaultData: (callback) => {
      addRapidproDefaultData((err) => {
        return callback(null);
      });
    }
  }, () => {
    return callback(error);
  });
};

module.exports = {
  init,
  addRapidproDefaultData,
  checkDependencies
};
