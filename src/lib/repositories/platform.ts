import type { ID, School, SchoolStatus, SupportGrant, SupportTicket, AuditEvent, PlatformSettings } from "@/lib/model/types";
import { matches } from "@/lib/formatters";
import { buildRoleTemplates } from "@/lib/permissions/actions";
import { addMinutesISO } from "@/lib/demo/clock";
import { newId } from "@/lib/demo/ids";
import { RepoError } from "./errors";
import { audit, findOr404, paginate, read, requirePlatform, validation, write, type Ctx, type ListQuery } from "./core";
import { staffName, staffNameById } from "./selectors";

/**
 * Platform operator scope: schools as operational units only. No student,
 * guardian, attendance or conduct data is returned by any function here.
 */
export interface SchoolRow {
  id: ID; name: string; shortName: string; slug: string; code: string; province: string; level: School["level"];
  status: SchoolStatus; adminNames: string[]; classCount: number; staffCount: number; createdAt: string; onboardingDone: number; onboardingTotal: number;
}

function schoolRow(db: import("@/lib/model/types").DemoDB, s: School): SchoolRow {
  const adminRoles = db.roleTemplates.filter((r) => r.schoolId === s.id && r.key === "school_admin").map((r) => r.id);
  const admins = db.memberships.filter((m) => m.schoolId === s.id && m.status === "active" && m.roleTemplateIds.some((r) => adminRoles.includes(r)));
  const year = db.years.find((y) => y.schoolId === s.id && y.status === "active");
  const steps = Object.values(s.onboarding);
  return {
    id: s.id, name: s.name, shortName: s.shortName, slug: s.slug, code: s.code, province: s.province, level: s.level, status: s.status,
    adminNames: admins.map((m) => staffNameById(db, m.userId, false)),
    classCount: db.classes.filter((c) => c.schoolId === s.id && (!year || c.yearId === year.id) && c.status !== "draft").length,
    staffCount: db.memberships.filter((m) => m.schoolId === s.id && m.status === "active").length,
    createdAt: s.createdAt, onboardingDone: steps.filter(Boolean).length, onboardingTotal: steps.length,
  };
}

export const platformRepo = {
  async overview(ctx: Ctx) {
    requirePlatform(ctx);
    return read((db) => {
      const rows = db.schools.map((s) => schoolRow(db, s));
      const since = addMinutesISO(ctx.now, -30 * 1440);
      return {
        totalSchools: rows.length,
        activeSchools: rows.filter((r) => r.status === "active").length,
        suspendedSchools: rows.filter((r) => r.status === "suspended").length,
        draftSchools: rows.filter((r) => r.status === "draft").length,
        activeStaff: rows.filter((r) => r.status === "active").reduce((a, r) => a + r.staffCount, 0),
        // Aggregate count only: no identities, no student data.
        linkOpens30d: db.parentAccessLogs.filter((l) => (l.event === "opened" || l.event === "viewed") && l.at >= since).length,
        openTickets: db.tickets.filter((t) => t.status !== "resolved").length,
        recent: db.audit.filter((a) => a.level === "platform").sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6).map((a) => ({ ...a, actorName: staffNameById(db, a.actorId, false) })),
      };
    });
  },

  async listSchools(ctx: Ctx, q: ListQuery) {
    requirePlatform(ctx);
    return read((db) => {
      const f = q.filters ?? {};
      const rows = db.schools.map((s) => schoolRow(db, s)).filter(
        (r) => matches(q.q ?? "", r.name, r.province, r.code, ...r.adminNames) && (!f.status || r.status === f.status) && (!f.province || r.province === f.province),
      );
      return { ...paginate(rows, q, {
        name: (a, b) => a.name.localeCompare(b.name, "vi"), classCount: (a, b) => a.classCount - b.classCount,
        staffCount: (a, b) => a.staffCount - b.staffCount, createdAt: (a, b) => a.createdAt.localeCompare(b.createdAt),
      }), provinces: [...new Set(db.schools.map((s) => s.province))].sort((a, b) => a.localeCompare(b, "vi")) };
    });
  },

  async school(ctx: Ctx, schoolId: ID) {
    requirePlatform(ctx);
    return read((db) => {
      const s = findOr404(db.schools.find((x) => x.id === schoolId), "trường");
      const adminRoleIds = db.roleTemplates.filter((r) => r.schoolId === s.id && r.key === "school_admin").map((r) => r.id);
      const admins = db.memberships.filter((m) => m.schoolId === s.id && m.roleTemplateIds.some((r) => adminRoleIds.includes(r))).map((m) => ({
        membershipId: m.id, userId: m.userId, name: staffNameById(db, m.userId, false), email: db.users.find((u) => u.id === m.userId)?.email ?? "", status: m.status, since: m.joinedAt,
      }));
      const invitations = db.invitations.filter((i) => i.schoolId === s.id && i.roleTemplateIds.some((r) => adminRoleIds.includes(r)));
      return {
        school: s, row: schoolRow(db, s), admins, invitations,
        history: db.audit.filter((a) => a.level === "platform" && a.entityId === s.id).sort((a, b) => b.at.localeCompare(a.at)),
        tickets: db.tickets.filter((t) => t.schoolId === s.id).length,
        activeGrants: db.supportGrants.filter((g) => g.schoolId === s.id && g.status === "active").length,
      };
    });
  },

  async createSchool(ctx: Ctx, input: { name: string; shortName: string; code: string; slug: string; level: School["level"]; province: string; address: string; publicEmail: string; publicPhone: string; adminName: string; adminEmail: string; asDraft: boolean }) {
    requirePlatform(ctx);
    return write((db) => {
      const errors: Record<string, string> = {};
      if (input.name.trim().length < 5) errors.name = "Tên trường tối thiểu 5 ký tự";
      if (!/^[A-Z0-9-]{3,16}$/.test(input.code)) errors.code = "Mã trường gồm chữ in hoa, số, gạch nối (3–16 ký tự)";
      if (db.schools.some((s) => s.code === input.code)) errors.code = "Mã trường đã tồn tại";
      if (!/^[a-z0-9-]{3,40}$/.test(input.slug)) errors.slug = "Đường dẫn chỉ gồm chữ thường không dấu, số, gạch nối";
      if (db.schools.some((s) => s.slug === input.slug)) errors.slug = "Đường dẫn đã được dùng";
      if (!input.asDraft && !/^\S+@\S+\.\S+$/.test(input.adminEmail)) errors.adminEmail = "Email quản trị chưa hợp lệ";
      if (Object.keys(errors).length) validation(errors);
      const id = newId("sch");
      const hasAdmin = /^\S+@\S+\.\S+$/.test(input.adminEmail) && input.adminName.trim().length > 2;
      const school: School = {
        id, slug: input.slug, code: input.code, name: input.name.trim(), shortName: input.shortName.trim() || input.name.trim(), level: input.level,
        province: input.province, address: input.address, publicPhone: input.publicPhone, publicEmail: input.publicEmail, accentColor: "#0a72e6",
        motto: "", publicIntro: "", status: "draft", createdAt: ctx.now, version: 1,
        onboarding: { profileDone: true, adminAssigned: false, yearCreated: false, classesCreated: false, teachersInvited: false, studentsImported: false, homeroomAssigned: false, rulesPublished: false },
      };
      db.schools.push(school);
      db.roleTemplates.push(...buildRoleTemplates(id, ctx.now));
      if (hasAdmin) {
        db.invitations.push({ id: newId("inv"), schoolId: id, email: input.adminEmail, fullName: input.adminName, invitedByUserId: ctx.actor.kind === "platform" ? ctx.actor.userId : "", roleTemplateIds: [`${id}-role-admin`], proposedDuty: "Quản trị trường đầu tiên", createdAt: ctx.now, expiresAt: addMinutesISO(ctx.now, 14 * 1440), status: "pending" });
      }
      audit(db, ctx, { level: "platform", action: "Tạo trường (nháp)", entityType: "school", entityId: id, entityLabel: school.name });
      return school;
    });
  },

  async updateSchoolOps(ctx: Ctx, schoolId: ID, patch: Partial<Pick<School, "name" | "shortName" | "province" | "address" | "publicEmail" | "publicPhone">> & { version: number }) {
    requirePlatform(ctx);
    return write((db) => {
      const s = findOr404(db.schools.find((x) => x.id === schoolId), "trường");
      if (s.version !== patch.version) throw new RepoError("CONFLICT");
      const before = { name: s.name, province: s.province, address: s.address };
      Object.assign(s, { ...patch, version: s.version + 1 });
      audit(db, ctx, { level: "platform", action: "Cập nhật thông tin vận hành trường", entityType: "school", entityId: s.id, entityLabel: s.name, before, after: { name: s.name, province: s.province, address: s.address } });
      return s;
    });
  },

  /** Suspend/activate/archive. Never deletes data. Activation requires an active admin. */
  async changeSchoolStatus(ctx: Ctx, schoolId: ID, status: SchoolStatus, reason: string) {
    requirePlatform(ctx);
    return write((db) => {
      const s = findOr404(db.schools.find((x) => x.id === schoolId), "trường");
      if (!reason.trim() && status !== "active") validation({ reason: "Vui lòng ghi lý do" });
      if (status === "active") {
        const row = schoolRow(db, s);
        if (row.adminNames.length === 0) throw new RepoError("VALIDATION", "Chưa có quản trị trường đang hoạt động. Không thể kích hoạt khi thiếu người quản trị.");
      }
      const before = s.status;
      s.status = status;
      s.statusReason = reason.trim() || undefined;
      if (status === "active") s.activatedAt = ctx.now;
      s.version += 1;
      const label = { active: "Kích hoạt trường", suspended: "Tạm dừng trường", archived: "Lưu trữ trường", draft: "Chuyển về nháp" }[status];
      audit(db, ctx, { level: "platform", action: label, entityType: "school", entityId: s.id, entityLabel: s.name, before: { status: before }, after: { status }, reason });
      return s;
    });
  },

  async inviteSchoolAdmin(ctx: Ctx, schoolId: ID, input: { fullName: string; email: string; days: number }) {
    requirePlatform(ctx);
    return write((db) => {
      const s = findOr404(db.schools.find((x) => x.id === schoolId), "trường");
      if (!/^\S+@\S+\.\S+$/.test(input.email)) validation({ email: "Email chưa hợp lệ" });
      if (input.fullName.trim().length < 3) validation({ fullName: "Họ tên tối thiểu 3 ký tự" });
      const existing = db.users.find((u) => u.email.toLowerCase() === input.email.toLowerCase());
      const inv = { id: newId("inv"), schoolId, email: input.email, fullName: input.fullName, invitedByUserId: requirePlatform(ctx), roleTemplateIds: [`${schoolId}-role-admin`], proposedDuty: "Quản trị trường", createdAt: ctx.now, expiresAt: addMinutesISO(ctx.now, input.days * 1440), status: "pending" as const, existingUserId: existing?.id };
      db.invitations.push(inv);
      audit(db, ctx, { level: "platform", action: "Mời quản trị trường (mô phỏng, không gửi email)", entityType: "invitation", entityId: inv.id, entityLabel: `${s.name} — ${input.email}` });
      return inv;
    });
  },

  /** Remove the admin role from one membership. Refuses to leave the school without any active admin. */
  async revokeSchoolAdmin(ctx: Ctx, schoolId: ID, membershipId: ID, reason: string) {
    requirePlatform(ctx);
    return write((db) => {
      const adminRole = `${schoolId}-role-admin`;
      const m = findOr404(db.memberships.find((x) => x.id === membershipId && x.schoolId === schoolId), "quản trị trường");
      const others = db.memberships.filter((x) => x.schoolId === schoolId && x.id !== m.id && x.status === "active" && x.roleTemplateIds.includes(adminRole));
      if (others.length === 0) throw new RepoError("VALIDATION", "Không thể thu hồi quản trị cuối cùng của trường. Hãy mời và kích hoạt người thay thế trước.");
      m.roleTemplateIds = m.roleTemplateIds.filter((r) => r !== adminRole);
      m.version += 1;
      audit(db, ctx, { level: "platform", action: "Thu hồi quyền quản trị trường", entityType: "membership", entityId: m.id, entityLabel: staffNameById(db, m.userId), reason });
      return m;
    });
  },

  async revokeInvitation(ctx: Ctx, inviteId: ID) {
    requirePlatform(ctx);
    return write((db) => {
      const inv = findOr404(db.invitations.find((i) => i.id === inviteId), "lời mời");
      if (inv.status !== "pending") throw new RepoError("VALIDATION", "Chỉ thu hồi được lời mời đang chờ.");
      inv.status = "revoked";
      audit(db, ctx, { level: "platform", action: "Thu hồi lời mời quản trị", entityType: "invitation", entityId: inv.id, entityLabel: inv.email });
      return inv;
    });
  },

  /* ------------------------------ support ------------------------------ */
  async tickets(ctx: Ctx, q: ListQuery) {
    requirePlatform(ctx);
    return read((db) => {
      const f = q.filters ?? {};
      const rows = db.tickets
        .map((t) => ({ ...t, schoolName: db.schools.find((s) => s.id === t.schoolId)?.shortName ?? "", assigneeName: staffNameById(db, t.assigneeUserId, false) }))
        .filter((t) => matches(q.q ?? "", t.title, t.schoolName) && (!f.status || t.status === f.status) && (!f.priority || t.priority === f.priority))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return paginate(rows, q, { createdAt: (a, b) => a.createdAt.localeCompare(b.createdAt), priority: (a, b) => ["low", "normal", "high"].indexOf(a.priority) - ["low", "normal", "high"].indexOf(b.priority) });
    });
  },

  async ticket(ctx: Ctx, ticketId: ID) {
    requirePlatform(ctx);
    return read((db) => {
      const t = findOr404(db.tickets.find((x) => x.id === ticketId), "yêu cầu hỗ trợ");
      return {
        ticket: t, school: db.schools.find((s) => s.id === t.schoolId)!,
        grants: db.supportGrants.filter((g) => g.ticketId === t.id || (g.schoolId === t.schoolId && g.status === "active")),
        people: Object.fromEntries(db.users.filter((u) => [t.createdBy, t.assigneeUserId, ...t.updates.map((x) => x.by)].includes(u.id)).map((u) => [u.id, staffName(u, false)])),
        operators: db.users.filter((u) => u.isPlatformOperator).map((u) => ({ id: u.id, name: u.fullName })),
      };
    });
  },

  async updateTicket(ctx: Ctx, ticketId: ID, input: { text?: string; status?: SupportTicket["status"]; assigneeUserId?: ID }) {
    const uid = requirePlatform(ctx);
    return write((db) => {
      const t = findOr404(db.tickets.find((x) => x.id === ticketId), "yêu cầu hỗ trợ");
      if (input.text !== undefined && input.text.trim().length < 3) validation({ text: "Nội dung cập nhật tối thiểu 3 ký tự" });
      if (input.text) t.updates.push({ at: ctx.now, by: uid, text: input.text.trim(), side: "platform" });
      if (input.status) t.status = input.status;
      if (input.assigneeUserId) t.assigneeUserId = input.assigneeUserId;
      audit(db, ctx, { level: "platform", action: "Cập nhật yêu cầu hỗ trợ", entityType: "ticket", entityId: t.id, entityLabel: t.title });
      return t;
    });
  },

  async supportGrants(ctx: Ctx) {
    requirePlatform(ctx);
    return read((db) => db.supportGrants.map((g) => ({ ...g, status: effectiveGrantStatus(g, ctx.now), schoolName: db.schools.find((s) => s.id === g.schoolId)?.shortName ?? "", requestedByName: staffNameById(db, g.requestedBy, false), approvedByName: staffNameById(db, g.approvedBy, false) })).sort((a, b) => (b.validFrom ?? b.validTo).localeCompare(a.validFrom ?? a.validTo)));
  },

  /** Platform can only REQUEST access; the school approves (see supportRepo). */
  async requestSupportGrant(ctx: Ctx, input: { schoolId: ID; ticketId?: ID; scopes: SupportGrant["scopes"]; reason: string; days: number }) {
    const uid = requirePlatform(ctx);
    return write((db) => {
      if (!input.scopes.length) validation({ scopes: "Chọn ít nhất một phạm vi" });
      if (input.reason.trim().length < 5) validation({ reason: "Nêu rõ lý do (tối thiểu 5 ký tự)" });
      if (input.days < 1 || input.days > 14) validation({ days: "Thời hạn từ 1 đến 14 ngày" });
      const g: SupportGrant = { id: newId("sg"), schoolId: input.schoolId, ticketId: input.ticketId, scopes: input.scopes, reason: input.reason.trim(), requestedBy: uid, validTo: addMinutesISO(ctx.now, input.days * 1440), status: "requested" };
      db.supportGrants.push(g);
      audit(db, ctx, { level: "platform", action: "Đề nghị quyền hỗ trợ tạm thời", entityType: "supportGrant", entityId: g.id, entityLabel: db.schools.find((s) => s.id === g.schoolId)?.shortName ?? "" });
      return g;
    });
  },

  /* ------------------------------ audit & operations ------------------------------ */
  async audit(ctx: Ctx, q: ListQuery) {
    requirePlatform(ctx);
    return read((db) => {
      const f = q.filters ?? {};
      const rows = db.audit
        .filter((a) => a.level === "platform")
        .map((a) => ({ ...a, actorName: staffNameById(db, a.actorId, false) }))
        .filter((a) => matches(q.q ?? "", a.action, a.entityLabel, a.actorName) && (!f.actor || a.actorId === f.actor) && (!f.from || a.at >= f.from) && (!f.to || a.at <= `${f.to}T23:59:59+07:00`))
        .sort((a, b) => b.at.localeCompare(a.at));
      return { ...paginate<AuditEvent & { actorName: string }>(rows, q), actors: db.users.filter((u) => u.isPlatformOperator).map((u) => ({ id: u.id, name: u.fullName })) };
    });
  },

  async settings(ctx: Ctx) {
    requirePlatform(ctx);
    return read((db) => db.platformSettings);
  },

  async saveSettings(ctx: Ctx, patch: Omit<PlatformSettings, "version" | "dateFormat" | "timezone"> & { version: number }) {
    requirePlatform(ctx);
    return write((db) => {
      const s = db.platformSettings;
      if (s.version !== patch.version) throw new RepoError("CONFLICT");
      if (!/^\S+@\S+\.\S+$/.test(patch.supportEmail)) validation({ supportEmail: "Email hỗ trợ chưa hợp lệ" });
      if (patch.brandName.trim().length < 2) validation({ brandName: "Tên hiển thị tối thiểu 2 ký tự" });
      const before = { brandName: s.brandName, supportEmail: s.supportEmail, supportPhone: s.supportPhone };
      Object.assign(s, { brandName: patch.brandName.trim(), supportEmail: patch.supportEmail.trim(), supportPhone: patch.supportPhone.trim(), footerNote: patch.footerNote.trim(), version: s.version + 1 });
      audit(db, ctx, { level: "platform", action: "Cập nhật cấu hình nền tảng", entityType: "platformSettings", entityId: "platform", entityLabel: "Cấu hình nền tảng", before, after: { brandName: s.brandName, supportEmail: s.supportEmail, supportPhone: s.supportPhone } });
      return s;
    });
  },
};

export function effectiveGrantStatus(g: SupportGrant, now: string): SupportGrant["status"] {
  if ((g.status === "active" || g.status === "requested") && g.validTo < now) return "expired";
  return g.status;
}
