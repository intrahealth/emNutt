'use strict';
const URI = require('urijs');
const request = require('request');
const async = require('async');
const moment = require('moment');
const macm = require('./macm')();
const config = require('./config');
const logger = require('./winston');
const mixin = require('./mixin');
const { delete } = require('request');
module.exports = function () {
  return {
    /**
     *
     * @param {Object} param0
     * @param {*} callback
     */
    syncWorkflows(callback) {
      let processingError = false;
      let runsLastSync = config.get('lastSync:syncWorkflows:time');
      const isValid = moment(runsLastSync, 'Y-MM-DDTHH:mm:ss').isValid();
      if (!isValid) {
        runsLastSync = moment('1970-01-01').format('Y-MM-DDTHH:mm:ss');
      }
      const queries = [{
        name: 'after',
        value: runsLastSync,
      }, ];
      this.getEndPointData({
          endPoint: 'flows.json',
          queries,
        },
        (err, flows) => {
          logger.error(JSON.stringify(flows,0,2));
          if (err) {
            processingError = true;
          }
          macm.rpFlowsToFHIR(flows, (err) => {
            if (err) {
              processingError = true;
            }
            logger.info('Done Synchronizing flows');
            return callback(processingError);
          });
        }
      );
    },
    syncWorkflowRunMessages(callback) {
      const query = '_profile=http://mhero.org/fhir/StructureDefinition/mHeroWorkflows';
      let runsLastSync = moment('1970-01-01').format('Y-MM-DDTHH:mm:ss');
      let processingError = false;
      macm.getResource({
        resource: 'Basic',
        query,
      }, (err, flows) => {
        if (err) {
          processingError = true;
        }
        async.eachSeries(flows.entry, (flow, nxtFlow) => {
          const promise1 = new Promise((resolve) => {
            runsLastSync = config.get('lastSync:syncWorkflowRunMessages:time');
            const isValid = moment(runsLastSync, 'Y-MM-DDTHH:mm:ss').isValid();
            if (!isValid) {
              runsLastSync = moment('1970-01-01').format('Y-MM-DDTHH:mm:ss');
            }
            const queries = [{
              name: 'flow',
              value: flow.resource.id,
            }, {
              name: 'after',
              value: runsLastSync,
            }];
            this.getEndPointData({
              endPoint: 'runs.json',
              queries,
            }, (err, runs) => {
              if (err) {
                processingError = true;
              }
              resolve(runs);
            });
          });
          const promise2 = new Promise((resolve) => {
            const queries = [{
              name: 'flow',
              value: flow.resource.id,
            }];
            this.getEndPointData({
              endPoint: 'definitions.json',
              queries,
              hasResultsKey: false,
            }, (err, definitions) => {
              if (err) {
                processingError = true;
              }
              resolve(definitions);
            });
          });
          Promise.all([promise1, promise2]).then((responses) => {
            const runs = responses[0];
            const definitions = responses[1];
            async.each(runs, (run, nxtRun) => {
              let globalid;
              let entityType;
              let query = `identifier=http://app.rapidpro.io/contact-uuid|${run.contact.uuid}`;
              async.parallel({
                practitioner: (callback) => {
                  macm.getResource({
                    resource: 'Practitioner',
                    query,
                  }, (err, practs) => {
                    if (err) {
                      processingError = true;
                    }
                    if (practs.entry.length > 0) {
                      globalid = practs.entry[0].resource.id;
                      entityType = practs.entry[0].resource.resourceType;
                    }
                    return callback(null);
                  });
                },
                patient: (callback) => {
                  macm.getResource({
                    resource: 'Patient',
                    query,
                  }, (err, pat) => {
                    if (err) {
                      processingError = true;
                    }
                    if (pat.entry.length > 0) {
                      globalid = pat.entry[0].resource.id;
                      entityType = pat.entry[0].resource.resourceType;
                    }
                    return callback(null);
                  });
                },
                person: (callback) => {
                  macm.getResource({
                    resource: 'Person',
                    query,
                  }, (err, pers) => {
                    if (err) {
                      processingError = true;
                    }
                    if (pers.entry.length > 0) {
                      globalid = pers.entry[0].resource.id;
                      entityType = pers.entry[0].resource.resourceType;
                    }
                    return callback(null);
                  });
                }
              }, () => {
                if (globalid) {
                  run.contact.globalid = globalid;
                  run.contact.mheroentitytype = entityType;
                  if (err) {
                    processingError = true;
                  }
                  logger.info('Creating communication resources from flow runs');
                  macm.createCommunicationsFromRPRuns(run, definitions[0], (err) => {
                    logger.info('Done creating communication resources from flow runs');
                    if (err) {
                      processingError = true;
                    }
                    return nxtRun();
                  });
                } else {
                  return nxtRun();
                }
              });
            }, () => {
              return nxtFlow();
            });
          });
        }, () => {
          return callback(processingError);
        });
      });
    },

    syncContacts(bundle, callback) {
      let failed = false;
      this.getEndPointData({
        endPoint: 'contacts.json',
      }, (err, rpContacts) => {
        let bundleModified = false;
        async.eachOf(bundle.entry, (entry, index, nxtEntry) => {
          this.addContact({
            contact: entry.resource,
            rpContacts,
          }, (err, response, body) => {
            if (err) {
              failed = true;
              return nxtEntry();
            }
            const rpUUID = body.uuid;
            if (rpUUID) {
              bundleModified = true;
              if (!bundle.entry[index].resource.identifier) {
                bundle.entry[index].resource.identifier = [];
              }
              let totalId =
                bundle.entry[index].resource.identifier.length;
              let totalDeleted = 0;
              for (let idIndex = 0; idIndex < totalId; idIndex++) {
                let modifiedIndex = idIndex - totalDeleted;
                let identifier =
                  bundle.entry[index].resource.identifier[modifiedIndex];
                if (identifier.system === 'http://app.rapidpro.io/contact-uuid') {
                  bundle.entry[index].resource.identifier.splice(modifiedIndex, 1);
                  totalDeleted++;
                }
              }
              bundle.entry[index].resource.identifier.push({
                system: 'http://app.rapidpro.io/contact-uuid',
                value: rpUUID,
              });
              bundle.entry[index].request = {
                method: 'PUT',
                url: `${bundle.entry[index].resource.resourceType}/${bundle.entry[index].resource.id}`,
              };
            }
            return nxtEntry();
          });
        }, () => {
          return callback(failed, bundleModified);
        });
      });
    },

    POSContactGroupsSync(callback) {
      let failed = false;
      logger.info('Received a request to sync POS Contacts Groups');
      let runsLastSync = config.get('lastSync:syncContactsGroups:time');
      const isValid = moment(runsLastSync, 'Y-MM-DD').isValid();
      if (!isValid) {
        runsLastSync = moment('1970-01-01').format('Y-MM-DD');
      }
      let modifiedGroups = {
        resourceType: 'Bundle',
        type: 'batch',
        entry: [],
      };
      macm.getResource({
        resource: 'Group',
        query: `_include=Group:member&_lastUpdated=ge${runsLastSync}`,
      }, (err, resourceData) => {
        if (err) {
          failed = true;
          return callback(failed);
        }
        let groups = resourceData.entry.filter((entry) => {
          return entry.resource.resourceType === 'Group';
        });
        let people = resourceData.entry.filter((entry) => {
          return (
            entry.resource.resourceType === 'Practitioner' ||
            entry.resource.resourceType === 'Patient' ||
            entry.resource.resourceType === 'Person'
          );
        });
        async.eachSeries(people, (ppl, nxt) => {
          let cancelSync = false;
          let cntctuuid;
          let persIdentifier = ppl.resource.identifier && ppl.resource.identifier.find((identifier) => {
            return (identifier.system === 'http://app.rapidpro.io/contact-uuid');
          });
          if (!persIdentifier) {
            return nxt();
          }
          let resourceType = ppl.resource.resourceType;
          if (resourceType === 'Person') {
            resourceType = 'Practitioner';
          }
          cntctuuid = persIdentifier.value;
          let cntctgrps = groups.filter((group) => {
            return group.resource.member && group.resource.member.find((member) => {
              return (member.entity.reference === resourceType + '/' + ppl.resource.id);
            });
          });
          let rpcontact = {
            groups: [],
          };
          let promises = [];
          for (let cntctgrp of cntctgrps) {
            if (cancelSync) {
              continue;
            }
            promises.push(new Promise((resolve) => {
              let grpuuid;
              let identifier =
                cntctgrp.resource.identifier &&
                cntctgrp.resource.identifier.find((identifier) => {
                  return (identifier.system === 'http://app.rapidpro.io/group-uuid');
                });
              if (!identifier) {
                let modifiedGroup = modifiedGroups.entry.find((entry) => {
                  return (
                    entry.resource.identifier &&
                    entry.resource.identifier.find((identifier) => {
                      return (identifier.system === 'http://app.rapidpro.io/group-uuid');
                    })
                  );
                });
                if (modifiedGroup) {
                  identifier =
                    modifiedGroup.resource.identifier &&
                    modifiedGroup.resource.identifier.find((identifier) => {
                      return (identifier.system === 'http://app.rapidpro.io/group-uuid');
                    });
                }
              }
              let checkUUID = new Promise((resolve) => {
                if (identifier) {
                  grpuuid = identifier.value;
                  resolve();
                } else {
                  this.getOrAddGroup(cntctgrp.resource.name, (err, resp) => {
                    if (err) {
                      cancelSync = true;
                      failed = true;
                    } else {
                      grpuuid = resp.uuid;
                      if (!cntctgrp.resource.identifier) {
                        cntctgrp.resource.identifier = [];
                      }
                      let totalId = cntctgrp.resource.identifier.length;
                      let totalDeleted = 0;
                      for (let idIndex = 0; idIndex < totalId; idIndex++) {
                        let modifiedIndex = idIndex - totalDeleted;
                        let identifier =
                          cntctgrp.resource.identifier[modifiedIndex];
                        if (identifier.system === 'http://app.rapidpro.io/group-uuid') {
                          cntctgrp.resource.identifier.splice(modifiedIndex, 1);
                          totalDeleted++;
                        }
                      }
                      cntctgrp.resource.identifier.push({
                        system: 'http://app.rapidpro.io/group-uuid',
                        value: resp.uuid,
                      });
                      modifiedGroups.entry.push({
                        resource: cntctgrp.resource,
                        request: {
                          method: 'PUT',
                          url: cntctgrp.resource.resourceType + '/' + cntctgrp.resource.id,
                        },
                      });
                    }
                    resolve();
                  });
                }
              });
              checkUUID.then(() => {
                if (!grpuuid || cancelSync) {
                  return resolve();
                }
                rpcontact.groups.push(grpuuid);
                resolve();
              }).catch((err) => {
                logger.error(err);
                cancelSync = true;
                failed = true;
                resolve();
              });
            }));
          }
          Promise.all(promises).then(() => {
            if (cancelSync) {
              failed = true;
              return nxt();
            }
            this.updateContact({
              uuid: cntctuuid,
              fields: rpcontact,
            }, (err) => {
              if (err) {
                failed = true;
              }
              return nxt();
            });
          });
        }, () => {
          macm.saveResource(modifiedGroups, (err) => {
            if (err) {
              failed = true;
            }
            return callback(failed);
          });
        });
      });
    },

    RPContactGroupsSync(callback) {
      let runsLastSync = config.get('lastSync:syncContactsGroups:time');
      const isValid = moment(runsLastSync, 'Y-MM-DD').isValid();
      if (!isValid) {
        runsLastSync = moment('1970-01-01').format('Y-MM-DD');
      }
      logger.info('Received a request to sync contact groups from rapidpro to POS');
      let failed = false;
      const bundle = {};
      bundle.resourceType = 'Bundle';
      bundle.type = 'batch';
      bundle.entry = [];
      const queries = [{
        name: 'after',
        value: runsLastSync,
      }, ];
      this.getEndPointData({
        endPoint: 'contacts.json',
        queries,
      }, (err, RPContacts) => {
        if (err) {
          logger.error(err);
          failed = true;
          return callback(failed);
        }
        logger.info('Processing ' + RPContacts.length + ' Contacts');
        async.eachSeries(RPContacts, (contact, nxt) => {
          if (!contact.fields.globalid) {
            return nxt();
          }
          let addToGroup = new Promise((resolve) => {
            if (contact.groups.length === 0) {
              let editedGrps = [];
              for (let index in bundle.entry) {
                let entry = bundle.entry[index];
                let totalDeleted = 0;
                let totalElements = entry.resource.member.length;
                for (let memberIndex = 0; memberIndex < totalElements; memberIndex++) {
                  let modifiedIndex = memberIndex - totalDeleted;
                  let member = entry.resource.member[modifiedIndex];
                  if (member.entity.reference === `${contact.fields.mheroentitytype}/${contact.fields.globalid}`) {
                    bundle.entry[index].resource.member.splice(modifiedIndex, 1);
                    editedGrps.push(entry.resource.id);
                    totalDeleted++;
                  }
                }
              }
              macm.getResource({
                resource: 'Group',
                query: `member=${contact.fields.mheroentitytype}/${contact.fields.globalid}`,
              }, (err, grpRsrc) => {
                if (err) {
                  failed = true;
                  return resolve();
                }
                if (grpRsrc.entry.length === 0) {
                  return resolve();
                }
                for (let group of grpRsrc.entry) {
                  let processed = editedGrps.find((edited) => {
                    return edited === group.resource.id;
                  });
                  if (processed) {
                    continue;
                  }
                  for (let index in group.resource.member) {
                    let member = group.resource.member[index];
                    if (member.entity.reference === `${contact.fields.mheroentitytype}/${contact.fields.globalid}`) {
                      group.resource.member.splice(index, 1);
                      bundle.entry.push({
                        resource: group.resource,
                        request: {
                          method: 'PUT',
                          url: 'Group/' + group.resource.id,
                        },
                      });
                    }
                  }
                }
                return resolve();
              });
            } else {
              async.each(contact.groups, (grp, nxtGrp) => {
                let found = false;
                for (let index in bundle.entry) {
                  let entry = bundle.entry[index];
                  if (entry.resource.id === grp.uuid) {
                    found = true;
                    let exist = bundle.entry[index].resource.member.find((member) => {
                      return (member.entity.reference === `${contact.fields.mheroentitytype}/${contact.fields.globalid}`);
                    });
                    if (!exist) {
                      bundle.entry[index].resource.member.push({
                        entity: {
                          reference: `${contact.fields.mheroentitytype}/${contact.fields.globalid}`,
                        },
                      });
                    }
                    break;
                  }
                }
                if (found) {
                  return nxtGrp();
                }
                macm.getResource({
                  resource: 'Group',
                  id: grp.uuid,
                }, (err, grpRsrc) => {
                  if (err && err != 404 && err != 410) {
                    failed = true;
                    return nxtGrp();
                  }
                  if (grpRsrc && err != 404 && err != 410) {
                    if (!grpRsrc.member) {
                      grpRsrc.member = [];
                    }
                    let exist = grpRsrc.member.find((member) => {
                      return (
                        member.entity.reference ===
                        `${contact.fields.mheroentitytype}/${contact.fields.globalid}`
                      );
                    });
                    if (!exist) {
                      grpRsrc.member.push({
                        entity: {
                          reference: `${contact.fields.mheroentitytype}/${contact.fields.globalid}`,
                        },
                      });
                    }
                    bundle.entry.push({
                      resource: grpRsrc,
                      request: {
                        method: 'PUT',
                        url: 'Group/' + grpRsrc.id,
                      },
                    });
                  } else {
                    bundle.entry.push({
                      resource: {
                        resourceType: 'Group',
                        id: grp.uuid,
                        name: grp.name,
                        type: 'practitioner',
                        actual: true,
                        member: [{
                          entity: {
                            reference: `${contact.fields.mheroentitytype}/${contact.fields.globalid}`,
                          },
                        }],
                      },
                      request: {
                        method: 'PUT',
                        url: 'Group/' + grp.uuid,
                      },
                    });
                  }
                  return nxtGrp();
                });
              }, () => {
                return resolve();
              });
            }
          });
          addToGroup.then(() => {
            return nxt();
          });
        }, () => {
          if (bundle.entry.length > 0) {
            macm.saveResource(bundle, () => {
              return callback(failed);
            });
          } else {
            return callback(failed);
          }
        });
      });
    },

    getOrAddGroup(name, callback) {
      let queries = [{
        name: 'name',
        value: name,
      }, ];
      this.getEndPointData({
        endPoint: 'groups.json',
        queries,
      }, (err, data) => {
        if (data.length > 0) {
          return callback(false, data[0]);
        } else {
          let body = {
            name,
          };
          let url = URI(config.get('rapidpro:baseURL'))
            .segment('api')
            .segment('v2')
            .segment('groups.json');
          url = url.toString();
          const options = {
            url,
            headers: {
              Authorization: `Token ${config.get('rapidpro:token')}`,
            },
            json: body,
          };
          request.post(options, (err, res, body) => {
            if (
              !err &&
              res.statusCode &&
              (res.statusCode < 200 || res.statusCode > 399)
            ) {
              err = 'An error occured while adding a contact, Err Code ' + res.statusCode;
            }
            logger.info(body);
            if (err) {
              logger.error(err);
            }
            return callback(err, body);
          });
        }
      });
    },

    addContact({
      contact,
      rpContacts
    }, callback) {
      if (!Array.isArray(rpContacts)) {
        return callback(true);
      }
      let urns = generateURNS(contact);
      const rpContactWithGlobalid = rpContacts.find((cntct) => {
        return (
          cntct.fields &&
          cntct.fields.globalid === contact.id
        );
      });
      const rpContactWithoutGlobalid = rpContacts.find((cntct) => {
        return cntct.urns.find((urn) => {
          return urns.includes(urn);
        });
      });
      let body = {};
      let fullName;
      if (Array.isArray(contact.name) && contact.name.length > 0) {
        const name = contact.name[0];
        if (name.text) {
          fullName = name.text;
        } else {
          if (name.given) {
            fullName = name.given;
          }
          if (name.family) {
            fullName += ' ' + name.family;
          }
        }
      }
      if (!rpContactWithGlobalid && !rpContactWithoutGlobalid) {
        body.name = fullName;
        body.fields = {};
        let resourceType = 'Practitioner';
        if (contact.resourceType === 'Patient') {
          resourceType = contact.resourceType;
        }
        body.fields.globalid = contact.id;
        body.fields.mheroentitytype = contact.resourceType;

        body.urns = urns;
      } else {
        if (rpContactWithGlobalid) {
          body.uuid = rpContactWithGlobalid.uuid;
          body.name = rpContactWithGlobalid.name;
          body.urns = rpContactWithGlobalid.urns;
          body.fields = rpContactWithGlobalid.fields;
        } else {
          body.uuid = rpContactWithoutGlobalid.uuid;
          body.name = rpContactWithoutGlobalid.name;
          body.urns = rpContactWithoutGlobalid.urns;
          body.fields = rpContactWithoutGlobalid.fields;
        }
        body.name = fullName;
        urns = body.urns.concat(urns);
        // ensure urns are unique
        const urnsSet = new Set(urns);
        urns = [...urnsSet];
        // end of ensuring urns are unique
        body.urns = urns;
        if (rpContactWithoutGlobalid && !rpContactWithGlobalid) {
          body.fields.globalid = contact.id;
          body.fields.mheroentitytype = contact.resourceType;
        }
        if(!body.fields.mheroentitytype) {
          body.fields.mheroentitytype = contact.resourceType;
        }
      }
      if (body.urns.length === 0) {
        return callback(true);
      }
      let url = URI(config.get('rapidpro:baseURL'))
        .segment('api')
        .segment('v2')
        .segment('contacts.json');
      if (body.uuid) {
        url.addQuery('uuid', body.uuid);
      }
      url = url.toString();
      const options = {
        url,
        headers: {
          Authorization: `Token ${config.get('rapidpro:token')}`,
        },
        json: body,
      };
      request.post(options, (err, res, respBody) => {
        if (!err && res.statusCode && (res.statusCode < 200 || res.statusCode > 399)) {
          err = 'An error occured while adding a contact, Err Code ' + res.statusCode;
        }
        if (err) {
          logger.error(JSON.stringify(body, 0, 2));
          logger.error(err + ' ' + url);
          logger.error(JSON.stringify(respBody, 0, 2));
        } else {
          logger.info(JSON.stringify(respBody, 0, 2));
        }
        return callback(err, res, respBody);
      });
    },
    updateContact({
      uuid,
      fields
    }, callback) {
      let url = URI(config.get('rapidpro:baseURL'))
        .segment('api')
        .segment('v2')
        .segment('contacts.json')
        .addQuery('uuid', uuid);
      url = url.toString();
      const options = {
        url,
        headers: {
          Authorization: `Token ${config.get('rapidpro:token')}`,
        },
        json: fields,
      };
      request.post(options, (err, res, body) => {
        if (
          !err &&
          res.statusCode &&
          (res.statusCode < 200 || res.statusCode > 399)
        ) {
          err =
            'An error occured while updating a contact, Err Code ' +
            res.statusCode;
        }
        logger.info(body);
        if (err) {
          logger.error(err);
        }
        return callback(err, res, body);
      });
    },
    processCommunications(commReqs, callback) {
      let processingError = false;
      let sendFailed = false;
      logger.info(`Processing ${commReqs.entry.length} communication requests`);
      const promise = new Promise((resolve, reject) => {
        if (!config.get('rapidpro:syncAllContacts')) {
          this.getEndPointData({
            endPoint: 'contacts.json',
          }, (err, rpContacts) => {
            if (err) {
              processingError = true;
              logger.error(
                'An error has occured while getting rapidpro contacts, checking communication requests has been stopped'
              );
              return res.status(500).send('An error has occured while getting rapidpro contacts, checking communication requests has been stopped');
            }
            resolve(rpContacts);
          });
        } else {
          return resolve([]);
        }
      });

      promise.then((rpContacts) => {
        async.each(commReqs.entry, (commReq, nxtComm) => {
          let msg;
          const workflows = [];
          for (const payload of commReq.resource.payload) {
            if (payload.contentString) {
              msg = payload.contentString;
            }
            if (payload.contentAttachment && payload.contentAttachment.url) {
              workflows.push(payload.contentAttachment.url);
            }
          }
          if (!msg) {
            for (const payload of commReq.resource.payload) {
              if (
                payload.contentAttachment &&
                payload.contentAttachment.title
              ) {
                msg = payload.contentAttachment.title;
              }
            }
          }

          if (!msg && workflows.length === 0) {
            logger.warn(`No message/workflow found for communication request ${commReq.resource.resourceType}/${commReq.resource.id}`);
            return nxtComm();
          }
          const recipients = [];
          const recPromises = [];
          for (const recipient of commReq.resource.recipient) {
            recPromises.push(new Promise((resolve) => {
              if (recipient.reference) {
                let resource;
                const promise1 = new Promise((resolve1) => {
                  if (recipient.reference.startsWith('#')) {
                    if (commReq.resource.contained) {
                      const contained = commReq.resource.contained.find((contained) => {
                        return (contained.id === recipient.reference.substring(1));
                      });
                      if (contained) {
                        resource = {
                          resource: contained,
                        };
                      } else {
                        logger.error(`Recipient refers to a # (${recipient.reference}) but was not found on the contained element for a resource ${commReq.resource.resourceType}/${commReq.resource.id}`);
                      }
                    } else {
                      logger.error(`Recipient refers to a # but resource has no contained element ${commReq.resource.resourceType}/${commReq.resource.id}`);
                    }
                    resolve1();
                  } else {
                    let recArr = recipient.reference.split('/');
                    const [resourceName, resID] = recArr;
                    macm.getResource({
                      resource: resourceName,
                      id: resID,
                    }, (err, recResource) => {
                      if (recResource.resourceType && recResource.resourceType !== 'OperationOutcome') {
                        resource = recResource;
                      } else if (Object.keys(recResource).length === 0) {
                        logger.error(
                          `Reference ${recipient.reference} was not found on the server`
                        );
                        processingError = true;
                      } else if (err) {
                        logger.error(err);
                        logger.error(
                          'An error has occured while getting resource ' +
                          recipient.reference
                        );
                        processingError = true;
                      }
                      resolve1();
                    });
                  }
                });
                promise1.then(() => {
                  if (resource) {
                    if (
                      resource.telecom &&
                      Array.isArray(resource.telecom) &&
                      resource.telecom.length > 0
                    ) {
                      for (const telecom of resource.telecom) {
                        if (
                          telecom.system &&
                          telecom.system === 'phone'
                        ) {
                          telecom.value = mixin.updatePhoneNumber(telecom.value);
                          if (!mixin.validatePhone(telecom.value)) {
                            logger.error('Phone number ' + telecom.value + ' is not valid');
                            continue;
                          }
                          recipients.push({
                            urns: 'tel:' + telecom.value,
                            id: resource.id,
                          });
                        }
                      }
                    } else {
                      logger.warn('No contact found for resource id ' + resource.resourceType + '/' + resource.id + ' Workflow wont be started for this');
                    }
                  }
                  if (
                    resource &&
                    !config.get('rapidpro:syncAllContacts')
                  ) {
                    this.addContact({
                      contact: resource,
                      rpContacts,
                    }, (err, res, body) => {
                      if (!err) {
                        const rpUUID = body.uuid;
                        if (rpUUID) {
                          if (!resource.identifier) {
                            resource.identifier = [];
                          }
                          resource.identifier.push({
                            system: 'http://app.rapidpro.io/contact-uuid',
                            value: rpUUID,
                          });
                          const bundle = {};
                          bundle.type = 'batch';
                          bundle.resourceType = 'Bundle';
                          bundle.entry = [{
                            resource: resource,
                            request: {
                              method: 'PUT',
                              url: `${resource.resourceType}/${resource.id}`,
                            },
                          }, ];
                          macm.saveResource(bundle, () => {});
                        }
                      }
                      resolve();
                    });
                  } else {
                    resolve();
                  }
                }).catch((err) => {
                  processingError = true;
                  logger.error(err);
                  resolve();
                  throw err;
                });
              } else {
                resolve();
              }
            }));
          }
          Promise.all(recPromises).then(() => {
            async.parallel({
              startFlow: (callback) => {
                if (workflows.length > 0) {
                  let createNewReq = false;
                  let counter = 0;
                  for (const workflow of workflows) {
                    logger.info('Starting workflow ' + workflow);
                    if (counter > 0) {
                      createNewReq = true;
                    }
                    counter += 1;
                    const flowBody = {};
                    flowBody.flow = workflow;
                    flowBody.urns = [];
                    let ids = [];
                    const promises = [];
                    for (const recipient of recipients) {
                      promises.push(
                        new Promise((resolve) => {
                          flowBody.urns.push(recipient.urns);
                          ids.push(recipient.id);
                          if (flowBody.urns.length > 90) {
                            const tmpFlowBody = {
                              ...flowBody,
                            };
                            const tmpIds = [...ids];
                            ids = [];
                            flowBody.urns = [];
                            this.sendMessage(tmpFlowBody, 'workflow', (err, res, body) => {
                              if (err) {
                                logger.error(
                                  'An error has occured while starting a workflow'
                                );
                                logger.error(err);
                                sendFailed = true;
                                processingError = true;
                              }
                              if (
                                res.statusCode &&
                                (res.statusCode < 200 ||
                                  res.statusCode > 299)
                              ) {
                                sendFailed = true;
                                processingError = true;
                                logger.error('Send Message Err Code ' + res.statusCode);
                              }
                              if (!sendFailed) {
                                this.updateCommunicationRequest(commReq, body, 'workflow', tmpIds, createNewReq, (err, res, body) => {
                                  resolve();
                                });
                              } else {
                                resolve();
                              }
                            });
                            createNewReq = true;
                          }
                          resolve();
                        })
                      );
                    }
                    Promise.all(promises).then(() => {
                      if (flowBody.urns.length > 0) {
                        this.sendMessage(flowBody, 'workflow', (err, res, body) => {
                          if (err) {
                            logger.error(err);
                            sendFailed = true;
                            processingError = true;
                          }
                          if (
                            res.statusCode &&
                            (res.statusCode < 200 ||
                              res.statusCode > 299)
                          ) {
                            sendFailed = true;
                            processingError = true;
                          }
                          if (!sendFailed) {
                            this.updateCommunicationRequest(commReq, body, 'workflow', ids, createNewReq, (err, res, body) => {
                              return callback(null);
                            });
                          } else {
                            return callback(null);
                          }
                        });
                      } else {
                        return callback(null);
                      }
                    }).catch((err) => {
                      throw err;
                    });
                  }
                } else {
                  return callback(null);
                }
              },
              sendSMS: (callback) => {
                if (!msg) {
                  return callback(null);
                }
                const smsBody = {};
                smsBody.text = msg;
                smsBody.urns = [];
                let ids;
                const promises = [];
                let createNewReq = false;
                for (const recipient of recipients) {
                  promises.push(new Promise((resolve) => {
                    smsBody.urns.push(recipient);
                    if (smsBody.urns.length > 90) {
                      const tmpSmsBody = {
                        ...smsBody,
                      };
                      const tmpIds = [...ids];
                      ids = [];
                      smsBody.urns = [];
                      this.sendMessage(tmpSmsBody, 'sms', (err, res, body) => {
                        if (err) {
                          logger.error(err);
                          sendFailed = true;
                          processingError = true;
                        }
                        if (
                          (res.statusCode && res.statusCode < 200) ||
                          res.statusCode > 299
                        ) {
                          sendFailed = true;
                          processingError = true;
                        }
                        if (!sendFailed) {
                          this.updateCommunicationRequest(commReq, body, 'sms', tmpIds, createNewReq, (err, res, body) => {
                            resolve();
                          });
                        } else {
                          resolve();
                        }
                      });
                      createNewReq = true;
                    }
                    resolve();
                  }));
                }
                Promise.all(promises).then(() => {
                  if (smsBody.urns.length > 0) {
                    this.sendMessage(smsBody, 'sms', (err, res, body) => {
                      if (err) {
                        logger.error(err);
                        sendFailed = true;
                        processingError = true;
                      }
                      if (
                        res.statusCode &&
                        (res.statusCode < 200 || res.statusCode > 299)
                      ) {
                        sendFailed = true;
                        processingError = true;
                      }
                      if (!sendFailed) {
                        this.updateCommunicationRequest(commReq, body, 'sms', ids, createNewReq, (err, res, body) => {
                          return callback(null);
                        });
                      } else {
                        return callback(null);
                      }
                    });
                  } else {
                    return callback(null);
                  }
                }).catch((err) => {
                  processingError = true;
                  throw err;
                });
              },
            }, () => {
              return nxtComm();
            });
          }).catch((err) => {
            processingError = true;
            logger.error(err);
            throw err;
          });
        }, () => {
          return callback(processingError);
        });
      });
    },

    sendMessage(flowBody, type, callback) {
      let endPoint;
      if (type === 'sms') {
        endPoint = 'broadcasts.json';
      } else if (type === 'workflow') {
        endPoint = 'flow_starts.json';
      } else {
        logger.error('Cant determine the message type ' + type);
        return callback(true);
      }
      const url = URI(config.get('rapidpro:baseURL'))
        .segment('api')
        .segment('v2')
        .segment(endPoint)
        .toString();
      const options = {
        url,
        headers: {
          Authorization: `Token ${config.get('rapidpro:token')}`,
        },
        json: flowBody,
      };
      request.post(options, (err, res, body) => {
        if (err) {
          logger.error(err);
          return callback(err);
        }
        this.isThrottled(body, (wasThrottled) => {
          if (wasThrottled) {
            this.sendMessage(flowBody, type, (err, res, body) => {
              return callback(err, res, body);
            });
          } else {
            logger.info(JSON.stringify(body, 0, 2));
            return callback(err, res, body);
          }
        });
      });
    },

    isThrottled(results, callback) {
      if (results === undefined || results === null || results === '') {
        logger.error(
          'An error has occured while checking throttling,empty rapidpro results were submitted'
        );
        return callback(true);
      }
      if (Object.prototype.hasOwnProperty.call(results, 'detail')) {
        var detail = results.detail.toLowerCase();
        if (detail.indexOf('throttled') != -1) {
          var detArr = detail.split(' ');
          async.eachSeries(
            detArr,
            (det, nxtDet) => {
              if (!isNaN(det)) {
                // add 5 more seconds on top of the wait time expected by rapidpro then convert to miliseconds
                var wait_time = parseInt(det) * 1000 + 5;
                logger.warn(
                  'Rapidpro has throttled my requests,i will wait for ' +
                  wait_time / 1000 +
                  ' Seconds Before i proceed,please dont interrupt me'
                );
                setTimeout(function () {
                  return callback(true);
                }, wait_time);
              } else return nxtDet();
            },
            function () {
              return callback(false);
            }
          );
        } else return callback(false);
      } else {
        callback(false);
      }
    },

    updateCommunicationRequest(
      commReq,
      rpRunStatus,
      type,
      ids,
      createNewReq,
      callback
    ) {
      logger.info(
        'Updating communication request ' +
        commReq.resource.id +
        ' to completed'
      );
      let extUrl;
      if (type === 'sms') {
        extUrl =
          'http://mhero.org/fhir/StructureDefinition/mHeroBroadcastStarts';
      } else if (type === 'workflow') {
        extUrl = 'http://mhero.org/fhir/StructureDefinition/mHeroFlowStarts';
      }
      commReq.resource.id = rpRunStatus.uuid;
      if (!commReq.resource.meta) {
        commReq.resource.meta = {};
      }
      if (!commReq.resource.meta.profile) {
        commReq.resource.meta.profile = [];
      }
      commReq.resource.meta.profile.push('http://mhero.org/fhir/StructureDefinition/mHeroCommunicationRequest');
      if (!commReq.resource.extension) {
        commReq.resource.extension = [];
      }
      commReq.resource.status = 'completed';
      let extIndex = 0;
      for (const index in commReq.resource.extension) {
        const ext = commReq.resource.extension[index];
        if (ext.url === extUrl) {
          extIndex = index;
          break;
        }
      }

      commReq.resource.extension[extIndex] = {
        url: extUrl,
        extension: [{
          url: 'created_on',
          valueDateTime: rpRunStatus.created_on,
        }],
      };
      if (type === 'workflow') {
        commReq.resource.extension[extIndex].extension.push({
          url: 'modified_on',
          valueDateTime: rpRunStatus.modified_on,
        }, {
          url: 'flow_uuid',
          valueString: rpRunStatus.flow.uuid,
        }, {
          url: 'status',
          valueString: rpRunStatus.status,
        }, {
          url: 'flow_starts_uuid',
          valueString: rpRunStatus.uuid,
        });
      } else if (type === 'sms') {
        commReq.resource.extension[extIndex].extension.push({
          url: "broadcast_id",
          valueString: rpRunStatus.id
        });
      }
      for (const id of ids) {
        commReq.resource.extension;
        [extIndex].extension.push({
          url: 'contact_globalid',
          valueString: id
        });
      }

      const bundle = {};
      bundle.type = 'batch';
      bundle.resourceType = 'Bundle';
      bundle.entry = [{
        resource: commReq.resource,
        request: {
          method: 'PUT',
          url: `CommunicationRequest/${commReq.resource.id}`,
        },
      }, ];
      macm.saveResource(bundle, (err, res, body) => {
        return callback(err, res, body);
      });
    },

    /**
     *
     * @param {Array} queries // i.e [{uuid: 'aa9e1550-d913-435e-2lec-k856bb9ec349'}]
     * @param {*} callback
     */
    getEndPointData({
        queries,
        url,
        endPoint,
        hasResultsKey = true
      },
      callback
    ) {
      if (!url) {
        url = URI(config.get('rapidpro:baseURL'))
          .segment('api')
          .segment('v2')
          .segment(endPoint);
        if (queries && Array.isArray(queries)) {
          for (const query of queries) {
            if (
              !Object.prototype.hasOwnProperty.call(query, 'name') ||
              !Object.prototype.hasOwnProperty.call(query, 'value')
            ) {
              logger.error('Query must have name and value');
              continue;
            }
            url = url.addQuery(query.name, query.value);
          }
        }
        url = url.toString();
      }
      // need to make this variable independent of this function so that to handle throttled
      logger.info(
        `Getting data for end point ${endPoint} from server ${config.get(
          'rapidpro:baseURL'
        )}`
      );
      var endPointData = [];
      async.whilst(
        (callback) => {
          return callback(null, url !== false);
        },
        (callback) => {
          const options = {
            url,
            headers: {
              Authorization: `Token ${config.get('rapidpro:token')}`,
            },
          };
          request.get(options, (err, res, body) => {
            if (err) {
              logger.error(err);
              return callback(err);
            }
            this.isThrottled(JSON.parse(body), (wasThrottled) => {
              if (wasThrottled) {
                // reprocess this contact
                this.getEndPointData({
                    queries,
                    url,
                    endPoint,
                  },
                  (err, data) => {
                    if (Array.isArray(data)) {
                      endPointData = endPointData.concat(data);
                    }
                    if (err) {
                      return callback(err);
                    }
                    return callback(null);
                  }
                );
              } else {
                body = JSON.parse(body);
                if (
                  hasResultsKey &&
                  !Object.prototype.hasOwnProperty.call(body, 'results')
                ) {
                  logger.error(JSON.stringify(body));
                  logger.error(
                    `An error occured while fetching end point data ${endPoint} from rapidpro`
                  );
                  return callback(true);
                }
                if (body.next) {
                  url = body.next;
                } else {
                  url = false;
                }
                if (hasResultsKey) {
                  endPointData = endPointData.concat(body.results);
                } else {
                  endPointData.push(body);
                }
                return callback(null, url);
              }
            });
          });
        }, (err) => {
          logger.info(
            `Done Getting data for end point ${endPoint} from server ${config.get(
              'rapidpro:baseURL'
            )}`
          );
          return callback(err, endPointData);
        }
      );
    },
  };
};

function generateURNS(resource) {
  const urns = [];
  if (
    resource.telecom &&
    Array.isArray(resource.telecom) &&
    resource.telecom.length > 0
  ) {
    for (const telecom of resource.telecom) {
      if (telecom.system && telecom.system === 'phone') {
        telecom.value = mixin.updatePhoneNumber(telecom.value);
        if (!telecom.value.startsWith('+')) {
          logger.error(
            'Phone number ' + telecom.value + ' has no country code'
          );
          continue;
        }
        if (!mixin.validatePhone(telecom.value)) {
          logger.error('Phone number ' + telecom.value + ' is not valid');
          continue;
        }
        urns.push('tel:' + telecom.value);
      }
    }
  }
  return urns;
}