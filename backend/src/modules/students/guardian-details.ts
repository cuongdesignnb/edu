import {iso,type Transaction,type Row} from '../../database/database';
import {resource,getResource,dto} from '../../database/resources';
import {grantAllows,type Grant} from '../../common/permissions';
import {Problem,notFound} from '../../common/problem';
import type {RequestContext} from '../../api.router';
import {schoolStudentCapability} from './student-directory';
import {canEditGuardianContact} from './guardian-policy';

const time=(value:unknown)=>value instanceof Date?iso(value):value;
export async function guardianDetails(tx:Transaction,c:RequestContext,access:{all:boolean;classIds:string[];grants:Grant[];today:string}){
  const schoolId=c.params.schoolId!,guardianId=c.params.guardianId!,{today,grants}=access;
  const contact=dto(resource('guardian'),await getResource(tx,resource('guardian'),schoolId,guardianId));
  const rows=(await tx.query<Row>(`SELECT gr.*,s.full_name AS student_name,s.student_code,s.status AS student_status,s.version AS student_version,
    e.class_id,e.class_name,e.year_id,e.id AS enrollment_id,e.version AS enrollment_version,m.work_display_name AS verified_by_name,
    (SELECT a.redacted_after->>'verificationNote' FROM app.audit_events a WHERE a.school_id=gr.school_id AND a.target_id=gr.id
      AND a.target_type='relationship' AND a.action='verifyRelationship' ORDER BY a.created_at DESC,a.id DESC LIMIT 1) AS verification_note,
    (SELECT a.reason FROM app.audit_events a WHERE a.school_id=gr.school_id AND a.target_id=gr.id
      AND a.target_type='relationship' AND a.action='revokeRelationship' ORDER BY a.created_at DESC,a.id DESC LIMIT 1) AS revoked_reason
    FROM app.guardian_relationships gr JOIN app.students s ON s.school_id=gr.school_id AND s.id=gr.student_id
    LEFT JOIN app.memberships m ON m.school_id=gr.school_id AND m.user_id=gr.verified_by
    LEFT JOIN LATERAL(SELECT en.id,en.version,en.class_id,en.year_id,cl.name AS class_name FROM app.enrollments en JOIN app.classes cl
      ON cl.school_id=en.school_id AND cl.id=en.class_id WHERE en.school_id=gr.school_id AND en.student_id=gr.student_id
      AND en.status<>'CANCELLED' AND en.starts_on<=$3::date AND (en.ends_on IS NULL OR en.ends_on>$3::date)
      ORDER BY en.starts_on DESC,en.id DESC LIMIT 1) e ON true
    WHERE gr.school_id=$1 AND gr.guardian_id=$2 AND ($4::boolean OR e.class_id=ANY($5::uuid[]))
    ORDER BY s.full_name COLLATE app.vi_names,s.id LIMIT 1001`,[schoolId,guardianId,today,access.all,access.classIds])).rows;
  if(!access.all&&!rows.length)notFound();if(rows.length>1000)throw new Problem(422,'GUARDIAN_RELATIONSHIP_LIMIT');
  const can=(action:string,row:Row)=>schoolStudentCapability(grants,action)||!!row.class_id&&grants.some(g=>grantAllows(g,action,{schoolId,classId:String(row.class_id)},today));
  const linkRelationships=rows.filter(row=>can('parent_access.manage',row)||can('parent_access.issue',row));
  const links=(await tx.query<Row>(`SELECT l.id,l.version,l.created_at,l.updated_at,l.student_id,l.year_id,l.relationship_id,l.allowed_sections,l.allow_download,
    l.expires_at,l.revoked_at,l.revoke_reason,l.issued_by,m.work_display_name AS issued_by_name,y.name AS year_name,g.full_name AS guardian_name,gr.relationship_label,
    CASE WHEN l.revoked_at IS NOT NULL OR gr.revoked_at IS NOT NULL OR gr.status<>'VERIFIED' OR NOT gr.can_receive_info THEN 'REVOKED'
      WHEN l.expires_at<=now() THEN 'EXPIRED' ELSE 'ACTIVE' END AS access_status,
    (SELECT count(*)::int FROM app.parent_access_events ev WHERE ev.school_id=l.school_id AND ev.access_link_id=l.id AND ev.event_kind IN ('EXCHANGED','READ')) AS opens,
    (SELECT max(ev.created_at) FROM app.parent_access_events ev WHERE ev.school_id=l.school_id AND ev.access_link_id=l.id AND ev.event_kind IN ('EXCHANGED','READ')) AS last_opened_at
    FROM app.parent_access_links l JOIN app.guardian_relationships gr ON gr.school_id=l.school_id AND gr.id=l.relationship_id
    JOIN app.guardians g ON g.school_id=gr.school_id AND g.id=gr.guardian_id JOIN app.academic_years y ON y.school_id=l.school_id AND y.id=l.year_id
    LEFT JOIN app.memberships m ON m.school_id=l.school_id AND m.user_id=l.issued_by
    WHERE l.school_id=$1 AND l.relationship_id=ANY($2::uuid[]) AND ($3::boolean OR EXISTS(SELECT 1 FROM app.enrollments e
      WHERE e.school_id=l.school_id AND e.student_id=l.student_id AND e.year_id=l.year_id AND e.status<>'CANCELLED'
      AND e.starts_on<=$4::date AND (e.ends_on IS NULL OR e.ends_on>$4::date))) ORDER BY l.created_at DESC,l.id DESC LIMIT 1001`,
  [schoolId,linkRelationships.map(r=>r.id),schoolStudentCapability(grants,'parent_access.manage')||schoolStudentCapability(grants,'parent_access.issue'),today])).rows;
  if(links.length>1000)throw new Problem(422,'GUARDIAN_LINK_HISTORY_LIMIT');
  const linkViews=links.map(row=>({id:row.id,version:row.version,createdAt:time(row.created_at),updatedAt:time(row.updated_at),studentId:row.student_id,yearId:row.year_id,relationshipId:row.relationship_id,
    allowedSections:row.allowed_sections,allowDownload:row.allow_download,expiresAt:time(row.expires_at),revokedAt:time(row.revoked_at),revokeReason:row.revoke_reason,issuedBy:row.issued_by,issuedByName:row.issued_by_name,
    guardianName:row.guardian_name,relationshipLabel:row.relationship_label,yearName:row.year_name,status:row.access_status,opens:row.opens,lastOpenedAt:time(row.last_opened_at)}));
  const canViewHistory=schoolStudentCapability(grants,'audit.read');
  const history=canViewHistory?(await tx.query<Row>(`SELECT a.id,a.actor_user_id,m.work_display_name AS actor_name,a.action,a.target_type,a.target_id,a.created_at,a.reason
    FROM app.audit_events a LEFT JOIN app.memberships m ON m.school_id=a.school_id AND m.user_id=a.actor_user_id
    WHERE a.school_id=$1 AND ((a.target_type='guardian' AND a.target_id=$2) OR (a.target_type='relationship' AND a.target_id=ANY($3::uuid[])))
    ORDER BY a.created_at DESC,a.id DESC LIMIT 101`,[schoolId,guardianId,rows.map(r=>r.id)])).rows:null;
  const historyHasMore=history===null?null:history.length>100;if(historyHasMore)history!.pop();
  return {guardian:contact,today,canEditContact:await canEditGuardianContact(tx,schoolId,guardianId,grants,today),canViewHistory,historyHasMore,
    relationships:rows.map(row=>({...dto(resource('relationship'),row),revokedAt:time(row.revoked_at),verifiedByName:row.verified_by_name,verificationNote:row.verification_note,revokedReason:row.revoked_reason,
      student:{id:row.student_id,version:row.student_version,name:row.student_name,code:row.student_code,status:row.student_status,classId:row.class_id??null,className:row.class_name??null,yearId:row.year_id??null,enrollmentId:row.enrollment_id??null,enrollmentVersion:row.enrollment_version??null},
      canEdit:can('guardian.manage',row),canVerify:can('guardian.verify',row),canIssue:can('parent_access.issue',row),canRevokeLinks:can('parent_access.revoke',row),canSeeLinks:linkRelationships.some(r=>r.id===row.id),
      links:linkRelationships.some(r=>r.id===row.id)?linkViews.filter(l=>l.relationshipId===row.id):null})),
    history:history===null?null:history.map(row=>({id:row.id,actorId:row.actor_user_id,actorName:row.actor_name,action:row.action,targetType:row.target_type,targetId:row.target_id,at:time(row.created_at),reason:row.reason}))};
}
