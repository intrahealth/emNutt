const postFHIR2ES = require('./postFHIR2ES')

postFHIR2ES.populateAll(true, () => {
  return callback()
})