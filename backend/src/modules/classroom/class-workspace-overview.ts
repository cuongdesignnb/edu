import {Database,one,iso,type Row,type Transaction} from '../../database/database';
import {Permissions,grantAllows,type Grant} from '../../common/permissions';
import {Problem,notFound} from '../../common/problem';
import type {RequestContext} from '../../api.router';

type Context={schoolId:string;classId:string;yearId:string;today:string;referenceDate:string;grants:Grant[];userId:string;isCurrent:boolean};
const has=(ctx:Context,action:string,subject=false,date=ctx.today)=>ctx.grants.some(g=>grantAllows(g,action,{schoolId:ctx.schoolId,classId:ctx.classId,yearId:ctx.yearId,allowSubject:subject,date},ctx.today));
const enrollment="e.status<>'CANCELLED' AND e.starts_on<=$4::date AND (e.ends_on IS NULL OR e.ends_on>$4::date)";
const taskKinds=['attendance','attendance-finish','attendance-publish','lesson-attendance','conduct-review','conduct-lock','evidence','adjustment','adjustment-publish','groups'] as const;
type TaskKind=typeof taskKinds[number];
type Task={kind:TaskKind;count:number};

/** One selected class, SQL-bounded previews, independent dated native readers. */
export async function classWorkspaceOverview(db:Database,policy:Permissions,c:RequestContext){
  return db.transaction(async tx=>{
    if(Object.keys(c.query).length)throw new Problem(422,'INVALID_QUERY');
    const schoolId=c.params.schoolId!,yearId=c.params.yearId!,classId=c.params.classId!;
    const access=await policy.require(tx,c.principal!,'class.read',{schoolId,yearId,classId,allowSubject:true});
    const source=await one<Row>(tx,`SELECT cl.status,y.status AS year_status,y.starts_on,y.ends_on,
      greatest(y.starts_on,least($4::date,y.ends_on-1))::text AS reference_date,now() AS as_of
      FROM app.classes cl JOIN app.academic_years y ON y.school_id=cl.school_id AND y.id=cl.year_id
      WHERE cl.school_id=$1 AND cl.id=$2 AND cl.year_id=$3`,[schoolId,classId,yearId,access.today]);
    if(!source)notFound();
    const isCurrent=source.status==='ACTIVE'&&source.year_status==='ACTIVE'&&String(source.starts_on)<=access.today&&String(source.ends_on)>access.today;
    const ctx:Context={schoolId,yearId,classId,...access,referenceDate:String(source.reference_date),userId:c.principal!.userId,isCurrent};
    const attendanceRead=has(ctx,'attendance.read'),scheduleRead=has(ctx,'schedule.read',true),groupRead=has(ctx,'group.manage',false,ctx.referenceDate),activityRead=has(ctx,'activity.read',true);
    const attendance=isCurrent&&attendanceRead?await morningAttendance(tx,ctx):null;
    const today=isCurrent&&scheduleRead?await todayLessons(tx,ctx,'schedule.read'):null;
    const groups=groupRead?await classGroups(tx,ctx):null;
    const activities=activityRead?await activityPreview(tx,ctx):null;
    const allowedTaskKinds:TaskKind[]=[];
    if(isCurrent){
      if(attendanceRead&&has(ctx,'attendance.record'))allowedTaskKinds.push('attendance','attendance-finish');
      if(attendanceRead&&has(ctx,'attendance.publish'))allowedTaskKinds.push('attendance-publish');
      if(has(ctx,'attendance.read',true)&&has(ctx,'attendance.record',true)&&scheduleRead)allowedTaskKinds.push('lesson-attendance');
      if(has(ctx,'conduct.read')&&has(ctx,'conduct.review'))allowedTaskKinds.push('conduct-review');
      if(has(ctx,'conduct.read')&&has(ctx,'conduct.lock'))allowedTaskKinds.push('conduct-lock');
      if(has(ctx,'evidence.read')&&has(ctx,'evidence.review'))allowedTaskKinds.push('evidence');
      if(has(ctx,'conduct.read')&&has(ctx,'conduct.adjust.approve'))allowedTaskKinds.push('adjustment');
      if(has(ctx,'conduct.read')&&has(ctx,'conduct.adjust.approve')&&has(ctx,'conduct.publish'))allowedTaskKinds.push('adjustment-publish');
      if(groupRead)allowedTaskKinds.push('groups');
    }
    const tasks:Task[]|null=allowedTaskKinds.length?await classTasks(tx,ctx,allowedTaskKinds,attendance,groups):null;
    const navigation=Object.entries({reports:['report.read',true], 'attendance/weekly':['attendance.read',true],conduct:['conduct.read',true],timetable:['schedule.read',true],groups:['group.manage',false],activities:['activity.read',true]} as const)
      .filter(([path, [action,subject]])=>has(ctx,action,subject,path==='activities'?ctx.today:ctx.referenceDate)).map(([path])=>path);
    return {data:{schoolId,yearId,classId,today:ctx.today,referenceDate:ctx.referenceDate,asOf:iso(source.as_of as Date),isCurrent,
      readOnly:source.status==='ARCHIVED'||source.year_status==='ARCHIVED',
      permissions:{attendance:attendanceRead,schedule:scheduleRead,groups:groupRead,activities:activityRead},
      canRecordMorning:isCurrent&&has(ctx,'attendance.record')&&attendance?.calendarState==='WITHIN_YEAR',
      allowedTaskKinds,tasks,attendance,lessons:today,groups,activities,navigation}};
  },{schoolId:c.params.schoolId,userId:c.principal!.userId,readOnly:true});
}

async function morningAttendance(tx:Transaction,ctx:Context){
  const holiday=!!(await one(tx,"SELECT id FROM app.calendar_events WHERE school_id=$1 AND year_id=$2 AND kind='HOLIDAY' AND starts_on<=$3::date AND ends_on>$3::date AND (class_id IS NULL OR class_id=$4) LIMIT 1",[ctx.schoolId,ctx.yearId,ctx.today,ctx.classId]));
  const sessions=(await tx.query<Row>(`SELECT s.id,s.version,s.data_version,s.status,EXISTS(SELECT 1 FROM app.publication_revisions p WHERE p.school_id=s.school_id
    AND p.attendance_session_id=s.id AND p.status='PUBLISHED' AND p.source_version=s.data_version) AS published
    FROM app.attendance_sessions s WHERE s.school_id=$1 AND s.class_id=$2 AND s.year_id=$3 AND s.session_date=$4::date
    AND s.granularity='DAILY' AND s.slot_key IN ('morning','daily') ORDER BY s.id LIMIT 2`,[ctx.schoolId,ctx.classId,ctx.yearId,ctx.today])).rows;
  if(sessions.length>1)throw new Problem(409,'ATTENDANCE_SOURCE_AMBIGUOUS');
  const session=sessions[0];
  const counts=session?await one<Row>(tx,`SELECT count(*)::int AS total,count(*) FILTER(WHERE status='PRESENT')::int AS present,
    count(*) FILTER(WHERE status='LATE')::int AS late,count(*) FILTER(WHERE status='EXCUSED')::int AS excused,
    count(*) FILTER(WHERE status='UNEXCUSED')::int AS unexcused,count(*) FILTER(WHERE status='UNMARKED')::int AS unmarked
    FROM app.attendance_records WHERE school_id=$1 AND session_id=$2`,[ctx.schoolId,session.id]):holiday?null:await one<Row>(tx,`SELECT count(*)::int AS total,
    0 AS present,0 AS late,0 AS excused,0 AS unexcused,count(*)::int AS unmarked FROM app.enrollments e
    WHERE e.school_id=$1 AND e.class_id=$2 AND e.year_id=$3 AND ${enrollment}`,[ctx.schoolId,ctx.classId,ctx.yearId,ctx.today]);
  return {calendarState:holiday?'HOLIDAY':'WITHIN_YEAR',session:session?{id:session.id,version:session.version,sourceVersion:session.data_version,status:session.published?'PUBLISHED':session.status}:null,
    counts:counts?{total:Number(counts.total),present:Number(counts.present),late:Number(counts.late),excused:Number(counts.excused),unexcused:Number(counts.unexcused),unmarked:Number(counts.unmarked)}:null};
}

async function todayLessons(tx:Transaction,ctx:Context,action:string,ownOnly=false){
  const scopesFor=(permission:string)=>ctx.grants.filter(g=>grantAllows(g,permission,{schoolId:ctx.schoolId,classId:ctx.classId,allowSubject:true,date:ctx.today},ctx.today)).map(g=>({scope_type:g.scope_type,subject_id:g.subject_id,assignment_id:g.assignment_id}));
  const scopes=scopesFor(action);
  const rows=(await tx.query<Row>(`SELECT l.id,l.version,l.period_number,to_char(l.starts_at AT TIME ZONE s.timezone,'HH24:MI') AS starts_at_local,
    to_char(l.ends_at AT TIME ZONE s.timezone,'HH24:MI') AS ends_at_local,subject.name AS subject_name,m.work_display_name AS teacher_name,
    r.name AS room_name,l.status,l.change_reason
    FROM app.lesson_occurrences l JOIN app.timetable_versions t ON t.school_id=l.school_id AND t.id=l.timetable_id AND t.year_id=$3
    JOIN platform.schools s ON s.id=l.school_id JOIN app.subjects subject ON subject.school_id=l.school_id AND subject.id=l.subject_id
    JOIN app.memberships m ON m.school_id=l.school_id AND m.id=l.member_id LEFT JOIN app.rooms r ON r.school_id=l.school_id AND r.id=l.room_id
    WHERE l.school_id=$1 AND l.class_id=$2 AND l.starts_at>=($4::date::timestamp AT TIME ZONE s.timezone) AND l.starts_at<(($4::date+1)::timestamp AT TIME ZONE s.timezone)
    AND t.status='PUBLISHED' AND (NOT $7::boolean OR m.user_id=$6)
    AND EXISTS(SELECT 1 FROM jsonb_to_recordset($5::jsonb) AS g(scope_type text,subject_id uuid,assignment_id uuid)
      WHERE g.scope_type IN ('CLASS','SCHOOL') OR (g.scope_type='SUBJECT' AND g.subject_id=l.subject_id AND m.user_id=$6
        AND EXISTS(SELECT 1 FROM app.teaching_assignments a WHERE a.school_id=l.school_id AND a.id=g.assignment_id AND a.member_id=l.member_id AND a.subject_id=l.subject_id
          AND a.class_id=l.class_id AND a.kind='SUBJECT' AND a.revoked_at IS NULL AND a.starts_on<=$4::date AND (a.ends_on IS NULL OR a.ends_on>$4::date))))
    AND EXISTS(SELECT 1 FROM jsonb_to_recordset($8::jsonb) AS g(scope_type text,subject_id uuid,assignment_id uuid)
      WHERE g.scope_type IN ('CLASS','SCHOOL') OR (g.scope_type='SUBJECT' AND g.subject_id=l.subject_id AND m.user_id=$6))
    ORDER BY l.starts_at,l.id LIMIT 101`,[ctx.schoolId,ctx.classId,ctx.yearId,ctx.today,JSON.stringify(scopes),ctx.userId,ownOnly,JSON.stringify(scopesFor('schedule.read'))])).rows;
  if(rows.length>100)throw new Problem(422,'CLASS_OVERVIEW_LESSON_LIMIT');
  return rows.map(l=>({id:l.id,version:l.version,periodNumber:l.period_number,startsAtLocal:l.starts_at_local,endsAtLocal:l.ends_at_local,subjectName:l.subject_name,teacherName:l.teacher_name??null,roomName:l.room_name??null,status:l.status,changeReason:l.change_reason}));
}

async function classGroups(tx:Transaction,ctx:Context){
  const rows=(await tx.query<Row>(`SELECT g.id,g.name,g.sort_order,(SELECT count(*)::int FROM app.group_memberships gm JOIN app.enrollments e ON e.school_id=gm.school_id AND e.id=gm.enrollment_id
    WHERE gm.school_id=g.school_id AND gm.class_id=g.class_id AND gm.group_id=g.id AND gm.cancelled_at IS NULL AND gm.starts_on<=$4::date AND gm.ends_on>$4::date
    AND e.year_id=$3 AND ${enrollment}) AS size FROM app.class_groups g WHERE g.school_id=$1 AND g.class_id=$2 ORDER BY g.sort_order,g.id LIMIT 101`,[ctx.schoolId,ctx.classId,ctx.yearId,ctx.referenceDate])).rows;
  if(rows.length>100)throw new Problem(422,'CLASS_OVERVIEW_GROUP_LIMIT');
  const counts=(await one<{total:number;no_group:number}>(tx,`SELECT count(*)::int AS total,count(*) FILTER(WHERE NOT EXISTS(SELECT 1 FROM app.group_memberships gm
    WHERE gm.school_id=e.school_id AND gm.class_id=e.class_id AND gm.enrollment_id=e.id AND gm.cancelled_at IS NULL AND gm.starts_on<=$4::date AND gm.ends_on>$4::date))::int AS no_group
    FROM app.enrollments e WHERE e.school_id=$1 AND e.class_id=$2 AND e.year_id=$3 AND ${enrollment}`,[ctx.schoolId,ctx.classId,ctx.yearId,ctx.referenceDate]))!;
  return {items:rows.map(g=>({id:g.id,name:g.name,size:Number(g.size)})),totalStudents:counts.total,noGroup:counts.no_group};
}

async function activityPreview(tx:Transaction,ctx:Context){
  const rows=(await tx.query<Row>(`SELECT a.id,a.version,a.title,a.due_at,to_char(a.due_at AT TIME ZONE s.timezone,'YYYY-MM-DD') AS due_date,count(*) OVER()::int AS all_count,
    (SELECT count(*)::int FROM app.activity_participants p WHERE p.school_id=a.school_id AND p.activity_id=a.id AND p.cancelled_at IS NULL) AS total,
    (SELECT count(*)::int FROM app.activity_participants p WHERE p.school_id=a.school_id AND p.activity_id=a.id AND p.cancelled_at IS NULL AND p.status='APPROVED') AS done
    FROM app.activities a JOIN platform.schools s ON s.id=a.school_id WHERE a.school_id=$1 AND a.class_id=$2 AND a.year_id=$3 AND a.status='ASSIGNED'
    ORDER BY a.due_at,a.id LIMIT 6`,[ctx.schoolId,ctx.classId,ctx.yearId])).rows;
  const total=Number(rows[0]?.all_count??0);
  return {items:rows.map(a=>({id:a.id,version:a.version,title:a.title,dueAt:iso(a.due_at as Date),dueDate:a.due_date,total:Number(a.total),done:Number(a.done)})),total,hasMore:total>rows.length};
}

async function classTasks(tx:Transaction,ctx:Context,allowed:TaskKind[],attendance:Awaited<ReturnType<typeof morningAttendance>>|null,groups:Awaited<ReturnType<typeof classGroups>>|null){
  const tasks:Task[]=[];
  const add=(kind:TaskKind,n:number)=>{if(allowed.includes(kind)&&n>0)tasks.push({kind,count:n});};
  if(attendance?.calendarState==='WITHIN_YEAR'){
    if(!attendance.session)add('attendance',attendance.counts?.total??0);
    else if(attendance.session.status==='OPEN')add('attendance-finish',attendance.counts?.unmarked??0);
    if(attendance.session&&attendance.session.status!=='PUBLISHED'&&attendance.counts&&attendance.counts.total>0&&attendance.counts.unmarked===0)add('attendance-publish',1);
  }
  if(allowed.includes('lesson-attendance')){
    const ownLessons=await todayLessons(tx,ctx,'attendance.record',true);
    const missing=(await one<{n:number}>(tx,`SELECT count(*)::int AS n FROM app.lesson_occurrences l WHERE l.school_id=$1 AND l.id=ANY($2::uuid[]) AND l.status='SCHEDULED'
      AND NOT EXISTS(SELECT 1 FROM app.attendance_sessions ats WHERE ats.school_id=l.school_id AND ats.lesson_id=l.id)
      AND NOT EXISTS(SELECT 1 FROM app.calendar_events h WHERE h.school_id=l.school_id AND h.year_id=$3 AND h.kind='HOLIDAY' AND h.starts_on<=$4::date AND h.ends_on>$4::date AND (h.class_id IS NULL OR h.class_id=l.class_id))`,[ctx.schoolId,ownLessons.map(l=>l.id),ctx.yearId,ctx.today]))!;
    add('lesson-attendance',missing.n);
  }
  const bounds=ctx.grants.flatMap(g=>g.actions.filter(a=>grantAllows(g,a,{schoolId:ctx.schoolId,classId:ctx.classId},ctx.today)).map(action=>({action,from_day:g.assignment_id?g.starts_on:null,until_day:g.assignment_id?g.ends_on:null})));
  const scope=(action:string)=>`EXISTS(SELECT 1 FROM jsonb_to_recordset($4::jsonb) AS g(action text,from_day date,until_day date) WHERE g.action='${action}' AND (g.from_day IS NULL OR g.from_day<=w.starts_on) AND (g.until_day IS NULL OR g.until_day>w.starts_on))`;
  const rows=(await tx.query<{kind:TaskKind;n:number}>(`SELECT 'conduct-review'::text AS kind,count(*)::int AS n FROM app.conduct_records r JOIN app.conduct_periods p ON p.school_id=r.school_id AND p.id=r.period_id
    JOIN app.school_weeks w ON w.school_id=p.school_id AND w.id=p.week_id WHERE p.school_id=$1 AND p.class_id=$2 AND p.year_id=$3 AND p.status<>'LOCKED' AND r.status='DRAFT' AND ${scope('conduct.read')} AND ${scope('conduct.review')}
    UNION ALL SELECT 'conduct-lock',count(*)::int FROM app.conduct_periods p JOIN app.school_weeks w ON w.school_id=p.school_id AND w.id=p.week_id WHERE p.school_id=$1 AND p.class_id=$2 AND p.year_id=$3 AND p.status<>'LOCKED' AND p.input_deadline<now() AND ${scope('conduct.read')} AND ${scope('conduct.lock')}
    UNION ALL SELECT 'adjustment',count(*)::int FROM app.adjustment_requests a JOIN app.conduct_periods p ON p.school_id=a.school_id AND p.id=a.period_id JOIN app.school_weeks w ON w.school_id=p.school_id AND w.id=p.week_id WHERE p.school_id=$1 AND p.class_id=$2 AND p.year_id=$3 AND a.status='SUBMITTED' AND ${scope('conduct.read')} AND ${scope('conduct.adjust.approve')}
    UNION ALL SELECT 'adjustment-publish',count(*)::int FROM app.adjustment_requests a JOIN app.conduct_periods p ON p.school_id=a.school_id AND p.id=a.period_id JOIN app.school_weeks w ON w.school_id=p.school_id AND w.id=p.week_id WHERE p.school_id=$1 AND p.class_id=$2 AND p.year_id=$3 AND a.status='APPROVED' AND ${scope('conduct.read')} AND ${scope('conduct.adjust.approve')} AND ${scope('conduct.publish')}`,[ctx.schoolId,ctx.classId,ctx.yearId,JSON.stringify(bounds)])).rows;
  for(const row of rows)add(row.kind,row.n);
  if(allowed.includes('evidence'))add('evidence',(await one<{n:number}>(tx,`SELECT count(*)::int AS n FROM app.evidence ev JOIN app.activity_participants p ON p.school_id=ev.school_id AND p.id=ev.participant_id
    JOIN app.activities a ON a.school_id=p.school_id AND a.id=p.activity_id WHERE a.school_id=$1 AND a.class_id=$2 AND a.year_id=$3 AND a.status='ASSIGNED' AND p.cancelled_at IS NULL AND ev.status='SUBMITTED'`,[ctx.schoolId,ctx.classId,ctx.yearId]))!.n);
  add('groups',groups?.noGroup??0);
  return tasks.sort((a,b)=>taskKinds.indexOf(a.kind)-taskKinds.indexOf(b.kind));
}
