/*global process, __dirname */
const nconf = require('nconf');
const envVars = require('./envVars');
const env = process.env.NODE_ENV || 'development';
nconf.argv()
  .env({
    lowerCase: true
  })
  .file({
    file: `${__dirname}/../config/config_${env}.json`
  });
envVars.set();
module.exports = nconf;