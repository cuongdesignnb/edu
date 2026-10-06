import {one,iso,type Transaction,type Row} from '../../database/database';
import {getResource,resource} from '../../database/resources';
import {canonical} from '../../common/commands';
import {hashToken} from '../../common/security';
import {validation,Problem} from '../../common/problem';
import type {RequestContext} from '../../api.router';

export const checklistKeys=['pendingConduct','openWeeks','pendingAdjustments','pendingEvidence','draftAnnouncements','activeLinks'] as const;
export async function handoverChecklist(tx:Transaction,schoolId:string,classId:string,day:string){
  return (await one<Row>(tx,`SELECT
    (SELECT count(*)::int FROM app.conduct_records WHERE school_id=$1 AND class_id=$2 AND status='DRAFT') AS "pendingConduct",
    (SELECT count(*)::int FROM app.conduct_periods WHERE school_id=$1 AND class_id=$2 AND status IN ('OPEN','IN_REVIEW')) AS "openWeeks",
    (SELECT count(*)::int FROM app.adjustment_requests a JOIN app.conduct_periods p ON p.school_id=a.school_id AND p.id=a.period_id
      WHERE a.school_id=$1 AND p.class_id=$2 AND a.status='SUBMITTED') AS "pendingAdjustments",
    (SELECT count(*)::int FROM app.evidence e JOIN app.activity_participants p ON p.school_id=e.school_id AND p.id=e.participant_id
      WHERE e.school_id=$1 AND p.class_id=$2 AND e.status='SUBMITTED') AS "pendingEvidence",
    (SELECT count(*)::int FROM app.announcements a WHERE a.school_id=$1 AND a.class_id=$2 AND a.status='DRAFT' AND a.discarded_at IS NULL
      AND NOT EXISTS(SELECT 1 FROM app.announcements n WHERE n.school_id=a.school_id AND n.root_id=a.root_id AND n.discarded_at IS NULL AND (n.created_at,n.id)>(a.created_at,a.id))) AS "draftAnnouncements",
    (SELECT count(*)::int FROM app.parent_access_links l JOIN app.guardian_relationships r ON r.school_id=l.school_id AND r.id=l.relationship_id AND r.student_id=l.student_id
      WHERE l.school_id=$1 AND l.revoked_at IS NULL AND l.expires_at>now() AND r.status='VERIFIED' AND r.can_receive_info AND r.revoked_at IS NULL
      AND EXISTS(SELECT 1 FROM app.enrollments e WHERE e.school_id=l.school_id AND e.class_id=$2 AND e.student_id=l.student_id AND e.year_id=l.year_id
        AND e.status<>'CANCELLED' AND e.starts_on<=$3::date AND (e.ends_on IS NULL OR e.ends_on>$3::date))) AS "activeLinks"`,[schoolId,classId,day]))!;
}
export function handoverReviewHash(state:Row){return hashToken(canonical(state));}
export function completeChecklist(value:unknown){
  const row=value as Row|undefined;return row&&checklistKeys.every(k=>Number.isInteger(row[k])&&Number(row[k])>=0)?Object.fromEntries(checklistKeys.map(k=>[k,row[k]])):null;
}
export async function handoverSource(tx:Transaction,schoolId:string,body:Record<string,unknown>,previous:Row){
  const cls=await getResource(tx,resource('class'),schoolId,String(body.classId)),year=await getResource(tx,resource('year'),schoolId,String(cls.year_id));
  const from=await getResource(tx,resource('member'),schoolId,String(previous.member_id)),target=await getResource(tx,resource('member'),schoolId,String(body.toMemberId));
  const grant=(await one<Row>(tx,'SELECT * FROM app.role_grants WHERE school_id=$1 AND id=$2',[schoolId,previous.role_grant_id]))!;
  const roles=(await tx.query<Row>(`SELECT r.id,r.version,r.status,r.code,coalesce((SELECT jsonb_agg(jsonb_build_object('action',p.action_code,'scopes',p.allowed_scopes) ORDER BY p.action_code)
    FROM app.role_permissions p WHERE p.school_id=r.school_id AND p.role_id=r.id),'[]'::jsonb) AS permissions
    FROM app.roles r WHERE r.school_id=$1 AND (r.id=$2 OR r.code='HOMEROOM' OR r.id=(SELECT (settings->>'homeroomRoleId')::uuid FROM platform.schools WHERE id=$1)) ORDER BY r.id`,[schoolId,grant.role_id])).rows;
  const school=(await one<Row>(tx,"SELECT version,timezone,settings->'homeroomMayPublish' AS publish FROM platform.schools WHERE id=$1",[schoolId]))!;
  const identities=(await tx.query<Row>('SELECT id,status,version FROM identity.users WHERE id=ANY($1::uuid[]) ORDER BY id',[[from.user_id,target.user_id]])).rows;
  return {classId:cls.id,classVersion:cls.version,yearId:year.id,yearVersion:year.version,yearStatus:year.status,
    fromAssignmentId:previous.id,fromAssignmentVersion:previous.version,fromMemberId:from.id,fromMemberVersion:from.version,
    toMemberId:target.id,toMemberVersion:target.version,effectiveOn:body.effectiveOn,startsOn:previous.starts_on,endsOn:previous.ends_on,
    grant:{id:grant.id,version:grant.version,memberId:grant.member_id,scopeType:grant.scope_type,classId:grant.class_id,subjectId:grant.subject_id,
      validFrom:iso(grant.valid_from as Date),validUntil:grant.valid_until?iso(grant.valid_until as Date):null,revokedAt:grant.revoked_at?iso(grant.revoked_at as Date):null},
    roles,school,identities,checklist:await handoverChecklist(tx,schoolId,String(cls.id),String(body.effectiveOn))};
}
export function assertHandoverSource(state:Row,body:Record<string,unknown>){
  for(const [field,source]of [['expectedFromAssignmentVersion','fromAssignmentVersion'],['expectedClassVersion','classVersion'],['expectedToMemberVersion','toMemberVersion']] as const)
    if(body[field]!==undefined&&body[field]!==state[source])throw new Problem(409,'VERSION_CONFLICT',undefined,Number(state[source]));
  if(body.previewHash!==undefined&&body.previewHash!==handoverReviewHash(state))throw new Problem(409,'STALE_PREVIEW');
}
export async function handoverPreview(tx:Transaction,c:RequestContext){
  for(const key of Object.keys(c.query))if(!['effectiveOn','toMemberId'].includes(key))validation(key,'Tham số bàn giao không hợp lệ');
  const schoolId=c.params.schoolId!,cls=await getResource(tx,resource('class'),schoolId,c.params.classId!);
  const year=await getResource(tx,resource('year'),schoolId,String(cls.year_id));
  const today=(await one<{today:string}>(tx,'SELECT (now() AT TIME ZONE timezone)::date AS today FROM platform.schools WHERE id=$1',[schoolId]))!.today;
  const day=c.query.effectiveOn??today;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(Date.parse(day+'T00:00:00Z'))||new Date(day+'T00:00:00Z').toISOString().slice(0,10)!==day)validation('effectiveOn','Ngày bàn giao không hợp lệ');
  if(c.query.effectiveOn&&(day<today||day<String(year.starts_on)||day>=String(year.ends_on)))validation('effectiveOn','Ngày bàn giao phải từ hôm nay và thuộc năm học');
  const previous=await one<Row>(tx,`SELECT a.*,m.work_display_name,m.status AS member_status,m.version AS member_version,u.status AS identity_status,
    g.valid_from,g.valid_until,g.revoked_at AS grant_revoked_at,g.version AS grant_version,r.status AS role_status
    FROM app.teaching_assignments a JOIN app.memberships m ON m.school_id=a.school_id AND m.id=a.member_id
    JOIN identity.users u ON u.id=m.user_id JOIN app.role_grants g ON g.school_id=a.school_id AND g.id=a.role_grant_id
    JOIN app.roles r ON r.school_id=g.school_id AND r.id=g.role_id WHERE a.school_id=$1 AND a.class_id=$2 AND a.kind='HOMEROOM'
    AND a.revoked_at IS NULL AND g.revoked_at IS NULL AND a.starts_on<=$3::date AND (a.ends_on IS NULL OR a.ends_on>$3::date) ORDER BY a.id LIMIT 1`,[schoolId,cls.id,today]);
  const accessActive=previous&&previous.member_status==='ACTIVE'&&previous.identity_status==='ACTIVE'&&previous.role_status==='ACTIVE'
    && (previous.valid_from as Date).getTime()<=Date.now()&&(!previous.valid_until||(previous.valid_until as Date).getTime()>Date.now());
  return {cls,previous,data:{className:cls.name,classVersion:cls.version,referenceDate:today,effectiveOn:day,canHandover:cls.status!=='ARCHIVED'&&year.status!=='ARCHIVED',
    current:previous?{assignmentId:previous.id,version:previous.version,membershipId:previous.member_id,memberVersion:previous.member_version,name:previous.work_display_name,
      memberStatus:previous.member_status,startsOn:previous.starts_on,endsOn:previous.ends_on,accessActive:!!accessActive}:null,
    openItems:await handoverChecklist(tx,schoolId,String(cls.id),day),previewHash:null as string|null,toMemberVersion:null as number|null}};
}
