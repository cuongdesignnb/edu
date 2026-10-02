/** Teacher workspace receipts use current assignment ownership and independent capabilities. */
export function extendTeacherWorkspaceContract(spec,extend,{object,uuid,label,count,timestamp}){
 const s=spec.components.schemas,ref=n=>({$ref:'#/components/schemas/'+n}),nullable=v=>({...v,nullable:true}),date={type:'string',format:'date'},time={type:'string',pattern:'^([01][0-9]|2[0-3]):[0-5][0-9]$'},array=(items,maxItems)=>({type:'array',items,maxItems}),bool={type:'boolean'};
 s.TeacherWorkspaceLesson=object({id:uuid,classId:uuid,yearId:uuid,className:label,date,periodNumber:nullable({type:'integer',minimum:1}),startsAtLocal:time,endsAtLocal:time,subjectName:label,roomName:nullable(label),status:{type:'string',enum:['SCHEDULED','CANCELLED']},changeReason:nullable(label),canAttend:bool});
 s.TeacherWorkspaceTask=object({id:label,kind:{type:'string',enum:['attendance','conduct','evidence','announcement','groups']},title:label,detail:label,classId:uuid,yearId:uuid,className:label,targetType:{type:'string',enum:['attendance','lesson','conduct-period','activity','announcement','adjustment','groups']},targetId:uuid,status:label,tone:{type:'string',enum:['danger','warning','info','neutral']},dueAt:nullable(timestamp)});
 s.TeacherWorkspaceTasks=object({schoolId:uuid,today:date,asOf:timestamp,tasks:array(ref('TeacherWorkspaceTask'),2000)});
 s.TeacherWorkspaceSchedule=object({schoolId:uuid,today:date,asOf:timestamp,weekStart:date,days:array(object({date,holiday:nullable(label),lessons:array(ref('TeacherWorkspaceLesson'),500)}),7)});
 const attendance=object({status:{type:'string',enum:['none','saved','locked','published']},total:count,present:count,late:count,excused:count,unexcused:count,unmarked:count});
 s.TeacherWorkspaceHomeClass=object({id:uuid,yearId:uuid,name:label,motto:nullable({type:'string',maxLength:300}),isHomeroom:bool,subjects:array(label,100),size:nullable(count),room:nullable(label),nextLesson:nullable(structuredClone(s.TeacherWorkspaceLesson)),attendance:nullable(attendance),pendingConduct:nullable(count)});
 s.TeacherWorkspaceHome=object({schoolId:uuid,today:date,asOf:timestamp,membershipId:uuid,classes:array(ref('TeacherWorkspaceHomeClass'),500),tasks:array(ref('TeacherWorkspaceTask'),2000),unread:count,feed:array(object({id:label,action:label,entityLabel:label,at:timestamp}),6)});
 for(const name of ['TeacherWorkspaceHome','TeacherWorkspaceTasks','TeacherWorkspaceSchedule'])s[name+'Response']=object({data:ref(name),requestId:label});
 const params=[{name:'schoolId',in:'path',required:true,schema:uuid}];
 extend('getTeacherOverview','getTeacherWorkspaceHome','/schools/{schoolId}/me/teacher-workspace','teacher.self','TeacherWorkspaceHome',false,['TE01'],params);
 extend('getTeacherOverview','getTeacherWorkspaceTasks','/schools/{schoolId}/me/teacher-workspace/tasks','teacher.self','TeacherWorkspaceTasks',false,['TE04'],params);
 extend('getTeacherOverview','getTeacherWorkspaceSchedule','/schools/{schoolId}/me/teacher-workspace/schedule','teacher.self','TeacherWorkspaceSchedule',false,['TE03'],[...params,{name:'weekStart',in:'query',required:true,schema:date}]);
}
