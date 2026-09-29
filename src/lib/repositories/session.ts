import type { ID, Invitation, School, StaffNotification, StaffUser } from "@/lib/model/types";
import { hasSchoolWorkspace, hasTeacherWorkspace, schoolLevelActions, liveAssignments } from "@/lib/permissions/can";
import { newId } from "@/lib/demo/ids";
import { RepoError } from "./errors";
import { audit, findOr404, read, requireStaff, validation, write, type Ctx } from "./core";
import { className, staffName, subjectName } from "./selectors";

export interface Workspace {
  school: Pick<School, "id" | "name" | "shortName" | "slug" | "status">;
  membershipId: ID;
  membershipStatus: string;
  department: string;
  roleNames: string[];
  duties: string[];
  schoolWorkspace: boolean;
  teacherWorkspace: boolean;
}

export interface Me {
  user: StaffUser;
  isPlatform: boolean;
  workspaces: Workspace[];
}

export const sessionRepo = {
  /** Demo login: matches an email in the fixture. Password is never stored or checked for real. */
  async demoLogin(email: string, password: string): Promise<{ userId: ID; isPlatform: boolean }> {
    return read((db) => {
      const e = email.trim().toLowerCase();
      if (!e || !password) validation({ ...(e ? {} : { email: "Vui lòng nhập email công việc" }), ...(password ? {} : { password: "Vui lòng nhập mật khẩu" }) });
      const u = db.users.find((x) => x.email.toLowerCase() === e);
      if (!u) throw new RepoError("VALIDATION", "Email hoặc mật khẩu không đúng (mô phỏng). Tài khoản nhân sự do nhà trường mời, không đăng ký tự do.");
      return { userId: u.id, isPlatform: !!u.isPlatformOperator };
    });
  },

  async me(ctx: Ctx): Promise<Me> {
    return read((db) => {
      if (ctx.actor.kind === "anonymous") throw new RepoError("NO_SESSION");
      const user = findOr404(db.users.find((u) => u.id === (ctx.actor as { userId: string }).userId), "người dùng");
      const workspaces: Workspace[] = db.memberships
        .filter((m) => m.userId === user.id)
        .map((m) => {
          const school = db.schools.find((s) => s.id === m.schoolId)!;
          const roleNames = m.roleTemplateIds.map((r) => db.roleTemplates.find((t) => t.id === r)?.name ?? "").filter(Boolean);
          const duties = liveAssignments(db, m.id, ctx.today).map((a) =>
            a.kind === "homeroom" ? `Chủ nhiệm ${className(db, a.classId)}` : `${subjectName(db, a.subjectId)} ${className(db, a.classId)}`,
          );
          return {
            school: { id: school.id, name: school.name, shortName: school.shortName, slug: school.slug, status: school.status },
            membershipId: m.id, membershipStatus: m.status, department: m.department, roleNames, duties,
            schoolWorkspace: m.status === "active" && hasSchoolWorkspace(db, user.id, school.id),
            teacherWorkspace: m.status === "active" && hasTeacherWorkspace(db, user.id, school.id, ctx.today),
          };
        });
      return { user, isPlatform: !!user.isPlatformOperator, workspaces };
    });
  },

  async schoolActions(ctx: Ctx, schoolId: ID) {
    return read((db) => [...schoolLevelActions(db, ctx.actor, schoolId, ctx.today)]);
  },

  async updateProfile(ctx: Ctx, patch: { fullName: string; workPhone: string; bio?: string; version: number }) {
    const uid = ctx.actor.kind === "anonymous" ? "" : ctx.actor.userId;
    return write((db) => {
      const u = findOr404(db.users.find((x) => x.id === uid), "người dùng");
      if (u.version !== patch.version) throw new RepoError("CONFLICT");
      const errors: Record<string, string> = {};
      if (patch.fullName.trim().length < 3) errors.fullName = "Họ tên tối thiểu 3 ký tự";
      if (!/^[0-9 *+().-]{8,20}$/.test(patch.workPhone.trim())) errors.workPhone = "Số liên hệ công việc chưa hợp lệ";
      if (Object.keys(errors).length) validation(errors);
      u.fullName = patch.fullName.trim();
      u.workPhone = patch.workPhone.trim();
      u.bio = patch.bio?.trim();
      u.version += 1;
      return u;
    });
  },

  /* ------------------------------ invitations ------------------------------ */
  async invitation(ctx: Ctx, inviteId: ID) {
    return read((db) => {
      const inv = findOr404(db.invitations.find((i) => i.id === inviteId), "lời mời");
      const school = db.schools.find((s) => s.id === inv.schoolId)!;
      const effective = effectiveInvitationStatus(inv, ctx.now);
      const inviter = db.users.find((u) => u.id === inv.invitedByUserId);
      const existing = inv.existingUserId ? db.users.find((u) => u.id === inv.existingUserId) : undefined;
      return { invitation: { ...inv, status: effective }, school: { id: school.id, name: school.name, status: school.status }, inviterName: staffName(inviter), existingUser: existing ? { id: existing.id, fullName: existing.fullName, email: existing.email } : undefined };
    });
  },

  async respondInvitation(ctx: Ctx, inviteId: ID, accept: boolean, fullName?: string) {
    return write((db) => {
      const inv = findOr404(db.invitations.find((i) => i.id === inviteId), "lời mời");
      const st = effectiveInvitationStatus(inv, ctx.now);
      if (st !== "pending") throw new RepoError(st === "expired" ? "EXPIRED" : "REVOKED", st === "accepted" ? "Lời mời này đã được chấp nhận trước đó." : undefined);
      const sch = db.schools.find((s) => s.id === inv.schoolId);
      if (accept && sch && sch.status !== "active" && sch.status !== "draft") throw new RepoError("SUSPENDED");
      if (!accept) { inv.status = "declined"; db.audit.push({ id: newId("au"), level: "school", schoolId: inv.schoolId, actorId: "anonymous", action: "Từ chối lời mời", entityType: "invitation", entityId: inv.id, entityLabel: inv.email, at: ctx.now }); return { userId: undefined as ID | undefined }; }
      let userId = inv.existingUserId;
      if (!userId) {
        const u: StaffUser = { id: newId("u"), fullName: (fullName ?? inv.fullName).trim(), email: inv.email, workPhone: "Chưa cập nhật", avatarTone: "blue", version: 1 };
        db.users.push(u);
        userId = u.id;
      }
      // Existing identity: only a NEW membership for this school is created; nothing at other schools changes.
      if (!db.memberships.some((m) => m.userId === userId && m.schoolId === inv.schoolId)) {
        db.memberships.push({ id: newId("m"), schoolId: inv.schoolId, userId, department: "Chưa phân tổ", roleTemplateIds: inv.roleTemplateIds, status: "active", joinedAt: ctx.today, staffCode: `GV${String(db.memberships.filter((m) => m.schoolId === inv.schoolId).length + 1).padStart(4, "0")}`, version: 1 });
      }
      inv.status = "accepted";
      audit(db, { ...ctx, actor: { kind: "staff", userId } }, { level: "school", schoolId: inv.schoolId, action: "Chấp nhận lời mời", entityType: "invitation", entityId: inv.id, entityLabel: inv.email });
      return { userId };
    });
  },

  /* ------------------------------ notifications ------------------------------ */
  async notifications(ctx: Ctx, opts: { unreadOnly?: boolean; schoolId?: ID } = {}): Promise<(StaffNotification & { schoolName: string; accessible: boolean })[]> {
    const uid = requireStaff(ctx);
    return read((db) =>
      db.notifications
        .filter((n) => n.userId === uid && (!opts.unreadOnly || !n.readAt) && (!opts.schoolId || n.schoolId === opts.schoolId))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((n) => {
          const m = db.memberships.find((x) => x.userId === uid && x.schoolId === n.schoolId);
          const school = db.schools.find((s) => s.id === n.schoolId);
          // A notification only links through while the membership AND the school are usable (Q16/NV-03).
          const accessible = n.kind === "system" || (!!m && m.status === "active" && school?.status === "active");
          return { ...n, schoolName: school?.shortName ?? "", accessible };
        }),
    );
  },

  async markNotificationsRead(ctx: Ctx, ids: ID[] | "all") {
    const uid = requireStaff(ctx);
    return write((db) => {
      let n = 0;
      for (const x of db.notifications) {
        if (x.userId === uid && !x.readAt && (ids === "all" || ids.includes(x.id))) { x.readAt = ctx.now; n++; }
      }
      return n;
    });
  },
};

export function effectiveInvitationStatus(inv: Invitation, now: string): Invitation["status"] {
  if (inv.status === "pending" && inv.expiresAt < now) return "expired";
  return inv.status;
}
