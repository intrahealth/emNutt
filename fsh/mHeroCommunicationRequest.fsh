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
Id:             sms-cron-expression-schedule
Title:          "Cron Expression of the Communication Request"
Description:    "Must be a Cron Expression of the Communication Request if the Communication Request is Reccuring"
* extension contains
      frequency  1..1 MS and
      sendCategory  1..* MS and
      cronExpression        1..1 MS and
      cronExpressionParsed        1..1 MS
* extension[frequency].value[x] only string
* extension[frequency].valueString 1..1
* extension[sendCategory].value[x] only string
* extension[sendCategory].valueString 0..1
* extension[cronExpression].value[x] only string
* extension[cronExpression].valueString 0..1
* extension[cronExpressionParsed].value[x] only string
* extension[cronExpressionParsed].valueString 0..1

Extension:      MheroCommReqFlowStarts
Id:             mhero-comm-req-flow-starts
Title:          "mHero Communication Request Flow Starts Extension"
Description:    "Flow starts details of a communication request."
* extension contains
      flow_starts_uuid     1..1 MS and
      created_on           1..1 MS and
      modified_on          1..1 MS and
      status               1..1 MS and
      responded            1..1 MS and
      exit_type            1..1 MS and
      exited_on            1..1 MS and
      rapidpro_contact_id  1..1 MS
* extension[created_on].value[x] only dateTime
* extension[created_on].valueDateTime 1..1
* extension[modified_on].value[x] only dateTime
* extension[modified_on].valueDateTime 1..1
* extension[status].value[x] only string
* extension[status].valueString 1..1
* extension[flow_starts_uuid].value[x] only string
* extension[flow_starts_uuid].valueString 1..1
* extension[responded].value[x] only string
* extension[responded].valueString 0..1
* extension[exit_type].value[x] only string
* extension[exit_type].valueString 0..1
* extension[exited_on].value[x] only dateTime
* extension[exited_on].valueDateTime 0..1
* extension[rapidpro_contact_id].value[x] only string
* extension[rapidpro_contact_id].valueString 0..1

Extension:      MheroCommReqBroadcastStarts
Id:             mhero-comm-req-broadcast-starts
Title:          "mHero Communication Request Broadcast Starts Extension"
Description:    "Flow starts details of a communication request."
* extension contains
      broadcast_id      1..1 MS and
      created_on        1..1 MS
* extension[broadcast_id].value[x] only string
* extension[broadcast_id].valueString 1..1
* extension[created_on].value[x] only dateTime
* extension[created_on].valueDateTime 1..1


Instance:       8d5d23b0-2e67-4bac-af8d-15585bd863d5
InstanceOf:     MheroCommunicationRequest
Title:          "mHero Communication Request (Flow) Example"
Usage:          #example
* status = #completed
* extension[MheroCommReqRecurrance].extension[frequency].valueString = "once"
* extension[MheroCommReqRecurrance].extension[sendCategory].valueString = "later"
* extension[MheroCommReqRecurrance].extension[cronExpression].valueString = "06 14 05 09 *"
* extension[MheroCommReqRecurrance].extension[cronExpressionParsed].valueString = "At 02:06 PM, on day 05 of the month, only in September"
* extension[commReqFlowStarts].extension[flow_starts_uuid].valueString = "8d5d23b0-2e67-4bac-af8d-15585bd863d5"
* extension[commReqFlowStarts].extension[status].valueString = "pending"
* extension[commReqFlowStarts].extension[modified_on].valueDateTime = "2020-03-10T14:17:47.817290Z"
* extension[commReqFlowStarts].extension[created_on].valueDateTime = "2020-03-10T14:17:47.817188Z"
* extension[commReqFlowStarts].extension[exited_on].valueDateTime = "2020-03-10T00:45:01.647066Z"
* extension[commReqFlowStarts].extension[exit_type].valueString = "expired"
* extension[commReqFlowStarts].extension[rapidpro_contact_id].valueString = "00fe8d28-37f0-4e88-83dc-6aa41725301d"
* extension[commReqFlowStarts].extension[responded].valueString = 'No'
* recipient[0] = Reference(Practitioner/P7364)
* recipient[1] = Reference(Practitioner/P7344)
* payload[0].contentAttachment.url = "b7a4770c-d034-4055-9f21-b17632ef311e"

Instance:       716c84d3-5790-43c5-9dcc-e5a149affa23
InstanceOf:     MheroCommunicationRequest
Title:          "mHero Communication Request (Broadcast) Example"
Usage:          #example
* status = #completed
* extension[MheroCommReqRecurrance].extension[frequency].valueString = "recurring"
* extension[MheroCommReqRecurrance].extension[cronExpression].valueString = "14 14 */3 * *"
* extension[MheroCommReqRecurrance].extension[cronExpression].valueString = "At 02:14 PM, every 3 days"
* extension[commReqBroadcastStarts].extension[broadcast_id].valueString = "7540339"
* extension[commReqBroadcastStarts].extension[created_on].valueDateTime = "2020-03-18T12:28:06.768319Z"
* recipient[0] = Reference(Practitioner/P7344)
* recipient[1] = Reference(Practitioner/P7364)
* payload[0].contentString = "Hello World"