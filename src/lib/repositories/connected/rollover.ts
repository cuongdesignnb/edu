import type {ID} from '../../model/types';
import type {ApiSchemas} from '../../api/generated';
import {http,captureStaffAccess,onAuthenticationChanged} from '../../api/client';
import {RepoError} from '../errors';
import {requiredId,requiredValue} from './common';
import {year} from './organization-mapping';

export interface RolloverDecision {studentId:ID;fromClassId?:ID;action:'promote'|'retain'|'leave';targetClassId?:ID}
type Batch=ApiSchemas['Rollover'];
type Plan=Batch['plan'];
interface Flow {createKey:string;validateKey:string;commitKey:string;batch?:Batch;needsValidation:boolean;pending?:Promise<{enrolled:number;left:number;warnings?:string[]}>}
const previews=new Map<string,Map<string,string>>(),flows=new Map<string,Flow>();
onAuthenticationChanged(()=>{previews.clear();flows.clear();});
const previewKey=(schoolId:string,sourceYearId:string)=>`${schoolId}/${sourceYearId}`;

export async function readRolloverPreview(schoolId:ID,sourceYearId:ID){
  const access=captureStaffAccess(),data=(await http('getRolloverPreview',{params:{schoolId,yearId:sourceYearId}})).data;access.assertCurrent();
  const roster=new Map<string,string>();
  const classes=data.sourceClasses.map(c=>({id:requiredId(c.id),name:c.name,gradeLevel:c.gradeLevel,students:c.students.map(s=>{
    const id=requiredId(s.id);if(roster.has(id))throw new RepoError('READ_ERROR','Danh sách chuyển năm có học sinh trùng quá trình.');roster.set(id,c.id);
    return {id,code:s.studentCode,fullName:s.fullName,status:s.status==='ACTIVE'?'studying' as const:'left' as const};
  })}));
  previews.set(previewKey(schoolId,sourceYearId),roster);
  return {from:year(data.source,schoolId),referenceDate:data.referenceDate,classes,targets:data.targets.map(t=>({year:year(t.year,schoolId),classes:t.classes.map(c=>({id:requiredId(c.id),name:c.name,gradeId:requiredId(c.gradeLevelId),size:c.studentCount}))})),grades:data.grades.map(g=>({id:requiredId(g.id),schoolId,name:g.name,level:g.gradeLevel??null,status:g.status==='ACTIVE'?'active' as const:'inactive' as const,version:g.version}))};
}
function planSignature(plan:Plan){return JSON.stringify(plan.map(p=>[p.studentId,p.fromClassId,p.toClassId??null,p.decision]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))));}
function acknowledge(batch:Batch,sourceYearId:ID,targetYearId:ID,plan:Plan){
  requiredId(batch.id);if(!Number.isInteger(batch.version)||batch.version<1||batch.sourceYearId!==sourceYearId||batch.targetYearId!==targetYearId||!Array.isArray(batch.plan)||planSignature(batch.plan)!==planSignature(plan))throw new RepoError('NETWORK','Chưa xác minh được xác nhận chuyển năm. Giữ quyết định và thử lại.');
  return batch;
}
async function intentHash(value:unknown){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)));return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');}

/** Retain acknowledged stages and explicit keys through lost responses; retry is user driven. */
export async function applyRollover(schoolId:ID,sourceYearId:ID,targetYearId:ID,decisions:RolloverDecision[]){
  const access=captureStaffAccess(),roster=previews.get(previewKey(schoolId,sourceYearId));
  if(!decisions.length||new Set(decisions.map(d=>d.studentId)).size!==decisions.length)throw new RepoError('VALIDATION','Cần chọn học sinh, mỗi học sinh một quyết định.');
  const plan:Plan=[...decisions].sort((a,b)=>a.studentId.localeCompare(b.studentId)).map(d=>{
    const fromClassId=d.fromClassId??roster?.get(d.studentId);
    if(!fromClassId)throw new RepoError('CONFLICT','Hãy tải lại danh sách cuối năm trước khi xếp lớp.',{details:{requiresReload:true}});
    if(roster&&roster.get(d.studentId)!==fromClassId)throw new RepoError('VALIDATION','Học sinh không thuộc lớp nguồn đã hiển thị.');
    if(!['promote','retain','leave'].includes(d.action))throw new RepoError('VALIDATION','Quyết định chuyển năm chưa hợp lệ.');
    if(d.action!=='leave'&&!d.targetClassId)throw new RepoError('VALIDATION','Học sinh tiếp tục học cần lớp đích.');
    return {studentId:d.studentId,fromClassId,...(d.action==='leave'?{}:{toClassId:d.targetClassId}),decision:d.action==='promote'?'PROMOTED':d.action==='retain'?'REPEATED':'LEFT'};
  });
  const hash=await intentHash({schoolId,sourceYearId,targetYearId,plan});access.assertCurrent();
  let flow=flows.get(hash);if(!flow){if(flows.size>=128)throw new RepoError('CONFLICT','Có nhiều lệnh chuyển năm chưa xác nhận. Hãy kiểm tra các lệnh trước khi tạo thêm.');flow={createKey:crypto.randomUUID(),validateKey:crypto.randomUUID(),commitKey:crypto.randomUUID(),needsValidation:true};flows.set(hash,flow);}
  if(flow.pending)return flow.pending;
  const state=flow;
  const work=(async()=>{
    access.assertCurrent();
    if(!state.batch)state.batch=acknowledge((await http('createRollover',{params:{schoolId,yearId:sourceYearId},body:{targetYearId,plan},idempotencyKey:state.createKey})).data,sourceYearId,targetYearId,plan);
    access.assertCurrent();
    if(state.batch.status==='APPLIED')return {enrolled:state.batch.plan.filter(p=>p.toClassId).length,left:state.batch.plan.filter(p=>!p.toClassId).length,warnings:state.batch.warnings};
    if(!['DRAFT','VALIDATED'].includes(state.batch.status))throw new RepoError('CONFLICT','Lệnh chuyển năm không ở trạng thái có thể áp dụng.');
    if(state.needsValidation){
      const validated=acknowledge((await http('validateRollover',{params:{schoolId,rolloverId:requiredId(state.batch.id)},body:{expectedVersion:state.batch.version},idempotencyKey:state.validateKey})).data,sourceYearId,targetYearId,plan);
      access.assertCurrent();if(validated.status!=='VALIDATED')throw new RepoError('NETWORK','Chưa nhận được xác nhận kiểm tra kế hoạch.');state.batch=validated;state.needsValidation=false;
    }
    access.assertCurrent();const previewHash=requiredValue(state.batch.planHash,'planHash');
    let saved:Batch;
    try{saved=(await http('commitRollover',{params:{schoolId,rolloverId:requiredId(state.batch.id)},body:{expectedVersion:state.batch.version,previewHash},idempotencyKey:state.commitKey})).data;}
    catch(error){if(error instanceof RepoError&&error.details?.problemCode==='STALE_PREVIEW'){state.needsValidation=true;state.validateKey=crypto.randomUUID();state.commitKey=crypto.randomUUID();}throw error;}
    access.assertCurrent();acknowledge(saved,sourceYearId,targetYearId,plan);
    if(saved.status!=='APPLIED')throw new RepoError('NETWORK','Máy chủ chưa xác nhận đã xếp lớp.');state.batch=saved;
    return {enrolled:saved.plan.filter(p=>p.toClassId).length,left:saved.plan.filter(p=>!p.toClassId).length,warnings:saved.warnings};
  })();state.pending=work;try{return await work;}finally{if(state.pending===work)state.pending=undefined;}
}
