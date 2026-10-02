import {Database,one,iso,type Row,type Transaction} from '../../database/database';
import {Permissions,grantAllows,type Grant} from '../../common/permissions';
import {Problem,notFound,validation} from '../../common/problem';
import {nextDay,weekMonday} from './class-duty-workspace';
import type {RequestContext} from '../../api.router';

export type ScheduleContext={schoolId:string;classId:string;yearId:string;today:string;timezone:string;startsOn:string;endsOn:string;readOnly:boolean;grants:Grant[]};
export const scheduleLimit=<T>(rows:T[],limit=5000)=>{if(rows.length>limit)throw new Problem(422,'SCHEDULE_WORKSPACE_LIMIT');return rows;};
export const scheduleAllows=(ctx:ScheduleContext,action:string,date?:string)=>ctx.grants.some(g=>grantAllows(g,action,{schoolId:ctx.schoolId,classId:ctx.classId,yearId:ctx.yearId,date,allowSubject:action==='schedule.read'},ctx.today));
export async function scheduleContext(tx:Transaction,policy:Permissions,c:RequestContext,classId:string,action='schedule.read',date?:string,lock=false):Promise<ScheduleContext>{
 const schoolId=c.params.schoolId!,access=await policy.require(tx,c.principal!,action,{schoolId,classId,date,allowSubject:action==='schedule.read'});
 const row=await one<Row>(tx,`SELECT cl.year_id,cl.status,y.status AS year_status,y.starts_on,y.ends_on,s.timezone FROM app.classes cl
  JOIN app.academic_years y ON y.school_id=cl.school_id AND y.id=cl.year_id JOIN platform.schools s ON s.id=cl.school_id
  WHERE cl.school_id=$1 AND cl.id=$2${lock?' FOR UPDATE OF cl':''}`,[schoolId,classId]);
 if(!row||c.query.yearId&&c.query.yearId!==row.year_id)notFound();
 const ctx={schoolId,classId,yearId:String(row.year_id),today:access.today,timezone:String(row.timezone),startsOn:String(row.starts_on),endsOn:String(row.ends_on),readOnly:row.status==='ARCHIVED'||row.year_status==='ARCHIVED',grants:access.grants};
 if(date&&(date<ctx.startsOn||date>=ctx.endsOn))validation('date','Ngày ngoài năm học');
 if(lock&&ctx.readOnly)throw new Problem(409,'YEAR_ARCHIVED');return ctx;
}
export async function schedulePublication(tx:Transaction,ctx:Pick<ScheduleContext,'schoolId'|'classId'|'yearId'>){return one<Row>(tx,"SELECT id FROM app.publication_revisions WHERE school_id=$1 AND class_id=$2 AND year_id=$3 AND kind='TIMETABLE' AND status='PUBLISHED' FOR UPDATE",[ctx.schoolId,ctx.classId,ctx.yearId]);}
export async function currentLesson(tx:Transaction,schoolId:string,classId:string,date:string,period:number){
 return one<Row>(tx,`SELECT l.* FROM app.lesson_occurrences l JOIN platform.schools s ON s.id=l.school_id
  WHERE l.school_id=$1 AND l.class_id=$2 AND (l.starts_at AT TIME ZONE s.timezone)::date=$3 AND l.period_number=$4
  ORDER BY (l.status='SCHEDULED') DESC,l.created_at DESC,l.id DESC LIMIT 1`,[schoolId,classId,date,period]);
}
export function changeView(row:Row,ctx:ScheduleContext,publicationId:unknown=null){
 const date=String(row.lesson_date),draft=row.status==='DRAFT';
 return {id:row.id,schoolId:row.school_id,classId:row.class_id,yearId:row.year_id,date,period:row.period_number,kind:row.kind,
  subjectId:row.subject_id??null,teacherMembershipId:row.member_id??null,roomId:row.room_id??null,reason:row.reason,status:draft?'draft':'published',version:Number(row.version),createdBy:row.created_by,createdAt:iso(row.created_at as Date),
  createdByName:row.created_by_name??'Nhân sự nhà trường',className:row.class_name,subject:row.subject_name??null,teacher:row.teacher_name??null,room:row.room_name??null,
  canEdit:draft&&!ctx.readOnly&&date>=ctx.today&&scheduleAllows(ctx,'schedule.manage',date),canPublish:draft&&!ctx.readOnly&&date>=ctx.today&&scheduleAllows(ctx,'schedule.publish',date),isPast:date<ctx.today,
  source:{lessonId:row.lesson_id,lessonVersion:Number(row.lesson_version),draftId:draft?row.id:null,draftVersion:draft?Number(row.version):null},publicationId:publicationId??null};
}
export const changeSelect=`SELECT lc.*,cl.name AS class_name,su.name AS subject_name,m.work_display_name AS teacher_name,r.name AS room_name,actor.work_display_name AS created_by_name
 FROM app.lesson_changes lc JOIN app.classes cl ON cl.school_id=lc.school_id AND cl.id=lc.class_id
 LEFT JOIN app.subjects su ON su.school_id=lc.school_id AND su.id=lc.subject_id LEFT JOIN app.memberships m ON m.school_id=lc.school_id AND m.id=lc.member_id
 LEFT JOIN app.rooms r ON r.school_id=lc.school_id AND r.id=lc.room_id LEFT JOIN app.memberships actor ON actor.school_id=lc.school_id AND actor.user_id=lc.created_by`;

/** Bounded published weekly facts with server-filtered drafts and editor choices. */
export async function scheduleWorkspace(db:Database,policy:Permissions,c:RequestContext){
 return db.transaction(async tx=>{
  if(Object.keys(c.query).some(k=>!['weekStart','yearId','classId'].includes(k)))throw new Problem(422,'INVALID_QUERY');
  const schoolId=c.params.schoolId!,access=await policy.collection(tx,c.principal!,'schedule.read',schoolId,true),school=(await one<Row>(tx,'SELECT timezone FROM platform.schools WHERE id=$1',[schoolId]))!;
  const selected=c.query.classId?await scheduleContext(tx,policy,c,c.query.classId):null;
  const reference=selected?(access.today<selected.startsOn?selected.startsOn:access.today>=selected.endsOn?nextDay(selected.endsOn,-1):access.today):access.today;
  const monday=c.query.weekStart??weekMonday(reference),until=nextDay(monday,7);
  if(monday!==weekMonday(monday)||selected&&(until<=selected.startsOn||monday>=selected.endsOn))validation('weekStart','Tuần ngoài năm học hoặc không bắt đầu thứ Hai');
  const allClasses=scheduleLimit((await tx.query<Row>(`SELECT cl.id,cl.name,cl.year_id,cl.status,y.status AS year_status,y.starts_on,y.ends_on
   FROM app.classes cl JOIN app.academic_years y ON y.school_id=cl.school_id AND y.id=cl.year_id WHERE cl.school_id=$1
   AND ($2::uuid[] IS NULL OR cl.id=ANY($2)) AND ($3::uuid IS NULL OR cl.year_id=$3) AND (cl.status='ACTIVE' OR cl.id=$4)
   ORDER BY cl.name,cl.id LIMIT 1001`,[schoolId,access.all?null:access.classIds,c.query.yearId??null,selected?.classId??null])).rows,1000);
  const contexts=new Map(allClasses.map(cl=>{const ctx:ScheduleContext={schoolId,classId:String(cl.id),yearId:String(cl.year_id),today:access.today,timezone:String(school.timezone),startsOn:String(cl.starts_on),endsOn:String(cl.ends_on),readOnly:cl.status==='ARCHIVED'||cl.year_status==='ARCHIVED',grants:access.grants};return [ctx.classId,ctx];}));
  if(selected&&!contexts.has(selected.classId))notFound();
  const classIds=selected?[selected.classId]:[...contexts.keys()];
  const rows=scheduleLimit((await tx.query<Row>(`WITH ranked AS(SELECT l.*,cl.year_id,cl.name AS class_name,sub.name AS subject_name,m.work_display_name AS teacher_name,m.status AS teacher_status,r.name AS room_name,
   (l.starts_at AT TIME ZONE sc.timezone)::date AS day,to_char(l.starts_at AT TIME ZONE sc.timezone,'HH24:MI') AS local_start,to_char(l.ends_at AT TIME ZONE sc.timezone,'HH24:MI') AS local_end,
   row_number() OVER(PARTITION BY l.class_id,(l.starts_at AT TIME ZONE sc.timezone)::date,l.period_number ORDER BY (l.status='SCHEDULED') DESC,l.created_at DESC,l.id DESC) AS rank
   FROM app.lesson_occurrences l JOIN app.timetable_versions tv ON tv.school_id=l.school_id AND tv.id=l.timetable_id AND tv.status='PUBLISHED'
   JOIN platform.schools sc ON sc.id=l.school_id JOIN app.classes cl ON cl.school_id=l.school_id AND cl.id=l.class_id
   JOIN app.subjects sub ON sub.school_id=l.school_id AND sub.id=l.subject_id JOIN app.memberships m ON m.school_id=l.school_id AND m.id=l.member_id LEFT JOIN app.rooms r ON r.school_id=l.school_id AND r.id=l.room_id
   WHERE l.school_id=$1 AND l.class_id=ANY($2::uuid[]) AND (l.starts_at AT TIME ZONE sc.timezone)::date>=$3 AND (l.starts_at AT TIME ZONE sc.timezone)::date<$4)
   SELECT * FROM ranked WHERE rank=1 ORDER BY day,period_number,class_name,id LIMIT 5001`,[schoolId,classIds,monday,until])).rows);
  const current=selected?await one<Row>(tx,"SELECT id FROM app.publication_revisions WHERE school_id=$1 AND class_id=$2 AND year_id=$3 AND kind='TIMETABLE' AND status='PUBLISHED'",[schoolId,selected.classId,selected.yearId]):null;
  const publicationByClass=new Map<string,unknown>();
  for(const p of (await tx.query<Row>("SELECT class_id,id FROM app.publication_revisions WHERE school_id=$1 AND class_id=ANY($2::uuid[]) AND kind='TIMETABLE' AND status='PUBLISHED'",[schoolId,classIds])).rows)publicationByClass.set(String(p.class_id),p.id);
  const changes=scheduleLimit((await tx.query<Row>(changeSelect+" WHERE lc.school_id=$1 AND lc.class_id=ANY($2::uuid[]) AND lc.lesson_date>=$3 AND lc.lesson_date<$4 AND lc.status<>'DISCARDED' ORDER BY lc.lesson_date,lc.period_number,lc.created_at DESC,lc.id LIMIT 2001",[schoolId,classIds,monday,until])).rows,2000)
   .filter(ch=>{const ctx=contexts.get(String(ch.class_id))!;return scheduleAllows(ctx,'schedule.read',String(ch.lesson_date))&&(ch.status==='PUBLISHED'||scheduleAllows(ctx,'schedule.manage',String(ch.lesson_date)));})
   .map(ch=>changeView(ch,contexts.get(String(ch.class_id))!,publicationByClass.get(String(ch.class_id))));
  const lessons=rows.filter(l=>scheduleAllows(contexts.get(String(l.class_id))!,'schedule.read',String(l.day))).map(l=>{
   const ctx=contexts.get(String(l.class_id))!,draft=changes.find(ch=>ch.classId===l.class_id&&ch.date===l.day&&ch.period===l.period_number&&ch.status==='draft'),changed=changes.find(ch=>ch.status==='published'&&ch.classId===l.class_id&&ch.date===l.day&&ch.period===l.period_number)??null;
   if(!l.period_number)throw new Problem(422,'SCHEDULE_PERIOD_REQUIRED');
   return {id:l.id,version:Number(l.version),classId:l.class_id,yearId:l.year_id,className:l.class_name,date:l.day,period:l.period_number,start:l.local_start,end:l.local_end,startsAt:iso(l.starts_at as Date),endsAt:iso(l.ends_at as Date),subjectId:l.subject_id,subject:l.subject_name,color:'#64748b',teacherMembershipId:l.member_id,teacher:l.teacher_name,teacherStatus:String(l.teacher_status).toLowerCase(),roomId:l.room_id??null,room:l.room_name??'Chưa có phòng',cancelled:l.status==='CANCELLED',changed,
    source:{lessonId:l.id,lessonVersion:Number(l.version),draftId:draft?.id??null,draftVersion:draft?.version??null},canEdit:!ctx.readOnly&&String(l.day)>=ctx.today&&new Date(l.starts_at as Date).getTime()>Date.now()&&scheduleAllows(ctx,'schedule.manage',String(l.day))};
  });
  const editable=[...contexts.values()].filter(ctx=>!ctx.readOnly&&scheduleAllows(ctx,'schedule.manage'));
  const options={classes:allClasses.map(cl=>{const ctx=contexts.get(String(cl.id))!;return {id:cl.id,name:cl.name,yearId:cl.year_id,startsOn:cl.starts_on,endsOn:cl.ends_on,canEdit:!ctx.readOnly&&scheduleAllows(ctx,'schedule.manage'),canPublish:!ctx.readOnly&&scheduleAllows(ctx,'schedule.publish')};}),
   subjects:editable.length?scheduleLimit((await tx.query<Row>("SELECT id,name FROM app.subjects WHERE school_id=$1 AND status='ACTIVE' ORDER BY name,id LIMIT 1001",[schoolId])).rows,1000).map(r=>({id:r.id,name:r.name,color:'#64748b'})):[],
   teachers:editable.length?scheduleLimit((await tx.query<Row>("SELECT m.id,m.work_display_name AS name FROM app.memberships m JOIN identity.users u ON u.id=m.user_id WHERE m.school_id=$1 AND m.status='ACTIVE' AND m.ended_at IS NULL AND u.status='ACTIVE' ORDER BY m.work_display_name,m.id LIMIT 1001",[schoolId])).rows,1000):[],
   rooms:editable.length?scheduleLimit((await tx.query<Row>("SELECT id,name,coalesce(capacity,0) AS capacity FROM app.rooms WHERE school_id=$1 AND status='ACTIVE' ORDER BY name,id LIMIT 1001",[schoolId])).rows,1000):[]};
  const holidays=scheduleLimit((await tx.query<Row>("SELECT class_id,starts_on,ends_on,title FROM app.calendar_events WHERE school_id=$1 AND status='PUBLISHED' AND kind='HOLIDAY' AND starts_on<$4 AND ends_on>$3 AND (class_id IS NULL OR class_id=ANY($2::uuid[])) AND ($5::uuid IS NULL OR year_id=$5) ORDER BY starts_on,id LIMIT 201",[schoolId,classIds,monday,until,selected?.yearId??c.query.yearId??null])).rows,200).map(h=>({classId:h.class_id??null,startsOn:h.starts_on,endsOn:h.ends_on,name:h.title}));
  return {data:{schoolId,classId:selected?.classId??null,yearId:selected?.yearId??null,today:access.today,timezone:school.timezone,weekStart:monday,canManage:access.grants.some(g=>g.scope_type==='SCHOOL'&&g.actions.includes('schedule.manage')),canEdit:selected?editable.some(ctx=>ctx.classId===selected.classId):editable.length>0,canPublish:selected?!selected.readOnly&&scheduleAllows(selected,'schedule.publish'):access.grants.some(g=>g.scope_type==='SCHOOL'&&g.actions.includes('schedule.publish')),publicationId:current?.id??null,lessons,changes,holidays,options}};
 },{schoolId:c.params.schoolId,userId:c.principal!.userId,readOnly:true});
}
