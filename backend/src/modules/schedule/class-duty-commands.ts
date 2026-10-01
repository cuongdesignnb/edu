import {one,type Row,type Transaction} from '../../database/database';
import {Permissions} from '../../common/permissions';
import {Commands,audit} from '../../common/commands';
import {Problem,notFound,validation} from '../../common/problem';
import {PublicationsService,type ParentItem} from '../publications/publications.service';
import {dutyDto} from './schedule-data';
import {dutyContext,dutyAllows,dutyBounded,currentDutyPublication,nextDay,type DutyContext} from './class-duty-workspace';
import type {RequestContext,Result} from '../../api.router';

type Target={scheduleId:string;expectedVersion:number;expectedDataVersion:number;date:string;task:string;assignmentIds:string[];groupPlanId:string|null};
type Fact={enrollmentId:string;date:string;task:string;status:string;groupId:string|null;groupKey:string|null;groupStatus:string|null;assignmentId?:string};
const sameIds=(a:string[],b:string[])=>JSON.stringify([...a].sort())===JSON.stringify([...b].sort());
async function targetSchedule(tx:Transaction,ctx:DutyContext,target:Target|null){
 if(!target)return null;
 const row=await one<Row>(tx,'SELECT * FROM app.duty_schedules WHERE school_id=$1 AND class_id=$2 AND year_id=$3 AND id=$4 FOR UPDATE',[ctx.schoolId,ctx.classId,ctx.yearId,target.scheduleId]);
 if(!row)notFound();return row;
}
async function effectiveFacts(tx:Transaction,ctx:DutyContext,date:string):Promise<Fact[]>{
 const row=await one<Row>(tx,"SELECT id FROM app.duty_schedules WHERE school_id=$1 AND class_id=$2 AND year_id=$3 AND status='PUBLISHED' AND starts_on<=$4 AND ends_on>$4 ORDER BY published_at DESC,id DESC LIMIT 1",[ctx.schoolId,ctx.classId,ctx.yearId,date]);
 if(!row)return [];
 return dutyBounded((await tx.query<Row>(`SELECT a.id,a.enrollment_id,a.duty_date,a.task,a.status,a.group_plan_id,g.group_id,g.status AS group_status FROM app.duty_assignments a
  JOIN app.enrollments e ON e.school_id=a.school_id AND e.id=a.enrollment_id LEFT JOIN app.duty_group_plans g ON g.school_id=a.school_id AND g.id=a.group_plan_id
  WHERE a.school_id=$1 AND a.schedule_id=$2 AND a.duty_date=$3 AND e.class_id=$4 AND e.year_id=$5 AND e.status<>'CANCELLED' AND e.starts_on<=$3 AND (e.ends_on IS NULL OR e.ends_on>$3)
  ORDER BY a.id LIMIT 5001`,[ctx.schoolId,row.id,date,ctx.classId,ctx.yearId])).rows,5000).map(a=>({assignmentId:String(a.id),enrollmentId:String(a.enrollment_id),date:String(a.duty_date),task:String(a.task),status:String(a.status),groupId:a.group_id as string|null,groupKey:a.group_plan_id as string|null,groupStatus:a.group_status as string|null}));
}
async function createDay(tx:Transaction,c:RequestContext,ctx:DutyContext,date:string,facts:Fact[],publish:boolean){
 dutyBounded(facts,5000);dutyBounded([...new Set(facts.map(f=>f.groupKey).filter(Boolean))],200);const seen=new Set<string>();for(const f of facts){const key=JSON.stringify([f.enrollmentId,f.date,f.task]);if(seen.has(key))validation('studentIds','Nhiệm vụ của học sinh bị trùng trong ngày');seen.add(key);}
 const row=(await one<Row>(tx,'INSERT INTO app.duty_schedules(school_id,class_id,year_id,starts_on,ends_on,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[ctx.schoolId,ctx.classId,ctx.yearId,date,nextDay(date),c.principal!.userId]))!;
 const groups=new Map<string,string>();
 for(const f of facts){if(f.groupKey&&!groups.has(f.groupKey)){const selected=facts.filter(a=>a.groupKey===f.groupKey).map(a=>a.enrollmentId);
   const g=(await one<{id:string}>(tx,'INSERT INTO app.duty_group_plans(school_id,class_id,schedule_id,group_id,duty_date,task,status,enrollment_targets) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',[ctx.schoolId,ctx.classId,row.id,f.groupId,date,f.task,f.groupStatus??'ASSIGNED',selected]))!;groups.set(f.groupKey,g.id);}}
 for(const f of facts)if(publish||!f.groupKey)await tx.query('INSERT INTO app.duty_assignments(school_id,class_id,schedule_id,enrollment_id,duty_date,task,status,group_plan_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[ctx.schoolId,ctx.classId,row.id,f.enrollmentId,date,f.task,f.status,f.groupKey?groups.get(f.groupKey):null]);
 if(publish)await tx.query("UPDATE app.duty_schedules SET status='PUBLISHED',published_at=now() WHERE school_id=$1 AND id=$2",[ctx.schoolId,row.id]);
 return (await one<Row>(tx,'SELECT * FROM app.duty_schedules WHERE school_id=$1 AND id=$2',[ctx.schoolId,row.id]))!;
}
async function parentItems(tx:Transaction,ctx:DutyContext):Promise<ParentItem[]>{
 const rows=dutyBounded((await tx.query<Row>(`SELECT e.student_id,a.duty_date,a.task,a.status FROM app.duty_assignments a JOIN app.duty_schedules d ON d.school_id=a.school_id AND d.id=a.schedule_id
  JOIN app.enrollments e ON e.school_id=a.school_id AND e.id=a.enrollment_id WHERE a.school_id=$1 AND a.class_id=$2 AND d.year_id=$3 AND d.status='PUBLISHED' AND e.class_id=$2 AND e.year_id=$3
  AND e.status<>'CANCELLED' AND e.starts_on<=a.duty_date AND (e.ends_on IS NULL OR e.ends_on>a.duty_date)
  AND NOT EXISTS(SELECT 1 FROM app.duty_schedules newer WHERE newer.school_id=d.school_id AND newer.class_id=d.class_id AND newer.year_id=d.year_id AND newer.status='PUBLISHED'
   AND (newer.published_at,newer.id)>(d.published_at,d.id) AND newer.starts_on<=a.duty_date AND newer.ends_on>a.duty_date)
  ORDER BY e.student_id,a.duty_date,a.id LIMIT 100001`,[ctx.schoolId,ctx.classId,ctx.yearId])).rows,100000);
 const byStudent=new Map<string,Record<string,unknown>[]>();
 for(const a of rows){const id=String(a.student_id),items=byStudent.get(id)??[];if(items.length>=5000)throw new Problem(422,'PROJECTION_LIMIT');items.push({date:a.duty_date,task:a.task,status:a.status,publishedAt:new Date().toISOString()});byStudent.set(id,items);}
 return [...byStudent].map(([studentId,items])=>({studentId,section:'duties',schema:'ParentDutyBatch',payload:{items}}));
}

/** A row edit/removed row becomes a new native dated source; immutable published children are never changed. */
export async function classDutyCommand(policy:Permissions,commands:Commands,publications:PublicationsService,c:RequestContext,remove=false):Promise<Result>{
 const target=c.body.source as Target|null,date=remove?target?.date:String(c.body.date),publish=!remove&&c.body.publish===true;
 const authorize=async(tx:Transaction)=>{
  const ctx=await dutyContext(tx,policy,c,'duty.manage',true);await policy.require(tx,c.principal!,'duty.read',{schoolId:ctx.schoolId,classId:ctx.classId,yearId:ctx.yearId});
  const old=await targetSchedule(tx,ctx,target);
  for(const day of new Set([date,target?.date].filter((x):x is string=>!!x))){
   if(day<ctx.startsOn||day>=ctx.endsOn)validation('date','Ngày ngoài năm học');
   if(!dutyAllows(ctx,'duty.manage',day)||!dutyAllows(ctx,'duty.read',day))throw new Problem(404,'RESOURCE_NOT_FOUND');
   if((publish||old?.status==='PUBLISHED')&&!dutyAllows(ctx,'duty.publish',day))throw new Problem(403,'FORBIDDEN');
  }return {ctx,old};
 };
 return commands.execute(c,authorize,async tx=>{
  const {ctx,old}=await authorize(tx),current=await currentDutyPublication(tx,ctx);
  for(const day of [date,target?.date].filter((x):x is string=>!!x))if(day<ctx.today)validation('date','Chỉ sửa ngày hiện tại hoặc tương lai trong năm học');
  if(old&&!['DRAFT','PUBLISHED'].includes(String(old.status)))throw new Problem(409,'SCHEDULE_IMMUTABLE');
  if((c.body.expectedPublicationId??null)!==(current?.id??null))throw new Problem(409,'PUBLICATION_CONFLICT');
  let targetIds:string[]=[];
  if(target&&old){
   if(Number(old.version)!==target.expectedVersion||Number(old.data_version)!==target.expectedDataVersion)throw new Problem(409,'STALE_SOURCE',undefined,Number(old.data_version));
   const rows=(await tx.query<{id:string}>(txqueryTarget,[ctx.schoolId,old.id,target.date,target.task,target.groupPlanId])).rows;targetIds=rows.map(a=>a.id);
   if(!sameIds(targetIds,target.assignmentIds))throw new Problem(409,'DUTY_TASK_CHANGED');
   if(target.groupPlanId){const group=await one<Row>(tx,'SELECT id FROM app.duty_group_plans WHERE school_id=$1 AND schedule_id=$2 AND id=$3 AND duty_date=$4 AND task=$5',[ctx.schoolId,old.id,target.groupPlanId,target.date,target.task]);if(!group)notFound();}
   else if(!targetIds.length)notFound();
   if(old.status==='PUBLISHED'){
    const latest=await one<Row>(tx,"SELECT id FROM app.duty_schedules WHERE school_id=$1 AND class_id=$2 AND year_id=$3 AND status='PUBLISHED' AND starts_on<=$4 AND ends_on>$4 ORDER BY published_at DESC,id DESC LIMIT 1",[ctx.schoolId,ctx.classId,ctx.yearId,target.date]);
    if(latest?.id!==old.id)throw new Problem(409,'DUTY_TASK_CHANGED');
   }
  }
  let added:Fact[]=[];
  if(!remove){
   const ids=c.body.studentIds as string[],groupId=c.body.groupId as string|null,task=String(c.body.task).trim();if(task.length<3)validation('task','Mô tả nhiệm vụ');
   const students=(await tx.query<{id:string}>(`SELECT id FROM app.enrollments WHERE school_id=$1 AND class_id=$2 AND year_id=$3 AND student_id=ANY($4::uuid[]) AND status<>'CANCELLED' AND starts_on<=$5 AND (ends_on IS NULL OR ends_on>$5) ORDER BY id`,[ctx.schoolId,ctx.classId,ctx.yearId,ids,date])).rows;
   if(students.length!==ids.length)validation('studentIds','Có học sinh không thuộc lớp trong ngày trực');
   if(groupId){const group=await one<Row>(tx,'SELECT id FROM app.class_groups WHERE school_id=$1 AND class_id=$2 AND id=$3',[ctx.schoolId,ctx.classId,groupId]);if(!group)notFound();
    const eligible=(await tx.query('SELECT enrollment_id FROM app.group_memberships WHERE school_id=$1 AND class_id=$2 AND group_id=$3 AND enrollment_id=ANY($4::uuid[]) AND cancelled_at IS NULL AND starts_on<=$5 AND ends_on>$5',[ctx.schoolId,ctx.classId,groupId,students.map(s=>s.id),date])).rows;if(eligible.length!==students.length)validation('studentIds','Có học sinh không thuộc tổ trong ngày trực');}
   added=students.map(s=>({enrollmentId:s.id,date:date!,task,status:'ASSIGNED',groupId,groupKey:groupId?'new:'+groupId:null,groupStatus:groupId?'ASSIGNED':null}));
  }
  if(target&&old?.status==='DRAFT'){
   await tx.query('DELETE FROM app.duty_assignments WHERE school_id=$1 AND schedule_id=$2 AND id=ANY($3::uuid[])',[ctx.schoolId,old.id,targetIds]);
   if(target.groupPlanId)await tx.query('DELETE FROM app.duty_group_plans WHERE school_id=$1 AND schedule_id=$2 AND id=$3',[ctx.schoolId,old.id,target.groupPlanId]);
   const remaining=await one<{n:number}>(tx,'SELECT (SELECT count(*) FROM app.duty_assignments WHERE school_id=$1 AND schedule_id=$2)+(SELECT count(*) FROM app.duty_group_plans WHERE school_id=$1 AND schedule_id=$2) AS n',[ctx.schoolId,old.id]);
   if(Number(remaining?.n)===0)await tx.query("UPDATE app.duty_schedules SET status='ARCHIVED' WHERE school_id=$1 AND id=$2",[ctx.schoolId,old.id]);
  }
  const affected=new Set<string>();if(old?.status==='PUBLISHED'&&target)affected.add(target.date);if(publish)affected.add(date!);
  const created:Row[]=[];
  for(const day of affected){let facts=await effectiveFacts(tx,ctx,day);if(target&&old?.status==='PUBLISHED'&&day===target.date)facts=facts.filter(f=>!targetIds.includes(f.assignmentId!));if(publish&&day===date)facts.push(...added);created.push(await createDay(tx,c,ctx,day,facts,true));}
  let draft:Row|null=null;if(!remove&&!publish)draft=await createDay(tx,c,ctx,date!,added,false);
  if(created.length){
   const source=created.at(-1)!;await tx.query("UPDATE app.publication_revisions SET status='SUPERSEDED' WHERE school_id=$1 AND class_id=$2 AND year_id=$3 AND kind='DUTY' AND status='PUBLISHED'",[ctx.schoolId,ctx.classId,ctx.yearId]);
   await publications.create(tx,{...c,body:{...c.body,expectedPublicationId:null}},{kind:'DUTY',id:String(source.id),schoolId:ctx.schoolId,classId:ctx.classId,yearId:ctx.yearId,version:Number(source.data_version)},{duty:await dutyDto(tx,source)},await parentItems(tx,ctx),true);
  }
  const source=draft??created.at(-1);await audit(tx,c,'duty',String(source?.id??old?.id),{action:remove?'REMOVED':publish?'PUBLISHED':'DRAFT',datedSources:created.map(r=>r.id),replacedSource:old?.id??null});
  return {data:{sourceId:remove?null:source!.id,status:remove?'REMOVED':publish?'PUBLISHED':'DRAFT'}};
 });
}
const txqueryTarget='SELECT id FROM app.duty_assignments WHERE school_id=$1 AND schedule_id=$2 AND duty_date=$3 AND task=$4 AND group_plan_id IS NOT DISTINCT FROM $5::uuid ORDER BY id';
