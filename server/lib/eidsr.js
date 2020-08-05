const express = require('express');
const formidable = require('formidable');
const async = require('async');
const router = express.Router();
const logger = require('./winston');
const config = require('./config');
const macm = require('./macm')();

router.post('/addDisease', (req, res) => {
  logger.info('Received a request to add diseases');
  const form = new formidable.IncomingForm();
  form.parse(req, (err, fields) => {
    let diseases = fields.diseases;
    try {
      diseases = JSON.parse(diseases);
    } catch (error) {
      logger.error(error);
    }
    macm.getResource({
      resource: 'CodeSystem',
      id: "eidsrDiseases"
    }, (err, codeSystem) => {
      if (err && err !== 404) {
        return res.status(500).send();
      }
      if (codeSystem.resourceType !== 'CodeSystem') {
        codeSystem = {
          resourceType: 'CodeSystem',
          id: 'eidsrDiseases',
          url: 'http://eidsr.emNutt.org/fhir/CodeSystem/eidsrDiseases',
          version: '1.1.0',
          description: 'List of diseases used for eIDSR suspected cases reporting',
          status: 'active',
          experimental: false,
          caseSensitive: true,
          content: "complete",
          concept: []
        };
      }
      for (let disease of diseases) {
        let found = false;
        for (let index in codeSystem.concept) {
          if (codeSystem.concept[index].code === disease.code) {
            found = true;
            if (disease.name) {
              codeSystem.concept[index].display = disease.name;
            }
          }
        }
        if (!found) {
          codeSystem.concept.push({
            code: disease.code,
            display: disease.name
          });
        }
      }
      const bundle = {};
      bundle.type = 'batch';
      bundle.resourceType = 'Bundle';
      bundle.entry = [{
        resource: codeSystem,
        request: {
          method: 'PUT',
          url: 'CodeSystem/eidsrDiseases'
        }
      }];
      macm.saveResource(bundle, (err) => {
        if (err) {
          return res.status(500).send();
        }
        return res.status(200).send();
      });
    });
  });
});

router.post('/suspectedCase', (req, res) => {
  logger.info("Received suspected case alert");
  let orderedFields = config.get("eidsr:orderedFields");
  if (orderedFields.length === 0) {
    return res.status(500).send('No ordered fields configured');
  }
  let caseReport = req.query.report;
  caseReport = caseReport.replace("alert.", "");
  let caseData = caseReport.split(".");
  if (caseData.length === 0) {
    logger.error("Submitted suspected case is empty");
    return res.status(400).send();
  }
  let suspectedCaseStruct;
  let suspStructProm = new Promise((resolve) => {
    macm.getResource({
      resource: 'StructureDefinition',
      id: "mhero-eidsr-suspected-case"
    }, (err, struct) => {
      if (!err) {
        suspectedCaseStruct = struct;
      }
      return resolve();
    });
  });
  suspStructProm.then(() => {
    let resource = {
      resourceType: "Patient",
      meta: {
        profile: ["http://mHero.org/fhir/StructureDefinition/mhero-eidsr-patient"]
      },
      extension: [{
        url: "http://mHero.org/fhir/StructureDefinition/mhero-eidsr-suspected-case",
        extension: []
      }]
    };
    let diseaseCode;
    for (let fieldIndex in orderedFields) {
      let field = orderedFields[fieldIndex];
      if (!caseData[fieldIndex]) {
        continue;
      }
      if (field === "diseaseCode") {
        diseaseCode = caseData[fieldIndex];
      }
      let extType;
      for (let suspDiff of suspectedCaseStruct.differential.element) {
        if (suspDiff.id === "Extension.extension:" + field + ".value[x]") {
          extType = suspDiff.type[0].code.toLowerCase();
          extType = extType.charAt(0).toUpperCase() + extType.slice(1);
        }
      }
      if (extType) {
        let dataValues = {};
        dataValues.url = field;
        if (extType === 'Boolean') {
          if (caseData[fieldIndex] != 'false' || caseData[fieldIndex] != 'true') {
            caseData[fieldIndex] = caseData[fieldIndex].toLowerCase();
            if (caseData[fieldIndex].startsWith('y')) {
              dataValues['value' + extType] = true;
            } else if (caseData[fieldIndex].startsWith('n')) {
              dataValues['value' + extType] = false;
            }
          } else {
            dataValues['value' + extType] = caseData[fieldIndex];
          }
        } else {
          dataValues['value' + extType] = caseData[fieldIndex];
        }
        resource.extension[0].extension.push(dataValues);
      } else {
        resource[field] = caseData[fieldIndex];
      }
    }
    macm.saveResource(resource, () => {
      return res.status(201).send();
    });
    let diseaseName;
    async.parallel({
      getDiseaseName: (callback) => {
        macm.getResource({
          resource: 'CodeSystem',
          id: 'eidsrDiseases'
        }, (err, codeSystem) => {
          let concept = codeSystem.concept.find((concept) => {
            return concept.code === diseaseCode;
          });
          diseaseName = concept.display;
          return callback(null);
        });
      }
    });
  }).catch((err) => {
    logger.error(err);
    return res.status(500).send();
  });
});

module.exports = router;