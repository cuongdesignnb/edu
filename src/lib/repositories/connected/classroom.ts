import type {ApiSchemas} from '../../api/generated';
import {apiList} from '../../api/lists';
import {inclusiveDate} from '../../api/dates';
import {UI_ACTIONS} from '../../api/permissions';
import type {Ctx} from '../core';
import {RepoError} from '../errors';
import {withStaffAccess} from './common';
import {http} from '../../api/client';
import {nativeClassHeader} from './classroom-header';

const invalid=()=>new RepoError('READ_ERROR','API chưa xác nhận đầy đủ lớp và phân công của bạn.');
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const date=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
const text=(v:unknown)=>typeof v==='string'&&!!v.trim();
const nullableText=(v:unknown)=>v===null||text(v);
function exact(value:object,keys:string[]){if(!value||typeof value!=='object'||Object.keys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key)))throw invalid();}
/** Purpose rows are already scoped in SQL; no tenant directory is filtered here. */
export function nativeTeacherClass(row:ApiSchemas['TeacherClassCard'],schoolId:string){
  exact(row,['id','schoolId','yearId','name','yearLabel','status','today','referenceDate','live','motto','studentCount','roomLabel','homeroomName','assignments','actions','nextLesson']);
  if(!uuid(row.id)||row.schoolId!==schoolId||!uuid(row.yearId)||!text(row.name)||!text(row.yearLabel)||!['DRAFT','ACTIVE','ARCHIVED'].includes(row.status)||!date(row.today)||!date(row.referenceDate)||typeof row.live!=='boolean'||!(row.motto===null||typeof row.motto==='string')||!nullableText(row.roomLabel)||!nullableText(row.homeroomName)||!(row.studentCount===null||Number.isInteger(row.studentCount)&&row.studentCount>=0)||!Array.isArray(row.actions)||row.actions.some(v=>!text(v)||v.length>100)||new Set(row.actions).size!==row.actions.length||!Array.isArray(row.assignments)||!row.assignments.length||row.assignments.length>1000)throw invalid();
  const duties=row.assignments.map(d=>{
    exact(d,['id','kind','subjectName','startsOn','endsOn','live','status']);
    if(!uuid(d.id)||!['HOMEROOM','SUBJECT'].includes(d.kind)||!date(d.startsOn)||d.startsOn>row.today||!(d.endsOn===null||date(d.endsOn)&&d.endsOn>d.startsOn)||typeof d.live!=='boolean'||!['ACTIVE','ENDED','REVOKED','NOT_CURRENT'].includes(d.status)||d.live!==(d.status==='ACTIVE')||d.live&&(d.endsOn!==null&&d.endsOn<=row.today)||d.kind==='HOMEROOM'&&d.subjectName!==null||d.kind==='SUBJECT'&&!text(d.subjectName))throw invalid();
    return {id:d.id,kind:d.kind==='HOMEROOM'?'homeroom' as const:'subject' as const,label:d.kind==='HOMEROOM'?'Chủ nhiệm':d.subjectName!,live:d.live,validFrom:d.startsOn,validTo:d.endsOn?inclusiveDate(d.endsOn):undefined,status:d.status.toLowerCase()};
  });
  if(new Set(duties.map(d=>d.id)).size!==duties.length||row.live!==duties.some(d=>d.live)||row.live&&!row.actions.includes('class.read')||!row.live&&(row.actions.length||row.studentCount!==null||row.roomLabel!==null||row.homeroomName!==null||row.motto!==null||row.nextLesson!==null)||row.live&&row.actions.includes('student.read')&&row.studentCount===null)throw invalid();
  let nextLesson:null|{date:string;period:number|null;start:string;end:string;subject:string}=null;
  if(row.nextLesson!==null){
    const l=row.nextLesson;exact(l,['date','startsAtLocal','endsAtLocal','periodNumber','subjectName']);
    const time=(v:unknown)=>typeof v==='string'&&/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(v);
    if(!row.live||!row.actions.includes('schedule.read')||!date(l.date)||l.date<row.today||Date.parse(l.date+'T00:00:00Z')>=Date.parse(row.today+'T00:00:00Z')+7*86400000||!time(l.startsAtLocal)||!time(l.endsAtLocal)||l.endsAtLocal<=l.startsAtLocal||!text(l.subjectName)||!(l.periodNumber===null||Number.isInteger(l.periodNumber)&&l.periodNumber>0))throw invalid();
    nextLesson={date:l.date,period:l.periodNumber,start:l.startsAtLocal,end:l.endsAtLocal,subject:l.subjectName};
  }
  const actions=Object.entries(UI_ACTIONS).filter(([,needed])=>needed.every(a=>row.actions.includes(a))).map(([action])=>action);
  if(row.actions.includes('schedule.read'))actions.push('schedule.read');
  return {id:row.id,yearId:row.yearId,name:row.name,yearLabel:row.yearLabel,status:row.status.toLowerCase() as 'draft'|'active'|'archived',motto:row.motto??undefined,size:row.studentCount,room:row.roomLabel,homeroom:row.homeroomName,duties,live:row.live,nextLesson,actions,today:row.today,referenceDate:row.referenceDate};
}
async function cards(schoolId:string,includeEnded=false){
  const rows=await apiList('listTeacherClassDirectory',{params:{schoolId},query:{includeEnded,sort:'name'}},500);
  if(new Set(rows.map(row=>row.id)).size!==rows.length)throw invalid();
  return rows.map(row=>nativeTeacherClass(row,schoolId)).sort((a,b)=>Number(b.live)-Number(a.live)||Number(b.duties.some(d=>d.live&&d.kind==='homeroom'))-Number(a.duties.some(d=>d.live&&d.kind==='homeroom'))||a.name.localeCompare(b.name,'vi')||a.id.localeCompare(b.id));
}
export const connectedClassroomRepo=withStaffAccess({
  async header(_ctx:Ctx,schoolId:string,yearId:string,classId:string){return nativeClassHeader((await http('getClassWorkspaceHeader',{params:{schoolId,yearId,classId}})).data,schoolId,yearId,classId);},
  async teacherClasses(_ctx:Ctx,schoolId:string,includeEnded=false){return cards(schoolId,includeEnded);},
});
export const connectedTeacherExtraRepo=withStaffAccess({
  async myClassActions(_ctx:Ctx,schoolId:string):Promise<Record<string,string[]>>{return Object.fromEntries((await cards(schoolId)).map(c=>[c.id,c.actions]));},
});
