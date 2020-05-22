Profile:        MheroCommunication
Parent:         Communication
Id:             mhero-communication
Title:          "mHero Communication Profile"
Description:    "mHero profile for Communication."
* sent MS
* received MS
* recipient MS
* payload MS
* status MS
* extension contains
      MheroCommFlowRun named commFlowRun 1..1

Extension:      MheroCommFlowRun
Id:             mhero-comm-flow-run
Title:          "mHero Communication Flow Run Extension"
Description:    "Link to flow run for a communication."
* ^context.type = #element
* ^context.expression = "Communication"
* value[x] only Reference
* valueReference 1..1
* valueReference only Reference(MheroFlowRun)
* valueReference.reference 1..1
* valueReference.type 0..0
* valueReference.identifier 0..0
* valueReference.display 0..0

Instance:       a9c91fc1-20ce-59d8-94e3-48ed235e3379
InstanceOf:     MheroCommunication
Title:          "mHero Communication Example"
Usage:          #example
* status = #completed
* extension[commFlowRun].valueReference = Reference(Basic/3fbb96d3-bb8a-41c6-b1a4-8f4f11460899)
* sent = "2020-03-09T14:20:59.685600Z"
* received = "2020-03-09T14:20:59.685600Z"
* recipient[0] = Reference(Practitioner/P97111)
* payload[0].contentString = "The most important treatment that can be given to a patient with Ebola to help them survive is? 1)Fluids 2)Antibiotics 3)Antivirals 4)Anti-pyretics/Anti-fever medications 5)There is no care that has been found to increase survival of patients with Ebola"