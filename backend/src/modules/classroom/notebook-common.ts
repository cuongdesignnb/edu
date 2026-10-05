import crypto from 'node:crypto';
import {one,type Transaction,type Row} from '../../database/database';
import {Problem,validation,notFound} from '../../common/problem';
import {canonical} from '../../common/commands';
import {hashToken} from '../../common/security';
import type {RequestContext,Result} from '../../api.router';
export const id=(value:unknown,key='id')=>{if(typeof value!=='string'||! /^[a-f0-9]{8}-[a-f0-9-]{27}$/i.test(value))validation(key,'Mã tham chiếu không hợp lệ');return value;};
export const text=(value:unknown,key:string,min=1,max=500)=>{if(typeof value!=='string'||value.trim().length<min||value.length>max)validation(key,`Nhập ${min}–${max} ký tự`);return value.trim();};
export function expected(row:Row,value:unknown){if(Number(row.version)!==value)throw new Problem(409,'VERSION_CONFLICT',undefined,Number(row.version));}
export async function officerAudit(tx:Transaction,c:RequestContext,action:string,target:string,metadata:Row={},reason?:string){
 await tx.query(`INSERT INTO app.audit_events(school_id,actor_user_id,actor_kind,action,target_type,target_id,request_id,reason,redacted_after)
 VALUES($1,NULL,'CLASS_OFFICER',$2,'class-officer',$3,$4,$5,$6)`,[c.capability!.schoolId,action,target,c.requestId,reason??null,{assignmentId:c.capability!.assignmentId,role:c.capability!.role,...metadata}]);
}
export async function capabilityCommand(tx:Transaction,c:RequestContext,work:()=>Promise<Result>){
 const p=c.capability!,key=c.request.headers['idempotency-key'];if(typeof key!=='string'||key.length<16||key.length>128)throw new Problem(422,'IDEMPOTENCY_KEY_REQUIRED');
 await tx.query('SELECT app.lock_school()');
 const requestHash=hashToken(canonical({body:c.body,params:c.params,query:c.query})),keyHash=hashToken(key);
 const old=await one<Row>(tx,'SELECT * FROM app.capability_commands WHERE school_id=$1 AND session_id=$2 AND operation=$3 AND key_hash=$4',[p.schoolId,p.sessionId,c.operation.id,keyHash]);
 if(old){if(old.request_hash!==requestHash)throw new Problem(409,'IDEMPOTENCY_CONFLICT');return old.response_metadata as unknown as Result;}
 const result=await work();await tx.query('INSERT INTO app.capability_commands(school_id,session_id,operation,key_hash,request_hash,response_metadata) VALUES($1,$2,$3,$4,$5,$6)',[p.schoolId,p.sessionId,c.operation.id,keyHash,requestHash,result]);return result;
}
export async function classPortal(tx:Transaction,schoolId:string,classId:string){
 await tx.query(`INSERT INTO platform.public_class_portals(school_id,class_id,slug) VALUES($1,$2,$3) ON CONFLICT(school_id,class_id) DO NOTHING`,[schoolId,classId,crypto.randomBytes(12).toString('hex')]);
 const row=await one<Row>(tx,'SELECT slug FROM platform.public_class_portals WHERE school_id=$1 AND class_id=$2',[schoolId,classId]);if(!row)notFound();return String(row.slug);
}
export async function expireWeekly(tx:Transaction,schoolId:string){
 const locked=(await tx.query<Row>(`WITH deadlines AS (
 SELECT x.id,coalesce(wc.lock_deadline,(w.starts_on+coalesce((c.notebook_settings->>'weeklyDeadlineDay')::integer,(s.settings->>'weeklyDeadlineDay')::integer,4)*interval '1 day'+coalesce((c.notebook_settings->>'weeklyLockTime')::time,(s.settings->>'weeklyLockTime')::time,time '20:00')) AT TIME ZONE s.timezone) AS deadline
 FROM app.class_week_submissions x JOIN app.school_weeks w ON w.school_id=x.school_id AND w.id=x.week_id
 JOIN app.classes c ON c.school_id=x.school_id AND c.id=x.class_id JOIN platform.schools s ON s.id=x.school_id
 LEFT JOIN app.class_week_settings wc ON wc.school_id=x.school_id AND wc.class_id=x.class_id AND wc.week_id=x.week_id WHERE x.school_id=$1 AND x.status='DRAFT')
 UPDATE app.class_week_submissions x SET status='LOCKED',reopened_until=NULL
 WHERE x.school_id=$1 AND ((x.status='SUBMITTED' AND x.lock_at<=now()) OR(x.status='REOPENED' AND x.reopened_until<=now()) OR(x.status='DRAFT' AND EXISTS(SELECT 1 FROM deadlines d WHERE d.id=x.id AND d.deadline<=now()))) RETURNING x.id,x.officer_assignment_id`,[schoolId])).rows;
 for(const row of locked)await tx.query(`INSERT INTO app.audit_events(school_id,actor_kind,action,target_type,target_id,request_id,redacted_after)
 VALUES($1,'SYSTEM','weekly.auto-lock','weekly-submission',$2,$3,$4)`,[schoolId,row.id,crypto.randomUUID(),{assignmentId:row.officer_assignment_id}]);
 return locked.length;
}
export async function weekSubmission(tx:Transaction,p:Row,weekId:string){
 const week=await one<Row>(tx,`SELECT w.*,x.submit_deadline AS override_submit,x.lock_deadline AS override_lock,c.notebook_settings,s.settings AS school_settings,s.timezone
 FROM app.school_weeks w JOIN app.classes c ON c.school_id=w.school_id AND c.id=$3
 JOIN platform.schools s ON s.id=w.school_id LEFT JOIN app.class_week_settings x ON x.school_id=w.school_id AND x.class_id=c.id AND x.week_id=w.id
 WHERE w.school_id=$1 AND w.id=$2 AND w.year_id=$4`,[p.school_id,weekId,p.class_id,p.year_id]);if(!week)notFound();
 const day=String((await one<Row>(tx,"SELECT (now() AT TIME ZONE $1)::date AS day",[week.timezone]))!.day);
 if(day<String(p.valid_from)||p.valid_until&&day>=String(p.valid_until))notFound();
 await tx.query(`INSERT INTO app.class_week_submissions(school_id,class_id,week_id,officer_assignment_id) VALUES($1,$2,$3,$4) ON CONFLICT(school_id,week_id,officer_assignment_id) DO NOTHING`,[p.school_id,p.class_id,weekId,p.id]);
 await expireWeekly(tx,String(p.school_id));
 const row=(await one<Row>(tx,'SELECT * FROM app.class_week_submissions WHERE school_id=$1 AND week_id=$2 AND officer_assignment_id=$3 FOR UPDATE',[p.school_id,weekId,p.id]))!;
 const config={...week.school_settings as Row,...week.notebook_settings as Row};
 const deadlines=await one<Row>(tx,`SELECT coalesce($1::timestamptz,($3::date+(coalesce($4::integer,4)*interval '1 day')+coalesce($5::time,time '18:00')) AT TIME ZONE $6) AS submit,
 coalesce($2::timestamptz,($3::date+(coalesce($4::integer,4)*interval '1 day')+coalesce($7::time,time '20:00')) AT TIME ZONE $6) AS lock`,
 [week.override_submit??week.input_deadline,week.override_lock,week.starts_on,config.weeklyDeadlineDay??4,config.weeklySubmitTime??'18:00',week.timezone,config.weeklyLockTime??'20:00']);
 return {week,row,deadlines:deadlines!};
}
export function weeklyWritable(row:Row,deadlines:Row){
 const now=Date.now(),reopened=row.status==='REOPENED'&&new Date(row.reopened_until as Date).getTime()>now;
 if(reopened)return;
 if(row.status==='LOCKED'||row.status==='REOPENED'||row.status==='SUBMITTED'&&new Date(row.lock_at as Date).getTime()<=now)throw new Problem(409,'WEEKLY_LOCKED');
 if(new Date(deadlines.submit as Date).getTime()<=now||new Date(deadlines.lock as Date).getTime()<=now)throw new Problem(409,'WEEKLY_DEADLINE_PASSED');
}
