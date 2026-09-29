import type { DemoDB, ExportJob, ID } from "@/lib/model/types";
import { addDays, mondayOf } from "@/lib/demo/clock";
import { newId } from "@/lib/demo/ids";
import { countAttendance } from "@/lib/domain/attendance";
import { fmtDate, fmtPercent, nameCompare, submissionStatus, attendanceStatus } from "@/lib/formatters";
import { liveAssignments } from "@/lib/permissions/can";
import { RepoError } from "./errors";
import { allowed, audit, findOr404, read, requireAction, requireAnyAction, requireStaff, validation, write, actorId, type Ctx } from "./core";
import { classGuard, refDateOf } from "./classroom";
import { className, currentYear, homeroomTeacher, rosterBetween, rosterOn, staffName, staffNameById, weekOfDate } from "./selectors";
import { accessStatus } from "./students";

export interface ReportColumn { key: string; label: string; align?: "left" | "right" | "center" }
export interface ReportData {
  type: string; title: string; subtitle: string; scopeLabel: string; generatedAt: string; periodLabel: string;
  kpis: { label: string; value: string; hint?: string }[];
  chart?: { kind: "bar" | "stack"; title: string; unit?: string; series: { label: string; value: number; color: string }[]; denominatorLabel: string };
  columns: ReportColumn[]; rows: Record<string, string | number>[]; notes: string[]; drill?: Record<string, string>;
}

export const SCHOOL_REPORTS = [
  { type: "attendance", title: "Chuyên cần theo lớp", description: "Tỷ lệ có mặt, đi muộn, nghỉ có/không phép theo các buổi đã lưu." },
  { type: "conduct", title: "Thi đua theo tuần", description: "Trạng thái rà soát/chốt/công bố và phân bố xếp loại theo bản đã chốt." },
  { type: "activities", title: "Hoạt động và minh chứng", description: "Tiến độ hoàn thành trên số học sinh được giao." },
  { type: "class-progress", title: "Tiến độ vận hành lớp", description: "Lớp thiếu phân công, chưa điểm danh, việc còn mở." },
  { type: "links", title: "Sử dụng link tra cứu", description: "Số link đang hiệu lực và đã được mở — không xác định danh tính người mở." },
] as const;

export const CLASS_REPORTS = [
  { type: "attendance", title: "Chuyên cần học sinh", description: "Tổng hợp theo từng học sinh trong khoảng thời gian." },
  { type: "conduct", title: "Thi đua theo tuần", description: "Bảng đã chốt/công bố hoặc bản xem trước có ghi chú." },
  { type: "activities", title: "Hoạt động của lớp", description: "Tình trạng từng học sinh theo hoạt động." },
  { type: "student", title: "Báo cáo cá nhân", description: "Chuyên cần, thi đua đã công bố và hoạt động của một học sinh." },
] as const;

const COLORS = { present: "#0e9f6e", late: "#f59e0b", excused: "#0a72e6", unexcused: "#e5484d", unmarked: "#94a3b8" };

function range(params: Record<string, string | undefined>, today: string) {
  const from = params.from ?? mondayOf(today);
  const to = params.to ?? today;
  return { from, to: to < from ? from : to };
}

function attendanceForClass(db: DemoDB, classId: ID, from: string, to: string) {
  const sessions = db.attendanceSessions.filter((s) => s.classId === classId && s.slot === "morning" && s.date >= from && s.date <= to);
  const t = { present: 0, late: 0, excused: 0, unexcused: 0, unmarked: 0, total: 0, sessions: sessions.length, published: sessions.filter((s) => s.status === "published").length };
  for (const s of sessions) {
    const roster = rosterOn(db, classId, s.date).map((x) => x.id);
    const c = countAttendance(roster, db.attendanceRecords.filter((r) => r.sessionId === s.id));
    t.present += c.present; t.late += c.late; t.excused += c.excused; t.unexcused += c.unexcused; t.unmarked += c.unmarked; t.total += c.total;
  }
  return t;
}

export const reportsRepo = {
  async schoolCatalog(ctx: Ctx, schoolId: ID) {
    return read((db) => {
      requireAction(db, ctx, "report.school", { schoolId });
      return { reports: SCHOOL_REPORTS, canExport: allowed(db, ctx, "export.run", { schoolId }), weeks: db.weeks.filter((w) => w.yearId === currentYear(db, schoolId)?.id && w.startDate <= ctx.today).sort((a, b) => b.index - a.index) };
    });
  },

  async school(ctx: Ctx, schoolId: ID, type: string, params: Record<string, string | undefined>): Promise<ReportData> {
    return read((db) => {
      requireAction(db, ctx, "report.school", { schoolId });
      const year = currentYear(db, schoolId)!;
      const classes = db.classes.filter((c) => c.schoolId === schoolId && c.yearId === year.id && c.status === "active" && (!params.gradeId || c.gradeId === params.gradeId)).sort((a, b) => a.name.localeCompare(b.name, "vi"));
      const school = db.schools.find((s) => s.id === schoolId)!;
      const base = { scopeLabel: `${school.name} — năm học ${year.label}`, generatedAt: ctx.now, notes: ["Dữ liệu minh họa từ bản demo, không phải số liệu thật."] };
      if (type === "attendance") {
        const { from, to } = range(params, ctx.today);
        const rows = classes.map((c) => ({ c, t: attendanceForClass(db, c.id, from, to) }));
        const sum = rows.reduce((a, r) => ({ present: a.present + r.t.present, late: a.late + r.t.late, excused: a.excused + r.t.excused, unexcused: a.unexcused + r.t.unexcused, unmarked: a.unmarked + r.t.unmarked, total: a.total + r.t.total }), { present: 0, late: 0, excused: 0, unexcused: 0, unmarked: 0, total: 0 });
        return {
          ...base, type, title: "Chuyên cần theo lớp", subtitle: "Buổi sáng, gồm buổi đã lưu và đã công bố", periodLabel: `${fmtDate(from)} – ${fmtDate(to)}`,
          kpis: [
            { label: "Lượt học sinh-buổi", value: String(sum.total), hint: "Mẫu số của mọi tỷ lệ" },
            { label: "Hiện diện (đúng giờ + muộn)", value: fmtPercent(sum.present + sum.late, sum.total, 1) },
            { label: "Nghỉ không phép", value: String(sum.unexcused), hint: fmtPercent(sum.unexcused, sum.total, 1) },
            { label: "Chưa điểm danh", value: String(sum.unmarked), hint: "Không tính là có mặt" },
          ],
          chart: { kind: "stack", title: "Cơ cấu trạng thái", series: [
            { label: "Có mặt", value: sum.present, color: COLORS.present }, { label: "Đi muộn", value: sum.late, color: COLORS.late },
            { label: "Nghỉ có phép", value: sum.excused, color: COLORS.excused }, { label: "Nghỉ không phép", value: sum.unexcused, color: COLORS.unexcused }, { label: "Chưa điểm danh", value: sum.unmarked, color: COLORS.unmarked },
          ], denominatorLabel: `${sum.total} lượt học sinh-buổi` },
          columns: [{ key: "class", label: "Lớp" }, { key: "sessions", label: "Buổi đã lưu", align: "right" }, { key: "published", label: "Đã công bố", align: "right" }, { key: "present", label: "Có mặt", align: "right" }, { key: "late", label: "Đi muộn", align: "right" }, { key: "excused", label: "Nghỉ có phép", align: "right" }, { key: "unexcused", label: "Nghỉ không phép", align: "right" }, { key: "unmarked", label: "Chưa điểm danh", align: "right" }, { key: "rate", label: "Tỷ lệ hiện diện", align: "right" }],
          rows: rows.map(({ c, t }) => ({ class: c.name, sessions: t.sessions, published: t.published, present: t.present, late: t.late, excused: t.excused, unexcused: t.unexcused, unmarked: t.unmarked, rate: fmtPercent(t.present + t.late, t.total, 1), _href: `/classroom/${schoolId}/${c.yearId}/${c.id}/attendance/weekly` })),
        };
      }
      if (type === "conduct") {
        const wk = db.weeks.find((w) => w.id === params.weekId) ?? weekOfDate(db, year.id, addDays(ctx.today, -7))!;
        const rows = classes.map((c) => {
          const p = db.conductPeriods.find((x) => x.classId === c.id && x.weekId === wk.id);
          const snap = p?.currentSnapshotId ? db.snapshots.find((s) => s.id === p.currentSnapshotId) : undefined;
          const bands = { "Tốt": 0, "Khá": 0, "Đạt": 0, "Cần cố gắng": 0 } as Record<string, number>;
          snap?.rows.forEach((r) => (bands[r.grade] = (bands[r.grade] ?? 0) + 1));
          return { c, status: p?.status ?? "open", snap, bands, pending: db.conductRecords.filter((r) => r.classId === c.id && r.weekId === wk.id && r.status === "pending_review").length };
        });
        const statusLabel = (s: string) => (s === "published" ? "Đã công bố" : s === "locked" ? "Đã chốt, chưa công bố" : "Đang mở");
        const all = rows.flatMap((r) => r.snap?.rows ?? []);
        return {
          ...base, type, title: "Thi đua theo tuần", subtitle: "Chỉ bản đã chốt được tính phân bố xếp loại", periodLabel: `Tuần ${wk.index} (${fmtDate(wk.startDate)} – ${fmtDate(wk.endDate)})`,
          kpis: [
            { label: "Lớp đã công bố", value: `${rows.filter((r) => r.status === "published").length}/${rows.length}` },
            { label: "Đã chốt chưa công bố", value: String(rows.filter((r) => r.status === "locked").length) },
            { label: "Ghi nhận chờ rà soát", value: String(rows.reduce((a, r) => a + r.pending, 0)) },
            { label: "Điểm trung bình (bản chốt)", value: all.length ? (all.reduce((a, r) => a + r.total, 0) / all.length).toFixed(1).replace(".", ",") : "—", hint: `${all.length} học sinh` },
          ],
          chart: { kind: "bar", title: "Phân bố xếp loại (bản đã chốt)", series: ["Tốt", "Khá", "Đạt", "Cần cố gắng"].map((g, i) => ({ label: g, value: all.filter((r) => r.grade === g).length, color: ["#0e9f6e", "#0a72e6", "#f59e0b", "#e5484d"][i] })), denominatorLabel: `${all.length} học sinh thuộc lớp đã chốt` },
          columns: [{ key: "class", label: "Lớp" }, { key: "status", label: "Trạng thái" }, { key: "version", label: "Phiên bản", align: "center" }, { key: "avg", label: "Điểm TB", align: "right" }, { key: "tot", label: "Tốt", align: "right" }, { key: "kha", label: "Khá", align: "right" }, { key: "dat", label: "Đạt", align: "right" }, { key: "ccg", label: "Cần cố gắng", align: "right" }, { key: "pending", label: "Chờ rà soát", align: "right" }],
          rows: rows.map((r) => ({ class: r.c.name, status: statusLabel(r.status), version: r.snap ? `v${r.snap.versionNo}` : "—", avg: r.snap && r.snap.rows.length ? (r.snap.rows.reduce((a, x) => a + x.total, 0) / r.snap.rows.length).toFixed(1).replace(".", ",") : "—", tot: r.bands["Tốt"], kha: r.bands["Khá"], dat: r.bands["Đạt"], ccg: r.bands["Cần cố gắng"], pending: r.pending, _href: `/classroom/${schoolId}/${r.c.yearId}/${r.c.id}/conduct/weekly?week=${wk.id}` })),
        };
      }
      if (type === "activities") {
        const rows = classes.map((c) => {
          const acts = db.activities.filter((a) => a.classId === c.id && a.status !== "draft");
          const assigned = acts.reduce((a, x) => a + x.assignedStudentIds.length, 0);
          const approved = db.submissions.filter((s) => acts.some((a) => a.id === s.activityId) && s.status === "approved").length;
          return { c, acts: acts.length, assigned, approved, pending: db.evidence.filter((e) => e.classId === c.id && e.status === "pending").length, supplement: db.submissions.filter((s) => acts.some((a) => a.id === s.activityId) && s.status === "needs_supplement").length };
        });
        const assigned = rows.reduce((a, r) => a + r.assigned, 0), approved = rows.reduce((a, r) => a + r.approved, 0);
        return {
          ...base, type, title: "Hoạt động và minh chứng", subtitle: "Mẫu số là tổng lượt học sinh được giao", periodLabel: `Đến ${fmtDate(ctx.today)}`,
          kpis: [{ label: "Hoạt động đang giao", value: String(rows.reduce((a, r) => a + r.acts, 0)) }, { label: "Lượt được giao", value: String(assigned) }, { label: "Đã duyệt", value: `${approved}`, hint: fmtPercent(approved, assigned) }, { label: "Minh chứng chờ duyệt", value: String(rows.reduce((a, r) => a + r.pending, 0)) }],
          chart: { kind: "bar", title: "Tỷ lệ hoàn thành theo lớp (%)", unit: "%", series: rows.map((r) => ({ label: r.c.name, value: r.assigned ? Math.round((r.approved / r.assigned) * 100) : 0, color: "#7c5ce0" })), denominatorLabel: "Trên số học sinh được giao của từng lớp" },
          columns: [{ key: "class", label: "Lớp" }, { key: "acts", label: "Hoạt động", align: "right" }, { key: "assigned", label: "Lượt giao", align: "right" }, { key: "approved", label: "Đã duyệt", align: "right" }, { key: "supplement", label: "Cần bổ sung", align: "right" }, { key: "pending", label: "Chờ duyệt", align: "right" }, { key: "rate", label: "Hoàn thành", align: "right" }],
          rows: rows.map((r) => ({ class: r.c.name, acts: r.acts, assigned: r.assigned, approved: r.approved, supplement: r.supplement, pending: r.pending, rate: fmtPercent(r.approved, r.assigned), _href: `/classroom/${schoolId}/${r.c.yearId}/${r.c.id}/activities` })),
        };
      }
      if (type === "class-progress") {
        const all = db.classes.filter((c) => c.schoolId === schoolId && c.yearId === year.id).sort((a, b) => a.name.localeCompare(b.name, "vi"));
        const rows = all.map((c) => {
          const hr = homeroomTeacher(db, c.id, ctx.today);
          const today = db.attendanceSessions.find((s) => s.classId === c.id && s.date === ctx.today && s.slot === "morning");
          return { class: c.name, status: c.status === "active" ? "Đang hoạt động" : c.status === "draft" ? "Nháp" : "Lưu trữ", homeroom: hr ? staffName(hr) : "Chưa phân công", students: rosterOn(db, c.id, ctx.today).length, attendance: today ? (today.status === "published" ? "Đã công bố" : "Đã lưu") : "Chưa điểm danh", pending: db.conductRecords.filter((r) => r.classId === c.id && r.status === "pending_review").length, open: db.conductPeriods.filter((p) => p.classId === c.id && p.status === "open" && (db.weeks.find((w) => w.id === p.weekId)?.closeDeadline ?? "9") < ctx.today).length };
        });
        return {
          ...base, type, title: "Tiến độ vận hành lớp", subtitle: "Tình trạng ngày hiện tại theo đồng hồ demo", periodLabel: fmtDate(ctx.today),
          kpis: [{ label: "Lớp", value: String(all.length) }, { label: "Chưa có chủ nhiệm", value: String(rows.filter((r) => r.homeroom === "Chưa phân công").length) }, { label: "Chưa điểm danh hôm nay", value: String(rows.filter((r) => r.attendance === "Chưa điểm danh" && r.status === "Đang hoạt động").length) }, { label: "Tuần quá hạn chốt", value: String(rows.reduce((a, r) => a + r.open, 0)) }],
          columns: [{ key: "class", label: "Lớp" }, { key: "status", label: "Trạng thái" }, { key: "homeroom", label: "Chủ nhiệm" }, { key: "students", label: "Sĩ số", align: "right" }, { key: "attendance", label: "Điểm danh hôm nay" }, { key: "pending", label: "Chờ rà soát", align: "right" }, { key: "open", label: "Tuần quá hạn", align: "right" }],
          rows,
        };
      }
      if (type === "links") {
        const rows = classes.map((c) => {
          const roster = rosterOn(db, c.id, ctx.today);
          const acc = db.parentAccesses.filter((p) => roster.some((s) => s.id === p.studentId));
          const active = acc.filter((p) => accessStatus(p, ctx.now) === "active");
          const opened = active.filter((p) => db.parentAccessLogs.some((l) => l.accessId === p.id && (l.event === "opened" || l.event === "viewed")));
          return { class: c.name, students: roster.length, withLink: new Set(active.map((p) => p.studentId)).size, links: active.length, opened: opened.length, revoked: acc.filter((p) => accessStatus(p, ctx.now) === "revoked").length, expired: acc.filter((p) => accessStatus(p, ctx.now) === "expired").length };
        });
        const tot = rows.reduce((a, r) => ({ students: a.students + r.students, withLink: a.withLink + r.withLink, links: a.links + r.links, opened: a.opened + r.opened }), { students: 0, withLink: 0, links: 0, opened: 0 });
        return {
          ...base, type, title: "Sử dụng link tra cứu", subtitle: "Đếm theo link đã cấp. Không khẳng định ai là người đã mở link.", periodLabel: `Đến ${fmtDate(ctx.today)}`,
          kpis: [{ label: "Học sinh có link hiệu lực", value: `${tot.withLink}/${tot.students}`, hint: fmtPercent(tot.withLink, tot.students) }, { label: "Link đang hiệu lực", value: String(tot.links) }, { label: "Link đã được mở", value: String(tot.opened), hint: fmtPercent(tot.opened, tot.links) }],
          columns: [{ key: "class", label: "Lớp" }, { key: "students", label: "Sĩ số", align: "right" }, { key: "withLink", label: "HS có link", align: "right" }, { key: "links", label: "Link hiệu lực", align: "right" }, { key: "opened", label: "Link đã được mở", align: "right" }, { key: "expired", label: "Hết hạn", align: "right" }, { key: "revoked", label: "Đã thu hồi", align: "right" }],
          rows, notes: [...base.notes, "Nhật ký chỉ ghi 'link cấp cho … được mở', không xác minh danh tính người mở."],
        };
      }
      throw new RepoError("NOT_FOUND", "Loại báo cáo không tồn tại.");
    });
  },

  async classCatalog(ctx: Ctx, schoolId: ID, yearId: ID, classId: ID) {
    return read((db) => {
      const c = classGuard(db, ctx, schoolId, yearId, classId);
      requireAction(db, ctx, "report.class", { schoolId, classId });
      return { reports: CLASS_REPORTS, canExport: allowed(db, ctx, "report.export", { schoolId, classId }), students: rosterOn(db, classId, refDateOf(db, c, ctx.today)).map((s) => ({ id: s.id, fullName: s.fullName })), weeks: db.weeks.filter((w) => w.yearId === yearId && w.startDate <= ctx.today).sort((a, b) => b.index - a.index) };
    });
  },

  async classReport(ctx: Ctx, schoolId: ID, yearId: ID, classId: ID, type: string, params: Record<string, string | undefined>): Promise<ReportData> {
    return read((db) => {
      const c = classGuard(db, ctx, schoolId, yearId, classId);
      requireAction(db, ctx, "report.class", { schoolId, classId });
      const ref = refDateOf(db, c, ctx.today);
      const base = { scopeLabel: `Lớp ${c.name} — ${db.schools.find((s) => s.id === schoolId)?.name}`, generatedAt: ctx.now, notes: ["Dữ liệu minh họa từ bản demo."] };
      if (type === "attendance") {
        const { from, to } = range(params, ref);
        const sessions = db.attendanceSessions.filter((s) => s.classId === classId && s.slot === "morning" && s.date >= from && s.date <= to);
        const roster = rosterBetween(db, classId, from, to);
        const rows = roster.map((s) => {
          const t = { present: 0, late: 0, excused: 0, unexcused: 0, unmarked: 0, days: 0 };
          sessions.forEach((ses) => {
            if (!rosterOn(db, classId, ses.date).some((x) => x.id === s.id)) return;
            t.days++;
            const r = db.attendanceRecords.find((x) => x.sessionId === ses.id && x.studentId === s.id);
            t[(r?.status ?? "unmarked") as keyof typeof t]++;
          });
          return { code: s.code, name: s.fullName, days: t.days, present: t.present, late: t.late, excused: t.excused, unexcused: t.unexcused, unmarked: t.unmarked, rate: fmtPercent(t.present + t.late, t.days, 1) };
        });
        const sum = rows.reduce((a, r) => ({ days: a.days + r.days, present: a.present + r.present, late: a.late + r.late, excused: a.excused + r.excused, unexcused: a.unexcused + r.unexcused, unmarked: a.unmarked + r.unmarked }), { days: 0, present: 0, late: 0, excused: 0, unexcused: 0, unmarked: 0 });
        return {
          ...base, type, title: "Chuyên cần học sinh", subtitle: "Buổi sáng đã lưu (kể cả chưa công bố)", periodLabel: `${fmtDate(from)} – ${fmtDate(to)}`,
          kpis: [{ label: "Buổi đã lưu", value: String(sessions.length) }, { label: "Hiện diện", value: fmtPercent(sum.present + sum.late, sum.days, 1), hint: `${sum.days} lượt` }, { label: "Đi muộn", value: String(sum.late) }, { label: "Nghỉ không phép", value: String(sum.unexcused) }],
          chart: { kind: "stack", title: "Cơ cấu trạng thái", series: (["present", "late", "excused", "unexcused", "unmarked"] as const).map((k) => ({ label: attendanceStatus[k].label, value: sum[k], color: COLORS[k] })), denominatorLabel: `${sum.days} lượt học sinh-buổi` },
          columns: [{ key: "code", label: "Mã HS" }, { key: "name", label: "Họ và tên" }, { key: "days", label: "Số buổi", align: "right" }, { key: "present", label: "Có mặt", align: "right" }, { key: "late", label: "Đi muộn", align: "right" }, { key: "excused", label: "Có phép", align: "right" }, { key: "unexcused", label: "Không phép", align: "right" }, { key: "unmarked", label: "Chưa ĐD", align: "right" }, { key: "rate", label: "Hiện diện", align: "right" }],
          rows: rows.sort((a, b) => nameCompare(String(a.name), String(b.name))),
        };
      }
      if (type === "conduct") {
        const wk = db.weeks.find((w) => w.id === params.weekId && w.yearId === yearId) ?? weekOfDate(db, yearId, addDays(ref, -7))!;
        const p = db.conductPeriods.find((x) => x.classId === classId && x.weekId === wk.id);
        const snap = p?.currentSnapshotId ? db.snapshots.find((s) => s.id === p.currentSnapshotId) : undefined;
        const rows = (snap?.rows ?? []).slice().sort((a, b) => nameCompare(a.studentName, b.studentName));
        return {
          ...base, type, title: "Thi đua theo tuần", subtitle: snap ? `Bản ${snap.status === "published" ? "đã công bố" : "đã chốt, chưa công bố"} v${snap.versionNo} — ${snap.ruleSetName} (bản ${snap.ruleSetVersionNo})` : "Tuần chưa chốt — chưa có bảng chính thức", periodLabel: `Tuần ${wk.index} (${fmtDate(wk.startDate)} – ${fmtDate(wk.endDate)})`,
          kpis: snap ? [{ label: "Học sinh", value: String(rows.length) }, { label: "Điểm trung bình", value: (rows.reduce((a, r) => a + r.total, 0) / Math.max(1, rows.length)).toFixed(1).replace(".", ",") }, { label: "Xếp loại Tốt", value: String(rows.filter((r) => r.grade === "Tốt").length) }, { label: "Cần cố gắng", value: String(rows.filter((r) => r.grade === "Cần cố gắng").length) }] : [{ label: "Trạng thái", value: "Chưa chốt" }],
          chart: snap ? { kind: "bar", title: "Phân bố xếp loại", series: ["Tốt", "Khá", "Đạt", "Cần cố gắng"].map((g, i) => ({ label: g, value: rows.filter((r) => r.grade === g).length, color: ["#0e9f6e", "#0a72e6", "#f59e0b", "#e5484d"][i] })), denominatorLabel: `${rows.length} học sinh` } : undefined,
          columns: [{ key: "code", label: "Mã HS" }, { key: "name", label: "Họ và tên" }, { key: "base", label: "Điểm gốc", align: "right" }, { key: "plus", label: "Cộng", align: "right" }, { key: "minus", label: "Trừ", align: "right" }, { key: "total", label: "Tổng", align: "right" }, { key: "grade", label: "Xếp loại" }],
          rows: rows.map((r) => ({ code: r.studentCode, name: r.studentName, base: r.base, plus: r.plus, minus: r.minus, total: r.total, grade: r.grade })),
        };
      }
      if (type === "activities") {
        const acts = db.activities.filter((a) => a.classId === classId && a.status !== "draft");
        const roster = rosterOn(db, classId, ref);
        return {
          ...base, type, title: "Hoạt động của lớp", subtitle: "Ô trống: học sinh không được giao hoạt động", periodLabel: `Đến ${fmtDate(ref)}`,
          kpis: acts.map((a) => ({ label: a.title, value: `${db.submissions.filter((s) => s.activityId === a.id && s.status === "approved").length}/${a.assignedStudentIds.length}`, hint: "đã duyệt / được giao" })).slice(0, 4),
          columns: [{ key: "code", label: "Mã HS" }, { key: "name", label: "Họ và tên" }, ...acts.map((a) => ({ key: a.id, label: a.title }))],
          rows: roster.map((s) => Object.fromEntries([["code", s.code], ["name", s.fullName], ...acts.map((a) => [a.id, a.assignedStudentIds.includes(s.id) ? submissionStatus[db.submissions.find((x) => x.activityId === a.id && x.studentId === s.id)?.status ?? "not_received"].label : ""])])),
        };
      }
      if (type === "student") {
        const sid = params.studentId;
        const s = findOr404(db.students.find((x) => x.id === sid && x.schoolId === schoolId) && db.enrollments.some((e) => e.studentId === sid && e.classId === classId) ? db.students.find((x) => x.id === sid) : undefined, "học sinh");
        const sessions = db.attendanceSessions.filter((x) => x.classId === classId && x.slot === "morning");
        const recs = db.attendanceRecords.filter((r) => r.studentId === s.id && sessions.some((x) => x.id === r.sessionId));
        const snaps = db.snapshots.filter((x) => x.classId === classId && x.status === "published" && x.rows.some((r) => r.studentId === s.id)).sort((a, b) => (db.weeks.find((w) => w.id === a.weekId)?.index ?? 0) - (db.weeks.find((w) => w.id === b.weekId)?.index ?? 0));
        const acts = db.activities.filter((a) => a.classId === classId && a.status !== "draft" && a.assignedStudentIds.includes(s.id));
        return {
          ...base, type, title: `Báo cáo cá nhân — ${s.fullName}`, subtitle: `Mã ${s.code}. Thi đua chỉ gồm bản đã công bố.`, periodLabel: `Năm học ${db.years.find((y) => y.id === yearId)?.label}`,
          kpis: [{ label: "Buổi có mặt", value: `${recs.filter((r) => r.status === "present" || r.status === "late").length}/${recs.length}` }, { label: "Đi muộn", value: String(recs.filter((r) => r.status === "late").length) }, { label: "Nghỉ không phép", value: String(recs.filter((r) => r.status === "unexcused").length) }, { label: "Tuần thi đua đã công bố", value: String(snaps.length) }],
          columns: [{ key: "section", label: "Mục" }, { key: "item", label: "Nội dung" }, { key: "value", label: "Kết quả" }],
          rows: [
            ...snaps.map((x) => { const r = x.rows.find((y) => y.studentId === s.id)!; return { section: "Thi đua", item: `Tuần ${db.weeks.find((w) => w.id === x.weekId)?.index} (v${x.versionNo})`, value: `${r.total} — ${r.grade}` }; }),
            ...acts.map((a) => ({ section: "Hoạt động", item: a.title, value: submissionStatus[db.submissions.find((x) => x.activityId === a.id && x.studentId === s.id)?.status ?? "not_received"].label })),
            ...recs.filter((r) => r.status !== "present").map((r) => ({ section: "Chuyên cần", item: fmtDate(r.date), value: attendanceStatus[r.status].label + (r.note ? ` (${r.note})` : "") })),
          ],
        };
      }
      throw new RepoError("NOT_FOUND", "Loại báo cáo không tồn tại.");
    });
  },

  /** TE06 — report entries a teacher may open (per assigned class). */
  async teacherCatalog(ctx: Ctx, schoolId: ID) {
    const uid = requireStaff(ctx);
    return read((db) => {
      const m = db.memberships.find((x) => x.userId === uid && x.schoolId === schoolId && x.status === "active");
      if (!m) throw new RepoError("FORBIDDEN");
      const live = liveAssignments(db, m.id, ctx.today);
      return [...new Set(live.map((a) => a.classId))].map((cid) => {
        const c = db.classes.find((x) => x.id === cid)!;
        const acts = new Set(live.filter((a) => a.classId === cid).flatMap((a) => a.actions));
        const isHr = live.some((a) => a.classId === cid && a.kind === "homeroom");
        return { classId: cid, yearId: c.yearId, className: c.name, role: isHr ? "Chủ nhiệm" : "Bộ môn", canExport: acts.has("report.export"),
          reports: CLASS_REPORTS.filter((r) => acts.has("report.class") && (isHr || r.type === "attendance" || r.type === "activities")) };
      });
    });
  },

  /* ------------------------------ export jobs (SC39) ------------------------------ */
  async exports(ctx: Ctx, schoolId: ID) {
    return read((db) => {
      requireAnyAction(db, ctx, ["export.run", "report.school"], { schoolId });
      return db.exports.filter((e) => e.schoolId === schoolId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((e) => ({ ...e, createdByName: staffNameById(db, e.createdBy), expired: e.expiresAt < ctx.now }));
    });
  },

  async recordExport(ctx: Ctx, schoolId: ID, input: { title: string; reportType: string; format: ExportJob["format"]; params: Record<string, string>; fileName: string; rowCount: number; classId?: ID }) {
    return write((db) => {
      if (input.classId) requireAction(db, ctx, "report.export", { schoolId, classId: input.classId });
      else requireAction(db, ctx, "export.run", { schoolId });
      if (!input.fileName.trim()) validation({ fileName: "Thiếu tên tệp" });
      const job: ExportJob = { id: newId("ex"), schoolId, title: input.title, reportType: input.reportType, format: input.format, params: { ...input.params, ...(input.classId ? { classId: input.classId } : {}) }, status: "ready", createdBy: actorId(ctx), createdAt: ctx.now, expiresAt: `${addDays(ctx.today, 7)}T23:59:00+07:00`, fileName: input.fileName, rowCount: input.rowCount };
      db.exports.push(job);
      audit(db, ctx, { level: "school", schoolId, action: `Xuất dữ liệu (${input.format.toUpperCase()}, tạo tệp cục bộ)`, entityType: "export", entityId: job.id, entityLabel: input.title });
      return job;
    });
  },

  async cancelExport(ctx: Ctx, schoolId: ID, exportId: ID) {
    return write((db) => {
      requireAction(db, ctx, "export.run", { schoolId });
      const e = findOr404(db.exports.find((x) => x.id === exportId && x.schoolId === schoolId), "bản xuất");
      if (e.status === "cancelled") throw new RepoError("VALIDATION", "Đã hủy trước đó.");
      e.status = "cancelled";
      return e;
    });
  },
};


