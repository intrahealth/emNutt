const nconf = require('nconf');
const env = process.env.NODE_ENV || 'development';
nconf.argv()
  .env({ lowerCase: true })
  .file({
    file: `${__dirname}/../config/config_${env}.json`
  });
module.exports = nconf;
