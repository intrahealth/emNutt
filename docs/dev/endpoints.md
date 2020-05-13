# End Points

## CommunicationRequest

```
/emNutt/fhir/CommunicationRequest - POST
```

Use this end point to POST CommunicationRequest (sending Messages or Starting a workflow)<br>
Below is a sample CommunicationRequest - When emNutt and POS are using the same FHIR Server i.e emNutt knows where to get Practitioner/P6194

```js
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
  }]
}
```

OR (This is mostly when emNutt and POS are using different FHIR server - i.e emNutt does not know how to resolve Practitioner/P6194

```js
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

## syncWorkflows - GET

```
/emNutt/syncWorkflows - GET
```

Use this end point to synchronize workflows between emNutt and Rapidpro

## Getting workflows from emNutt

```
/emNutt/fhir/Basic?_profile=http://mhero.org/fhir/StructureDefinition/mHeroWorkflows - GET
```

Use this end point to get all workflows from emNutt

## syncWorkflowRunMessages

```
/emNutt/syncWorkflowRunMessages - GET
```

Use this end point to synchronize Messages between rapidpro and emNutt

## syncContacts - GET

```
/emNutt/syncContacts - GET
```

Use this end point to sync contacts between emNutt and Rapidpro.

## syncContacts - POST

```
/emNutt/syncContacts - POST
```

Use this end point to sync contacts between POS i.e iHRIS, DHIS2 openMRS etc and rapidpro.
The request body must be a FHIR bundle of contacts i.e Practitioner or Person or Patient resource.
This is especially when emNutt and POS are using different FHIR Servers.

## syncContactsGroups

```
/emNutt/syncContactsGroups
```

Use this end point to sync contacts groups between emNutt and communication channels i.e rapidpro and emNutt, this will depend with the system that is configured to manage contacts groups. if POS is set as a system to manage contacts groups then contact groups will be taken from POS and saved to rapidpro and viceversa

## cacheFHIR2ES

```
/emNutt/cacheFHIR2ES
```

Use this end point to cache FHIR data into elasticsearch for visualizstion

## Getting any resource

```
/emNutt/fhir/:resource?/:id? - GET
```

Use to get resource data from emNutt
i.e /emNutt/fhir/Communication (lists all communications) OR
/emNutt/fhir/Communication/123 retrieves communication that has ID 123
