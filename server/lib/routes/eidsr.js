const express = require('express');
const uuid4 = require('uuid/v4');
const async = require('async');
const lodash = require('lodash');
const router = express.Router();
const logger = require('../winston');
const config = require('../config');
const rapidpro = require('../rapidpro')();
const macm = require('../macm')();
const mixin = require('../mixin');

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
  const caseDetails = {
    diseaseName: '',
    reporterName: '',
    facility: '',
    reporterPhone: '',
    reporterLocation: {},
    reporterRPId: '',
    urns: []
  }
  let diseaseCode;
  let eidsrConfig = config.get("eidsr")
  let orderedFields = eidsrConfig.orderedFields;
  if (orderedFields.length === 0) {
    return res.status(500).send('No ordered fields configured');
  }
  let caseReport = req.query.report;
  let globalid = req.query.globalid
  let mheroentitytype = req.query.mheroentitytype

  if(req.query.caseID) {
    caseDetails.caseID = req.query.caseID
  }
  if(eidsrConfig.onlyProvidersCanReport && (!globalid || !mheroentitytype)) {
    return res.status(400).send('Sender ID is missing')
  }

  caseReport = caseReport.replace("alert.", "");
  let caseData = caseReport.split(".");
  if (caseData.length === 0) {
    logger.error("Submitted suspected case is empty");
    return res.status(400).send();
  }
  let suspectedCaseStruct;
  let patientProfile
  let suspStructProm = new Promise((resolve, reject) => {
    macm.getResource({
      resource: 'StructureDefinition',
      query: "_id=mhero-eidsr-suspected-case,mhero-eidsr-patient"
    }, (err, struct) => {
      let structDef = struct.entry.find((str) => {
        return str.resource.id === 'mhero-eidsr-suspected-case'
      })
      let profile = struct.entry.find((str) => {
        return str.resource.id === 'mhero-eidsr-patient'
      })
      if (structDef) {
        suspectedCaseStruct = structDef.resource;
      } else {
        reject('EIDSR extensions for patient resource is missing')
      }
      if(profile) {
        patientProfile = profile.resource
      } else {
        reject('Patient profile for eidsr is missing')
      }
      return resolve();
    });
  });

  let diseaseProm = new Promise((resolve, reject) => {
    for (let fieldIndex in orderedFields) {
      let field = orderedFields[fieldIndex];
      if (!caseData[fieldIndex]) {
        continue;
      }
      if (field === "diseaseCode") {
        diseaseCode = caseData[fieldIndex];
      }
    }
    if(!diseaseCode) {
      return reject('Disease code is missing')
    }
    macm.getResource({
      resource: 'CodeSystem',
      id: 'eidsrDiseases'
    }, (err, codeSystem) => {
      let concept = codeSystem.concept && codeSystem.concept.find((concept) => {
        return concept.code === diseaseCode;
      });
      if(concept) {
        caseDetails.diseaseName = concept.display;
      } else {
        return reject('Disease code not found')
      }
      return resolve();
    });
  })

  let reporterInfoProm = new Promise((resolve, reject) => {
    if(!globalid) {
      return resolve()
    }
    macm.getResource({
      resource: 'PractitionerRole',
      query: `practitioner=${globalid}&_include=PractitionerRole:practitioner&_include=PractitionerRole:location`
    }, (err, resources) => {
      if(err) {
        return reject()
      }
      let practRes = resources.entry.find((entry) => {
        return entry.resource.resourceType === 'Practitioner'
      })
      if(practRes && practRes.resource.identifier) {
        let rapId = practRes.resource.identifier && practRes.resource.identifier.find((ident) => {
          return ident.system === "http://app.rapidpro.io/contact-uuid"
        })
        if(rapId) {
          caseDetails.reporterRPId = rapId.value
        }
      }
      if(!caseDetails.reporterRPId && practRes.resource.telecom) {
        for(let telecom of practRes.resource.telecom) {
          telecom.value = mixin.updatePhoneNumber(telecom.value)
          caseDetails.urns.push('tel:' + telecom.value)
        }
      }
      if(practRes && practRes.resource.name) {
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
        let levels = eidsrConfig.orgHierarchyLevels
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
          return resolve()
        })
      } else {
        return resolve()
      }
    })
  })
  Promise.all([reporterInfoProm, suspStructProm, diseaseProm]).then(() => {
    //if the request comes with reporter details then use them only if they were not captured in above queries
    if(!eidsrConfig.onlyProvidersCanReport) {
      for(let query in req.query) {
        if(caseDetails.hasOwnProperty(query) && !caseDetails[query]) {
          caseDetails[query] = req.query[query]
        }
      }

      let levels = eidsrConfig.orgHierarchyLevels
      for(let locType in levels) {
        if(req.query[locType] && !caseDetails.reporterLocation[locType]) {
          caseDetails.reporterLocation[locType] = req.query[locType]
        }
      }
    }
    let patientRes = {
      resourceType: "Patient",
      id: uuid4(),
      meta: {
        profile: ["http://mHero.org/fhir/StructureDefinition/mhero-eidsr-patient"]
      },
      extension: [{
        url: "http://mHero.org/fhir/StructureDefinition/mhero-eidsr-suspected-case",
        extension: []
      }]
    };
    if(globalid && mheroentitytype) {
      patientRes.extension[0].extension.push({
        url: 'reporterID',
        valueReference: {
          reference: `${mheroentitytype}/${globalid}`
        }
      });
    }
    for (let fieldIndex in orderedFields) {
      let field = orderedFields[fieldIndex];
      if (!caseData[fieldIndex]) {
        continue;
      }

      macm.populateDataByProfile({
        extensionDefinition: suspectedCaseStruct,
        profileDefinition: patientProfile,
        field,
        fieldValue: caseData[fieldIndex]
      }, (dataValues) => {
        if(Object.keys(dataValues) === 0) {
          return
        }
        if(dataValues.hasOwnProperty(field) && dataValues[field] !== '') {
          patientRes[field] = dataValues[field]
        } else if(dataValues.url) {
          for(let index in patientRes.extension) {
            if(patientRes.extension[index].url === 'http://mHero.org/fhir/StructureDefinition/mhero-eidsr-suspected-case') {
              //if extension already exists then remove it
              for(let extInd in patientRes.extension[index].extension) {
                if(patientRes.extension[index].extension[extInd].url === dataValues.url) {
                  patientRes.extension[index].extension.splice(extInd, 1)
                  break
                }
              }
              patientRes.extension[index].extension.push(dataValues)
            }
          }
        }
      })
    }
    let patBundle = {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [{
        resource: patientRes,
        request: {
          method: 'PUT',
          url: `Patient/${patientRes.id}`,
        }
      }]
    }
    macm.saveResource(patBundle, (err, saveResp, body) => {
      if(err || (saveResp && saveResp.statusCode !== 200 && saveResp.statusCode !== 201)) {
        logger.error(err);
        if(saveResp.statusCode) {
          return res.status(saveResp.statusCode).send();
        }
        return res.status(500).send();
      }
      return res.status(201).json({patientid: patientRes.id});
    });

    //start followup flow
    if(caseDetails.reporterRPId || caseDetails.urns.length > 0) {
      let body = {
        flow: eidsrConfig.followUpFlow,
        params: {patientid: patientRes.id}
      }
      if(caseDetails.reporterRPId) {
        body.contacts = [caseDetails.reporterRPId]
      }
      if(caseDetails.urns) {
        body.urns = caseDetails.urns
      }
      rapidpro.sendMessage(body, 'workflow', 0, (err, rsp) => {
        if(!err && rsp.statusCode && rsp.statusCode == 201) {
          logger.info('Follow up workflow started successfully')
        } else {
          logger.error('Follow up workflow failed to start')
        }
      })
    }
    let notifications = lodash.cloneDeep(eidsrConfig.notifications)
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
    async.series({
      alertGrps: (callback) => {
        if(notifications.groups.length === 0) {
          return callback(null)
        }
        let body = {
          text: notifications.msg,
          groups: []
        }
        async.eachSeries(notifications.groups, (grp, nxt) => {
          body.groups.push(grp)
          if(body.groups.length > 95) {
            let tmpBody = lodash.cloneDeep(body)
            body.groups = []
            rapidpro.sendMessage(tmpBody, 'sms', 0, () => {
              return nxt()
            })
          } else {
            return nxt()
          }
        }, () => {
          if(body.groups.length > 0) {
            rapidpro.sendMessage(body, 'sms', 0, () => {
              logger.info('Finished alerting groups')
              return callback(null)
            })
          } else {
            logger.info('Finished alerting groups')
            return callback(null)
          }
        })
      },
      alertIndividuals: (callback) => {
        if(notifications.individuals.length === 0) {
          return callback(null)
        }
        let resIds = []
        let ids
        let practRes = []
        let promises = []
        for(let index in notifications.individuals) {
          promises.push(new Promise((resolve) => {
            let individual = notifications.individuals[index]
            resIds.push(individual)
            if(resIds.length === 100 || index == (notifications.individuals.length - 1)) {
              ids = resIds.join(',')
              if(ids) {
                macm.getResource({
                  resource: 'Practitioner',
                  query: `_id=${ids}`
                }, (err, resourceData) => {
                  practRes = practRes.concat(resourceData.entry)
                  return resolve()
                })
              }
              ids = ''
              resIds = []
            } else {
              return resolve()
            }
          }))
        }

        Promise.all(promises).then(() => {
          let body = {
            text: notifications.msg
          }
          async.eachSeries(practRes, (res, nxt) => {
            let rapId = res.resource.identifier && res.resource.identifier.find((ident) => {
              return ident.system === "http://app.rapidpro.io/contact-uuid"
            })
            if(rapId) {
              if(!body.contacts) {
                body.contacts = []
              }
              body.contacts.push(rapId.value)
            } else if(res.resource.telecom) {
              for(let telecom of res.resource.telecom) {
                if(!body.urns) {
                  body.urns = []
                }
                telecom.value = mixin.updatePhoneNumber(telecom.value)
                body.urns.push('tel:' + telecom.value)
              }
            }
            let totalRecipients = 0
            if(body.urns) {
              totalRecipients += body.urns.length
            }
            if(body.contacts) {
              totalRecipients += body.contacts.length
            }
            if(totalRecipients > 90) {
              let tmpBody = lodash.cloneDeep(body)
              body = {
                text: notifications.msg
              }
              rapidpro.sendMessage(tmpBody, 'sms', 0, () => {
                return nxt()
              })
            } else {
              return nxt()
            }
          }, () => {
            let totalRecipients = 0
            if(body.urns) {
              totalRecipients += body.urns.length
            }
            if(body.contacts) {
              totalRecipients += body.contacts.length
            }
            if(totalRecipients > 0) {
              rapidpro.sendMessage(body, 'sms', 0, () => {
                logger.info('Finished alerting individuals')
                return callback(null)
              })
            } else {
              logger.info('Finished alerting individuals')
              return callback(null)
            }
          })
        })
      },
      alertDesignation: (callback) => {

      }
    })
  }).catch((err) => {
    logger.error(err);
    return res.status(500).send();
  });
});

router.post('/updateCase', (req, res) => {
  let suspectedCaseStruct;
  let patientProfile
  let patientResource
  if(!req.query.patientid) {
    return res.status(400).send()
  }
  let suspStructProm = new Promise((resolve, reject) => {
    macm.getResource({
      resource: 'StructureDefinition',
      query: "_id=mhero-eidsr-suspected-case,mhero-eidsr-patient"
    }, (err, struct) => {
      let structDef = struct.entry.find((str) => {
        return str.resource.id === 'mhero-eidsr-suspected-case'
      })
      let profile = struct.entry.find((str) => {
        return str.resource.id === 'mhero-eidsr-patient'
      })
      if (structDef) {
        suspectedCaseStruct = structDef.resource;
      } else {
        reject('EIDSR extensions for patient resource is missing')
      }
      if(profile) {
        patientProfile = profile.resource
      } else {
        reject('Patient profile for eidsr is missing')
      }
      return resolve();
    });
  });

  let patientProm = new Promise((resolve, reject) => {
    macm.getResource({
      resource: 'Patient',
      id: req.query.patientid
    }, (err, resource) => {
      patientResource = resource
      if(!patientResource || err) {
        return reject()
      }
      return resolve()
    })
  })

  Promise.all([suspStructProm, patientProm]).then(() => {
    let updated
    for(let query in req.query) {
      macm.populateDataByProfile({
        extensionDefinition: suspectedCaseStruct,
        profileDefinition: patientProfile,
        field: query,
        fieldValue: req.query[query]
      }, (dataValues) => {
        if(Object.keys(dataValues) === 0) {
          return
        }
        if(dataValues.hasOwnProperty(query) && dataValues.query !== '') {
          patientResource[query] = dataValues[query]
          updated = true
        } else if(dataValues.url) {
          if(!patientResource.extension) {
            patientResource.extension = [{
              url: "http://mHero.org/fhir/StructureDefinition/mhero-eidsr-suspected-case",
              extension: []
            }]
          }
          for(let index in patientResource.extension) {
            if(patientResource.extension[index].url === 'http://mHero.org/fhir/StructureDefinition/mhero-eidsr-suspected-case') {
              //if extension already exists then remove it
              for(let extInd in patientResource.extension[index].extension) {
                if(patientResource.extension[index].extension[extInd].url === dataValues.url) {
                  patientResource.extension[index].extension.splice(extInd, 1)
                  break
                }
              }
              patientResource.extension[index].extension.push(dataValues)
            }
          }
          updated = true
        }
      })
    }
    if(!updated) {
      return res.status(400).send()
    }

    let patBundle = {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [{
        resource: patientResource,
        request: {
          method: 'PUT',
          url: `Patient/${patientResource.id}`,
        }
      }]
    }
    macm.saveResource(patBundle, (err, saveResp, body) => {
      if(err || (saveResp && saveResp.statusCode !== 200 && saveResp.statusCode !== 201)) {
        logger.error(err);
        if(saveResp.statusCode) {
          return res.status(saveResp.statusCode).send();
        }
        return res.status(500).send();
      }
      return res.status(200).send();
    });
  }).catch((err) => {
    logger.error(err);
    return res.status(500).send()
  })
})

module.exports = router;