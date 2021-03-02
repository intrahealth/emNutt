const URI = require('urijs');
const request = require('request');
const async = require('async');
const rapidpro = require('../rapidpro')();
const config = require('../config');
const logger = require('../winston');

rapidpro.getEndPointData({
  endPoint: 'messages.json'
}, (err, messages) => {
  let msgIds = []
  async.eachSeries(messages, (msg, nxt) => {
    if(msg.type === 'inbox') {
      msgIds.push(msg.id)
    }
    if(msgIds.length > 98) {
      let url = URI(config.get('rapidpro:baseURL'))
        .segment('api')
        .segment('v2')
        .segment('message_actions.json')
        .toString();
      const options = {
        url,
        headers: {
          Authorization: `Token ${config.get('rapidpro:token')}`,
        },
        json: {
          messages: msgIds,
          action: 'delete'
        }
      };
      request.post(options, (err, res, body) => {
        logger.info('Deleting returned status code ' + res.statusCode)
        msgIds = []
        logger.error(body);
        return nxt();
      });
    } else {
      return nxt();
    }
  }, () => {
    if(msgIds.length > 0) {
      let url = URI(config.get('rapidpro:baseURL'))
        .segment('api')
        .segment('v2')
        .segment('message_actions.json')
        .toString();
      const options = {
        url,
        headers: {
          Authorization: `Token ${config.get('rapidpro:token')}`,
        },
        json: {
          messages: msgIds,
          action: 'delete'
        }
      };
      request.post(options, (err, res, body) => {
        logger.info('Deleting returned status code ' + res.statusCode)
        logger.info('Done')
      });
    } else {
      logger.info('Done')
    }
  });
});