const express = require('express');
const async = require('async');
const lodash = require('lodash')
const router = express.Router();
const logger = require('../winston');
const config = require('../config');
const macm = require('../macm')();

router.post('/addDisease', (req, res) => {
  logger.info('Received a request to add diseases');
  let diseases = req.body;
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
        id: 'mHeroEidsrDiseases',
        url: 'http://mhero.org/fhir/CodeSystem/mHeroEidsrDiseases',
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

router.post('/suspectedCase', (req, res) => {
  logger.info("Received suspected case alert");
  let orderedFields = config.get("eidsr:orderedFields");
  if (orderedFields.length === 0) {
    return res.status(500).send('No ordered fields configured');
  }
  let caseReport = req.query.report;
  let globalid = req.query.globalid
  let mheroentitytype = req.query.mheroentitytype

  if(!globalid || !mheroentitytype) {
    return res.status(400).send('Sender ID is missing')
  }

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
    resource.extension[0].extension.push({
      url: 'reporterID',
      valueReference: {
        reference: `${mheroentitytype}/${globalid}`
      }
    });
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
    macm.saveResource(resource, (err, saveResp, body) => {
      if(err || (saveResp && saveResp.statusCode !== 201)) {
        return res.status(400).send();
      }
      return res.status(saveResp.statusCode).send();
    });
    let caseDetails = {
      diseaseName: '',
      reporterName: '',
      facility: '',
      reporterPhone: '',
      reporterLocation: {}
    }
    async.parallel({
      getDiseaseName: (callback) => {
        macm.getResource({
          resource: 'CodeSystem',
          id: 'eidsrDiseases'
        }, (err, codeSystem) => {
          let concept = codeSystem.concept && codeSystem.concept.find((concept) => {
            return concept.code === diseaseCode;
          });
          if(concept) {
            caseDetails.diseaseName = concept.display;
          }
          return callback(null);
        });
      },
      getReporterInfo: (callback) => {
        macm.getResource({
          resource: 'PractitionerRole',
          query: `practitioner=${globalid}&_include=PractitionerRole:practitioner&_include=PractitionerRole:location`
        }, (err, resources) => {
          let practRes = resources.entry.find((entry) => {
            return entry.resource.resourceType === 'Practitioner'
          })
          if(practRes.resource.name) {
            for(let name of practRes.resource.name) {
              if(name.use === 'official') {
                if(name.text) {
                  caseDetails.reporterName = name.text
                } else {
                  caseDetails.reporterName = name.given.join(' ')
                  caseDetails.reporterName += ' ' + name.family
                }
                break;
              } else if(!caseDetails.reporterName) {
                if(name.text) {
                  caseDetails.reporterName = name.text
                } else {
                  caseDetails.reporterName = name.given.join(' ')
                  caseDetails.reporterName += ' ' + name.family
                }
              }
            }
          }
          if(practRes.resource.telecom) {
            for(let telecom of practRes.resource.telecom) {
              if(telecom.system === 'phone' && telecom.use === 'work') {
                caseDetails.reporterPhone = telecom.value
                break;
              } else if(!caseDetails.reporterPhone) {
                caseDetails.reporterPhone = telecom.value
              }
            }
          }
          let loc = resources.entry.find((entry) => {
            return entry.resource.resourceType === 'Location'
          })
          if(loc) {
            caseDetails.facility = loc.resource.name
          }
          if(loc && loc.resource.id) {
            let levels = config.get("eidsr:orgHierarchyLevels")
            macm.getResource({
              resource: 'Location',
              query: `_id=${loc.resource.id}&_include:recurse=Location:partof`
            }, (err, locHierarchy) => {
              let total = locHierarchy.entry.length
              for(let entry of locHierarchy.entry) {
                for(let locType in levels) {
                  if(levels[locType] == total) {
                    caseDetails.reporterLocation[locType] = entry.resource.name
                    break;
                  }
                }
                --total
              }
              return callback(null)
            })
          } else {
            return callback(null)
          }
        })
      }
    }, () => {
      let notifications = lodash.cloneDeep(config.get("eidsr:notifications"))
      for(let detType in caseDetails) {
        if(!caseDetails[detType]) {
          continue
        }
        if(detType === 'reporterLocation') {
          for(let locType in caseDetails[detType]) {
            if(locType && caseDetails[detType][locType]) {
              let re = new RegExp(`{{${locType}}}`, 'gi')
              notifications.msg = notifications.msg.replace(re, caseDetails[detType][locType])
              for(let index in notifications.designation) {
                notifications.designation[index].msg = notifications.designation[index].msg.replace(re, caseDetails[detType][locType])
              }
            }
          }
        } else {
          let re = new RegExp(`{{${detType}}}`, 'gi')
          notifications.msg = notifications.msg.replace(re, caseDetails[detType])
          for(let index in notifications.designation) {
            notifications.designation[index].msg = notifications.designation[index].msg.replace(re, caseDetails[detType])
          }
        }
      }
      logger.error(JSON.stringify(notifications,0,2));
    });
  }).catch((err) => {
    logger.error(err);
    return res.status(500).send();
  });
});

module.exports = router;