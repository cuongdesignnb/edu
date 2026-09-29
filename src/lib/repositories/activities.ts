import type { Activity, FileAsset, FileShare, ID, SubmissionStatus } from "@/lib/model/types";
import { newId } from "@/lib/demo/ids";
import { matches, nameCompare } from "@/lib/formatters";
import { RepoError } from "./errors";
import { allowed, audit, findOr404, read, requireAction, requireAnyAction, validation, write, actorId, type Ctx } from "./core";
import { classGuard, refDateOf } from "./classroom";
import { className, groupOf, rosterOn, staffNameById } from "./selectors";
import { putBlob } from "./store";

/** Demo upload limits (config, not server). */
export const UPLOAD_LIMITS = { maxBytes: 5 * 1024 * 1024, types: ["image/png", "image/jpeg", "image/webp", "application/pdf"] };

function progress(db: import("@/lib/model/types").DemoDB, a: Activity) {
  const subs = db.submissions.filter((s) => s.activityId === a.id && a.assignedStudentIds.includes(s.studentId));
  const count = (st: SubmissionStatus) => subs.filter((s) => s.status === st).length;
  const total = a.assignedStudentIds.length; // denominator = assigned students only
  return { total, approved: count("approved"), pending: count("pending_review"), received: count("received"), supplement: count("needs_supplement"), notReceived: total - subs.filter((s) => s.status !== "not_received").length };
}

export const activitiesRepo = {
  async list(ctx: Ctx, schoolId: ID, yearId: ID, classId: ID, opts: { status?: string; q?: string } = {}) {
    return read((db) => {
      const c = classGuard(db, ctx, schoolId, yearId, classId);
      requireAnyAction(db, ctx, ["activity.manage", "evidence.manage", "report.class"], { schoolId, classId });
      const ref = refDateOf(db, c, ctx.today);
      const items = db.activities.filter((a) => a.classId === classId && (!opts.status || a.status === opts.status || (opts.status === "due" && a.status === "active" && a.dueDate <= ref)) && matches(opts.q ?? "", a.title, a.description))
        .sort((a, b) => (a.status === "draft" ? 1 : 0) - (b.status === "draft" ? 1 : 0) || a.dueDate.localeCompare(b.dueDate))
        .map((a) => ({ ...a, progress: progress(db, a), groupName: db.groups.find((g) => g.id === a.assignedGroupId)?.name, createdByName: staffNameById(db, a.createdBy), dueSoon: a.status === "active" && a.dueDate >= ref && a.dueDate <= clockAdd(ref, 7), overdue: a.status === "active" && a.dueDate < ref }));
      const all = db.activities.filter((a) => a.classId === classId && a.status !== "draft");
      const totals = all.reduce((acc, a) => { const p = progress(db, a); acc.total += p.total; acc.approved += p.approved; acc.notReceived += p.notReceived; return acc; }, { total: 0, approved: 0, notReceived: 0 });
      return {
        items, totals, pendingEvidence: db.evidence.filter((e) => e.classId === classId && e.status === "pending").length,
        recent: db.audit.filter((x) => x.schoolId === schoolId && (x.entityType === "evidence" || x.entityType === "activity") && x.entityLabel.includes(className(db, classId))).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6).map((x) => ({ ...x, actorName: staffNameById(db, x.actorId) })),
        canManage: allowed(db, ctx, "activity.manage", { schoolId, classId }), canEvidence: allowed(db, ctx, "evidence.manage", { schoolId, classId }),
      };
    });
  },

  async detail(ctx: Ctx, schoolId: ID, yearId: ID, classId: ID, activityId: ID) {
    return read((db) => {
      const c = classGuard(db, ctx, schoolId, yearId, classId);
      requireAnyAction(db, ctx, ["activity.manage", "evidence.manage", "report.class"], { schoolId, classId });
      const a = findOr404(db.activities.find((x) => x.id === activityId && x.classId === classId), "hoạt động");
      const ref = refDateOf(db, c, ctx.today);
      const students = a.assignedStudentIds.map((sid) => {
        const s = db.students.find((x) => x.id === sid)!;
        const sub = db.submissions.find((x) => x.activityId === a.id && x.studentId === sid);
        const ev = db.evidence.filter((e) => e.activityId === a.id && e.studentId === sid).map((e) => ({ ...e, file: db.files.find((f) => f.id === e.fileId), uploadedByName: staffNameById(db, e.uploadedBy) }));
        return { id: sid, fullName: s.fullName, code: s.code, groupName: groupOf(db, classId, sid, ref)?.name, status: sub?.status ?? "not_received", note: sub?.note, updatedAt: sub?.updatedAt, evidence: ev, stillEnrolled: rosterOn(db, classId, ref).some((x) => x.id === sid) };
      }).sort((x, y) => nameCompare(x.fullName, y.fullName));
      return {
        activity: a, progress: progress(db, a), students, groupName: db.groups.find((g) => g.id === a.assignedGroupId)?.name, createdByName: staffNameById(db, a.createdBy),
        history: db.audit.filter((x) => x.entityId === a.id || students.some((s) => s.evidence.some((e) => e.id === x.entityId))).sort((x, y) => y.at.localeCompare(x.at)).map((x) => ({ ...x, actorName: staffNameById(db, x.actorId) })),
        canManage: allowed(db, ctx, "activity.manage", { schoolId, classId }), canEvidence: allowed(db, ctx, "evidence.manage", { schoolId, classId }),
      };
    });
  },

  async formOptions(ctx: Ctx, schoolId: ID, yearId: ID, classId: ID) {
    return read((db) => {
      const c = classGuard(db, ctx, schoolId, yearId, classId);
      const ref = refDateOf(db, c, ctx.today);
      const roster = rosterOn(db, classId, ref);
      return {
        students: roster.map((s) => ({ id: s.id, fullName: s.fullName, groupId: groupOf(db, classId, s.id, ref)?.id })),
        groups: db.groups.filter((g) => g.classId === classId).sort((a, b) => a.order - b.order).map((g) => ({ id: g.id, name: g.name, size: roster.filter((s) => groupOf(db, classId, s.id, ref)?.id === g.id).length })),
        today: ref,
      };
    });
  },

  /** Create/edit. "Giao" publishes to assigned students' families; completion never adds conduct points. */
  async save(ctx: Ctx, schoolId: ID, yearId: ID, classId: ID, input: { id?: ID; title: string; description: string; illustration: Activity["illustration"]; dueDate: string; assignedStudentIds: ID[]; assignedGroupId?: ID; evidenceRequired: boolean; publish: boolean; version?: number }) {
    return write((db) => {
      const c = classGuard(db, ctx, schoolId, yearId, classId);
      requireAction(db, ctx, "activity.manage", { schoolId, classId });
      const errors: Record<string, string> = {};
      if (input.title.trim().length < 5) errors.title = "Tên hoạt động tối thiểu 5 ký tự";
      if (input.description.trim().length < 10) errors.description = "Mô tả tối thiểu 10 ký tự";
      if (/[<>]/.test(input.title + input.description)) errors.description = "Không chèn mã HTML";
      if (!input.dueDate || input.dueDate < ctx.today) errors.dueDate = "Hạn hoàn thành từ hôm nay trở đi";
      if (!input.assignedStudentIds.length) errors.assignedStudentIds = "Chọn ít nhất một học sinh hoặc một tổ";
      const roster = new Set(rosterOn(db, classId, refDateOf(db, c, ctx.today)).map((s) => s.id));
      if (input.assignedStudentIds.some((s) => !roster.has(s))) errors.assignedStudentIds = "Có học sinh không thuộc lớp";
      if (Object.keys(errors).length) validation(errors);
      let a: Activity;
      if (input.id) {
        a = findOr404(db.activities.find((x) => x.id === input.id && x.classId === classId), "hoạt động");
        if (input.version !== undefined && a.version !== input.version) throw new RepoError("CONFLICT");
        const removed = a.assignedStudentIds.filter((s) => !input.assignedStudentIds.includes(s) && db.submissions.some((x) => x.activityId === a.id && x.studentId === s && x.status !== "not_received"));
        if (removed.length) throw new RepoError("VALIDATION", "Không bỏ học sinh đã có minh chứng khỏi hoạt động.");
        Object.assign(a, { title: input.title.trim(), description: input.description.trim(), illustration: input.illustration, dueDate: input.dueDate, assignedStudentIds: input.assignedStudentIds, assignedGroupId: input.assignedGroupId, evidenceRequired: input.evidenceRequired, version: a.version + 1 });
        if (input.publish && a.status === "draft") { a.status = "active"; a.publishedToParents = true; }
      } else {
        a = { id: newId("act"), schoolId, classId, title: input.title.trim(), description: input.description.trim(), illustration: input.illustration, dueDate: input.dueDate, assignedStudentIds: input.assignedStudentIds, assignedGroupId: input.assignedGroupId, evidenceRequired: input.evidenceRequired, status: input.publish ? "active" : "draft", publishedToParents: input.publish, createdBy: actorId(ctx), createdAt: ctx.now, version: 1 };
        db.activities.push(a);
      }
      for (const sid of a.assignedStudentIds) if (!db.submissions.some((s) => s.activityId === a.id && s.studentId === sid)) db.submissions.push({ id: newId("sub"), activityId: a.id, studentId: sid, status: "not_received", updatedAt: ctx.now });
      audit(db, ctx, { level: "school", schoolId, action: input.id ? "Sửa hoạt động" : input.publish ? "Giao hoạt động" : "Lưu nháp hoạt động", entityType: "activity", entityId: a.id, entityLabel: `${className(db, classId)} — ${a.title}` });
      return a;
    });
  },

  async setActivityStatus(ctx: Ctx, schoolId: ID, yearId: ID, classId: ID, activityId: ID, status: Activity["status"]) {
    return write((db) => {
      classGuard(db, ctx, schoolId, yearId, classId);
      requireAction(db, ctx, "activity.manage", { schoolId, classId });
      const a = findOr404(db.activities.find((x) => x.id === activityId && x.classId === classId), "hoạt động");
      a.status = status;
      if (status === "active") a.publishedToParents = true;
      a.version += 1;
      audit(db, ctx, { level: "school", schoolId, action: status === "closed" ? "Kết thúc hoạt động" : "Mở hoạt động", entityType: "activity", entityId: a.id, entityLabel: `${className(db, classId)} — ${a.title}` });
      return a;
    });
  },

  /** O27 — teacher records evidence received from outside (blob kept locally). Parents never upload. */
  async addEvidence(ctx: Ctx, schoolId: ID, yearId: ID, classId: ID, input: { activityId: ID; studentId: ID; file: { name: string; type: string; size: number; blob: Blob }; note?: string }) {
    if (input.file.size > UPLOAD_LIMITS.maxBytes) throw new RepoError("VALIDATION", `Tệp vượt giới hạn demo ${UPLOAD_LIMITS.maxBytes / 1024 / 1024} MB.`, { fieldErrors: { file: "Tệp quá lớn" } });
    if (!UPLOAD_LIMITS.types.includes(input.file.type)) throw new RepoError("VALIDATION", "Chỉ nhận ảnh PNG/JPEG/WebP hoặc PDF.", { fieldErrors: { file: "Định dạng không hỗ trợ" } });
    const blobKey = newId("blob");
    await putBlob(blobKey, input.file.blob);
    return write((db) => {
      classGuard(db, ctx, schoolId, yearId, classId);
      requireAction(db, ctx, "evidence.manage", { schoolId, classId });
      const a = findOr404(db.activities.find((x) => x.id === input.activityId && x.classId === classId), "hoạt động");
      if (!a.assignedStudentIds.includes(input.studentId)) validation({ studentId: "Học sinh không được giao hoạt động này" });
      const f: FileAsset = { id: newId("f"), schoolId, classId, studentId: input.studentId, name: input.file.name, mime: input.file.type, size: input.file.size, source: { kind: "blob", blobKey }, ownerId: actorId(ctx), share: "internal", category: "evidence", status: "active", createdAt: ctx.now };
      db.files.push(f);
      const ev = { id: newId("ev"), schoolId, classId, activityId: a.id, studentId: input.studentId, fileId: f.id, uploadedBy: actorId(ctx), uploadedAt: ctx.now, status: "pending" as const, reviewNote: input.note, sharedWithParent: false };
      db.evidence.push(ev);
      const sub = db.submissions.find((s) => s.activityId === a.id && s.studentId === input.studentId);
      if (sub) { sub.status = "pending_review"; sub.updatedAt = ctx.now; sub.updatedBy = actorId(ctx); sub.note = undefined; }
      audit(db, ctx, { level: "school", schoolId, action: "Ghi nhận minh chứng (tệp lưu cục bộ, mô phỏng)", entityType: "evidence", entityId: ev.id, entityLabel: `${className(db, classId)} — ${db.students.find((s) => s.id === input.studentId)?.fullName}: ${a.title}` });
      return ev;
    });
  },

  async setSubmission(ctx: Ctx, schoolId: ID, yearId: ID, classId: ID, input: { activityId: ID; studentIds: ID[]; status: SubmissionStatus; note?: string }) {
    return write((db) => {
      classGuard(db, ctx, schoolId, yearId, classId);
      requireAction(db, ctx, "evidence.manage", { schoolId, classId });
      if (input.status === "needs_supplement" && (input.note ?? "").trim().length < 5) validation({ note: "Ghi rõ nội dung cần bổ sung" });
      let n = 0;
      for (const sid of input.studentIds) {
        const s = db.submissions.find((x) => x.activityId === input.activityId && x.studentId === sid);
        if (!s) continue;
        s.status = input.status; s.note = input.note?.trim(); s.updatedAt = ctx.now; s.updatedBy = actorId(ctx); n++;
      }
      audit(db, ctx, { level: "school", schoolId, action: "Cập nhật tình trạng hoạt động", entityType: "activity", entityId: input.activityId, entityLabel: `${className(db, classId)}: ${n} học sinh`, reason: input.note });
      return n;
    });
  },

  /** Approve / reject / request supplement with reason. Approval can share the file with that student's family. */
  async reviewEvidence(ctx: Ctx, schoolId: ID, yearId: ID, classId: ID, input: { evidenceIds: ID[]; decision: "approved" | "rejected" | "supplement"; note?: string; shareWithParent: boolean }) {
    return write((db) => {
      classGuard(db, ctx, schoolId, yearId, classId);
      requireAction(db, ctx, "evidence.manage", { schoolId, classId });
      if (input.decision !== "approved" && (input.note ?? "").trim().length < 5) validation({ note: "Ghi lý do (tối thiểu 5 ký tự)" });
      let n = 0;
      for (const id of input.evidenceIds) {
        const e = db.evidence.find((x) => x.id === id && x.classId === classId);
        if (!e) continue;
        e.status = input.decision; e.reviewNote = input.note?.trim(); e.sharedWithParent = input.decision === "approved" && input.shareWithParent;
        const f = db.files.find((x) => x.id === e.fileId);
        if (f) f.share = e.sharedWithParent ? "student_parent" : "internal";
        const sub = db.submissions.find((s) => s.activityId === e.activityId && s.studentId === e.studentId);
        if (sub) { sub.status = input.decision === "approved" ? "approved" : "needs_supplement"; sub.note = input.decision === "approved" ? undefined : input.note?.trim(); sub.updatedAt = ctx.now; sub.updatedBy = actorId(ctx); }
        n++;
      }
      audit(db, ctx, { level: "school", schoolId, action: input.decision === "approved" ? "Duyệt minh chứng" : input.decision === "rejected" ? "Từ chối minh chứng" : "Yêu cầu bổ sung minh chứng", entityType: "evidence", entityId: input.evidenceIds[0] ?? "", entityLabel: `${className(db, classId)}: ${n} minh chứng`, reason: input.note });
      return n;
    });
  },

  async evidence(ctx: Ctx, schoolId: ID, yearId: ID, classId: ID, opts: { status?: string; activityId?: ID; q?: string } = {}) {
    return read((db) => {
      classGuard(db, ctx, schoolId, yearId, classId);
      requireAnyAction(db, ctx, ["evidence.manage", "report.class"], { schoolId, classId });
      return {
        items: db.evidence.filter((e) => e.classId === classId && (!opts.status || e.status === opts.status) && (!opts.activityId || e.activityId === opts.activityId)).map((e) => ({
          ...e, file: db.files.find((f) => f.id === e.fileId)!, studentName: db.students.find((s) => s.id === e.studentId)?.fullName ?? "", activityTitle: db.activities.find((a) => a.id === e.activityId)?.title ?? "", uploadedByName: staffNameById(db, e.uploadedBy),
        })).filter((e) => matches(opts.q ?? "", e.studentName, e.activityTitle)).sort((a, b) => (a.status === "pending" ? -1 : 0) - (b.status === "pending" ? -1 : 0) || b.uploadedAt.localeCompare(a.uploadedAt)),
        activities: db.activities.filter((a) => a.classId === classId && a.status !== "draft").map((a) => ({ id: a.id, title: a.title, assigned: a.assignedStudentIds })),
        students: rosterOn(db, classId, ctx.today).map((s) => ({ id: s.id, fullName: s.fullName })),
        canManage: allowed(db, ctx, "evidence.manage", { schoolId, classId }),
      };
    });
  },

  /* ------------------------------ class files ------------------------------ */
  async files(ctx: Ctx, schoolId: ID, yearId: ID, classId: ID, opts: { share?: string; status?: string; q?: string } = {}) {
    return read((db) => {
      classGuard(db, ctx, schoolId, yearId, classId);
      requireAction(db, ctx, "files.manage", { schoolId, classId });
      return db.files.filter((f) => f.classId === classId && f.category !== "evidence" && (!opts.share || f.share === opts.share) && (opts.status ? f.status === opts.status : f.status !== "revoked") && matches(opts.q ?? "", f.name))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((f) => ({ ...f, ownerName: staffNameById(db, f.ownerId), studentName: f.studentId ? db.students.find((s) => s.id === f.studentId)?.fullName : undefined }));
    });
  },

  async uploadFile(ctx: Ctx, schoolId: ID, yearId: ID, classId: ID, input: { file: { name: string; type: string; size: number; blob: Blob }; share: FileShare; studentId?: ID }) {
    const allowedTypes = [...UPLOAD_LIMITS.types, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "text/csv"];
    if (input.file.size > UPLOAD_LIMITS.maxBytes) throw new RepoError("VALIDATION", "Tệp vượt giới hạn demo 5 MB.", { fieldErrors: { file: "Tệp quá lớn" } });
    if (!allowedTypes.includes(input.file.type)) throw new RepoError("VALIDATION", "Định dạng tệp không được hỗ trợ trong bản demo.", { fieldErrors: { file: "Định dạng không hỗ trợ" } });
    const blobKey = newId("blob");
    await putBlob(blobKey, input.file.blob);
    return write((db) => {
      classGuard(db, ctx, schoolId, yearId, classId);
      requireAction(db, ctx, "files.manage", { schoolId, classId });
      if (input.share === "student_parent" && !input.studentId) validation({ studentId: "Chọn học sinh được chia sẻ" });
      const f: FileAsset = { id: newId("f"), schoolId, classId, studentId: input.studentId, name: input.file.name, mime: input.file.type, size: input.file.size, source: { kind: "blob", blobKey }, ownerId: actorId(ctx), share: input.share, category: input.share === "student_parent" ? "report" : "document", status: "active", createdAt: ctx.now };
      db.files.push(f);
      audit(db, ctx, { level: "school", schoolId, action: "Tải tệp lớp (lưu cục bộ, mô phỏng)", entityType: "file", entityId: f.id, entityLabel: `${className(db, classId)} — ${f.name}` });
      return f;
    });
  },

  async updateFile(ctx: Ctx, schoolId: ID, yearId: ID, classId: ID, fileId: ID, patch: { share?: FileShare; status?: FileAsset["status"] }) {
    return write((db) => {
      classGuard(db, ctx, schoolId, yearId, classId);
      requireAction(db, ctx, "files.manage", { schoolId, classId });
      const f = findOr404(db.files.find((x) => x.id === fileId && x.classId === classId), "tệp");
      if (patch.share === "student_parent" && !f.studentId) throw new RepoError("VALIDATION", "Tệp chưa gắn với học sinh cụ thể.");
      const before = { share: f.share, status: f.status };
      Object.assign(f, patch);
      audit(db, ctx, { level: "school", schoolId, action: patch.status === "archived" ? "Lưu trữ tệp" : patch.status === "revoked" ? "Thu hồi chia sẻ tệp" : "Đổi phạm vi chia sẻ tệp", entityType: "file", entityId: f.id, entityLabel: f.name, before, after: { share: f.share, status: f.status } });
      return f;
    });
  },

  /** Staff file access (for preview/download); checks class scope on every read. */
  async file(ctx: Ctx, schoolId: ID, fileId: ID) {
    return read((db) => {
      const f = findOr404(db.files.find((x) => x.id === fileId && x.schoolId === schoolId), "tệp");
      if (f.classId) requireAnyAction(db, ctx, ["files.manage", "evidence.manage", "report.class"], { schoolId, classId: f.classId });
      else requireAction(db, ctx, "school.view", { schoolId });
      if (f.status === "revoked") throw new RepoError("REVOKED", "Tệp đã bị thu hồi.");
      return f;
    });
  },
};

function clockAdd(d: string, n: number) {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}
