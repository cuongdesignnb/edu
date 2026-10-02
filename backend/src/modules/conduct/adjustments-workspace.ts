import crypto from 'node:crypto';
import {one,iso,type Row,type Transaction} from '../../database/database';
import {Permissions} from '../../common/permissions';
import {Problem,validation} from '../../common/problem';
import {version} from './conduct-data';
import {context,scope,can,week,selected,checkSource,snapshotView,setView} from './conduct-workspace';
import type {AdjustmentsService} from './adjustments.service';
import type {RequestContext,Result} from '../../api.router';

export const adjustmentWorkspaceOperations=['getConductAdjustmentWorkspace','requestConductWorkspaceAdjustment','decideConductWorkspaceAdjustment','publishConductWorkspaceAdjustment'];
export async function authorizeAdjustmentWorkspace(tx:Transaction,p:Permissions,c:RequestContext){
 const x=await context(tx,p,c);await p.require(tx,c.principal!,'publication.read',{...scope(x)});
 if(c.operation.method==='GET'){if(!['conduct.adjust.request','conduct.adjust.approve'].some(a=>can(x,a)))throw new Problem(404,'RESOURCE_NOT_FOUND');}
 else {const id=c.operation.id==='requestConductWorkspaceAdjustment'?String((c.body.source as Row).weekId):(await one<Row>(tx,'SELECT cp.week_id FROM app.adjustment_requests a JOIN app.conduct_periods cp ON cp.school_id=a.school_id AND cp.id=a.period_id WHERE a.school_id=$1 AND cp.class_id=$2 AND a.id=$3',[x.s,x.c,c.params.adjustmentId]))?.week_id;if(!id)throw new Problem(404,'RESOURCE_NOT_FOUND');const w=await week(tx,x,String(id));await p.require(tx,c.principal!,c.operation.permission,{...scope(x),date:String(w.starts_on)});if(c.operation.id==='publishConductWorkspaceAdjustment'&&!can(x,'conduct.publish',String(w.starts_on)))throw new Problem(404,'RESOURCE_NOT_FOUND');if(c.operation.id==='decideConductWorkspaceAdjustment'&&c.body.approve&&x.school.settings&&(x.school.settings as Row).conductRequireLeaderApproval===true&&!(await one<{ok:boolean}>(tx,"SELECT app.school_conduct_approver($1,$2,'conduct.adjust.approve') AS ok",[x.s,x.userId]))!.ok)throw new Problem(404,'RESOURCE_NOT_FOUND');}
}
export async function adjustmentWorkspace(tx:Transaction,p:Permissions,c:RequestContext,service:AdjustmentsService):Promise<Result>{
 const x=await context(tx,p,c),op=c.operation.id;if(Object.keys(c.query).length)throw new Problem(422,'INVALID_QUERY');
 const get=async(id:string)=>{const a=await one<Row>(tx,'SELECT a.* FROM app.adjustment_requests a JOIN app.conduct_periods cp ON cp.school_id=a.school_id AND cp.id=a.period_id WHERE a.school_id=$1 AND cp.class_id=$2 AND cp.year_id=$3 AND a.id=$4',[x.s,x.c,x.y,id]);if(!a)throw new Problem(404,'RESOURCE_NOT_FOUND');return a;};
 const item=async(a:Row)=>{
  const pub=(await one<Row>(tx,'SELECT * FROM app.publication_revisions WHERE school_id=$1 AND id=$2 AND class_id=$3',[x.s,a.baseline_publication_id,x.c]))!,cp=(await one<Row>(tx,'SELECT week_id FROM app.conduct_periods WHERE school_id=$1 AND id=$2',[x.s,a.period_id]))!,w=await week(tx,x,String(cp.week_id)),d=await selected(tx,x,w),changes=a.proposed_changes as {recordId:string;action:string;replacement?:Row}[];
  const old=changes.length===1?d.records.find(r=>r.id===changes[0]!.recordId):undefined,e=old?d.enrollments.find(e=>e.id===old.enrollment_id):changes.length===1&&changes[0]!.action==='ADD'?d.enrollments.find(e=>e.id===changes[0]!.replacement?.enrollmentId):undefined;
  const preview=a.preview as {before:{students:Row[]};after:{students:Row[]}},before=e?preview.before.students.find(r=>r.studentId===e.student_id):undefined,after=e?preview.after.students.find(r=>r.studentId===e.student_id):undefined;
  const actor=async(id:unknown)=>id?(await one<Row>(tx,'SELECT work_display_name FROM app.memberships WHERE school_id=$1 AND user_id=$2',[x.s,id]))?.work_display_name??null:null;
  const result=a.result_publication_id?await one<Row>(tx,'SELECT status FROM app.publication_revisions WHERE school_id=$1 AND id=$2',[x.s,a.result_publication_id]):null;
  return {...scope(x),id:a.id,version:a.version,source:d.source,snapshotId:a.baseline_publication_id,studentId:e?.student_id??null,recordId:old?.id??null,kind:changes.length!==1?'batch':changes[0]!.action==='ADD'?'add_record':changes[0]!.action==='EXCLUDE'?'remove_record':'change_points',newPoints:changes[0]?.replacement?.manualDelta!==undefined?Number(changes[0].replacement.manualDelta):null,ruleId:changes[0]?.replacement?.ruleId??null,beforeTotal:before?Number(before.finalPoints):null,afterTotal:after?Number(after.finalPoints):null,reason:a.reason,status:a.status==='SUBMITTED'?'pending':a.status==='APPLIED'?'published':a.status==='APPROVED'?'approved':'rejected',requestedBy:a.requested_by,requestedAt:iso(a.created_at as Date),requestedByName:await actor(a.requested_by),decidedBy:a.decided_by??null,decidedAt:a.decided_at?iso(a.decided_at as Date):null,decidedByName:await actor(a.decided_by),decisionNote:a.decision_reason??null,resultSnapshotId:a.result_publication_id??null,resultSnapshotStatus:result?String(result.status).toLowerCase():null,studentName:e?.full_name??'Điều chỉnh nhiều ghi nhận',weekIndex:w.week_number,weekId:w.id,snapshotVersion:pub.revision,recordLabel:old?`${old.rule_label_snapshot} (${old.delta_snapshot}) — ${old.date}`:null};
 };
 if(op==='getConductAdjustmentWorkspace'){
  const rows=(await tx.query<Row>('SELECT a.* FROM app.adjustment_requests a JOIN app.conduct_periods cp ON cp.school_id=a.school_id AND cp.id=a.period_id WHERE a.school_id=$1 AND cp.class_id=$2 AND cp.year_id=$3 ORDER BY a.created_at DESC,a.id LIMIT 501',[x.s,x.c,x.y])).rows;if(rows.length>500)throw new Problem(422,'WORKSPACE_LIMIT');
  const pubs=(await tx.query<Row>("SELECT * FROM app.publication_revisions WHERE school_id=$1 AND class_id=$2 AND year_id=$3 AND kind='CONDUCT' AND status='PUBLISHED' ORDER BY revision DESC,id LIMIT 501",[x.s,x.c,x.y])).rows;if(pubs.length>500)throw new Problem(422,'WORKSPACE_LIMIT');
  const items=[];for(const row of rows)items.push(await item(row));const snapshots=[];for(const pub of pubs)snapshots.push(await snapshotView(tx,x,pub));
  return {data:{...scope(x),items,canRequest:can(x,'conduct.adjust.request'),canApprove:can(x,'conduct.adjust.approve')&&((x.school.settings as Row).conductRequireLeaderApproval!==true||(await one<{ok:boolean}>(tx,"SELECT app.school_conduct_approver($1,$2,'conduct.adjust.approve') AS ok",[x.s,x.userId]))!.ok),canPublish:can(x,'conduct.adjust.approve')&&can(x,'conduct.publish'),me:x.userId,snapshots,rules:pubs[0]?(await setView(tx,x,await selected(tx,x,await week(tx,x,String((await one<Row>(tx,'SELECT week_id FROM app.conduct_periods WHERE school_id=$1 AND id=$2',[x.s,pubs[0].conduct_period_id]))!.week_id)))))?.rules??[]:[]}};
 }
 let a:Row|undefined,w:Row;
 if(op==='requestConductWorkspaceAdjustment')w=await week(tx,x,String((c.body.source as Row).weekId));else{a=await get(c.params.adjustmentId!);version(a,c.body.version);const cp=(await one<Row>(tx,'SELECT week_id FROM app.conduct_periods WHERE school_id=$1 AND id=$2',[x.s,a.period_id]))!;w=await week(tx,x,String(cp.week_id));}
 const d=await selected(tx,x,w);checkSource(d,c.body.source);if(!d.p)throw new Problem(404,'RESOURCE_NOT_FOUND');
 if(op==='requestConductWorkspaceAdjustment'){
  if(c.body.kind==='add_record'){
   if(d.source.publicationId!==c.body.snapshotId)throw new Problem(409,'STALE_BASELINE');
   const date=String(c.body.date??''),e=d.enrollments.find(e=>e.student_id===c.body.studentId&&String(e.starts_on)<=date&&(!e.ends_on||String(e.ends_on)>date)),rule=d.config.rules.find(r=>r.id===c.body.ruleId);
   if(!e)validation('date','Chọn ngày sự việc mà học sinh thuộc lớp trong tuần công bố');
   if(!rule)validation('ruleId','Quy định không thuộc nội quy của bản công bố');
   if(rule.attendance_status)validation('ruleId','Ghi nhận từ chuyên cần cần nguồn điểm danh, không bổ sung thủ công');
   const timestamp=(await one<{at:Date}>(tx,'SELECT ($2::date::timestamp AT TIME ZONE timezone) AS at FROM platform.schools WHERE id=$1',[x.s,date]))!.at;
   const replacement={periodId:d.p.id,enrollmentId:e.id,ruleId:rule.id,publicReason:c.body.reason,occurredAt:iso(timestamp),sourceKind:'MANUAL',clientEventId:crypto.randomUUID(),...(rule.value_mode==='MANUAL'?{manualDelta:String(c.body.newPoints)}:{})};
   const result=await service.work(tx,{...c,operation:{...c.operation,id:'createAdjustment'},body:{periodId:d.p.id,baselinePublicationId:c.body.snapshotId,reason:c.body.reason,proposedChanges:[{action:'ADD',replacement}]}});
   return {data:await item(await get(String((result.data as Row).id))),status:201};
  }
  if(d.source.publicationId!==c.body.snapshotId)throw new Problem(409,'STALE_BASELINE');const old=d.records.find(r=>r.id===c.body.recordId),e=old?d.enrollments.find(e=>e.id===old.enrollment_id):undefined;if(!old||old.status!=='APPROVED'||!e||e.student_id!==c.body.studentId)validation('recordId','Chọn đúng ghi nhận đã công bố của học sinh');
  const change:Row={recordId:old.id,action:'EXCLUDE'};
  if(c.body.kind==='change_points'){const rule=d.config.rules.find(r=>r.id===old.rule_id);if(rule?.value_mode!=='MANUAL')validation('newPoints','Quy định điểm cố định không nhận điểm ghi đè; chỉ sửa điểm thủ công trong giới hạn đã ban hành');if(c.body.newPoints===null)validation('newPoints','Nhập điểm điều chỉnh');change.action='REPLACE';change.replacement={periodId:d.p.id,enrollmentId:old.enrollment_id,ruleId:old.rule_id,publicReason:c.body.reason,occurredAt:iso(old.occurred_at as Date),sourceKind:old.source_kind,clientEventId:cryptoId(old.source_key),manualDelta:String(c.body.newPoints),...(old.source_id?{sourceId:old.source_id}:{}),...(old.lesson_id?{lessonId:old.lesson_id}:{})};}
  const result=await service.work(tx,{...c,operation:{...c.operation,id:'createAdjustment'},body:{periodId:d.p.id,baselinePublicationId:c.body.snapshotId,reason:c.body.reason,proposedChanges:[change]}});return {data:await item(await get(String((result.data as Row).id))),status:201};
 }
 if(op==='decideConductWorkspaceAdjustment'){
  await service.work(tx,{...c,operation:{...c.operation,id:c.body.approve?'approveAdjustment':'rejectAdjustment'},body:{expectedVersion:a!.version,...(!c.body.approve?{reason:c.body.note}:{})}});return {data:await item(await get(String(a!.id)))};
 }
 const result=await service.work(tx,{...c,operation:{...c.operation,id:'applyAdjustment'},body:{expectedSourceVersion:d.p.data_version,expectedPublicationId:d.source.publicationId}}),pub=(await one<Row>(tx,'SELECT * FROM app.publication_revisions WHERE school_id=$1 AND id=$2',[x.s,(result.data as Row).id]))!,next=await selected(tx,x,w);
 return {data:{source:next.source,changed:1,status:'published',record:null,snapshot:await snapshotView(tx,x,pub)}};
}
function cryptoId(key:unknown){const id=String(key).replace(/^manual:/,'');if(!/^[\da-f-]{36}$/i.test(id))validation('recordId','Nguồn điểm thủ công không hợp lệ');return id;}
