import type { Announcement, AnnouncementScope, DemoDB, ID } from "@/lib/model/types";
import { newId } from "@/lib/demo/ids";
import { matches, nameCompare } from "@/lib/formatters";
import { liveAssignments } from "@/lib/permissions/can";
import { RepoError } from "./errors";
import { allowed, audit, findOr404, paginate, read, requireAction, requireStaff, validation, write, actorId, type Ctx, type ListQuery } from "./core";
import { className, currentYear, enrollmentsOn, rosterOn, staffNameById } from "./selectors";

/** Recipients estimate from fixtures: students in scope (families) and staff count. */
function estimate(db: DemoDB, schoolId: ID, scope: AnnouncementScope, audience: Announcement["audience"], today: string) {
  const year = currentYear(db, schoolId);
  const classes = db.classes.filter((c) => c.schoolId === schoolId && c.yearId === year?.id && c.status === "active");
  let studentIds: string[] = [];
  if (scope.type === "school") studentIds = classes.flatMap((c) => enrollmentsOn(db, c.id, today).map((e) => e.studentId));
  if (scope.type === "grade") studentIds = classes.filter((c) => scope.gradeIds?.includes(c.gradeId)).flatMap((c) => enrollmentsOn(db, c.id, today).map((e) => e.studentId));
  if (scope.type === "class") studentIds = classes.filter((c) => scope.classIds?.includes(c.id)).flatMap((c) => enrollmentsOn(db, c.id, today).map((e) => e.studentId));
  if (scope.type === "student") studentIds = scope.studentIds ?? [];
  const uniq = [...new Set(studentIds)];
  const families = audience === "staff" ? 0 : uniq.length;
  const links = audience === "staff" ? 0 : db.parentAccesses.filter((p) => uniq.includes(p.studentId) && !p.revokedAt && p.expiresAt >= `${today}T00:00:00+07:00`).length;
  const staff = audience === "families" ? 0 : db.memberships.filter((m) => m.schoolId === schoolId && m.status === "active").length;
  return { students: families, activeLinks: links, staff };
}

function view(db: DemoDB, a: Announcement, today: string) {
  return {
    ...a, createdByName: staffNameById(db, a.createdBy), className: a.originClassId ? className(db, a.originClassId) : undefined,
    scopeLabel: a.scope.type === "school" ? "Toàn trường" : a.scope.type === "grade" ? (a.scope.gradeIds ?? []).map((g) => db.grades.find((x) => x.id === g)?.name).join(", ") : a.scope.type === "class" ? `Lớp ${(a.scope.classIds ?? []).map((c) => className(db, c)).join(", ")}` : `Riêng: ${(a.scope.studentIds ?? []).map((s) => db.students.find((x) => x.id === s)?.fullName).join(", ")}`,
    audienceLabel: a.audience === "staff" ? "Nội bộ nhân sự" : a.audience === "families" ? "Gia đình học sinh" : "Nhân sự và gia đình",
    estimate: estimate(db, a.schoolId, a.scope, a.audience, today),
    attachments: a.attachmentIds.map((id) => db.files.find((f) => f.id === id)).filter(Boolean),
    historyView: a.history.map((h) => ({ ...h, byName: staffNameById(db, h.by) })),
  };
}

function canManage(db: DemoDB, ctx: Ctx, a: Pick<Announcement, "schoolId" | "origin" | "originClassId">) {
  if (a.origin === "class" && a.originClassId) return allowed(db, ctx, "announcement.class", { schoolId: a.schoolId, classId: a.originClassId });
  return allowed(db, ctx, "announcement.school", { schoolId: a.schoolId });
}

export interface ComposeInput {
  id?: ID; origin: "school" | "class"; originClassId?: ID; title: string; summary: string; body: Announcement["body"]; audience: Announcement["audience"];
  scope: AnnouncementScope; isPublic: boolean; attachmentIds: ID[]; internalNote?: string; action: "draft" | "publish" | "schedule"; scheduledAt?: string; version?: number;
}

export const announcementsRepo = {
  async schoolList(ctx: Ctx, schoolId: ID, q: ListQuery) {
    return read((db) => {
      requireAction(db, ctx, "school.view", { schoolId });
      const f = q.filters ?? {};
      const rows = db.announcements.filter((a) => a.schoolId === schoolId && (f.origin ? a.origin === f.origin : true) && (!f.status || a.status === f.status) && (a.origin === "school" || allowed(db, ctx, "publication.oversee", { schoolId })))
        .map((a) => view(db, a, ctx.today)).filter((a) => matches(q.q ?? "", a.title, a.summary)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      const all = db.announcements.filter((a) => a.schoolId === schoolId);
      return { ...paginate(rows, q), counts: { draft: all.filter((a) => a.status === "draft").length, scheduled: all.filter((a) => a.status === "scheduled").length, published: all.filter((a) => a.status === "published").length, withdrawn: all.filter((a) => a.status === "withdrawn").length }, canCompose: allowed(db, ctx, "announcement.school", { schoolId }) };
    });
  },

  async classList(ctx: Ctx, schoolId: ID, classId: ID, opts: { status?: string } = {}) {
    return read((db) => {
      requireAction(db, ctx, "announcement.class", { schoolId, classId });
      const cls = findOr404(db.classes.find((c) => c.id === classId && c.schoolId === schoolId), "lớp");
      const own = db.announcements.filter((a) => a.originClassId === classId && (!opts.status || a.status === opts.status)).map((a) => view(db, a, ctx.today)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      const fromSchool = db.announcements.filter((a) => a.schoolId === schoolId && a.origin === "school" && a.status === "published" && (a.scope.type === "school" || (a.scope.type === "grade" && a.scope.gradeIds?.includes(cls.gradeId)) || (a.scope.type === "class" && a.scope.classIds?.includes(classId)))).map((a) => view(db, a, ctx.today)).slice(0, 5);
      return { own, fromSchool };
    });
  },

  async detail(ctx: Ctx, schoolId: ID, id: ID) {
    return read((db) => {
      const a = findOr404(db.announcements.find((x) => x.id === id && x.schoolId === schoolId), "thông báo");
      if (a.origin === "class" && a.originClassId) {
        if (!allowed(db, ctx, "publication.oversee", { schoolId })) requireAction(db, ctx, "announcement.class", { schoolId, classId: a.originClassId });
      } else requireAction(db, ctx, "school.view", { schoolId });
      return { ...view(db, a, ctx.today), canEdit: canManage(db, ctx, a) };
    });
  },

  async composeOptions(ctx: Ctx, schoolId: ID, classId?: ID) {
    return read((db) => {
      if (classId) requireAction(db, ctx, "announcement.class", { schoolId, classId });
      else requireAction(db, ctx, "announcement.school", { schoolId });
      const year = currentYear(db, schoolId);
      return {
        grades: classId ? [] : db.grades.filter((g) => g.schoolId === schoolId && g.status === "active"),
        classes: classId ? db.classes.filter((c) => c.id === classId) : db.classes.filter((c) => c.schoolId === schoolId && c.yearId === year?.id && c.status === "active"),
        students: (classId ? rosterOn(db, classId, ctx.today) : []).map((s) => ({ id: s.id, fullName: s.fullName, code: s.code })).sort((a, b) => nameCompare(a.fullName, b.fullName)),
        files: db.files.filter((f) => f.schoolId === schoolId && f.status === "active" && f.share !== "internal" && (classId ? f.classId === classId || !f.classId : !f.classId || true) && f.category !== "evidence").map((f) => ({ id: f.id, name: f.name, share: f.share })),
      };
    });
  },

  async estimate(ctx: Ctx, schoolId: ID, scope: AnnouncementScope, audience: Announcement["audience"]) {
    return read((db) => estimate(db, schoolId, scope, audience, ctx.today));
  },

  /** O29 — save draft / publish / schedule (demo clock simulation). Class composer cannot target other classes. */
  async save(ctx: Ctx, schoolId: ID, input: ComposeInput) {
    return write((db) => {
      if (input.origin === "class") {
        if (!input.originClassId) throw new RepoError("VALIDATION", "Thiếu lớp.");
        requireAction(db, ctx, "announcement.class", { schoolId, classId: input.originClassId });
        const okScope = (input.scope.type === "class" && input.scope.classIds?.length === 1 && input.scope.classIds[0] === input.originClassId) ||
          (input.scope.type === "student" && (input.scope.studentIds ?? []).every((sid) => enrollmentsOn(db, input.originClassId!, ctx.today).some((e) => e.studentId === sid)));
        if (!okScope) throw new RepoError("FORBIDDEN", "Thông báo lớp chỉ gửi đến lớp hiện tại hoặc học sinh của lớp.");
        if (input.isPublic) throw new RepoError("FORBIDDEN", "Thông báo lớp không đăng lên trang công khai.");
      } else requireAction(db, ctx, "announcement.school", { schoolId });
      const errors: Record<string, string> = {};
      if (input.title.trim().length < 5) errors.title = "Tiêu đề tối thiểu 5 ký tự";
      if (input.summary.trim().length < 10) errors.summary = "Tóm tắt tối thiểu 10 ký tự";
      if (!input.body.some((b) => b.text.trim())) errors.body = "Nhập nội dung";
      if ([input.title, input.summary, ...input.body.map((b) => b.text)].some((t) => /<\s*\/?\s*(script|iframe|img|a|style)/i.test(t))) errors.body = "Không chèn mã HTML/script";
      if (input.scope.type === "student" && !(input.scope.studentIds ?? []).length) errors.scope = "Chọn học sinh nhận thông báo riêng";
      if (input.scope.type === "grade" && !(input.scope.gradeIds ?? []).length) errors.scope = "Chọn khối";
      if (input.scope.type === "class" && !(input.scope.classIds ?? []).length) errors.scope = "Chọn lớp";
      const privateFiles = input.attachmentIds.filter((id) => db.files.find((f) => f.id === id)?.share === "student_parent");
      if (privateFiles.length && input.scope.type !== "student") errors.attachmentIds = "Tệp chỉ chia sẻ cho phụ huynh một em không được đính kèm thông báo gửi rộng";
      if (input.isPublic && (input.scope.type !== "school" || input.audience === "staff")) errors.isPublic = "Chỉ thông báo toàn trường gửi gia đình mới được đăng công khai";
      if (input.action === "schedule" && (!input.scheduledAt || input.scheduledAt <= ctx.now)) errors.scheduledAt = "Chọn thời điểm công bố sau hiện tại (theo đồng hồ demo)";
      if (Object.keys(errors).length) validation(errors);
      let a: Announcement;
      const historyAction = input.action === "draft" ? "Lưu nháp" : input.action === "schedule" ? "Đặt lịch công bố (mô phỏng)" : "Công bố";
      if (input.id) {
        a = findOr404(db.announcements.find((x) => x.id === input.id && x.schoolId === schoolId), "thông báo");
        if (input.version !== undefined && a.version !== input.version) throw new RepoError("CONFLICT");
        if (a.status === "withdrawn") throw new RepoError("VALIDATION", "Thông báo đã thu hồi — tạo thông báo mới.");
        Object.assign(a, { title: input.title.trim(), summary: input.summary.trim(), body: input.body, audience: input.audience, scope: input.scope, isPublic: input.isPublic, attachmentIds: input.attachmentIds, internalNote: input.internalNote, updatedAt: ctx.now, version: a.version + 1 });
      } else {
        a = { id: newId("an"), schoolId, origin: input.origin, originClassId: input.originClassId, title: input.title.trim(), summary: input.summary.trim(), body: input.body, audience: input.audience, scope: input.scope, isPublic: input.isPublic, attachmentIds: input.attachmentIds, status: "draft", createdBy: actorId(ctx), createdAt: ctx.now, updatedAt: ctx.now, internalNote: input.internalNote, history: [], version: 1 };
        db.announcements.push(a);
      }
      if (input.action === "publish") { a.status = "published"; a.publishedAt = ctx.now; a.scheduledAt = undefined; }
      else if (input.action === "schedule") { a.status = "scheduled"; a.scheduledAt = input.scheduledAt; }
      else if (a.status !== "published") a.status = "draft";
      a.history.push({ at: ctx.now, by: actorId(ctx), action: input.id && a.status === "published" && input.action === "draft" ? "Sửa nội dung đã công bố" : historyAction });
      audit(db, ctx, { level: "school", schoolId, action: `${historyAction} thông báo`, entityType: "announcement", entityId: a.id, entityLabel: a.title });
      return a;
    });
  },

  async withdraw(ctx: Ctx, schoolId: ID, id: ID, reason: string) {
    return write((db) => {
      const a = findOr404(db.announcements.find((x) => x.id === id && x.schoolId === schoolId), "thông báo");
      if (!canManage(db, ctx, a)) throw new RepoError("FORBIDDEN");
      if (a.status !== "published" && a.status !== "scheduled") throw new RepoError("VALIDATION", "Chỉ thu hồi thông báo đã công bố hoặc đã đặt lịch.");
      if (reason.trim().length < 5) validation({ reason: "Ghi lý do thu hồi" });
      a.status = "withdrawn"; a.withdrawnAt = ctx.now; a.withdrawReason = reason.trim(); a.version += 1;
      a.history.push({ at: ctx.now, by: actorId(ctx), action: `Thu hồi: ${reason.trim()}` });
      audit(db, ctx, { level: "school", schoolId, action: "Thu hồi thông báo", entityType: "announcement", entityId: a.id, entityLabel: a.title, reason });
      return a;
    });
  },

  /** O31 — drafts with no history outside the author can be deleted; published ones are withdrawn instead. */
  async deleteDraft(ctx: Ctx, schoolId: ID, id: ID) {
    return write((db) => {
      const a = findOr404(db.announcements.find((x) => x.id === id && x.schoolId === schoolId), "thông báo");
      if (!canManage(db, ctx, a)) throw new RepoError("FORBIDDEN");
      if (a.status !== "draft") throw new RepoError("VALIDATION", "Chỉ xóa được bản nháp chưa từng công bố. Bản đã công bố hãy thu hồi.");
      db.announcements = db.announcements.filter((x) => x.id !== a.id);
      audit(db, ctx, { level: "school", schoolId, action: "Xóa bản nháp thông báo", entityType: "announcement", entityId: a.id, entityLabel: a.title });
      return true;
    });
  },

  /** TE05 — announcements a teacher may read at this school (staff/all + own classes' announcements). */
  async forTeacher(ctx: Ctx, schoolId: ID) {
    const uid = requireStaff(ctx);
    return read((db) => {
      const m = db.memberships.find((x) => x.userId === uid && x.schoolId === schoolId && x.status === "active");
      if (!m) throw new RepoError("FORBIDDEN");
      const classIds = new Set(liveAssignments(db, m.id, ctx.today).map((a) => a.classId));
      const reads = new Set(db.notifications.filter((n) => n.userId === uid && n.readAt && n.kind === "announcement").map((n) => n.href));
      return db.announcements.filter((a) => a.schoolId === schoolId && a.status === "published" && (a.origin === "school" ? a.audience !== "families" || a.scope.type === "school" : classIds.has(a.originClassId ?? "")))
        .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "")).map((a) => ({ ...view(db, a, ctx.today), read: reads.has(`ann:${a.id}`) }));
    });
  },

  async markTeacherRead(ctx: Ctx, schoolId: ID, id: ID) {
    const uid = requireStaff(ctx);
    return write((db) => {
      if (!db.notifications.some((n) => n.userId === uid && n.href === `ann:${id}`)) db.notifications.push({ id: newId("nt"), schoolId, userId: uid, kind: "announcement", title: "Đã đọc thông báo", body: id, href: `ann:${id}`, createdAt: ctx.now, readAt: ctx.now });
      return true;
    });
  },

  /* ------------------------------ public school page (no login) ------------------------------ */
  async publicSchool(slug: string) {
    return read((db) => {
      const s = db.schools.find((x) => x.slug === slug);
      if (!s || s.status === "draft") throw new RepoError("NOT_FOUND", "Không tìm thấy trang trường.");
      return {
        school: { name: s.name, shortName: s.shortName, slug: s.slug, address: s.address, publicPhone: s.publicPhone, publicEmail: s.publicEmail, website: s.website, motto: s.motto, publicIntro: s.publicIntro, accentColor: s.accentColor, status: s.status, level: s.level },
        news: s.status === "active" ? db.announcements.filter((a) => a.schoolId === s.id && a.isPublic && a.status === "published").sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "")).map((a) => ({ id: a.id, title: a.title, summary: a.summary, publishedAt: a.publishedAt })) : [],
      };
    });
  },

  async publicNews(slug: string, id: ID) {
    return read((db) => {
      const s = db.schools.find((x) => x.slug === slug && x.status === "active");
      const a = s && db.announcements.find((x) => x.id === id && x.schoolId === s.id && x.isPublic && x.status === "published");
      if (!s || !a) throw new RepoError("NOT_FOUND", "Tin không tồn tại hoặc không công khai.");
      return { school: { name: s.name, slug: s.slug }, news: { id: a.id, title: a.title, summary: a.summary, body: a.body, publishedAt: a.publishedAt, attachments: a.attachmentIds.map((f) => db.files.find((x) => x.id === f && x.share !== "internal" && x.status === "active" && !x.studentId)).filter(Boolean).map((f) => ({ id: f!.id, name: f!.name, mime: f!.mime, size: f!.size, source: f!.source })) } };
    });
  },
};
