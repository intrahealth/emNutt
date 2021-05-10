const express = require("express");
const router = express.Router();
const async = require('async');
const dataSync = require('../dataSync');
const macm = require('../macm')();
const rapidpro = require('../rapidpro')();
const logger = require('../winston');
const config = require('../config');

router.get('/syncWorkflows', (req, res) => {
  logger.info('Received a request to synchronize workflows');
  dataSync.syncWorkflows((error) => {
    if (error) {
      return res.status(500).send('Internal error occured');
    }
    res.status(200).send('Done');
  });
});

router.get('/syncContacts', (req, res) => {
  logger.info('Received a request to sync DB contacts');
  if (!config.get('rapidpro:syncAllContacts')) {
    logger.warn('All Contacts sync is disabled, the server will sync only communicated contacts');
    return res.status(403).send('All Contacts sync is disabled, the server will sync only communicated contacts');
  }
  dataSync.syncContacts((error) => {
    if (error) {
      return res.status(500).send('Some errors occured');
    }
    return res.status(200).send('Suceessfully');
  });
});

router.post('/syncContacts', (req, res) => {
  let processingError = false;
  logger.info('Received a bundle of contacts to be synchronized');
  if (!config.get('rapidpro:syncAllContacts')) {
    logger.warn('All Contacts sync is disabled, the server will sync only communicated contacts');
    res.status(403).send('All Contacts sync is disabled, the server will sync only communicated contacts');
  }
  const bundle = req.body;
  if (!bundle) {
    logger.error('Received empty request');
    res.status(400).send('Empty request body');
    return;
  }
  if (bundle.resourceType !== 'Bundle') {
    logger.error('Request is not a bundle');
    res.status(400).send('Request is not a bundle');
    return;
  }
  async.series({
    rapidpro: (callback) => {
      rapidpro.syncContacts(bundle, (err) => {
        if (err) {
          processingError = err;
        }
        return callback(null);
      });
    }
  }, () => {
    bundle.type = 'batch';
    macm.saveResource(bundle, () => {
      logger.info('Contacts Sync Done');
      if (processingError) {
        return res.status(500).send('Some errors occured');
      }
      res.status(200).send('Suceessfully');
    });
  });
});

router.get('/syncContactsGroups', (req, res) => {
  logger.info('Received a request to sync contacts groups');
  dataSync.syncContactsGroups((error) => {
    if (error) {
      return res.status(500).send('Some errors occured');
    }
    return res.status(200).send('Suceessfully');
  });
});

router.get('/syncFloipFlowResults', (req, res) => {
  logger.info("Received a request to sync flow results from FLOIP server");
  dataSync.syncFloipFlowResults((error) => {
    if(error) {
      return res.status(500).send();
    }
    return res.status(200).send();
  });
});

router.get('/syncWorkflowRunMessages', (req, res) => {
  logger.info('Received a request to sync workflow messages');
  dataSync.syncWorkflowRunMessages((error) => {
    if (error) {
      return res.status(500).send('Internal error occured');
    }
    res.status(200).send('Done');
  });
});

router.get('/checkCommunicationRequest', (req, res) => {
  logger.info("Received a request to check communication requests");
  dataSync.checkCommunicationRequest((error) => {
    if (error) {
      return res.status(500).send();
    }
    res.status(200).send();
  });
});

router.get('/cacheFHIR2ES', (req, res) => {
  dataSync.cacheFHIR2ES(() => {
    res.status(200).send();
  });
});


module.exports = router;