/**
 * Extra read models for the "students-families" screens (SC16–SC28, O09–O14).
 * Same conventions as core.ts: async `read`, permission checks, cloned results.
 * Imported directly by the students feature (not re-exported from index.ts).
 */
import type { ID, ParentModule } from "@/lib/model/types";
import { addDays } from "@/lib/demo/clock";
import { nameCompare } from "@/lib/formatters";
import { RepoError } from "./errors";
import { allowed, read, requireAction, requireAnyAction, type Ctx } from "./core";
import { accessStatus } from "./students";
import { classOfStudentOn, currentYear, latestClassOf } from "./selectors";

export type ImportKind = "students" | "teachers" | "classes" | "timetable";

export interface ImportKindInfo {
  kind: ImportKind;
  title: string;
  description: string;
  /** Only "students" runs the real local import in this demo. */
  enabled: boolean;
  columns: { key: string; label: string; required: boolean }[];
  sampleRows: Record<string, string>[];
}

export const studentsExtraRepo = {
  /** O12 defaults: modules from the school policy, expiry bounded by the end of the current year. */
  async issueContext(ctx: Ctx, schoolId: ID) {
    return read((db) => {
      requireAction(db, ctx, "school.view", { schoolId });
      const year = currentYear(db, schoolId);
      if (!year) throw new RepoError("NOT_FOUND", "Trường chưa có năm học đang hoạt động.");
      const policy = db.policies.find((p) => p.schoolId === schoolId);
      const settings = db.settings.find((s) => s.schoolId === schoolId);
      const school = db.schools.find((s) => s.id === schoolId)!;
      const suggested = addDays(ctx.today, settings?.linkDefaultDays ?? 300);
      return {
        defaultModules: (policy?.defaultParentModules ?? []) as ParentModule[],
        yearId: year.id, yearLabel: year.label, yearEnd: year.endDate, today: ctx.today, tomorrow: addDays(ctx.today, 1),
        suggestedExpiry: suggested > year.endDate ? year.endDate : suggested,
        slug: school.slug, schoolName: school.name,
      };
    });
  },

  /** O12 — guardians of one student that could receive a link (only verified ones are selectable). */
  async issueCandidates(ctx: Ctx, schoolId: ID, studentId: ID) {
    return read((db) => {
      const s = db.students.find((x) => x.id === studentId && x.schoolId === schoolId);
      if (!s) throw new RepoError("NOT_FOUND", "Không tìm thấy học sinh.");
      const cls = classOfStudentOn(db, s.id, ctx.today) ?? latestClassOf(db, s.id);
      if (!allowed(db, ctx, "parentAccess.manage.all", { schoolId })) requireAction(db, ctx, "parentAccess.issue", { schoolId, classId: cls?.id });
      return {
        student: { id: s.id, fullName: s.fullName, code: s.code, status: s.status, className: cls?.name ?? "—" },
        relationships: db.relationships.filter((r) => r.studentId === s.id).map((r) => {
          const g = db.guardians.find((x) => x.id === r.guardianId)!;
          const active = db.parentAccesses.filter((p) => p.relationshipId === r.id && accessStatus(p, ctx.now) === "active");
          return { id: r.id, relation: r.relation, verification: r.verification, guardianId: g.id, guardianName: g.fullName, phoneMasked: g.phoneMasked, activeAccessIds: active.map((p) => p.id) };
        }),
      };
    });
  },

  /** Students of the current year for pickers (transfer request, issue link from SC23). */
  async studentOptions(ctx: Ctx, schoolId: ID) {
    return read((db) => {
      requireAnyAction(db, ctx, ["student.view.all", "student.transfer", "parentAccess.manage.all"], { schoolId });
      const year = currentYear(db, schoolId);
      const ids = new Set(db.enrollments.filter((e) => e.yearId === year?.id && !e.endDate).map((e) => e.studentId));
      return db.students.filter((s) => s.schoolId === schoolId && ids.has(s.id) && s.status === "studying").map((s) => {
        const c = classOfStudentOn(db, s.id, ctx.today) ?? latestClassOf(db, s.id);
        return { id: s.id, fullName: s.fullName, code: s.code, dob: s.dob, classId: c?.id, className: c?.name ?? "—", pendingTransfer: db.transfers.some((t) => t.studentId === s.id && t.status === "pending") };
      }).sort((a, b) => nameCompare(a.fullName, b.fullName));
    });
  },

  /** Rows for exporting the selected students (page selection or all filtered results). */
  async exportStudents(ctx: Ctx, schoolId: ID, ids: ID[]) {
    return read((db) => {
      requireAction(db, ctx, "student.view.all", { schoolId });
      const set = new Set(ids);
      return db.students.filter((s) => s.schoolId === schoolId && set.has(s.id)).sort((a, b) => nameCompare(a.fullName, b.fullName)).map((s) => {
        const c = classOfStudentOn(db, s.id, ctx.today) ?? latestClassOf(db, s.id);
        const rels = db.relationships.filter((r) => r.studentId === s.id);
        return {
          code: s.code, fullName: s.fullName, dob: s.dob.split("-").reverse().join("/"), gender: s.gender, className: c?.name ?? "—",
          status: s.status === "studying" ? "Đang học" : s.status === "left" ? "Ngừng theo học" : "Đã chuyển đi",
          guardians: rels.filter((r) => r.verification !== "revoked").length, verified: rels.filter((r) => r.verification === "verified").length,
        };
      });
    });
  },

  /** SC26 — import kinds with downloadable templates. Only students run the local import in the demo. */
  async importKinds(ctx: Ctx, schoolId: ID): Promise<ImportKindInfo[]> {
    return read((db) => {
      requireAction(db, ctx, "import.run", { schoolId });
      const year = currentYear(db, schoolId);
      const classes = db.classes.filter((c) => c.schoolId === schoolId && c.yearId === year?.id && c.status !== "archived").sort((a, b) => a.name.localeCompare(b.name, "vi"));
      const grades = db.grades.filter((g) => g.schoolId === schoolId && g.status === "active");
      const rooms = db.rooms.filter((r) => r.schoolId === schoolId && r.status === "active");
      const subjects = db.subjects.filter((s) => s.schoolId === schoolId && s.status === "active" && !["CHAOCO", "SHL"].includes(s.code));
      const firstClass = classes[0];
      return [
        {
          kind: "students", title: "Học sinh", enabled: true,
          description: "Thêm hoặc cập nhật học sinh vào một lớp. Không xóa, không thay danh sách hiện có.",
          columns: [
            { key: "code", label: "Mã HS", required: false }, { key: "fullName", label: "Họ và tên", required: true }, { key: "dob", label: "Ngày sinh", required: true },
            { key: "gender", label: "Giới tính", required: true }, { key: "guardianName", label: "Người giám hộ", required: false }, { key: "guardianRelation", label: "Quan hệ", required: false },
            { key: "guardianPhone", label: "SĐT giám hộ", required: false },
          ],
          sampleRows: [],
        },
        {
          kind: "teachers", title: "Giáo viên", enabled: false,
          description: "Mời giáo viên theo email và tổ chuyên môn; phân công làm ở bước riêng.",
          columns: [{ key: "fullName", label: "Họ và tên", required: true }, { key: "email", label: "Email", required: true }, { key: "department", label: "Tổ chuyên môn", required: true }, { key: "subject", label: "Môn dạy chính", required: false }],
          sampleRows: subjects.slice(0, 2).map((s, i) => ({ fullName: i === 0 ? "Giáo viên mẫu Một" : "Giáo viên mẫu Hai", email: `giaovien.mau${i + 1}@truong.test`, department: `Tổ ${s.name}`, subject: s.name })),
        },
        {
          kind: "classes", title: "Lớp", enabled: false,
          description: "Tạo lớp theo khối, sức chứa và phòng học của năm học hiện tại.",
          columns: [{ key: "grade", label: "Khối", required: true }, { key: "name", label: "Tên lớp", required: true }, { key: "capacity", label: "Sức chứa", required: true }, { key: "room", label: "Phòng", required: false }],
          sampleRows: grades.slice(0, 2).map((g, i) => ({ grade: g.name, name: `${g.level}A${9 + i}`, capacity: "40", room: rooms[i]?.name ?? "" })),
        },
        {
          kind: "timetable", title: "Lịch học", enabled: false,
          description: "Nhập thời khóa biểu theo lớp, thứ, tiết, môn, giáo viên và phòng.",
          columns: [{ key: "className", label: "Lớp", required: true }, { key: "weekday", label: "Thứ", required: true }, { key: "period", label: "Tiết", required: true }, { key: "subject", label: "Môn", required: true }, { key: "teacher", label: "Giáo viên", required: false }, { key: "room", label: "Phòng", required: false }],
          sampleRows: subjects.slice(0, 2).map((s, i) => ({ className: firstClass?.name ?? "", weekday: "2", period: String(i + 1), subject: s.name, teacher: "", room: rooms[0]?.name ?? "" })),
        },
      ];
    });
  },

  /** SC21 summary counters for the guardians page. */
  async guardianSummary(ctx: Ctx, schoolId: ID) {
    return read((db) => {
      requireAction(db, ctx, "guardian.manage.all", { schoolId });
      const rels = db.relationships.filter((r) => r.schoolId === schoolId);
      return {
        guardians: db.guardians.filter((g) => g.schoolId === schoolId).length,
        verified: rels.filter((r) => r.verification === "verified").length,
        unverified: rels.filter((r) => r.verification === "unverified").length,
        revoked: rels.filter((r) => r.verification === "revoked").length,
        activeLinks: db.parentAccesses.filter((p) => p.schoolId === schoolId && accessStatus(p, ctx.now) === "active").length,
      };
    });
  },

};
