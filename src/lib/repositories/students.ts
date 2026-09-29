import type { DemoDB, Gender, ID, ParentAccess, ParentModule, Student, GuardianRelationship, ImportJob } from "@/lib/model/types";
import { newDemoToken, newId } from "@/lib/demo/ids";
import { addDays } from "@/lib/demo/clock";
import { fold, matches, nameCompare, parentModuleLabel } from "@/lib/formatters";
import { RepoError } from "./errors";
import { allowed, audit, findOr404, paginate, read, requireAction, requireAnyAction, validation, write, actorId, type Ctx, type ListQuery } from "./core";
import { className, classOfStudentOn, currentYear, enrollmentsOn, groupOf, homeroomTeacher, latestClassOf, positionsOf, staffName, staffNameById } from "./selectors";

export type AccessStatus = "active" | "expired" | "revoked";
export function accessStatus(pa: ParentAccess, now: string): AccessStatus {
  if (pa.revokedAt) return "revoked";
  if (pa.expiresAt < now) return "expired";
  return "active";
}

/** Class-scoped check: school-wide role OR a grant on the student's current class. */
function requireStudentAction(db: DemoDB, ctx: Ctx, schoolId: ID, studentId: ID, schoolAction: Parameters<typeof allowed>[2], classAction: Parameters<typeof allowed>[2]) {
  if (allowed(db, ctx, schoolAction, { schoolId })) return;
  const cls = classOfStudentOn(db, studentId, ctx.today) ?? latestClassOf(db, studentId);
  requireAction(db, ctx, classAction, { schoolId, classId: cls?.id });
}

export interface StudentRow {
  id: ID; code: string; fullName: string; dob: string; gender: Gender; status: Student["status"]; className: string; classId?: ID; yearLabel?: string;
  guardianCount: number; verifiedGuardians: number; activeLinks: number; avatarTone: string;
}

function studentRow(db: DemoDB, s: Student, today: string): StudentRow {
  const cls = classOfStudentOn(db, s.id, today) ?? latestClassOf(db, s.id);
  const rels = db.relationships.filter((r) => r.studentId === s.id);
  return {
    id: s.id, code: s.code, fullName: s.fullName, dob: s.dob, gender: s.gender, status: s.status, className: cls?.name ?? "—", classId: cls?.id,
    yearLabel: cls ? db.years.find((y) => y.id === cls.yearId)?.label : undefined, guardianCount: rels.filter((r) => r.verification !== "revoked").length,
    verifiedGuardians: rels.filter((r) => r.verification === "verified").length,
    activeLinks: db.parentAccesses.filter((p) => p.studentId === s.id && accessStatus(p, `${today}T12:00:00+07:00`) === "active").length, avatarTone: s.avatarTone,
  };
}

export interface ImportRowInput { rowNo: number; code?: string; fullName?: string; dob?: string; gender?: string; guardianName?: string; guardianRelation?: string; guardianPhone?: string }
export interface ImportRowResult extends ImportRowInput { result: "new" | "update" | "skip" | "error" | "warning"; message: string; matchId?: ID }

function parseDob(v?: string): string | null {
  if (!v) return null;
  const m = v.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const iso = `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  const dt = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== iso) return null;
  return iso;
}

function analyseImport(db: DemoDB, schoolId: ID, classId: ID, rows: ImportRowInput[], mode: "add_only" | "add_update"): ImportRowResult[] {
  const seenCodes = new Set<string>();
  return rows.map((r) => {
    const name = (r.fullName ?? "").trim().replace(/\s+/g, " ");
    const dob = parseDob(r.dob);
    const gender = fold(r.gender ?? "") === "nam" ? "Nam" : fold(r.gender ?? "") === "nu" ? "Nữ" : null;
    if (!name) return { ...r, result: "error", message: "Thiếu họ và tên" };
    if (!dob) return { ...r, result: "error", message: "Ngày sinh không đúng định dạng dd/MM/yyyy" };
    if (!gender) return { ...r, result: "error", message: "Giới tính phải là Nam hoặc Nữ" };
    if (r.guardianPhone && !/^[0-9 .+*-]{8,15}$/.test(r.guardianPhone)) return { ...r, result: "error", message: "Số điện thoại người giám hộ chưa hợp lệ" };
    const code = r.code?.trim().toUpperCase();
    if (code) {
      if (seenCodes.has(code)) return { ...r, result: "error", message: `Mã ${code} lặp lại trong tệp` };
      seenCodes.add(code);
      const existing = db.students.find((s) => s.schoolId === schoolId && s.code === code);
      if (existing) {
        if (fold(existing.fullName) !== fold(name)) return { ...r, result: "error", message: `Mã ${code} đã thuộc học sinh ${existing.fullName}` };
        return mode === "add_update" ? { ...r, result: "update", message: "Cập nhật thông tin theo mã", matchId: existing.id } : { ...r, result: "skip", message: "Đã có (bỏ qua, không nhân đôi)", matchId: existing.id };
      }
    }
    const sameInClass = db.students.find((s) => s.schoolId === schoolId && fold(s.fullName) === fold(name) && s.dob === dob && db.enrollments.some((e) => e.studentId === s.id && e.classId === classId && !e.endDate));
    if (sameInClass) return { ...r, result: "skip", message: `Đã có trong lớp (${sameInClass.code}) — không nhân đôi`, matchId: sameInClass.id };
    const sameName = db.students.filter((s) => s.schoolId === schoolId && fold(s.fullName) === fold(name));
    if (sameName.length) return { ...r, result: "warning", message: `Trùng tên với ${sameName.map((s) => s.code).join(", ")} — sẽ tạo hồ sơ riêng, không gộp` };
    return { ...r, result: "new", message: "Thêm mới" };
  });
}

export const studentsRepo = {
  async list(ctx: Ctx, schoolId: ID, q: ListQuery) {
    return read((db) => {
      requireAction(db, ctx, "student.view.all", { schoolId });
      const f = q.filters ?? {};
      const year = f.yearId ?? currentYear(db, schoolId)?.id;
      const inYear = new Set(db.enrollments.filter((e) => e.yearId === year).map((e) => e.studentId));
      const rows = db.students.filter((s) => s.schoolId === schoolId && inYear.has(s.id)).map((s) => studentRow(db, s, ctx.today))
        .filter((r) => matches(q.q ?? "", r.fullName, r.code) && (!f.classId || r.classId === f.classId) && (!f.status || r.status === f.status) && (!f.guardian || (f.guardian === "unverified" ? r.verifiedGuardians === 0 : true)))
        .sort((a, b) => nameCompare(a.fullName, b.fullName));
      return paginate(rows, q, { name: (a, b) => nameCompare(a.fullName, b.fullName), code: (a, b) => a.code.localeCompare(b.code), class: (a, b) => a.className.localeCompare(b.className, "vi") });
    });
  },

  /**
   * Student profile projection. Fields are chosen by the actor's grants:
   * subject teachers get a minimal profile; guardians/links only with the matching grant.
   */
  async profile(ctx: Ctx, schoolId: ID, studentId: ID, classId?: ID) {
    return read((db) => {
      const s = findOr404(db.students.find((x) => x.id === studentId && x.schoolId === schoolId), "học sinh");
      const cls = classOfStudentOn(db, s.id, ctx.today) ?? latestClassOf(db, s.id);
      const scopeClass = classId ?? cls?.id;
      if (classId && !db.enrollments.some((e) => e.studentId === s.id && e.classId === classId)) throw new RepoError("NOT_FOUND", "Học sinh không thuộc lớp này.");
      const schoolWide = allowed(db, ctx, "student.view.all", { schoolId });
      if (!schoolWide) requireAnyAction(db, ctx, ["student.profile.view", "roster.view"], { schoolId, classId: scopeClass });
      const full = schoolWide || allowed(db, ctx, "student.profile.view", { schoolId, classId: scopeClass });
      const seeGuardians = allowed(db, ctx, "guardian.manage.all", { schoolId }) || allowed(db, ctx, "guardian.view", { schoolId, classId: scopeClass });
      const manageLinks = allowed(db, ctx, "parentAccess.manage.all", { schoolId }) || allowed(db, ctx, "parentAccess.issue", { schoolId, classId: scopeClass });
      const history = db.enrollments.filter((e) => e.studentId === s.id).sort((a, b) => b.startDate.localeCompare(a.startDate)).map((e) => {
        const c = db.classes.find((x) => x.id === e.classId)!;
        const y = db.years.find((x) => x.id === e.yearId)!;
        return { ...e, className: c.name, yearLabel: y.label, homeroom: staffName(homeroomTeacher(db, c.id, e.endDate ?? (y.status === "archived" ? addDays(y.endDate, -62) : ctx.today))) };
      });
      const rels = seeGuardians ? db.relationships.filter((r) => r.studentId === s.id).map((r) => {
        const g = db.guardians.find((x) => x.id === r.guardianId)!;
        return { ...r, guardian: g, verifiedByName: staffNameById(db, r.verifiedBy) };
      }) : [];
      const links = manageLinks ? db.parentAccesses.filter((p) => p.studentId === s.id).map((p) => {
        const rel = db.relationships.find((r) => r.id === p.relationshipId)!;
        const g = db.guardians.find((x) => x.id === rel.guardianId)!;
        const logs = db.parentAccessLogs.filter((l) => l.accessId === p.id);
        return { ...p, status: accessStatus(p, ctx.now), guardianName: g.fullName, relation: rel.relation, yearLabel: db.years.find((y) => y.id === p.yearId)?.label ?? "", opens: logs.filter((l) => l.event === "opened" || l.event === "viewed").length, lastOpenedAt: logs.filter((l) => l.event === "opened" || l.event === "viewed").map((l) => l.at).sort().pop() };
      }).sort((a, b) => b.issuedAt.localeCompare(a.issuedAt)) : [];
      const accessLog = manageLinks ? db.parentAccessLogs.filter((l) => links.some((p) => p.id === l.accessId)).sort((a, b) => b.at.localeCompare(a.at)).map((l) => {
        const p = links.find((x) => x.id === l.accessId)!;
        return { ...l, label: `Link cấp cho ${p.relation.toLowerCase()} (${p.guardianName})` };
      }) : [];
      return {
        student: full ? s : { id: s.id, code: s.code, fullName: s.fullName, gender: s.gender, status: s.status, avatarTone: s.avatarTone, version: s.version } as Partial<Student> & { id: ID; code: string; fullName: string },
        level: full ? "full" as const : "subject-minimal" as const,
        currentClass: cls ? { id: cls.id, name: cls.name, yearId: cls.yearId, yearLabel: db.years.find((y) => y.id === cls.yearId)?.label, homeroom: staffName(homeroomTeacher(db, cls.id, ctx.today)) } : null,
        group: cls && full ? groupOf(db, cls.id, s.id, ctx.today)?.name : undefined,
        positions: cls ? positionsOf(db, cls.id, s.id, ctx.today).map((p) => p.position) : [],
        history: full ? history : history.filter((h) => h.classId === scopeClass),
        relationships: rels, links, accessLog,
        perms: {
          edit: allowed(db, ctx, "student.edit", { schoolId }), transfer: allowed(db, ctx, "student.transfer", { schoolId }) || allowed(db, ctx, "groups.manage", { schoolId, classId: scopeClass }),
          seeGuardians, editGuardians: allowed(db, ctx, "guardian.manage.all", { schoolId }) || allowed(db, ctx, "guardian.edit", { schoolId, classId: scopeClass }), manageLinks,
          seeInternalNote: full,
        },
      };
    });
  },

  async create(ctx: Ctx, schoolId: ID, input: { code?: string; fullName: string; dob: string; gender: Gender; classId: ID; startDate: string; guardian?: { fullName: string; relation: GuardianRelationship["relation"]; phone: string } }) {
    return write((db) => {
      requireAction(db, ctx, "student.edit", { schoolId });
      const errors: Record<string, string> = {};
      if (input.fullName.trim().split(/\s+/).length < 2) errors.fullName = "Nhập đầy đủ họ và tên";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dob)) errors.dob = "Chọn ngày sinh";
      else if (input.dob > addDays(ctx.today, -365 * 5)) errors.dob = "Ngày sinh chưa hợp lệ";
      const cls = db.classes.find((c) => c.id === input.classId && c.schoolId === schoolId);
      if (!cls) errors.classId = "Chọn lớp";
      else if (cls.status === "archived") errors.classId = "Lớp đã lưu trữ";
      else if (enrollmentsOn(db, cls.id, input.startDate).length >= cls.capacity) errors.classId = `Lớp ${cls.name} đã đủ sức chứa ${cls.capacity}`;
      const code = (input.code ?? "").trim().toUpperCase();
      if (code && db.students.some((s) => s.schoolId === schoolId && s.code === code)) errors.code = "Mã học sinh đã tồn tại";
      if (input.guardian && input.guardian.fullName.trim() && !/^[0-9 .+*-]{8,15}$/.test(input.guardian.phone)) errors["guardian.phone"] = "Số điện thoại chưa hợp lệ";
      if (Object.keys(errors).length) validation(errors);
      const prefix = db.students.find((s) => s.schoolId === schoolId)?.code.slice(0, 4) ?? "HS26";
      const nextNo = Math.max(0, ...db.students.filter((s) => s.schoolId === schoolId && s.code.startsWith(prefix)).map((s) => Number(s.code.slice(4)) || 0)) + 1;
      const s: Student = { id: newId("st"), schoolId, code: code || `${prefix}${String(nextNo).padStart(3, "0")}`, fullName: input.fullName.trim().replace(/\s+/g, " "), dob: input.dob, gender: input.gender, status: "studying", avatarTone: "blue", version: 1, updatedAt: ctx.now, updatedBy: actorId(ctx) };
      db.students.push(s);
      db.enrollments.push({ id: newId("en"), schoolId, studentId: s.id, classId: cls!.id, yearId: cls!.yearId, startDate: input.startDate, status: "active" });
      if (input.guardian?.fullName.trim()) {
        const g = { id: newId("gd"), schoolId, fullName: input.guardian.fullName.trim(), phoneMasked: input.guardian.phone.replace(/(\d{4})\d+(\d{3})$/, "$1 *** $2"), version: 1 };
        db.guardians.push(g);
        // Entered contact ≠ verified: verification is a separate, explicit step.
        db.relationships.push({ id: newId("rel"), schoolId, guardianId: g.id, studentId: s.id, relation: input.guardian.relation, isPrimaryContact: true, verification: "unverified" });
      }
      audit(db, ctx, { level: "school", schoolId, action: "Thêm học sinh", entityType: "student", entityId: s.id, entityLabel: `${s.fullName} (${s.code}) — ${cls!.name}` });
      return s;
    });
  },

  async update(ctx: Ctx, schoolId: ID, studentId: ID, patch: { fullName: string; dob: string; gender: Gender; internalNote?: string; version: number }) {
    return write((db) => {
      requireAction(db, ctx, "student.edit", { schoolId });
      const s = findOr404(db.students.find((x) => x.id === studentId && x.schoolId === schoolId), "học sinh");
      if (s.version !== patch.version) throw new RepoError("CONFLICT", `Hồ sơ đã được ${staffNameById(db, s.updatedBy)} cập nhật lúc ${s.updatedAt.slice(11, 16)}. Hãy tải lại để xem bản mới.`, { details: { updatedBy: staffNameById(db, s.updatedBy), updatedAt: s.updatedAt } });
      if (patch.fullName.trim().split(/\s+/).length < 2) validation({ fullName: "Nhập đầy đủ họ và tên" });
      const before = { fullName: s.fullName, dob: s.dob, gender: s.gender };
      Object.assign(s, { fullName: patch.fullName.trim(), dob: patch.dob, gender: patch.gender, internalNote: patch.internalNote, version: s.version + 1, updatedAt: ctx.now, updatedBy: actorId(ctx) });
      audit(db, ctx, { level: "school", schoolId, action: "Sửa hồ sơ học sinh", entityType: "student", entityId: s.id, entityLabel: s.fullName, before, after: { fullName: s.fullName, dob: s.dob, gender: s.gender } });
      return s;
    });
  },

  /* ------------------------------ transfers ------------------------------ */
  async transfers(ctx: Ctx, schoolId: ID, q: ListQuery) {
    return read((db) => {
      requireAnyAction(db, ctx, ["student.transfer", "student.view.all"], { schoolId });
      const f = q.filters ?? {};
      const rows = db.transfers.filter((t) => t.schoolId === schoolId && (!f.status || t.status === f.status)).map((t) => {
        const s = db.students.find((x) => x.id === t.studentId)!;
        return { ...t, studentName: s.fullName, studentCode: s.code, fromName: className(db, t.fromClassId), toName: t.toClassId ? className(db, t.toClassId) : "—", requestedByName: staffNameById(db, t.requestedBy), decidedByName: staffNameById(db, t.decidedBy) };
      }).filter((t) => matches(q.q ?? "", t.studentName, t.studentCode)).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
      return { ...paginate(rows, q), canDecide: allowed(db, ctx, "student.transfer", { schoolId }) };
    });
  },

  /** O11 — request (homeroom) or directly apply (school) a class transfer / leave. */
  async requestTransfer(ctx: Ctx, schoolId: ID, input: { studentId: ID; kind: "transfer" | "leave"; toClassId?: ID; effectiveDate: string; reason: string; applyNow: boolean }) {
    return write((db) => {
      const s = findOr404(db.students.find((x) => x.id === input.studentId && x.schoolId === schoolId), "học sinh");
      const from = classOfStudentOn(db, s.id, ctx.today);
      if (!from) throw new RepoError("VALIDATION", "Học sinh không có lớp đang theo học.");
      const canDecide = allowed(db, ctx, "student.transfer", { schoolId });
      if (!canDecide) requireAction(db, ctx, "groups.manage", { schoolId, classId: from.id });
      const errors: Record<string, string> = {};
      if (input.reason.trim().length < 5) errors.reason = "Nêu lý do (tối thiểu 5 ký tự)";
      if (input.kind === "transfer") {
        const to = db.classes.find((c) => c.id === input.toClassId && c.schoolId === schoolId);
        if (!to) errors.toClassId = "Chọn lớp đích";
        else if (to.id === from.id) errors.toClassId = "Lớp đích phải khác lớp hiện tại";
        else if (to.yearId !== from.yearId) errors.toClassId = "Chỉ chuyển trong cùng năm học (năm mới dùng quy trình chuẩn bị năm)";
        else if (enrollmentsOn(db, to.id, input.effectiveDate).length >= to.capacity) errors.toClassId = `Lớp ${to.name} đã đủ sức chứa`;
      }
      if (input.effectiveDate < addDays(ctx.today, -7)) errors.effectiveDate = "Không áp dụng lùi quá 7 ngày";
      if (db.transfers.some((t) => t.studentId === s.id && t.status === "pending")) errors.studentId = "Đã có yêu cầu đang chờ cho học sinh này";
      if (Object.keys(errors).length) validation(errors);
      const t = { id: newId("tr"), schoolId, studentId: s.id, fromClassId: from.id, toClassId: input.toClassId, kind: input.kind, effectiveDate: input.effectiveDate, reason: input.reason.trim(), status: "pending" as "pending" | "approved" | "rejected", requestedBy: actorId(ctx), requestedAt: ctx.now } as import("@/lib/model/types").TransferRequest;
      db.transfers.push(t);
      if (canDecide && input.applyNow) applyTransfer(db, ctx, t);
      audit(db, ctx, { level: "school", schoolId, action: canDecide && input.applyNow ? (input.kind === "leave" ? "Ghi nhận ngừng theo học" : "Chuyển lớp") : "Đề nghị chuyển lớp", entityType: "transfer", entityId: t.id, entityLabel: `${s.fullName}: ${from.name} → ${input.kind === "leave" ? "ngừng theo học" : className(db, input.toClassId)}`, reason: input.reason });
      return t;
    });
  },

  async decideTransfer(ctx: Ctx, schoolId: ID, transferId: ID, approve: boolean, note?: string) {
    return write((db) => {
      requireAction(db, ctx, "student.transfer", { schoolId });
      const t = findOr404(db.transfers.find((x) => x.id === transferId && x.schoolId === schoolId), "yêu cầu");
      if (t.status !== "pending") throw new RepoError("VALIDATION", "Yêu cầu đã được xử lý.");
      if (approve) applyTransfer(db, ctx, t);
      else { t.status = "rejected"; t.decidedBy = actorId(ctx); t.decidedAt = ctx.now; }
      const s = db.students.find((x) => x.id === t.studentId)!;
      audit(db, ctx, { level: "school", schoolId, action: approve ? "Duyệt chuyển lớp" : "Từ chối chuyển lớp", entityType: "transfer", entityId: t.id, entityLabel: `${s.fullName}: ${className(db, t.fromClassId)} → ${t.toClassId ? className(db, t.toClassId) : "ngừng theo học"}`, reason: note });
      return t;
    });
  },

  /* ------------------------------ guardians ------------------------------ */
  async guardians(ctx: Ctx, schoolId: ID, q: ListQuery) {
    return read((db) => {
      requireAction(db, ctx, "guardian.manage.all", { schoolId });
      const f = q.filters ?? {};
      const rows = db.guardians.filter((g) => g.schoolId === schoolId).map((g) => {
        const rels = db.relationships.filter((r) => r.guardianId === g.id);
        return { ...g, students: rels.map((r) => { const s = db.students.find((x) => x.id === r.studentId)!; return { id: s.id, name: s.fullName, relation: r.relation, verification: r.verification, className: latestClassOf(db, s.id)?.name ?? "—" }; }),
          verified: rels.filter((r) => r.verification === "verified").length, unverified: rels.filter((r) => r.verification === "unverified").length,
          activeLinks: db.parentAccesses.filter((p) => rels.some((r) => r.id === p.relationshipId) && accessStatus(p, ctx.now) === "active").length };
      }).filter((g) => matches(q.q ?? "", g.fullName, ...g.students.map((s) => s.name)) && (!f.verification || (f.verification === "unverified" ? g.unverified > 0 : g.verified > 0)))
        .sort((a, b) => nameCompare(a.fullName, b.fullName));
      return paginate(rows, q, { name: (a, b) => nameCompare(a.fullName, b.fullName) });
    });
  },

  async guardian(ctx: Ctx, schoolId: ID, guardianId: ID) {
    return read((db) => {
      const g = findOr404(db.guardians.find((x) => x.id === guardianId && x.schoolId === schoolId), "người giám hộ");
      const rels = db.relationships.filter((r) => r.guardianId === g.id);
      if (!allowed(db, ctx, "guardian.manage.all", { schoolId })) {
        const ok = rels.some((r) => { const c = classOfStudentOn(db, r.studentId, ctx.today); return c && allowed(db, ctx, "guardian.view", { schoolId, classId: c.id }); });
        if (!ok) throw new RepoError("FORBIDDEN");
      }
      return {
        guardian: g,
        relationships: rels.map((r) => {
          const s = db.students.find((x) => x.id === r.studentId)!;
          const c = classOfStudentOn(db, s.id, ctx.today) ?? latestClassOf(db, s.id);
          const links = db.parentAccesses.filter((p) => p.relationshipId === r.id).map((p) => ({ ...p, status: accessStatus(p, ctx.now), yearLabel: db.years.find((y) => y.id === p.yearId)?.label }));
          return { ...r, student: { id: s.id, name: s.fullName, code: s.code, className: c?.name ?? "—", classId: c?.id }, verifiedByName: staffNameById(db, r.verifiedBy), links,
            canEdit: allowed(db, ctx, "guardian.manage.all", { schoolId }) || (!!c && allowed(db, ctx, "guardian.edit", { schoolId, classId: c.id })),
            canIssue: allowed(db, ctx, "parentAccess.manage.all", { schoolId }) || (!!c && allowed(db, ctx, "parentAccess.issue", { schoolId, classId: c.id })) };
        }),
        history: db.audit.filter((a) => a.schoolId === schoolId && (a.entityId === g.id || rels.some((r) => r.id === a.entityId))).sort((a, b) => b.at.localeCompare(a.at)).map((a) => ({ ...a, actorName: staffNameById(db, a.actorId) })),
      };
    });
  },

  /** O09 — add/edit guardian contact for a student. Never auto-verified; never merged by phone. */
  async saveGuardian(ctx: Ctx, schoolId: ID, input: { studentId: ID; guardianId?: ID; relationshipId?: ID; fullName: string; relation: GuardianRelationship["relation"]; phone: string; email?: string; isPrimaryContact: boolean }) {
    return write((db) => {
      requireStudentAction(db, ctx, schoolId, input.studentId, "guardian.manage.all", "guardian.edit");
      const errors: Record<string, string> = {};
      if (input.fullName.trim().split(/\s+/).length < 2) errors.fullName = "Nhập đầy đủ họ tên";
      if (!/^[0-9 .+*-]{8,15}$/.test(input.phone.trim())) errors.phone = "Số điện thoại chưa hợp lệ";
      if (input.email && !/^\S+@\S+\.\S+$/.test(input.email)) errors.email = "Email chưa hợp lệ";
      if (Object.keys(errors).length) validation(errors);
      let g = input.guardianId ? db.guardians.find((x) => x.id === input.guardianId && x.schoolId === schoolId) : undefined;
      const masked = /\*/.test(input.phone) ? input.phone.trim() : input.phone.replace(/\s/g, "").replace(/^(\d{4})\d+(\d{3})$/, "$1 *** $2");
      if (g) { Object.assign(g, { fullName: input.fullName.trim(), phoneMasked: masked, email: input.email, version: g.version + 1 }); }
      else { g = { id: newId("gd"), schoolId, fullName: input.fullName.trim(), phoneMasked: masked, email: input.email, version: 1 }; db.guardians.push(g); }
      let rel = input.relationshipId ? db.relationships.find((r) => r.id === input.relationshipId) : db.relationships.find((r) => r.guardianId === g!.id && r.studentId === input.studentId);
      if (input.isPrimaryContact) db.relationships.filter((r) => r.studentId === input.studentId).forEach((r) => (r.isPrimaryContact = false));
      if (rel) Object.assign(rel, { relation: input.relation, isPrimaryContact: input.isPrimaryContact });
      else { rel = { id: newId("rel"), schoolId, guardianId: g.id, studentId: input.studentId, relation: input.relation, isPrimaryContact: input.isPrimaryContact, verification: "unverified" }; db.relationships.push(rel); }
      audit(db, ctx, { level: "school", schoolId, action: input.relationshipId ? "Sửa người giám hộ" : "Thêm người giám hộ (chưa xác minh)", entityType: "relationship", entityId: rel.id, entityLabel: `${g.fullName} — ${input.relation}` });
      return rel;
    });
  },

  /** O10 — verify / revoke a guardian relationship. Revoking also revokes that relationship's links (only). */
  async setVerification(ctx: Ctx, schoolId: ID, relationshipId: ID, status: "verified" | "revoked", note: string) {
    return write((db) => {
      const r = findOr404(db.relationships.find((x) => x.id === relationshipId && x.schoolId === schoolId), "quan hệ giám hộ");
      requireStudentAction(db, ctx, schoolId, r.studentId, "guardian.manage.all", "guardian.edit");
      if (note.trim().length < 5) validation({ note: status === "verified" ? "Ghi căn cứ xác minh (ví dụ: đối chiếu hồ sơ, gặp trực tiếp)" : "Ghi lý do thu hồi" });
      r.verification = status;
      if (status === "verified") { r.verifiedBy = actorId(ctx); r.verifiedAt = ctx.now; r.verificationNote = note.trim(); r.revokedReason = undefined; }
      else {
        r.revokedReason = note.trim();
        db.parentAccesses.filter((p) => p.relationshipId === r.id && !p.revokedAt).forEach((p) => {
          p.revokedAt = ctx.now; p.revokedBy = actorId(ctx); p.revokeReason = `Thu hồi quan hệ giám hộ: ${note.trim()}`;
          db.parentAccessLogs.push({ id: newId("pal"), accessId: p.id, schoolId, at: ctx.now, event: "revoked", note: "Thu hồi theo quan hệ giám hộ" });
        });
      }
      const g = db.guardians.find((x) => x.id === r.guardianId)!;
      audit(db, ctx, { level: "school", schoolId, action: status === "verified" ? "Xác minh người giám hộ" : "Thu hồi quan hệ giám hộ", entityType: "relationship", entityId: r.id, entityLabel: `${g.fullName} — ${r.relation}`, reason: note });
      return r;
    });
  },

  /* ------------------------------ parent access ------------------------------ */
  async accessList(ctx: Ctx, schoolId: ID, q: ListQuery) {
    return read((db) => {
      requireAction(db, ctx, "parentAccess.manage.all", { schoolId });
      const f = q.filters ?? {};
      const rows = db.parentAccesses.filter((p) => p.schoolId === schoolId).map((p) => {
        const rel = db.relationships.find((r) => r.id === p.relationshipId)!;
        const g = db.guardians.find((x) => x.id === rel.guardianId)!;
        const s = db.students.find((x) => x.id === p.studentId)!;
        const logs = db.parentAccessLogs.filter((l) => l.accessId === p.id && (l.event === "opened" || l.event === "viewed"));
        return { id: p.id, relationshipId: p.relationshipId, studentStatus: s.status, studentId: s.id, studentName: s.fullName, studentCode: s.code, className: latestClassOf(db, s.id)?.name ?? "—", guardianName: g.fullName, relation: rel.relation,
          yearLabel: db.years.find((y) => y.id === p.yearId)?.label ?? "", status: accessStatus(p, ctx.now), issuedAt: p.issuedAt, expiresAt: p.expiresAt, modules: p.modules,
          opens: logs.length, lastOpenedAt: logs.map((l) => l.at).sort().pop(), issuedByName: staffNameById(db, p.issuedBy) };
      }).filter((r) => matches(q.q ?? "", r.studentName, r.studentCode, r.guardianName) && (!f.status || r.status === f.status) && (!f.classId || latestClassOf(db, r.studentId)?.id === f.classId))
        .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
      const all = db.parentAccesses.filter((p) => p.schoolId === schoolId);
      return { ...paginate(rows, q, { issuedAt: (a, b) => a.issuedAt.localeCompare(b.issuedAt), student: (a, b) => nameCompare(a.studentName, b.studentName), opens: (a, b) => a.opens - b.opens }),
        kpi: { active: all.filter((p) => accessStatus(p, ctx.now) === "active").length, expired: all.filter((p) => accessStatus(p, ctx.now) === "expired").length, revoked: all.filter((p) => accessStatus(p, ctx.now) === "revoked").length } };
    });
  },

  async access(ctx: Ctx, schoolId: ID, accessId: ID) {
    return read((db) => {
      const p = findOr404(db.parentAccesses.find((x) => x.id === accessId && x.schoolId === schoolId), "quyền tra cứu");
      requireStudentAction(db, ctx, schoolId, p.studentId, "parentAccess.manage.all", "parentAccess.issue");
      const rel = db.relationships.find((r) => r.id === p.relationshipId)!;
      const g = db.guardians.find((x) => x.id === rel.guardianId)!;
      const s = db.students.find((x) => x.id === p.studentId)!;
      return {
        access: { ...p, status: accessStatus(p, ctx.now) }, relationship: rel, guardian: g, student: { id: s.id, fullName: s.fullName, code: s.code, className: latestClassOf(db, s.id)?.name ?? "—" },
        yearLabel: db.years.find((y) => y.id === p.yearId)?.label ?? "", issuedByName: staffNameById(db, p.issuedBy), revokedByName: staffNameById(db, p.revokedBy),
        school: db.schools.find((x) => x.id === schoolId)!,
        logs: db.parentAccessLogs.filter((l) => l.accessId === p.id).sort((a, b) => b.at.localeCompare(a.at)),
        replacedBy: p.replacedById, siblings: db.parentAccesses.filter((x) => x.studentId === p.studentId && x.id !== p.id).map((x) => ({ id: x.id, status: accessStatus(x, ctx.now), relation: db.relationships.find((r) => r.id === x.relationshipId)?.relation })),
      };
    });
  },

  /** O12 — issue a private demo link: one student × one school × one year, verified guardian only. */
  async issueAccess(ctx: Ctx, schoolId: ID, input: { relationshipId: ID; modules: ParentModule[]; expiresOn: string; replaceAccessId?: ID; reason?: string }) {
    return write((db) => {
      const rel = findOr404(db.relationships.find((r) => r.id === input.relationshipId && r.schoolId === schoolId), "quan hệ giám hộ");
      requireStudentAction(db, ctx, schoolId, rel.studentId, "parentAccess.manage.all", "parentAccess.issue");
      if (rel.verification !== "verified") throw new RepoError("UNVERIFIED");
      const s = db.students.find((x) => x.id === rel.studentId)!;
      if (s.status !== "studying") throw new RepoError("VALIDATION", "Học sinh không còn theo học — không cấp link mới.");
      const year = currentYear(db, schoolId)!;
      if (!input.modules.length) validation({ modules: "Chọn ít nhất một mục được xem" });
      if (input.expiresOn <= ctx.today) validation({ expiresOn: "Hạn dùng phải sau hôm nay" });
      if (input.expiresOn > year.endDate) validation({ expiresOn: `Không vượt quá hết năm học (${year.endDate.split("-").reverse().join("/")})` });
      if (input.replaceAccessId) {
        const old = findOr404(db.parentAccesses.find((x) => x.id === input.replaceAccessId && x.relationshipId === rel.id), "link cũ");
        if (!old.revokedAt) { old.revokedAt = ctx.now; old.revokedBy = actorId(ctx); old.revokeReason = input.reason?.trim() || "Cấp lại link mới"; db.parentAccessLogs.push({ id: newId("pal"), accessId: old.id, schoolId, at: ctx.now, event: "revoked", note: "Thu hồi khi cấp lại" }); }
      }
      const pa: ParentAccess = { id: newId("pa"), schoolId, studentId: s.id, relationshipId: rel.id, yearId: year.id, token: newDemoToken(), modules: input.modules, issuedAt: ctx.now, issuedBy: actorId(ctx), expiresAt: `${input.expiresOn}T23:59:00+07:00` };
      db.parentAccesses.push(pa);
      if (input.replaceAccessId) db.parentAccesses.find((x) => x.id === input.replaceAccessId)!.replacedById = pa.id;
      db.parentAccessLogs.push({ id: newId("pal"), accessId: pa.id, schoolId, at: ctx.now, event: input.replaceAccessId ? "reissued" : "issued", note: `Mục được xem: ${input.modules.map((m) => parentModuleLabel[m]).join(", ")}` });
      const g = db.guardians.find((x) => x.id === rel.guardianId)!;
      audit(db, ctx, { level: "school", schoolId, action: input.replaceAccessId ? "Cấp lại link tra cứu" : "Cấp link tra cứu", entityType: "parentAccess", entityId: pa.id, entityLabel: `Link cấp cho ${rel.relation.toLowerCase()} em ${s.fullName} (${g.fullName})`, reason: input.reason });
      return pa;
    });
  },

  /** O14 — revoke: blocks every new read with this link immediately; other guardians' links are untouched. */
  async revokeAccess(ctx: Ctx, schoolId: ID, accessId: ID, reason: string) {
    return write((db) => {
      const p = findOr404(db.parentAccesses.find((x) => x.id === accessId && x.schoolId === schoolId), "quyền tra cứu");
      requireStudentAction(db, ctx, schoolId, p.studentId, "parentAccess.manage.all", "parentAccess.issue");
      if (p.revokedAt) throw new RepoError("VALIDATION", "Link đã được thu hồi trước đó.");
      if (reason.trim().length < 3) validation({ reason: "Ghi lý do thu hồi" });
      p.revokedAt = ctx.now; p.revokedBy = actorId(ctx); p.revokeReason = reason.trim();
      db.parentAccessLogs.push({ id: newId("pal"), accessId: p.id, schoolId, at: ctx.now, event: "revoked", note: reason.trim() });
      const rel = db.relationships.find((r) => r.id === p.relationshipId)!;
      const s = db.students.find((x) => x.id === p.studentId)!;
      audit(db, ctx, { level: "school", schoolId, action: "Thu hồi link tra cứu", entityType: "parentAccess", entityId: p.id, entityLabel: `Link cấp cho ${rel.relation.toLowerCase()} em ${s.fullName}`, reason });
      return p;
    });
  },

  /* ------------------------------ import ------------------------------ */
  async importPreview(ctx: Ctx, schoolId: ID, classId: ID, rows: ImportRowInput[], mode: "add_only" | "add_update") {
    return read((db) => {
      requireAction(db, ctx, "import.run", { schoolId });
      const cls = findOr404(db.classes.find((c) => c.id === classId && c.schoolId === schoolId), "lớp");
      const results = analyseImport(db, schoolId, classId, rows, mode);
      const incoming = results.filter((r) => r.result === "new" || r.result === "warning").length;
      const size = enrollmentsOn(db, cls.id, ctx.today).length;
      return { results, classSize: size, capacity: cls.capacity, overCapacity: size + incoming > cls.capacity };
    });
  },

  /** Commits only valid rows; never deletes or replaces the existing roster. Re-import does not duplicate. */
  async importCommit(ctx: Ctx, schoolId: ID, input: { classId: ID; fileName: string; rows: ImportRowInput[]; mode: "add_only" | "add_update"; includeWarnings: boolean }) {
    return write((db) => {
      requireAction(db, ctx, "import.run", { schoolId });
      const cls = findOr404(db.classes.find((c) => c.id === input.classId && c.schoolId === schoolId), "lớp");
      const results = analyseImport(db, schoolId, cls.id, input.rows, input.mode);
      const counts = { added: 0, updated: 0, skipped: 0, errors: 0 };
      const prefix = db.students.find((s) => s.schoolId === schoolId)?.code.slice(0, 4) ?? "HS26";
      let next = Math.max(0, ...db.students.filter((s) => s.schoolId === schoolId && s.code.startsWith(prefix)).map((s) => Number(s.code.slice(4)) || 0));
      const batchId = `BATCH-${ctx.today.replace(/-/g, "").slice(4)}-${String(db.imports.length + 1).padStart(2, "0")}`;
      for (const r of results) {
        if (r.result === "error") { counts.errors++; continue; }
        if (r.result === "skip" || (r.result === "warning" && !input.includeWarnings)) { counts.skipped++; continue; }
        const dob = parseDob(r.dob)!;
        const gender = fold(r.gender ?? "") === "nam" ? "Nam" : "Nữ";
        if (r.result === "update") {
          const s = db.students.find((x) => x.id === r.matchId)!;
          Object.assign(s, { dob, gender, version: s.version + 1, updatedAt: ctx.now, updatedBy: actorId(ctx) });
          if (!db.enrollments.some((e) => e.studentId === s.id && e.classId === cls.id && !e.endDate)) {
            if (db.enrollments.some((e) => e.studentId === s.id && e.yearId === cls.yearId && !e.endDate)) { counts.skipped++; continue; }
            db.enrollments.push({ id: newId("en"), schoolId, studentId: s.id, classId: cls.id, yearId: cls.yearId, startDate: ctx.today, status: "active" });
          }
          counts.updated++;
          continue;
        }
        next++;
        const s: Student = { id: newId("st"), schoolId, code: r.code?.trim().toUpperCase() || `${prefix}${String(next).padStart(3, "0")}`, fullName: r.fullName!.trim().replace(/\s+/g, " "), dob, gender, status: "studying", avatarTone: "green", version: 1, updatedAt: ctx.now, updatedBy: actorId(ctx) };
        db.students.push(s);
        db.enrollments.push({ id: newId("en"), schoolId, studentId: s.id, classId: cls.id, yearId: cls.yearId, startDate: ctx.today, status: "active" });
        if (r.guardianName?.trim()) {
          const g = { id: newId("gd"), schoolId, fullName: r.guardianName.trim(), phoneMasked: (r.guardianPhone ?? "").replace(/\s/g, "").replace(/^(\d{4})\d+(\d{3})$/, "$1 *** $2") || "Chưa có", version: 1 };
          db.guardians.push(g);
          const rel = (["Mẹ", "Bố", "Ông", "Bà"].includes(r.guardianRelation ?? "") ? r.guardianRelation : "Người giám hộ khác") as GuardianRelationship["relation"];
          db.relationships.push({ id: newId("rel"), schoolId, guardianId: g.id, studentId: s.id, relation: rel, isPrimaryContact: true, verification: "unverified" });
        }
        counts.added++;
      }
      const job: ImportJob = { id: newId("imp"), schoolId, kind: "students", fileName: input.fileName, status: "completed", createdBy: actorId(ctx), createdAt: ctx.now, batchId, counts, targetClassId: cls.id,
        errorRows: results.filter((r) => r.result === "error").map((r) => ({ row: r.rowNo, message: r.message, data: { "Mã HS": r.code ?? "", "Họ và tên": r.fullName ?? "", "Ngày sinh": r.dob ?? "", "Giới tính": r.gender ?? "" } })) };
      db.imports.push(job);
      if (counts.added || counts.updated) { const sch = db.schools.find((x) => x.id === schoolId); if (sch) sch.onboarding.studentsImported = true; }
      audit(db, ctx, { level: "school", schoolId, action: "Nhập danh sách học sinh", entityType: "import", entityId: job.id, entityLabel: `${input.fileName} → ${cls.name}`, after: counts });
      return job;
    });
  },

  async imports(ctx: Ctx, schoolId: ID) {
    return read((db) => {
      requireAction(db, ctx, "import.run", { schoolId });
      return db.imports.filter((i) => i.schoolId === schoolId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((i) => ({ ...i, createdByName: staffNameById(db, i.createdBy), className: className(db, i.targetClassId) }));
    });
  },

  async importJob(ctx: Ctx, schoolId: ID, importId: ID) {
    return read((db) => {
      requireAction(db, ctx, "import.run", { schoolId });
      const i = findOr404(db.imports.find((x) => x.id === importId && x.schoolId === schoolId), "lần nhập");
      return { ...i, createdByName: staffNameById(db, i.createdBy), className: className(db, i.targetClassId), classId: i.targetClassId };
    });
  },
};

function applyTransfer(db: DemoDB, ctx: Ctx, t: import("@/lib/model/types").TransferRequest) {
  const s = db.students.find((x) => x.id === t.studentId)!;
  const cur = db.enrollments.find((e) => e.studentId === s.id && e.classId === t.fromClassId && !e.endDate);
  if (cur) { cur.endDate = addDays(t.effectiveDate, -1) < cur.startDate ? cur.startDate : addDays(t.effectiveDate, -1); cur.status = "ended"; cur.endReason = t.kind === "leave" ? "Ngừng theo học" : `Chuyển sang ${className(db, t.toClassId)}`; }
  if (t.kind === "transfer" && t.toClassId) {
    const to = db.classes.find((c) => c.id === t.toClassId)!;
    db.enrollments.push({ id: newId("en"), schoolId: s.schoolId, studentId: s.id, classId: to.id, yearId: to.yearId, startDate: t.effectiveDate, status: "active" });
    // group membership & seats of old class end; the student appears in "chưa phân tổ" of the new class
    db.groupMemberships.filter((g) => g.studentId === s.id && g.classId === t.fromClassId && !g.validTo).forEach((g) => (g.validTo = addDays(t.effectiveDate, -1)));
    db.positions.filter((p) => p.studentId === s.id && p.classId === t.fromClassId && !p.validTo).forEach((p) => (p.validTo = addDays(t.effectiveDate, -1)));
  } else {
    s.status = "left";
    s.statusDate = t.effectiveDate;
    db.parentAccesses.filter((p) => p.studentId === s.id && !p.revokedAt).forEach((p) => { p.revokedAt = ctx.now; p.revokedBy = actorId(ctx); p.revokeReason = "Học sinh ngừng theo học"; });
  }
  t.status = "approved";
  t.decidedBy = actorId(ctx);
  t.decidedAt = ctx.now;
}

export const _test = { analyseImport, parseDob };
