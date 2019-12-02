'use strict';
const URI = require('urijs');
const async = require('async');
const request = require('request');
const config = require('./config');
const logger = require('./winston');
module.exports = function() {
  return {
    /**
     *
     * @param {Date} since
     */
    getWorkflows(url, since, callback) {
      if (!url) {
        var url = URI(config.get('rapidpro:url'))
          .segment('api')
          .segment('v2')
          .segment('flows.json');
        if (since) {
          url.addQuery('after', since);
        }
        url = url.toString();
      }
      //need to make this variable independent of this function so that to handle throttled
      var flows = [];
      async.whilst(
        callback => {
          if (url) {
            logger.info(`Fetching Flows From ${url}`);
          }
          return callback(null, url != false);
        },
        callback => {
          let options = {
            url,
            headers: {
              Authorization: `Token ${config.get('rapidpro:token')}`,
            },
          };
          request(options, (err, res, body) => {
            if (err) {
              logger.error(err);
              return callback(err);
            }
            this.isThrottled(JSON.parse(body), wasThrottled => {
              if (wasThrottled) {
                getWorkflows(url, since, flows => {
                  url = false;
                  return callback(false, false);
                });
              } else {
                if (err) {
                  return callback(err);
                }
                body = JSON.parse(body);
                if (!body.hasOwnProperty('results')) {
                  logger.error(JSON.stringify(body));
                  logger.error(
                    'An error occured while fetching contacts to rapidpro'
                  );
                  return callback();
                }
                flows = flows.concat(body.results);
                if (body.next) {
                  url = body.next;
                } else {
                  url = false;
                }
                return callback(null, url);
              }
            });
          });
        },
        () => {
          return callback(flows);
        }
      );
    },
    isThrottled(results, callback) {
      if (results === undefined || results === null || results === '') {
        winston.error(
          'An error has occured while checking throttling,empty rapidpro results were submitted'
        );
        return callback(true);
      }
      if (results.hasOwnProperty('detail')) {
        var detail = results.detail.toLowerCase();
        if (detail.indexOf('throttled') != -1) {
          var detArr = detail.split(' ');
          async.eachSeries(
            detArr,
            (det, nxtDet) => {
              if (!isNaN(det)) {
                //add 5 more seconds on top of the wait time expected by rapidpro then convert to miliseconds
                var wait_time = parseInt(det) * 1000 + 5;
                winston.warn(
                  'Rapidpro has throttled my requests,i will wait for ' +
                    wait_time / 1000 +
                    ' Seconds Before i proceed,please dont interrupt me'
                );
                setTimeout(function() {
                  return callback(true);
                }, wait_time);
              } else return nxtDet();
            },
            function() {
              return callback(false);
            }
          );
        } else return callback(false);
      } else {
        callback(false);
      }
    },
  };
};
