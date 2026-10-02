export function extendTransferWorkspaceContract(spec,extend,{object,uuid,label,timestamp}){
 const s=spec.components.schemas,date={type:'string',format:'date'},nullable=v=>({...v,nullable:true}),bool={type:'boolean'},ref=n=>({$ref:'#/components/schemas/'+n});
 s.TransferSources=object({schoolId:uuid,today:date,canDecide:bool,students:{type:'array',maxItems:5000,items:object({id:uuid,fullName:label,code:label,classId:uuid,className:label,yearId:uuid,enrollmentId:uuid,enrollmentVersion:{type:'integer',minimum:1},startsOn:date,endsOn:nullable(date),pendingTransfer:bool})}});
 s.TransferSourcesResponse=object({data:ref('TransferSources'),requestId:label});
 Object.assign(s.Transfer.properties,{studentName:label,studentCode:label,fromClassId:uuid,fromName:label,toName:nullable(label),requestedByName:nullable(label),requestedAt:timestamp,decidedByName:nullable(label),decidedAt:nullable(timestamp)});
 s.TransferCreate.properties.applyNow=bool;
 extend('getClassOverview','getTransferSources','/schools/{schoolId}/transfer-sources','student.transfer.request','TransferSources',false,['SC20','O11'],[{name:'schoolId',in:'path',required:true,schema:uuid},{name:'studentId',in:'query',schema:uuid}]);
}
