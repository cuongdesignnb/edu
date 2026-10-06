export function applyAllRemainingContract(spec,extendOperation,operations){
 const s=spec.components.schemas,ref=n=>({$ref:'#/components/schemas/'+n}),str={type:'string'},uuid={...str,format:'uuid'},dt={...str,format:'date-time'},day={...str,format:'date'},v={type:'integer',minimum:0},arr=items=>({type:'array',items,maxItems:5000}),obj=(properties,required=Object.keys(properties))=>({type:'object',properties,...(required.length?{required}:{}),additionalProperties:false});
 // These aggregate workspaces contain native row DTOs; mutation inputs remain closed schemas.
 s.NotebookData={type:'object',additionalProperties:true};s.NotebookDataResponse=obj({data:ref('NotebookData'),requestId:str});s.NotebookDataPage=obj({data:arr(ref('NotebookData')),requestId:str});
 const base='/schools/{schoolId}/classes/{classId}/notebook',params=['schoolId','classId'].map(name=>({name,in:'path',required:true,schema:uuid})),week={name:'weekId',in:'query',schema:uuid};
 const add=(id,suffix,permission,body,read=false,list=false)=>{extendOperation(read?'getClass':'createRole',id,base+suffix,permission,'NotebookData',list,[],read?[...params,...(id==='getClassNotebookWorkspace'?[week,{name:'onDate',in:'query',schema:day}]:[])]:params,body);const op=spec.paths[base+suffix][read?'get':'post'];if(!read){op.responses['200']=op.responses['201'];delete op.responses['201'];}};
 s.OfficerAssign=obj({enrollmentId:uuid,role:{...str,enum:['GROUP_LEADER','CLASS_LEADER','LABOR_VICE']},groupId:uuid,positionId:uuid,validFrom:day,validUntil:{...day,nullable:true},pin:{...str,minLength:6,maxLength:128}},['enrollmentId','role','validFrom']);
 s.OfficerRotate=obj({assignmentId:uuid,expectedVersion:v,pin:{...str,minLength:6,maxLength:128}},['assignmentId','expectedVersion']);
 s.OfficerRevoke=obj({assignmentId:uuid,expectedVersion:v,reason:{...str,minLength:5,maxLength:2000}});
 s.OfficerWeekAction=obj({assignmentId:uuid,weekId:uuid,expectedVersion:v,reason:{...str,minLength:5,maxLength:2000}});
 s.WeekDeadline=obj({weekId:uuid,expectedVersion:v,submitDeadline:dt,lockDeadline:dt,reason:{...str,minLength:5,maxLength:2000}});
 const time={...str,pattern:'^([01]\\d|2[0-3]):[0-5]\\d$'};
 s.NotebookSettings=obj({expectedVersion:v,settings:obj({weeklyDeadlineDay:{type:'integer',minimum:0,maximum:6},weeklySubmitTime:time,weeklyLockTime:time,officerTimetableEnabled:{type:'boolean'},reminderTemplate:{...str,maxLength:2000}},[])});
 s.NotebookSettings.properties.settings.properties.periodicClassificationPolicy=obj({thresholds:{type:'array',minItems:1,maxItems:20,items:obj({label:{...str,minLength:1,maxLength:100},minimum_score:{...str,pattern:'^-?[0-9]+(\\.[0-9]{1,2})?$'}})}});
 s.NotebookSettings.properties.settings.properties.zaloTemplate={...str,maxLength:2000};
 extendOperation('getClass','getClassZaloHelper',base+'/zalo','conduct.read+guardian.read','NotebookData',false,[],[...params,{name:'publicationId',in:'query',schema:uuid}]);
 s.PositionPolicy=obj({positionId:uuid,expectedVersion:v,name:{...str,minLength:1,maxLength:120},description:{...str,maxLength:1000},weeklyBonus:{type:'number',minimum:0,maximum:1000},officerRole:{...str,enum:['GROUP_LEADER','CLASS_LEADER','LABOR_VICE',null],nullable:true}});
 s.CopyNotebookSchedule=obj({weekId:uuid,kind:{...str,enum:['DUTY','TIMETABLE']}});s.WithdrawNotebookTimetable=obj({weekId:uuid,reason:{...str,minLength:5,maxLength:2000}});
 for(const [id,suffix,permission,body,read]of [
 ['getClassNotebookWorkspace','','group.manage',undefined,true],['assignClassOfficer','/officers/assign','group.manage','OfficerAssign'],['rotateClassOfficerPin','/officers/pin','group.manage','OfficerRotate'],['revokeClassOfficer','/officers/revoke','group.manage','OfficerRevoke'],['reopenClassOfficerWeek','/weeks/reopen','conduct.review','OfficerWeekAction'],['relockClassOfficerWeek','/weeks/relock','conduct.review','OfficerWeekAction'],['remindClassOfficer','/weeks/remind','conduct.review','OfficerWeekAction'],['saveClassWeekDeadline','/weeks/deadline','conduct.review','WeekDeadline'],['saveClassNotebookSettings','/settings','group.manage','NotebookSettings'],['saveClassPositionPolicy','/positions/policy','group.manage','PositionPolicy'],['copyClassNotebookSchedule','/schedule/copy','class.read','CopyNotebookSchedule'],['withdrawClassNotebookTimetable','/schedule/withdraw','schedule.manage+schedule.publish','WithdrawNotebookTimetable']])add(id,suffix,permission,body,read);
 const periodic=base+'/periodic';s.PeriodicCalculate=obj({periodType:{...str,enum:['MONTH','TERM','YEAR']},periodKey:{...str,minLength:1,maxLength:40},aggregation:{...str,enum:['AVERAGE','SUM']},expectedVersion:v},['periodType','periodKey','aggregation']);
 extendOperation('getClass','getClassPeriodicOptions',periodic+'/options','conduct.read','NotebookData',false,[],params);
 s.PeriodicAction=obj({periodId:uuid,expectedVersion:v});s.PeriodicOverride=obj({periodId:uuid,expectedVersion:v,studentId:uuid,classification:{...str,minLength:1,maxLength:200},reason:{...str,maxLength:2000}},['periodId','expectedVersion','studentId','classification']);
 for(const [id,suffix,permission,body,read,list]of [['listClassPeriodicConduct','','conduct.read',undefined,true,true],['calculateClassPeriodicConduct','/calculate','conduct.review','PeriodicCalculate'],['overrideClassPeriodicConduct','/override','conduct.review','PeriodicOverride'],['reviewClassPeriodicConduct','/review','conduct.review','PeriodicAction'],['finalizeClassPeriodicConduct','/finalize','conduct.lock','PeriodicAction'],['publishClassPeriodicConduct','/publish','conduct.publish','PeriodicAction']]){
  extendOperation(read?'getClass':'createRole',id,periodic+suffix,permission,'NotebookData',!!list,[],params,body);if(!read){const op=spec.paths[periodic+suffix].post;op.responses['200']=op.responses['201'];delete op.responses['201'];}
 }
 const publicBase='/public/classes/{publicClassSlug}/officer',publicParams=[{name:'publicClassSlug',in:'path',required:true,schema:{...str,pattern:'^[a-f0-9]{24}$'}}];
 s.OfficerLogin=obj({assignmentId:uuid,pin:{...str,minLength:6,maxLength:128}});
 const state={weekId:uuid,expectedVersion:v};s.OfficerSubmit=obj(state);s.OfficerLogout=obj({});
 s.OfficerEntry=obj({...state,enrollmentIds:{...arr(uuid),minItems:1,maxItems:100,uniqueItems:true},ruleId:uuid,occurredOn:day,occurrences:{type:'integer',minimum:1,maximum:50},manualDelta:{...str,pattern:'^-?[0-9]+(\\.[0-9]{1,2})?$'},note:{...str,minLength:3,maxLength:500},recordId:uuid,recordVersion:v,exclude:{type:'boolean'}},[...Object.keys(state),'enrollmentIds','ruleId','occurredOn','occurrences']);
 s.OfficerDuty=obj({...state,copyPrevious:{type:'boolean'},assignments:s.DutyCreate.properties.assignments,groupAssignments:s.DutyCreate.properties.groupAssignments},Object.keys(state));
 s.OfficerTimetable=obj({...state,copyPrevious:{type:'boolean'},entries:s.TimetableCreate.properties.entries},Object.keys(state));
 spec.components.securitySchemes.classOfficerCookie={type:'apiKey',in:'cookie',name:'edu_officer'};spec.components.securitySchemes.evidenceCookie={type:'apiKey',in:'cookie',name:'edu_evidence'};
 const publicAdd=(id,suffix,body,auth='officer',read=false)=>{
  extendOperation(read?'getPublicSchoolWorkspace':'login',id,publicBase+suffix,'officer.self','NotebookData',false,[],[...publicParams,...(read?[week,{name:'onDate',in:'query',schema:day}]:[])],body);
  const op=operations.find(o=>o.id===id);op.auth=auth;op.scope='none';const actual=spec.paths[publicBase+suffix][read?'get':'post'];actual.security=auth==='none'?[]:[{classOfficerCookie:[]}];actual['x-scope']='none';
 };
 publicAdd('loginClassOfficer','/login','OfficerLogin','none');publicAdd('getClassOfficerWorkspace','','', 'officer',true);
 publicAdd('saveClassOfficerEntry','/entries','OfficerEntry');publicAdd('submitClassOfficerWeek','/submit','OfficerSubmit');publicAdd('saveClassOfficerDuty','/duty','OfficerDuty');publicAdd('saveClassOfficerTimetable','/timetable','OfficerTimetable');publicAdd('logoutClassOfficer','/logout','OfficerLogout');
 s.EvidenceAccessIssue=obj({participantId:uuid,expiresAt:dt});s.EvidenceAccessRevoke=obj({accessId:uuid,expectedVersion:v,reason:{...str,minLength:5,maxLength:2000}});s.EvidenceAccessExchange=obj({accessToken:{...str,minLength:32,maxLength:128}});
 for(const [id,suffix,permission,body,read,list]of [['issueStudentEvidenceAccess','/evidence-access/issue','evidence.manage','EvidenceAccessIssue'],['revokeStudentEvidenceAccess','/evidence-access/revoke','evidence.manage','EvidenceAccessRevoke'],['getStudentEvidenceAccesses','/evidence-access','evidence.manage',undefined,true,true],['getActivityReminders','/activity-reminders','activity.manage',undefined,true,true]]){
  extendOperation(read?'getClass':'createRole',id,base+suffix,permission,'NotebookData',!!list,[],[...params,...(read?[{name:'activityId',in:'query',required:true,schema:uuid}]:[])],body);if(!read){const op=spec.paths[base+suffix].post;op.responses['200']=op.responses['201'];delete op.responses['201'];}
 }
 const evidenceBase='/public/classes/{publicClassSlug}/evidence';
 for(const [id,suffix,body,auth,read]of [['exchangeStudentEvidenceAccess','/exchange','EvidenceAccessExchange','none'],['getStudentEvidenceWorkspace','',undefined,'evidence',true],['uploadStudentEvidence','/files',undefined,'evidence'],['downloadStudentEvidence','/files/{fileId}',undefined,'evidence',true]]){
  extendOperation(read?'getPublicSchoolWorkspace':'login',id,evidenceBase+suffix,'evidence.self','NotebookData',false,[],[...publicParams,...(id==='downloadStudentEvidence'?[{name:'fileId',in:'path',required:true,schema:uuid}]:[])],body);
  const meta=operations.find(o=>o.id===id),actual=spec.paths[evidenceBase+suffix][read?'get':'post'];meta.auth=auth;meta.scope='none';actual['x-scope']='none';actual.security=auth==='none'?[]:[{evidenceCookie:[]}];
  if(id==='uploadStudentEvidence'){meta.request=null;actual.requestBody={required:true,content:{'multipart/form-data':{schema:obj({file:{type:'string',format:'binary'},caption:{...str,maxLength:200}},['file'])}}};}
  if(id==='downloadStudentEvidence')actual.responses['200']={description:'Authorized student evidence download',content:{'application/octet-stream':{schema:{type:'string',format:'binary'}}}};
 }
 s.ParentConduct.properties.periodType={...str,enum:['WEEK','MONTH','TERM','YEAR']};s.ParentConduct.properties.periodKey=str;
 s.ClassWorkspaceHeader.properties.tabs.maxItems=20;
 s.ClassWorkspaceHeader.properties.tabs.items.properties.key.enum=['overview','students','attendance','conduct','notebook','periodic','timetable','groups','duties','seating','activities','announcements','files','reports','public-portal','notebook-settings'];
 s.ClassWorkspaceHeader.properties.tabs.items.properties.path.enum=['','/students','/attendance','/conduct','/notebook','/periodic','/timetable','/groups','/duties','/seating','/activities','/announcements','/files','/reports','/public-portal','/notebook-settings'];
 s.StaffCredentialReset=obj({expectedVersion:v,password:{...str,minLength:12,maxLength:128},reason:{...str,minLength:5,maxLength:1000}});
 s.StaffSessionRevoke=obj({expectedVersion:v,reason:{...str,minLength:5,maxLength:1000}});
 for(const [id,suffix,body]of [['resetSchoolStaffPassword','password-reset','StaffCredentialReset'],['revokeSchoolStaffSessions','revoke-sessions','StaffSessionRevoke']]){
  const path='/schools/{schoolId}/members/{memberId}/'+suffix;
  extendOperation('createRole',id,path,'member.manage+role.manage','NotebookData',false,[],[{name:'schoolId',in:'path',required:true,schema:uuid},{name:'memberId',in:'path',required:true,schema:uuid}],body);
  spec.paths[path].post.responses['200']=spec.paths[path].post.responses['201'];delete spec.paths[path].post.responses['201'];
 }
 const deadlineFields={weeklyDeadlineDay:{type:'integer',minimum:0,maximum:6},weeklySubmitTime:{...str,pattern:'^([01][0-9]|2[0-3]):[0-5][0-9]$'},weeklyLockTime:{...str,pattern:'^([01][0-9]|2[0-3]):[0-5][0-9]$'}};
 for(const n of ['Settings','SettingsPatch'])Object.assign(s[n].properties,deadlineFields);
 Object.assign(s.ExportCreate.properties,{periodId:uuid,periodType:{...str,enum:['WEEK','MONTH','TERM','YEAR']}});
 for(const path of Object.values(spec.paths))for(const op of Object.values(path))if(['getClassReport','getSchoolReport'].includes(op?.operationId))op.parameters.push({name:'periodId',in:'query',schema:uuid},{name:'periodType',in:'query',schema:{...str,enum:['WEEK','MONTH','TERM','YEAR']}});
 if(s.Publication?.properties.kind)s.Publication.properties.kind.enum.push('PERIODIC_CONDUCT');
 s.PublicClassConduct.properties.periodType={...str,enum:['WEEK','MONTH','TERM','YEAR']};s.PublicClassConduct.properties.periodKey=str;
 s.PublicClassPortal.properties.periodic=arr(obj({publicationId:uuid,periodType:{...str,enum:['MONTH','TERM','YEAR']},periodKey:str,periodLabel:str,publishedAt:dt,students:arr(obj({studentId:uuid,fullName:str,finalPoints:str,classification:{...str,nullable:true}})),ranking:arr(obj({studentId:uuid,rank:{type:'integer'},fullName:str,finalPoints:str,classification:{...str,nullable:true}}))}));
 for(const path of Object.values(spec.paths))for(const op of Object.values(path))if(op?.operationId==='listParentConduct')op.parameters.push({name:'periodType',in:'query',schema:{...str,enum:['WEEK','MONTH','TERM','YEAR']}});
 for(const n of ['ActivityCreate','ActivityPatch','Activity'])Object.assign(s[n].properties,{startsAt:{...dt,nullable:true},maxFiles:{type:'integer',minimum:1,maximum:20}});
 // Workspace inputs/output use their own native Activity DTO definitions.
 for(const [n,def]of Object.entries(s))if(n.startsWith('ActivityWorkspace')&&def.properties?.dueAt)Object.assign(def.properties,{startsAt:{...dt,nullable:true},maxFiles:{type:'integer',minimum:1,maximum:20}});
 s.ActivityWorkspaceHistory.properties.actorId={...s.ActivityWorkspaceHistory.properties.actorId,nullable:true};
}
