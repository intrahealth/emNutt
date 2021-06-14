const config = require("./config")
const mixin = require("./mixin")
const logger = require("./winston")

let whatsappCh = mixin.getEnabledChannel('whatsapp')
if(!whatsappCh) {
  logger.info('Whatsapp channel is not enabled')
  return
}
const { WhatsApp } = require(`./commChannels/wa.${whatsappCh[0].name}`)
let channel = new WhatsApp()
channel.createAuth().then((auth) => {
  console.log(auth);
}).catch((err) => {
  logger.error(err);
})

const processCommunications = ({commReqs}, callback) => {

}
module.exports = {

}