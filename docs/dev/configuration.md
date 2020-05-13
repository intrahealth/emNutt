# Configuration

Below are emNutt configuration parameters

## App Config

```JS
"app": {
  "port": 3002,
  "installed": false,
  "baseURL": "http://localhost:3002/emNutt",
  "contactGroupsSource": "pos"
}
```

<ul>
  <li>app.port - is the port number for emNutt</li>
  <li>app.installed - when false, emNutt will load all default settings and set app.installed to true. If you want to
    reload default settings then set this to false at any time.</li>
  <li>app.baseURL - is the base URL that is used to access the emNutt server, if emNutt is behind any proxy, then it
    should be the address used to access emNutt through proxy</li>
  <li>app.contactGroupsSource - tells emNutt the system that is used to manage contacts groups, values can either be pos
    or the name of the communication channel like rapidpro. If the value is pos then contact groups will be managed by
    Point of Service system like iHRIS, openMRS, DHIS2 etc, other wise then contacts groups will be managed through
    communications channel i.e rapidpro</li>
</ul>

## Mediator Config

```js
"mediator": {
  "api": {
    "username": "root@openhim.org",
    "password": "openhim-password",
    "apiURL": "https://localhost:8080",
    "routerURL": "http://localhost:5001",
    "trustSelfSigned": true,
    "urn": ""
  }
  "register": false
}
```

<ul>
  <li>
    mediator.api.username is the openHIM username for emNutt to register itself as a openHIM mediator
  </li>
  <li>
    mediator.api.password is the openHIM password
  </li>
  <li>
    mediator.api.apiURL is the openHIM API URL
  </li>
  <li>
    mediator.api.routerURL is the openHIM URL used to send to access mediator channels,default port is 5001 for http and
    5000 for https
  </li>
  <li>
    mediator.register controls on whether emNutt should be used as a openHIM mediator or not, if set to false then
    emNutt will be used as a stand alone app.
  </li>
</ul>

## Rapidpro Config

```js
"rapidpro": {
  "baseURL": "http://app.rapidpro.io",
  "token": "1c443695d3bdhgeaf3e89b52dyg56e2886fa8uh2",
  "syncAllContacts": false
}
```

<ul>
  <li>
    rapidpro.baseURL is the rapidpro base URL that is used by emNutt for starting workflows, sync contacts etc
  </li>
  <li>
    rapidpro.token is the security token that can be obtained from inside rapidpro
  </li>
  <li>
    rapidpro.syncAllContacts - if set to true then emNutt will sync all contacts from iHRIS or DHIS2 etc and save them to Rapidpro. If set to false then only contacted contacts will be saved into Rapidpro.
  </li>
</ul>

## FHIR Server Config

```js
"macm": {
  "baseURL": "http://localhost:8080/fhir",
  "username": "",
  "password": ""
}
```

<ul>
  <li>
    macm.baseURL - This is the base URL for the FHIR server
  </li>
  <li>
    macm.username - This is the username for the FHIR server
  </li>
  <li>
    macm.password - This is the password for the FHIR server
  </li>
</ul>

## Elasticsearch Config

```js
"elastic": {
  "baseURL": "http://localhost:9200",
  "username": "",
  "password": ""
  "max_compilations_rate": "10000/1m"
}
```

<ul>
  <li>
    elastic.baseURL - Is the base URL of Elasticsearch server
  </li>
  <li>
    elastic.username - Is the elasticsearch username
  </li>
  <li>
    elastic.password - Is the elasticsearch password
  </li>
  <li>
    elastic.max_compilations_rate - this sets maximum scripts (requests) per minute that ES can execute, default is 15/minute which doesnt work well with emNutt
  </li>
</ul>

## Kibana Config

```js
"kibana": {
  "baseURL": "http://localhost:5601",
  "username": "",
  "password": ""
}
```

<ul>
  <li>
    kibana.baseURL - Is the base URL for Kibana
  </li>
  <li>
    kibana.username - Is the kibana username
  </li>
  <li>
    kibana.password - Is the kibana password
  </li>
</ul>

## Start server

```js
npm start
```
