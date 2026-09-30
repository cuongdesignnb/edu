import { Injectable } from '@nestjs/common';
import { Database, iso, type Transaction } from '../database/database';
import { Problem } from './problem';
import { csrfFor } from './security';
import { userDto, type Principal } from '../modules/identity/identity.service';

export interface Scope {
  schoolId: string; classId?: string; subjectId?: string; yearId?: string;
  date?: string; allowSubject?: boolean; allowScopedContext?: boolean;
}
export interface Grant {
  id: string; version: number; role_id: string; role_code: string; label: string; scope_type: string;
  class_id: string | null; subject_id: string | null; valid_from: Date; valid_until: Date | null;
  actions: string[]; assignment_id: string | null; starts_on: string | null; ends_on: string | null;
}
const scopedContext = new Set(['school.read', 'year.read', 'teacher.self']);
export function grantAllows(grant: Grant, action: string, scope: Scope, today: string) {
  if (!grant.actions.includes(action)) return false;
  if (grant.scope_type === 'SCHOOL') return true;
  // Default teacher grants are inseparable from their assignment. A deliberately
  // delegated custom CLASS role is usable within its own grant validity without
  // inventing a teaching assignment. Request handlers still restrict SUBJECT DTOs.
  if (['HOMEROOM','SUBJECT_TEACHER'].includes(grant.role_code)) {
    if (!grant.assignment_id || !grant.starts_on || grant.starts_on > today || (grant.ends_on && grant.ends_on <= today)) return false;
    if (scope.date && (scope.date < grant.starts_on || (grant.ends_on && scope.date >= grant.ends_on))) return false;
  }
  if (!scope.classId) return !!scope.allowScopedContext && scopedContext.has(action);
  if (grant.class_id !== scope.classId) return false;
  if (grant.scope_type === 'CLASS') return true;
  if (grant.scope_type !== 'SUBJECT' || !scope.allowSubject) return false;
  return !scope.subjectId || grant.subject_id === scope.subjectId;
}
export function grantDto(grant: Grant) {
  return { id: grant.id, version: grant.version, roleId: grant.role_id, roleLabel: grant.label,
    actions: grant.actions, scopeType: grant.scope_type,
    ...(grant.class_id ? { classId: grant.class_id } : {}), ...(grant.subject_id ? { subjectId: grant.subject_id } : {}),
    validFrom: iso(grant.valid_from), validUntil: grant.valid_until ? iso(grant.valid_until) : null };
}

@Injectable()
export class Permissions {
  constructor(private readonly db: Database) {}
  async grants(tx: Transaction, userId: string, schoolId: string): Promise<Grant[]> {
    return (await tx.query<Grant>(`SELECT g.id,g.version,g.role_id,r.code AS role_code,r.label,g.scope_type,g.class_id,g.subject_id,g.valid_from,g.valid_until,
      array_agg(DISTINCT p.action_code) AS actions, a.id AS assignment_id,a.starts_on,a.ends_on
      FROM app.memberships m JOIN app.role_grants g ON g.school_id=m.school_id AND g.member_id=m.id
      JOIN app.roles r ON r.school_id=g.school_id AND r.id=g.role_id AND r.status='ACTIVE'
      JOIN app.role_permissions p ON p.school_id=r.school_id AND p.role_id=r.id AND g.scope_type=ANY(p.allowed_scopes)
      LEFT JOIN app.teaching_assignments a ON a.school_id=g.school_id AND a.role_grant_id=g.id AND a.revoked_at IS NULL
      WHERE m.user_id=$1 AND m.school_id=$2 AND m.status='ACTIVE' AND m.ended_at IS NULL
      AND g.revoked_at IS NULL AND g.valid_from<=now() AND (g.valid_until IS NULL OR g.valid_until>now())
      GROUP BY g.id,r.code,r.label,a.id`, [userId,schoolId])).rows;
  }
  async require(tx: Transaction, principal: Principal, actions: string, scope: Scope) {
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
  async platform(principal: Principal, action: string) {
    const row = (await this.db.app.query(`SELECT id FROM platform.operator_grants
      WHERE user_id=$1 AND action_code=$2 AND revoked_at IS NULL AND valid_from<=now()
      AND (valid_until IS NULL OR valid_until>now())`, [principal.userId,action])).rows[0];
    if (!row) throw new Problem(403, 'FORBIDDEN');
  }
  async collection(tx:Transaction,principal:Principal,action:string,schoolId:string,allowSubject=false) {
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
    const memberships = await this.db.transaction(async tx => (await tx.query<{ school_id: string; school_name: string; id: string; status: string }>(
      `SELECT m.school_id,s.name AS school_name,m.id,m.status FROM app.memberships m
        JOIN platform.schools s ON s.id=m.school_id WHERE m.user_id=$1 ORDER BY s.name,s.id`, [principal.userId])).rows,
    { userId: principal.userId });
    const contexts = [];
    for (const membership of memberships) {
      const grants = await this.db.transaction(tx => this.grants(tx,principal.userId,membership.school_id), { schoolId: membership.school_id });
      contexts.push({ schoolId: membership.school_id, schoolName: membership.school_name,
        memberId: membership.id, status: membership.status, grants: grants.map(grantDto) });
    }
    const platformActions = (await this.db.app.query<{ action_code: string }>(`SELECT DISTINCT action_code FROM platform.operator_grants
      WHERE user_id=$1 AND revoked_at IS NULL AND valid_from<=now() AND (valid_until IS NULL OR valid_until>now()) ORDER BY action_code`, [principal.userId])).rows.map(row => row.action_code);
    return { user: userDto(principal.user), memberships: contexts, platformActions,
      csrfToken: csrfFor(principal.sessionId,principal.tokenHash), mode: 'connected' };
  }
}
