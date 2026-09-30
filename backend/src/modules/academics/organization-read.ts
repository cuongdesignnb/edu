import {resource,type Resource} from '../../database/resources';
import {grantAllows,type Grant} from '../../common/permissions';

/** SQL projections contain only metadata and explicitly authorized aggregates. */
export function organizationRead(kind:string,schoolId:string,grants:Grant[],today:string,list:boolean):{resource:Resource;bindings:unknown[]}{
  const r=resource(kind),first=list?2:3;
  const schoolAction=(action:string)=>grants.some(g=>g.role_code!=='SUPPORT_READ'&&g.scope_type==='SCHOOL'&&g.actions.includes(action));
  if(kind==='year')return {resource:{...r,table:`(SELECT y.*,
    CASE WHEN $${first}::boolean THEN (SELECT count(*)::int FROM app.classes c WHERE c.school_id=y.school_id AND c.year_id=y.id) END AS class_count,
    CASE WHEN $${first+1}::boolean THEN (SELECT count(DISTINCT e.student_id)::int FROM app.enrollments e WHERE e.school_id=y.school_id AND e.year_id=y.id AND e.status<>'CANCELLED') END AS student_count,
    coalesce((SELECT jsonb_agg(jsonb_build_object('id',t.id,'version',t.version,'createdAt',t.created_at,'updatedAt',t.updated_at,'yearId',t.year_id,'code',t.code,'name',t.name,'startsOn',t.starts_on,'endsOn',t.ends_on,'openingDate',t.opening_date,'weekCount',(SELECT count(*)::int FROM app.school_weeks w WHERE w.school_id=t.school_id AND w.term_id=t.id)) ORDER BY t.starts_on,t.id) FROM app.terms t WHERE t.school_id=y.school_id AND t.year_id=y.id),'[]'::jsonb) AS terms
    FROM app.academic_years y)`,fields:{...r.fields,classCount:'class_count',studentCount:'student_count',terms:'terms'}},bindings:[schoolAction('class.read'),schoolAction('student.read')]};
  if(kind==='term')return {resource:{...r,table:`(SELECT t.*,(SELECT count(*)::int FROM app.school_weeks w WHERE w.school_id=t.school_id AND w.term_id=t.id) AS week_count FROM app.terms t)`,fields:{...r.fields,weekCount:'week_count'}},bindings:[]};
  if(kind==='week')return {resource:{...r,table:`(SELECT w.*,(w.input_deadline AT TIME ZONE s.timezone)::date AS input_deadline_day,
    CASE WHEN $${first}::boolean THEN EXISTS(SELECT 1 FROM app.conduct_periods p WHERE p.school_id=w.school_id AND p.week_id=w.id AND p.status='LOCKED') END AS locked
    FROM app.school_weeks w JOIN platform.schools s ON s.id=w.school_id)`,fields:{...r.fields,inputDeadlineDay:'input_deadline_day',locked:'locked'}},bindings:[schoolAction('year.manage')]};
  if(kind!=='class')return {resource:r,bindings:[]};
  const studentClasses=schoolAction('student.read')?null:[...new Set(grants.filter(g=>g.class_id&&grantAllows(g,'student.read',{schoolId,classId:g.class_id},today)).map(g=>g.class_id!))];
  return {resource:{...r,table:`(SELECT c.*,y.name AS year_name,g.name AS grade_name,room.code AS room_code,
    CASE WHEN $${first}::uuid[] IS NULL OR c.id=ANY($${first}::uuid[]) THEN (SELECT count(DISTINCT e.student_id)::int FROM app.enrollments e WHERE e.school_id=c.school_id AND e.class_id=c.id AND e.status<>'CANCELLED' AND e.starts_on<=ref.day AND (e.ends_on IS NULL OR e.ends_on>ref.day)) END AS student_count,
    hr.work_display_name AS homeroom_name,hr.user_id AS homeroom_user_id,hr.member_id AS homeroom_member_id,
    (SELECT count(DISTINCT a.member_id)::int FROM app.teaching_assignments a JOIN app.memberships m ON m.school_id=a.school_id AND m.id=a.member_id AND m.status='ACTIVE' AND m.ended_at IS NULL JOIN app.role_grants rg ON rg.school_id=a.school_id AND rg.id=a.role_grant_id AND rg.revoked_at IS NULL AND rg.valid_from<=(ref.day::timestamp AT TIME ZONE school.timezone) AND (rg.valid_until IS NULL OR rg.valid_until>(ref.day::timestamp AT TIME ZONE school.timezone)) JOIN app.roles role ON role.school_id=rg.school_id AND role.id=rg.role_id AND role.status='ACTIVE' WHERE a.school_id=c.school_id AND a.class_id=c.id AND a.kind='SUBJECT' AND a.revoked_at IS NULL AND a.starts_on<=ref.day AND (a.ends_on IS NULL OR a.ends_on>ref.day)) AS subject_teacher_count,
    EXISTS(SELECT 1 FROM app.lesson_occurrences l WHERE l.school_id=c.school_id AND l.class_id=c.id) AS has_timetable,
    (SELECT count(*)::int FROM app.teaching_assignments a JOIN app.memberships m ON m.school_id=a.school_id AND m.id=a.member_id WHERE a.school_id=c.school_id AND a.class_id=c.id AND a.revoked_at IS NULL AND a.starts_on<=ref.day AND (a.ends_on IS NULL OR a.ends_on>ref.day) AND (m.status<>'ACTIVE' OR m.ended_at IS NOT NULL)) AS inactive_assignment_count,
    ref.day AS reference_date
    FROM app.classes c JOIN app.academic_years y ON y.school_id=c.school_id AND y.id=c.year_id JOIN platform.schools school ON school.id=c.school_id JOIN app.grade_levels g ON g.school_id=c.school_id AND g.id=c.grade_level_id
    LEFT JOIN app.rooms room ON room.school_id=c.school_id AND room.id=c.room_id
    CROSS JOIN LATERAL(SELECT greatest(y.starts_on,least($${first+1}::date,y.ends_on-1)) AS day) ref
    LEFT JOIN LATERAL(SELECT m.work_display_name,m.user_id,m.id AS member_id FROM app.teaching_assignments a JOIN app.memberships m ON m.school_id=a.school_id AND m.id=a.member_id AND m.status='ACTIVE' AND m.ended_at IS NULL JOIN app.role_grants rg ON rg.school_id=a.school_id AND rg.id=a.role_grant_id AND rg.revoked_at IS NULL AND rg.valid_from<=(ref.day::timestamp AT TIME ZONE school.timezone) AND (rg.valid_until IS NULL OR rg.valid_until>(ref.day::timestamp AT TIME ZONE school.timezone)) JOIN app.roles role ON role.school_id=rg.school_id AND role.id=rg.role_id AND role.status='ACTIVE' WHERE a.school_id=c.school_id AND a.class_id=c.id AND a.kind='HOMEROOM' AND a.revoked_at IS NULL AND a.starts_on<=ref.day AND (a.ends_on IS NULL OR a.ends_on>ref.day) ORDER BY a.starts_on DESC,a.id LIMIT 1) hr ON true
    )`,fields:{...r.fields,yearName:'year_name',gradeName:'grade_name',roomCode:'room_code',studentCount:'student_count',homeroomName:'homeroom_name',homeroomUserId:'homeroom_user_id',homeroomMemberId:'homeroom_member_id',subjectTeacherCount:'subject_teacher_count',hasTimetable:'has_timetable',inactiveAssignmentCount:'inactive_assignment_count',referenceDate:'reference_date'},search:[...r.search,'homeroom_name'],filters:{...r.filters,homeroomMemberId:'homeroom_member_id',homeroomUserId:'homeroom_user_id'}},bindings:[studentClasses,today]};
}
