import type { AdjustmentRequest, ConductPeriod, ConductRecord, ConductRule, DemoDB, ID, PublicationPolicy, PublishedSnapshot, RuleSet } from "@/lib/model/types";
import { addDays } from "@/lib/demo/clock";
import { newId } from "@/lib/demo/ids";
import { computeRows, findDuplicates, gradeFor } from "@/lib/domain/conduct";
import { countAttendance } from "@/lib/domain/attendance";
import { nameCompare } from "@/lib/formatters";
import { RepoError } from "./errors";
import { allowed, audit, findOr404, read, requireAction, requireAnyAction, validation, write, actorId, type Ctx } from "./core";
import { classGuard, refDateOf } from "./classroom";
import { className, rosterBetween, rosterOn, ruleSetOn, staffNameById, weekOfDate, currentYear } from "./selectors";

function periodOf(db: DemoDB, classId: ID, weekId: ID): ConductPeriod {
  let p = db.conductPeriods.find((x) => x.classId === classId && x.weekId === weekId);
  if (!p) {
    const c = db.classes.find((x) => x.id === classId)!;
    p = { id: newId("cp"), schoolId: c.schoolId, classId, weekId, status: "open", version: 1 };
    db.conductPeriods.push(p);
  }
  return p;
}

function weekRoster(db: DemoDB, classId: ID, weekId: ID) {
  const w = db.weeks.find((x) => x.id === weekId)!;
  // Snapshot roster = students enrolled on the week's Monday (a student joining mid-week appears from next week).
  const monday = rosterOn(db, classId, w.startDate);
  return monday.length ? monday : rosterBetween(db, classId, w.startDate, w.endDate);
}

function ruleSetForWeek(db: DemoDB, schoolId: ID, weekId: ID): RuleSet {
  const w = db.weeks.find((x) => x.id === weekId)!;
  const rs = ruleSetOn(db, schoolId, w.startDate);
  if (!rs) throw new RepoError("VALIDATION", "Chưa có nội quy ban hành cho tuần này.");
  return rs;
}

function recordView(db: DemoDB, r: ConductRecord, dups: Map<ID, ID[]>) {
  const rs = db.ruleSets.find((x) => x.id === r.ruleSetId);
  const rule = rs?.rules.find((x) => x.id === r.ruleId);
  const s = db.students.find((x) => x.id === r.studentId)!;
  return { ...r, studentName: s.fullName, studentCode: s.code, ruleLabel: rule?.label ?? r.reason, category: rule?.category, createdByName: staffNameById(db, r.createdBy), fromAttendance: !!r.linkedAttendanceRecordId, duplicateOf: dups.get(r.id) ?? [], ruleSetVersion: rs?.versionNo };
}

function reviewChecks(db: DemoDB, classId: ID, weekId: ID) {
  const recs = db.conductRecords.filter((r) => r.classId === classId && r.weekId === weekId);
  const pending = recs.filter((r) => r.status === "pending_review");
  const dups = findDuplicates(recs.filter((r) => r.status === "pending_review" || r.status === "approved"));
  const w = db.weeks.find((x) => x.id === weekId)!;
  const days = [0, 1, 2, 3, 4, 5].map((i) => addDays(w.startDate, i));
  const missingAttendance = days.filter((d) => !db.holidays.some((h) => h.schoolId === db.classes.find((c) => c.id === classId)!.schoolId && h.startDate <= d && h.endDate >= d))
    .filter((d) => { const s = db.attendanceSessions.find((x) => x.classId === classId && x.date === d && x.slot === "morning"); return !s; });
  const unmarkedDays = days.filter((d) => {
    const s = db.attendanceSessions.find((x) => x.classId === classId && x.date === d && x.slot === "morning");
    if (!s) return false;
    return countAttendance(rosterOn(db, classId, d).map((x) => x.id), db.attendanceRecords.filter((r) => r.sessionId === s.id)).unmarked > 0;
  });
  const blocking: string[] = [];
  if (pending.length) blocking.push(`${pending.length} ghi nhận chưa rà soát`);
  if (dups.size) blocking.push(`${Math.ceil(dups.size / 2)} cặp ghi nhận có thể trùng`);
  const warnings: string[] = [];
  if (missingAttendance.length) warnings.push(`Chưa điểm danh ${missingAttendance.length} ngày: ${missingAttendance.map((d) => d.slice(8, 10) + "/" + d.slice(5, 7)).join(", ")}`);
  if (unmarkedDays.length) warnings.push(`Còn học sinh chưa điểm danh trong ${unmarkedDays.length} ngày`);
  return { pending, dups, blocking, warnings };
}

function makeSnapshot(db: DemoDB, ctx: Ctx, classId: ID, weekId: ID, ruleSet: RuleSet, versionNo: number, supersedesId?: ID, note?: string): PublishedSnapshot {
  const roster = weekRoster(db, classId, weekId);
  const recs = db.conductRecords.filter((r) => r.classId === classId && r.weekId === weekId && r.status === "approved");
  const c = db.classes.find((x) => x.id === classId)!;
  return {
    id: newId("snap"), schoolId: c.schoolId, classId, weekId, kind: "conduct_week", versionNo, ruleSetId: ruleSet.id, ruleSetVersionNo: ruleSet.versionNo, ruleSetName: ruleSet.name,
    lockedAt: ctx.now, lockedBy: actorId(ctx), status: "locked", supersedesId, adjustmentNote: note, rows: computeRows(roster, recs, ruleSet, db.ruleSets),
  };
}

export const conductRepo = {
  /* ------------------------------ rule sets (school) ------------------------------ */
  async ruleSets(ctx: Ctx, schoolId: ID) {
    return read((db) => {
      requireAction(db, ctx, "school.view", { schoolId });
      const current = ruleSetOn(db, schoolId, ctx.today);
      return {
        items: db.ruleSets.filter((r) => r.schoolId === schoolId).sort((a, b) => b.versionNo - a.versionNo).map((r) => ({
          ...r, isCurrent: r.id === current?.id, usedBySnapshots: db.snapshots.filter((s) => s.ruleSetId === r.id).length, createdByName: staffNameById(db, r.createdBy),
        })),
        canManage: allowed(db, ctx, "rules.manage", { schoolId }),
      };
    });
  },

  async ruleSet(ctx: Ctx, schoolId: ID, ruleSetId: ID) {
    return read((db) => {
      requireAction(db, ctx, "school.view", { schoolId });
      const r = findOr404(db.ruleSets.find((x) => x.id === ruleSetId && x.schoolId === schoolId), "bộ nội quy");
      const prev = db.ruleSets.filter((x) => x.schoolId === schoolId && x.versionNo < r.versionNo && x.status !== "draft").sort((a, b) => b.versionNo - a.versionNo)[0];
      const lockedWeeks = db.weeks.filter((w) => w.schoolId === schoolId && db.conductPeriods.some((p) => p.weekId === w.id && p.status !== "open")).map((w) => w.endDate).sort();
      return { ruleSet: r, previous: prev ?? null, usedBySnapshots: db.snapshots.filter((s) => s.ruleSetId === r.id).length, canManage: allowed(db, ctx, "rules.manage", { schoolId }) && r.status === "draft", earliestEffective: addDays(lockedWeeks[lockedWeeks.length - 1] ?? ctx.today, 1) > ctx.today ? addDays(lockedWeeks[lockedWeeks.length - 1] ?? ctx.today, 1) : ctx.today };
    });
  },

  /** Create a new DRAFT version (copy of an existing set). Published sets are never edited in place. */
  async newRuleSetVersion(ctx: Ctx, schoolId: ID, fromId: ID) {
    return write((db) => {
      requireAction(db, ctx, "rules.manage", { schoolId });
      const from = findOr404(db.ruleSets.find((x) => x.id === fromId && x.schoolId === schoolId), "bộ nội quy");
      if (db.ruleSets.some((x) => x.schoolId === schoolId && x.status === "draft")) throw new RepoError("VALIDATION", "Đang có một bản nháp nội quy. Hoàn tất hoặc xóa bản nháp đó trước.");
      const versionNo = Math.max(...db.ruleSets.filter((r) => r.schoolId === schoolId).map((r) => r.versionNo)) + 1;
      const draft: RuleSet = { ...structuredClone(from), id: newId("rs"), versionNo, status: "draft", effectiveFrom: addDays(ctx.today, 7), effectiveTo: undefined, publishedAt: undefined, createdBy: actorId(ctx), name: `${from.name.replace(/ \(bản \d+\)$/, "")} (bản ${versionNo})`, version: 1 };
      db.ruleSets.push(draft);
      audit(db, ctx, { level: "school", schoolId, action: "Tạo bản nội quy mới (nháp)", entityType: "ruleSet", entityId: draft.id, entityLabel: draft.name });
      return draft;
    });
  },

  async saveRuleSetDraft(ctx: Ctx, schoolId: ID, ruleSetId: ID, patch: { name: string; baseScore: number; cap?: number; floor?: number; rules: ConductRule[]; bands: RuleSet["bands"]; effectiveFrom: string; entryDeadlineDays: number; version: number }) {
    return write((db) => {
      requireAction(db, ctx, "rules.manage", { schoolId });
      const r = findOr404(db.ruleSets.find((x) => x.id === ruleSetId && x.schoolId === schoolId), "bộ nội quy");
      if (r.status !== "draft") throw new RepoError("LOCKED", "Bộ nội quy đã ban hành không sửa trực tiếp. Hãy tạo bản mới.");
      if (r.version !== patch.version) throw new RepoError("CONFLICT");
      const errors: Record<string, string> = {};
      if (patch.name.trim().length < 5) errors.name = "Tên tối thiểu 5 ký tự";
      if (!Number.isFinite(patch.baseScore) || patch.baseScore < 0 || patch.baseScore > 1000) errors.baseScore = "Điểm gốc từ 0 đến 1000";
      if (patch.cap !== undefined && patch.cap < patch.baseScore) errors.cap = "Trần không thấp hơn điểm gốc";
      if (patch.floor !== undefined && patch.floor > patch.baseScore) errors.floor = "Sàn không cao hơn điểm gốc";
      patch.rules.forEach((x, i) => {
        if (!x.label.trim()) errors[`rules.${i}.label`] = "Nhập tên quy định";
        if (!Number.isFinite(x.points) || x.points === 0) errors[`rules.${i}.points`] = "Điểm khác 0 (dương là cộng, âm là trừ)";
      });
      const codes = patch.rules.map((x) => x.code.trim().toUpperCase());
      if (new Set(codes).size !== codes.length) errors.rules = "Mã quy định bị trùng";
      if (patch.effectiveFrom < ctx.today) errors.effectiveFrom = "Không áp dụng ngược về quá khứ";
      if (Object.keys(errors).length) validation(errors);
      Object.assign(r, { ...patch, name: patch.name.trim(), version: r.version + 1 });
      return r;
    });
  },

  /** Publish a draft version from a future date. Earlier snapshots keep their own rule version. */
  async publishRuleSet(ctx: Ctx, schoolId: ID, ruleSetId: ID) {
    return write((db) => {
      requireAction(db, ctx, "rules.manage", { schoolId });
      const r = findOr404(db.ruleSets.find((x) => x.id === ruleSetId && x.schoolId === schoolId), "bộ nội quy");
      if (r.status !== "draft") throw new RepoError("VALIDATION", "Chỉ ban hành được bản nháp.");
      if (r.effectiveFrom < ctx.today) throw new RepoError("VALIDATION", "Ngày hiệu lực đã qua — chọn từ hôm nay trở đi.");
      const locked = db.conductPeriods.find((p) => p.schoolId === schoolId && p.status !== "open" && (db.weeks.find((w) => w.id === p.weekId)?.endDate ?? "") >= r.effectiveFrom);
      if (locked) throw new RepoError("LOCKED", "Đã có tuần chốt sau ngày hiệu lực này. Chọn ngày hiệu lực sau tuần đã chốt.");
      db.ruleSets.filter((x) => x.schoolId === schoolId && x.status === "published" && (!x.effectiveTo || x.effectiveTo >= r.effectiveFrom)).forEach((x) => {
        if (x.effectiveFrom >= r.effectiveFrom) x.status = "retired";
        else x.effectiveTo = addDays(r.effectiveFrom, -1);
      });
      r.status = "published";
      r.publishedAt = ctx.now;
      audit(db, ctx, { level: "school", schoolId, action: "Ban hành nội quy", entityType: "ruleSet", entityId: r.id, entityLabel: r.name, after: { effectiveFrom: r.effectiveFrom } });
      return r;
    });
  },

  async deleteRuleSetDraft(ctx: Ctx, schoolId: ID, ruleSetId: ID) {
    return write((db) => {
      requireAction(db, ctx, "rules.manage", { schoolId });
      const r = findOr404(db.ruleSets.find((x) => x.id === ruleSetId && x.schoolId === schoolId), "bộ nội quy");
      if (r.status !== "draft") throw new RepoError("VALIDATION", "Chỉ xóa được bản nháp chưa ban hành.");
      db.ruleSets = db.ruleSets.filter((x) => x.id !== r.id);
      audit(db, ctx, { level: "school", schoolId, action: "Xóa bản nháp nội quy", entityType: "ruleSet", entityId: r.id, entityLabel: r.name });
      return true;
    });
  },

  async policy(ctx: Ctx, schoolId: ID) {
    return read((db) => {
      requireAction(db, ctx, "school.view", { schoolId });
      return { policy: findOr404(db.policies.find((p) => p.schoolId === schoolId)), canEdit: allowed(db, ctx, "policy.manage", { schoolId }) };
    });
  },

  async savePolicy(ctx: Ctx, schoolId: ID, patch: Omit<PublicationPolicy, "schoolId">) {
    return write((db) => {
      requireAction(db, ctx, "policy.manage", { schoolId });
      const p = findOr404(db.policies.find((x) => x.schoolId === schoolId));
      if (p.version !== patch.version) throw new RepoError("CONFLICT");
      if (!patch.defaultParentModules.length) validation({ defaultParentModules: "Chọn ít nhất một mục phụ huynh được xem" });
      const before = { ...p };
      Object.assign(p, { ...patch, version: p.version + 1 });
      audit(db, ctx, { level: "school", schoolId, action: "Cập nhật quy trình chốt và công bố", entityType: "policy", entityId: schoolId, entityLabel: "Quy trình công bố", before: before as unknown as Record<string, unknown>, after: p as unknown as Record<string, unknown> });
      return p;
    });
  },

  /* ------------------------------ class view ------------------------------ */
  async classRules(ctx: Ctx, schoolId: ID, yearId: ID, classId: ID) {
    return read((db) => {
      const c = classGuard(db, ctx, schoolId, yearId, classId);
      const ref = refDateOf(db, c, ctx.today);
      const cur = ruleSetOn(db, schoolId, ref);
      const next = db.ruleSets.filter((r) => r.schoolId === schoolId && r.status === "published" && r.effectiveFrom > ref).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))[0];
      return { current: cur ?? null, next: next ?? null, policy: db.policies.find((p) => p.schoolId === schoolId) };
    });
  },

  async weekOptions(ctx: Ctx, schoolId: ID, yearId: ID, classId: ID) {
    return read((db) => {
      const c = classGuard(db, ctx, schoolId, yearId, classId);
      const ref = refDateOf(db, c, ctx.today);
      const weeks = db.weeks.filter((w) => w.yearId === yearId && w.startDate <= ref).sort((a, b) => b.index - a.index);
      return weeks.map((w) => ({ id: w.id, index: w.index, startDate: w.startDate, endDate: w.endDate, status: db.conductPeriods.find((p) => p.classId === classId && p.weekId === w.id)?.status ?? "open", isCurrent: w.startDate <= ref && w.endDate >= ref }));
    });
  },

  async records(ctx: Ctx, schoolId: ID, yearId: ID, classId: ID, weekId: ID, opts: { studentId?: ID } = {}) {
    return read((db) => {
      classGuard(db, ctx, schoolId, yearId, classId);
      requireAnyAction(db, ctx, ["conduct.record", "conduct.review", "adjustment.approve"], { schoolId, classId });
      const recs = db.conductRecords.filter((r) => r.classId === classId && r.weekId === weekId && (!opts.studentId || r.studentId === opts.studentId));
      const dups = findDuplicates(recs.filter((r) => r.status !== "void" && r.status !== "rejected"));
      const isReviewer = allowed(db, ctx, "conduct.review", { schoolId, classId });
      const mine = actorId(ctx);
      const w = db.weeks.find((x) => x.id === weekId)!;
      const rs = ruleSetOn(db, schoolId, w.startDate);
      return {
        records: recs.filter((r) => isReviewer || r.createdBy === mine || r.status === "approved").sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((r) => recordView(db, r, dups)),
        roster: weekRoster(db, classId, weekId).map((s) => ({ id: s.id, fullName: s.fullName, code: s.code, avatarTone: s.avatarTone })),
        ruleSet: rs ?? null, week: w, period: db.conductPeriods.find((p) => p.classId === classId && p.weekId === weekId) ?? { status: "open" as const },
        canRecord: allowed(db, ctx, "conduct.record", { schoolId, classId }), isReviewer,
      };
    });
  },

  /** O17 — create a record. Same source event cannot be counted twice; a retried request is idempotent. */
  async createRecord(ctx: Ctx, schoolId: ID, yearId: ID, classId: ID, input: { studentId: ID; date: string; ruleId: ID; reason: string; requestId: string; confirmDistinct?: boolean; distinctNote?: string }) {
    return write((db) => {
      const c = classGuard(db, ctx, schoolId, yearId, classId);
      requireAction(db, ctx, "conduct.record", { schoolId, classId });
      const key = `manual:${input.requestId}`;
      const retry = db.conductRecords.find((r) => r.sourceEventKey === key);
      if (retry) return { record: retry, idempotent: true };
      if (input.date > ctx.today) validation({ date: "Không ghi nhận cho ngày chưa tới" });
      const week = weekOfDate(db, c.yearId, input.date);
      if (!week) validation({ date: "Ngày không thuộc tuần học nào của năm học" });
      const period = periodOf(db, classId, week!.id);
      if (period.status !== "open") throw new RepoError("LOCKED", `Tuần ${week!.index} đã ${period.status === "published" ? "công bố" : "chốt"}. Hãy tạo đề nghị điều chỉnh.`);
      if (!rosterOn(db, classId, input.date).some((s) => s.id === input.studentId)) validation({ studentId: "Học sinh không thuộc lớp vào ngày này" });
      const rs = ruleSetOn(db, schoolId, input.date);
      const rule = rs?.rules.find((x) => x.id === input.ruleId);
      if (!rs || !rule) validation({ ruleId: "Quy định không thuộc bộ nội quy đang hiệu lực" });
      if (input.reason.trim().length < 3) validation({ reason: "Ghi nội dung sự việc" });
      // Attendance-linked rules: the source is the attendance record — block manual duplicates.
      if (rule!.attendanceLink) {
        const att = db.attendanceRecords.find((r) => r.classId === classId && r.studentId === input.studentId && r.date === input.date && r.status === rule!.attendanceLink);
        const linked = att?.sourceEventKey ? db.conductRecords.find((x) => x.sourceEventKey === att.sourceEventKey && x.status !== "void" && x.status !== "rejected") : undefined;
        if (linked) throw new RepoError("DUPLICATE", `Sự việc này đã được ghi từ điểm danh (${rule!.label} ${rule!.points}). Không trừ điểm lần hai.`, { details: { existing: recordView(db, linked, new Map()), hard: true } });
      }
      const twin = db.conductRecords.find((x) => x.classId === classId && x.studentId === input.studentId && x.date === input.date && x.ruleId === input.ruleId && x.status !== "void" && x.status !== "rejected");
      if (twin && !input.confirmDistinct) throw new RepoError("DUPLICATE", "Đã có ghi nhận cùng học sinh, cùng quy định trong ngày này.", { details: { existing: recordView(db, twin, new Map()), hard: false } });
      if (twin && input.confirmDistinct && (input.distinctNote ?? "").trim().length < 5) validation({ distinctNote: "Giải thích vì sao đây là sự việc khác" });
      const isReviewer = allowed(db, ctx, "conduct.review", { schoolId, classId });
      const rec: ConductRecord = {
        id: newId("cr"), schoolId, classId, studentId: input.studentId, weekId: week!.id, date: input.date, ruleSetId: rs!.id, ruleId: rule!.id, points: rule!.points,
        reason: input.reason.trim() + (twin ? ` — Sự việc khác: ${input.distinctNote}` : ""), sourceEventKey: key, createdBy: actorId(ctx), createdAt: ctx.now,
        status: "pending_review", version: 1, reviewNote: isReviewer ? undefined : "Chờ giáo viên chủ nhiệm rà soát",
      };
      db.conductRecords.push(rec);
      audit(db, ctx, { level: "school", schoolId, action: "Ghi nhận thi đua", entityType: "conduct", entityId: rec.id, entityLabel: `${className(db, classId)} — ${db.students.find((s) => s.id === input.studentId)?.fullName}: ${rule!.label} (${rule!.points})` });
      return { record: rec, idempotent: false };
    });
  },

  async updateRecord(ctx: Ctx, schoolId: ID, yearId: ID, classId: ID, recordId: ID, patch: { ruleId: ID; reason: string; version: number }) {
    return write((db) => {
      classGuard(db, ctx, schoolId, yearId, classId);
      const r = findOr404(db.conductRecords.find((x) => x.id === recordId && x.classId === classId), "ghi nhận");
      const isReviewer = allowed(db, ctx, "conduct.review", { schoolId, classId });
      if (!isReviewer && r.createdBy !== actorId(ctx)) throw new RepoError("FORBIDDEN", "Chỉ người tạo hoặc người rà soát được sửa ghi nhận.");
      if (r.status !== "pending_review") throw new RepoError("LOCKED", "Ghi nhận đã rà soát — không sửa trực tiếp.");
      if (periodOf(db, classId, r.weekId).status !== "open") throw new RepoError("LOCKED");
      if (r.version !== patch.version) throw new RepoError("CONFLICT");
      if (r.linkedAttendanceRecordId && patch.ruleId !== r.ruleId) throw new RepoError("VALIDATION", "Ghi nhận từ điểm danh — hãy sửa ở bảng điểm danh.");
      const rule = db.ruleSets.find((x) => x.id === r.ruleSetId)?.rules.find((x) => x.id === patch.ruleId);
      if (!rule) validation({ ruleId: "Quy định không hợp lệ" });
      Object.assign(r, { ruleId: rule!.id, points: rule!.points, reason: patch.reason.trim(), version: r.version + 1 });
      return r;
    });
  },

  /** Reviewer decisions. Approve / reject (with reason) / void a duplicate. */
  async review(ctx: Ctx, schoolId: ID, yearId: ID, classId: ID, input: { recordIds: ID[]; decision: "approve" | "reject" | "void"; note?: string }) {
    return write((db) => {
      classGuard(db, ctx, schoolId, yearId, classId);
      requireAction(db, ctx, "conduct.review", { schoolId, classId });
      if ((input.decision !== "approve") && (input.note ?? "").trim().length < 3) validation({ note: "Ghi lý do" });
      let n = 0;
      for (const id of input.recordIds) {
        const r = db.conductRecords.find((x) => x.id === id && x.classId === classId);
        if (!r) continue;
        if (periodOf(db, classId, r.weekId).status !== "open") throw new RepoError("LOCKED");
        if (r.status !== "pending_review" && !(input.decision === "void" && r.status === "approved")) continue;
        r.status = input.decision === "approve" ? "approved" : input.decision === "reject" ? "rejected" : "void";
        r.reviewNote = input.note?.trim();
        r.version += 1;
        n++;
      }
      audit(db, ctx, { level: "school", schoolId, action: input.decision === "approve" ? "Duyệt ghi nhận thi đua" : input.decision === "reject" ? "Từ chối ghi nhận" : "Loại ghi nhận trùng", entityType: "conduct", entityId: classId, entityLabel: `${className(db, classId)}: ${n} ghi nhận`, reason: input.note });
      return n;
    });
  },

  /** Week table with explanation of every point. Includes pending records as a PREVIEW (not official). */
  async weekSummary(ctx: Ctx, schoolId: ID, yearId: ID, classId: ID, weekId: ID) {
    return read((db) => {
      classGuard(db, ctx, schoolId, yearId, classId);
      requireAnyAction(db, ctx, ["conduct.review", "conduct.record", "report.class"], { schoolId, classId });
      const w = findOr404(db.weeks.find((x) => x.id === weekId && x.yearId === yearId), "tuần");
      const period = db.conductPeriods.find((p) => p.classId === classId && p.weekId === weekId) ?? { status: "open" as const, currentSnapshotId: undefined, lockedAt: undefined, lockedBy: undefined };
      const snapshot = period.currentSnapshotId ? db.snapshots.find((s) => s.id === period.currentSnapshotId) : undefined;
      const rs = snapshot ? db.ruleSets.find((r) => r.id === snapshot.ruleSetId)! : ruleSetForWeek(db, schoolId, weekId);
      const roster = weekRoster(db, classId, weekId);
      const approved = db.conductRecords.filter((r) => r.classId === classId && r.weekId === weekId && r.status === "approved");
      const withPending = db.conductRecords.filter((r) => r.classId === classId && r.weekId === weekId && (r.status === "approved" || r.status === "pending_review"));
      const checks = reviewChecks(db, classId, weekId);
      const rows = snapshot ? snapshot.rows : computeRows(roster, approved, rs, db.ruleSets);
      const preview = computeRows(roster, withPending, rs, db.ruleSets);
      return {
        week: w, period: { status: period.status, lockedAt: period.lockedAt, lockedByName: staffNameById(db, period.lockedBy) }, ruleSet: rs, snapshot: snapshot ?? null,
        rows: rows.slice().sort((a, b) => nameCompare(a.studentName, b.studentName)),
        preview: preview.slice().sort((a, b) => nameCompare(a.studentName, b.studentName)),
        checks: { pending: checks.pending.length, duplicates: Math.ceil(checks.dups.size / 2), blocking: checks.blocking, warnings: checks.warnings },
        perms: { lock: allowed(db, ctx, "conduct.lock", { schoolId, classId }), publish: allowed(db, ctx, "conduct.publish", { schoolId, classId }), review: allowed(db, ctx, "conduct.review", { schoolId, classId }) },
        policy: db.policies.find((p) => p.schoolId === schoolId),
      };
    });
  },

  /** Lock (chốt): freezes an immutable snapshot. Does NOT make it visible to parents. */
  async lock(ctx: Ctx, schoolId: ID, yearId: ID, classId: ID, weekId: ID, alsoPublish: boolean) {
    return write((db) => {
      classGuard(db, ctx, schoolId, yearId, classId);
      requireAction(db, ctx, "conduct.lock", { schoolId, classId });
      if (alsoPublish) requireAction(db, ctx, "conduct.publish", { schoolId, classId });
      const w = findOr404(db.weeks.find((x) => x.id === weekId), "tuần");
      if (w.startDate > ctx.today) throw new RepoError("VALIDATION", "Tuần chưa bắt đầu.");
      const p = periodOf(db, classId, weekId);
      if (p.status !== "open") throw new RepoError("LOCKED", "Tuần đã chốt.");
      const checks = reviewChecks(db, classId, weekId);
      if (checks.blocking.length) throw new RepoError("VALIDATION", `Chưa thể chốt: ${checks.blocking.join("; ")}.`);
      const rs = ruleSetForWeek(db, schoolId, weekId);
      const prevVersions = db.snapshots.filter((s) => s.classId === classId && s.weekId === weekId).length;
      const snap = makeSnapshot(db, ctx, classId, weekId, rs, prevVersions + 1);
      if (alsoPublish) { snap.status = "published"; snap.publishedAt = ctx.now; snap.publishedBy = actorId(ctx); }
      db.snapshots.push(snap);
      Object.assign(p, { status: alsoPublish ? "published" : "locked", lockedAt: ctx.now, lockedBy: actorId(ctx), currentSnapshotId: snap.id, version: p.version + 1 });
      audit(db, ctx, { level: "school", schoolId, action: alsoPublish ? "Chốt và công bố thi đua" : "Chốt thi đua (chưa công bố)", entityType: "snapshot", entityId: snap.id, entityLabel: `${className(db, classId)} — tuần ${w.index}` });
      return snap;
    });
  },

  async reopen(ctx: Ctx, schoolId: ID, yearId: ID, classId: ID, weekId: ID, reason: string) {
    return write((db) => {
      classGuard(db, ctx, schoolId, yearId, classId);
      requireAction(db, ctx, "conduct.lock", { schoolId, classId });
      const p = periodOf(db, classId, weekId);
      if (p.status !== "locked") throw new RepoError("VALIDATION", p.status === "published" ? "Đã công bố — dùng điều chỉnh sau chốt." : "Tuần chưa chốt.");
      if (reason.trim().length < 5) validation({ reason: "Ghi lý do mở lại" });
      const snap = db.snapshots.find((s) => s.id === p.currentSnapshotId);
      if (snap) snap.status = "withdrawn";
      Object.assign(p, { status: "open", currentSnapshotId: undefined, version: p.version + 1 });
      audit(db, ctx, { level: "school", schoolId, action: "Mở lại tuần đã chốt (chưa công bố)", entityType: "period", entityId: p.id, entityLabel: className(db, classId), reason });
      return p;
    });
  },

  /** Publish the locked snapshot → parents of each student can read their own row. */
  async publish(ctx: Ctx, schoolId: ID, yearId: ID, classId: ID, weekId: ID) {
    return write((db) => {
      classGuard(db, ctx, schoolId, yearId, classId);
      requireAction(db, ctx, "conduct.publish", { schoolId, classId });
      const p = periodOf(db, classId, weekId);
      if (p.status !== "locked") throw new RepoError("VALIDATION", p.status === "published" ? "Đã công bố." : "Cần chốt trước khi công bố.");
      const snap = findOr404(db.snapshots.find((s) => s.id === p.currentSnapshotId), "bản chốt");
      snap.status = "published"; snap.publishedAt = ctx.now; snap.publishedBy = actorId(ctx);
      p.status = "published"; p.version += 1;
      audit(db, ctx, { level: "school", schoolId, action: "Công bố thi đua", entityType: "snapshot", entityId: snap.id, entityLabel: `${className(db, classId)} — tuần ${db.weeks.find((w) => w.id === weekId)?.index}` });
      return snap;
    });
  },

  async snapshots(ctx: Ctx, schoolId: ID, yearId: ID, classId: ID) {
    return read((db) => {
      classGuard(db, ctx, schoolId, yearId, classId);
      requireAnyAction(db, ctx, ["conduct.review", "report.class", "adjustment.approve"], { schoolId, classId });
      return db.snapshots.filter((s) => s.classId === classId).sort((a, b) => (db.weeks.find((w) => w.id === b.weekId)?.index ?? 0) - (db.weeks.find((w) => w.id === a.weekId)?.index ?? 0) || b.versionNo - a.versionNo).map((s) => ({
        id: s.id, weekId: s.weekId, weekIndex: db.weeks.find((w) => w.id === s.weekId)?.index ?? 0, versionNo: s.versionNo, status: s.status, ruleSetName: s.ruleSetName, ruleSetVersionNo: s.ruleSetVersionNo,
        lockedAt: s.lockedAt, lockedByName: staffNameById(db, s.lockedBy), publishedAt: s.publishedAt, publishedByName: staffNameById(db, s.publishedBy), rowCount: s.rows.length,
        avg: s.rows.length ? Math.round((s.rows.reduce((a, r) => a + r.total, 0) / s.rows.length) * 10) / 10 : 0, adjustmentNote: s.adjustmentNote,
      }));
    });
  },

  async snapshot(ctx: Ctx, schoolId: ID, yearId: ID, classId: ID, snapshotId: ID) {
    return read((db) => {
      classGuard(db, ctx, schoolId, yearId, classId);
      requireAnyAction(db, ctx, ["conduct.review", "report.class", "adjustment.approve"], { schoolId, classId });
      const s = findOr404(db.snapshots.find((x) => x.id === snapshotId && x.classId === classId), "bản kết quả");
      const rs = db.ruleSets.find((r) => r.id === s.ruleSetId)!;
      const versions = db.snapshots.filter((x) => x.classId === classId && x.weekId === s.weekId).sort((a, b) => a.versionNo - b.versionNo).map((x) => ({ id: x.id, versionNo: x.versionNo, status: x.status, publishedAt: x.publishedAt, adjustmentNote: x.adjustmentNote }));
      const prev = s.supersedesId ? db.snapshots.find((x) => x.id === s.supersedesId) : undefined;
      return {
        snapshot: { ...s, rows: s.rows.slice().sort((a, b) => nameCompare(a.studentName, b.studentName)) }, ruleSet: rs, week: db.weeks.find((w) => w.id === s.weekId)!, versions,
        diff: prev ? s.rows.filter((r) => prev.rows.find((p) => p.studentId === r.studentId)?.total !== r.total).map((r) => ({ studentId: r.studentId, studentName: r.studentName, before: prev.rows.find((p) => p.studentId === r.studentId)?.total, after: r.total })) : [],
        lockedByName: staffNameById(db, s.lockedBy), publishedByName: staffNameById(db, s.publishedBy), className: className(db, classId),
        canRequestAdjustment: s.status === "published" && allowed(db, ctx, "adjustment.request", { schoolId, classId }),
        pendingAdjustments: db.adjustments.filter((a) => a.snapshotId === s.id && (a.status === "pending" || a.status === "approved")).length,
      };
    });
  },

  /* ------------------------------ adjustments ------------------------------ */
  async adjustments(ctx: Ctx, schoolId: ID, yearId: ID, classId: ID) {
    return read((db) => {
      classGuard(db, ctx, schoolId, yearId, classId);
      requireAnyAction(db, ctx, ["adjustment.request", "adjustment.approve", "conduct.review"], { schoolId, classId });
      return {
        items: db.adjustments.filter((a) => a.classId === classId).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt)).map((a) => {
          const snap = db.snapshots.find((s) => s.id === a.snapshotId)!;
          const rec = a.recordId ? db.conductRecords.find((r) => r.id === a.recordId) : undefined;
          const rs = db.ruleSets.find((r) => r.id === snap.ruleSetId);
          return { ...a, studentName: db.students.find((s) => s.id === a.studentId)?.fullName ?? "", weekIndex: db.weeks.find((w) => w.id === snap.weekId)?.index ?? 0, weekId: snap.weekId, snapshotVersion: snap.versionNo,
            recordLabel: rec ? `${rs?.rules.find((x) => x.id === rec.ruleId)?.label ?? rec.reason} (${rec.points}) — ${rec.date}` : a.ruleId ? rs?.rules.find((x) => x.id === a.ruleId)?.label : undefined,
            requestedByName: staffNameById(db, a.requestedBy), decidedByName: staffNameById(db, a.decidedBy), resultSnapshotStatus: a.resultSnapshotId ? db.snapshots.find((s) => s.id === a.resultSnapshotId)?.status : undefined };
        }),
        canRequest: allowed(db, ctx, "adjustment.request", { schoolId, classId }), canApprove: allowed(db, ctx, "adjustment.approve", { schoolId, classId }), canPublish: allowed(db, ctx, "conduct.publish", { schoolId, classId }) || allowed(db, ctx, "adjustment.approve", { schoolId, classId }),
        me: actorId(ctx),
        snapshots: db.snapshots.filter((s) => s.classId === classId && s.status === "published").map((s) => ({ id: s.id, weekIndex: db.weeks.find((w) => w.id === s.weekId)?.index ?? 0, versionNo: s.versionNo, rows: s.rows.map((r) => ({ studentId: r.studentId, studentName: r.studentName, total: r.total, items: r.items })) })),
        rules: ruleSetOn(db, schoolId, ctx.today)?.rules ?? [],
      };
    });
  },

  /** O21 — request an adjustment. The published version stays visible until a new version is published. */
  async requestAdjustment(ctx: Ctx, schoolId: ID, yearId: ID, classId: ID, input: { snapshotId: ID; studentId: ID; kind: AdjustmentRequest["kind"]; recordId?: ID; newPoints?: number; ruleId?: ID; reason: string }) {
    return write((db) => {
      classGuard(db, ctx, schoolId, yearId, classId);
      requireAction(db, ctx, "adjustment.request", { schoolId, classId });
      const snap = findOr404(db.snapshots.find((s) => s.id === input.snapshotId && s.classId === classId), "bản công bố");
      if (snap.status !== "published") throw new RepoError("VALIDATION", "Chỉ điều chỉnh bản đang công bố.");
      const row = snap.rows.find((r) => r.studentId === input.studentId);
      if (!row) validation({ studentId: "Học sinh không có trong bản công bố" });
      if (input.reason.trim().length < 10) validation({ reason: "Nêu rõ lý do (tối thiểu 10 ký tự)" });
      if (db.adjustments.some((a) => a.snapshotId === snap.id && a.studentId === input.studentId && (a.status === "pending" || a.status === "approved"))) throw new RepoError("DUPLICATE", "Đã có đề nghị điều chỉnh đang xử lý cho học sinh này.");
      const rs = db.ruleSets.find((r) => r.id === snap.ruleSetId)!;
      let delta = 0;
      if (input.kind === "remove_record") {
        const item = row!.items.find((i) => i.recordId === input.recordId);
        if (!item) validation({ recordId: "Chọn ghi nhận cần bỏ" });
        delta = -item!.points;
      } else if (input.kind === "change_points") {
        const item = row!.items.find((i) => i.recordId === input.recordId);
        if (!item || input.newPoints === undefined || !Number.isFinite(input.newPoints)) validation({ newPoints: "Nhập số điểm mới" });
        delta = input.newPoints! - item!.points;
      } else {
        const rule = rs.rules.find((r) => r.id === input.ruleId);
        if (!rule) validation({ ruleId: "Chọn quy định (theo phiên bản của bản công bố)" });
        delta = rule!.points;
      }
      const raw = row!.base + row!.plus + row!.minus + delta;
      const after = Math.min(rs.cap ?? Infinity, Math.max(rs.floor ?? -Infinity, raw));
      const a: AdjustmentRequest = { id: newId("adj"), schoolId, classId, snapshotId: snap.id, studentId: input.studentId, recordId: input.recordId, kind: input.kind, newPoints: input.newPoints, ruleId: input.ruleId, beforeTotal: row!.total, afterTotal: after, reason: input.reason.trim(), status: "pending", requestedBy: actorId(ctx), requestedAt: ctx.now };
      db.adjustments.push(a);
      const approvers = db.memberships.filter((m) => m.schoolId === schoolId && m.status === "active" && m.roleTemplateIds.some((r) => db.roleTemplates.find((t) => t.id === r)?.actions.includes("adjustment.approve")));
      approvers.forEach((m) => db.notifications.push({ id: newId("nt"), schoolId, userId: m.userId, kind: "task", title: "Đề nghị điều chỉnh sau chốt", body: `${className(db, classId)} — ${row!.studentName}: ${a.beforeTotal} → ${a.afterTotal}`, href: `/classroom/${schoolId}/${yearId}/${classId}/adjustments`, createdAt: ctx.now }));
      audit(db, ctx, { level: "school", schoolId, action: "Đề nghị điều chỉnh sau chốt", entityType: "adjustment", entityId: a.id, entityLabel: `${className(db, classId)} — ${row!.studentName}`, before: { total: a.beforeTotal }, after: { total: a.afterTotal }, reason: a.reason });
      return a;
    });
  },

  /** Approve → apply to records and create a NEW locked snapshot version (old one still published). */
  async decideAdjustment(ctx: Ctx, schoolId: ID, yearId: ID, classId: ID, adjustmentId: ID, approve: boolean, note: string) {
    return write((db) => {
      classGuard(db, ctx, schoolId, yearId, classId);
      requireAction(db, ctx, "adjustment.approve", { schoolId, classId });
      const a = findOr404(db.adjustments.find((x) => x.id === adjustmentId && x.classId === classId), "đề nghị");
      if (a.status !== "pending") throw new RepoError("VALIDATION", "Đề nghị đã được xử lý.");
      if (a.requestedBy === actorId(ctx)) throw new RepoError("FORBIDDEN", "Người đề nghị không tự duyệt điều chỉnh của mình.");
      if (!approve && note.trim().length < 5) validation({ note: "Ghi lý do từ chối" });
      a.decidedBy = actorId(ctx); a.decidedAt = ctx.now; a.decisionNote = note.trim() || undefined;
      if (!approve) { a.status = "rejected"; audit(db, ctx, { level: "school", schoolId, action: "Từ chối điều chỉnh", entityType: "adjustment", entityId: a.id, entityLabel: className(db, classId), reason: note }); return a; }
      const snap = db.snapshots.find((s) => s.id === a.snapshotId)!;
      const rs = db.ruleSets.find((r) => r.id === snap.ruleSetId)!;
      if (a.kind === "remove_record" && a.recordId) { const r = db.conductRecords.find((x) => x.id === a.recordId)!; r.status = "void"; r.reviewNote = `Điều chỉnh sau chốt: ${a.reason}`; }
      if (a.kind === "change_points" && a.recordId) { const r = db.conductRecords.find((x) => x.id === a.recordId)!; r.points = a.newPoints!; r.reviewNote = `Điều chỉnh sau chốt: ${a.reason}`; }
      if (a.kind === "add_record") {
        const rule = rs.rules.find((x) => x.id === a.ruleId)!;
        const w = db.weeks.find((x) => x.id === snap.weekId)!;
        db.conductRecords.push({ id: newId("cr"), schoolId, classId, studentId: a.studentId, weekId: snap.weekId, date: w.endDate < ctx.today ? addDays(w.endDate, -1) : ctx.today, ruleSetId: rs.id, ruleId: rule.id, points: rule.points, reason: `Bổ sung sau chốt: ${a.reason}`, createdBy: a.requestedBy, createdAt: ctx.now, status: "approved", version: 1 });
      }
      const next = makeSnapshot(db, ctx, classId, snap.weekId, rs, Math.max(...db.snapshots.filter((s) => s.classId === classId && s.weekId === snap.weekId).map((s) => s.versionNo)) + 1, snap.id, `Điều chỉnh: ${a.reason}`);
      db.snapshots.push(next);
      a.status = "approved";
      a.resultSnapshotId = next.id;
      db.notifications.push({ id: newId("nt"), schoolId, userId: a.requestedBy, kind: "task", title: "Điều chỉnh đã được duyệt", body: `${className(db, classId)} — chờ công bố lại bản ${next.versionNo}`, href: `/classroom/${schoolId}/${yearId}/${classId}/adjustments`, createdAt: ctx.now });
      audit(db, ctx, { level: "school", schoolId, action: "Duyệt điều chỉnh (tạo bản mới, chưa công bố)", entityType: "snapshot", entityId: next.id, entityLabel: `${className(db, classId)} — tuần ${db.weeks.find((w) => w.id === snap.weekId)?.index}, bản ${next.versionNo}`, before: { total: a.beforeTotal }, after: { total: a.afterTotal }, reason: a.reason });
      return a;
    });
  },

  /** Publish the adjusted version: old snapshot becomes "superseded" (kept for history). */
  async publishAdjustment(ctx: Ctx, schoolId: ID, yearId: ID, classId: ID, adjustmentId: ID) {
    return write((db) => {
      classGuard(db, ctx, schoolId, yearId, classId);
      if (!allowed(db, ctx, "conduct.publish", { schoolId, classId })) requireAction(db, ctx, "adjustment.approve", { schoolId, classId });
      const a = findOr404(db.adjustments.find((x) => x.id === adjustmentId && x.classId === classId), "đề nghị");
      if (a.status !== "approved" || !a.resultSnapshotId) throw new RepoError("VALIDATION", "Đề nghị chưa được duyệt.");
      const next = db.snapshots.find((s) => s.id === a.resultSnapshotId)!;
      const old = db.snapshots.find((s) => s.id === next.supersedesId);
      if (old && old.status === "published") old.status = "superseded";
      next.status = "published"; next.publishedAt = ctx.now; next.publishedBy = actorId(ctx);
      const p = periodOf(db, classId, next.weekId);
      p.currentSnapshotId = next.id; p.status = "published"; p.version += 1;
      a.status = "published";
      audit(db, ctx, { level: "school", schoolId, action: "Công bố lại sau điều chỉnh", entityType: "snapshot", entityId: next.id, entityLabel: `${className(db, classId)} — bản ${next.versionNo}`, before: { total: a.beforeTotal }, after: { total: a.afterTotal } });
      return next;
    });
  },

  /* ------------------------------ school oversight (SC36) ------------------------------ */
  async publicationCenter(ctx: Ctx, schoolId: ID, weekId?: ID) {
    return read((db) => {
      requireAction(db, ctx, "publication.oversee", { schoolId });
      const year = currentYear(db, schoolId)!;
      const current = weekOfDate(db, year.id, ctx.today);
      const weeks = db.weeks.filter((w) => w.yearId === year.id && w.startDate <= ctx.today).sort((a, b) => b.index - a.index);
      const wid = weekId ?? current?.id ?? weeks[0]?.id;
      const w = db.weeks.find((x) => x.id === wid)!;
      const classes = db.classes.filter((c) => c.schoolId === schoolId && c.yearId === year.id && c.status === "active").sort((a, b) => a.name.localeCompare(b.name, "vi"));
      return {
        weeks: weeks.map((x) => ({ id: x.id, index: x.index, startDate: x.startDate, endDate: x.endDate })), week: w,
        rows: classes.map((c) => {
          const p = db.conductPeriods.find((x) => x.classId === c.id && x.weekId === wid);
          const checks = reviewChecks(db, c.id, wid);
          const snap = p?.currentSnapshotId ? db.snapshots.find((s) => s.id === p.currentSnapshotId) : undefined;
          const sessions = db.attendanceSessions.filter((s) => s.classId === c.id && s.date >= w.startDate && s.date <= w.endDate && s.slot === "morning");
          return { classId: c.id, yearId: c.yearId, className: c.name, homeroom: staffNameById(db, db.memberships.find((m) => m.id === db.assignments.find((a) => a.classId === c.id && a.kind === "homeroom" && a.status === "active")?.membershipId)?.userId),
            status: p?.status ?? "open", pending: checks.pending.length, blocking: checks.blocking, warnings: checks.warnings, overdue: (p?.status ?? "open") === "open" && w.closeDeadline < ctx.today,
            snapshotVersion: snap?.versionNo, publishedAt: snap?.publishedAt, attendanceSaved: sessions.length, attendancePublished: sessions.filter((s) => s.status === "published").length,
            adjustments: db.adjustments.filter((a) => a.classId === c.id && a.status === "pending").length };
        }),
        adjustments: db.adjustments.filter((a) => a.schoolId === schoolId && (a.status === "pending" || a.status === "approved")).map((a) => ({ ...a, className: className(db, a.classId), studentName: db.students.find((s) => s.id === a.studentId)?.fullName, requestedByName: staffNameById(db, a.requestedBy), yearId: db.classes.find((c) => c.id === a.classId)?.yearId })),
        announcements: db.announcements.filter((a) => a.schoolId === schoolId && (a.status === "draft" || a.status === "scheduled")).map((a) => ({ id: a.id, title: a.title, status: a.status, origin: a.origin, className: className(db, a.originClassId), scheduledAt: a.scheduledAt, yearId: year.id, classId: a.originClassId })),
      };
    });
  },

  /** Pure calculator used by the rule editor "thử tính mẫu" (no persistence). */
  simulate(ruleSet: Pick<RuleSet, "baseScore" | "cap" | "floor" | "bands">, points: number[]) {
    const raw = ruleSet.baseScore + points.reduce((a, b) => a + b, 0);
    const total = Math.min(ruleSet.cap ?? Infinity, Math.max(ruleSet.floor ?? -Infinity, raw));
    return { raw, total, grade: gradeFor(total, ruleSet.bands).label };
  },
};
