export function extendScheduleWorkspaceContract(spec,extend,{object,uuid,label,timestamp,operations}){
 const s=spec.components.schemas,ref=n=>({$ref:'#/components/schemas/'+n}),nil=v=>({...v,nullable:true}),date={type:'string',format:'date'},version={type:'integer',minimum:1},bool={type:'boolean'},list=(items,max=5000)=>({type:'array',items,maxItems:max}),time={type:'string',pattern:'^([01][0-9]|2[0-3]):[0-5][0-9]$'};
 const source=object({lessonId:uuid,lessonVersion:version,draftId:nil(uuid),draftVersion:nil(version)});
 s.ScheduleLessonSource=source;
 s.ScheduleLessonChange=object({id:uuid,schoolId:uuid,classId:uuid,yearId:uuid,date,period:version,kind:{type:'string',enum:['swap','substitute','room','cancel']},subjectId:nil(uuid),teacherMembershipId:nil(uuid),roomId:nil(uuid),reason:label,status:{type:'string',enum:['draft','published']},version,createdBy:uuid,createdAt:timestamp,createdByName:label,className:label,subject:nil(label),teacher:nil(label),room:nil(label),canEdit:bool,canPublish:bool,isPast:bool,source,publicationId:nil(uuid)});
 s.ScheduleWorkspaceLesson=object({id:uuid,version,classId:uuid,yearId:uuid,className:label,date,period:version,start:time,end:time,startsAt:timestamp,endsAt:timestamp,subjectId:uuid,subject:label,color:label,teacherMembershipId:uuid,teacher:label,teacherStatus:label,roomId:nil(uuid),room:label,cancelled:bool,changed:{oneOf:[ref('ScheduleLessonChange'),{type:'object',nullable:true,enum:[null]}]},source,canEdit:bool});
 const choice=object({id:uuid,name:label}),classChoice=object({id:uuid,name:label,yearId:uuid,startsOn:date,endsOn:date,canEdit:bool,canPublish:bool});
 s.ScheduleWorkspace=object({schoolId:uuid,classId:nil(uuid),yearId:nil(uuid),today:date,timezone:label,weekStart:date,canManage:bool,canEdit:bool,canPublish:bool,publicationId:nil(uuid),lessons:list(ref('ScheduleWorkspaceLesson')),changes:list(ref('ScheduleLessonChange'),2000),holidays:list(object({classId:nil(uuid),startsOn:date,endsOn:date,name:label}),200),options:object({classes:list(classChoice,1000),subjects:list(object({id:uuid,name:label,color:label}),1000),teachers:list(choice,1000),rooms:list(object({id:uuid,name:label,capacity:{type:'integer',minimum:0}}),1000)})});
 s.ScheduleChangeCheck=object({classId:uuid,date,period:version,teacherMembershipId:nil(uuid),roomId:nil(uuid),subjectId:nil(uuid)});
 s.ScheduleChangeSave=object({...s.ScheduleChangeCheck.properties,kind:s.ScheduleLessonChange.properties.kind,reason:{type:'string',minLength:5,maxLength:4000},publish:bool,source,expectedPublicationId:nil(uuid)});
 s.ScheduleChangeAction=object({classId:uuid,source,expectedVersion:version,expectedPublicationId:nil(uuid)});
 s.ScheduleChangeConflict=object({kind:{type:'string',enum:['teacher','room','inactive','assignment','history']},message:label});
 s.ScheduleChangeCheckResult=object({conflicts:list(ref('ScheduleChangeConflict'),100)});
 s.ScheduleChangeSaveResult=object({change:ref('ScheduleLessonChange'),conflicts:list(ref('ScheduleChangeConflict'),100)});
 s.ScheduleDiscardResult=object({id:uuid,discarded:bool});
 for(const n of ['ScheduleWorkspace','ScheduleChangeCheckResult','ScheduleChangeSaveResult','ScheduleLessonChange','ScheduleDiscardResult'])s[n+'Response']=object({data:ref(n),requestId:label});
 const root='/schools/{schoolId}/schedule-workspace',params=[{name:'schoolId',in:'path',required:true,schema:uuid}],change=[...params,{name:'changeId',in:'path',required:true,schema:uuid}];
 extend('getClassOverview','getScheduleWorkspace',root,'schedule.read','ScheduleWorkspace',false,['SC32','CL15'],[...params,{name:'weekStart',in:'query',schema:date},{name:'classId',in:'query',schema:uuid},{name:'yearId',in:'query',schema:uuid}]);
 extend('createDuty','checkScheduleLessonChange',root+'/check','schedule.manage','ScheduleChangeCheckResult',false,['SC32','CL15'],params,'ScheduleChangeCheck');
 extend('createDuty','saveScheduleLessonChange',root+'/changes','schedule.manage','ScheduleChangeSaveResult',false,['SC32','CL15'],params,'ScheduleChangeSave');
 for(const [id,action,response] of [['publishScheduleLessonChange','publish','ScheduleLessonChange'],['discardScheduleLessonChange','discard','ScheduleDiscardResult']])extend('createDuty',id,root+'/changes/{changeId}/'+action,action==='publish'?'schedule.manage+schedule.publish':'schedule.manage',response,false,['SC32','CL15'],change,'ScheduleChangeAction');
 const timetable='/schools/{schoolId}/classes/{classId}/timetables/{timetableId}/discard';
 extend('createDuty','discardTimetable',timetable,'schedule.manage','ScheduleDiscardResult',false,['SC32','CL15'],[...params,...['classId','timetableId'].map(name=>({name,in:'path',required:true,schema:uuid}))],'VersionCommand');
 for(const paths of Object.values(spec.paths))for(const op of Object.values(paths))if(/^(getScheduleWorkspace|checkScheduleLessonChange|saveScheduleLessonChange|publishScheduleLessonChange|discardScheduleLessonChange|discardTimetable)$/.test(op?.operationId??'')){
  op.tags=['Schedule'];op.description='Scoped native weekly timetable and durable lesson change drafts; source versions, current permissions and conflicts checked atomically before publication.';
  Object.assign(operations.find(v=>v.id===op.operationId),{tag:'Schedule',description:op.description});
  if(op.operationId!=='getScheduleWorkspace'&&op.responses['201']){op.responses['200']=op.responses['201'];delete op.responses['201'];}
 }
}
