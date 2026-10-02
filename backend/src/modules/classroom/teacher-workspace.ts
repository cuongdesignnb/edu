import {Database,one,iso,type Row,type Transaction} from '../../database/database';
import {Permissions,grantAllows,type Grant} from '../../common/permissions';
import {Problem} from '../../common/problem';
import {taskResource} from '../dashboards/dashboard-data';
import type {RequestContext} from '../../api.router';

type Context={schoolId:string;userId:string;memberId:string;today:string;asOf:string;grants:Grant[];assignmentIds:string[];classes:Row[]};
const date=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
const addDays=(d:string,n:number)=>new Date(Date.parse(d+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
const has=(ctx:Context,action:string,classId:string,subjectId?:string,onDate=ctx.today)=>ctx.grants.some(g=>grantAllows(g,action,{schoolId:ctx.schoolId,classId,subjectId,allowSubject:!!subjectId,date:onDate},ctx.today));
const subjectActions=new Set(['class.read','student.read','attendance.read','attendance.record','conduct.record','conduct.adjust.request','schedule.read','report.read','teacher.self']);

async function context(tx:Transaction,policy:Permissions,c:RequestContext):Promise<Context>{
 const schoolId=c.params.schoolId!,userId=c.principal!.userId,access=await policy.require(tx,c.principal!,'teacher.self',{schoolId,allowScopedContext:true,allowSubject:true});
 const assignmentIds=access.grants.filter(g=>g.assignment_id&&g.class_id&&grantAllows(g,'teacher.self',{schoolId,classId:g.class_id,allowSubject:true},access.today)&&grantAllows(g,'class.read',{schoolId,classId:g.class_id,allowSubject:true},access.today)).map(g=>g.assignment_id!);
 const member=(await one<{id:string;as_of:Date}>(tx,"SELECT id,now() AS as_of FROM app.memberships WHERE school_id=$1 AND user_id=$2 AND status='ACTIVE' AND ended_at IS NULL",[schoolId,userId]))!;
 const classes=(await tx.query<Row>(`SELECT c.id,c.year_id,c.name,c.motto,c.status,y.status AS year_status,y.starts_on,y.ends_on,
  greatest(y.starts_on,least($4::date,y.ends_on-1))::text AS reference_date,r.name AS room,
  bool_or(a.kind='HOMEROOM') AS is_homeroom,
  coalesce(jsonb_agg(DISTINCT sub.name) FILTER(WHERE a.kind='SUBJECT'),'[]'::jsonb) AS subjects
  FROM app.teaching_assignments a JOIN app.classes c ON c.school_id=a.school_id AND c.id=a.class_id
  JOIN app.academic_years y ON y.school_id=c.school_id AND y.id=c.year_id LEFT JOIN app.rooms r ON r.school_id=c.school_id AND r.id=c.room_id
  LEFT JOIN app.subjects sub ON sub.school_id=a.school_id AND sub.id=a.subject_id
  WHERE a.school_id=$1 AND a.member_id=$2 AND a.id=ANY($3::uuid[]) AND a.revoked_at IS NULL AND a.starts_on<=$4::date AND (a.ends_on IS NULL OR a.ends_on>$4::date)
  GROUP BY c.id,y.id,r.name ORDER BY bool_or(a.kind='HOMEROOM') DESC,c.name,c.id LIMIT 501`,[schoolId,member.id,assignmentIds,access.today])).rows;
 if(classes.length>500)throw new Problem(422,'TEACHER_WORKSPACE_CLASS_LIMIT');
 return {schoolId,userId,memberId:member.id,today:access.today,asOf:iso(member.as_of) as string,grants:access.grants,assignmentIds,classes};
}

/** Reuse the existing business task derivation with current own classes per year. */
async function tasks(tx:Transaction,ctx:Context){
 const result:Record<string,unknown>[]=[];
 for(const yearId of [...new Set(ctx.classes.map(c=>String(c.year_id)))]){
  const classes=ctx.classes.filter(c=>c.year_id===yearId&&c.status==='ACTIVE'&&c.year_status==='ACTIVE'&&String(c.starts_on)<=ctx.today&&String(c.ends_on)>ctx.today);
  if(!classes.length)continue;
  const readFor:Record<string,string>={'attendance.record':'attendance.read','attendance.publish':'attendance.read','conduct.review':'conduct.read','conduct.lock':'conduct.read','conduct.adjust.approve':'conduct.read','conduct.publish':'conduct.read','evidence.review':'evidence.read','announcement.manage':'announcement.read'};
  const bindings=classes.flatMap(cls=>ctx.grants.map(g=>({scope_type:g.scope_type==='SCHOOL'?'CLASS':g.scope_type,class_id:cls.id,subject_id:g.subject_id,
   actions:g.actions.filter(action=>grantAllows(g,action,{schoolId:ctx.schoolId,classId:String(cls.id),allowSubject:subjectActions.has(action)},ctx.today)
    &&(!readFor[action]||has(ctx,readFor[action]!,String(cls.id),g.scope_type==='SUBJECT'&&subjectActions.has(action)?g.subject_id??undefined:undefined)))})));
  const rows=(await tx.query<Row>(`SELECT t.* FROM ${taskResource.table} t ORDER BY t.id LIMIT 2001`,[ctx.schoolId,JSON.stringify(bindings),yearId,ctx.today,ctx.userId,ctx.memberId,classes.map(c=>c.id),true])).rows;
  if(result.length+rows.length>2000)throw new Problem(422,'TEACHER_WORKSPACE_TASK_LIMIT');
  for(const row of rows)result.push({id:row.id,kind:row.kind,title:row.title,detail:row.detail,classId:row.class_id,yearId:row.year_id,className:row.class_name,targetType:row.target_kind,targetId:row.target_id,status:row.status,tone:row.tone,dueAt:row.due_at?iso(row.due_at as Date):null});
 }
 return result;
}

async function lessons(tx:Transaction,ctx:Context,from:string,to:string){
 const scopes=ctx.grants.filter(g=>g.class_id&&grantAllows(g,'schedule.read',{schoolId:ctx.schoolId,classId:g.class_id,allowSubject:true},ctx.today)||g.scope_type==='SCHOOL'&&g.actions.includes('schedule.read')).map(g=>({scope:g.scope_type,classId:g.class_id,subjectId:g.subject_id,startsOn:g.starts_on,endsOn:g.ends_on}));
 const rows=(await tx.query<Row>(`SELECT l.id,l.class_id,c.year_id,c.name AS class_name,l.subject_id,l.period_number,
  to_char(l.starts_at AT TIME ZONE s.timezone,'YYYY-MM-DD') AS day,to_char(l.starts_at AT TIME ZONE s.timezone,'HH24:MI') AS starts,
  to_char(l.ends_at AT TIME ZONE s.timezone,'HH24:MI') AS ends,sub.name AS subject_name,r.name AS room_name,l.status,l.change_reason,
  EXISTS(SELECT 1 FROM app.calendar_events h WHERE h.school_id=l.school_id AND h.year_id=c.year_id AND (h.class_id IS NULL OR h.class_id=c.id) AND h.kind='HOLIDAY' AND h.status='PUBLISHED' AND h.starts_on<=(l.starts_at AT TIME ZONE s.timezone)::date AND h.ends_on>(l.starts_at AT TIME ZONE s.timezone)::date) AS on_holiday
  FROM app.lesson_occurrences l JOIN app.timetable_versions t ON t.school_id=l.school_id AND t.id=l.timetable_id AND t.status='PUBLISHED'
  JOIN app.classes c ON c.school_id=l.school_id AND c.id=l.class_id JOIN platform.schools s ON s.id=l.school_id
  JOIN app.subjects sub ON sub.school_id=l.school_id AND sub.id=l.subject_id LEFT JOIN app.rooms r ON r.school_id=l.school_id AND r.id=l.room_id
  WHERE l.school_id=$1 AND l.member_id=$2 AND l.class_id=ANY($3::uuid[]) AND l.starts_at>=($4::date::timestamp AT TIME ZONE s.timezone) AND l.starts_at<($5::date::timestamp AT TIME ZONE s.timezone)
  AND EXISTS(SELECT 1 FROM app.teaching_assignments a WHERE a.school_id=l.school_id AND a.member_id=l.member_id AND a.class_id=l.class_id
    AND a.id=ANY($6::uuid[]) AND a.revoked_at IS NULL AND a.starts_on<=(l.starts_at AT TIME ZONE s.timezone)::date AND (a.ends_on IS NULL OR a.ends_on>(l.starts_at AT TIME ZONE s.timezone)::date) AND (a.kind='HOMEROOM' OR a.subject_id=l.subject_id))
  AND EXISTS(SELECT 1 FROM jsonb_to_recordset($7::jsonb) AS g(scope text,"classId" uuid,"subjectId" uuid,"startsOn" date,"endsOn" date)
    WHERE (g.scope='SCHOOL' OR g."classId"=l.class_id AND (g.scope='CLASS' OR g.scope='SUBJECT' AND g."subjectId"=l.subject_id))
    AND (g."startsOn" IS NULL OR g."startsOn"<=(l.starts_at AT TIME ZONE s.timezone)::date) AND (g."endsOn" IS NULL OR g."endsOn">(l.starts_at AT TIME ZONE s.timezone)::date))
  AND (l.status='SCHEDULED' OR NOT EXISTS(SELECT 1 FROM app.lesson_occurrences newer WHERE newer.school_id=l.school_id AND newer.class_id=l.class_id AND newer.status='SCHEDULED'
    AND (newer.starts_at AT TIME ZONE s.timezone)::date=(l.starts_at AT TIME ZONE s.timezone)::date AND newer.period_number IS NOT DISTINCT FROM l.period_number))
  ORDER BY l.starts_at,l.id LIMIT 501`,[ctx.schoolId,ctx.memberId,ctx.classes.map(c=>c.id),from,to,ctx.assignmentIds,JSON.stringify(scopes)])).rows;
 if(rows.length>500)throw new Problem(422,'TEACHER_WORKSPACE_LESSON_LIMIT');
 return rows.map(l=>({id:l.id,classId:l.class_id,yearId:l.year_id,className:l.class_name,date:l.day,periodNumber:l.period_number,startsAtLocal:l.starts,endsAtLocal:l.ends,subjectName:l.subject_name,roomName:l.room_name??null,status:l.status,changeReason:l.change_reason??null,
  canAttend:l.status==='SCHEDULED'&&!l.on_holiday&&String(l.day)<=ctx.today&&has(ctx,'attendance.read',String(l.class_id),String(l.subject_id),String(l.day))&&has(ctx,'attendance.record',String(l.class_id),String(l.subject_id),String(l.day))}));
}

async function attendance(tx:Transaction,ctx:Context,cls:Row){
 const sessions=(await tx.query<Row>(`SELECT s.id,s.status,EXISTS(SELECT 1 FROM app.publication_revisions p WHERE p.school_id=s.school_id AND p.attendance_session_id=s.id AND p.status='PUBLISHED' AND p.source_version=s.data_version) AS published
  FROM app.attendance_sessions s WHERE s.school_id=$1 AND s.class_id=$2 AND s.year_id=$3 AND s.session_date=$4::date AND s.granularity='DAILY' AND s.slot_key IN ('morning','daily') LIMIT 2`,[ctx.schoolId,cls.id,cls.year_id,ctx.today])).rows;
 if(sessions.length>1)throw new Problem(409,'ATTENDANCE_SOURCE_AMBIGUOUS');
 const session=sessions[0];
 const row=(await one<Row>(tx,`SELECT count(*)::int AS total,count(*) FILTER(WHERE r.status='PRESENT')::int AS present,
  count(*) FILTER(WHERE r.status='LATE')::int AS late,count(*) FILTER(WHERE r.status='EXCUSED')::int AS excused,
  count(*) FILTER(WHERE r.status='UNEXCUSED')::int AS unexcused,count(*) FILTER(WHERE r.id IS NULL OR r.status='UNMARKED')::int AS unmarked
  FROM app.enrollments e LEFT JOIN app.attendance_records r ON r.school_id=e.school_id AND r.enrollment_id=e.id AND r.session_id=$5
  WHERE e.school_id=$1 AND e.class_id=$2 AND e.year_id=$3 AND e.status<>'CANCELLED' AND e.starts_on<=$4::date AND (e.ends_on IS NULL OR e.ends_on>$4::date)`,[ctx.schoolId,cls.id,cls.year_id,ctx.today,session?.id??null]))!;
 return {status:session?session.published?'published':session.status==='LOCKED'?'locked':'saved':'none',total:Number(row.total),present:Number(row.present),late:Number(row.late),excused:Number(row.excused),unexcused:Number(row.unexcused),unmarked:Number(row.unmarked)};
}

async function home(tx:Transaction,ctx:Context){
 const todayLessons=await lessons(tx,ctx,ctx.today,addDays(ctx.today,1)),classes:Record<string,unknown>[]=[];
 for(const c of ctx.classes){
  const id=String(c.id),current=c.status==='ACTIVE'&&c.year_status==='ACTIVE'&&String(c.starts_on)<=ctx.today&&String(c.ends_on)>ctx.today;
  const size=ctx.grants.some(g=>grantAllows(g,'student.read',{schoolId:ctx.schoolId,classId:id,allowSubject:true,date:String(c.reference_date)},ctx.today))?Number((await one<{n:string}>(tx,"SELECT count(*) AS n FROM app.enrollments WHERE school_id=$1 AND class_id=$2 AND status<>'CANCELLED' AND starts_on<=$3::date AND (ends_on IS NULL OR ends_on>$3::date)",[ctx.schoolId,id,c.reference_date]))!.n):null;
  const pendingConduct=current&&has(ctx,'conduct.read',id)&&has(ctx,'conduct.review',id)?Number((await one<{n:string}>(tx,"SELECT count(*) AS n FROM app.conduct_records WHERE school_id=$1 AND class_id=$2 AND status='DRAFT'",[ctx.schoolId,id]))!.n):null;
  classes.push({id,yearId:c.year_id,name:c.name,motto:c.motto??null,isHomeroom:c.is_homeroom,subjects:c.subjects,size,room:c.room??null,
   nextLesson:todayLessons.find(l=>l.classId===id&&l.status==='SCHEDULED')??null,attendance:current&&c.is_homeroom&&has(ctx,'attendance.read',id)?await attendance(tx,ctx,c):null,pendingConduct});
 }
 const unread=Number((await one<{n:string}>(tx,'SELECT count(*) AS n FROM app.notifications WHERE school_id=$1 AND member_id=$2 AND read_at IS NULL',[ctx.schoolId,ctx.memberId]))!.n);
 // Only safe labels for currently readable business sources; no raw audit payloads or internal notes.
 const scopes=ctx.classes.map(c=>({id:c.id,name:c.name,attendance:has(ctx,'attendance.read',String(c.id)),conduct:has(ctx,'conduct.read',String(c.id)),announcement:has(ctx,'announcement.read',String(c.id)),activity:has(ctx,'activity.read',String(c.id))}));
 const feed=(await tx.query<Row>(`WITH owned AS(SELECT * FROM jsonb_to_recordset($2::jsonb) AS c(id uuid,name text,attendance boolean,conduct boolean,announcement boolean,activity boolean)),
  changes AS(SELECT 'attendance:'||s.id::text AS id,'Cập nhật điểm danh'::text AS action,'Lớp '||c.name AS label,s.updated_at AS at FROM owned c JOIN app.attendance_sessions s ON s.school_id=$1 AND s.class_id=c.id WHERE c.attendance
  UNION ALL SELECT 'conduct:'||r.id::text,'Cập nhật ghi nhận thi đua','Lớp '||c.name,r.updated_at FROM owned c JOIN app.conduct_records r ON r.school_id=$1 AND r.class_id=c.id WHERE c.conduct
  UNION ALL SELECT 'announcement:'||a.id::text,'Cập nhật thông báo','Lớp '||c.name,a.updated_at FROM owned c JOIN app.announcements a ON a.school_id=$1 AND a.class_id=c.id WHERE c.announcement AND a.discarded_at IS NULL
  UNION ALL SELECT 'activity:'||a.id::text,'Cập nhật hoạt động','Lớp '||c.name,a.updated_at FROM owned c JOIN app.activities a ON a.school_id=$1 AND a.class_id=c.id WHERE c.activity)
  SELECT * FROM changes ORDER BY at DESC,id LIMIT 6`,[ctx.schoolId,JSON.stringify(scopes)])).rows.map(r=>({id:r.id,action:r.action,entityLabel:r.label,at:iso(r.at as Date)}));
 return {schoolId:ctx.schoolId,today:ctx.today,asOf:ctx.asOf,membershipId:ctx.memberId,classes,tasks:await tasks(tx,ctx),unread,feed};
}

export async function teacherWorkspace(db:Database,policy:Permissions,c:RequestContext){
 return db.transaction(async tx=>{
  const schedule=c.operation.id==='getTeacherWorkspaceSchedule';
  if(Object.keys(c.query).some(k=>!schedule||k!=='weekStart')||schedule&&(!date(c.query.weekStart)||new Date(c.query.weekStart+'T00:00:00Z').getUTCDay()!==1))throw new Problem(422,'INVALID_QUERY');
  const ctx=await context(tx,policy,c);
  if(c.operation.id==='getTeacherWorkspaceHome')return {data:await home(tx,ctx)};
  if(c.operation.id==='getTeacherWorkspaceTasks')return {data:{schoolId:ctx.schoolId,today:ctx.today,asOf:ctx.asOf,tasks:await tasks(tx,ctx)}};
  const weekStart=c.query.weekStart!,to=addDays(weekStart,7),ownLessons=await lessons(tx,ctx,weekStart,to);
  const holidays=(await tx.query<Row>(`SELECT title,starts_on,ends_on FROM app.calendar_events WHERE school_id=$1 AND year_id=ANY($2::uuid[]) AND class_id IS NULL AND kind='HOLIDAY' AND status='PUBLISHED' AND starts_on<$4::date AND ends_on>$3::date ORDER BY starts_on,id LIMIT 101`,[ctx.schoolId,[...new Set(ctx.classes.map(c=>c.year_id))],weekStart,to])).rows;
  if(holidays.length>100)throw new Problem(422,'TEACHER_WORKSPACE_HOLIDAY_LIMIT');
  return {data:{schoolId:ctx.schoolId,today:ctx.today,asOf:ctx.asOf,weekStart,days:Array.from({length:7},(_,i)=>{const d=addDays(weekStart,i);return {date:d,holiday:holidays.filter(h=>String(h.starts_on)<=d&&String(h.ends_on)>d).map(h=>String(h.title)).join(' · ')||null,lessons:ownLessons.filter(l=>l.date===d)};})}};
 },{schoolId:c.params.schoolId,userId:c.principal!.userId,readOnly:true});
}
