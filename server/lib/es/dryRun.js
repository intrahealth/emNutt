const postFHIR2ES = require('./es/postFHIR2ES')

postFHIR2ES.populateAll(true, () => {
  return callback()
})