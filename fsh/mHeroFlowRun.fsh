Profile:        MheroFlowRun
Parent:         Basic
Id:             mhero-flow-run
Title:          "mHero Workflow Run Profile"
Description:    "mHero profile for Workflows run details."
* extension contains
      MheroFlowRunDetails named flowRunDetails 0..*

Extension:      MheroFlowRunDetails
Id:             mhero-flow-run-details
Title:          "mHero Workflow Run Details Extension"
Description:    "Details of a workflow run."
* ^context.type = #element
* ^context.expression = "Basic"
* extension contains
      CommunicationRequest 1..1 MS and
      flow 1..1 MS and
      recipient 1..1 MS and
      responded 1..1 MS and
      created_on 1..1 MS and
      modified_on 1..1 MS and
      exit_type 1..1 MS and
      exited_on 1..1 MS
* extension[CommunicationRequest].value[x] only Reference
* extension[CommunicationRequest].valueReference 1..1
* extension[CommunicationRequest].valueReference only Reference(CommunicationRequest)
* extension[CommunicationRequest].valueReference.reference 1..1
* extension[CommunicationRequest].valueReference.type 0..0
* extension[CommunicationRequest].valueReference.identifier 0..0
* extension[CommunicationRequest].valueReference.display 0..0
* extension[flow].value[x] only Reference
* extension[flow].valueReference 1..1
* extension[flow].valueReference only Reference(MheroWorkflows)
* extension[flow].valueReference.reference 1..1
* extension[flow].valueReference.type 0..0
* extension[flow].valueReference.identifier 0..0
* extension[flow].valueReference.display 0..0
* extension[recipient].value[x] only Reference
* extension[recipient].valueReference 1..1
* extension[recipient].valueReference only Reference(Practitioner)
* extension[recipient].valueReference.reference 1..1
* extension[recipient].valueReference.type 0..0
* extension[recipient].valueReference.identifier 0..0
* extension[recipient].valueReference.display 0..0
* extension[responded].value[x] only boolean
* extension[responded].valueBoolean 1..1
* extension[created_on].value[x] only dateTime
* extension[created_on].valueDateTime 1..1
* extension[modified_on].value[x] only dateTime
* extension[modified_on].valueDateTime 1..1
* extension[exited_on].value[x] only dateTime
* extension[exited_on].valueDateTime 1..1
* extension[exit_type].value[x] only string
* extension[exit_type].valueString 1..1

Instance:       3fbb96d3-bb8a-41c6-b1a4-8f4f11460899
InstanceOf:     MheroFlowRun
Title:          "mHero Workflow Run Details Example"
Usage:          #example
* code.text = "mHero Workflow Run Details"
* extension[flowRunDetails].extension[CommunicationRequest].valueReference = Reference(CommunicationRequest/feb3de06-a5e4-4a76-8a50-fe32cb209de1)
* extension[flowRunDetails].extension[flow].valueReference = Reference(Basic/b7a4770c-d034-4055-9f21-b17632ef311e)
* extension[flowRunDetails].extension[recipient].valueReference = Reference(Practitioner/P7479)
* extension[flowRunDetails].extension[responded].valueBoolean = false
* extension[flowRunDetails].extension[created_on].valueDateTime = "2020-03-09T12:44:51.122549Z"
* extension[flowRunDetails].extension[modified_on].valueDateTime = "2020-03-10T00:45:01.647066Z"
* extension[flowRunDetails].extension[exited_on].valueDateTime = "2020-03-10T00:45:01.647066Z"
* extension[flowRunDetails].extension[exit_type].valueString = "expired"