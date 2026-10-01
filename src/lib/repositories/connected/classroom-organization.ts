import type {ApiSchemas} from '../../api/generated';
import {http} from '../../api/client';
import {RepoError} from '../errors';

type Common=Pick<ApiSchemas['ClassGroupWorkspace'],'schoolId'|'yearId'|'classId'|'today'|'referenceDate'|'classVersion'|'readOnly'|'canEdit'|'groupsVisible'|'students'>;
const invalid=()=>new RepoError('READ_ERROR','API chưa xác nhận đầy đủ dữ liệu tổ chức của lớp.');
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const date=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
const positive=(v:unknown)=>typeof v==='number'&&Number.isInteger(v)&&v>0;
const text=(v:unknown)=>typeof v==='string'&&!!v.trim();
const exact=(v:object,keys:string[])=>{if(!v||typeof v!=='object'||Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k)))throw invalid();};
const unique=(v:unknown[])=>new Set(v).size===v.length;
const baseKeys=['schoolId','yearId','classId','today','referenceDate','classVersion','readOnly','canEdit','groupsVisible','students'];
function common(v:Common,schoolId:string,yearId:string,classId:string){
 if(v.schoolId!==schoolId||v.yearId!==yearId||v.classId!==classId||![schoolId,yearId,classId].every(uuid)||!date(v.today)||!date(v.referenceDate)||!positive(v.classVersion)||typeof v.readOnly!=='boolean'||typeof v.canEdit!=='boolean'||typeof v.groupsVisible!=='boolean'||v.readOnly&&v.canEdit||!Array.isArray(v.students)||v.students.length>5000)throw invalid();
 for(const s of v.students){exact(s,['id','enrollmentId','studentCode','fullName','groupId']);if(!uuid(s.id)||!uuid(s.enrollmentId)||!text(s.studentCode)||!text(s.fullName)||!(s.groupId===null||v.groupsVisible&&uuid(s.groupId)))throw invalid();}
 if(!unique(v.students.map(s=>s.id))||!unique(v.students.map(s=>s.enrollmentId)))throw invalid();
}
export function nativeGroupWorkspace(v:ApiSchemas['ClassGroupWorkspace'],schoolId:string,yearId:string,classId:string){
 exact(v,[...baseKeys,'groups','positionDefinitions','holders']);common(v,schoolId,yearId,classId);
 if(!v.groupsVisible||!Array.isArray(v.groups)||v.groups.length>100||!Array.isArray(v.positionDefinitions)||v.positionDefinitions.length>500||!Array.isArray(v.holders)||v.holders.length>5000)throw invalid();
 for(const g of v.groups){exact(g,['id','version','name','sortOrder']);if(!uuid(g.id)||!positive(g.version)||!text(g.name)||!Number.isInteger(g.sortOrder))throw invalid();}
 const groups=new Map(v.groups.map(g=>[g.id,g])),students=new Map(v.students.map(s=>[s.enrollmentId,s]));
 if(!unique(v.groups.map(g=>g.id))||v.students.some(s=>s.groupId!==null&&!groups.has(s.groupId)))throw invalid();
 for(const p of v.positionDefinitions){exact(p,['id','version','code','name','singleHolder','groupId']);if(!uuid(p.id)||!positive(p.version)||!text(p.code)||!text(p.name)||typeof p.singleHolder!=='boolean'||!(p.groupId===null||groups.has(p.groupId)))throw invalid();}
 if(!unique(v.positionDefinitions.map(p=>p.id)))throw invalid();
 const definitions=new Map(v.positionDefinitions.map(p=>[p.id,p]));
 for(const h of v.holders){exact(h,['id','version','positionId','enrollmentId','startsOn','endsOn']);const p=definitions.get(h.positionId),s=students.get(h.enrollmentId);if(!uuid(h.id)||!positive(h.version)||!p||!s||!date(h.startsOn)||!date(h.endsOn)||h.startsOn>v.referenceDate||h.endsOn<=v.referenceDate||p.groupId!==null&&p.groupId!==s.groupId)throw invalid();}
 if(!unique(v.holders.map(h=>h.id))||!unique(v.holders.map(h=>h.positionId+':'+h.enrollmentId))||v.positionDefinitions.some(p=>p.singleHolder&&v.holders.filter(h=>h.positionId===p.id).length>1))throw invalid();
 const member=(s:Common['students'][number])=>({id:s.id,enrollmentId:s.enrollmentId,fullName:s.fullName,code:s.studentCode,positions:v.holders.filter(h=>h.enrollmentId===s.enrollmentId).map(h=>definitions.get(h.positionId)!.name)});
 return {classVersion:v.classVersion,today:v.today,date:v.referenceDate,canEdit:v.canEdit,groups:v.groups.map(g=>({...g,members:v.students.filter(s=>s.groupId===g.id).map(member)})),unassigned:v.students.filter(s=>s.groupId===null).map(member),positionDefinitions:v.positionDefinitions,
  positions:v.holders.map(h=>({...h,studentId:students.get(h.enrollmentId)!.id,studentName:students.get(h.enrollmentId)!.fullName,validFrom:h.startsOn,positionName:definitions.get(h.positionId)!.name,groupId:definitions.get(h.positionId)!.groupId}))};
}
export function nativeSeatingWorkspace(v:ApiSchemas['ClassSeatingWorkspace'],schoolId:string,yearId:string,classId:string){
 exact(v,[...baseKeys,'plan','groupNames','latestRevision','history']);common(v,schoolId,yearId,classId);
 if(!Array.isArray(v.history)||v.history.length>500||!Number.isInteger(v.latestRevision)||v.latestRevision<0||!(v.groupsVisible?Array.isArray(v.groupNames)&&v.groupNames.length<=100:v.groupNames===null))throw invalid();
 for(const g of v.groupNames??[]){exact(g,['id','name']);if(!uuid(g.id)||!text(g.name))throw invalid();}
 if(!unique((v.groupNames??[]).map(g=>g.id)))throw invalid();
 const groups=new Map((v.groupNames??[]).map(g=>[g.id,g.name])),students=new Map(v.students.map(s=>[s.enrollmentId,s]));
 if(v.students.some(s=>s.groupId!==null&&!groups.has(s.groupId)))throw invalid();
 for(const h of v.history){exact(h,['id','version','revision','effectiveOn','endsOn','status','createdAt','createdByName']);if(!uuid(h.id)||!positive(h.version)||!positive(h.revision)||!date(h.effectiveOn)||!(h.endsOn===null||date(h.endsOn)&&h.endsOn>h.effectiveOn)||!['DRAFT','ACTIVE','ARCHIVED'].includes(h.status)||!Number.isFinite(Date.parse(h.createdAt))||!(h.createdByName===null||text(h.createdByName)))throw invalid();}
 if(!unique(v.history.map(h=>h.id))||!unique(v.history.map(h=>h.revision))||v.history.some((h,i)=>i>0&&v.history[i-1].revision<=h.revision)||v.latestRevision!==(v.history[0]?.revision??0))throw invalid();
 let plan=null;
 if(v.plan!==null){
  const p=v.plan;exact(p,['id','version','revision','effectiveOn','endsOn','rows','cols','note','seats']);const h=v.history.find(h=>h.id===p.id);
  if(!h||h.status!=='ACTIVE'||h.version!==p.version||h.revision!==p.revision||h.effectiveOn!==p.effectiveOn||h.endsOn!==p.endsOn||p.effectiveOn>v.referenceDate||p.endsOn!==null&&p.endsOn<=v.referenceDate||!(p.note===null||typeof p.note==='string'&&p.note.length<=120)||!Array.isArray(p.seats)||p.seats.length>500)throw invalid();
  for(const s of p.seats){exact(s,['key','row','column','enrollmentId']);if(!text(s.key)||!Number.isInteger(s.row)||s.row<0||s.row>199||!Number.isInteger(s.column)||s.column<0||s.column>199||!(s.enrollmentId===null||students.has(s.enrollmentId)))throw invalid();}
  if(!unique(p.seats.map(s=>s.key))||!unique(p.seats.map(s=>s.row+':'+s.column))||!unique(p.seats.filter(s=>s.enrollmentId!==null).map(s=>s.enrollmentId))||p.rows!==(p.seats.length?Math.max(...p.seats.map(s=>s.row))+1:null)||p.cols!==(p.seats.length?Math.max(...p.seats.map(s=>s.column))+1:null))throw invalid();
  plan={id:p.id,version:p.revision,sourceVersion:p.version,effectiveDate:p.effectiveOn,rows:p.rows,cols:p.cols,note:p.note,seats:p.seats.map(s=>({seat:`r${s.row+1}c${s.column+1}`,studentId:s.enrollmentId===null?null:students.get(s.enrollmentId)!.id}))};
 }
 const seated=new Set(plan?.seats.map(s=>s.studentId).filter((id):id is string=>id!==null));
 return {plan,canEdit:v.canEdit,date:v.referenceDate,today:v.today,groupsVisible:v.groupsVisible,latestRevision:v.latestRevision,unseated:v.students.filter(s=>!seated.has(s.id)).map(s=>s.id),students:v.students.map(s=>({id:s.id,enrollmentId:s.enrollmentId,fullName:s.fullName,code:s.studentCode,groupName:s.groupId===null?null:groups.get(s.groupId)!})),
  history:v.history.map(h=>({id:h.id,version:h.revision,sourceVersion:h.version,effectiveDate:h.effectiveOn,status:h.status.toLowerCase() as 'draft'|'active'|'archived',createdAt:h.createdAt,createdByName:h.createdByName}))};
}
export async function readGroupWorkspace(schoolId:string,yearId:string,classId:string,onDate?:string){const v=(await http('getClassGroupWorkspace',{params:{schoolId,yearId,classId},query:{onDate}})).data;if(onDate!==undefined&&v.referenceDate!==onDate)throw invalid();return nativeGroupWorkspace(v,schoolId,yearId,classId);}
export async function readSeatingWorkspace(schoolId:string,yearId:string,classId:string,onDate?:string){const v=(await http('getClassSeatingWorkspace',{params:{schoolId,yearId,classId},query:{onDate}})).data;if(onDate!==undefined&&v.referenceDate!==onDate)throw invalid();return nativeSeatingWorkspace(v,schoolId,yearId,classId);}
export async function moveClassGroup(schoolId:string,classId:string,input:{yearId:string;studentIds:string[];groupId:string|null;effectiveDate:string;expectedClassVersion:number}){
 if(!positive(input.expectedClassVersion)||!date(input.effectiveDate)||!Array.isArray(input.studentIds)||!input.studentIds.length||!unique(input.studentIds))throw new RepoError('VALIDATION','Chọn học sinh, ngày hiệu lực và phiên bản lớp đã tải.');
 const source=await readGroupWorkspace(schoolId,input.yearId,classId,input.effectiveDate),students=[...source.groups.flatMap(g=>g.members),...source.unassigned];
 const enrollmentIds=input.studentIds.map(id=>{const s=students.find(s=>s.id===id);if(!s)throw new RepoError('VALIDATION','Có học sinh không thuộc lớp tại ngày áp dụng.');return s.enrollmentId;});
 return (await http('assignGroup',{params:{schoolId,classId},body:{groupId:input.groupId,enrollmentIds,effectiveOn:input.effectiveDate,expectedClassVersion:input.expectedClassVersion}})).data;
}
export async function changeClassPosition(schoolId:string,classId:string,input:{yearId:string;studentId:string;positionId:string;effectiveDate:string;remove?:boolean;assignmentId?:string;expectedVersion?:number}){
 if(input.remove){if(!uuid(input.assignmentId)||!positive(input.expectedVersion))throw new RepoError('CONFLICT','Tải lại chức vụ trước khi kết thúc phân công.');return (await http('endPositionAssignment',{params:{schoolId,classId,assignmentId:input.assignmentId!},body:{expectedVersion:input.expectedVersion!,endsOn:input.effectiveDate,reason:`Kết thúc chức vụ theo ngày ${input.effectiveDate} được chọn trên bảng tổ chức lớp.`}})).data;}
 const source=await readGroupWorkspace(schoolId,input.yearId,classId,input.effectiveDate),student=[...source.groups.flatMap(g=>g.members),...source.unassigned].find(s=>s.id===input.studentId);
 if(!student||!source.positionDefinitions.some(p=>p.id===input.positionId))throw new RepoError('VALIDATION','Học sinh hoặc chức vụ không thuộc lớp tại ngày áp dụng.');
 return (await http('assignPosition',{params:{schoolId,classId},body:{positionId:input.positionId,enrollmentId:student.enrollmentId,startsOn:input.effectiveDate}})).data;
}
export async function saveClassSeating(schoolId:string,classId:string,input:{yearId:string;rows:number;cols:number;seats:{seat:string;studentId:string|null}[];effectiveDate:string;basedOnVersion:number;note?:string}){
 if(!Number.isInteger(input.basedOnVersion)||input.basedOnVersion<0||!positive(input.rows)||!positive(input.cols)||input.rows*input.cols>200||input.seats.length!==input.rows*input.cols)throw new RepoError('VALIDATION','Chọn kích thước sơ đồ hợp lệ, tối đa200 vị trí.');
 const source=await readSeatingWorkspace(schoolId,input.yearId,classId,input.effectiveDate);
 const seats=input.seats.map(s=>{const m=/^r([1-9][0-9]*)c([1-9][0-9]*)$/.exec(s.seat);if(!m||Number(m[1])>input.rows||Number(m[2])>input.cols)throw new RepoError('VALIDATION','Mã ghế nằm ngoài kích thước sơ đồ.');const student=s.studentId===null?null:source.students.find(x=>x.id===s.studentId);if(s.studentId!==null&&!student)throw new RepoError('VALIDATION','Có học sinh không thuộc lớp tại ngày áp dụng.');return {key:s.seat,row:Number(m[1])-1,column:Number(m[2])-1,enrollmentId:student?.enrollmentId??null};});
 const p=(await http('saveClassSeatingRevision',{params:{schoolId,yearId:input.yearId,classId},body:{effectiveOn:input.effectiveDate,seats,expectedRevision:input.basedOnVersion,note:input.note}})).data;
 if(!uuid(p.id)||p.classId!==classId||p.revision!==input.basedOnVersion+1||p.status!=='ACTIVE'||p.effectiveOn!==input.effectiveDate)throw invalid();
 return {id:p.id!,version:p.revision,effectiveDate:p.effectiveOn};
}
