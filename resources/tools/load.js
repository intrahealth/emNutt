const request = require('request')
const URI = require('urijs');
const nconf = require('nconf')
const fs = require('fs')
const Fhir = require('fhir').Fhir

nconf.argv()

const convert = new Fhir()
const server = nconf.get('server')

if (!server) {
  console.log("invalid arguments, usage node load.js --server=http://localhost:8080/fhir --user --password pathToXMLFile i.e node load.js --server=http://localhost:8080/fhir --user=hapi --password=hapi  ./XML/*")
  process.exit(0)
}

let files = nconf.get('_')
if (files.length === 0) {
  console.log("no files found, usage node load.js --server=http://localhost:8080/fhir --user --password pathToXMLFile i.e node load.js --server=http://localhost:8080/fhir --user=hapi --password=hapi ./XML/*")
  process.exit(0)
}
for (let file of files) {
  console.log("Reading " + file + "...")
  fs.readFile(file, (err, data) => {
    if (err) throw err
    let fhir
    if (file.substring(file.length - 3) === 'xml') {
      fhir = convert.xmlToObj(data)
    } else {
      fhir = JSON.parse(data)
    }
    let dest = ""
    if (fhir.resourceType === "Bundle" &&
      (fhir.type === "transaction" || fhir.type === "batch")) {
      console.log("Saving " + fhir.type)
      dest = server
      request.post(dest, {
        json: fhir
      }, (err, res, body) => {
        if (err) throw err
        console.log(dest + ": " + res.statusCode)
        console.log(JSON.stringify(res.body, null, 2))
      })
    } else {
      console.log("Saving " + fhir.resourceType + " - " + fhir.id)
      dest = URI(server).segment(fhir.resourceType).segment(fhir.id).toString()
      const options = {
        url: dest,
        withCredentials: true,
        auth: {
          username: nconf.get('user'),
          password: nconf.get('password'),
        },
        headers: {
          'Content-Type': 'application/json',
        },
        json: fhir,
      };
      request.put(options, (err, res, body) => {
        if (err) throw err
        console.log(dest + ": " + res.statusCode)
        console.log(res.headers['content-location'])
      })
    }

  })
}