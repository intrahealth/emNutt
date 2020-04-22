# emNutt - mHero Connector

# Prerequisites 

You will need  
  1. A FHIR compatible server such as [hapi](https://hapifhir.io/)
  2. An [Elasticsearch](https://www.elastic.co/) instance  
  3. And [Kibana](https://www.elastic.co/kibana)
  
  If you want to use emNutt as a mediator you will need to have [OpenHIM](http://openhim.org/) installed
  
# Installation

Clone the repository
```
git clone https://github.com/intrahealth/emNutt.git
```

Enter the server directory, install node packages.
```
cd emNutt/server
npm install
```

Copy and edit the configuration file to your liking.
```
cp config/config_development_template.json config/config_development.json
```

Some configuration variables inside JSON config file (config/config_development.json)
# Configuration
## App config
```
"app": {
    "port": 3002,
    "installed": false,
    "baseURL": "http://localhost:3002/emNutt"
  }
```
 app.port - is the port number for emNutt <br>
 app.installed - when false, emNutt will load all default settings and set app.installed to true. If you want to reload  default settings then set this to false at any time. <br>
 app.baseURL - is the base URL of the emNutt server, if emNutt is behind any proxy, then it should be the address used to access emNutt through proxy <br>

## Mediator Config
```
"mediator": {
    "api": {
      "username": "root@openhim.org",
      "password": "openhim-password",
      "apiURL": "https://localhost:8080",
      "routerURL": "http://localhost:5001",
      "trustSelfSigned": true,
      "urn": ""
    },
    "register": false
  }
 ```
 mediator.api.username is the openHIM username for emNutt to register itself as a openHIM mediator <br>
 mediator.api.password is the openHIM password <br>
 mediator.api.apiURL is the openHIM API URL <br>
 mediator.api.routerURL is the openHIM URL used to send to access mediator channels,default port is 5001 for http and 5000 for https <br>
 mediator.register controls on whether emNutt should be used as a openHIM mediator or not, if set to false then emNutt will be used as a stand alone app.<br>

## Rapidpro Config
```
"rapidpro": {
    "baseURL": "http://app.rapidpro.io",
    "token": "1c443695d3bdhgeaf3e89b52dyg56e2886fa8uh2",
    "syncAllContacts": false
}
```
rapidpro.baseURL is the rapidpro base URL that is used by emNutt for starting workflows, sync contacts etc <br>
rapidpro.token is the security token that can be obtained from inside rapidpro <br>
rapidpro.syncAllContacts - if set to true then emNutt will sync all contacts from iHRIS or DHIS2 etc and save them to Rapidpro. If set to false then only contacted contacts will be saved into Rapidpro. <br>

## FHIR Server Config
```
"macm": {
    "baseURL": "http://localhost:8080/fhir",
    "username": "",
    "password": ""
}
```
macm.baseURL - This is the base URL for the FHIR server <br>
macm.username - This is the username for the FHIR server <br>
macm.password - This is the password for the FHIR server <br>

## Elasticsearch Config
```
"elastic": {
    "baseURL": "http://localhost:9200",
    "username": "",
    "password": ""
}
```
elastic.baseURL - Is the base URL of Elasticsearch server <br>
elastic.username - Is the elasticsearch username <br>
elastic.password - Is the elasticsearch password <br>

## Kibana Config
```
"kibana": {
    "baseURL": "http://localhost:5601",
    "username": "",
    "password": ""
  },
```
kibana.baseURL - Is the base URL for Kibana  <br>
kibana.username - Is the kibana username  <br>
kibana.password - Is the kibana password  <br>

## Run the server
```
node lib/app.js
```

# End Points
```
/emNutt/fhir/CommunicationRequest - POST
```
Use this end point to POST CommunicationRequest (sending Messages or Starting a workflow) <br>
Below is a sample CommunicationRequest - When emNutt and POS are using the same FHIR Server i.e emNutt knows where to get Practitioner/P6194

```
{
  "resourceType": "CommunicationRequest",
  "payload": [{
    "contentAttachment": {
      "url": "b7a4770c-d034-4055-9f21-b17632ef311e"
    }
  }],
  "recipient": [{
      "reference": "Practitioner/P6194"
    }, {
      "reference": "Practitioner/P8699"
    }
  ]
}
```
OR (This is mostly when emNutt and POS are using different FHIR server - i.e emNutt does not know how to respolve Practitioner/P6194

```
{
  "resourceType": "CommunicationRequest",
  "contained": [{
    "resourceType": "Practitioner",
    "id": "P6194",
    "name": [{
      "use": "official",
      "text": "Jousaesto Joutousle",
      "family": "Joutousle",
      "given": [
        "Jousaesto"
      ]
    }],
    "telecom": [{
      "system": "phone",
      "value": "+27-555-8344-23"
    }]
  }, {
    "resourceType": "Practitioner",
    "id": "P8699",
    "name": [{
      "use": "official",
      "text": "Taraeceaf Thiuaewiasou",
      "family": "Thiuaewiasou",
      "given": [
        "Taraeceaf"
      ]
    }],
    "telecom": [{
      "system": "phone",
      "value": "+27-555-9621-44"
    }]
  }],
  "payload": [{
    "contentAttachment": {
      "url": "b7a4770c-d034-4055-9f21-b17632ef311e"
    }
  }],
  "recipient": [{
    "reference": "#P6194"
  }, {
    "reference": "#P8699"
  }]
}

```
payload.contentAttachment.url is the workflow id to be started

```
/emNutt/syncWorkflows - GET
```
Use this end point to synchronize workflows between emNutt and Rapidpro

```
/emNutt/fhir/Basic?_profile=http://mhero.org/fhir/StructureDefinition/mHeroWorkflows - GET

```
Use this end point to get all workflows from emNutt

```
/emNutt/syncWorkflowRunMessages - GET
```
Use this end point to synchronize Messages between rapidpro and emNutt

```
/emNutt/syncContacts - POST

```
Use this end point to sync contacts between POS i.e iHRIS, DHIS2 openMRS etc and rapidpro. <br>
The request body must be a FHIR bundle of contacts i.e Practitioner resource or Person resource <br>
This is especially when emNutt and POS are using different FHIR Servers <br>

```
/emNutt/syncContacts - GET

```
Use this end point to sync contacts between emNutt and Rapidpro <br>
This is especially when emNutt and POS are using the same FHIR server. <br>

```
/emNutt/fhir/:resource?/:id? - GET

```
Use to get resource data from emNutt 
i.e /fhir/Communication (lists all communications)
i.e /fhir/Communication/123 list communication that has ID 123

