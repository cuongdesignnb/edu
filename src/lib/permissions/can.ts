import type { ActionKey, Assignment, DemoDB, ID, Membership } from "@/lib/model/types";
import { ACTION_LABELS } from "./actions";

/**
 * Permission evaluation for the DEMO only. It drives menus/buttons AND the mock
 * repository guards so that UI and adapter agree. It is not a security boundary:
 * everything runs in the browser.
 *
 * Grant = action × school × class/subject scope × validity window.
 * Grants from different classes are NEVER merged into a school-wide permission.
 */

export type Actor =
  | { kind: "platform"; userId: ID }
  | { kind: "staff"; userId: ID }
  | { kind: "anonymous" };

export interface Scope {
  schoolId: ID;
  classId?: ID;
  subjectId?: ID;
  /** yyyy-MM-dd; defaults to demo today */
  date?: string;
}

export function activeMembership(db: DemoDB, userId: ID, schoolId: ID): Membership | undefined {
  return db.memberships.find((m) => m.userId === userId && m.schoolId === schoolId && m.status === "active");
}

export function isAssignmentLive(a: Assignment, date: string): boolean {
  return a.status === "active" && a.validFrom <= date && (!a.validTo || a.validTo >= date);
}

export function liveAssignments(db: DemoDB, membershipId: ID, date: string): Assignment[] {
  return db.assignments.filter((a) => a.membershipId === membershipId && isAssignmentLive(a, date));
}

export function schoolActions(db: DemoDB, membership: Membership): Set<ActionKey> {
  const set = new Set<ActionKey>();
  for (const rid of membership.roleTemplateIds) {
    const t = db.roleTemplates.find((r) => r.id === rid && r.schoolId === membership.schoolId);
    t?.actions.forEach((a) => set.add(a));
  }
  return set;
}

export type DenyReason = "not_member" | "school_inactive" | "no_grant" | "anonymous" | "platform_scope";

export interface Decision { allowed: boolean; reason?: DenyReason; via?: "role" | "assignment" }

export function decide(db: DemoDB, actor: Actor, action: ActionKey, scope: Scope, today: string): Decision {
  if (actor.kind === "anonymous") return { allowed: false, reason: "anonymous" };
  // Platform operators have no default access to school/student data.
  if (actor.kind === "platform") return { allowed: false, reason: "platform_scope" };
  const school = db.schools.find((s) => s.id === scope.schoolId);
  if (!school || school.status !== "active") return { allowed: false, reason: "school_inactive" };
  const m = activeMembership(db, actor.userId, scope.schoolId);
  if (!m) return { allowed: false, reason: "not_member" };
  const date = scope.date ?? today;
  const level = ACTION_LABELS[action].level;

  const roleSet = schoolActions(db, m);
  if (roleSet.has(action)) {
    if (level === "school") return { allowed: true, via: "role" };
    // class-level oversight granted by a school role applies to classes of THIS school only
    if (!scope.classId || db.classes.some((c) => c.id === scope.classId && c.schoolId === scope.schoolId)) {
      return { allowed: true, via: "role" };
    }
  }
  if (level === "class" && scope.classId) {
    const ok = liveAssignments(db, m.id, date).some(
      (a) =>
        a.classId === scope.classId &&
        a.actions.includes(action) &&
        (!scope.subjectId || a.kind === "homeroom" || a.subjectId === scope.subjectId),
    );
    if (ok) return { allowed: true, via: "assignment" };
  }
  return { allowed: false, reason: "no_grant" };
}

export function can(db: DemoDB, actor: Actor, action: ActionKey, scope: Scope, today: string): boolean {
  return decide(db, actor, action, scope, today).allowed;
}

/** All class-level actions the actor holds in one class (for tabs/buttons). */
export function classActions(db: DemoDB, actor: Actor, schoolId: ID, classId: ID, today: string): Set<ActionKey> {
  const out = new Set<ActionKey>();
  (Object.keys(ACTION_LABELS) as ActionKey[]).forEach((a) => {
    if (ACTION_LABELS[a].level === "class" && can(db, actor, a, { schoolId, classId }, today)) out.add(a);
  });
  return out;
}

export function schoolLevelActions(db: DemoDB, actor: Actor, schoolId: ID, today: string): Set<ActionKey> {
  const out = new Set<ActionKey>();
  (Object.keys(ACTION_LABELS) as ActionKey[]).forEach((a) => {
    if (ACTION_LABELS[a].level === "school" && can(db, actor, a, { schoolId }, today)) out.add(a);
  });
  return out;
}

/** Does the staff member have a school-management workspace (any school role)? */
export function hasSchoolWorkspace(db: DemoDB, userId: ID, schoolId: ID): boolean {
  const m = activeMembership(db, userId, schoolId);
  return !!m && m.roleTemplateIds.length > 0;
}

export function hasTeacherWorkspace(db: DemoDB, userId: ID, schoolId: ID, today: string): boolean {
  const m = activeMembership(db, userId, schoolId);
  return !!m && liveAssignments(db, m.id, today).length > 0;
}
