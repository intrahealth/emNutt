const nconf = require('nconf');
const env = process.env.NODE_ENV || 'development';
nconf.argv()
  .env()
  .file({
    file: `../config/config_${env}.json`
  });
module.exports = nconf;