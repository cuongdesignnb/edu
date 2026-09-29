import type { ActionKey, Assignment, ID, Membership, RoleTemplate } from "@/lib/model/types";
import { HOMEROOM_ACTIONS, SUBJECT_ACTIONS, ACTION_LABELS } from "@/lib/permissions/actions";
import { isAssignmentLive, schoolActions } from "@/lib/permissions/can";
import { addDays } from "@/lib/demo/clock";
import { newId } from "@/lib/demo/ids";
import { matches, nameCompare } from "@/lib/formatters";
import { RepoError } from "./errors";
import { audit, findOr404, paginate, read, requireAction, validation, write, allowed, actorId, type Ctx, type ListQuery } from "./core";
import { className, currentYear, staffName, staffNameById, subjectName, userById, homeroomAssignment } from "./selectors";
import { effectiveInvitationStatus } from "./session";

export interface TeacherRow {
  id: ID; membershipId: ID; userId: ID; fullName: string; displayName: string; email: string; department: string; staffCode: string;
  roleLabels: string[]; dutyLabels: string[]; status: Membership["status"]; avatarTone: string; kind: "member" | "invitation"; invitationStatus?: string;
}

function dutyLabel(db: import("@/lib/model/types").DemoDB, a: Assignment) {
  return a.kind === "homeroom" ? `Chủ nhiệm ${className(db, a.classId)}` : `${subjectName(db, a.subjectId)} ${className(db, a.classId)}`;
}

export const staffRepo = {
  async teachers(ctx: Ctx, schoolId: ID, q: ListQuery) {
    return read((db) => {
      requireAction(db, ctx, "staff.view", { schoolId });
      const f = q.filters ?? {};
      const members: TeacherRow[] = db.memberships.filter((m) => m.schoolId === schoolId).map((m) => {
        const u = userById(db, m.userId)!;
        const live = db.assignments.filter((a) => a.membershipId === m.id && isAssignmentLive(a, ctx.today));
        const roles = m.roleTemplateIds.map((r) => db.roleTemplates.find((t) => t.id === r)?.name ?? "").filter(Boolean);
        const roleLabels = [...roles, ...(live.some((a) => a.kind === "homeroom") ? ["GVCN"] : []), ...(live.some((a) => a.kind === "subject") ? ["Giáo viên bộ môn"] : [])];
        return { id: m.id, membershipId: m.id, userId: u.id, fullName: u.fullName, displayName: staffName(u), email: u.email, department: m.department, staffCode: m.staffCode,
          roleLabels: roleLabels.length ? roleLabels : ["Chưa phân công"], dutyLabels: live.map((a) => dutyLabel(db, a)), status: m.status, avatarTone: u.avatarTone, kind: "member" as const };
      });
      const invites: TeacherRow[] = db.invitations.filter((i) => i.schoolId === schoolId && effectiveInvitationStatus(i, ctx.now) === "pending").map((i) => ({
        id: i.id, membershipId: "", userId: i.existingUserId ?? "", fullName: i.fullName, displayName: i.fullName, email: i.email, department: "—", staffCode: "—",
        roleLabels: ["Lời mời"], dutyLabels: [i.proposedDuty], status: "active" as const, avatarTone: "amber", kind: "invitation" as const, invitationStatus: "pending",
      }));
      const rows = [...members, ...(f.status === "invited" || !f.status ? invites : [])]
        .filter((r) => matches(q.q ?? "", r.fullName, r.email, r.department, ...r.dutyLabels) &&
          (!f.department || r.department === f.department) &&
          (!f.role || r.roleLabels.includes(f.role)) &&
          (!f.status || (f.status === "invited" ? r.kind === "invitation" : r.kind === "member" && r.status === f.status)))
        .sort((a, b) => nameCompare(a.fullName, b.fullName));
      const allMembers = db.memberships.filter((m) => m.schoolId === schoolId);
      return {
        ...paginate(rows, q, { name: (a, b) => nameCompare(a.fullName, b.fullName), department: (a, b) => a.department.localeCompare(b.department, "vi") }),
        departments: [...new Set(allMembers.map((m) => m.department))].sort((a, b) => a.localeCompare(b, "vi")),
        kpi: {
          total: allMembers.length, active: allMembers.filter((m) => m.status === "active").length,
          pendingInvites: invites.length, suspended: allMembers.filter((m) => m.status !== "active").length,
        },
        canInvite: allowed(db, ctx, "staff.invite", { schoolId }), canSuspend: allowed(db, ctx, "staff.suspend", { schoolId }), canAssign: allowed(db, ctx, "assignment.manage", { schoolId }),
      };
    });
  },

  async invitations(ctx: Ctx, schoolId: ID) {
    return read((db) => {
      requireAction(db, ctx, "staff.view", { schoolId });
      return db.invitations.filter((i) => i.schoolId === schoolId).map((i) => ({ ...i, status: effectiveInvitationStatus(i, ctx.now), inviterName: staffNameById(db, i.invitedByUserId) })).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    });
  },

  async member(ctx: Ctx, schoolId: ID, membershipId: ID) {
    return read((db) => {
      requireAction(db, ctx, "staff.view", { schoolId });
      const m = findOr404(db.memberships.find((x) => x.id === membershipId && x.schoolId === schoolId), "thành viên");
      const u = userById(db, m.userId)!;
      const assignments = db.assignments.filter((a) => a.membershipId === m.id).map((a) => ({ ...a, label: dutyLabel(db, a), live: isAssignmentLive(a, ctx.today) && m.status === "active", createdByName: staffNameById(db, a.createdBy) }))
        .sort((a, b) => Number(b.live) - Number(a.live) || b.validFrom.localeCompare(a.validFrom));
      // Other schools are only mentioned by count — never their data.
      const otherSchools = db.memberships.filter((x) => x.userId === u.id && x.schoolId !== schoolId).length;
      const effective = [...schoolActions(db, m)];
      return {
        membership: m, user: { id: u.id, fullName: u.fullName, displayName: staffName(u), email: u.email, workPhone: u.workPhone, avatarTone: u.avatarTone },
        roles: m.roleTemplateIds.map((r) => db.roleTemplates.find((t) => t.id === r)!).filter(Boolean), assignments, otherSchools,
        schoolActionLabels: effective.filter((a) => ACTION_LABELS[a].level === "school").map((a) => ACTION_LABELS[a].label),
        history: db.audit.filter((e) => e.schoolId === schoolId && (e.entityId === m.id || assignments.some((a) => a.id === e.entityId))).sort((a, b) => b.at.localeCompare(a.at)).map((e) => ({ ...e, actorName: staffNameById(db, e.actorId) })),
        roleTemplates: db.roleTemplates.filter((r) => r.schoolId === schoolId && r.level === "school"),
        canAssign: allowed(db, ctx, "assignment.manage", { schoolId }), canSuspend: allowed(db, ctx, "staff.suspend", { schoolId }), canRole: allowed(db, ctx, "role.manage", { schoolId }),
        isSelf: ctx.actor.kind === "staff" && ctx.actor.userId === u.id,
      };
    });
  },

  /** O05 — invite. An existing identity only receives a new membership; nothing else about it changes. */
  async invite(ctx: Ctx, schoolId: ID, input: { fullName: string; email: string; proposedDuty: string; roleTemplateIds: ID[]; days: number }) {
    return write((db) => {
      requireAction(db, ctx, "staff.invite", { schoolId });
      const errors: Record<string, string> = {};
      if (input.fullName.trim().length < 3) errors.fullName = "Họ tên tối thiểu 3 ký tự";
      if (!/^\S+@\S+\.\S+$/.test(input.email.trim())) errors.email = "Email chưa hợp lệ";
      if (input.days < 1 || input.days > 30) errors.days = "Hạn lời mời từ 1 đến 30 ngày";
      const existing = db.users.find((u) => u.email.toLowerCase() === input.email.trim().toLowerCase());
      if (existing && db.memberships.some((m) => m.userId === existing.id && m.schoolId === schoolId && m.status === "active")) errors.email = "Người này đã là thành viên của trường";
      if (db.invitations.some((i) => i.schoolId === schoolId && i.email.toLowerCase() === input.email.trim().toLowerCase() && effectiveInvitationStatus(i, ctx.now) === "pending")) errors.email = "Đã có lời mời đang chờ cho email này";
      // cannot grant roles the inviter does not hold (no self-escalation)
      const mine = db.memberships.find((m) => m.schoolId === schoolId && m.userId === actorId(ctx));
      const myActions = mine ? schoolActions(db, mine) : new Set<ActionKey>();
      const tooMuch = input.roleTemplateIds.some((rid) => db.roleTemplates.find((t) => t.id === rid)?.actions.some((a) => !myActions.has(a)));
      if (tooMuch) errors.roleTemplateIds = "Không thể mời với quyền vượt quá quyền của bạn";
      if (Object.keys(errors).length) validation(errors);
      const inv = { id: newId("inv"), schoolId, email: input.email.trim(), fullName: input.fullName.trim(), invitedByUserId: actorId(ctx), roleTemplateIds: input.roleTemplateIds, proposedDuty: input.proposedDuty.trim() || "Giáo viên", createdAt: ctx.now, expiresAt: `${addDays(ctx.today, input.days)}T23:59:00+07:00`, status: "pending" as const, existingUserId: existing?.id };
      db.invitations.push(inv);
      audit(db, ctx, { level: "school", schoolId, action: "Mời giáo viên (mô phỏng, không gửi email)", entityType: "invitation", entityId: inv.id, entityLabel: `${inv.fullName} — ${inv.email}` });
      return inv;
    });
  },

  async revokeInvitation(ctx: Ctx, schoolId: ID, inviteId: ID) {
    return write((db) => {
      requireAction(db, ctx, "staff.invite", { schoolId });
      const inv = findOr404(db.invitations.find((i) => i.id === inviteId && i.schoolId === schoolId), "lời mời");
      if (effectiveInvitationStatus(inv, ctx.now) !== "pending") throw new RepoError("VALIDATION", "Chỉ thu hồi được lời mời đang chờ.");
      inv.status = "revoked";
      audit(db, ctx, { level: "school", schoolId, action: "Thu hồi lời mời", entityType: "invitation", entityId: inv.id, entityLabel: inv.email });
      return inv;
    });
  },

  /** O08 — suspend/revoke a membership at THIS school only. Identity and history are kept. */
  async setMembershipStatus(ctx: Ctx, schoolId: ID, membershipId: ID, status: Membership["status"], reason: string) {
    return write((db) => {
      requireAction(db, ctx, "staff.suspend", { schoolId });
      const m = findOr404(db.memberships.find((x) => x.id === membershipId && x.schoolId === schoolId), "thành viên");
      if (m.userId === actorId(ctx)) throw new RepoError("VALIDATION", "Không thể tự khóa hoặc thu hồi thành viên của chính mình.");
      if (status !== "active" && reason.trim().length < 3) validation({ reason: "Vui lòng ghi lý do" });
      const adminRole = `${schoolId}-role-admin`;
      if (status !== "active" && m.roleTemplateIds.includes(adminRole) && !db.memberships.some((x) => x.id !== m.id && x.schoolId === schoolId && x.status === "active" && x.roleTemplateIds.includes(adminRole))) {
        throw new RepoError("VALIDATION", "Không thể khóa quản trị trường cuối cùng.");
      }
      const before = m.status;
      m.status = status;
      m.statusReason = reason.trim() || undefined;
      m.version += 1;
      if (status === "revoked") {
        db.assignments.filter((a) => a.membershipId === m.id && a.status === "active").forEach((a) => { a.status = "revoked"; a.revokedAt = ctx.now; a.validTo = addDays(ctx.today, -1) < a.validFrom ? a.validFrom : addDays(ctx.today, -1); a.reason = reason; });
      }
      audit(db, ctx, { level: "school", schoolId, action: status === "active" ? "Mở khóa thành viên" : status === "suspended" ? "Tạm khóa thành viên" : "Thu hồi thành viên", entityType: "membership", entityId: m.id, entityLabel: staffNameById(db, m.userId), before: { status: before }, after: { status }, reason });
      return m;
    });
  },

  async setMemberRoles(ctx: Ctx, schoolId: ID, membershipId: ID, roleTemplateIds: ID[], reason: string) {
    return write((db) => {
      requireAction(db, ctx, "role.manage", { schoolId });
      const m = findOr404(db.memberships.find((x) => x.id === membershipId && x.schoolId === schoolId), "thành viên");
      if (m.userId === actorId(ctx)) throw new RepoError("VALIDATION", "Không thể tự thay đổi mẫu quyền của chính mình.");
      const mine = db.memberships.find((x) => x.schoolId === schoolId && x.userId === actorId(ctx));
      const myActions = mine ? schoolActions(db, mine) : new Set<ActionKey>();
      if (roleTemplateIds.some((rid) => db.roleTemplates.find((t) => t.id === rid)?.actions.some((a) => !myActions.has(a)))) throw new RepoError("FORBIDDEN", "Không thể cấp quyền vượt quá quyền của bạn.");
      const adminRole = `${schoolId}-role-admin`;
      if (m.roleTemplateIds.includes(adminRole) && !roleTemplateIds.includes(adminRole) && !db.memberships.some((x) => x.id !== m.id && x.schoolId === schoolId && x.status === "active" && x.roleTemplateIds.includes(adminRole))) {
        throw new RepoError("VALIDATION", "Không thể bỏ quyền của quản trị trường cuối cùng.");
      }
      const name = (ids: ID[]) => ids.map((i) => db.roleTemplates.find((t) => t.id === i)?.name).join(", ") || "Không";
      const before = name(m.roleTemplateIds);
      m.roleTemplateIds = roleTemplateIds;
      m.version += 1;
      audit(db, ctx, { level: "school", schoolId, action: "Đổi mẫu quyền nhà trường", entityType: "membership", entityId: m.id, entityLabel: staffNameById(db, m.userId), before: { roles: before }, after: { roles: name(roleTemplateIds) }, reason });
      return m;
    });
  },

  /* ------------------------------ assignments ------------------------------ */
  async assignmentMatrix(ctx: Ctx, schoolId: ID, yearId?: ID) {
    return read((db) => {
      requireAction(db, ctx, "staff.view", { schoolId });
      const y = yearId ?? currentYear(db, schoolId)?.id;
      const year = db.years.find((x) => x.id === y)!;
      const ref = year.status === "archived" ? addDays(year.endDate, -62) : ctx.today;
      const classes = db.classes.filter((c) => c.schoolId === schoolId && c.yearId === y).sort((a, b) => a.name.localeCompare(b.name, "vi"));
      const subjects = db.subjects.filter((s) => s.schoolId === schoolId && s.status === "active" && !["CHAOCO", "SHL"].includes(s.code));
      const cell = (a?: Assignment) => {
        if (!a) return null;
        const m = db.memberships.find((x) => x.id === a.membershipId)!;
        return { assignmentId: a.id, membershipId: a.membershipId, name: staffNameById(db, m.userId), memberStatus: m.status, validFrom: a.validFrom, validTo: a.validTo };
      };
      const rows = classes.map((c) => {
        const live = db.assignments.filter((a) => a.classId === c.id && isAssignmentLive(a, ref));
        const hr = live.find((a) => a.kind === "homeroom");
        const bySubject = Object.fromEntries(subjects.map((s) => [s.id, cell(live.find((a) => a.kind === "subject" && a.subjectId === s.id))]));
        const conflicts: string[] = [];
        if (!hr) conflicts.push("Thiếu giáo viên chủ nhiệm");
        const lessonsSubjects = new Set(db.lessons.filter((l) => l.classId === c.id).map((l) => l.subjectId));
        subjects.forEach((s) => { if (lessonsSubjects.has(s.id) && !bySubject[s.id]) conflicts.push(`Chưa phân công ${s.name}`); });
        Object.values(bySubject).forEach((x) => { if (x && x.memberStatus !== "active") conflicts.push(`${x.name} đang bị khóa`); });
        return { classId: c.id, className: c.name, status: c.status, homeroom: cell(hr), bySubject, conflicts };
      });
      return { year, subjects, rows, canAssign: allowed(db, ctx, "assignment.manage", { schoolId }) };
    });
  },

  /** Preview which actions a new grant would add (O07), before saving. */
  async previewAssignment(ctx: Ctx, schoolId: ID, input: { membershipId: ID; kind: "homeroom" | "subject"; classId: ID; subjectId?: ID }) {
    return read((db) => {
      requireAction(db, ctx, "assignment.manage", { schoolId });
      const actions = input.kind === "homeroom" ? HOMEROOM_ACTIONS : SUBJECT_ACTIONS;
      const current = new Set(db.assignments.filter((a) => a.membershipId === input.membershipId && a.classId === input.classId && isAssignmentLive(a, ctx.today)).flatMap((a) => a.actions));
      return {
        scope: `${className(db, input.classId)}${input.subjectId ? ` — ${subjectName(db, input.subjectId)}` : ""}`,
        added: actions.filter((a) => !current.has(a)).map((a) => ACTION_LABELS[a].label),
        kept: actions.filter((a) => current.has(a)).map((a) => ACTION_LABELS[a].label),
        notIncluded: (input.kind === "subject" ? HOMEROOM_ACTIONS.filter((a) => !SUBJECT_ACTIONS.includes(a)) : []).map((a) => ACTION_LABELS[a].label),
      };
    });
  },

  /** O06 — create a grant. One homeroom per class at a time; a teacher has at most one homeroom per year. */
  async assign(ctx: Ctx, schoolId: ID, input: { membershipId: ID; kind: "homeroom" | "subject"; classId: ID; subjectId?: ID; validFrom: string; validTo?: string; reason?: string }) {
    return write((db) => {
      requireAction(db, ctx, "assignment.manage", { schoolId });
      const errors: Record<string, string> = {};
      const m = db.memberships.find((x) => x.id === input.membershipId && x.schoolId === schoolId);
      if (!m) errors.membershipId = "Chọn giáo viên thuộc trường";
      else if (m.status !== "active") errors.membershipId = "Thành viên đang bị khóa hoặc đã thu hồi";
      const c = db.classes.find((x) => x.id === input.classId && x.schoolId === schoolId);
      if (!c) errors.classId = "Chọn lớp của trường";
      else if (c.status === "archived") errors.classId = "Lớp đã lưu trữ";
      if (input.kind === "subject" && !db.subjects.some((s) => s.id === input.subjectId && s.schoolId === schoolId)) errors.subjectId = "Chọn môn";
      if (input.validTo && input.validTo < input.validFrom) errors.validTo = "Ngày kết thúc phải sau ngày bắt đầu";
      if (c && input.kind === "homeroom") {
        const cur = homeroomAssignment(db, c.id, input.validFrom);
        if (cur && cur.membershipId !== input.membershipId) errors.classId = `Lớp đã có chủ nhiệm (${staffNameById(db, db.memberships.find((x) => x.id === cur.membershipId)?.userId)}). Dùng Bàn giao chủ nhiệm.`;
        const other = db.assignments.find((a) => a.membershipId === input.membershipId && a.kind === "homeroom" && isAssignmentLive(a, input.validFrom) && a.classId !== c.id && db.classes.find((x) => x.id === a.classId)?.yearId === c.yearId);
        if (other) errors.membershipId = `Giáo viên đang chủ nhiệm ${className(db, other.classId)}`;
      }
      if (c && input.kind === "subject") {
        const dup = db.assignments.find((a) => a.classId === c.id && a.kind === "subject" && a.subjectId === input.subjectId && isAssignmentLive(a, input.validFrom));
        if (dup) errors.subjectId = dup.membershipId === input.membershipId ? "Phân công này đã tồn tại" : `Môn đã được phân công cho ${staffNameById(db, db.memberships.find((x) => x.id === dup.membershipId)?.userId)}`;
      }
      if (Object.keys(errors).length) validation(errors);
      const a: Assignment = {
        id: newId("as"), schoolId, membershipId: input.membershipId, kind: input.kind, classId: input.classId, subjectId: input.kind === "subject" ? input.subjectId : undefined,
        actions: [...(input.kind === "homeroom" ? HOMEROOM_ACTIONS : SUBJECT_ACTIONS)], validFrom: input.validFrom, validTo: input.validTo, status: "active",
        createdBy: actorId(ctx), createdAt: ctx.now, reason: input.reason, version: 1,
      };
      db.assignments.push(a);
      db.notifications.push({ id: newId("nt"), schoolId, userId: m!.userId, kind: "permission", title: "Bạn được phân công mới", body: dutyLabel(db, a), href: `/teacher/${schoolId}/classes`, createdAt: ctx.now });
      audit(db, ctx, { level: "school", schoolId, action: "Phân công", entityType: "assignment", entityId: a.id, entityLabel: `${staffNameById(db, m!.userId)} — ${dutyLabel(db, a)}`, after: { validFrom: a.validFrom, validTo: a.validTo ?? "không thời hạn" } });
      return a;
    });
  },

  /** Revoking takes effect for the next read/write of that teacher (even in an open tab). History authorship is kept. */
  async revokeAssignment(ctx: Ctx, schoolId: ID, assignmentId: ID, reason: string) {
    return write((db) => {
      requireAction(db, ctx, "assignment.manage", { schoolId });
      const a = findOr404(db.assignments.find((x) => x.id === assignmentId && x.schoolId === schoolId), "phân công");
      if (reason.trim().length < 3) validation({ reason: "Vui lòng ghi lý do" });
      if (a.status !== "active") throw new RepoError("VALIDATION", "Phân công đã kết thúc hoặc đã thu hồi.");
      a.status = "revoked";
      a.revokedAt = ctx.now;
      a.validTo = ctx.today < a.validFrom ? a.validFrom : addDays(ctx.today, -1) < a.validFrom ? a.validFrom : addDays(ctx.today, -1);
      a.reason = reason.trim();
      a.version += 1;
      const m = db.memberships.find((x) => x.id === a.membershipId)!;
      db.notifications.push({ id: newId("nt"), schoolId, userId: m.userId, kind: "permission", title: "Phân công đã được thu hồi", body: `${dutyLabel(db, a)} — ${reason.trim()}`, href: `/teacher/${schoolId}/classes`, createdAt: ctx.now });
      audit(db, ctx, { level: "school", schoolId, action: "Thu hồi phân công", entityType: "assignment", entityId: a.id, entityLabel: `${staffNameById(db, m.userId)} — ${dutyLabel(db, a)}`, reason });
      return a;
    });
  },

  /** SC15 — homeroom handover: ends the old grant the day before, starts the new one; open items listed. */
  async handoverPreview(ctx: Ctx, schoolId: ID, classId: ID) {
    return read((db) => {
      requireAction(db, ctx, "assignment.manage", { schoolId });
      const cur = homeroomAssignment(db, classId, ctx.today);
      return {
        className: className(db, classId),
        current: cur ? { assignmentId: cur.id, membershipId: cur.membershipId, name: staffNameById(db, db.memberships.find((m) => m.id === cur.membershipId)?.userId) } : null,
        openItems: {
          pendingConduct: db.conductRecords.filter((r) => r.classId === classId && r.status === "pending_review").length,
          openWeeks: db.conductPeriods.filter((p) => p.classId === classId && p.status === "open").length,
          pendingAdjustments: db.adjustments.filter((x) => x.classId === classId && x.status === "pending").length,
          pendingEvidence: db.evidence.filter((e) => e.classId === classId && e.status === "pending").length,
          draftAnnouncements: db.announcements.filter((x) => x.originClassId === classId && x.status === "draft").length,
          activeLinks: db.parentAccesses.filter((p) => !p.revokedAt && p.expiresAt >= ctx.now && db.enrollments.some((e) => e.studentId === p.studentId && e.classId === classId && !e.endDate)).length,
        },
      };
    });
  },

  async handover(ctx: Ctx, schoolId: ID, input: { classId: ID; toMembershipId: ID; effectiveDate: string; note: string }) {
    return write((db) => {
      requireAction(db, ctx, "assignment.manage", { schoolId });
      const errors: Record<string, string> = {};
      const cur = homeroomAssignment(db, input.classId, ctx.today);
      if (!cur) errors.classId = "Lớp chưa có chủ nhiệm — dùng Phân công.";
      if (cur && cur.membershipId === input.toMembershipId) errors.toMembershipId = "Chọn giáo viên khác người đang chủ nhiệm";
      const to = db.memberships.find((m) => m.id === input.toMembershipId && m.schoolId === schoolId);
      if (!to || to.status !== "active") errors.toMembershipId = "Chọn giáo viên đang hoạt động";
      if (input.effectiveDate < ctx.today) errors.effectiveDate = "Không áp dụng ngược về quá khứ";
      const cls = db.classes.find((c) => c.id === input.classId);
      const other = db.assignments.find((a) => a.membershipId === input.toMembershipId && a.kind === "homeroom" && isAssignmentLive(a, input.effectiveDate) && db.classes.find((x) => x.id === a.classId)?.yearId === cls?.yearId);
      if (other) errors.toMembershipId = `Giáo viên đang chủ nhiệm ${className(db, other.classId)}`;
      if (Object.keys(errors).length) validation(errors);
      cur!.validTo = addDays(input.effectiveDate, -1);
      cur!.status = input.effectiveDate <= ctx.today ? "ended" : "active";
      cur!.reason = `Bàn giao chủ nhiệm: ${input.note}`;
      cur!.version += 1;
      const a: Assignment = { id: newId("as"), schoolId, membershipId: input.toMembershipId, kind: "homeroom", classId: input.classId, actions: [...HOMEROOM_ACTIONS], validFrom: input.effectiveDate, status: "active", createdBy: actorId(ctx), createdAt: ctx.now, reason: input.note, version: 1 };
      db.assignments.push(a);
      const fromUser = db.memberships.find((m) => m.id === cur!.membershipId)!.userId;
      db.notifications.push({ id: newId("nt"), schoolId, userId: to!.userId, kind: "permission", title: `Nhận bàn giao chủ nhiệm ${className(db, input.classId)}`, body: `Hiệu lực từ ${input.effectiveDate}`, href: `/teacher/${schoolId}/classes`, createdAt: ctx.now });
      db.notifications.push({ id: newId("nt"), schoolId, userId: fromUser, kind: "permission", title: `Bàn giao chủ nhiệm ${className(db, input.classId)}`, body: `Quyền chủ nhiệm kết thúc trước ${input.effectiveDate}`, createdAt: ctx.now });
      audit(db, ctx, { level: "school", schoolId, action: "Bàn giao chủ nhiệm", entityType: "assignment", entityId: a.id, entityLabel: className(db, input.classId), before: { homeroom: staffNameById(db, fromUser) }, after: { homeroom: staffNameById(db, to!.userId), from: input.effectiveDate }, reason: input.note });
      return a;
    });
  },

  /* ------------------------------ role templates ------------------------------ */
  async roles(ctx: Ctx, schoolId: ID) {
    return read((db) => {
      requireAction(db, ctx, "staff.view", { schoolId });
      return db.roleTemplates.filter((r) => r.schoolId === schoolId).map((r) => ({
        ...r, memberCount: r.level === "school" ? db.memberships.filter((m) => m.schoolId === schoolId && m.roleTemplateIds.includes(r.id)).length
          : db.assignments.filter((a) => a.schoolId === schoolId && isAssignmentLive(a, ctx.today) && a.kind === (r.key === "homeroom" ? "homeroom" : "subject")).length,
      }));
    });
  },

  async role(ctx: Ctx, schoolId: ID, roleId: ID) {
    return read((db) => {
      requireAction(db, ctx, "staff.view", { schoolId });
      const r = findOr404(db.roleTemplates.find((x) => x.id === roleId && x.schoolId === schoolId), "mẫu quyền");
      const mine = db.memberships.find((m) => m.schoolId === schoolId && m.userId === actorId(ctx));
      const myActions = mine ? [...schoolActions(db, mine)] : [];
      return {
        role: r, all: Object.entries(ACTION_LABELS).filter(([, v]) => v.level === r.level).map(([k, v]) => ({ key: k as ActionKey, ...v })),
        members: r.level === "school" ? db.memberships.filter((m) => m.schoolId === schoolId && m.roleTemplateIds.includes(r.id)).map((m) => ({ membershipId: m.id, name: staffNameById(db, m.userId) })) : [],
        canEdit: allowed(db, ctx, "role.manage", { schoolId }) && !(mine?.roleTemplateIds.includes(r.id)), myActions,
        history: db.audit.filter((e) => e.entityId === r.id).sort((a, b) => b.at.localeCompare(a.at)).map((e) => ({ ...e, actorName: staffNameById(db, e.actorId) })),
      };
    });
  },

  /** Save role template actions. Cannot edit a template you hold, nor grant actions you don't have. */
  async saveRole(ctx: Ctx, schoolId: ID, roleId: ID, actions: ActionKey[], version: number, reason: string) {
    return write((db) => {
      requireAction(db, ctx, "role.manage", { schoolId });
      const r = findOr404(db.roleTemplates.find((x) => x.id === roleId && x.schoolId === schoolId), "mẫu quyền");
      if (r.version !== version) throw new RepoError("CONFLICT");
      const mine = db.memberships.find((m) => m.schoolId === schoolId && m.userId === actorId(ctx));
      if (mine?.roleTemplateIds.includes(r.id)) throw new RepoError("FORBIDDEN", "Không thể tự chỉnh mẫu quyền mà chính bạn đang giữ.");
      const myActions = mine ? schoolActions(db, mine) : new Set<ActionKey>();
      const escalate = actions.filter((a) => !r.actions.includes(a) && !myActions.has(a) && ACTION_LABELS[a].level === "school");
      if (escalate.length) throw new RepoError("FORBIDDEN", `Không thể thêm quyền bạn không có: ${escalate.map((a) => ACTION_LABELS[a].label).join(", ")}`);
      if (reason.trim().length < 3) validation({ reason: "Ghi lý do thay đổi" });
      const added = actions.filter((a) => !r.actions.includes(a)).map((a) => ACTION_LABELS[a].label);
      const removed = r.actions.filter((a) => !actions.includes(a)).map((a) => ACTION_LABELS[a].label);
      r.actions = actions;
      r.version += 1;
      r.updatedAt = ctx.now;
      if (r.level === "class") {
        // class templates apply to NEW grants; existing grants keep their explicit action list
      }
      audit(db, ctx, { level: "school", schoolId, action: "Sửa mẫu quyền", entityType: "role", entityId: r.id, entityLabel: r.name, before: { removed: removed.join(", ") || "—" }, after: { added: added.join(", ") || "—" }, reason });
      return r as RoleTemplate;
    });
  },
};
