import {one,iso,type Transaction,type Row} from '../../database/database';
import {dto,resource,getResource} from '../../database/resources';
import {grantAllows,type Grant} from '../../common/permissions';
import {Problem,notFound} from '../../common/problem';
import type {RequestContext} from '../../api.router';
import {studentYear,schoolStudentCapability} from './student-directory';

function bounded(rows:Row[],maximum:number){if(rows.length>maximum)throw new Problem(422,'STUDENT_PROFILE_HISTORY_LIMIT');return rows;}
const time=(value:unknown)=>value instanceof Date?iso(value):value;
type ProfileAccess={all:boolean;classIds:string[];today:string;grants:Grant[]};
export async function studentDetails(tx:Transaction,c:RequestContext,access:ProfileAccess){
  const schoolId=c.params.schoolId!,studentId=c.params.studentId!,{today,grants}=access;
  const student=await getResource(tx,resource('student'),schoolId,studentId);
  const classIds=c.query.classId?[c.query.classId]:access.classIds;
  if(c.query.classId&&!access.all&&!access.classIds.includes(c.query.classId))notFound();
  const cls=c.query.classId?await one<Row>(tx,'SELECT year_id FROM app.classes WHERE school_id=$1 AND id=$2',[schoolId,c.query.classId]):undefined;
  if(c.query.classId&&(!cls||c.query.yearId&&cls.year_id!==c.query.yearId))notFound();
  const {year,referenceDate}=await studentYear(tx,schoolId,today,c.query.yearId??(cls?String(cls.year_id):undefined));
  const history=bounded((await tx.query<Row>(`SELECT e.*,cl.name AS class_name,y.name AS year_name,y.status AS year_status,
    greatest(e.starts_on,least($3::date,y.ends_on-1,coalesce(e.ends_on-1,$3::date)))::text AS reference_date,
    teacher.name AS homeroom_name FROM app.enrollments e JOIN app.classes cl ON cl.school_id=e.school_id AND cl.id=e.class_id
    JOIN app.academic_years y ON y.school_id=e.school_id AND y.id=e.year_id
    LEFT JOIN LATERAL (SELECT m.work_display_name AS name FROM app.teaching_assignments a JOIN app.memberships m
      ON m.school_id=a.school_id AND m.id=a.member_id WHERE a.school_id=e.school_id AND a.class_id=e.class_id AND a.kind='HOMEROOM'
      AND a.starts_on<=greatest(e.starts_on,least($3::date,y.ends_on-1,coalesce(e.ends_on-1,$3::date)))
      AND (a.ends_on IS NULL OR a.ends_on>greatest(e.starts_on,least($3::date,y.ends_on-1,coalesce(e.ends_on-1,$3::date))))
      ORDER BY a.starts_on DESC,a.id DESC LIMIT 1) teacher ON true
    WHERE e.school_id=$1 AND e.student_id=$2 AND e.status<>'CANCELLED'
    AND ($4::boolean OR e.class_id=ANY($5::uuid[]) AND e.starts_on<=$3::date) ORDER BY e.starts_on DESC,e.id DESC LIMIT 2001`,[schoolId,studentId,today,access.all,classIds])).rows,2000);
  if(!access.all&&!history.length||c.query.classId&&!history.some(e=>e.class_id===c.query.classId))notFound();
  const current=history.filter(e=>String(e.starts_on)<=today&&(e.ends_on===null||String(e.ends_on)>today));
  // Family and link authority follows the pupil's actual current enrollment.
  // Displaying a previous class does not retain its access to today's family.
  const allowed=(action:string,subject=false)=>schoolStudentCapability(grants,action)||current.some(e=>
    grants.some(g=>grantAllows(g,action,{schoolId,classId:String(e.class_id),allowSubject:subject},today)));
  const family=allowed('guardian.read'),links=allowed('parent_access.manage')||allowed('parent_access.issue');
  const seeBirthDate=access.all||family,studentDto=dto(resource('student'),student);
  if(!seeBirthDate){studentDto.dateOfBirth=null;studentDto.preferredName=null;}
  const selected=history.find(e=>e.year_id===year?.id&&(!c.query.classId||e.class_id===c.query.classId)&&String(e.starts_on)<=referenceDate!);
  const full=access.all||!!selected&&grants.some(g=>g.scope_type==='CLASS'&&grantAllows(g,'student.read',{schoolId,classId:String(selected.class_id)},today));
  const inEffect=!!selected&&String(selected.starts_on)<=referenceDate!&&(selected.ends_on===null||String(selected.ends_on)>referenceDate!);
  const chosen=selected?{...dto(resource('enrollment'),selected),className:selected.class_name,yearName:selected.year_name,yearStatus:selected.year_status,referenceDate,inEffect,homeroomName:selected.homeroom_name}:null;
  let group:Record<string,unknown>|null=null,positions:Record<string,unknown>[]|null=null;
  if(full){positions=[];if(selected&&inEffect){
    const g=await one<Row>(tx,`SELECT gm.id,gm.version AS assignment_version,gm.group_id,g.name,g.version FROM app.group_memberships gm JOIN app.class_groups g
      ON g.school_id=gm.school_id AND g.id=gm.group_id WHERE gm.school_id=$1 AND gm.enrollment_id=$2 AND gm.cancelled_at IS NULL
      AND gm.starts_on<=$3::date AND (gm.ends_on IS NULL OR gm.ends_on>$3::date) ORDER BY gm.starts_on DESC,gm.id DESC LIMIT 1`,[schoolId,selected.id,referenceDate]);
    if(g)group={id:g.group_id,name:g.name,assignmentId:g.id,version:g.version,assignmentVersion:g.assignment_version};
    const p=bounded((await tx.query<Row>(`SELECT a.id,a.version AS assignment_version,a.position_id,p.name,p.code,p.version FROM app.position_assignments a
      JOIN app.class_positions p ON p.school_id=a.school_id AND p.id=a.position_id WHERE a.school_id=$1 AND a.enrollment_id=$2
      AND a.cancelled_at IS NULL AND a.starts_on<=$3::date AND (a.ends_on IS NULL OR a.ends_on>$3::date)
      ORDER BY p.name COLLATE app.vi_names,a.id LIMIT 1001`,[schoolId,selected.id,referenceDate])).rows,1000);
    positions=p.map(row=>({id:row.position_id,name:row.name,code:row.code,assignmentId:row.id,version:row.version,assignmentVersion:row.assignment_version}));
  }}
  let relationships:Record<string,unknown>[]|null=null;
  if(family){const rows=bounded((await tx.query<Row>(`SELECT gr.*,g.full_name,g.phone,g.email,g.status AS guardian_status,g.version AS guardian_version,
      g.created_at AS guardian_created_at,g.updated_at AS guardian_updated_at,m.work_display_name AS verified_by_name
      FROM app.guardian_relationships gr JOIN app.guardians g ON g.school_id=gr.school_id AND g.id=gr.guardian_id
      LEFT JOIN app.memberships m ON m.school_id=gr.school_id AND m.user_id=gr.verified_by WHERE gr.school_id=$1 AND gr.student_id=$2
      ORDER BY gr.is_primary DESC,gr.created_at,gr.id LIMIT 1001`,[schoolId,studentId])).rows,1000);
    relationships=rows.map(row=>({...dto(resource('relationship'),row),revokedAt:time(row.revoked_at),verifiedByName:row.verified_by_name,
      guardian:{id:row.guardian_id,version:row.guardian_version,createdAt:time(row.guardian_created_at),updatedAt:time(row.guardian_updated_at),fullName:row.full_name,phone:row.phone,email:row.email,status:row.guardian_status}}));}
  let accessLinks:Record<string,unknown>[]|null=null,events:Record<string,unknown>[]|null=null,eventsHasMore:boolean|null=null;
  if(links){const rows=bounded((await tx.query<Row>(`SELECT l.id,l.version,l.student_id,l.year_id,l.relationship_id,l.allowed_sections,l.allow_download,l.expires_at,l.revoked_at,l.revoke_reason,
      l.created_at,l.updated_at,l.issued_by,g.full_name AS guardian_name,gr.relationship_label,gr.status AS relationship_status,gr.can_receive_info,gr.revoked_at AS relationship_revoked_at,
      y.name AS year_name,m.work_display_name AS issued_by_name,
      CASE WHEN l.revoked_at IS NOT NULL OR gr.revoked_at IS NOT NULL OR gr.status<>'VERIFIED' OR NOT gr.can_receive_info THEN 'REVOKED' WHEN l.expires_at<=now() THEN 'EXPIRED' ELSE 'ACTIVE' END AS access_status,
      (SELECT count(*)::int FROM app.parent_access_events ev WHERE ev.school_id=l.school_id AND ev.access_link_id=l.id AND ev.event_kind IN ('EXCHANGED','READ')) AS opens,
      (SELECT max(ev.created_at) FROM app.parent_access_events ev WHERE ev.school_id=l.school_id AND ev.access_link_id=l.id AND ev.event_kind IN ('EXCHANGED','READ')) AS last_opened_at
      FROM app.parent_access_links l JOIN app.guardian_relationships gr ON gr.school_id=l.school_id AND gr.id=l.relationship_id
      JOIN app.guardians g ON g.school_id=gr.school_id AND g.id=gr.guardian_id JOIN app.academic_years y ON y.school_id=l.school_id AND y.id=l.year_id
      LEFT JOIN app.memberships m ON m.school_id=l.school_id AND m.user_id=l.issued_by
      WHERE l.school_id=$1 AND l.student_id=$2 AND ($3::boolean OR l.year_id=ANY($4::uuid[])) ORDER BY l.created_at DESC,l.id DESC LIMIT 1001`,
    [schoolId,studentId,schoolStudentCapability(grants,'parent_access.manage')||schoolStudentCapability(grants,'parent_access.issue'),[...new Set(current.map(e=>e.year_id))]])).rows,1000);
    accessLinks=rows.map(row=>({id:row.id,version:row.version,createdAt:time(row.created_at),updatedAt:time(row.updated_at),studentId:row.student_id,yearId:row.year_id,relationshipId:row.relationship_id,
      allowedSections:row.allowed_sections,allowDownload:row.allow_download,expiresAt:time(row.expires_at),revokedAt:time(row.revoked_at),revokeReason:row.revoke_reason,issuedBy:row.issued_by,issuedByName:row.issued_by_name,
      guardianName:row.guardian_name,relationshipLabel:row.relationship_label,yearName:row.year_name,status:row.access_status,opens:row.opens,lastOpenedAt:time(row.last_opened_at)}));
    const logs=(await tx.query<Row>(`SELECT ev.id,ev.access_link_id,ev.event_kind,ev.device_summary,ev.section,ev.created_at,g.full_name AS guardian_name,gr.relationship_label
      FROM app.parent_access_events ev JOIN app.parent_access_links l ON l.school_id=ev.school_id AND l.id=ev.access_link_id
      JOIN app.guardian_relationships gr ON gr.school_id=l.school_id AND gr.id=l.relationship_id JOIN app.guardians g ON g.school_id=gr.school_id AND g.id=gr.guardian_id
      WHERE ev.school_id=$1 AND ev.access_link_id=ANY($2::uuid[]) ORDER BY ev.created_at DESC,ev.id DESC LIMIT 101`,[schoolId,rows.map(row=>row.id)])).rows;
    eventsHasMore=logs.length>100;if(eventsHasMore)logs.pop();events=logs.map(row=>({id:row.id,accessLinkId:row.access_link_id,eventKind:row.event_kind,occurredAt:time(row.created_at),deviceSummary:row.device_summary,section:row.section,guardianName:row.guardian_name,relationshipLabel:row.relationship_label}));
  }
  const note=family?(await one<Row>(tx,'SELECT internal_note FROM app.students WHERE school_id=$1 AND id=$2',[schoolId,studentId]))!.internal_note:null;
  return {student:studentDto,level:full?'FULL':'SUBJECT_MINIMAL',today,year,referenceDate,selectedEnrollment:chosen,
    history:history.map(e=>({...dto(resource('enrollment'),e),className:e.class_name,yearName:e.year_name,yearStatus:e.year_status,referenceDate:e.reference_date,homeroomName:e.homeroom_name})),
    group,positions,relationships,links:accessLinks,accessLog:events,accessLogHasMore:eventsHasMore,internalNote:note,
    perms:{edit:allowed('student.manage'),transfer:allowed('student.transfer')||allowed('student.transfer.request'),seeGuardians:family,editGuardians:allowed('guardian.manage'),verifyGuardians:allowed('guardian.verify'),manageLinks:links,
      issueLinks:allowed('parent_access.issue'),revokeLinks:allowed('parent_access.revoke'),seeInternalNote:family,seeBirthDate}};
}
