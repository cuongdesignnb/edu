import type { AcademicYear, ClassRoom, DemoDB, ID, School, SchoolSettings, Term, Holiday, Grade, Subject, Room } from "@/lib/model/types";
import { addDays, weekdayOf } from "@/lib/demo/clock";
import { newId } from "@/lib/demo/ids";
import { matches, nameCompare } from "@/lib/formatters";
import { isAssignmentLive } from "@/lib/permissions/can";
import { HOMEROOM_ACTIONS } from "@/lib/permissions/actions";
import { RepoError } from "./errors";
import { audit, findOr404, paginate, read, requireAction, validation, write, allowed, type Ctx, type ListQuery } from "./core";
import { currentYear, enrollmentsOn, homeroomTeacher, rosterOn, staffName, staffNameById, weekOfDate, ruleSetOn, className } from "./selectors";

export interface ClassRow {
  id: ID; name: string; yearId: ID; yearLabel: string; gradeId: ID; gradeName: string; capacity: number; size: number; status: ClassRoom["status"];
  homeroomName?: string; homeroomUserId?: ID; subjectTeacherCount: number; roomCode?: string; issues: string[]; version: number;
}

function classRow(db: DemoDB, c: ClassRoom, today: string): ClassRow {
  const year = db.years.find((y) => y.id === c.yearId)!;
  const refDate = year.status === "archived" ? year.endDate : today < year.startDate ? year.startDate : today;
  const hr = homeroomTeacher(db, c.id, refDate);
  const size = new Set(enrollmentsOn(db, c.id, c.status === "archived" ? addDays(year.endDate, -62) : refDate).map((e) => e.studentId)).size;
  const subjects = db.assignments.filter((a) => a.classId === c.id && a.kind === "subject" && isAssignmentLive(a, refDate));
  const issues: string[] = [];
  if (c.status !== "archived") {
    if (!hr) issues.push("Chưa có giáo viên chủ nhiệm");
    if (size === 0) issues.push("Chưa có học sinh");
    if (!db.lessons.some((l) => l.classId === c.id)) issues.push("Chưa có thời khóa biểu");
    const sus = subjects.filter((a) => db.memberships.find((m) => m.id === a.membershipId)?.status !== "active");
    if (sus.length) issues.push(`${sus.length} phân công của thành viên đang bị khóa`);
  }
  return {
    id: c.id, name: c.name, yearId: c.yearId, yearLabel: year.label, gradeId: c.gradeId, gradeName: db.grades.find((g) => g.id === c.gradeId)?.name ?? "—",
    capacity: c.capacity, size, status: c.status, homeroomName: hr ? staffName(hr) : undefined, homeroomUserId: hr?.id,
    subjectTeacherCount: new Set(subjects.map((a) => a.membershipId)).size, roomCode: db.rooms.find((r) => r.id === c.roomId)?.code, issues, version: c.version,
  };
}

export interface SetupStep { key: string; label: string; done: boolean; detail: string; href: string }

function setupSteps(db: DemoDB, schoolId: ID, yearId: ID, today: string): SetupStep[] {
  const base = `/school/${schoolId}`;
  const year = db.years.find((y) => y.id === yearId);
  const classes = db.classes.filter((c) => c.schoolId === schoolId && c.yearId === yearId);
  const live = classes.filter((c) => c.status !== "archived");
  const noHomeroom = live.filter((c) => !homeroomTeacher(db, c.id, today));
  const noStudents = live.filter((c) => c.status === "active" && rosterOn(db, c.id, today).length === 0);
  const noTimetable = live.filter((c) => c.status === "active" && !db.lessons.some((l) => l.classId === c.id));
  const rules = db.ruleSets.some((r) => r.schoolId === schoolId && r.status === "published");
  const familyAnn = db.announcements.some((a) => a.schoolId === schoolId && a.origin === "school" && a.status === "published" && a.audience !== "staff");
  const draftClasses = live.filter((c) => c.status === "draft");
  return [
    { key: "year", label: "Cấu hình năm học, học kỳ, tuần", done: !!year && db.terms.some((t) => t.yearId === yearId), detail: year ? `${year.label}` : "Chưa tạo", href: `${base}/academic-years` },
    { key: "classes", label: "Tạo danh sách lớp học", done: classes.length > 0, detail: `${classes.length} lớp`, href: `${base}/classes` },
    { key: "homeroom", label: "Phân công giáo viên chủ nhiệm", done: noHomeroom.length === 0 && live.length > 0, detail: noHomeroom.length ? `Còn ${noHomeroom.length} lớp: ${noHomeroom.map((c) => c.name).join(", ")}` : "Đủ", href: `${base}/assignments` },
    { key: "students", label: "Nhập danh sách học sinh", done: noStudents.length === 0 && live.some((c) => c.status === "active"), detail: noStudents.length ? `Còn ${noStudents.length} lớp` : "Đủ", href: `${base}/imports` },
    { key: "timetable", label: "Thiết lập thời khóa biểu", done: noTimetable.length === 0, detail: noTimetable.length ? `Còn ${noTimetable.length} lớp` : "Đủ các lớp đang hoạt động", href: `${base}/timetable` },
    { key: "rules", label: "Ban hành nội quy thi đua", done: rules, detail: rules ? "Đã ban hành" : "Chưa có bản ban hành", href: `${base}/conduct-rules` },
    { key: "announce", label: "Công bố thông báo đầu năm đến gia đình", done: familyAnn, detail: familyAnn ? "Đã công bố" : "Chưa công bố", href: `${base}/announcements` },
    { key: "activate", label: "Kích hoạt tất cả lớp", done: draftClasses.length === 0, detail: draftClasses.length ? `${draftClasses.length} lớp còn nháp` : "Hoàn tất", href: `${base}/classes` },
  ];
}

export const schoolRepo = {
  async context(ctx: Ctx, schoolId: ID) {
    return read((db) => {
      const s = findOr404(db.schools.find((x) => x.id === schoolId), "trường");
      if (ctx.actor.kind !== "staff") throw new RepoError("FORBIDDEN");
      const m = db.memberships.find((x) => x.userId === (ctx.actor as { userId: string }).userId && x.schoolId === schoolId);
      if (!m) throw new RepoError("FORBIDDEN");
      if (m.status !== "active") throw new RepoError("REVOKED", "Thành viên của bạn tại trường này đã bị tạm khóa hoặc thu hồi.");
      return {
        school: s,
        years: db.years.filter((y) => y.schoolId === schoolId).sort((a, b) => b.startDate.localeCompare(a.startDate)),
        currentYearId: currentYear(db, schoolId)?.id,
        roleNames: m.roleTemplateIds.map((r) => db.roleTemplates.find((t) => t.id === r)?.name ?? "").filter(Boolean),
        membershipId: m.id,
      };
    });
  },

  async overview(ctx: Ctx, schoolId: ID, yearId: ID) {
    return read((db) => {
      requireAction(db, ctx, "school.view", { schoolId });
      const year = findOr404(db.years.find((y) => y.id === yearId && y.schoolId === schoolId), "năm học");
      const prev = db.years.filter((y) => y.schoolId === schoolId && y.endDate < year.startDate).sort((a, b) => b.endDate.localeCompare(a.endDate))[0];
      const refDate = year.status === "archived" ? addDays(year.endDate, -62) : ctx.today;
      const classes = db.classes.filter((c) => c.yearId === yearId);
      const activeClasses = classes.filter((c) => c.status === "active" || c.status === "archived");
      const studentIds = new Set(activeClasses.flatMap((c) => enrollmentsOn(db, c.id, refDate).map((e) => e.studentId)));
      const prevClasses = prev ? db.classes.filter((c) => c.yearId === prev.id) : [];
      const prevStudents = prev ? new Set(prevClasses.flatMap((c) => enrollmentsOn(db, c.id, addDays(prev.endDate, -62)).map((e) => e.studentId))).size : undefined;
      const staffActive = db.memberships.filter((m) => m.schoolId === schoolId && m.status === "active").length;
      const accessActive = db.parentAccesses.filter((p) => p.schoolId === schoolId && p.yearId === yearId && !p.revokedAt && p.expiresAt >= ctx.now);
      const openedIds = new Set(db.parentAccessLogs.filter((l) => l.event === "opened" || l.event === "viewed").map((l) => l.accessId));
      const rows = classes.filter((c) => c.status !== "archived").map((c) => classRow(db, c, ctx.today));
      const needs = rows.map((r) => {
        const tasks: string[] = [...r.issues];
        if (r.status === "active") {
          const sess = db.attendanceSessions.find((s) => s.classId === r.id && s.date === ctx.today && s.slot === "morning");
          if (!sess && weekdayOf(ctx.today) !== 7) tasks.push("Chưa điểm danh hôm nay");
          const pending = db.conductRecords.filter((x) => x.classId === r.id && x.status === "pending_review").length;
          if (pending) tasks.push(`${pending} ghi nhận chờ rà soát`);
          const adj = db.adjustments.filter((a) => a.classId === r.id && a.status === "pending").length;
          if (adj) tasks.push(`${adj} điều chỉnh chờ duyệt`);
        }
        return { ...r, tasks, severity: r.status === "draft" || r.issues.length ? "blocked" : tasks.length ? "attention" : "ok" };
      });
      const todayItems: { key: string; label: string; detail: string; href: string; tone: "danger" | "warning" | "info" }[] = [];
      const pendingTransfers = db.transfers.filter((t) => t.schoolId === schoolId && t.status === "pending");
      if (pendingTransfers.length) todayItems.push({ key: "tr", label: `${pendingTransfers.length} yêu cầu chuyển lớp chờ duyệt`, detail: pendingTransfers.map((t) => `${className(db, t.fromClassId)} → ${className(db, t.toClassId)}`).join(", "), href: `/school/${schoolId}/transfers`, tone: "warning" });
      const invites = db.invitations.filter((i) => i.schoolId === schoolId && i.status === "pending" && i.expiresAt >= ctx.now);
      if (invites.length) todayItems.push({ key: "inv", label: `${invites.length} lời mời giáo viên chưa phản hồi`, detail: invites.map((i) => i.fullName).join(", "), href: `/school/${schoolId}/teachers`, tone: "info" });
      const adjs = db.adjustments.filter((a) => a.schoolId === schoolId && a.status === "pending");
      if (adjs.length) todayItems.push({ key: "adj", label: `${adjs.length} đề nghị điều chỉnh sau chốt`, detail: adjs.map((a) => className(db, a.classId)).join(", "), href: `/school/${schoolId}/publications`, tone: "warning" });
      const grants = db.supportGrants.filter((g) => g.schoolId === schoolId && g.status === "requested");
      if (grants.length) todayItems.push({ key: "sg", label: `${grants.length} đề nghị quyền hỗ trợ`, detail: "Cần nhà trường cho phép hoặc từ chối", href: `/school/${schoolId}/support`, tone: "info" });
      const noHr = rows.filter((r) => !r.homeroomName);
      if (noHr.length) todayItems.push({ key: "hr", label: `${noHr.length} lớp chưa có giáo viên chủ nhiệm`, detail: noHr.map((r) => r.name).join(", "), href: `/school/${schoolId}/assignments`, tone: "danger" });
      return {
        year, prevYear: prev,
        kpi: {
          activeClasses: classes.filter((c) => c.status === "active").length,
          draftClasses: classes.filter((c) => c.status === "draft").length,
          prevClasses: prev ? prevClasses.length : undefined,
          staffActive,
          students: studentIds.size, prevStudents,
          linksActive: accessActive.length, linksOpened: accessActive.filter((a) => openedIds.has(a.id)).length,
        },
        setup: setupSteps(db, schoolId, yearId, ctx.today),
        classesNeedingAction: needs.filter((n) => n.severity !== "ok").sort((a, b) => (a.severity === "blocked" ? -1 : 1) - (b.severity === "blocked" ? -1 : 1)),
        todayItems,
        announcements: db.announcements.filter((a) => a.schoolId === schoolId && a.origin === "school" && a.status !== "draft").sort((a, b) => (b.publishedAt ?? b.scheduledAt ?? "").localeCompare(a.publishedAt ?? a.scheduledAt ?? "")).slice(0, 4),
      };
    });
  },

  /* ------------------------------ profile & settings ------------------------------ */
  async profile(ctx: Ctx, schoolId: ID) {
    return read((db) => {
      requireAction(db, ctx, "school.view", { schoolId });
      return { school: findOr404(db.schools.find((s) => s.id === schoolId)), canEdit: allowed(db, ctx, "school.profile.edit", { schoolId }) };
    });
  },

  async saveProfile(ctx: Ctx, schoolId: ID, patch: Pick<School, "shortName" | "motto" | "publicIntro" | "publicPhone" | "publicEmail" | "address" | "website" | "accentColor"> & { version: number }) {
    return write((db) => {
      requireAction(db, ctx, "school.profile.edit", { schoolId });
      const s = findOr404(db.schools.find((x) => x.id === schoolId));
      if (s.version !== patch.version) throw new RepoError("CONFLICT");
      const errors: Record<string, string> = {};
      if (!/^#[0-9a-fA-F]{6}$/.test(patch.accentColor)) errors.accentColor = "Màu nhấn dạng #RRGGBB";
      if (!/^\S+@\S+\.\S+$/.test(patch.publicEmail)) errors.publicEmail = "Email liên hệ chưa hợp lệ";
      if (/[<>]/.test(patch.publicIntro + patch.motto)) errors.publicIntro = "Không chèn mã HTML/JS vào nội dung giới thiệu";
      if (patch.publicIntro.length > 600) errors.publicIntro = "Tối đa 600 ký tự";
      if (Object.keys(errors).length) validation(errors);
      const before = { shortName: s.shortName, motto: s.motto, accentColor: s.accentColor };
      Object.assign(s, { ...patch, version: s.version + 1 });
      audit(db, ctx, { level: "school", schoolId, action: "Cập nhật thông tin trường", entityType: "school", entityId: s.id, entityLabel: s.name, before, after: { shortName: s.shortName, motto: s.motto, accentColor: s.accentColor } });
      return s;
    });
  },

  async settings(ctx: Ctx, schoolId: ID) {
    return read((db) => {
      requireAction(db, ctx, "school.view", { schoolId });
      return { settings: findOr404(db.settings.find((s) => s.schoolId === schoolId)), canEdit: allowed(db, ctx, "school.settings.edit", { schoolId }) };
    });
  },

  async saveSettings(ctx: Ctx, schoolId: ID, patch: Omit<SchoolSettings, "schoolId" | "language" | "timezone">) {
    return write((db) => {
      requireAction(db, ctx, "school.settings.edit", { schoolId });
      const s = findOr404(db.settings.find((x) => x.schoolId === schoolId));
      if (s.version !== patch.version) throw new RepoError("CONFLICT");
      if (patch.linkDefaultDays < 7 || patch.linkDefaultDays > 366) validation({ linkDefaultDays: "Từ 7 đến 366 ngày" });
      const before = { ...s };
      Object.assign(s, { ...patch, version: s.version + 1 });
      audit(db, ctx, { level: "school", schoolId, action: "Cập nhật cài đặt hiển thị và chia sẻ", entityType: "settings", entityId: schoolId, entityLabel: "Cài đặt", before: before as unknown as Record<string, unknown>, after: s as unknown as Record<string, unknown> });
      return s;
    });
  },

  /* ------------------------------ years, terms, weeks ------------------------------ */
  async years(ctx: Ctx, schoolId: ID) {
    return read((db) => {
      requireAction(db, ctx, "school.view", { schoolId });
      return db.years.filter((y) => y.schoolId === schoolId).sort((a, b) => b.startDate.localeCompare(a.startDate)).map((y) => ({
        ...y, classCount: db.classes.filter((c) => c.yearId === y.id).length,
        studentCount: new Set(db.enrollments.filter((e) => e.yearId === y.id).map((e) => e.studentId)).size,
        terms: db.terms.filter((t) => t.yearId === y.id),
      }));
    });
  },

  async yearDetail(ctx: Ctx, schoolId: ID, yearId: ID) {
    return read((db) => {
      requireAction(db, ctx, "school.view", { schoolId });
      const year = findOr404(db.years.find((y) => y.id === yearId && y.schoolId === schoolId), "năm học");
      const terms = db.terms.filter((t) => t.yearId === yearId).sort((a, b) => a.startDate.localeCompare(b.startDate));
      const weeks = db.weeks.filter((w) => w.yearId === yearId).sort((a, b) => a.index - b.index);
      const locked = new Set(db.conductPeriods.filter((p) => p.status !== "open").map((p) => p.weekId));
      const grades = db.grades.filter((g) => g.schoolId === schoolId);
      const rows = db.classes.filter((c) => c.yearId === yearId).map((c) => classRow(db, c, ctx.today)).sort((a, b) => a.name.localeCompare(b.name, "vi"));
      return {
        year, terms, holidays: db.holidays.filter((h) => h.yearId === yearId).sort((a, b) => a.startDate.localeCompare(b.startDate)),
        weeks: weeks.map((w) => ({ ...w, locked: locked.has(w.id), isCurrent: w.startDate <= ctx.today && w.endDate >= ctx.today })),
        grades, classesByGrade: grades.map((g) => ({ grade: g, classes: rows.filter((r) => r.gradeId === g.id) })).filter((x) => x.classes.length || x.grade.status === "active"),
        assignedHomeroom: rows.filter((r) => r.homeroomName).length, totalClasses: rows.length,
        canManage: allowed(db, ctx, "year.manage", { schoolId }), canManageClasses: allowed(db, ctx, "class.manage", { schoolId }),
      };
    });
  },

  async createYear(ctx: Ctx, schoolId: ID, input: { label: string; startDate: string; endDate: string; terms: { name: string; startDate: string; endDate: string; openingDate?: string }[]; holidays: { name: string; startDate: string; endDate: string }[]; copyRules: boolean }) {
    return write((db) => {
      requireAction(db, ctx, "year.manage", { schoolId });
      const errors: Record<string, string> = {};
      if (!/^\d{4}–\d{4}$/.test(input.label)) errors.label = "Định dạng năm học: 2027–2028";
      if (db.years.some((y) => y.schoolId === schoolId && y.label === input.label)) errors.label = "Năm học này đã tồn tại";
      if (input.startDate >= input.endDate) errors.endDate = "Ngày kết thúc phải sau ngày bắt đầu";
      if (db.years.some((y) => y.schoolId === schoolId && y.startDate <= input.endDate && y.endDate >= input.startDate)) errors.startDate = "Trùng khoảng thời gian với năm học đã có";
      const sorted = [...input.terms].sort((a, b) => a.startDate.localeCompare(b.startDate));
      sorted.forEach((t, i) => {
        if (t.startDate >= t.endDate) errors[`terms.${i}`] = `${t.name}: ngày kết thúc phải sau ngày bắt đầu`;
        if (t.startDate < input.startDate || t.endDate > input.endDate) errors[`terms.${i}`] = `${t.name} nằm ngoài năm học`;
        if (i > 0 && t.startDate <= sorted[i - 1].endDate) errors[`terms.${i}`] = `${t.name} chồng lên ${sorted[i - 1].name}`;
      });
      if (!input.terms.length) errors.terms = "Cần ít nhất một học kỳ";
      if (Object.keys(errors).length) validation(errors);
      const yid = newId("y");
      db.years.push({ id: yid, schoolId, label: input.label, startDate: input.startDate, endDate: input.endDate, status: "draft", version: 1 });
      let wi = 0;
      for (const t of sorted) {
        const tid = newId("t");
        let monday = addDays(t.startDate, (8 - weekdayOf(t.startDate)) % 7);
        let count = 0;
        while (monday <= t.endDate) {
          wi += 1; count += 1;
          db.weeks.push({ id: `${yid}-w${wi}`, schoolId, yearId: yid, termId: tid, index: wi, startDate: monday, endDate: addDays(monday, 6), closeDeadline: addDays(monday, 7) });
          monday = addDays(monday, 7);
        }
        db.terms.push({ id: tid, yearId: yid, schoolId, name: t.name, startDate: t.startDate, endDate: t.endDate, openingDate: t.openingDate, weekCount: count });
      }
      for (const h of input.holidays) db.holidays.push({ id: newId("h"), schoolId, yearId: yid, ...h });
      if (input.copyRules) {
        const rs = ruleSetOn(db, schoolId, ctx.today);
        if (rs) db.ruleSets.push({ ...structuredClone(rs), id: newId("rs"), status: "draft", versionNo: Math.max(...db.ruleSets.filter((r) => r.schoolId === schoolId).map((r) => r.versionNo)) + 1, effectiveFrom: sorted[0]?.startDate ?? input.startDate, effectiveTo: undefined, publishedAt: undefined, name: `${rs.name} — bản sao cho ${input.label}` });
      }
      audit(db, ctx, { level: "school", schoolId, action: "Tạo năm học (nháp)", entityType: "year", entityId: yid, entityLabel: input.label });
      return { id: yid };
    });
  },

  async updateTerm(ctx: Ctx, schoolId: ID, termId: ID, patch: Pick<Term, "name" | "startDate" | "endDate" | "openingDate">) {
    return write((db) => {
      requireAction(db, ctx, "year.manage", { schoolId });
      const t = findOr404(db.terms.find((x) => x.id === termId && x.schoolId === schoolId), "học kỳ");
      const year = db.years.find((y) => y.id === t.yearId)!;
      if (year.status === "archived") throw new RepoError("LOCKED", "Năm học đã lưu trữ — chỉ xem.");
      if (patch.startDate >= patch.endDate) validation({ endDate: "Ngày kết thúc phải sau ngày bắt đầu" });
      if (patch.startDate < year.startDate || patch.endDate > year.endDate) validation({ startDate: "Học kỳ phải nằm trong năm học" });
      const other = db.terms.find((x) => x.yearId === t.yearId && x.id !== t.id && x.startDate <= patch.endDate && x.endDate >= patch.startDate);
      if (other) validation({ startDate: `Chồng thời gian với ${other.name}` });
      const lockedWeeks = db.weeks.filter((w) => w.termId === t.id && db.conductPeriods.some((p) => p.weekId === w.id && p.status !== "open"));
      const cut = lockedWeeks.find((w) => w.startDate < patch.startDate || w.endDate > patch.endDate);
      if (cut) throw new RepoError("LOCKED", `Tuần ${cut.index} đã chốt dữ liệu, không thể đưa ra ngoài học kỳ. Hãy giữ mốc bao gồm các tuần đã chốt.`);
      const before = { startDate: t.startDate, endDate: t.endDate };
      Object.assign(t, patch);
      audit(db, ctx, { level: "school", schoolId, action: "Sửa mốc học kỳ", entityType: "term", entityId: t.id, entityLabel: t.name, before, after: { startDate: t.startDate, endDate: t.endDate } });
      return t;
    });
  },

  async updateWeekDeadline(ctx: Ctx, schoolId: ID, weekId: ID, closeDeadline: string) {
    return write((db) => {
      requireAction(db, ctx, "year.manage", { schoolId });
      const w = findOr404(db.weeks.find((x) => x.id === weekId && x.schoolId === schoolId), "tuần");
      if (closeDeadline < w.endDate) validation({ closeDeadline: "Hạn chốt không sớm hơn ngày cuối tuần" });
      if (db.conductPeriods.some((p) => p.weekId === w.id && p.status !== "open")) throw new RepoError("LOCKED", "Tuần đã có lớp chốt — không đổi hạn áp ngược.");
      w.closeDeadline = closeDeadline;
      return w;
    });
  },

  async addHoliday(ctx: Ctx, schoolId: ID, yearId: ID, h: Omit<Holiday, "id" | "schoolId" | "yearId">) {
    return write((db) => {
      requireAction(db, ctx, "year.manage", { schoolId });
      const y = findOr404(db.years.find((x) => x.id === yearId && x.schoolId === schoolId), "năm học");
      if (!h.name.trim()) validation({ name: "Nhập tên ngày nghỉ" });
      if (h.startDate > h.endDate) validation({ endDate: "Ngày kết thúc phải sau ngày bắt đầu" });
      if (h.startDate < y.startDate || h.endDate > y.endDate) validation({ startDate: "Ngày nghỉ nằm ngoài năm học" });
      const x = { id: newId("h"), schoolId, yearId, ...h };
      db.holidays.push(x);
      audit(db, ctx, { level: "school", schoolId, action: "Thêm lịch nghỉ", entityType: "holiday", entityId: x.id, entityLabel: h.name });
      return x;
    });
  },

  async removeHoliday(ctx: Ctx, schoolId: ID, holidayId: ID) {
    return write((db) => {
      requireAction(db, ctx, "year.manage", { schoolId });
      const h = findOr404(db.holidays.find((x) => x.id === holidayId && x.schoolId === schoolId), "ngày nghỉ");
      db.holidays = db.holidays.filter((x) => x.id !== h.id);
      audit(db, ctx, { level: "school", schoolId, action: "Xóa lịch nghỉ", entityType: "holiday", entityId: h.id, entityLabel: h.name });
      return true;
    });
  },

  async setYearStatus(ctx: Ctx, schoolId: ID, yearId: ID, status: AcademicYear["status"]) {
    return write((db) => {
      requireAction(db, ctx, "year.manage", { schoolId });
      const y = findOr404(db.years.find((x) => x.id === yearId && x.schoolId === schoolId), "năm học");
      if (status === "active" && db.years.some((x) => x.schoolId === schoolId && x.status === "active" && x.id !== y.id)) {
        throw new RepoError("VALIDATION", "Đang có năm học hoạt động. Hãy kết thúc/lưu trữ năm hiện tại qua quy trình chuẩn bị năm mới.");
      }
      const before = y.status;
      y.status = status;
      if (status === "archived") db.classes.filter((c) => c.yearId === y.id).forEach((c) => (c.status = "archived"));
      audit(db, ctx, { level: "school", schoolId, action: "Đổi trạng thái năm học", entityType: "year", entityId: y.id, entityLabel: y.label, before: { status: before }, after: { status } });
      return y;
    });
  },

  /** Rollover preview: current classes with their roster and suggested next grade. */
  async rolloverPreview(ctx: Ctx, schoolId: ID, fromYearId: ID) {
    return read((db) => {
      requireAction(db, ctx, "year.manage", { schoolId });
      const from = findOr404(db.years.find((y) => y.id === fromYearId && y.schoolId === schoolId), "năm học");
      const targets = db.years.filter((y) => y.schoolId === schoolId && y.startDate > from.startDate);
      const classes = db.classes.filter((c) => c.yearId === from.id && c.status !== "draft");
      const refDate = from.status === "archived" ? addDays(from.endDate, -62) : ctx.today;
      return {
        from, targets: targets.map((t) => ({ year: t, classes: db.classes.filter((c) => c.yearId === t.id).map((c) => ({ id: c.id, name: c.name, gradeId: c.gradeId, size: rosterOn(db, c.id, t.startDate).length })) })),
        classes: classes.map((c) => ({
          id: c.id, name: c.name, gradeLevel: db.grades.find((g) => g.id === c.gradeId)?.level ?? 0,
          students: rosterOn(db, c.id, refDate).map((s) => ({ id: s.id, code: s.code, fullName: s.fullName, status: s.status })),
        })),
        grades: db.grades.filter((g) => g.schoolId === schoolId),
      };
    });
  },

  /** Apply decisions: enrol into target-year classes. The source year is never modified. */
  async rolloverApply(ctx: Ctx, schoolId: ID, fromYearId: ID, toYearId: ID, decisions: { studentId: ID; action: "promote" | "retain" | "leave"; targetClassId?: ID }[]) {
    return write((db) => {
      requireAction(db, ctx, "year.manage", { schoolId });
      const to = findOr404(db.years.find((y) => y.id === toYearId && y.schoolId === schoolId), "năm học đích");
      const missing = decisions.filter((d) => d.action !== "leave" && !d.targetClassId);
      if (missing.length) throw new RepoError("VALIDATION", `${missing.length} học sinh chưa chọn lớp đích.`);
      let enrolled = 0, left = 0;
      for (const d of decisions) {
        if (d.action === "leave") { left++; continue; }
        const target = db.classes.find((c) => c.id === d.targetClassId && c.yearId === to.id);
        if (!target) throw new RepoError("VALIDATION", "Lớp đích không thuộc năm học mới.");
        if (db.enrollments.some((e) => e.studentId === d.studentId && e.yearId === to.id)) continue; // idempotent
        db.enrollments.push({ id: newId("en"), schoolId, studentId: d.studentId, classId: target.id, yearId: to.id, startDate: to.startDate, status: "active" });
        enrolled++;
      }
      audit(db, ctx, { level: "school", schoolId, action: "Chuẩn bị năm mới: xếp lớp", entityType: "year", entityId: to.id, entityLabel: to.label, after: { enrolled, left, from: fromYearId } });
      return { enrolled, left };
    });
  },

  /* ------------------------------ dictionaries ------------------------------ */
  async dictionaries(ctx: Ctx, schoolId: ID) {
    return read((db) => {
      requireAction(db, ctx, "school.view", { schoolId });
      const used = (field: "gradeId" | "subjectId" | "roomId", id: ID) =>
        (field === "gradeId" ? db.classes.some((c) => c.gradeId === id) : field === "subjectId" ? db.lessons.some((l) => l.subjectId === id) || db.assignments.some((a) => a.subjectId === id) : db.lessons.some((l) => l.roomId === id) || db.classes.some((c) => c.roomId === id));
      return {
        grades: db.grades.filter((g) => g.schoolId === schoolId).map((g) => ({ ...g, inUse: used("gradeId", g.id) })),
        subjects: db.subjects.filter((g) => g.schoolId === schoolId).map((g) => ({ ...g, inUse: used("subjectId", g.id) })),
        rooms: db.rooms.filter((g) => g.schoolId === schoolId).map((g) => ({ ...g, inUse: used("roomId", g.id) })),
        canManage: allowed(db, ctx, "dictionary.manage", { schoolId }),
      };
    });
  },

  async saveDictionaryItem(ctx: Ctx, schoolId: ID, kind: "grade" | "subject" | "room", item: Partial<Grade & Subject & Room> & { name: string }) {
    return write((db) => {
      requireAction(db, ctx, "dictionary.manage", { schoolId });
      const list = (kind === "grade" ? db.grades : kind === "subject" ? db.subjects : db.rooms) as (Grade | Subject | Room)[];
      const errors: Record<string, string> = {};
      if (item.name.trim().length < 2) errors.name = "Tên tối thiểu 2 ký tự";
      if (kind !== "grade") {
        const code = (item.code ?? "").trim();
        if (!code) errors.code = "Nhập mã";
        if (list.some((x) => "code" in x && x.code.toLowerCase() === code.toLowerCase() && x.id !== item.id && x.schoolId === schoolId)) errors.code = "Mã đã tồn tại";
      } else if (!item.level || item.level < 1 || item.level > 12) errors.level = "Khối từ 1 đến 12";
      if (Object.keys(errors).length) validation(errors);
      if (item.id) {
        const x = findOr404(list.find((d) => d.id === item.id && d.schoolId === schoolId));
        Object.assign(x, item);
        audit(db, ctx, { level: "school", schoolId, action: "Sửa danh mục", entityType: kind, entityId: x.id, entityLabel: item.name });
        return x;
      }
      const id = newId(kind);
      const created = kind === "grade" ? { id, schoolId, level: item.level!, name: item.name, status: "active" as const }
        : kind === "subject" ? { id, schoolId, code: item.code!, name: item.name, color: item.color ?? "#0a72e6", status: "active" as const }
        : { id, schoolId, code: item.code!, name: item.name, capacity: item.capacity ?? 40, status: "active" as const };
      (list as unknown[]).push(created);
      audit(db, ctx, { level: "school", schoolId, action: "Thêm danh mục", entityType: kind, entityId: id, entityLabel: item.name });
      return created;
    });
  },

  /** Items with history are deactivated, never deleted. */
  async setDictionaryStatus(ctx: Ctx, schoolId: ID, kind: "grade" | "subject" | "room", id: ID, status: "active" | "inactive") {
    return write((db) => {
      requireAction(db, ctx, "dictionary.manage", { schoolId });
      const list = (kind === "grade" ? db.grades : kind === "subject" ? db.subjects : db.rooms) as (Grade | Subject | Room)[];
      const x = findOr404(list.find((d) => d.id === id && d.schoolId === schoolId));
      x.status = status;
      audit(db, ctx, { level: "school", schoolId, action: status === "inactive" ? "Ngừng dùng danh mục" : "Dùng lại danh mục", entityType: kind, entityId: id, entityLabel: x.name });
      return x;
    });
  },

  /* ------------------------------ classes ------------------------------ */
  async classes(ctx: Ctx, schoolId: ID, q: ListQuery) {
    return read((db) => {
      requireAction(db, ctx, "school.view", { schoolId });
      const f = q.filters ?? {};
      const rows = db.classes
        .filter((c) => c.schoolId === schoolId && (!f.yearId || c.yearId === f.yearId) && (!f.gradeId || c.gradeId === f.gradeId) && (!f.status || c.status === f.status))
        .map((c) => classRow(db, c, ctx.today))
        .filter((r) => matches(q.q ?? "", r.name, r.homeroomName) && (!f.homeroom || (f.homeroom === "none" ? !r.homeroomName : r.homeroomUserId === f.homeroom)))
        .sort((a, b) => a.name.localeCompare(b.name, "vi"));
      return paginate(rows, q, { name: (a, b) => a.name.localeCompare(b.name, "vi"), size: (a, b) => a.size - b.size, homeroom: (a, b) => (a.homeroomName ?? "").localeCompare(b.homeroomName ?? "", "vi") });
    });
  },

  async classOptions(ctx: Ctx, schoolId: ID, yearId?: ID) {
    return read((db) => {
      requireAction(db, ctx, "school.view", { schoolId });
      const y = yearId ?? currentYear(db, schoolId)?.id;
      return db.classes.filter((c) => c.schoolId === schoolId && c.yearId === y).sort((a, b) => a.name.localeCompare(b.name, "vi")).map((c) => ({ id: c.id, name: c.name, status: c.status, gradeId: c.gradeId }));
    });
  },

  async formOptions(ctx: Ctx, schoolId: ID) {
    return read((db) => {
      requireAction(db, ctx, "school.view", { schoolId });
      return {
        years: db.years.filter((y) => y.schoolId === schoolId && y.status !== "archived"),
        grades: db.grades.filter((g) => g.schoolId === schoolId && g.status === "active"),
        subjects: db.subjects.filter((g) => g.schoolId === schoolId && g.status === "active" && !["CHAOCO", "SHL"].includes(g.code)),
        rooms: db.rooms.filter((g) => g.schoolId === schoolId && g.status === "active"),
        teachers: db.memberships.filter((m) => m.schoolId === schoolId && m.status === "active").map((m) => ({ membershipId: m.id, userId: m.userId, name: staffNameById(db, m.userId), department: m.department, homeroomOf: db.assignments.filter((x) => x.membershipId === m.id && x.kind === "homeroom" && isAssignmentLive(x, ctx.today)).map((x) => className(db, x.classId)) })).sort((a, b) => nameCompare(a.name, b.name)),
      };
    });
  },

  /** O03 — create/edit class. Without a homeroom teacher the class stays draft. */
  async saveClass(ctx: Ctx, schoolId: ID, input: { id?: ID; yearId: ID; gradeId: ID; name: string; capacity: number; roomId?: ID; homeroomMembershipId?: ID; motto?: string; version?: number }) {
    return write((db) => {
      requireAction(db, ctx, "class.manage", { schoolId });
      const errors: Record<string, string> = {};
      const name = input.name.trim().toUpperCase();
      if (!/^\d{1,2}[A-Z]{1,2}\d{0,2}$/.test(name)) errors.name = "Tên lớp dạng 10A1, 11B2";
      const year = db.years.find((y) => y.id === input.yearId && y.schoolId === schoolId);
      if (!year) errors.yearId = "Chọn năm học";
      else if (year.status === "archived") errors.yearId = "Năm học đã lưu trữ";
      const grade = db.grades.find((g) => g.id === input.gradeId && g.schoolId === schoolId);
      if (!grade) errors.gradeId = "Chọn khối";
      else if (!name.startsWith(String(grade.level))) errors.name = `Tên lớp phải bắt đầu bằng ${grade.level}`;
      if (db.classes.some((c) => c.schoolId === schoolId && c.yearId === input.yearId && c.name === name && c.id !== input.id)) errors.name = "Tên lớp đã tồn tại trong năm học";
      if (!Number.isFinite(input.capacity) || input.capacity < 10 || input.capacity > 60) errors.capacity = "Sức chứa từ 10 đến 60";
      if (input.id) {
        const size = rosterOn(db, input.id, ctx.today).length;
        if (input.capacity < size) errors.capacity = `Lớp đang có ${size} học sinh`;
      }
      if (input.homeroomMembershipId) {
        const busy = db.assignments.find((a) => a.membershipId === input.homeroomMembershipId && a.kind === "homeroom" && isAssignmentLive(a, ctx.today) && a.classId !== input.id && db.classes.find((c) => c.id === a.classId)?.yearId === input.yearId);
        if (busy) errors.homeroomMembershipId = `Giáo viên đang chủ nhiệm ${className(db, busy.classId)}`;
      }
      if (Object.keys(errors).length) validation(errors);
      let c: ClassRoom;
      if (input.id) {
        c = findOr404(db.classes.find((x) => x.id === input.id && x.schoolId === schoolId), "lớp");
        if (input.version !== undefined && c.version !== input.version) throw new RepoError("CONFLICT");
        Object.assign(c, { gradeId: input.gradeId, name, capacity: input.capacity, roomId: input.roomId, motto: input.motto, version: c.version + 1 });
      } else {
        c = { id: newId("c"), schoolId, yearId: input.yearId, gradeId: input.gradeId, name, capacity: input.capacity, roomId: input.roomId, motto: input.motto, status: "draft", createdAt: ctx.now, version: 1 };
        db.classes.push(c);
      }
      if (input.homeroomMembershipId && !homeroomTeacher(db, c.id, ctx.today)) {
        db.assignments.push({ id: newId("as"), schoolId, membershipId: input.homeroomMembershipId, kind: "homeroom", classId: c.id, actions: [...HOMEROOM_ACTIONS], validFrom: ctx.today, status: "active", createdBy: (ctx.actor as { userId: string }).userId, createdAt: ctx.now, version: 1 });
      }
      audit(db, ctx, { level: "school", schoolId, action: input.id ? "Sửa lớp" : "Tạo lớp (nháp)", entityType: "class", entityId: c.id, entityLabel: `${c.name} (${year?.label})` });
      return classRow(db, c, ctx.today);
    });
  },

  async setClassStatus(ctx: Ctx, schoolId: ID, classId: ID, status: ClassRoom["status"]) {
    return write((db) => {
      requireAction(db, ctx, "class.manage", { schoolId });
      const c = findOr404(db.classes.find((x) => x.id === classId && x.schoolId === schoolId), "lớp");
      if (status === "active" && !homeroomTeacher(db, c.id, ctx.today)) throw new RepoError("VALIDATION", "Lớp chưa có giáo viên chủ nhiệm — giữ ở trạng thái nháp.");
      const before = c.status;
      c.status = status;
      c.version += 1;
      audit(db, ctx, { level: "school", schoolId, action: status === "active" ? "Kích hoạt lớp" : status === "archived" ? "Lưu trữ lớp" : "Chuyển lớp về nháp", entityType: "class", entityId: c.id, entityLabel: c.name, before: { status: before }, after: { status } });
      return c;
    });
  },

  async weekOf(ctx: Ctx, schoolId: ID, date: string) {
    return read((db) => {
      const y = currentYear(db, schoolId);
      return y ? weekOfDate(db, y.id, date) ?? null : null;
    });
  },
};

