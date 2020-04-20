const request = require('request');
const URI = require('urijs');
const async = require('async');
const config = require('./config');
const logger = require('./winston');
const fs = require('fs');
const Fhir = require('fhir').Fhir;

const convert = new Fhir();

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
          if (err) throw err;
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
              resolve();
              if (err) {
                logger.error(err);
                processingError = true;
              }
              if (res.statusCode && (res.statusCode < 200 || res.statusCode > 399)) {
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
    }
  }, () => {
    return callback(error);
  });
};

module.exports = {
  init
};