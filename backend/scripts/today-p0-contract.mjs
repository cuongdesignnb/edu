export function applyTodayP0Contract(spec,extendOperation,permissions,roles,operations){
 const s=spec.components.schemas,ref=n=>({$ref:'#/components/schemas/'+n}),str={type:'string'},uuid={...str,format:'uuid'},date={...str,format:'date-time'};
 const obj=(properties,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
 if(!permissions.includes('member.create_direct'))permissions.push('member.create_direct');
 roles.roles.find(r=>r.code==='SCHOOL_ADMIN').actions.push('member.create_direct');
 roles.roles.push({code:'TEACHER',label:'Giáo viên',scope:'SCHOOL',actions:['teacher.self','school.read','year.read'],notes:'Quyền lớp/môn chỉ có sau phân công riêng.'});
 const fields={displayName:{...str,minLength:3,maxLength:200},email:{...str,format:'email',maxLength:320},roleId:uuid,department:{...str,maxLength:120},validFrom:date,validUntil:{...date,nullable:true},assignment:structuredClone(s.AssignmentCreate)};
 delete fields.assignment.properties.memberId;fields.assignment.required=fields.assignment.required.filter(k=>k!=='memberId');
 s.DirectStaffCreate=obj({...fields,password:{...str,minLength:12,maxLength:256},mustChangePassword:{type:'boolean'}},['displayName','email','roleId','password','mustChangePassword']);
 s.DirectStaffAssign=obj(fields,['displayName','email','roleId']);
 s.DirectStaff=obj({id:uuid,userId:uuid,displayName:str,email:str,status:{...str,enum:['ACTIVE']},mustChangePassword:{type:'boolean'}});
 s.DirectStaffResponse=obj({data:ref('DirectStaff'),requestId:str});
 for(const [id,path,body]of [['createSchoolStaffAccount','/staff-accounts','DirectStaffCreate'],['assignExistingSchoolStaffAccount','/staff-accounts/assign-existing','DirectStaffAssign']])
  extendOperation('inviteSchoolStaff',id,'/schools/{schoolId}'+path,'member.create_direct+role.manage','DirectStaff',false,['SC10'],undefined,body);
 for(const name of ['ExportCreate','ExportJob'])s[name].properties.reportType.enum.push('parent-conduct');
 s.ReportCatalogItem.properties.type.enum.push('parent-conduct');
 s.TeacherReportCatalog.properties.classes.items.properties.reports.maxItems=5;
 const flags=Object.fromEntries(['publicStudentConductEnabled','publicStudentAttendanceEnabled','publicStudentActivitiesEnabled','publicRankingEnabled','publicSeatingEnabled'].map(k=>[k,{type:'boolean'}]));
 s.ClassPublicPortalSettings=obj({version:{type:'integer',minimum:0},slug:{...str,nullable:true},publicPortalEnabled:{type:'boolean'},...flags});
 s.ClassPublicPortalSettingsResponse=obj({data:ref('ClassPublicPortalSettings'),requestId:str});
 s.ClassPublicPortalPatch=obj({expectedVersion:{type:'integer',minimum:0},publicPortalEnabled:{type:'boolean'},...flags,rotateSlug:{type:'boolean'}});
 const path='/schools/{schoolId}/classes/{classId}/public-portal',params=[{name:'schoolId',in:'path',required:true,schema:uuid},{name:'classId',in:'path',required:true,schema:uuid}];
 extendOperation('getClass','getClassPublicPortalSettings',path,'parent_access.manage','ClassPublicPortalSettings',false,['CL25'],params);
 extendOperation('createSeatingPlan','saveClassPublicPortalSettings',path,'parent_access.manage','ClassPublicPortalSettings',false,['CL25'],undefined,'ClassPublicPortalPatch');
 const array=items=>({type:'array',maxItems:5000,items}),nullable={...str,nullable:true};
 s.PublicClassStudent=obj({id:uuid,fullName:str,groupName:nullable,roles:array(str)});
 s.PublicClassConduct=obj({publicationId:uuid,periodLabel:str,finalPoints:str,classification:nullable,publishedAt:str});
 s.PublicClassAttendance=obj({date:str,slotLabel:str,status:str,publishedAt:str});
 s.PublicClassActivity=obj({title:str,studentStatus:str,publishedAt:str});
 s.PublicClassStudentDetail=obj({student:ref('PublicClassStudent'),conduct:array(ref('PublicClassConduct')),attendance:array(ref('PublicClassAttendance')),activities:array(ref('PublicClassActivity'))});
 s.PublicClassPortal=obj({schoolName:str,className:str,yearName:str,homeroomName:nullable,settings:obj(flags),students:array(ref('PublicClassStudent')),
  timetable:array(obj({subjectName:str,teacherName:str,startsAt:str,endsAt:str})),duties:array(obj({date:str,task:str})),announcements:array(obj({id:uuid,title:str,href:str,publishedAt:date})),rules:array(obj({label:str,points:str})),seating:array(obj({row:{type:'integer'},column:{type:'integer'},studentName:{...str,nullable:true}})),ranking:array(obj({studentId:uuid,fullName:str,finalPoints:str,periodLabel:str}))});
 for(const name of ['PublicClassPortal','PublicClassStudentDetail'])s[name+'Response']=obj({data:ref(name),requestId:str});
 const publicParams=[{name:'publicClassSlug',in:'path',required:true,schema:{...str,pattern:'^[a-f0-9]{24}$'}}];
 extendOperation('getPublicSchoolWorkspace','getPublicClassPortal','/public/classes/{publicClassSlug}','public.read','PublicClassPortal',false,[],publicParams);
 extendOperation('getPublicSchoolWorkspace','getPublicClassStudent','/public/classes/{publicClassSlug}/students/{studentId}','public.read','PublicClassStudentDetail',false,[],[...publicParams,{name:'studentId',in:'path',required:true,schema:uuid}]);
 for(const op of operations.filter(o=>['getPublicClassPortal','getPublicClassStudent'].includes(o.id))){op.scope='none';op.auth='none';op.description='Public class portal with explicit per-field publication and privacy gates.';spec.paths[op.path.replace('/api/v1','')].get['x-scope']='none';}
 const aliases=obj({subjects:{type:'object',maxProperties:1000,additionalProperties:uuid},teachers:{type:'object',maxProperties:1000,additionalProperties:uuid}}),time={...str,pattern:'^([01]\\d|2[0-3]):[0-5]\\d$'},periodTimes={type:'object',maxProperties:36,additionalProperties:obj({start:time,end:time})};
 s.ScheduleImportSettings=obj({version:{type:'integer',minimum:0},aliases,periodTimes});s.ScheduleImportSettingsResponse=obj({data:ref('ScheduleImportSettings'),requestId:str});
 s.ScheduleImportSettingsPatch=obj({expectedVersion:{type:'integer',minimum:0},aliases,periodTimes});
 extendOperation('getSchoolSettings','getScheduleImportSettings','/schools/{schoolId}/schedule-import-settings','school.read','ScheduleImportSettings',false,['CL15'],[{name:'schoolId',in:'path',required:true,schema:uuid}]);
 extendOperation('createRole','saveScheduleImportSettings','/schools/{schoolId}/schedule-import-settings','school.settings','ScheduleImportSettings',false,['CL15'],undefined,'ScheduleImportSettingsPatch');
 for(const path of ['/schools/{schoolId}/classes/{classId}/public-portal','/schools/{schoolId}/schedule-import-settings']){const op=spec.paths[path].post;op.responses['200']=op.responses['201'];delete op.responses['201'];}
}
