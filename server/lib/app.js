'use strict';
const express = require('express');
const logger = require('./winston');
const config = require('./config');
const rapidpro = require('./rapidpro')();
const macm = require('./macm')();
const app = express();

app.get('/test', (req, res) => {
  macm.rpFlowsToFHIR();
});
app.get('/syncWorkflows', (req, res) => {
  logger.info('Received a request to synchronize workflows');
  rapidpro.getWorkflows(null, null, flows => {
    macm.rpFlowsToFHIR(flows, (err, body) => {
      logger.info('Done Synchronizing flows');
      if (err) {
        res.status(500).send(err);
      } else {
        res.status(200).send('Done');
      }
    });
  });
});

app.listen(config.get('server:port'), () => {
  logger.info(
    `Server is running and listening on port: ${config.get('server:port')}`
  );
});