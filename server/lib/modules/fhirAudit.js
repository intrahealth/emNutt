const logger = require('../winston')
const macm = require('../macm')();

const AUDIT_TEMPLATE = {
  resourceType: "AuditEvent",
  type: {
    system: "http://terminology.hl7.org/CodeSystem/audit-event-type",
    code: "rest"
  },
  subtype: [
  ],
  action: "E",
  recorded: "",
  outcome: 0,
  agent: [],
  source: {
    observer: {
      identifier: {
        value: "urn:oid:2.16.840.1.113883.3.9049.1"
      }
    },
    type: [ {
      system: "https://www.hl7.org/fhir/codesystem-audit-source-type.html",
      code: "3"
    } ]
  },
  entity: []
}

const fhirAudit = {

  save: (audit) => {
    macm.saveResource(audit, (err, resp, body) => {
      logger.error(JSON.stringify(body,0,2));
      if(err) {
        logger.error("Failed to create audit trail: ")
        logger.error(JSON.stringify(audit,null,2))
      }
    })
  },

  audit: () => {
    let audit = JSON.parse(JSON.stringify(AUDIT_TEMPLATE))
    let now = new Date()
    audit.recorded = now.toISOString()

    return audit
  },

  getAgent: (user, ip, email) => {
    let agent = {
      altId: "",
      name: "",
      requestor: true,
      network: {
        address: ip || "?",
        type: 2
      }
    }
    try {
    agent.altId = user.resource.telecom[0].value
    } catch(err) {
      if ( user && user.resource && user.resource.telecom ) {
        agent.altId = JSON.stringify(user.resource.telecom)
      } else {
        agent.altId = email || "?"
      }
    }
    try {
      agent.name = user.resource.name[0].text
    } catch(err) {
      if ( user && user.resource && user.resource.name ) {
        agent.name = JSON.stringify(user.resource.name)
      } else {
        agent.name = ""
      }
    }

    return agent
  },

  create: (user, ip, what, success, detail) => {
    let createAudit = fhirAudit.audit()
    createAudit.agent.push( fhirAudit.getAgent( user, ip ) )
    if ( !success ) {
      createAudit.outcome = 4
    }
    createAudit.subtype.push( {
      system: "http://hl7.org/fhir/restful-interaction",
      code: "create"
    } )
    createAudit.action = "C"
    if ( what ) {
      createAudit.entity.push( {
        what: { reference: what }
      } )
    }
    if ( detail ) {
      createAudit.entity.push( {
        detail: [
          {
            type: "resource",
            valueString: JSON.stringify(detail.resource,null,2)
          },
          {
            type: "error",
            valueString: detail.err.message
          }
        ]
      } )
    }
    console.error(JSON.stringify(createAudit,0,2));
    fhirAudit.save(createAudit)
  },

  update: (user, ip, what, success, detail) => {
    let updateAudit = fhirAudit.audit()
    updateAudit.agent.push( fhirAudit.getAgent( user, ip ) )
    if ( !success ) {
      updateAudit.outcome = 4
    }
    updateAudit.subtype.push( {
      system: "http://hl7.org/fhir/restful-interaction",
      code: "update"
    } )
    updateAudit.action = "U"
    if ( what ) {
      updateAudit.entity.push( {
        what: { reference: what }
      } )
    }
    if ( detail ) {
      updateAudit.entity.push( {
        detail: [
          {
            type: "resource",
            valueString: JSON.stringify(detail.resource,null,2)
          },
          {
            type: "error",
            valueString: detail.err.message || "?"
          }
        ]
      } )
    }
    console.error(JSON.stringify(updateAudit,0,2));
    fhirAudit.save(updateAudit)
  },

  patch: (user, ip, what, success, detail) => {
    let updateAudit = fhirAudit.audit()
    updateAudit.agent.push( fhirAudit.getAgent( user, ip ) )
    if ( !success ) {
      updateAudit.outcome = 4
    }
    updateAudit.subtype.push( {
      system: "http://hl7.org/fhir/restful-interaction",
      code: "patch"
    } )
    updateAudit.action = "U"
    if ( what ) {
      updateAudit.entity.push( {
        what: { reference: what }
      } )
    }
    if ( detail ) {
      let details = []
      if ( detail.resource ) {
        details.push( {
            type: "resource",
            valueString: JSON.stringify(detail.resource,null,2)
        } )
      }
      if ( detail.err ) {
        details.push( {
            type: "error",
            valueString: detail.err.message
        } )
      }
      if ( detail.code ) {
        details.push( {
            type: "code",
            valueString: detail.code
        } )
      }
      updateAudit.entity.push( { detail: details } )
    }
    fhirAudit.save(updateAudit)
  },


}


module.exports = fhirAudit
