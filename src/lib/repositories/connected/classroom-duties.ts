import type {ApiSchemas} from '../../api/generated';
import {http} from '../../api/client';
import {RepoError} from '../errors';
import {addDays,mondayOf} from '../../calendar';

const invalid=()=>new RepoError('READ_ERROR','API chưa xác nhận đầy đủ lịch trực nhật và quyền của lớp.');
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const date=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
const text=(v:unknown)=>typeof v==='string'&&!!v.trim();
const positive=(v:unknown)=>Number.isInteger(v)&&Number(v)>0;
const ids=(v:unknown)=>Array.isArray(v)&&v.length<=5000&&v.every(uuid)&&new Set(v).size===v.length;
function exact(v:object,keys:string[]){if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k)))throw invalid();}
export function nativeDutyWorkspace(v:ApiSchemas['ClassDutyWorkspace'],schoolId:string,yearId:string,classId:string){
 exact(v,['schoolId','yearId','classId','today','monday','referenceDate','startsOn','endsOn','readOnly','canEdit','canPublish','canPreview','publicationId','tasks','students','groups','preview','previewStudents']);
 if(v.schoolId!==schoolId||v.yearId!==yearId||v.classId!==classId||![schoolId,yearId,classId].every(uuid)||![v.today,v.monday,v.referenceDate,v.startsOn,v.endsOn].every(date)||v.startsOn>=v.endsOn||v.monday!==mondayOf(v.monday)||addDays(v.monday,7)<=v.startsOn||v.monday>=v.endsOn||v.referenceDate<v.startsOn||v.referenceDate>=v.endsOn||v.referenceDate<v.monday||v.referenceDate>=addDays(v.monday,7)||![v.readOnly,v.canEdit,v.canPublish,v.canPreview].every(x=>typeof x==='boolean')||v.readOnly&&(v.canEdit||v.canPublish)||v.canPublish&&!v.canEdit||!(v.publicationId===null||uuid(v.publicationId))||!Array.isArray(v.tasks)||v.tasks.length>2000||!Array.isArray(v.students)||v.students.length>5000||!Array.isArray(v.groups)||v.groups.length>100||!Array.isArray(v.previewStudents)||v.previewStudents.length>5000||(v.preview!==null)!==v.canPreview||v.preview!==null&&(!Array.isArray(v.preview)||v.preview.length>5000)||!v.canEdit&&v.groups.length||!v.canPreview&&v.previewStudents.length)throw invalid();
 const students=new Map<string,typeof v.students[number]>();const enrollments=new Set<string>();
 for(const s of v.students){exact(s,['id','enrollmentId','fullName']);if(!uuid(s.id)||!uuid(s.enrollmentId)||!text(s.fullName)||students.has(s.id)||enrollments.has(s.enrollmentId))throw invalid();students.set(s.id,s);enrollments.add(s.enrollmentId);}
 const groups=v.groups.map(g=>{exact(g,['id','name','studentIds']);if(!uuid(g.id)||!text(g.name)||!ids(g.studentIds)||g.studentIds.some(id=>!students.has(id)))throw invalid();return {id:g.id,name:g.name,members:g.studentIds.map(id=>({id,fullName:students.get(id)!.fullName}))};});
 if(new Set(groups.map(g=>g.id)).size!==groups.length)throw invalid();
 const seen=new Set<string>();
 const tasks=v.tasks.map(t=>{exact(t,['id','scheduleId','version','dataVersion','date','task','assignmentIds','groupPlanId','groupId','groupName','studentIds','studentNames','unavailableTargets','status','canEdit']);
  if(!uuid(t.id)||!uuid(t.scheduleId)||!positive(t.version)||!positive(t.dataVersion)||!date(t.date)||t.date<v.monday||t.date>=addDays(v.monday,7)||t.date<v.startsOn||t.date>=v.endsOn||!text(t.task)||t.task.length>4000||!ids(t.assignmentIds)||!ids(t.studentIds)||!Array.isArray(t.studentNames)||t.studentNames.length!==t.studentIds.length||!t.studentNames.every(text)||!Number.isInteger(t.unavailableTargets)||t.unavailableTargets<0||!(t.groupPlanId===null||uuid(t.groupPlanId))||!(t.groupId===null||uuid(t.groupId))||!(t.groupName===null||text(t.groupName))||(t.groupId===null)!==(t.groupName===null)||(t.groupId===null)!==(t.groupPlanId===null)||t.id!==(t.groupPlanId??t.assignmentIds[0])||!['DRAFT','PUBLISHED','WITHDRAWN'].includes(t.status)||t.status==='PUBLISHED'&&v.publicationId===null||t.status==='WITHDRAWN'&&v.publicationId!==null||typeof t.canEdit!=='boolean'||t.canEdit&&(v.readOnly||t.date<v.today)||seen.has(t.id))throw invalid();seen.add(t.id);
  const source:ApiSchemas['ClassDutyTaskSource']={scheduleId:t.scheduleId,expectedVersion:t.version,expectedDataVersion:t.dataVersion,date:t.date,task:t.task,assignmentIds:t.assignmentIds,groupPlanId:t.groupPlanId};
  return {id:t.id,date:t.date,task:t.task,groupId:t.groupId??undefined,groupName:t.groupName??undefined,studentIds:t.studentIds,studentNames:t.studentNames,status:t.status.toLowerCase() as 'draft'|'published'|'withdrawn',canEdit:t.canEdit,unavailableTargets:t.unavailableTargets,source};
 });
 const previewStudents=new Map<string,string>();for(const s of v.previewStudents){exact(s,['id','fullName']);if(!uuid(s.id)||!text(s.fullName)||previewStudents.has(s.id))throw invalid();previewStudents.set(s.id,s.fullName);}
 const preview=(v.preview??[]).map(p=>{exact(p,['studentId','date','task','status','publishedAt']);if(!uuid(p.studentId)||!previewStudents.has(p.studentId)||!date(p.date)||p.date<v.monday||p.date>=addDays(v.monday,7)||p.date<v.startsOn||p.date>=v.endsOn||!text(p.task)||!['ASSIGNED','DONE','CANCELLED'].includes(p.status)||typeof p.publishedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(p.publishedAt)||!Number.isFinite(Date.parse(p.publishedAt))||v.publicationId===null)throw invalid();return p;});
 const days=Array.from({length:tasks.some(t=>t.date===addDays(v.monday,6))?7:6},(_,i)=>addDays(v.monday,i)).filter(d=>d>=v.startsOn&&d<v.endsOn).map(date=>({date,duties:tasks.filter(t=>t.date===date)}));
 return {...v,days,groups,students:v.students,preview,previewStudents:v.previewStudents,canPrevious:v.monday>v.startsOn,canNext:addDays(v.monday,7)<v.endsOn};
}
export async function readDutyWorkspace(schoolId:string,yearId:string,classId:string,weekStart?:string,onDate?:string){
 const v=(await http('getClassDutyWorkspace',{params:{schoolId,yearId,classId},query:{weekStart,onDate}})).data;
 if(weekStart!==undefined&&v.monday!==weekStart||onDate!==undefined&&v.referenceDate!==onDate)throw invalid();return nativeDutyWorkspace(v,schoolId,yearId,classId);
}
export async function saveDutyTask(schoolId:string,classId:string,input:{yearId:string;source?:ApiSchemas['ClassDutyTaskSource']|null;date:string;task:string;groupId?:string;studentIds:string[];publish:boolean;expectedPublicationId:string|null}){
 const r=(await http('saveClassDutyTask',{params:{schoolId,yearId:input.yearId,classId},body:{source:input.source??null,date:input.date,task:input.task,groupId:input.groupId??null,studentIds:input.studentIds,publish:input.publish,expectedPublicationId:input.expectedPublicationId}})).data;
 exact(r,['sourceId','status']);
 if(!uuid(r.sourceId)||r.status!==(input.publish?'PUBLISHED':'DRAFT'))throw invalid();return {...r,status:r.status.toLowerCase() as 'draft'|'published'};
}
export async function removeDutyTask(schoolId:string,classId:string,input:{yearId:string;source:ApiSchemas['ClassDutyTaskSource'];expectedPublicationId:string|null}){
 const r=(await http('removeClassDutyTask',{params:{schoolId,yearId:input.yearId,classId},body:{source:input.source,expectedPublicationId:input.expectedPublicationId}})).data;exact(r,['sourceId','status']);if(r.status!=='REMOVED'||r.sourceId!==null)throw invalid();return true;
}
