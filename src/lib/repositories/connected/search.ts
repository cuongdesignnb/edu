import type {ApiSchemas} from '../../api/generated';
import {http} from '../../api/client';
import type {Ctx} from '../core';
import type {SearchHit} from '../search';
import {RepoError} from '../errors';
import {withStaffAccess} from './common';
const invalid=()=>new RepoError('READ_ERROR','API chưa xác nhận phạm vi kết quả tìm kiếm.');
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export function nativeSearch(row:ApiSchemas['SearchWorkspace'],schoolId?:string):SearchHit[]{
 if(row.schoolId!==(schoolId??null)||!Array.isArray(row.items)||row.items.length>30||new Set(row.items.map(r=>`${r.kind}:${r.id}`)).size!==row.items.length)throw invalid();
 return row.items.map(r=>{
  if(!uuid(r.id)||!uuid(r.schoolId)||schoolId&&r.schoolId!==schoolId||typeof r.title!=='string'||!r.title.trim()||typeof r.sub!=='string'||typeof r.schoolWorkspace!=='boolean'||!(r.yearId===null||uuid(r.yearId))||!(r.classId===null||uuid(r.classId))||!['school','class','student','teacher'].includes(r.kind)||!schoolId&&r.kind!=='school'||r.kind==='school'&&(schoolId||r.id!==r.schoolId)||['class','student'].includes(r.kind)&&(!r.yearId||!r.classId)||r.kind==='class'&&r.id!==r.classId||r.kind==='teacher'&&!r.schoolWorkspace)throw invalid();
  const href=r.kind==='school'?`/platform/schools/${r.id}`:r.kind==='class'?`/classroom/${r.schoolId}/${r.yearId}/${r.id}`:r.kind==='teacher'?`/school/${r.schoolId}/teachers/${r.id}`:r.schoolWorkspace?`/school/${r.schoolId}/students/${r.id}`:`/classroom/${r.schoolId}/${r.yearId}/${r.classId}/students/${r.id}`;
  return {kind:r.kind,id:r.id,title:r.title,sub:r.sub,href};
 });
}
export const connectedSearchRepo=withStaffAccess({async search(_ctx:Ctx,q:string,schoolId?:string){const term=q.trim();if(term.length<2)return [];if(term.length>200)throw new RepoError('VALIDATION','Nhập tối đa 200 ký tự để tìm kiếm.');return nativeSearch((await http('searchWorkspace',{query:{q:term,schoolId}})).data,schoolId);}});
