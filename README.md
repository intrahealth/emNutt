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
Run the server
```
node lib/app.js
```
