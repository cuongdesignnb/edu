import {one,type Row,type Transaction} from '../../database/database';
import {resource,dto,getResource} from '../../database/resources';
import {Problem,validation} from '../../common/problem';
import type {Grant} from '../../common/permissions';
import type {RequestContext} from '../../api.router';

/** Purpose-bound metadata: no member contacts, students or role catalog. */
export async function assignmentMatrix(tx:Transaction,c:RequestContext,grants:Grant[]){
  const schoolId=c.params.schoolId!;for(const field of Object.keys(c.query))if(field!=='yearId')validation(field,'Tham số ma trận phân công không hợp lệ');
  const today=(await one<{today:string}>(tx,'SELECT (now() AT TIME ZONE timezone)::date AS today FROM platform.schools WHERE id=$1',[schoolId]))!.today;
  const y=c.query.yearId?await getResource(tx,resource('year'),schoolId,c.query.yearId):await one<Row>(tx,`SELECT * FROM app.academic_years WHERE school_id=$1
    ORDER BY CASE WHEN starts_on<=$2::date AND ends_on>$2::date THEN 0 WHEN status='ACTIVE' THEN 1 WHEN status='DRAFT' THEN 2 ELSE 3 END,starts_on DESC,id LIMIT 1`,[schoolId,today]);
  const can=(action:string)=>grants.some(g=>g.scope_type==='SCHOOL'&&g.actions.includes(action));
  if(!y)return {year:null,referenceDate:today,subjects:[],rows:[],canAssign:can('assignment.manage'),canViewMembers:can('member.read')};
  // Preserve the existing archived matrix's end-minus-62-days display reference
  // (inclusive UI end), without treating that date as authorization authority.
  const referenceDate=(await one<{day:string}>(tx,'SELECT greatest($1::date,least($2::date-1,CASE WHEN $3 THEN $2::date-63 ELSE $4::date END)) AS day',[y.starts_on,y.ends_on,y.status==='ARCHIVED',today]))!.day;
  const subjects=(await tx.query<Row>("SELECT * FROM app.subjects WHERE school_id=$1 AND status='ACTIVE' AND code NOT IN ('CHAOCO','SHL') ORDER BY name COLLATE app.vi_names,id LIMIT 201",[schoolId])).rows;
  if(subjects.length>200)throw new Problem(422,'ASSIGNMENT_MATRIX_SUBJECT_LIMIT');
  const rows=(await tx.query<Row>(`SELECT cl.id,cl.version,cl.name,cl.status,
    coalesce((SELECT jsonb_agg(jsonb_build_object('assignmentId',a.id,'version',a.version,'memberId',a.member_id,'name',m.work_display_name,
      'memberStatus',m.status,'identityActive',u.status='ACTIVE','roleActive',r.status='ACTIVE','kind',a.kind,'subjectId',a.subject_id,
      'startsOn',a.starts_on,'endsOn',a.ends_on,'grantStartsAt',g.valid_from,'grantEndsAt',g.valid_until,
      'accessActive',m.status='ACTIVE' AND m.ended_at IS NULL AND u.status='ACTIVE' AND r.status='ACTIVE'
       AND g.class_id=a.class_id AND ((a.kind='HOMEROOM' AND g.scope_type='CLASS' AND g.subject_id IS NULL) OR (a.kind='SUBJECT' AND g.scope_type='SUBJECT' AND g.subject_id=a.subject_id))
       AND EXISTS(SELECT 1 FROM app.role_permissions p WHERE p.school_id=g.school_id AND p.role_id=g.role_id AND g.scope_type=ANY(p.allowed_scopes))
       AND g.valid_from<=now() AND (g.valid_until IS NULL OR g.valid_until>now())
       AND a.starts_on<=$4::date AND (a.ends_on IS NULL OR a.ends_on>$4::date)) ORDER BY a.kind,a.subject_id,a.id)
     FROM app.teaching_assignments a JOIN app.memberships m ON m.school_id=a.school_id AND m.id=a.member_id
     JOIN identity.users u ON u.id=m.user_id JOIN app.role_grants g ON g.school_id=a.school_id AND g.id=a.role_grant_id
     JOIN app.roles r ON r.school_id=g.school_id AND r.id=g.role_id
     WHERE a.school_id=cl.school_id AND a.class_id=cl.id AND a.revoked_at IS NULL AND g.revoked_at IS NULL
      AND (a.kind='HOMEROOM' OR a.subject_id=ANY($5::uuid[]))
      AND a.starts_on<=$3::date AND (a.ends_on IS NULL OR a.ends_on>$3::date)
      AND g.valid_from<=($3::date::timestamp AT TIME ZONE config.timezone)
      AND (g.valid_until IS NULL OR g.valid_until>($3::date::timestamp AT TIME ZONE config.timezone))), '[]'::jsonb) AS cells,
    ARRAY(SELECT DISTINCT l.subject_id FROM app.lesson_occurrences l WHERE l.school_id=cl.school_id AND l.class_id=cl.id AND l.status='SCHEDULED' AND l.subject_id=ANY($5::uuid[])) AS required_subjects
    FROM app.classes cl JOIN platform.schools config ON config.id=cl.school_id
    WHERE cl.school_id=$1 AND cl.year_id=$2 ORDER BY cl.name COLLATE app.vi_names,cl.id LIMIT 2001`,[schoolId,y.id,referenceDate,today,subjects.map(s=>s.id)])).rows;
  if(rows.length>2000)throw new Problem(422,'ASSIGNMENT_MATRIX_CLASS_LIMIT');
  return {year:dto(resource('year'),y),referenceDate,subjects:subjects.map(s=>dto(resource('subject'),s)),
    rows:rows.map(row=>{
      const cells=row.cells as Array<Record<string,unknown>>,homeroom=cells.find(a=>a.kind==='HOMEROOM')??null;
      const bySubject=Object.fromEntries(subjects.map(s=>[String(s.id),cells.find(a=>a.kind==='SUBJECT'&&a.subjectId===s.id)??null]));
      const conflicts=[];if(!homeroom)conflicts.push('Thiếu giáo viên chủ nhiệm');
      for(const s of subjects)if((row.required_subjects as string[]).includes(String(s.id))&&!bySubject[String(s.id)])conflicts.push(`Chưa phân công ${String(s.name)}`);
      for(const a of [homeroom,...Object.values(bySubject)])if(a){
        if(a.memberStatus!=='ACTIVE'||!a.identityActive)conflicts.push(`${String(a.name)} đang bị khóa hoặc đã kết thúc công tác`);
        else if(!a.roleActive)conflicts.push(`Vai trò của ${String(a.name)} đã lưu trữ`);
      }
      // JSON timestamps retain actual instants; no browser date calculation or
      // inferred creator/contact metadata is added to these purpose cells.
      return {classId:row.id,version:row.version,className:row.name,status:row.status,homeroom,bySubject,conflicts};
    }),canAssign:can('assignment.manage')&&y.status!=='ARCHIVED',canViewMembers:can('member.read')};
}
