import {Database,one} from '../../database/database';
import {listResource,type Resource} from '../../database/resources';
import {grantAllows,Permissions,type Grant} from '../../common/permissions';
import {Problem} from '../../common/problem';
import type {RequestContext} from '../../api.router';

// SUBJECT capabilities remain limited to the workflows that accept subject scope.
const subjectActions=new Set(['class.read','student.read','attendance.record','conduct.record','conduct.adjust.request','schedule.read','report.read']);
function bindings(grants:Grant[],schoolId:string,today:string){
  return grants.map(g=>({scope:g.scope_type,classId:g.class_id,subjectId:g.subject_id,actions:g.actions.filter(action=>grantAllows(g,action,{schoolId,...(g.class_id?{classId:g.class_id}:{}),allowSubject:subjectActions.has(action)},today))}));
}
const permitted=(action:string)=>`EXISTS(SELECT 1 FROM jsonb_to_recordset($6::jsonb) AS p(scope text,"classId" uuid,"subjectId" uuid,actions jsonb) WHERE p.actions ? '${action}' AND (p.scope='SCHOOL' OR p."classId"=c.id))`;
const live=`a.role_grant_id=ANY($4::uuid[]) AND a.revoked_at IS NULL AND a.starts_on<=$3::date AND (a.ends_on IS NULL OR a.ends_on>$3::date)`;
const table=`(SELECT c.id,c.school_id,c.year_id,c.name,c.status,y.name AS year_label,
  $3::date::text AS today,greatest(y.starts_on,least($3::date,y.ends_on-1))::text AS reference_date,
  own.live,CASE WHEN own.live THEN c.motto END AS motto,
  CASE WHEN own.live AND ${permitted('student.read')} THEN (SELECT count(*)::int FROM app.enrollments e WHERE e.school_id=c.school_id AND e.class_id=c.id AND e.status<>'CANCELLED' AND e.starts_on<=greatest(y.starts_on,least($3::date,y.ends_on-1)) AND (e.ends_on IS NULL OR e.ends_on>greatest(y.starts_on,least($3::date,y.ends_on-1)))) END AS student_count,
  CASE WHEN own.live THEN room.name END AS room_label,
  CASE WHEN own.live THEN (SELECT m.work_display_name FROM app.teaching_assignments h
    JOIN app.memberships m ON m.school_id=h.school_id AND m.id=h.member_id AND m.status='ACTIVE' AND m.ended_at IS NULL
    JOIN identity.users u ON u.id=m.user_id AND u.status='ACTIVE'
    JOIN app.role_grants g ON g.school_id=h.school_id AND g.id=h.role_grant_id AND g.revoked_at IS NULL AND g.valid_from<=now() AND (g.valid_until IS NULL OR g.valid_until>now())
    JOIN app.roles r ON r.school_id=g.school_id AND r.id=g.role_id AND r.status='ACTIVE'
    WHERE h.school_id=c.school_id AND h.class_id=c.id AND h.kind='HOMEROOM' AND h.revoked_at IS NULL AND h.starts_on<=$3::date AND (h.ends_on IS NULL OR h.ends_on>$3::date) ORDER BY h.id LIMIT 1) END AS homeroom_name,
  own.assignments,
  CASE WHEN own.live THEN coalesce((SELECT jsonb_agg(DISTINCT action ORDER BY action) FROM jsonb_to_recordset($6::jsonb) AS p(scope text,"classId" uuid,actions jsonb) CROSS JOIN LATERAL jsonb_array_elements_text(p.actions) action WHERE p.scope='SCHOOL' OR p."classId"=c.id),'[]'::jsonb) ELSE '[]'::jsonb END AS actions,
  CASE WHEN own.live AND ${permitted('schedule.read')} THEN (SELECT jsonb_build_object('date',to_char(l.starts_at AT TIME ZONE s.timezone,'YYYY-MM-DD'),'startsAtLocal',to_char(l.starts_at AT TIME ZONE s.timezone,'HH24:MI'),'endsAtLocal',to_char(l.ends_at AT TIME ZONE s.timezone,'HH24:MI'),'periodNumber',l.period_number,'subjectName',sub.name)
    FROM app.lesson_occurrences l JOIN app.subjects sub ON sub.school_id=l.school_id AND sub.id=l.subject_id
    WHERE l.school_id=c.school_id AND l.class_id=c.id AND l.member_id=$2::uuid AND l.status='SCHEDULED' AND l.starts_at>=now() AND l.starts_at<($3::date+7)::timestamp AT TIME ZONE s.timezone
    AND EXISTS(SELECT 1 FROM jsonb_to_recordset($6::jsonb) AS p(scope text,"classId" uuid,"subjectId" uuid,actions jsonb) WHERE p.actions ? 'schedule.read' AND (p.scope='SCHOOL' OR p."classId"=c.id AND (p.scope='CLASS' OR p.scope='SUBJECT' AND p."subjectId"=l.subject_id)))
    AND EXISTS(SELECT 1 FROM app.teaching_assignments a WHERE a.school_id=l.school_id AND a.class_id=l.class_id AND a.member_id=l.member_id AND ${live} AND a.starts_on<=(l.starts_at AT TIME ZONE s.timezone)::date AND (a.ends_on IS NULL OR a.ends_on>(l.starts_at AT TIME ZONE s.timezone)::date) AND (a.kind='HOMEROOM' OR a.subject_id=l.subject_id))
    ORDER BY l.starts_at,l.id LIMIT 1) END AS next_lesson
  FROM app.classes c JOIN app.academic_years y ON y.school_id=c.school_id AND y.id=c.year_id
  JOIN platform.schools s ON s.id=c.school_id LEFT JOIN app.rooms room ON room.school_id=c.school_id AND room.id=c.room_id
  CROSS JOIN LATERAL(SELECT bool_or(${live}) AS live,
    jsonb_agg(jsonb_build_object('id',a.id,'kind',a.kind,'subjectName',sub.name,'startsOn',a.starts_on,'endsOn',a.ends_on,'live',${live},
      'status',CASE WHEN ${live} THEN 'ACTIVE' WHEN a.revoked_at IS NOT NULL OR g.revoked_at IS NOT NULL THEN 'REVOKED' WHEN a.ends_on<=$3::date THEN 'ENDED' ELSE 'NOT_CURRENT' END) ORDER BY a.kind,a.starts_on,a.id) AS assignments
    FROM app.teaching_assignments a JOIN app.role_grants g ON g.school_id=a.school_id AND g.id=a.role_grant_id
    LEFT JOIN app.subjects sub ON sub.school_id=a.school_id AND sub.id=a.subject_id
    WHERE a.school_id=c.school_id AND a.class_id=c.id AND a.member_id=$2::uuid AND a.starts_on<=$3::date AND ($5::boolean OR ${live})) own
  WHERE c.school_id=$1 AND own.assignments IS NOT NULL AND ($5::boolean OR own.live))`;
const directory:Resource={table,fields:{id:'id',schoolId:'school_id',yearId:'year_id',name:'name',yearLabel:'year_label',status:'status',today:'today',referenceDate:'reference_date',motto:'motto',live:'live',studentCount:'student_count',roomLabel:'room_label',homeroomName:'homeroom_name',assignments:'assignments',actions:'actions',nextLesson:'next_lesson'},writeFields:[],search:[],filters:{}};

export async function teacherClassDirectory(db:Database,policy:Permissions,c:RequestContext){
  return db.transaction(async tx=>{
    const schoolId=c.params.schoolId!,{grants,today}=await policy.require(tx,c.principal!,'teacher.self',{schoolId,allowScopedContext:true,allowSubject:true});
    if(Object.entries(c.query).some(([key,value])=>!['includeEnded','sort','dir','limit','cursor'].includes(key)||typeof value!=='string')||c.query.includeEnded!==undefined&&!['true','false'].includes(c.query.includeEnded)||c.query.sort!==undefined&&!['name','id'].includes(c.query.sort))throw new Problem(422,'INVALID_QUERY');
    const member=(await one<{id:string}>(tx,"SELECT id FROM app.memberships WHERE school_id=$1 AND user_id=$2 AND status='ACTIVE' AND ended_at IS NULL",[schoolId,c.principal!.userId]))!;
    const active=grants.filter(g=>g.assignment_id&&g.class_id&&grantAllows(g,'teacher.self',{schoolId,classId:g.class_id,subjectId:g.subject_id??undefined,allowSubject:true},today)&&grantAllows(g,'class.read',{schoolId,classId:g.class_id,subjectId:g.subject_id??undefined,allowSubject:true},today)).map(g=>g.id);
    return listResource(tx,directory,schoolId,{...c.query,sort:c.query.sort??'name'},undefined,c.principal!.userId,[member.id,today,active,c.query.includeEnded==='true',JSON.stringify(bindings(grants,schoolId,today))]);
  },{schoolId:c.params.schoolId,userId:c.principal!.userId,readOnly:true});
}
