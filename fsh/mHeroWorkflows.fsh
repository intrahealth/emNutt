Profile:        MheroWorkflows
Parent:         Basic
Id:             mhero-workflows
Title:          "mHero Workflows Profile"
Description:    "mHero profile of Workflows."
* extension contains
      MheroWorkflowsDetails named workflowDetails 0..*

Extension:      MheroWorkflowsDetails
Id:             mhero-workflows-details
Title:          "mHero Workflow Details Extension"
Description:    "Details of mHero workflow."
* ^context.type = #element
* ^context.expression = "Basic"
* extension contains
      name 1..1 MS and
      uuid 1..1 MS and
      flow_type 1..1 MS and
      archived 1..1 MS and
      expires 1..1 MS and
      created_on 1..1 MS and
      modified_on 1..1 MS and
      MheroRunSummary named runSummary 1..1 MS
* extension[name].value[x] only string
* extension[name].valueString 1..1
* extension[uuid].value[x] only string
* extension[uuid].valueString 1..1
* extension[flow_type].value[x] only string
* extension[flow_type].valueString 1..1
* extension[archived].value[x] only boolean
* extension[archived].valueBoolean 1..1
* extension[expires].value[x] only integer
* extension[expires].valueInteger 1..1
* extension[created_on].value[x] only dateTime
* extension[created_on].valueDateTime 1..1
* extension[modified_on].value[x] only dateTime
* extension[modified_on].valueDateTime 1..1

Extension:      MheroRunSummary
Id:             mhero-run-summary
Title:          "mHero Workflow Run Summary Extension"
Description:    "Highlevel Run Summary of a Workflow"
* extension contains
      active 1..1 MS and
      completed 1..1 MS and
      interrupted 1..1 MS and
      expired 1..1 MS
* extension[active].value[x] only integer
* extension[active].valueInteger 1..1
* extension[completed].value[x] only integer
* extension[completed].valueInteger 1..1
* extension[interrupted].value[x] only integer
* extension[interrupted].valueInteger 1..1
* extension[expired].value[x] only integer
* extension[expired].valueInteger 1..1

Instance:       b1155b20-9054-4666-9493-4ef05edf77f4
InstanceOf:     MheroWorkflows
Title:          "mHero Workflow Example"
Usage:          #example
* code.text = "mHero Workflow"
* extension[workflowDetails].extension[name].valueString = "Sample Flow - Order Status Checker"
* extension[workflowDetails].extension[uuid].valueString = "b1155b20-9054-4666-9493-4ef05edf77f4"
* extension[workflowDetails].extension[flow_type].valueString = "message"
* extension[workflowDetails].extension[archived].valueBoolean = false
* extension[workflowDetails].extension[expires].valueInteger = 720
* extension[workflowDetails].extension[created_on].valueDateTime = "2019-12-30T11:45:36.694585Z"
* extension[workflowDetails].extension[modified_on].valueDateTime = "2019-12-30T11:45:37.229399Z"
* extension[workflowDetails].extension[runSummary].extension[active].valueInteger = 0
* extension[workflowDetails].extension[runSummary].extension[completed].valueInteger = 5
* extension[workflowDetails].extension[runSummary].extension[interrupted].valueInteger = 12
* extension[workflowDetails].extension[runSummary].extension[expired].valueInteger = 0