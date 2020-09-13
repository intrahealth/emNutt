Profile:        MheroCommunicationRequest
Parent:         CommunicationRequest
Id:             mhero-communication-request
Title:          "mHero Communication Request Profile"
Description:    "mHero profile for Communication Request."
* recipient MS
* payload MS
* status MS
* extension contains
      MheroCommReqFlowStarts named commReqFlowStarts 0..1 and
      MheroCommReqBroadcastStarts named commReqBroadcastStarts 0..1

Extension:      MheroCommReqRecurrance
Id:             recurrance-cron-expression
Title:          "Cron Expression of the Communication Request"
Description:    "Must be a Cron Expression of the Communication Request if the Communication Request is Reccuring"
* value[x] only string
* valueString 1..1

Extension:      MheroCommReqFlowStarts
Id:             mhero-comm-req-flow-starts
Title:          "mHero Communication Request Flow Starts Extension"
Description:    "Flow starts details of a communication request."
* extension contains
      flow_starts_uuid  1..1 MS and
      contact_globalid  1..* MS and
      created_on        1..1 MS and
      modified_on       1..1 MS and
      flow_uuid         1..1 MS and
      status            1..1 MS
* extension[contact_globalid].value[x] only string
* extension[contact_globalid].valueString 1..1
* extension[created_on].value[x] only dateTime
* extension[created_on].valueDateTime 1..1
* extension[modified_on].value[x] only dateTime
* extension[modified_on].valueDateTime 1..1
* extension[flow_uuid].value[x] only string
* extension[flow_uuid].valueString 1..1
* extension[status].value[x] only string
* extension[status].valueString 1..1
* extension[flow_starts_uuid].value[x] only string
* extension[flow_starts_uuid].valueString 1..1

Extension:      MheroCommReqBroadcastStarts
Id:             mhero-comm-req-broadcast-starts
Title:          "mHero Communication Request Broadcast Starts Extension"
Description:    "Flow starts details of a communication request."
* extension contains
      broadcast_id      1..1 MS and
      contact_globalid  1..* MS and
      created_on        1..1 MS
* extension[broadcast_id].value[x] only string
* extension[broadcast_id].valueString 1..1
* extension[contact_globalid].value[x] only string
* extension[contact_globalid].valueString 1..1
* extension[created_on].value[x] only dateTime
* extension[created_on].valueDateTime 1..1


Instance:       8d5d23b0-2e67-4bac-af8d-15585bd863d5
InstanceOf:     MheroCommunicationRequest
Title:          "mHero Communication Request (Flow) Example"
Usage:          #example
* status = #completed
* extension[MheroCommReqRecurrance].valueString = "14 14 */3 * *"
* extension[commReqFlowStarts].extension[flow_starts_uuid].valueString = "8d5d23b0-2e67-4bac-af8d-15585bd863d5"
* extension[commReqFlowStarts].extension[status].valueString = "pending"
* extension[commReqFlowStarts].extension[flow_uuid].valueString = "b7a4770c-d034-4055-9f21-b17632ef311e"
* extension[commReqFlowStarts].extension[modified_on].valueDateTime = "2020-03-10T14:17:47.817290Z"
* extension[commReqFlowStarts].extension[created_on].valueDateTime = "2020-03-10T14:17:47.817188Z"
* extension[commReqFlowStarts].extension[contact_globalid][0].valueString = "Practitioner/P7344"
* extension[commReqFlowStarts].extension[contact_globalid][1].valueString = "Practitioner/P7364"
* recipient[0] = Reference(Practitioner/P7364)
* recipient[1] = Reference(Practitioner/P7344)
* payload[0].contentAttachment.url = "b7a4770c-d034-4055-9f21-b17632ef311e"

Instance:       716c84d3-5790-43c5-9dcc-e5a149affa23
InstanceOf:     MheroCommunicationRequest
Title:          "mHero Communication Request (Broadcast) Example"
Usage:          #example
* status = #completed
* extension[MheroCommReqRecurrance].valueString = "14 14 */3 * *"
* extension[commReqBroadcastStarts].extension[broadcast_id].valueString = "7540339"
* extension[commReqBroadcastStarts].extension[created_on].valueDateTime = "2020-03-18T12:28:06.768319Z"
* extension[commReqBroadcastStarts].extension[contact_globalid][0].valueString = "Practitioner/P9359"
* extension[commReqBroadcastStarts].extension[contact_globalid][1].valueString = "Practitioner/P9354"
* extension[commReqBroadcastStarts].extension[contact_globalid][2].valueString = "Practitioner/P6209"
* recipient[0] = Reference(Practitioner/P7344)
* recipient[1] = Reference(Practitioner/P7364)
* payload[0].contentString = "Hello World"