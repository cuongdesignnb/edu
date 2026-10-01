import type {ApiSchemas} from '../../api/generated';
import {http} from '../../api/client';
import {RepoError} from '../errors';

const invalid=()=>new RepoError('READ_ERROR','API chưa xác nhận đầy đủ danh sách lớp và các quyền riêng tư.');
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const date=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
const positive=(v:unknown)=>typeof v==='number'&&Number.isInteger(v)&&v>0;
const count=(v:unknown)=>typeof v==='number'&&Number.isInteger(v)&&v>=0;
const text=(v:unknown)=>typeof v==='string'&&!!v.trim();
function exact(v:object,keys:string[]){if(!v||typeof v!=='object'||Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k)))throw invalid();}
function scope(v:{schoolId:string;yearId:string;classId:string;today:string;referenceDate:string},schoolId:string,yearId:string,classId:string,onDate?:string){if(!uuid(schoolId)||!uuid(yearId)||!uuid(classId)||v.schoolId!==schoolId||v.yearId!==yearId||v.classId!==classId||!date(v.today)||!date(v.referenceDate)||onDate&&v.referenceDate!==onDate)throw invalid();}
export function nativeClassRoster(v:ApiSchemas['ClassRosterWorkspace'],schoolId:string,yearId:string,classId:string,onDate?:string){
 exact(v,['schoolId','yearId','classId','today','referenceDate','classVersion','readOnly','seeGuardians','seeLinks','canAdd','canTransfer','canGroups','canReadGroups','canSeating','groups','total','rows','leftRecently','linkSummary']);scope(v,schoolId,yearId,classId,onDate);
 if(!positive(v.classVersion)||!count(v.total)||v.total>5000||['readOnly','seeGuardians','seeLinks','canAdd','canTransfer','canGroups','canReadGroups','canSeating'].some(k=>typeof v[k as keyof typeof v]!=='boolean')||v.readOnly&&(v.canAdd||v.canTransfer||v.canGroups)||v.canGroups&&!v.canReadGroups||!Array.isArray(v.groups)||v.groups.length>100||!Array.isArray(v.rows)||v.rows.length>v.total||!Array.isArray(v.leftRecently)||v.leftRecently.length>2000)throw invalid();
 for(const g of v.groups){exact(g,['id','name']);if(!uuid(g.id)||!text(g.name))throw invalid();}if(new Set(v.groups.map(g=>g.id)).size!==v.groups.length)throw invalid();
 const rows=v.rows.map(r=>{exact(r,['id','studentCode','fullName','gender','enrollmentId','enrollmentVersion','startsOn','ordinal','groupId','groupName','positions','transferredIn','currentEnrollment','guardian','linkStatus']);
  if(!uuid(r.id)||!uuid(r.enrollmentId)||!positive(r.enrollmentVersion)||!positive(r.ordinal)||r.ordinal>v.total||!text(r.studentCode)||!text(r.fullName)||!(r.gender===null||['Nam','Nữ'].includes(r.gender))||!date(r.startsOn)||r.startsOn>v.referenceDate||typeof r.transferredIn!=='boolean'||typeof r.currentEnrollment!=='boolean'||!Array.isArray(r.positions)||r.positions.length>500||r.positions.some(p=>!text(p))||!(r.groupId===null&&r.groupName===null||uuid(r.groupId)&&v.groups.some(g=>g.id===r.groupId&&g.name===r.groupName))||!v.seeGuardians&&r.guardian!==null||!v.seeLinks&&r.linkStatus!==null||!r.currentEnrollment&&(r.guardian!==null||r.linkStatus!==null)||!(r.linkStatus===null||['none','issued','opened','revoked'].includes(r.linkStatus)))throw invalid();
  if(r.guardian){exact(r.guardian,['name','relation','verification']);if(!text(r.guardian.name)||!text(r.guardian.relation)||!['UNVERIFIED','VERIFIED'].includes(r.guardian.verification))throw invalid();}
  return {id:r.id,code:r.studentCode,fullName:r.fullName,gender:r.gender,enrollmentId:r.enrollmentId,enrollmentVersion:r.enrollmentVersion,joinedAt:r.startsOn,ordinal:r.ordinal,currentEnrollment:r.currentEnrollment,transferredIn:r.transferredIn,avatarTone:'blue',groupId:r.groupId??undefined,groupName:r.groupName??undefined,positions:r.positions,guardian:r.guardian?{...r.guardian,verification:r.guardian.verification.toLowerCase()}:undefined,link:r.linkStatus??undefined};
 });
 if(new Set(rows.map(r=>r.id)).size!==rows.length||new Set(rows.map(r=>r.enrollmentId)).size!==rows.length||new Set(rows.map(r=>r.ordinal)).size!==rows.length)throw invalid();
 const leftRecently=v.leftRecently.map(r=>{exact(r,['id','enrollmentId','fullName','studentCode','endsOn','reason']);if(!uuid(r.id)||!uuid(r.enrollmentId)||!text(r.fullName)||!text(r.studentCode)||!date(r.endsOn)||r.endsOn>v.referenceDate||!(r.reason===null||text(r.reason)))throw invalid();return {id:r.id,enrollmentId:r.enrollmentId,fullName:r.fullName,code:r.studentCode,endDate:r.endsOn,reason:r.reason??undefined};});
 if(new Set(leftRecently.map(r=>r.enrollmentId)).size!==leftRecently.length)throw invalid();
 if(v.seeLinks!==!!v.linkSummary)throw invalid();if(v.linkSummary){exact(v.linkSummary,['total','withLink','opened']);if(Object.values(v.linkSummary).some(n=>!count(n))||v.linkSummary.opened>v.linkSummary.withLink||v.linkSummary.withLink>v.linkSummary.total||v.linkSummary.total>v.total)throw invalid();}
 return {...v,rows,leftRecently,linkSummary:v.linkSummary??undefined};
}
export async function readClassRoster(schoolId:string,yearId:string,classId:string,opts:{q?:string;groupId?:string;linkStatus?:string}={}){return nativeClassRoster((await http('getClassRosterWorkspace',{params:{schoolId,yearId,classId},query:opts})).data,schoolId,yearId,classId);}
export function nativeClassTransferOptions(v:ApiSchemas['ClassTransferOptions'],schoolId:string,yearId:string,classId:string,onDate?:string){
 exact(v,['schoolId','yearId','classId','today','referenceDate','startsOn','endsOn','students','targets']);scope(v,schoolId,yearId,classId,onDate);
 if(!date(v.startsOn)||!date(v.endsOn)||v.startsOn>=v.endsOn||v.referenceDate<v.today||v.referenceDate<v.startsOn||v.referenceDate>=v.endsOn||!Array.isArray(v.students)||v.students.length>5000||!Array.isArray(v.targets)||v.targets.length>500)throw invalid();
 for(const s of v.students){exact(s,['id','fullName','studentCode','enrollmentId','enrollmentVersion','startsOn','endsOn']);if(!uuid(s.id)||!uuid(s.enrollmentId)||!positive(s.enrollmentVersion)||!text(s.fullName)||!text(s.studentCode)||!date(s.startsOn)||s.startsOn>=v.referenceDate||!(s.endsOn===null||date(s.endsOn)&&s.endsOn>v.referenceDate))throw invalid();}
 for(const t of v.targets){exact(t,['id','name','size','capacity']);if(!uuid(t.id)||t.id===classId||!text(t.name)||!count(t.size)||!(t.capacity===null||positive(t.capacity)))throw invalid();}
 if(new Set(v.students.map(s=>s.id)).size!==v.students.length||new Set(v.students.map(s=>s.enrollmentId)).size!==v.students.length||new Set(v.targets.map(t=>t.id)).size!==v.targets.length)throw invalid();return v;
}
export async function readTransferOptions(schoolId:string,yearId:string,classId:string,onDate?:string){return nativeClassTransferOptions((await http('getClassTransferOptions',{params:{schoolId,yearId,classId},query:{onDate}})).data,schoolId,yearId,classId,onDate);}
export async function requestClassTransfer(schoolId:string,input:{studentId:string;enrollmentId:string;expectedEnrollmentVersion:number;kind:'transfer'|'leave';toClassId?:string;effectiveDate:string;reason:string}){
 if(!uuid(input.studentId)||!uuid(input.enrollmentId)||!positive(input.expectedEnrollmentVersion)||!date(input.effectiveDate)||input.reason.trim().length<5||!['transfer','leave'].includes(input.kind)||input.kind==='transfer'&&!uuid(input.toClassId)||input.kind==='leave'&&input.toClassId!==undefined)throw new RepoError('VALIDATION','Kiểm tra học sinh, quá trình theo học, ngày hiệu lực và lớp nhận.');
 const body={studentId:input.studentId,fromEnrollmentId:input.enrollmentId,expectedEnrollmentVersion:input.expectedEnrollmentVersion,toClassId:input.kind==='transfer'?input.toClassId:undefined,effectiveOn:input.effectiveDate,reason:input.reason.trim()};
 const receipt=(await http('createTransfer',{params:{schoolId},body})).data;
 exact(receipt,['id','version','createdAt','updatedAt','studentId','fromEnrollmentId','toClassId','effectiveOn','reason','status']);
 if(!uuid(receipt.id)||!positive(receipt.version)||!text(receipt.createdAt)||!text(receipt.updatedAt)||receipt.studentId!==body.studentId||receipt.fromEnrollmentId!==body.fromEnrollmentId||receipt.toClassId!==(body.toClassId??null)||receipt.effectiveOn!==body.effectiveOn||receipt.reason!==body.reason||receipt.status!=='SUBMITTED')throw invalid();return receipt;
}
