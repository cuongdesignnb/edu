/** Contract additions owned by the activities/files integration. */
export function applyActivitiesWorkspaceContract(spec,extendOperation){
 const str={type:'string'},uuid={type:'string',format:'uuid'},nullable=s=>({...s,nullable:true}),n={type:'integer',minimum:0},v={type:'integer',minimum:1},b={type:'boolean'},date={type:'string',format:'date'},stamp={type:'string',format:'date-time'},ref=name=>({$ref:'#/components/schemas/'+name}),obj=(properties,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false}),arr=(items,maxItems=10000)=>({type:'array',items,maxItems});
 const schemas=spec.components.schemas;
 schemas.ActivityWorkspaceSource=obj({id:uuid,version:v,dataVersion:v,publicationId:nullable(uuid)});
 schemas.ActivityWorkspaceItem=obj({id:uuid,version:v,dataVersion:v,createdAt:stamp,updatedAt:stamp,classId:uuid,yearId:uuid,title:str,description:str,dueAt:stamp,dueDate:date,evidenceRequired:b,status:{type:'string',enum:['DRAFT','ASSIGNED','CLOSED']},illustration:{type:'string',enum:['trophy','stem','clean','book','heart']},createdBy:uuid,createdByName:nullable(str),publicationId:nullable(uuid),publishedSourceVersion:nullable(v)});
 schemas.ActivityWorkspaceStudent=obj({id:uuid,enrollmentId:uuid,fullName:str,code:str,groupId:nullable(uuid),groupName:nullable(str)});
 schemas.ActivityWorkspaceParticipant=obj({id:uuid,version:v,activityId:uuid,enrollmentId:uuid,studentId:uuid,fullName:str,code:str,status:{type:'string',enum:['ASSIGNED','SUBMITTED','APPROVED','NEEDS_REVISION','EXCUSED']},reviewNote:nullable(str),updatedAt:stamp,stillEnrolled:b,groupName:nullable(str)});
 schemas.ActivityWorkspaceEvidence=obj({id:uuid,version:v,participantId:uuid,activityId:uuid,studentId:uuid,fileId:uuid,submittedBy:uuid,uploadedByName:nullable(str),createdAt:stamp,status:{type:'string',enum:['SUBMITTED','APPROVED','NEEDS_REVISION','REJECTED']},caption:nullable(str),reviewReason:nullable(str),shareWithGuardian:b,file:ref('File')});
 schemas.ActivityWorkspaceHistory=obj({id:uuid,at:stamp,action:str,actorId:uuid,actorName:nullable(str),entityType:str,entityId:uuid,reason:nullable(str),activityId:nullable(uuid)});
 schemas.ClassActivitiesWorkspace=obj({schoolId:uuid,yearId:uuid,classId:uuid,today:date,timezone:str,readOnly:b,canManage:b,canEvidence:b,canReview:b,canPublish:b,canReadEvidence:b,students:arr(ref('ActivityWorkspaceStudent'),5000),groups:arr(obj({id:uuid,name:str,size:n}),100),activities:arr(ref('ActivityWorkspaceItem'),1000),participants:arr(ref('ActivityWorkspaceParticipant')),evidence:{...arr(ref('ActivityWorkspaceEvidence')),nullable:true},history:arr(ref('ActivityWorkspaceHistory'),2000)});
 schemas.ActivityWorkspaceCommand=obj({source:{oneOf:[ref('ActivityWorkspaceSource'),{type:'object',nullable:true,enum:[null]}]},action:{type:'string',enum:['draft','save','assign','close','reopen','publish']},input:ref('ActivityCreate')},['source','action']);
 const selected=arr(obj({id:uuid,expectedVersion:v}),200);selected.minItems=1;
 schemas.EvidenceBatchCommand=obj({items:selected,decision:{type:'string',enum:['APPROVED','NEEDS_REVISION','REJECTED']},reason:{type:'string',minLength:3,maxLength:4000},shareWithGuardian:b});
 schemas.ParticipantBatchCommand=obj({activityId:uuid,items:selected,status:{type:'string',enum:['ASSIGNED','SUBMITTED','APPROVED','NEEDS_REVISION','EXCUSED']},reason:{type:'string',minLength:3,maxLength:4000}});
 schemas.ActivityBatchReceipt=obj({count:n});
 schemas.ClassFileWorkspaceItem=obj({...structuredClone(schemas.File.properties),share:{type:'string',enum:['internal','class_parents','student_parent']},studentId:nullable(uuid),studentName:nullable(str),ownerName:nullable(str)},[...schemas.File.required,'share','studentId','studentName','ownerName']);
 schemas.ClassFilesWorkspace=obj({schoolId:uuid,yearId:uuid,classId:uuid,readOnly:b,files:arr(ref('ClassFileWorkspaceItem'),1000),students:arr(obj({id:uuid,fullName:str}),5000)});
 schemas.ClassFileUpdate=obj({expectedVersion:v,share:{type:'string',enum:['internal','class_parents','student_parent']},studentId:uuid,status:{type:'string',enum:['active','archived']}},['expectedVersion']);
 for(const name of ['ActivityWorkspaceItem','ClassActivitiesWorkspace','ClassFilesWorkspace','ClassFileWorkspaceItem','ActivityBatchReceipt'])schemas[name+'Response']=obj({data:ref(name),requestId:str});
 const base='/schools/{schoolId}/academic-years/{yearId}/classes/{classId}';
 for(const [template,id,suffix,permission,response,request] of [
  ['getActivity','getClassActivitiesWorkspace','/activities-workspace','activity.read','ClassActivitiesWorkspace'],
  ['assignActivity','saveActivityWorkspace','/activities-workspace/save','activity.manage','ActivityWorkspaceItem','ActivityWorkspaceCommand'],
  ['reviewEvidence','reviewEvidenceBatch','/evidence/batch-review','evidence.review','ActivityBatchReceipt','EvidenceBatchCommand'],
  ['setParticipantStatus','setActivityParticipantStatuses','/activities/participant-statuses','activity.review','ActivityBatchReceipt','ParticipantBatchCommand'],
  ['getFile','getClassFilesWorkspace','/files-workspace','file.manage','ClassFilesWorkspace'],
  ['archiveFile','updateClassFile','/files/{fileId}/update','file.manage','ClassFileWorkspaceItem','ClassFileUpdate']]){
  extendOperation(template,id,base+suffix,permission,response,false,['CL17','CL18','CL19','CL20','CL24'],undefined,request);
  const op=Object.values(spec.paths[base+suffix])[0];op.description='Current school/year/class authority; real activity, evidence and private file storage with versioned commands and exact parent recipients.';
 }
}
