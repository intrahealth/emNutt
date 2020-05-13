# Installation

Clone the repository

```bash
git clone https://github.com/intrahealth/emNutt.git
```

Enter the server directory and install node packages.

```bash
cd emNutt/server && npm install
```

Copy and edit the configuration file to your liking.

```bash
cp config/config_development_template.json config/config_development.json
```

## Start server

Before you start server, you may need to adjust some configuration variables, see [Configuration page](./configuration.md)

```js
npm start
```
