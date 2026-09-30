import {one,iso,type Transaction,type Row} from '../../database/database';
import {getResource,dto,type Resource} from '../../database/resources';
import {auditResource,auditView} from '../../database/audit-view';
import {permissions} from '../../common/contract';
import type {Permissions} from '../../common/permissions';
import {Problem,validation} from '../../common/problem';
import type {RequestContext} from '../../api.router';

const meta={id:'id',version:'version',createdAt:'created_at',updatedAt:'updated_at'};
/** Counts are purpose metadata; no directory access is borrowed. */
export const roleSummaryResource:Resource={table:`(SELECT r.*,
  coalesce((SELECT jsonb_agg(jsonb_build_object('action',p.action_code,'scopes',p.allowed_scopes) ORDER BY p.action_code)
    FROM app.role_permissions p WHERE p.school_id=r.school_id AND p.role_id=r.id),'[]'::jsonb) AS permissions,
  ARRAY(SELECT DISTINCT unnest(p.allowed_scopes) FROM app.role_permissions p WHERE p.school_id=r.school_id AND p.role_id=r.id ORDER BY 1) AS scopes,
  (SELECT count(DISTINCT g.member_id)::integer FROM app.role_grants g WHERE g.school_id=r.school_id AND g.role_id=r.id AND g.scope_type='SCHOOL'
    AND g.revoked_at IS NULL AND (g.valid_until IS NULL OR g.valid_until>now())) AS member_count,
  (SELECT count(*)::integer FROM app.teaching_assignments a JOIN app.role_grants g ON g.school_id=a.school_id AND g.id=a.role_grant_id
    JOIN app.memberships m ON m.school_id=a.school_id AND m.id=a.member_id JOIN identity.users u ON u.id=m.user_id
    JOIN platform.schools s ON s.id=a.school_id WHERE g.school_id=r.school_id AND g.role_id=r.id AND r.status='ACTIVE'
    AND m.status='ACTIVE' AND m.ended_at IS NULL AND u.status='ACTIVE' AND a.revoked_at IS NULL AND g.revoked_at IS NULL
    AND g.valid_from<=now() AND (g.valid_until IS NULL OR g.valid_until>now())
    AND a.starts_on<=(now() AT TIME ZONE s.timezone)::date AND (a.ends_on IS NULL OR a.ends_on>(now() AT TIME ZONE s.timezone)::date)
    AND EXISTS(SELECT 1 FROM app.role_permissions p WHERE p.school_id=r.school_id AND p.role_id=r.id AND g.scope_type=ANY(p.allowed_scopes))) AS assignment_count
  FROM app.roles r)`,fields:{...meta,code:'code',label:'label',systemRole:'system_role',status:'status',permissions:'permissions',scopes:'scopes',memberCount:'member_count',assignmentCount:'assignment_count'},
  writeFields:[],search:['code','label'],filters:{status:'status'}};

export async function ownsHeldRole(tx:Transaction,schoolId:string,userId:string,roleId:string){
  return (await one<{held:boolean}>(tx,`SELECT EXISTS(SELECT 1 FROM app.role_grants g JOIN app.memberships m ON m.school_id=g.school_id AND m.id=g.member_id
    WHERE g.school_id=$1 AND g.role_id=$3 AND m.user_id=$2 AND g.revoked_at IS NULL AND (g.valid_until IS NULL OR g.valid_until>now())) AS held`,[schoolId,userId,roleId]))!.held;
}

export async function roleDetails(tx:Transaction,c:RequestContext,policy:Permissions){
  if(Object.keys(c.query).length)validation('query','Chi tiết mẫu quyền không nhận bộ lọc');
  const schoolId=c.params.schoolId!,roleId=c.params.roleId!,role=dto(roleSummaryResource,await getResource(tx,roleSummaryResource,schoolId,roleId));
  const grants=await policy.grants(tx,c.principal!.userId,schoolId),can=(action:string)=>grants.some(g=>g.scope_type==='SCHOOL'&&g.actions.includes(action));
  const ownRole=await ownsHeldRole(tx,schoolId,c.principal!.userId,roleId),canEdit=can('role.manage')&&!ownRole&&!role.systemRole&&role.status==='ACTIVE';
  const members=can('member.read')?(await tx.query<Row>(`SELECT g.id,g.member_id,m.work_display_name,g.scope_type,g.class_id,g.subject_id,g.valid_from,g.valid_until
    FROM app.role_grants g JOIN app.memberships m ON m.school_id=g.school_id AND m.id=g.member_id
    WHERE g.school_id=$1 AND g.role_id=$2 AND g.revoked_at IS NULL AND (g.valid_until IS NULL OR g.valid_until>now())
    ORDER BY m.work_display_name COLLATE app.vi_names,g.id LIMIT 2001`,[schoolId,roleId])).rows:null;
  if(members&&members.length>2000)throw new Problem(422,'ROLE_HOLDER_LIMIT');
  const history=can('audit.read')?(await tx.query<Row>(`SELECT e.*,coalesce(m.work_display_name,u.display_name,e.actor_kind) AS actor_label
    FROM app.audit_events e LEFT JOIN app.memberships m ON m.school_id=e.school_id AND m.user_id=e.actor_user_id
    LEFT JOIN identity.users u ON u.id=e.actor_user_id WHERE e.school_id=$1 AND e.target_type='role' AND e.target_id=$2
    ORDER BY e.created_at DESC,e.id DESC LIMIT 2001`,[schoolId,roleId])).rows:null;
  if(history&&history.length>2000)throw new Problem(422,'ROLE_HISTORY_LIMIT');
  return {role,canEdit,ownRole,systemRole:role.systemRole,canViewMembers:members!==null,canViewHistory:history!==null,
    actions:permissions.filter(action=>!action.startsWith('platform.')).map(action=>({action,canGrant:can(action)})),
    members:members?.map(m=>({grantId:m.id,memberId:m.member_id,name:m.work_display_name,scopeType:m.scope_type,classId:m.class_id,subjectId:m.subject_id,
      validFrom:iso(m.valid_from as Date),validUntil:m.valid_until?iso(m.valid_until as Date):null}))??null,
    history:history?.map(row=>auditView(dto(auditResource,row)))??null};
}

/** A live role edit must not extend newly effective actions beyond the editor's ceiling. */
export async function validateLiveRoleExpiry(tx:Transaction,c:RequestContext,policy:Permissions,previous:{action:string;scopes:string[]}[],next:{action:string;scopes:string[]}[]){
  const schoolId=c.params.schoolId!,grants=await policy.grants(tx,c.principal!.userId,schoolId);
  for(const p of next){
    const old=previous.find(v=>v.action===p.action),added=p.scopes.filter(scope=>!old?.scopes.includes(scope));if(!added.length)continue;
    const exposure=(await one<{unbounded:boolean|null;until:Date|null}>(tx,`SELECT bool_or(valid_until IS NULL) AS unbounded,max(valid_until) AS until FROM app.role_grants WHERE school_id=$1 AND role_id=$2
      AND scope_type=ANY($3::text[]) AND revoked_at IS NULL AND (valid_until IS NULL OR valid_until>now())`,[schoolId,c.params.roleId,added]))!;
    const ceiling=grants.filter(g=>g.scope_type==='SCHOOL'&&g.actions.includes(p.action));
    if((exposure.unbounded||exposure.until)&&!ceiling.some(g=>g.valid_until===null||!exposure.unbounded&&exposure.until!==null&&g.valid_until>=exposure.until))throw new Problem(403,'DELEGATION_EXPIRY_CEILING');
  }
}
