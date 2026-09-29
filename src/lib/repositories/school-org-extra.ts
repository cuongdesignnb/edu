/**
 * Extra read models for the school-org group (SC01–SC15). Follows the core.ts pattern:
 * read() + requireAction(); nothing here writes. Imported directly (not via index.ts).
 */
import type { ID } from "@/lib/model/types";
import { read, requireAction, allowed, type Ctx } from "./core";
import { staffNameById } from "./selectors";

const STAFF_ENTITIES = new Set(["membership", "invitation", "assignment", "role"]);

export const schoolOrgRepo = {
  /** Recent staff/permission changes of THIS school (SC10 "Nhật ký thay đổi gần đây", SC15 history). */
  async staffActivity(ctx: Ctx, schoolId: ID, opts: { limit?: number; action?: string } = {}) {
    return read((db) => {
      requireAction(db, ctx, "staff.view", { schoolId });
      const rows = db.audit
        .filter((e) => e.schoolId === schoolId && e.level === "school" && STAFF_ENTITIES.has(e.entityType) && (!opts.action || e.action === opts.action))
        .sort((a, b) => b.at.localeCompare(a.at));
      return {
        total: rows.length,
        items: rows.slice(0, opts.limit ?? 5).map((e) => ({ id: e.id, at: e.at, action: e.action, entityType: e.entityType, entityId: e.entityId, entityLabel: e.entityLabel, reason: e.reason, before: e.before, after: e.after, actorName: staffNameById(db, e.actorId) })),
        canViewAudit: allowed(db, ctx, "audit.view", { schoolId }),
      };
    });
  },

  /** Classes of a year with their live homeroom (SC15 step 1). */
  async handoverClasses(ctx: Ctx, schoolId: ID, yearId: ID) {
    return read((db) => {
      requireAction(db, ctx, "assignment.manage", { schoolId });
      return db.classes
        .filter((c) => c.schoolId === schoolId && c.yearId === yearId && c.status !== "archived")
        .sort((a, b) => a.name.localeCompare(b.name, "vi"))
        .map((c) => {
          const hr = db.assignments.find((a) => a.classId === c.id && a.kind === "homeroom" && a.status === "active" && a.validFrom <= ctx.today && (!a.validTo || a.validTo >= ctx.today));
          const m = hr ? db.memberships.find((x) => x.id === hr.membershipId) : undefined;
          return { id: c.id, name: c.name, status: c.status, homeroomMembershipId: m?.id, homeroomName: m ? staffNameById(db, m.userId) : undefined };
        });
    });
  },
};
