'use strict';
const express = require('express');
const logger = require('./winston');
const config = require('./config');
const rapidpro = require('./rapidpro')();
const macm = require('./macm')
const app = express();

app.get('/test', (req, res) => {
  macm.rpFlowsToFHIR()
})
app.get('/syncWorkflows', (req, res) => {
  logger.info('Received a request to syncronize workflows');
  rapidpro.getWorkflows(null, null, flows => {
    logger.error(JSON.stringify(flows, 0, 2));
  });
});

app.listen(config.get('server:port'), () => {
  logger.info(
    `Server is running and listening on port: ${config.get('server:port')}`
  );
});