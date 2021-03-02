const URI = require('urijs');
const request = require('request');
const async = require('async');
const rapidpro = require('../rapidpro')();
const config = require('../config');
const logger = require('../winston');

rapidpro.getEndPointData({
  endPoint: 'contacts.json'
}, (err, contacts) => {
  logger.error(contacts.length);
  async.eachOfSeries(contacts, (cnt, index, nxt) => {
    let url = URI(config.get('rapidpro:baseURL'))
      .segment('api')
      .segment('v2')
      .segment('contacts.json')
      .addQuery('uuid', cnt.uuid)
      .toString();
    const options = {
      url,
      headers: {
        Authorization: `Token ${config.get('rapidpro:token')}`,
      },
    };
    request.delete(options, (err, res, body) => {
      logger.error(body);
      return nxt();
    });
  });
});