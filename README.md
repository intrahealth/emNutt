# emNutt - mHero Connector

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
App config
```
"app": {
    "port": 3002,
    "installed": false,
    "baseURL": "http://localhost:3000"
  }
 app.port - is the port number for emNutt
 app.installed - when false, emNutt will load all default settings and set app.installed to true. If you want to reload default settings then set this to false at any time.
 app.baseURL - is the base URL of the emNutt server
```
Mediator Config
```
"mediator": {
    "api": {
      "username": "root@openhim.org",
      "password": "openhim-password",
      "apiURL": "https://localhost:8080",
      "trustSelfSigned": true,
      "urn": ""
    },
    "register": false
  }
 mediator.api.username is the openHIM username for emNutt to register itself as a openHIM mediator
 mediator.api.password is the openHIM password
 mediator.api.apiURL is the openHIM API URL
 mediator.register controls on whether emNutt should be used as a openHIM mediator or not, if set to false then emNutt will be used as a stand alone app.
```
Rapidpro Config
```
"rapidpro": {
    "baseURL": "http://app.rapidpro.io",
    "token": "1c443695d3bdhgeaf3e89b52dyg56e2886fa8uh2",
    "syncAllContacts": false
}
rapidpro.baseURL is the rapidpro base URL that is used by emNutt for starting workflows, sync contacts etc
rapidpro.token is the security token that can be obtained from inside rapidpro
rapidpro.syncAllContacts - if set to true then emNutt will sync all contacts from iHRIS or DHIS2 etc and save them to Rapidpro. If set to false then only contacted contacts will be saved into Rapidpro.
```
FHIR Server Config
```
"macm": {
    "baseURL": "http://localhost:8080/fhir",
    "username": "",
    "password": ""
}
macm.baseURL - This is the base URL for the FHIR server
macm.username - This is the username for the FHIR server
macm.password - This is the password for the FHIR server
```
Elasticsearch Config
```
"elastic": {
    "baseURL": "http://localhost:9200",
    "username": "",
    "password": ""
}
elastic.baseURL - Is the base URL of Elasticsearch server
elastic.username - Is the elasticsearch username
elastic.password - Is the elasticsearch password
```

Run the server
```
node lib/app.js
```
