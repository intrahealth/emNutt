'use strict';
const axios = require('axios')
const URI = require('urijs');
const moment = require('moment')
const config = require('../config');
const logger = require('../winston')

class WhatsApp {
  //must return object with keys auth and headers
  createAuth() {
    return new Promise((resolve, reject) => {
      if(this.tokenData && moment(this.tokenData.expires_after).isAfter(moment())) {
        return resolve({
          auth: {},
          headers: {
            Authorization: `Bearer ${this.tokenData.token}`,
          }
        })
      } else {
        this.tokenData = ''
        let url = URI(config.get("wa.turn:baseURL")).segment("users").segment("login").toString()
        let opts = {
          method: "POST",
          url,
          auth: {
            username: config.get("wa.turn:username"),
            password: config.get("wa.turn:password")
          }
        }
        axios(opts).then((response) => {
          if(response.data.users && Array.isArray(response.data.users)) {
            for(let user of response.data.users) {
              if(moment(user.expires_after).isAfter(moment())) {
                this.tokenData = user
                break;
              }
            }
            if(!this.tokenData) {
              return reject()
            }
            return resolve({
              auth: {},
              headers: {
                Authorization: `Bearer ${this.tokenData.token}`,
              }
            })
          } else {
            return reject()
          }
        }).catch((err) => {
          logger.error(err);
          return reject(err)
        })
      }
    })
  }


}

module.exports = {
  WhatsApp
}