'use strict';
const uuid4 = require('uuid/v4');
const URI = require('urijs');
const request = require('request');
const async = require('async');
const isJSON = require('is-json');
const logger = require('./winston');
const config = require('./config');
module.exports = function () {
  return {
    rpFlowsToFHIR (flows, callback) {
      const promises = [];
      let saveBundleFlows = {
        id: uuid4(),
        resourceType: 'Bundle',
        type: 'batch',
        entry: [],
      };
      for (const flow of flows) {
        promises.push(
          new Promise((resolve, reject) => {
            const resource = {};
            resource.id = flow.uuid;
            resource.resourceType = 'Basic';
            resource.meta = {};
            resource.meta.profile = [];
            resource.meta.profile.push(
              'http://mhero.org/fhir/StructureDefinition/mHeroWorkflows'
            );
            resource.meta.code = {
              coding: [{
                system: 'http://mhero.org/fhir/CodeSystem/mhero-resource',
                code: 'mHeroWorkflows',
              },],
              text: 'mHeroWorkflows',
            };
            resource.extension = [{
              url: 'http://mhero.org/fhir/StructureDefinition/mHeroWorkflowsDetails',
              extension: [{
                url: 'name',
                valueString: flow.name,
              },
              {
                url: 'uuid',
                valueString: flow.uuid,
              },
              {
                url: 'type',
                valueString: flow.type,
              },
              {
                url: 'archived',
                valueBoolean: flow.archived,
              },
              {
                url: 'expires',
                valueInteger: flow.expires,
              },
              {
                url: 'http://mhero.org/fhir/StructureDefinition/mHeroWorkflowsRuns',
                extension: [{
                  url: 'active',
                  valueInteger: flow.runs.active,
                },
                {
                  url: 'completed',
                  valueInteger: flow.runs.completed,
                },
                {
                  url: 'interrupted',
                  valueInteger: flow.runs.interrupted,
                },
                {
                  url: 'expired',
                  valueInteger: flow.runs.expired,
                },
                ],
              },
              {
                url: 'created_on',
                valueString: flow.created_on,
              },
              {
                url: 'modified_on',
                valueString: flow.modified_on,
              },
              ],
            },];
            saveBundleFlows.entry.push({
              resource,
              request: {
                method: 'PUT',
                url: `Basic/${resource.id}`,
              },
            });
            if (saveBundleFlows.entry.length >= 250) {
              const tmpBundle = {
                ...saveBundleFlows,
              };
              saveBundleFlows = {
                id: uuid4(),
                resourceType: 'Bundle',
                type: 'batch',
                entry: [],
              };
              this.saveResource(tmpBundle, () => {
                resolve();
              });
            } else {
              resolve();
            }
          })
        );
      }
      Promise.all(promises).then(() => {
        if (saveBundleFlows.entry.length > 0) {
          this.saveResource(saveBundleFlows, () => {
            return callback();
          });
        } else {
          return callback();
        }
      });
    },

    saveResource (resource, callback) {
      logger.info('Saving resource data');
      const url = URI(config.get('macm:baseURL')).toString();
      const options = {
        url,
        withCredentials: true,
        auth: {
          username: config.get('macm:username'),
          password: config.get('macm:password'),
        },
        headers: {
          'Content-Type': 'application/json',
        },
        json: resource,
      };
      request.post(options, (err, res, body) => {
        if (err) {
          logger.error(err);
          return callback(err);
        }
        logger.info('Resource(s) data saved successfully', JSON.stringify(options, 0, 2));
        callback(err, body);
      });
    },

    deleteResource (resource, callback) {
      const url = URI(config.get('macm:baseURL'))
        .segment(resource)
        .toString();
      const options = {
        url,
        withCredentials: true,
        auth: {
          username: config.get('macm:username'),
          password: config.get('macm:password'),
        },
      };
      request.delete(options, (err, res, body) => {
        logger.info(body + ' ' + url);
        if (err) {
          logger.error(err);
          return callback(err);
        }
        callback(err, body);
      });
    },

    /**
     *
     * @param {FHIRResource} resource
     * @param {FHIRURL} url
     * @param {ResourceID} id // id of a resource
     * @param {Integer} count
     * @param {Object} callback
     */
    getResource ({
      resource,
      url,
      id,
      query,
      count
    }, callback) {
      const resourceData = {};
      resourceData.entry = [];
      if (!url) {
        url = URI(config.get('macm:baseURL')).segment(resource);
        if (id) {
          url.segment(id);
        }
        if (count && !isNaN(count)) {
          url.addQuery('_count', count);
        } else {
          count = 0;
          url.addQuery('_count', 500);
        }
        if (query) {
          const queries = query.split('&');
          for (const qr of queries) {
            const qrArr = qr.split('=');
            if (qrArr.length !== 2) {
              logger.error('Invalid query supplied, stop getting resources');
              return callback(resourceData);
            }
            url.addQuery(qrArr[0], qrArr[1]);
          }
        }
        url = url.toString();
      } else {
        count = true;
      }

      logger.info(`Getting data for resource ${resource} from server ${config.get('macm:baseURL')}`);
      async.whilst(
        callback => {
          return callback(null, url !== false);
        },
        callback => {
          const options = {
            url,
            withCredentials: true,
            auth: {
              username: config.get('macm:username'),
              password: config.get('macm:password'),
            },
          };
          request.get(options, (err, res, body) => {
            logger.error('response');
            url = false;
            if (err) {
              logger.error(err);
            }
            if (!isJSON(body)) {
              logger.error('Non JSON has been returned while getting data for resource ' + resource);
              return callback(null, false);
            }
            body = JSON.parse(body);
            if (body.total === 0 && body.entry && body.entry.length > 0) {
              logger.error('Non resource data returned for resource ' + resource);
              return callback(null, false);
            }
            if (body.total > 0 && body.entry && body.entry.length > 0) {
              resourceData.entry = resourceData.entry.concat(body.entry);
            }
            const next = body.link.find(link => link.relation === 'next');
            if (!count || (count && !isNaN(count) && resourceData.entry.length < count)) {
              if (next) {
                url = next.url;
              }
            }
            resourceData.next = next;
            return callback(null, url);
          });
        }, () => {
          logger.info(`Done Getting data for resource ${resource} from server ${config.get('macm:baseURL')}`);
          return callback(resourceData);
        }
      );
    },

    createCommunicationsFromRPRuns (run, definition, callback) {
      let resourceParentId;
      const bundle = {};
      bundle.entry = [];
      for (const path of run.path) {
        const values = Object.keys(run.values);
        const texts = [];
        // these are user replies
        for (const valueKey of values) {
          if (run.values[valueKey].node === path.node) {
            const id = uuid4();
            texts.push({
              id,
              parent: resourceParentId,
              nodeUUID: path.node,
              type: 'reply',
              time: run.values[valueKey].time,
              msg: run.values[valueKey].input
            });
            resourceParentId = id;
          }
        }
        if (texts.length === 0) {
          // these are sent to user from the system
          const flowDef = definition.flows[0];
          for (const actionSet of flowDef.action_sets) {
            if (actionSet.uuid === path.node) {
              let id;
              for (const action of actionSet.actions) {
                if (action.type === 'reply') {
                  id = uuid4();
                  texts.push({
                    id,
                    parent: resourceParentId,
                    nodeUUID: action.uuid,
                    type: 'sent',
                    time: path.time,
                    msg: action.msg.eng
                  });
                }
              }
              if (id) {
                resourceParentId = id;
              }
            }
          }
        }
        for (const text of texts) {
          const commResource = {};
          commResource.resourceType = 'Communication';
          commResource.id = text.id;
          if (text.parent) {
            commResource.inResponseTo = 'Communication/' + text.parent;
          }
          commResource.payload = [{
            contentString: text.msg
          }];
          if (text.type === 'sent') {
            commResource.sent = text.time;
            commResource.recipient = [{
              reference: run.contact.globalid
            }];
          } else if (text.type === 'reply') {
            commResource.received = text.time;
          }

          commResource.basedOn = 'CommunicationRequest/';
          bundle.entry.push({
            resource: commResource,
            request: {
              method: 'PUT',
              url: `${commResource.resourceType}/${commResource.id}`
            }
          });
        }
      }
      this.saveResource(bundle, () => {
        return callback();
      });
    }
  };
};
