'use strict';
const uuid4 = require('uuid/v4');
const uuid5 = require('uuid/v5');
const URI = require('urijs');
const request = require('request');
const async = require('async');
const isJSON = require('is-json');
const logger = require('./winston');
const config = require('./config');
module.exports = function () {
  return {
    populateDataByProfile ({
      profileDefinition,
      extensionDefinition,
      field,
      fieldValue
    }, callback) {
      let dataValues = {};
      let extType;
      for (let element of extensionDefinition.differential.element) {
        if (element.id === "Extension.extension:" + field + ".value[x]") {
          extType = element.type[0].code.toLowerCase();
          extType = extType.charAt(0).toUpperCase() + extType.slice(1);
        }
      }
      if (extType) {
        dataValues.url = field;
        if (extType === 'Boolean') {
          if (fieldValue != 'false' && fieldValue != 'true') {
            fieldValue = fieldValue.toLowerCase();
            if (fieldValue.startsWith('y')) {
              dataValues['value' + extType] = true;
            } else if (fieldValue.startsWith('n')) {
              dataValues['value' + extType] = false;
            }
          } else {
            dataValues['value' + extType] = fieldValue;
          }
        } else {
          dataValues['value' + extType] = fieldValue;
        }
      } else {
        for(let element of profileDefinition.differential.element) {
          if(element.id === `${profileDefinition.type}.${field}`) {
            dataValues[field] = fieldValue
          }
        }
      }
      return callback(dataValues)
    },

    rpFlowsToFHIR(flows, callback) {
      if (!Array.isArray(flows)) {
        logger.error('Flows isnt an array');
        return callback(true);
      }
      let processingError = false;
      const promises = [];
      let saveBundleFlows = {
        id: uuid4(),
        resourceType: 'Bundle',
        type: 'batch',
        entry: [],
      };
      for (const flow of flows) {
        promises.push(new Promise((resolve) => {
          const resource = {};
          resource.id = flow.uuid;
          resource.resourceType = 'Basic';
          resource.meta = {};
          resource.meta.profile = [];
          resource.meta.profile.push(config.get("profiles:Workflows"));
          resource.meta.code = {
            coding: [{
              system: 'http://mhero.org/fhir/CodeSystem/mhero-resource',
              code: 'mHeroWorkflows',
            }],
            text: 'mHeroWorkflows',
          };
          resource.extension = [{
            url: config.get("extensions:WorkflowsDetails"),
            extension: [{
                url: 'name',
                valueString: flow.name,
              },
              {
                url: 'uuid',
                valueString: flow.uuid,
              },
              {
                url: 'flow_type',
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
                url: config.get("extensions:WorkflowsRunSummary"),
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
                valueDateTime: flow.created_on,
              },
              {
                url: 'modified_on',
                valueDateTime: flow.modified_on,
              },
            ],
          }];
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
            this.saveResource(tmpBundle, (err) => {
              if (err) {
                processingError = true;
              }
              resolve();
            });
          } else {
            resolve();
          }
        }));
      }
      Promise.all(promises).then(() => {
        if (saveBundleFlows.entry.length > 0) {
          this.saveResource(saveBundleFlows, (err) => {
            if (err) {
              processingError = true;
            }
            return callback(processingError);
          });
        } else {
          return callback(processingError);
        }
      });
    },

    saveResource(resource, callback) {
      logger.info('Saving resource data');
      let url = URI(config.get('macm:baseURL'));
      if (resource.resourceType && resource.resourceType !== 'Bundle') {
        url = url.segment(resource.resourceType);
      }
      url = url.toString();
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
          logger.error(body);
          return callback(err, res, body);
        }
        if (res.statusCode && (res.statusCode < 200 || res.statusCode > 399)) {
          logger.error(body);
          return callback(true, res, body);
        }
        logger.info('Resource(s) data saved successfully');
        callback(err, res, body);
      });
    },

    deleteResource(resource, callback) {
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
        if (err) {
          logger.error(err);
          return callback(err);
        }
        if (res.statusCode && (res.statusCode < 200 || res.statusCode > 399)) {
          return callback(true);
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
    getResource({
      resource,
      url,
      id,
      query,
      count,
      noCaching = false,
    }, callback) {
      let resourceData = {};
      if (!id) {
        resourceData.entry = [];
      }
      if (!url) {
        url = URI(config.get('macm:baseURL')).segment(resource);
        if (id) {
          id = id.toString();
          url.segment(id);
        }
        if (count && !isNaN(count)) {
          url.addQuery('_count', count);
        } else if(!id) {
          count = 0;
          url.addQuery('_count', 200);
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
            if (qrArr[0] === '_count') {
              count = true;
            }
          }
        }
        url = url.toString();
      } else {
        count = true;
      }
      let headers = {};
      if (noCaching) {
        headers = {
          'Cache-Control': 'no-cache',
        };
      }
      let errCode;
      logger.info(`Getting data for resource from server ${config.get('macm:baseURL')}`);
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
            headers
          };
          request.get(options, (err, res, body) => {
            url = false;
            if (err) {
              logger.error(err);
            }
            if (!isJSON(body)) {
              logger.error('Non JSON has been returned while getting data for resource ' + resource);
              logger.error(body);
              return callback(true, false);
            }
            if (res.statusCode && (res.statusCode < 200 || res.statusCode > 399)) {
              errCode = res.statusCode;
              logger.error(body);
              logger.error('Getting resource Err Code ' + res.statusCode);
              return callback(true, false);
            }
            body = JSON.parse(body);
            if (Object.prototype.hasOwnProperty.call(body, 'total') && body.total === 0) {
              return callback(null, false);
            }
            if (!id && !body.entry) {
              logger.error('Invalid resource data returned by FHIR server');
              logger.error(body);
              return callback(true, false);
            }
            if (id && body) {
              resourceData = body;
            } else if (body.entry && body.entry.length > 0) {
              if (count) {
                resourceData = {
                  ...body
                };
              } else {
                resourceData.entry = resourceData.entry.concat(body.entry);
              }
            }
            const next = body.link && body.link.find(link => link.relation === 'next');
            if (!count || (count && !isNaN(count) && resourceData.entry.length < count)) {
              if (next) {
                url = next.url;
              }
            }
            resourceData.next = next;
            return callback(null, url);
          });
        }, (err) => {
          if (err) {
            err = errCode;
          }
          logger.info(`Done Getting data for resource ${resource} from server ${config.get('macm:baseURL')}`);
          return callback(err, resourceData);
        }
      );
    },

    createCommunicationsFromRPRuns(run, definition, runCommReq, callback) {
      const bundle = {};
      bundle.entry = [];
      bundle.type = 'batch';
      bundle.resourceType = 'Bundle';
      if(!run.start) {
        return callback(false, bundle)
      }
      let processingError = false;
      let commReqId
      if (!runCommReq || !runCommReq.entry) {
        logger.warn('Invalid data returned when querying CommunicationRequest resource for flow start ' + run.start.uuid);
        return callback(true, bundle);
      } else  if (runCommReq.entry.length === 0) {
        logger.warn('No communication request found for flow run ' + run.start.uuid);
      } else if (runCommReq.entry.length > 1) {
        logger.warn(`Multiple CommunicationRequest resources found with flow start ${run.start.uuid}`);
      } else {
        commReqId = runCommReq.entry[0].resource.id;
      }
      // create flowRun resource first
      const extension = [{
        url: 'flow',
        valueReference: {
          reference: `Basic/${run.flow.uuid}`
        }
      }, {
        url: 'recipient',
        valueReference: {
          reference: `${run.contact.mheroentitytype}/${run.contact.globalid}`
        }
      }, {
        url: 'responded',
        valueBoolean: run.responded
      }, {
        url: 'created_on',
        valueDateTime: run.created_on
      }, {
        url: 'modified_on',
        valueDateTime: run.modified_on
      }];
      if(commReqId) {
        extension.push({
          url: 'CommunicationRequest',
          valueReference: {
            reference: `${runCommReq.entry[0].resource.resourceType}/${commReqId}`
          }
        })
      }
      if (run.exit_type) {
        extension.push({
          url: 'exit_type',
          valueString: run.exit_type
        });
        extension.push({
          url: 'exited_on',
          valueDateTime: run.exited_on
        });
      }
      bundle.entry.push({
        resource: {
          resourceType: 'Basic',
          id: run.uuid,
          meta: {
            profile: [config.get("profiles:WorkflowRun")]
          },
          extension: [{
            url: config.get("extensions:WorkflowRunDetails"),
            extension
          }]
        },
        request: {
          method: 'PUT',
          url: `Basic/${run.uuid}`
        }
      });
      for (const path of run.path) {
        const values = Object.keys(run.values);
        const texts = [];
        // these are user replies
        for (const valueKey of values) {
          if (run.values[valueKey].node === path.node) {
            // const id = uuid4();
            //get question ID
            let inResponseTo
            for (const node of definition.nodes) {
              for(const exit of node.exits) {
                if(exit.destination_uuid === path.node && node.actions && Array.isArray(node.actions)) {
                  for (const action of node.actions) {
                    if (action.type === 'send_msg') {
                      inResponseTo = uuid5(action.uuid, run.uuid);
                    }
                  }
                }
              }
            }
            const id = uuid5(path.node, run.uuid);
            texts.push({
              id,
              nodeUUID: path.node,
              type: 'reply',
              inResponseTo,
              time: run.values[valueKey].time,
              msg: run.values[valueKey].input
            });
          }
        }
        if (texts.length === 0) {
          // these are sent to user from the system
          for (const node of definition.nodes) {
            if (node.uuid === path.node && node.actions && Array.isArray(node.actions)) {
              let id;
              for (const action of node.actions) {
                if (action.type === 'send_msg') {
                  id = uuid5(action.uuid, run.uuid);
                  texts.push({
                    id,
                    nodeUUID: action.uuid,
                    type: 'sent',
                    time: path.time,
                    msg: action.text
                  });
                }
              }
            }
          }
        }
        for (const text of texts) {
          const commResource = {};
          commResource.meta = {};
          commResource.meta.profile = [];
          commResource.meta.profile.push(config.get("profiles:Communication"));
          commResource.resourceType = 'Communication';
          commResource.id = text.id;
          commResource.payload = [{
            contentString: text.msg
          }];
          if (text.type === 'sent') {
            commResource.sent = text.time;
            commResource.received = text.time;
            commResource.recipient = [{
              reference: `${run.contact.mheroentitytype}/${run.contact.globalid}`
            }];
          } else if (text.type === 'reply') {
            if(text.inResponseTo) {
              commResource.inResponseTo = [{
                reference: 'Communication/' + text.inResponseTo
              }]
            }
            commResource.received = text.time;
            commResource.sent = text.time;
            commResource.sender = {
              reference: `${run.contact.mheroentitytype}/${run.contact.globalid}`
            };
          }

          if(commReqId) {
            commResource.basedOn = `CommunicationRequest/${commReqId}`;
          }
          if (!commResource.extension) {
            commResource.extension = [];
          }
          commResource.extension.push({
            url: config.get("extensions:CommunicationFlowRun"),
            valueReference: {
              reference: `Basic/${run.uuid}`
            }
          });
          bundle.entry.push({
            resource: commResource,
            request: {
              method: 'PUT',
              url: `${commResource.resourceType}/${commResource.id}`
            }
          });
        }
      }
      return callback(processingError, bundle);
    }
  };
};