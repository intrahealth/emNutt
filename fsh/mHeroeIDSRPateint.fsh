Profile:        MheroeIDSRPatient
Parent:         Patient
Id:             mhero-eidsr-patient
Title:          "mHero eIDSR Patient Profile"
Description:    "mHero eIDSR profile for Patient."
* identifier MS
* active MS
* name MS
* telecom MS
* gender MS
* birthDate MS
* deceasedBoolean MS
* deceasedDateTime MS
* address MS
* maritalStatus MS
* multipleBirthBoolean MS
* multipleBirthInteger MS
* contact MS
* communication MS
* link MS
* extension contains
      MheroeIDSRSuspectedCase named suspectedCase 1..1

Extension:      MheroeIDSRSuspectedCase
Id:             mhero-eidsr-suspected-case
Title:          "mHero eIDSR Suspected Case Extension"
Description:    "mHero eIDSR Suspected Case"
* ^context.type = #element
* ^context.expression = "Patient"
* extension contains
      diseaseCode 1..1 MS and
      reporterID 1..1 MS and
      age 0..1 MS and
      caseID 0..1 MS and
      specimenCollected 0..1 MS and
      communityDetection 0..1 MS and
      internationalTravel 0..1 MS
* extension[diseaseCode].value[x] only string
* extension[diseaseCode].valueString 1..1
* extension[reporterID].value[x] only Reference
* extension[reporterID].valueReference 1..1
* extension[reporterID].valueReference only Reference(Practitioner)
* extension[reporterID].valueReference.reference 1..1
* extension[reporterID].valueReference.type 0..0
* extension[reporterID].valueReference.identifier 0..0
* extension[reporterID].valueReference.display 0..0
* extension[age].value[x] only integer
* extension[age].valueInteger 1..1
* extension[caseID].value[x] only string
* extension[caseID].valueString 1..1
* extension[specimenCollected].value[x] only boolean
* extension[specimenCollected].valueBoolean 1..1
* extension[communityDetection].value[x] only boolean
* extension[communityDetection].valueBoolean 1..1
* extension[internationalTravel].value[x] only boolean
* extension[internationalTravel].valueBoolean 1..1

Instance:       a4g95gd4-64ce-69d8-94f3-48ed235e3388
InstanceOf:     MheroeIDSRPatient
Title:          "mHero eiDSR Suspected Case Example"
Usage:          #example
* gender = #male
* extension[suspectedCase].extension[diseaseCode].valueString = "covid19"
* extension[suspectedCase].extension[reporterID].valueReference = Reference(Practitioner/3fbb96d3-bb8a-41c6-b1a4-8f4f11460899)
* extension[suspectedCase].extension[age].valueInteger = 32
* extension[suspectedCase].extension[caseID].valueString = "LB-MND"
* extension[suspectedCase].extension[specimenCollected].valueBoolean = true
* extension[suspectedCase].extension[communityDetection].valueBoolean = true
* extension[suspectedCase].extension[internationalTravel].valueBoolean = false