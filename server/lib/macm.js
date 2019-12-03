'use strict';
const uuid4 = require('uuid/v4');
const URI = require('urijs');
const request = require('request');
const logger = require('./winston');
const config = require('./config');
module.exports = function () {
  return {
    rpFlowsToFHIR(flows, callback) {
      let promises = []
      let saveBundleFlows = {
        id: uuid4(),
        resourceType: 'Bundle',
        type: 'batch',
        entry: [],
      };
      for (let flow of flows) {
        promises.push(new Promise((resolve, reject) => {
          let resource = {}
          resource.id = uuid4();
          resource.resourceType = 'Basic';
          resource.meta = {};
          resource.meta.profile = [];
          resource.meta.profile.push('http://mhero.org/fhir/StructureDefinition/mHeroWorkflows');
          resource.meta.code = {
            "coding": [{
              "system": "http://mhero.org/fhir/CodeSystem/mhero-resource",
              "code": "mHeroWorkflows"
            }],
            "text": "mHeroWorkflows"
          }
          resource.extension = [{
            url: "http://mhero.org/fhir/StructureDefinition/mHeroWorkflowsDetails",
            extension: [{
              "url": "name",
              "valueString": flow.name
            }, {
              "url": "uuid",
              "valueString": flow.uuid
            }, {
              "url": "type",
              "valueString": flow.type
            }, {
              "url": "archived",
              "valueBoolean": flow.archived
            }, {
              "url": "expires",
              "valueInteger": flow.expires
            }, {
              "url": "http://mhero.org/fhir/StructureDefinition/mHeroWorkflowsRuns",
              "extension": [{
                "url": "active",
                "valueInteger": flow.runs.active
              }, {
                "url": "completed",
                "valueInteger": flow.runs.completed
              }, {
                "url": "interrupted",
                "valueInteger": flow.runs.interrupted
              }, {
                "url": "expired",
                "valueInteger": flow.runs.expired
              }]
            }, {
              "url": "created_on",
              "valueString": flow.created_on
            }, {
              "url": "modified_on",
              "valueString": flow.modified_on
            }]
          }]
          saveBundleFlows.entry.push({
            resource,
            request: {
              method: 'PUT',
              url: `Basic/${resource.id}`,
            }
          })
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
              resolve()
            })
          } else {
            resolve()
          }
        }))
      }
      Promise.all(promises).then(() => {
        if (saveBundleFlows.entry.length > 0) {
          this.saveResource(saveBundleFlows, () => {
            return callback()
          })
        } else {
          return callback()
        }
      })
    },

    saveResource(resource, callback) {
      let url = URI(config.get('macm:server'))
        .segment('fhir')
        .toString();
      const options = {
        url,
        withCredentials: true,
        auth: {
          username: config.get("macm:username"),
          password: config.get("macm:password"),
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
        callback(err, body);
      });
    }
  }
}