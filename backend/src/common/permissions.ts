import { Injectable } from '@nestjs/common';
import { Database, iso, type Transaction } from '../database/database';
import { Problem } from './problem';
import { csrfFor } from './security';
import { userDto, type Principal } from '../modules/identity/identity.service';
import { currentSupportRead,supportReadOperations,type SupportReadContext } from './support-context';
import type { Operation } from './contract';

export interface Scope {
  schoolId: string; classId?: string; subjectId?: string; yearId?: string;
  date?: string; allowSubject?: boolean; allowScopedContext?: boolean;
}
export interface Grant {
  id: string; version: number; role_id: string; role_code: string; label: string; scope_type: string;
  class_id: string | null; subject_id: string | null; valid_from: Date; valid_until: Date | null;
  actions: string[]; assignment_id: string | null; assignment_kind?: string; starts_on: string | null; ends_on: string | null;
}
const scopedContext = new Set(['school.read', 'year.read', 'teacher.self']);
export function grantAllows(grant: Grant, action: string, scope: Scope, today: string) {
  if (!grant.actions.includes(action)) return false;
  // Every assignment-linked grant, including a custom profile, follows its dates. A deliberately
  // delegated custom CLASS role is usable within its own grant validity without
  // inventing a teaching assignment. Request handlers still restrict SUBJECT DTOs.
  if (grant.assignment_id || ['HOMEROOM','SUBJECT_TEACHER'].includes(grant.role_code)) {
    if (!grant.assignment_id || !grant.starts_on || grant.starts_on > today || (grant.ends_on && grant.ends_on <= today)) return false;
    if (scope.date && (scope.date < grant.starts_on || (grant.ends_on && scope.date >= grant.ends_on))) return false;
  }
  if (grant.scope_type === 'SCHOOL') return true;
  if (!scope.classId) return !!scope.allowScopedContext && scopedContext.has(action);
  if (grant.class_id !== scope.classId) return false;
  if (grant.scope_type === 'CLASS') return true;
  if (grant.scope_type !== 'SUBJECT' || !scope.allowSubject) return false;
  return !scope.subjectId || grant.subject_id === scope.subjectId;
}
export function grantDto(grant: Grant) {
  return { id: grant.id, version: grant.version, roleId: grant.role_id, roleLabel: grant.label,roleCode:grant.role_code,
    actions: grant.actions, scopeType: grant.scope_type,
    ...(grant.class_id ? { classId: grant.class_id } : {}), ...(grant.subject_id ? { subjectId: grant.subject_id } : {}),
    ...(grant.assignment_id?{assignmentId:grant.assignment_id}:{}),validFrom: iso(grant.valid_from), validUntil: grant.valid_until ? iso(grant.valid_until) : null,
    ...(grant.assignment_id?{assignmentStartsOn:grant.starts_on,assignmentEndsOn:grant.ends_on}:{}) };
}
export function coversDelegatedExpiry(grant:Pick<Grant,'valid_until'>,from:Date,until:Date|null){
  return !grant.valid_until||(from<grant.valid_until&&!!until&&until<=grant.valid_until);
}

@Injectable()
export class Permissions {
  constructor(private readonly db: Database) {}
  private async selectedSupport(tx:Transaction,selected:SupportReadContext):Promise<Grant>{
    const row=(await tx.query<{id:string;class_id:string|null;allowed_actions:string[];valid_from:Date;valid_until:Date}>(`SELECT g.id,g.class_id,g.allowed_actions,g.valid_from,g.valid_until FROM platform.support_access g
      JOIN platform.schools s ON s.id=g.school_id AND s.status<>'ARCHIVED' JOIN identity.users u ON u.id=g.operator_id AND u.status='ACTIVE'
      WHERE g.id=$1 AND g.school_id=$2 AND g.operator_id=$3 AND g.status='APPROVED' AND g.approved_by_user_id IS NOT NULL AND g.approved_by_user_id<>g.operator_id
      AND g.revoked_at IS NULL AND g.valid_from<=now() AND g.valid_until>now() AND EXISTS(SELECT 1 FROM platform.operator_grants op WHERE op.user_id=g.operator_id AND op.action_code='platform.support' AND op.revoked_at IS NULL AND op.valid_from<=now() AND (op.valid_until IS NULL OR op.valid_until>now()))`,[selected.grantId,selected.schoolId,selected.operatorId])).rows[0];
    if(!row)throw new Problem(404,'RESOURCE_NOT_FOUND');
    return {id:row.id,version:1,role_id:row.id,role_code:'SUPPORT_READ',label:'Hỗ trợ chỉ đọc đã được trường duyệt',scope_type:row.class_id?'CLASS':'SCHOOL',class_id:row.class_id,subject_id:null,valid_from:row.valid_from,valid_until:row.valid_until,actions:row.allowed_actions,assignment_id:null,starts_on:null,ends_on:null};
  }
  async resolveSupport(principal:Principal,operation:Operation,params:Record<string,string>,query:Record<string,string>,header:unknown):Promise<SupportReadContext>{
    if(operation.method!=='GET'||operation.auth!=='staff'||!params.schoolId||typeof header!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(header))throw new Problem(403,'SUPPORT_READ_ONLY');
    const selected:SupportReadContext={grantId:header,operatorId:principal.userId,schoolId:params.schoolId,classId:null,allowedActions:[]};
    return this.db.transaction(async tx=>{const grant=await this.selectedSupport(tx,selected);if(!Object.entries(supportReadOperations).some(([action,ids])=>grant.actions.includes(action)&&ids.includes(operation.id)))throw new Problem(403,'SUPPORT_ACTION_DENIED');
      if(grant.class_id&&(params.classId&&params.classId!==grant.class_id||query.classId&&query.classId!==grant.class_id))throw new Problem(404,'RESOURCE_NOT_FOUND');return {...selected,classId:grant.class_id,allowedActions:grant.actions};
    },{schoolId:params.schoolId,userId:principal.userId,readOnly:true});
  }
  async auditSupportRead(selected:SupportReadContext,operationId:string,requestId:string,status:number){
    await this.db.transaction(async tx=>{await tx.query(`INSERT INTO app.audit_events(school_id,actor_user_id,actor_kind,action,target_type,target_id,request_id,redacted_after,support_access_id)
      VALUES($1,$2,'SUPPORT',$3,'support-access',$4,$5,$6,$4)`,[selected.schoolId,selected.operatorId,operationId,selected.grantId,requestId,{status}]);},{schoolId:selected.schoolId,userId:selected.operatorId});
  }
  async grants(tx: Transaction, userId: string, schoolId: string): Promise<Grant[]> {
    return (await tx.query<Grant>(`SELECT g.id,g.version,g.role_id,r.code AS role_code,r.label,g.scope_type,g.class_id,g.subject_id,g.valid_from,g.valid_until,
      array_agg(DISTINCT p.action_code) AS actions, a.id AS assignment_id,a.kind AS assignment_kind,a.starts_on,a.ends_on
      FROM app.memberships m JOIN identity.users u ON u.id=m.user_id AND u.status='ACTIVE'
      JOIN app.role_grants g ON g.school_id=m.school_id AND g.member_id=m.id
      JOIN platform.schools config ON config.id=m.school_id
      JOIN app.roles r ON r.school_id=g.school_id AND r.id=g.role_id AND r.status='ACTIVE'
      JOIN app.role_permissions p ON p.school_id=r.school_id AND p.role_id=r.id AND g.scope_type=ANY(p.allowed_scopes)
      LEFT JOIN app.teaching_assignments a ON a.school_id=g.school_id AND a.role_grant_id=g.id
      WHERE m.user_id=$1 AND m.school_id=$2 AND m.status='ACTIVE' AND m.ended_at IS NULL
      AND a.revoked_at IS NULL AND g.revoked_at IS NULL AND g.valid_from<=now() AND (g.valid_until IS NULL OR g.valid_until>now())
      AND NOT(coalesce(a.kind='HOMEROOM',false) AND coalesce(config.settings->>'homeroomMayPublish','true')='false' AND p.action_code LIKE '%.publish')
      GROUP BY g.id,r.code,r.label,a.id`, [userId,schoolId])).rows;
  }
  async require(tx: Transaction, principal: Pick<Principal,'userId'>, actions: string, scope: Scope) {
    const support=(principal as Pick<Principal,'userId'|'support'>).support??currentSupportRead();
    if(support){if(principal.userId!==support.operatorId||scope.schoolId!==support.schoolId)throw new Problem(404,'RESOURCE_NOT_FOUND');const grant=await this.selectedSupport(tx,support),today=(await tx.query<{today:string}>("SELECT to_char(now() AT TIME ZONE timezone,'YYYY-MM-DD') AS today FROM platform.schools WHERE id=$1",[scope.schoolId])).rows[0]!.today;
      if(!actions.split('+').every(a=>grantAllows(grant,a,scope,today)))throw new Problem(scope.classId?404:403,scope.classId?'RESOURCE_NOT_FOUND':'FORBIDDEN');return {grants:[grant],today};}
    const school = (await tx.query<{ status: string; timezone: string }>('SELECT status,timezone FROM platform.schools WHERE id=$1', [scope.schoolId])).rows[0];
    const member = (await tx.query('SELECT id FROM app.memberships WHERE school_id=$1 AND user_id=$2 AND status=$3 AND ended_at IS NULL', [scope.schoolId,principal.userId,'ACTIVE'])).rows[0];
    if (!school || !member) throw new Problem(404, 'RESOURCE_NOT_FOUND');
    if (school.status !== 'ACTIVE') throw new Problem(403, 'SCHOOL_SUSPENDED');
    if (scope.classId) {
      const cls = (await tx.query<{ year_id: string }>('SELECT year_id FROM app.classes WHERE school_id=$1 AND id=$2', [scope.schoolId,scope.classId])).rows[0];
      if (!cls || (scope.yearId && cls.year_id !== scope.yearId)) throw new Problem(404, 'RESOURCE_NOT_FOUND');
    }
    const today = (await tx.query<{ today: string }>("SELECT to_char(now() AT TIME ZONE $1,'YYYY-MM-DD') AS today", [school.timezone])).rows[0]!.today;
    const grants = await this.grants(tx, principal.userId, scope.schoolId);
    if (!actions.split('+').every(action => grants.some(grant => grantAllows(grant,action,scope,today)))) {
      throw new Problem(scope.classId ? 404 : 403, scope.classId ? 'RESOURCE_NOT_FOUND' : 'FORBIDDEN');
    }
    return { grants, today };
  }
  async platform(principal: Pick<Principal,'userId'>, action: string,tx?:Transaction) {
    const row = (await (tx??this.db.app).query(`SELECT id FROM platform.operator_grants
      WHERE user_id=$1 AND action_code=$2 AND revoked_at IS NULL AND valid_from<=now()
      AND (valid_until IS NULL OR valid_until>now())`, [principal.userId,action])).rows[0];
    if (!row) throw new Problem(403, 'FORBIDDEN');
  }
  async collection(tx:Transaction,principal:Pick<Principal,'userId'>,action:string,schoolId:string,allowSubject=false) {
    const support=(principal as Pick<Principal,'userId'|'support'>).support??currentSupportRead();
    if(support){if(principal.userId!==support.operatorId||schoolId!==support.schoolId)throw new Problem(404,'RESOURCE_NOT_FOUND');const grant=await this.selectedSupport(tx,support);if(!grant.actions.includes(action))throw new Problem(403,'FORBIDDEN');const today=(await tx.query<{today:string}>("SELECT to_char(now() AT TIME ZONE timezone,'YYYY-MM-DD') AS today FROM platform.schools WHERE id=$1",[schoolId])).rows[0]!.today;return {all:grant.scope_type==='SCHOOL',classIds:grant.class_id?[grant.class_id]:[],grants:[grant],today};}
    const membership=(await tx.query(`SELECT m.id FROM app.memberships m JOIN platform.schools s ON s.id=m.school_id
      WHERE m.school_id=$1 AND m.user_id=$2 AND m.status='ACTIVE' AND m.ended_at IS NULL AND s.status='ACTIVE'`,
    [schoolId,principal.userId])).rows[0];
    if(!membership)throw new Problem(404,'RESOURCE_NOT_FOUND');
    const today=(await tx.query<{today:string}>(`SELECT to_char(now() AT TIME ZONE timezone,'YYYY-MM-DD') AS today FROM platform.schools WHERE id=$1`,[schoolId])).rows[0]!.today;
    const grants=await this.grants(tx,principal.userId,schoolId);
    if(grants.some(grant=>grant.scope_type==='SCHOOL'&&grant.actions.includes(action)))return {all:true,classIds:[] as string[],grants,today};
    const classIds=[...new Set(grants.filter(grant=>grant.class_id&&grantAllows(grant,action,
      {schoolId,classId:grant.class_id,allowSubject},today)).map(grant=>grant.class_id!))];
    if(!classIds.length)throw new Problem(403,'FORBIDDEN');
    return {all:false,classIds,grants,today};
  }
  async context(principal: Principal) {
    const memberships = await this.db.transaction(async tx => (await tx.query<{ school_id: string; school_name: string; id: string; status: string; slug:string; short_name:string|null; school_status:string; department:string|null; timezone:string; today:string }>(
      `SELECT m.school_id,s.name AS school_name,m.id,m.status,s.slug,s.short_name,s.status AS school_status,m.department,s.timezone,to_char(now() AT TIME ZONE s.timezone,'YYYY-MM-DD') AS today FROM app.memberships m
        JOIN platform.schools s ON s.id=m.school_id WHERE m.user_id=$1 ORDER BY s.name,s.id`, [principal.userId])).rows,
    { userId: principal.userId });
    const contexts = [];
    for (const membership of memberships) {
      const {grants,duties}=await this.db.transaction(async tx=>{
        const raw=await this.grants(tx,principal.userId,membership.school_id);
        const grants=membership.school_status==='ACTIVE'?raw.filter(g=>!(g.assignment_id||['HOMEROOM','SUBJECT_TEACHER'].includes(g.role_code))||!!g.class_id&&g.actions.some(action=>grantAllows(g,action,{schoolId:membership.school_id,classId:g.class_id!,allowSubject:true},membership.today))):[];
        const ids=grants.filter(g=>g.assignment_id).map(g=>g.assignment_id!);
        const duties=ids.length?(await tx.query<{id:string;class_id:string;class_name:string;subject_id:string|null;subject_name:string|null;kind:string;starts_on:string;ends_on:string|null}>(`SELECT a.id,a.class_id,c.name AS class_name,a.subject_id,s.name AS subject_name,a.kind,a.starts_on,a.ends_on
          FROM app.teaching_assignments a JOIN app.classes c ON c.school_id=a.school_id AND c.id=a.class_id
          LEFT JOIN app.subjects s ON s.school_id=a.school_id AND s.id=a.subject_id WHERE a.school_id=$1 AND a.member_id=$2 AND a.id=ANY($3::uuid[]) AND a.revoked_at IS NULL ORDER BY c.name,a.kind,a.id`,[membership.school_id,membership.id,ids])).rows:[];
        return {grants,duties};
      }, { schoolId: membership.school_id,userId:principal.userId,readOnly:true });
      contexts.push({ schoolId: membership.school_id, schoolName: membership.school_name,
        schoolSlug:membership.slug,schoolShortName:membership.short_name??membership.school_name,schoolStatus:membership.school_status,department:membership.department??'',timezone:membership.timezone,today:membership.today,
        memberId: membership.id, status: membership.status, grants: grants.map(grantDto),
        duties:duties.map(d=>({id:d.id,classId:d.class_id,className:d.class_name,subjectId:d.subject_id,subjectName:d.subject_name,kind:d.kind,startsOn:d.starts_on,endsOn:d.ends_on})),
        schoolWorkspace:grants.some(g=>g.scope_type==='SCHOOL'),teacherWorkspace:grants.some(g=>g.class_id&&g.actions.includes('teacher.self')) });
    }
    const platformActions = (await this.db.app.query<{ action_code: string }>(`SELECT DISTINCT action_code FROM platform.operator_grants
      WHERE user_id=$1 AND revoked_at IS NULL AND valid_from<=now() AND (valid_until IS NULL OR valid_until>now()) ORDER BY action_code`, [principal.userId])).rows.map(row => row.action_code);
    return { user: userDto(principal.user), memberships: contexts, platformActions,
      csrfToken: csrfFor(principal.sessionId,principal.tokenHash), mode: 'connected', serverNow:new Date().toISOString() };
  }
}
