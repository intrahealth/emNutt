'use strict';
const express = require('express');
const bodyParser = require('body-parser');
const async = require('async');
const logger = require('./winston');
const config = require('./config');
const rapidpro = require('./rapidpro')();
const macm = require('./macm')();
const app = express();

app.use(bodyParser.json());

app.get('/test', (req, res) => {
  rapidpro.getContacts({}, (cnt) => {
    console.log(JSON.stringify(cnt, 0, 2));
  });
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

app.get('/checkCommunicationRequest', (req, res) => {
  const promise = new Promise((resolve, reject) => {
    if (!config.get('rapidpro:syncAllContacts')) {
      rapidpro.getContacts({}, (rpContacts) => {
        resolve(rpContacts);
      });
    } else {
      return resolve([]);
    }
  });
  promise.then((rpContacts) => {
    macm.getResource({
      resource: 'CommunicationRequest'
    }, (commReqs) => {
      rapidpro.processCommunications(commReqs, rpContacts, () => {
        logger.info('Done checking communication requests');
        res.status(200).send('Done');
      });
    });
  }).catch((err) => {
    throw err;
  });
});

app.post('/syncContacts', (req, res) => {
  logger.info('Received a bundle of contacts to be synchronized');
  const bundle = req.body;
  if (!bundle) {
    logger.error('Received empty request');
    res.status(400).send('Empty request body');
    return;
  }
  if (bundle.resourceType !== 'Bundle') {
    logger.error('Request is not a bundle');
    res.status(400).send('Request is not a bundle');
  }
  rapidpro.getContacts({}, (rpContacts) => {
    async.each(bundle.entry, (entry, nxtEntry) => {
      rapidpro.addContact({
        contact: entry.resource,
        rpContacts
      }, () => {
        return nxtEntry();
      });
    }, () => {
      logger.info('Contacts Sync Done');
      res.status(200).send('Suceessfully');
    });
  });
});

app.get('/syncContacts', (req, res) => {
  logger.info('Received a request to sync DB contacts');
  let contacts = [];
  async.series({
    practitioners: (callback) => {
      macm.getResource('Practitioner', (practs) => {
        contacts = contacts.concat(practs.entry);
      });
    },
    person: (callback) => {
      macm.getResource('Person', (pers) => {
        contacts = contacts.concat(pers.entry);
      });
    }
  }, () => {
    rapidpro.getContacts({}, (rpContacts) => {
      async.each(contacts, (contact, nxtEntry) => {
        rapidpro.addContact({
          contact: contact.resource,
          rpContacts
        }, () => {
          return nxtEntry();
        });
      }, () => {
        logger.info('Contacts Sync Done');
        res.status(200).send('Successfully');
      });
    });
  });
});

app.listen(config.get('server:port'), () => {
  logger.info(`Server is running and listening on port: ${config.get('server:port')}`);
});
