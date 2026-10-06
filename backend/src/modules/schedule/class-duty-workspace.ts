import {Database,one,type Row,type Transaction} from '../../database/database';
import {Permissions,grantAllows,type Grant} from '../../common/permissions';
import {Problem,notFound,validation} from '../../common/problem';
import type {RequestContext} from '../../api.router';

export const nextDay=(date:string,days=1)=>new Date(Date.parse(date+'T00:00:00Z')+days*86400000).toISOString().slice(0,10);
export const weekMonday=(date:string)=>nextDay(date,-((new Date(date+'T00:00:00Z').getUTCDay()+6)%7));
export const dutyBounded=<T>(rows:T[],limit:number)=>{if(rows.length>limit)throw new Problem(422,'CLASS_DUTY_LIMIT');return rows;};
export type DutyContext={schoolId:string;yearId:string;classId:string;today:string;startsOn:string;endsOn:string;readOnly:boolean;grants:Grant[]};
export const dutyAllows=(ctx:DutyContext,action:string,date:string)=>ctx.grants.some(g=>grantAllows(g,action,{schoolId:ctx.schoolId,yearId:ctx.yearId,classId:ctx.classId,date},ctx.today));
export async function dutyContext(tx:Transaction,policy:Permissions,c:RequestContext,action='duty.read',lock=false):Promise<DutyContext>{
 const schoolId=c.params.schoolId!,yearId=c.params.yearId!,classId=c.params.classId!;
 await policy.require(tx,c.principal!,'class.read',{schoolId,yearId,classId});
 const access=await policy.require(tx,c.principal!,action,{schoolId,yearId,classId});
 const cls=await one<Row>(tx,`SELECT cl.status,y.status AS year_status,y.starts_on,y.ends_on FROM app.classes cl
  JOIN app.academic_years y ON y.school_id=cl.school_id AND y.id=cl.year_id
  WHERE cl.school_id=$1 AND cl.id=$2 AND cl.year_id=$3${lock?' FOR UPDATE OF cl':''}`,[schoolId,classId,yearId]);
 if(!cls)notFound();
 const ctx={schoolId,yearId,classId,today:access.today,startsOn:String(cls.starts_on),endsOn:String(cls.ends_on),readOnly:cls.status==='ARCHIVED'||cls.year_status==='ARCHIVED',grants:access.grants};
 if(lock&&ctx.readOnly)throw new Problem(409,'YEAR_ARCHIVED');return ctx;
}
const bounds=(ctx:DutyContext,action:string)=>JSON.stringify(ctx.grants.filter(g=>grantAllows(g,action,{schoolId:ctx.schoolId,yearId:ctx.yearId,classId:ctx.classId},ctx.today)).map(g=>({from_day:g.assignment_id?g.starts_on:null,until_day:g.assignment_id?g.ends_on:null})));
const dateAllowed=(date:string,param:string)=>`EXISTS(SELECT 1 FROM jsonb_to_recordset(${param}::jsonb) b(from_day date,until_day date) WHERE (b.from_day IS NULL OR b.from_day<=${date}) AND (b.until_day IS NULL OR b.until_day>${date}))`;
export async function currentDutyPublication(tx:Transaction,ctx:DutyContext){return one<Row>(tx,"SELECT id,version FROM app.publication_revisions WHERE school_id=$1 AND class_id=$2 AND year_id=$3 AND kind='DUTY' AND status='PUBLISHED'",[ctx.schoolId,ctx.classId,ctx.yearId]);}

/** One class/week snapshot; source names and actual targets are minimal, independently authorized. */
export async function classDutyWorkspace(db:Database,policy:Permissions,c:RequestContext){
 return db.transaction(async tx=>{
  if(Object.keys(c.query).some(k=>!['weekStart','onDate'].includes(k)))throw new Problem(422,'INVALID_QUERY');
  const ctx=await dutyContext(tx,policy,c),clipped=ctx.today<ctx.startsOn?ctx.startsOn:ctx.today>=ctx.endsOn?nextDay(ctx.endsOn,-1):ctx.today;
  const monday=c.query.weekStart??weekMonday(c.query.onDate??clipped),until=nextDay(monday,7);
  if(monday!==weekMonday(monday)||until<=ctx.startsOn||monday>=ctx.endsOn)validation('weekStart','Tuần ngoài năm học');
  const first=monday<ctx.startsOn?ctx.startsOn:monday,last=until>ctx.endsOn?ctx.endsOn:until;
  const referenceDate=c.query.onDate??(clipped<first?first:clipped>=last?nextDay(last,-1):clipped);
  if(referenceDate<first||referenceDate>=last)validation('onDate','Ngày ngoài tuần hoặc năm học');
  if(!dutyAllows(ctx,'duty.read',referenceDate))notFound();
  const canEdit=!ctx.readOnly&&dutyAllows(ctx,'duty.manage',referenceDate),canPublish=canEdit&&dutyAllows(ctx,'duty.publish',referenceDate),canPreview=dutyAllows(ctx,'parent_access.preview',referenceDate);
  const publication=await currentDutyPublication(tx,ctx),params=[ctx.schoolId,ctx.classId,ctx.yearId,first,last,bounds(ctx,'duty.read'),bounds(ctx,'duty.manage')];
  const readable=`${dateAllowed('a.duty_date','$6')} AND (d.status='PUBLISHED' OR d.status='DRAFT' AND ${dateAllowed('a.duty_date','$7')})
   AND (d.status='DRAFT' OR NOT EXISTS(SELECT 1 FROM app.duty_schedules newer WHERE newer.school_id=d.school_id AND newer.class_id=d.class_id AND newer.year_id=d.year_id AND newer.status='PUBLISHED'
    AND (newer.published_at,newer.id)>(d.published_at,d.id) AND newer.starts_on<=a.duty_date AND newer.ends_on>a.duty_date))`;
  const assignments=dutyBounded((await tx.query<Row>(`SELECT a.id,a.group_plan_id,a.enrollment_id,a.duty_date,a.task,a.status AS task_status,d.id AS schedule_id,d.version,d.data_version,d.status,
   e.student_id,s.full_name,gp.group_id,g.name AS group_name FROM app.duty_assignments a
   JOIN app.duty_schedules d ON d.school_id=a.school_id AND d.id=a.schedule_id
   LEFT JOIN app.enrollments e ON e.school_id=a.school_id AND e.id=a.enrollment_id AND e.class_id=$2 AND e.year_id=$3 AND e.status<>'CANCELLED'
    AND e.starts_on<=a.duty_date AND (e.ends_on IS NULL OR e.ends_on>a.duty_date) LEFT JOIN app.students s ON s.school_id=e.school_id AND s.id=e.student_id
   LEFT JOIN app.duty_group_plans gp ON gp.school_id=a.school_id AND gp.id=a.group_plan_id LEFT JOIN app.class_groups g ON g.school_id=gp.school_id AND g.id=gp.group_id
   WHERE a.school_id=$1 AND a.class_id=$2 AND d.year_id=$3 AND a.duty_date>=$4 AND a.duty_date<$5 AND ${readable}
   ORDER BY a.duty_date,d.id,a.task,a.group_plan_id,a.id LIMIT 5001`,params)).rows,5000);
  const draftGroups=dutyBounded((await tx.query<Row>(`SELECT a.id AS group_plan_id,a.group_id,a.duty_date,a.task,a.status AS task_status,a.enrollment_targets,
   d.id AS schedule_id,d.version,d.data_version,d.status,g.name AS group_name FROM app.duty_group_plans a
   JOIN app.duty_schedules d ON d.school_id=a.school_id AND d.id=a.schedule_id JOIN app.class_groups g ON g.school_id=a.school_id AND g.id=a.group_id
   WHERE a.school_id=$1 AND a.class_id=$2 AND d.year_id=$3 AND d.status='DRAFT' AND a.duty_date>=$4 AND a.duty_date<$5
   AND ${dateAllowed('a.duty_date','$6')} AND ${dateAllowed('a.duty_date','$7')} ORDER BY a.duty_date,a.id LIMIT 501`,params)).rows,500);
  const taskMap=new Map<string,{source:Row;assignmentIds:string[];studentIds:string[];studentNames:string[]}>();
  for(const a of assignments){const key=JSON.stringify([a.schedule_id,a.duty_date,a.task,a.group_plan_id??null]);let item=taskMap.get(key);if(!item){item={source:a,assignmentIds:[],studentIds:[],studentNames:[]};taskMap.set(key,item);}item.assignmentIds.push(String(a.id));if(a.student_id){item.studentIds.push(String(a.student_id));item.studentNames.push(String(a.full_name));}}
  for(const g of draftGroups){const key=JSON.stringify([g.schedule_id,g.duty_date,g.task,g.group_plan_id]);if(taskMap.has(key))continue;
   const members=dutyBounded((await tx.query<Row>(`SELECT e.student_id,s.full_name FROM app.enrollments e JOIN app.students s ON s.school_id=e.school_id AND s.id=e.student_id
    WHERE e.school_id=$1 AND e.class_id=$2 AND e.year_id=$5 AND e.status<>'CANCELLED' AND e.starts_on<=$4 AND (e.ends_on IS NULL OR e.ends_on>$4)
    AND (e.id=ANY($6::uuid[]) OR $6::uuid[] IS NULL AND EXISTS(SELECT 1 FROM app.group_memberships gm WHERE gm.school_id=e.school_id AND gm.enrollment_id=e.id AND gm.class_id=e.class_id
     AND gm.group_id=$3 AND gm.cancelled_at IS NULL AND gm.starts_on<=$4 AND gm.ends_on>$4)) ORDER BY e.id LIMIT 5001`,[ctx.schoolId,ctx.classId,g.group_id,g.duty_date,ctx.yearId,g.enrollment_targets??null])).rows,5000);
   taskMap.set(key,{source:g,assignmentIds:[],studentIds:members.map(e=>String(e.student_id)),studentNames:members.map(e=>String(e.full_name))});}
  const tasks=dutyBounded([...taskMap.values()].map(({source:a,assignmentIds,studentIds,studentNames})=>({id:String(a.group_plan_id??assignmentIds[0]),scheduleId:String(a.schedule_id),version:Number(a.version),dataVersion:Number(a.data_version),date:String(a.duty_date),task:String(a.task),assignmentIds,groupPlanId:a.group_plan_id??null,groupId:a.group_id??null,groupName:a.group_name??null,studentIds,studentNames,unavailableTargets:Math.max(0,(assignmentIds.length||(a.enrollment_targets as string[]|null)?.length||studentIds.length)-studentIds.length),
   status:a.status==='DRAFT'?'DRAFT':publication?'PUBLISHED':'WITHDRAWN',canEdit:!ctx.readOnly&&String(a.duty_date)>=ctx.today&&dutyAllows(ctx,'duty.manage',String(a.duty_date))&&(a.status==='DRAFT'||dutyAllows(ctx,'duty.publish',String(a.duty_date)))})),2000);
  const choices=canEdit||canPreview?dutyBounded((await tx.query<Row>(`SELECT e.id AS enrollment_id,e.student_id,s.full_name FROM app.enrollments e JOIN app.students s ON s.school_id=e.school_id AND s.id=e.student_id
   WHERE e.school_id=$1 AND e.class_id=$2 AND e.year_id=$3 AND e.status<>'CANCELLED' AND e.starts_on<=$4 AND (e.ends_on IS NULL OR e.ends_on>$4) ORDER BY s.full_name COLLATE "C",e.id LIMIT 5001`,[ctx.schoolId,ctx.classId,ctx.yearId,referenceDate])).rows,5000):[];
  const groups=canEdit?dutyBounded((await tx.query<Row>('SELECT id,name FROM app.class_groups WHERE school_id=$1 AND class_id=$2 ORDER BY sort_order,id LIMIT 101',[ctx.schoolId,ctx.classId])).rows,100):[];
  const membership=canEdit&&groups.length?dutyBounded((await tx.query<Row>(`SELECT gm.group_id,e.student_id FROM app.group_memberships gm JOIN app.enrollments e ON e.school_id=gm.school_id AND e.id=gm.enrollment_id
   WHERE gm.school_id=$1 AND gm.class_id=$2 AND e.year_id=$3 AND gm.cancelled_at IS NULL AND gm.starts_on<=$4 AND gm.ends_on>$4
   AND e.status<>'CANCELLED' AND e.starts_on<=$4 AND (e.ends_on IS NULL OR e.ends_on>$4) ORDER BY gm.group_id,e.id LIMIT 5001`,[ctx.schoolId,ctx.classId,ctx.yearId,referenceDate])).rows,5000):[];
  const preview=canPreview?dutyBounded((await tx.query<Row>(`SELECT p.student_id,j.value->>'date' AS day,j.value->>'task' AS task,j.value->>'status' AS status,j.value->>'publishedAt' AS published_at
   FROM app.parent_publication_items p CROSS JOIN LATERAL jsonb_array_elements(p.payload->'items') j(value)
   WHERE p.school_id=$1 AND p.publication_id=$2 AND p.year_id=$3 AND p.section='duties' AND (j.value->>'date')::date>=$4 AND (j.value->>'date')::date<$5
   AND ${dateAllowed("(j.value->>'date')::date",'$6')} AND ${dateAllowed("(j.value->>'date')::date",'$7')}
   AND EXISTS(SELECT 1 FROM app.enrollments e WHERE e.school_id=p.school_id AND e.student_id=p.student_id AND e.class_id=$8 AND e.year_id=p.year_id AND e.status<>'CANCELLED'
    AND e.starts_on<=(j.value->>'date')::date AND (e.ends_on IS NULL OR e.ends_on>(j.value->>'date')::date)) ORDER BY p.student_id,day,task LIMIT 5001`,[ctx.schoolId,publication?.id??null,ctx.yearId,first,last,bounds(ctx,'duty.read'),bounds(ctx,'parent_access.preview'),ctx.classId])).rows,5000).map(r=>({studentId:r.student_id,date:r.day,task:r.task,status:r.status,publishedAt:r.published_at})):null;
  const previewIds=canPreview?[...new Set([...choices.map(s=>String(s.student_id)),...(preview??[]).map(p=>String(p.studentId))])]:[];
  const previewStudents=previewIds.length?dutyBounded((await tx.query<Row>('SELECT id,full_name FROM app.students WHERE school_id=$1 AND id=ANY($2::uuid[]) ORDER BY full_name COLLATE "C",id LIMIT 5001',[ctx.schoolId,previewIds])).rows,5000).map(s=>({id:s.id,fullName:s.full_name})):[];
  return {data:{schoolId:ctx.schoolId,yearId:ctx.yearId,classId:ctx.classId,today:ctx.today,monday,referenceDate,startsOn:ctx.startsOn,endsOn:ctx.endsOn,readOnly:ctx.readOnly,canEdit,canPublish,canPreview,publicationId:publication?.id??null,tasks,
   students:choices.map(e=>({id:e.student_id,enrollmentId:e.enrollment_id,fullName:e.full_name})),groups:groups.map(g=>({id:g.id,name:g.name,studentIds:membership.filter(m=>m.group_id===g.id).map(m=>m.student_id)})),preview,previewStudents}};
 },{schoolId:c.params.schoolId,userId:c.principal!.userId,readOnly:true});
}
