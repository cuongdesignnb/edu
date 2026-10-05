import {Database,one,iso,type Row,type Transaction} from '../../database/database';
import {Permissions,grantAllows,type Grant} from '../../common/permissions';
import {Problem,notFound} from '../../common/problem';
import type {RequestContext} from '../../api.router';

const subjectActions=new Set(['class.read','school.read','year.read','teacher.self','student.read','conduct.read','conduct.record','conduct.adjust.request','schedule.read','attendance.read','attendance.record','activity.read','announcement.read','file.read','file.download','report.read','rules.read']);
const tabs=[
  ['overview','Tổng quan','',['class.read']],['students','Học sinh','/students',['student.read']],
  ['attendance','Chuyên cần','/attendance',['attendance.read','attendance.record']],
  ['conduct','Rèn luyện','/conduct',['conduct.read','conduct.record','conduct.review','conduct.adjust.approve']],
  ['notebook','Báo cáo tuần','/notebook',['group.manage']],['periodic','Xếp loại định kỳ','/periodic',['conduct.review','conduct.lock','conduct.publish']],
  ['timetable','Thời khóa biểu','/timetable',['schedule.read']],['groups','Tổ chức lớp','/groups',['group.manage']],
  ['duties','Trực nhật','/duties',['duty.read','duty.manage']],['seating','Sơ đồ lớp','/seating',['seating.manage']],
  ['activities','Hoạt động & minh chứng','/activities',['activity.read','activity.manage','evidence.read','evidence.manage']],
  ['announcements','Thông báo','/announcements',['announcement.read','announcement.manage']],
  ['files','Tệp lớp','/files',['file.read','file.manage']],['reports','Báo cáo','/reports',['report.read']],
  ['public-portal','Cổng QR','/public-portal',['parent_access.manage']],['notebook-settings','Cài đặt lớp','/notebook-settings',['group.manage']],
] as const;
type Context={schoolId:string;classId:string;yearId:string;today:string;referenceDate:string;grants:Grant[]};
export function headerAllows(ctx:Context,action:string,allowSubject=false,date?:string){
  return ctx.grants.some(g=>grantAllows(g,action,{schoolId:ctx.schoolId,classId:ctx.classId,yearId:ctx.yearId,allowSubject,date},ctx.today));
}
/** One exact class, fresh authority, independent minimal panels in one read snapshot. */
export async function classWorkspaceHeader(db:Database,policy:Permissions,c:RequestContext){
  return db.transaction(async tx=>{
    if(Object.keys(c.query).length)throw new Problem(422,'INVALID_QUERY');
    const schoolId=c.params.schoolId!,classId=c.params.classId!,yearId=c.params.yearId!;
    const access=await policy.require(tx,c.principal!,'class.read',{schoolId,classId,yearId,allowSubject:true});
    const cls=await one<Row>(tx,`SELECT c.*,g.name AS grade_name,y.name AS year_name,y.code AS year_code,y.version AS year_version,
      y.starts_on AS year_starts_on,y.ends_on AS year_ends_on,y.status AS year_status,
      s.name AS school_name,s.short_name AS school_short_name,s.slug AS school_slug,
      greatest(y.starts_on,least($4::date,y.ends_on-1))::text AS reference_date
      FROM app.classes c JOIN app.academic_years y ON y.school_id=c.school_id AND y.id=c.year_id
      JOIN app.grade_levels g ON g.school_id=c.school_id AND g.id=c.grade_level_id
      JOIN platform.schools s ON s.id=c.school_id WHERE c.school_id=$1 AND c.id=$2 AND c.year_id=$3`,[schoolId,classId,yearId,access.today]);
    if(!cls)notFound();
    const ctx:Context={schoolId,classId,yearId,...access,referenceDate:String(cls.reference_date)};
    const has=(action:string,subject=false,date?:string)=>headerAllows(ctx,action,subject,date);
    const member=(await one<{id:string}>(tx,"SELECT id FROM app.memberships WHERE school_id=$1 AND user_id=$2 AND status='ACTIVE' AND ended_at IS NULL",[schoolId,c.principal!.userId]))!;
    const actions=[...new Set(access.grants.flatMap(g=>g.actions.filter(a=>grantAllows(g,a,{schoolId,classId,yearId,allowSubject:subjectActions.has(a)},access.today))))].sort();
    const assignmentIds=access.grants.filter(g=>g.assignment_id&&grantAllows(g,'class.read',{schoolId,classId,allowSubject:true},access.today)).map(g=>g.assignment_id!);
    const duties=(await tx.query<{kind:string;subject_name:string|null}>(`SELECT a.kind,s.name AS subject_name FROM app.teaching_assignments a
      LEFT JOIN app.subjects s ON s.school_id=a.school_id AND s.id=a.subject_id WHERE a.school_id=$1 AND a.class_id=$2 AND a.member_id=$3
      AND a.id=ANY($4::uuid[]) AND a.revoked_at IS NULL AND a.starts_on<=$5::date AND (a.ends_on IS NULL OR a.ends_on>$5::date)
      ORDER BY a.kind,s.name,a.id`,[schoolId,classId,member.id,assignmentIds,access.today])).rows;
    const homeroom=await one<{member_id:string;name:string;work_phone:string|null;work_email:string|null}>(tx,`SELECT m.id AS member_id,m.work_display_name AS name,m.work_phone,m.work_email
      FROM app.teaching_assignments a JOIN app.memberships m ON m.school_id=a.school_id AND m.id=a.member_id AND m.status='ACTIVE' AND m.ended_at IS NULL
      JOIN identity.users u ON u.id=m.user_id AND u.status='ACTIVE'
      JOIN app.role_grants g ON g.school_id=a.school_id AND g.id=a.role_grant_id AND g.revoked_at IS NULL AND g.valid_from<=now() AND (g.valid_until IS NULL OR g.valid_until>now())
      JOIN app.roles r ON r.school_id=g.school_id AND r.id=g.role_id AND r.status='ACTIVE'
      WHERE a.school_id=$1 AND a.class_id=$2 AND a.kind='HOMEROOM' AND a.revoked_at IS NULL AND a.starts_on<=$3::date AND (a.ends_on IS NULL OR a.ends_on>$3::date)
      ORDER BY a.starts_on DESC,a.id LIMIT 1`,[schoolId,classId,access.today]);
    const contactVisible=!!homeroom&&(homeroom.member_id===member.id||has('member.read'));
    const roster=has('student.read',true)?await one<{total:number;male:number;female:number}>(tx,`SELECT count(*)::int AS total,
      count(*) FILTER(WHERE s.gender='Nam')::int AS male,count(*) FILTER(WHERE s.gender='Nữ')::int AS female
      FROM app.enrollments e JOIN app.students s ON s.school_id=e.school_id AND s.id=e.student_id
      WHERE e.school_id=$1 AND e.class_id=$2 AND e.year_id=$3 AND e.status<>'CANCELLED' AND e.starts_on<=$4::date AND (e.ends_on IS NULL OR e.ends_on>$4::date)`,[schoolId,classId,yearId,ctx.referenceDate]):undefined;
    const week=has('year.read',true)?await one<{id:string;week_number:number;starts_on:string}>(tx,
      'SELECT id,week_number,starts_on FROM app.school_weeks WHERE school_id=$1 AND year_id=$2 AND starts_on<=$3::date AND ends_on>$3::date ORDER BY starts_on,id LIMIT 1',[schoolId,yearId,ctx.referenceDate]):undefined;
    const period=week&&has('conduct.read',true,week.starts_on)?await one<{status:string}>(tx,
      `SELECT CASE WHEN p.status='LOCKED' AND $5::boolean AND EXISTS(SELECT 1 FROM app.publication_revisions pub
        WHERE pub.school_id=p.school_id AND pub.conduct_period_id=p.id AND pub.year_id=p.year_id AND pub.class_id=p.class_id
        AND pub.kind='CONDUCT' AND pub.status='PUBLISHED' AND pub.source_version=p.data_version) THEN 'PUBLISHED' ELSE p.status END AS status
        FROM app.conduct_periods p WHERE p.school_id=$1 AND p.class_id=$2 AND p.year_id=$3 AND p.week_id=$4`,[schoolId,classId,yearId,week.id,has('conduct.read',false,week.starts_on)]):undefined;
    const pending=await pendingConduct(tx,ctx,c.principal!.userId);
    const links=has('parent_access.manage')?(await one<{studentsWithLink:number;opened:number}>(tx,`SELECT count(DISTINCT e.student_id)::int AS "studentsWithLink",
      count(DISTINCT e.student_id) FILTER(WHERE EXISTS(SELECT 1 FROM app.parent_access_events ev WHERE ev.school_id=l.school_id AND ev.access_link_id=l.id AND ev.event_kind IN ('EXCHANGED','READ')))::int AS opened
      FROM app.enrollments e JOIN app.parent_access_links l ON l.school_id=e.school_id AND l.student_id=e.student_id AND l.year_id=e.year_id
      JOIN app.guardian_relationships gr ON gr.school_id=l.school_id AND gr.id=l.relationship_id AND gr.student_id=l.student_id
      JOIN app.guardians guardian ON guardian.school_id=gr.school_id AND guardian.id=gr.guardian_id AND guardian.status='ACTIVE'
      WHERE e.school_id=$1 AND e.class_id=$2 AND e.year_id=$3 AND e.status<>'CANCELLED' AND e.starts_on<=$4::date AND (e.ends_on IS NULL OR e.ends_on>$4::date)
      AND l.revoked_at IS NULL AND l.expires_at>now() AND gr.status='VERIFIED' AND gr.can_receive_info AND gr.revoked_at IS NULL`,[schoolId,classId,yearId,ctx.referenceDate]))!:null;
    const publicationBounds=Object.entries({CONDUCT:'conduct.read',ATTENDANCE:'attendance.read',TIMETABLE:'schedule.read',DUTY:'duty.manage',ACTIVITY:'activity.read',ANNOUNCEMENT:'announcement.read'}).flatMap(([kind,action])=>access.grants.filter(g=>grantAllows(g,action,{schoolId,classId},access.today)).map(g=>({kind,from_day:g.role_code==='HOMEROOM'?g.starts_on:null,until_day:g.role_code==='HOMEROOM'?g.ends_on:null})));
    const published=(await one<{at:Date|null}>(tx,`SELECT max(p.published_at) AS at FROM app.publication_revisions p
      JOIN platform.schools s ON s.id=p.school_id
      LEFT JOIN app.conduct_periods cp ON cp.school_id=p.school_id AND cp.id=p.conduct_period_id
      LEFT JOIN app.attendance_sessions ats ON ats.school_id=p.school_id AND ats.id=p.attendance_session_id
      LEFT JOIN app.timetable_versions tt ON tt.school_id=p.school_id AND tt.id=p.timetable_id
      LEFT JOIN app.duty_schedules ds ON ds.school_id=p.school_id AND ds.id=p.duty_schedule_id
      WHERE p.school_id=$1 AND p.class_id=$2 AND p.year_id=$3 AND p.status='PUBLISHED' AND EXISTS(
        SELECT 1 FROM jsonb_to_recordset($4::jsonb) AS g(kind text,from_day date,until_day date)
        WHERE g.kind=p.kind AND (g.from_day IS NULL OR g.from_day<=coalesce((SELECT w.starts_on FROM app.school_weeks w WHERE w.school_id=cp.school_id AND w.id=cp.week_id),ats.session_date,tt.starts_on,ds.starts_on,(p.published_at AT TIME ZONE s.timezone)::date))
        AND (g.until_day IS NULL OR g.until_day>coalesce((SELECT w.starts_on FROM app.school_weeks w WHERE w.school_id=cp.school_id AND w.id=cp.week_id),ats.session_date,tt.starts_on,ds.starts_on,(p.published_at AT TIME ZONE s.timezone)::date)))`,[schoolId,classId,yearId,JSON.stringify(publicationBounds)]))!;
    const viaSchoolRole=access.grants.some(g=>g.scope_type==='SCHOOL'&&g.actions.includes('class.read'));
    const schoolShell=viaSchoolRole&&access.grants.some(g=>g.scope_type==='SCHOOL'&&g.actions.includes('year.read'));
    const workspaceKind=duties.length&&has('teacher.self',true)?'TEACHER':schoolShell?'SCHOOL':'CLASS';
    return {data:{school:{id:schoolId,name:cls.school_name,shortName:cls.school_short_name??cls.school_name,slug:cls.school_slug},
      class:{id:classId,version:cls.version,yearId,gradeLevelId:cls.grade_level_id,name:cls.name,capacity:cls.capacity,status:cls.status,roomId:cls.room_id,motto:cls.motto,createdAt:iso(cls.created_at as Date)},
      year:{id:yearId,version:cls.year_version,code:cls.year_code,name:cls.year_name,startsOn:cls.year_starts_on,endsOn:cls.year_ends_on,status:cls.year_status},grade:cls.grade_name,
      today:access.today,referenceDate:ctx.referenceDate,homeroom:homeroom?{name:homeroom.name,contactVisible,workEmail:contactVisible?homeroom.work_email:null,workPhone:contactVisible?homeroom.work_phone:null}:null,
      studentCount:roster?.total??null,maleCount:roster&&has('student.read')?roster.male:null,femaleCount:roster&&has('student.read')?roster.female:null,
      myDuties:[...new Set(duties.map(d=>d.kind==='HOMEROOM'?'Chủ nhiệm':d.subject_name!))],viaSchoolRole,workspaceKind,actions,
      tabs:tabs.filter(([, , ,required])=>required.some(a=>actions.includes(a))).map(([key,label,path])=>({key,label,path:key==='groups'?(actions.includes('group.manage')?'/groups':actions.includes('seating.manage')?'/seating':'/duties'):path})),
      summary:{weekIndex:week?.week_number??null,weekStatus:period?.status??null,pending,links,lastPublishedAt:published.at?.toISOString()??null},
      readOnly:cls.status==='ARCHIVED'||cls.year_status==='ARCHIVED'}};
  },{schoolId:c.params.schoolId,userId:c.principal!.userId,readOnly:true});
}
async function pendingConduct(tx:Transaction,ctx:Context,userId:string){
  if(!headerAllows(ctx,'conduct.read',true))return null;
  const broad=headerAllows(ctx,'conduct.read');
  const bounds=ctx.grants.filter(g=>g.subject_id&&grantAllows(g,'conduct.read',{schoolId:ctx.schoolId,classId:ctx.classId,subjectId:g.subject_id,allowSubject:true},ctx.today))
    .map(g=>({subject_id:g.subject_id,from_day:g.role_code==='SUBJECT_TEACHER'?g.starts_on:null,until_day:g.role_code==='SUBJECT_TEACHER'?g.ends_on:null}));
  return (await one<{n:number}>(tx,`SELECT count(*)::int AS n FROM app.conduct_records r JOIN app.conduct_periods p ON p.school_id=r.school_id AND p.id=r.period_id
    WHERE r.school_id=$1 AND r.class_id=$2 AND p.year_id=$3 AND r.status='DRAFT' AND ($4::boolean OR r.recorded_by=$5::uuid AND EXISTS(
      SELECT 1 FROM jsonb_to_recordset($6::jsonb) AS g(subject_id uuid,from_day date,until_day date) JOIN platform.schools s ON s.id=r.school_id
      WHERE g.subject_id=r.subject_id AND (g.from_day IS NULL OR g.from_day<=(r.occurred_at AT TIME ZONE s.timezone)::date) AND (g.until_day IS NULL OR g.until_day>(r.occurred_at AT TIME ZONE s.timezone)::date)))`,[ctx.schoolId,ctx.classId,ctx.yearId,broad,userId,JSON.stringify(bounds)]))!.n;
}
