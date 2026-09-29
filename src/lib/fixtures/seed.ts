/**
 * Deterministic demo seed. Everything here is SYNTHETIC. The same call always
 * yields the same data (seeded PRNG, fixed DemoClock dates), so screenshots and
 * tests are repeatable. Numbers shown in the UI are always derived from this data.
 */
import type {
  AcademicYear, Activity, ActivitySubmission, Announcement, Assignment, AttendanceSession, AttendanceStatus, AuditEvent,
  ClassGroup, ClassRoom, ConductRecord, DemoDB, FileAsset, Guardian, GuardianRelationship, Membership, ParentAccess,
  ParentAccessLog, ParentModule, PublishedSnapshot, Room, RuleSet, School, SeatingPlan, StaffNotification, StaffUser,
  Student, StudentPosition, ActionKey, OnboardingState,
} from "@/lib/model/types";
import { buildRoleTemplates, HOMEROOM_ACTIONS, SUBJECT_ACTIONS } from "@/lib/permissions/actions";
import { mulberry32, pick } from "@/lib/demo/prng";
import { addDays, localDateTime, weekdayOf } from "@/lib/demo/clock";
import { computeRows } from "@/lib/domain/conduct";
import { FAMILY, MID_M, GIVEN_M, MID_F, GIVEN_F, PARENT_MID_M, PARENT_MID_F, DEVICES } from "./names";

export const SEED_TIME = "2026-10-05T08:00:00+07:00";
export const SCHOOL_A = "demo-school-a";
export const SCHOOL_B = "demo-school-b";
export const YEAR_A = "y-a-2026";
export const YEAR_A_OLD = "y-a-2025";
export const YEAR_B = "y-b-2026";
export const MINH_ANH = "demo-student-a-001";
export const CLASS_A_10A1 = "c-a-10a1";
export const CLASS_A_10A2 = "c-a-10a2";
export const CLASS_A_11A1 = "c-a-11a1";
export const CLASS_B_10A1 = "c-b-10a1";

const TONES = ["blue", "green", "amber", "pink", "purple"] as const;
const FULL_ONBOARDING: OnboardingState = {
  profileDone: true, adminAssigned: true, yearCreated: true, classesCreated: true, teachersInvited: true,
  studentsImported: true, homeroomAssigned: true, rulesPublished: true,
};

function schoolBase(p: Partial<School> & Pick<School, "id" | "slug" | "code" | "name" | "shortName" | "level" | "province" | "status">): School {
  return {
    address: `Số ${p.code.length * 7 + 12} đường Minh Họa, ${p.province}`,
    publicPhone: "024 3xxx xx68",
    publicEmail: `lienhe@${p.slug}.edu.test`,
    website: `https://${p.slug}.edu.test`,
    accentColor: "#0a72e6",
    motto: "Tri thức – Nhân cách – Tương lai",
    publicIntro: `${p.name} là trường giả định dùng cho bản demo EduManage.`,
    createdAt: "2026-06-01T09:00:00+07:00",
    onboarding: FULL_ONBOARDING,
    version: 1,
    ...p,
  };
}

export function buildSeed(): DemoDB {
  const rnd = mulberry32(20262027);
  const db: DemoDB = {
    meta: { schema: "edumanage-ui-demo-v1", seededAt: SEED_TIME, revision: 1 },
    platformSettings: {
      brandName: "EduManage", supportEmail: "hotro@edumanage.test", supportPhone: "1900 xx xx 68 (mẫu)",
      dateFormat: "dd/MM/yyyy", timezone: "Asia/Ho_Chi_Minh",
      footerNote: "Nền tảng quản lý trường học — bản demo dữ liệu giả định", version: 1,
    },
    schools: [], users: [], memberships: [], invitations: [], roleTemplates: [], assignments: [], years: [], terms: [],
    weeks: [], holidays: [], grades: [], subjects: [], rooms: [], classes: [], students: [], enrollments: [], transfers: [],
    guardians: [], relationships: [], parentAccesses: [], parentAccessLogs: [], groups: [], groupMemberships: [], positions: [],
    seatingPlans: [], lessons: [], lessonChanges: [], duties: [], attendanceSessions: [], attendanceRecords: [], ruleSets: [],
    conductRecords: [], conductPeriods: [], snapshots: [], adjustments: [], activities: [], submissions: [], evidence: [],
    files: [], announcements: [], notifications: [], tickets: [], supportGrants: [], audit: [], imports: [], exports: [],
    policies: [], settings: [],
  };

  /* ------------------------------------------------------------------ schools */
  db.schools.push(
    schoolBase({
      id: SCHOOL_A, slug: "binh-minh", code: "THPT-BM", name: "Trường THPT Bình Minh", shortName: "THPT Bình Minh",
      level: "THPT", province: "TP. Hà Nội", status: "active", activatedAt: "2026-06-05T10:00:00+07:00",
      address: "Số 123 đường Minh Họa, quận Mẫu, TP. Hà Nội", publicPhone: "024 3xxx xx78",
      motto: "Tri thức – Nhân cách – Tương lai",
      publicIntro: "Trường THPT Bình Minh (tên giả định) đồng hành cùng học sinh trên hành trình học tập, rèn luyện và phát triển toàn diện.",
    }),
    schoolBase({
      id: SCHOOL_B, slug: "an-hoa", code: "THPT-AH", name: "Trường THPT An Hòa", shortName: "THPT An Hòa",
      level: "THPT", province: "Đồng Nai", status: "active", activatedAt: "2026-07-01T10:00:00+07:00", accentColor: "#0e9f6e",
      motto: "Chăm ngoan – Sáng tạo – Nhân ái",
      publicIntro: "Trường THPT An Hòa (tên giả định) — trường thứ hai của bản demo, dùng để kiểm tra dữ liệu không lẫn giữa các trường.",
    }),
    schoolBase({ id: "sch-lqd", slug: "le-quy-don", code: "THCS-LQD", name: "Trường THCS Lê Quý Đôn", shortName: "THCS Lê Quý Đôn", level: "THCS", province: "TP. Đà Nẵng", status: "active", activatedAt: "2026-06-10T09:00:00+07:00" }),
    schoolBase({ id: "sch-hoasen", slug: "hoa-sen", code: "TH-HS", name: "Trường Tiểu học Hoa Sen", shortName: "TH Hoa Sen", level: "Tiểu học", province: "TP. Hồ Chí Minh", status: "active", activatedAt: "2026-06-12T09:00:00+07:00" }),
    schoolBase({ id: "sch-nguyenhue", slug: "nguyen-hue", code: "THPT-NH", name: "Trường THPT Nguyễn Huệ", shortName: "THPT Nguyễn Huệ", level: "THPT", province: "TP. Huế", status: "active", activatedAt: "2026-06-20T09:00:00+07:00" }),
    schoolBase({ id: "sch-tranphu", slug: "tran-phu", code: "THCS-TP", name: "Trường THCS Trần Phú", shortName: "THCS Trần Phú", level: "THCS", province: "TP. Hải Phòng", status: "suspended", statusReason: "Nhà trường đề nghị tạm dừng để rà soát quy trình nội bộ (vận hành, không liên quan thanh toán).", activatedAt: "2026-06-15T09:00:00+07:00" }),
    schoolBase({ id: "sch-kimdong", slug: "kim-dong", code: "TH-KD", name: "Trường Tiểu học Kim Đồng", shortName: "TH Kim Đồng", level: "Tiểu học", province: "TP. Cần Thơ", status: "archived", statusReason: "Kết thúc thí điểm, dữ liệu lưu trữ theo quy trình bàn giao.", activatedAt: "2025-08-15T09:00:00+07:00" }),
    schoolBase({
      id: "sch-chuvanan", slug: "chu-van-an", code: "THCS-CVA", name: "Trường THCS Chu Văn An", shortName: "THCS Chu Văn An", level: "THCS", province: "TP. Hồ Chí Minh", status: "draft",
      onboarding: { profileDone: true, adminAssigned: false, yearCreated: false, classesCreated: false, teachersInvited: false, studentsImported: false, homeroomAssigned: false, rulesPublished: false },
    }),
  );
  // School A onboarding: timetable still being set, one class without homeroom
  db.schools[0].onboarding = { ...FULL_ONBOARDING, homeroomAssigned: false };

  /* ------------------------------------------------------------------ users & memberships */
  const user = (id: string, fullName: string, honorific: "Thầy" | "Cô" | undefined, email: string, extra: Partial<StaffUser> = {}): StaffUser => {
    const u: StaffUser = { id, fullName, honorific, email, workPhone: `09${(db.users.length * 37 + 11) % 90 + 10} *** ${(db.users.length * 53 + 100) % 900 + 100}`, avatarTone: TONES[db.users.length % 5], version: 1, ...extra };
    db.users.push(u);
    return u;
  };
  user("u-bao", "Trần Quốc Bảo", "Thầy", "bao.tq@edumanage.test", { isPlatformOperator: true, bio: "Vận hành nền tảng EduManage (demo)." });
  user("u-linh-op", "Phạm Thùy Linh", "Cô", "linh.pt@edumanage.test", { isPlatformOperator: true, bio: "Hỗ trợ nhà trường (demo)." });

  const roleA = buildRoleTemplates(SCHOOL_A, "2026-08-01T09:00:00+07:00");
  const roleB = buildRoleTemplates(SCHOOL_B, "2026-08-01T09:00:00+07:00");
  db.roleTemplates.push(...roleA, ...roleB);
  for (const s of db.schools.slice(2)) db.roleTemplates.push(...buildRoleTemplates(s.id, "2026-08-01T09:00:00+07:00"));

  const member = (schoolId: string, userId: string, department: string, roles: string[], status: Membership["status"] = "active", extra: Partial<Membership> = {}): Membership => {
    const m: Membership = {
      id: `m-${schoolId === SCHOOL_A ? "a" : schoolId === SCHOOL_B ? "b" : schoolId}-${userId.replace(/^u-/, "")}`,
      schoolId, userId, department, roleTemplateIds: roles, status, joinedAt: "2026-08-10",
      staffCode: `GV${String(db.memberships.filter((x) => x.schoolId === schoolId).length + 1).padStart(4, "0")}`, version: 1, ...extra,
    };
    db.memberships.push(m);
    return m;
  };
  const staffA: [string, string, "Thầy" | "Cô", string, string, string[]][] = [
    ["u-hanh", "Nguyễn Thị Hạnh", "Cô", "hanh.nt@binhminh.edu.test", "Văn phòng", [`${SCHOOL_A}-role-admin`]],
    ["u-dung", "Phạm Quốc Dũng", "Thầy", "dung.pq@binhminh.edu.test", "Ban giám hiệu", [`${SCHOOL_A}-role-principal`]],
    ["u-quan", "Trần Minh Quân", "Thầy", "quan.tm@binhminh.edu.test", "Giáo vụ", [`${SCHOOL_A}-role-academic`]],
    ["u-lan", "Trần Thị Lan", "Cô", "lan.tt@binhminh.edu.test", "Tổ Ngữ văn", []],
    ["u-hung", "Nguyễn Văn Hùng", "Thầy", "hung.nv@binhminh.edu.test", "Tổ Toán", []],
    ["u-mai", "Lê Thị Mai", "Cô", "mai.lt@binhminh.edu.test", "Tổ Tiếng Anh", []],
    ["u-nam", "Hoàng Văn Nam", "Thầy", "nam.hv@giaovien.test", "Tổ Lý – Hóa", []],
    ["u-minh", "Trần Văn Minh", "Thầy", "minh.tv@binhminh.edu.test", "Tổ Lý – Hóa", []],
    ["u-thu", "Ngô Thị Thu", "Cô", "thu.nt@binhminh.edu.test", "Tổ Sinh – Công nghệ", []],
    ["u-kimanh", "Vũ Thị Kim Anh", "Cô", "anh.vtk@binhminh.edu.test", "Tổ Sử – Địa – GDKT&PL", []],
    ["u-thuha", "Nguyễn Thu Hà", "Cô", "ha.nt@binhminh.edu.test", "Tổ Tiếng Anh", []],
    ["u-huong", "Đặng Thị Hương", "Cô", "huong.dt@binhminh.edu.test", "Tổ Sinh – Công nghệ", []],
    ["u-tai", "Lê Đức Tài", "Thầy", "tai.ld@binhminh.edu.test", "Tổ Tin học", []],
    ["u-khoa", "Nguyễn Văn Khoa", "Thầy", "khoa.nv@binhminh.edu.test", "Tổ Sử – Địa – GDKT&PL", []],
    ["u-tuan", "Bùi Anh Tuấn", "Thầy", "tuan.ba@binhminh.edu.test", "Tổ GDTC – QPAN", []],
    ["u-vinh", "Phan Quang Vinh", "Thầy", "vinh.pq@binhminh.edu.test", "Tổ Sử – Địa – GDKT&PL", []],
    ["u-tam", "Lý Minh Tâm", "Thầy", "tam.lm@binhminh.edu.test", "Tổ Tin học", []],
    ["u-hang", "Đỗ Thị Hằng", "Cô", "hang.dt@binhminh.edu.test", "Tổ Sinh – Công nghệ", []],
    ["u-diep", "Hồ Ngọc Diệp", "Cô", "diep.hn@binhminh.edu.test", "Tổ Ngữ văn", []],
    ["u-phuc", "Trịnh Văn Phúc", "Thầy", "phuc.tv@binhminh.edu.test", "Tổ Toán", []],
    ["u-anhthu", "Mai Anh Thư", "Cô", "thu.ma@binhminh.edu.test", "Tổ Sử – Địa – GDKT&PL", []],
    ["u-hoa2", "Dương Thanh Hòa", "Cô", "hoa.dt@binhminh.edu.test", "Tổ Toán", []],
  ];
  for (const [id, name, h, email, dept, roles] of staffA) {
    user(id, name, h, email);
    member(SCHOOL_A, id, dept, roles,
      id === "u-huong" ? "suspended" : id === "u-tai" ? "revoked" : "active",
      id === "u-huong" ? { statusReason: "Nghỉ phép dài hạn — tạm khóa thành viên trường." } : id === "u-tai" ? { statusReason: "Chuyển công tác từ 15/09/2026." } : {});
  }
  // School B
  const staffB: [string, string, "Thầy" | "Cô", string, string, string[]][] = [
    ["u-khang", "Đỗ Minh Khang", "Thầy", "khang.dm@anhoa.edu.test", "Văn phòng", [`${SCHOOL_B}-role-admin`]],
    ["u-hoa", "Lý Thị Hoa", "Cô", "hoa.lt@anhoa.edu.test", "Tổ Ngữ văn", []],
    ["u-son", "Phan Văn Sơn", "Thầy", "son.pv@anhoa.edu.test", "Tổ Toán", []],
    ["u-yen", "Trần Hải Yến", "Cô", "yen.th@anhoa.edu.test", "Tổ Tiếng Anh", []],
    ["u-loc", "Võ Văn Lộc", "Thầy", "loc.vv@anhoa.edu.test", "Ban giám hiệu", [`${SCHOOL_B}-role-principal`]],
  ];
  for (const [id, name, h, email, dept, roles] of staffB) {
    user(id, name, h, email);
    member(SCHOOL_B, id, dept, roles);
  }
  // Same identity, independent membership at B (Hoàng Văn Nam)
  member(SCHOOL_B, "u-nam", "Tổ Vật lý", [], "active", { joinedAt: "2026-08-20" });

  // Operational-only schools: admins + staff counts derived from memberships
  const otherStaff: Record<string, number> = { "sch-lqd": 24, "sch-hoasen": 28, "sch-nguyenhue": 36, "sch-tranphu": 20, "sch-kimdong": 16 };
  const otherAdmins: Record<string, [string, string, "Thầy" | "Cô"]> = {
    "sch-lqd": ["u-lqd-admin", "Trần Văn Minh Khôi", "Thầy"],
    "sch-hoasen": ["u-hs-admin", "Lê Thị Thu Hằng", "Cô"],
    "sch-nguyenhue": ["u-nh-admin", "Phạm Quốc Việt", "Thầy"],
    "sch-tranphu": ["u-tp-admin", "Hoàng Mai Anh", "Cô"],
    "sch-kimdong": ["u-kd-admin", "Ngô Thị Lan Phương", "Cô"],
  };
  for (const [sid, count] of Object.entries(otherStaff)) {
    const [aid, aname, ah] = otherAdmins[sid];
    const slug = db.schools.find((s) => s.id === sid)!.slug;
    user(aid, aname, ah, `admin@${slug}.edu.test`);
    member(sid, aid, "Văn phòng", [`${sid}-role-admin`], sid === "sch-kimdong" ? "suspended" : "active");
    for (let i = 1; i < count; i++) {
      const female = rnd() < 0.6;
      const nm = `${pick(rnd, FAMILY)} ${female ? pick(rnd, MID_F) : pick(rnd, MID_M)} ${female ? pick(rnd, GIVEN_F) : pick(rnd, GIVEN_M)}`;
      const uid = `u-${sid}-${i}`;
      user(uid, nm, female ? "Cô" : "Thầy", `gv${i}@${slug}.edu.test`);
      member(sid, uid, "Tổ chuyên môn", [], sid === "sch-kimdong" ? "suspended" : "active");
    }
  }

  /* ------------------------------------------------------------------ invitations */
  db.invitations.push(
    { id: "inv-a-ngoc", schoolId: SCHOOL_A, email: "ngoc.pt@giaovien.test", fullName: "Phạm Thị Ngọc", invitedByUserId: "u-hanh", roleTemplateIds: [], proposedDuty: "Giáo viên Tiếng Anh — dự kiến 11A1", createdAt: "2026-10-03T09:10:00+07:00", expiresAt: "2026-10-10T23:59:00+07:00", status: "pending" },
    { id: "inv-a-quocanh", schoolId: SCHOOL_A, email: "anh.bq@giaovien.test", fullName: "Bùi Quốc Anh", invitedByUserId: "u-hanh", roleTemplateIds: [], proposedDuty: "Giáo viên GDTC — dự kiến khối 10", createdAt: "2026-10-02T15:00:00+07:00", expiresAt: "2026-10-09T23:59:00+07:00", status: "pending" },
    { id: "inv-a-loan", schoolId: SCHOOL_A, email: "loan.dt@giaovien.test", fullName: "Đinh Thị Loan", invitedByUserId: "u-hanh", roleTemplateIds: [], proposedDuty: "Giáo viên Hóa học", createdAt: "2026-09-05T09:00:00+07:00", expiresAt: "2026-09-12T23:59:00+07:00", status: "expired" },
    { id: "inv-a-duc", schoolId: SCHOOL_A, email: "duc.tm@giaovien.test", fullName: "Tạ Minh Đức", invitedByUserId: "u-quan", roleTemplateIds: [], proposedDuty: "Giáo viên Tin học", createdAt: "2026-09-10T09:00:00+07:00", expiresAt: "2026-09-17T23:59:00+07:00", status: "revoked" },
    { id: "inv-b-lan", schoolId: SCHOOL_B, email: "lan.tt@binhminh.edu.test", fullName: "Trần Thị Lan", invitedByUserId: "u-khang", roleTemplateIds: [], proposedDuty: "Thỉnh giảng Ngữ văn — dự kiến 10A2", createdAt: "2026-10-04T08:30:00+07:00", expiresAt: "2026-10-11T23:59:00+07:00", status: "pending", existingUserId: "u-lan" },
    { id: "inv-cva-admin", schoolId: "sch-chuvanan", email: "admin@chu-van-an.edu.test", fullName: "Nguyễn Hải Đăng", invitedByUserId: "u-bao", roleTemplateIds: ["sch-chuvanan-role-admin"], proposedDuty: "Quản trị trường đầu tiên", createdAt: "2026-10-01T10:00:00+07:00", expiresAt: "2026-10-15T23:59:00+07:00", status: "pending" },
  );

  /* ------------------------------------------------------------------ years, terms, weeks */
  const addYear = (id: string, schoolId: string, label: string, start: string, end: string, status: AcademicYear["status"]) => {
    db.years.push({ id, schoolId, label, startDate: start, endDate: end, status, version: 1 });
  };
  addYear(YEAR_A_OLD, SCHOOL_A, "2025–2026", "2025-08-01", "2026-07-31", "archived");
  addYear(YEAR_A, SCHOOL_A, "2026–2027", "2026-08-01", "2027-07-31", "active");
  addYear(YEAR_B, SCHOOL_B, "2026–2027", "2026-08-01", "2027-07-31", "active");
  for (const s of db.schools.slice(2)) {
    if (s.status !== "draft") addYear(`y-${s.id}-2026`, s.id, "2026–2027", "2026-08-01", "2027-07-31", s.status === "archived" ? "archived" : "active");
  }
  for (const [sid, yid] of [[SCHOOL_A, YEAR_A], [SCHOOL_B, YEAR_B]] as const) {
    const t1 = `${yid}-hk1`, t2 = `${yid}-hk2`;
    db.terms.push(
      { id: t1, yearId: yid, schoolId: sid, name: "Học kỳ 1", startDate: "2026-09-07", endDate: "2027-01-10", openingDate: "2026-09-05", weekCount: 18 },
      { id: t2, yearId: yid, schoolId: sid, name: "Học kỳ 2", startDate: "2027-01-11", endDate: "2027-05-30", weekCount: 17 },
    );
    for (let i = 0; i < 35; i++) {
      const start = addDays("2026-09-07", i * 7);
      db.weeks.push({ id: `${yid}-w${i + 1}`, schoolId: sid, yearId: yid, termId: i < 18 ? t1 : t2, index: i + 1, startDate: start, endDate: addDays(start, 6), closeDeadline: addDays(start, 7) });
    }
    db.holidays.push(
      { id: `${yid}-h-duonglich`, schoolId: sid, yearId: yid, name: "Tết Dương lịch", startDate: "2027-01-01", endDate: "2027-01-01" },
      { id: `${yid}-h-tet`, schoolId: sid, yearId: yid, name: "Nghỉ Tết Nguyên đán", startDate: "2027-02-03", endDate: "2027-02-14" },
      { id: `${yid}-h-giotohv`, schoolId: sid, yearId: yid, name: "Giỗ Tổ Hùng Vương", startDate: "2027-04-16", endDate: "2027-04-16" },
      { id: `${yid}-h-3004`, schoolId: sid, yearId: yid, name: "Nghỉ lễ 30/4 – 1/5", startDate: "2027-04-30", endDate: "2027-05-03" },
    );
  }
  // archived year A: one term summary + weeks not needed for daily views
  db.terms.push({ id: `${YEAR_A_OLD}-hk1`, yearId: YEAR_A_OLD, schoolId: SCHOOL_A, name: "Học kỳ 1", startDate: "2025-09-08", endDate: "2026-01-11", weekCount: 18 },
    { id: `${YEAR_A_OLD}-hk2`, yearId: YEAR_A_OLD, schoolId: SCHOOL_A, name: "Học kỳ 2", startDate: "2026-01-12", endDate: "2026-05-31", weekCount: 17 });

  /* ------------------------------------------------------------------ dictionaries */
  const SUBJECTS: [string, string, string][] = [
    ["TOAN", "Toán", "#0a72e6"], ["VAN", "Ngữ văn", "#e5484d"], ["ANH", "Tiếng Anh", "#7c5ce0"], ["LY", "Vật lý", "#0e9f6e"],
    ["HOA", "Hóa học", "#f59e0b"], ["SINH", "Sinh học", "#16a34a"], ["SU", "Lịch sử", "#b45309"], ["DIA", "Địa lý", "#0891b2"],
    ["KTPL", "GD Kinh tế và Pháp luật", "#be185d"], ["TIN", "Tin học", "#4f46e5"], ["CN", "Công nghệ", "#65a30d"],
    ["GDTC", "Giáo dục thể chất", "#ea580c"], ["CHAOCO", "Chào cờ", "#64748b"], ["SHL", "Sinh hoạt lớp", "#64748b"],
  ];
  for (const sid of [SCHOOL_A, SCHOOL_B, "sch-tranphu"]) {
    const p = sid === SCHOOL_A ? "a" : sid === SCHOOL_B ? "b" : "tp";
    for (const lv of sid === "sch-tranphu" ? [8] : [10, 11, 12]) db.grades.push({ id: `g-${p}-${lv}`, schoolId: sid, level: lv, name: `Khối ${lv}`, status: "active" });
    for (const [code, name, color] of SUBJECTS) db.subjects.push({ id: `sub-${p}-${code.toLowerCase()}`, schoolId: sid, code, name, color, status: "active" });
  }
  db.subjects.push({ id: "sub-a-nghe", schoolId: SCHOOL_A, code: "NGHE", name: "Hướng nghiệp (cũ)", color: "#64748b", status: "inactive" });
  const roomsA: Room[] = ["A1.01", "A1.02", "A1.03", "A1.04", "A2.01", "A2.02", "A2.03", "B1.01", "PTN-Lý", "PTN-Hóa", "Phòng Tin 1"].map((c, i) => ({ id: `r-a-${i + 1}`, schoolId: SCHOOL_A, code: c, name: c.startsWith("PTN") ? `Phòng thí nghiệm ${c.slice(4)}` : c.startsWith("Phòng") ? c : `Phòng ${c}`, capacity: c.startsWith("P") ? 40 : 48, status: "active" }));
  db.rooms.push(...roomsA, { id: "r-b-1", schoolId: SCHOOL_B, code: "P101", name: "Phòng 101", capacity: 45, status: "active" }, { id: "r-b-2", schoolId: SCHOOL_B, code: "P102", name: "Phòng 102", capacity: 45, status: "active" });

  /* ------------------------------------------------------------------ classes */
  const cls = (c: Omit<ClassRoom, "createdAt" | "version"> & Partial<ClassRoom>) => db.classes.push({ createdAt: "2026-08-12T09:00:00+07:00", version: 1, ...c });
  cls({ id: CLASS_A_10A1, schoolId: SCHOOL_A, yearId: YEAR_A, gradeId: "g-a-10", name: "10A1", capacity: 45, roomId: "r-a-3", motto: "Đoàn kết – Tự tin – Vươn xa", status: "active" });
  cls({ id: CLASS_A_10A2, schoolId: SCHOOL_A, yearId: YEAR_A, gradeId: "g-a-10", name: "10A2", capacity: 45, roomId: "r-a-5", motto: "Chăm ngoan – Sáng tạo", status: "active" });
  cls({ id: CLASS_A_11A1, schoolId: SCHOOL_A, yearId: YEAR_A, gradeId: "g-a-11", name: "11A1", capacity: 42, roomId: "r-a-6", motto: "Kỷ luật – Bản lĩnh", status: "active" });
  cls({ id: "c-a-10a3", schoolId: SCHOOL_A, yearId: YEAR_A, gradeId: "g-a-10", name: "10A3", capacity: 45, roomId: "r-a-4", status: "draft" });
  cls({ id: "c-a-12a1", schoolId: SCHOOL_A, yearId: YEAR_A, gradeId: "g-a-12", name: "12A1", capacity: 40, status: "draft" });
  cls({ id: "c-a-2025-10a1", schoolId: SCHOOL_A, yearId: YEAR_A_OLD, gradeId: "g-a-10", name: "10A1", capacity: 45, status: "archived", createdAt: "2025-08-10T09:00:00+07:00" });
  cls({ id: "c-a-2025-10a2", schoolId: SCHOOL_A, yearId: YEAR_A_OLD, gradeId: "g-a-10", name: "10A2", capacity: 45, status: "archived", createdAt: "2025-08-10T09:00:00+07:00" });
  cls({ id: CLASS_B_10A1, schoolId: SCHOOL_B, yearId: YEAR_B, gradeId: "g-b-10", name: "10A1", capacity: 40, roomId: "r-b-1", motto: "Học tốt – Sống đẹp", status: "active" });
  cls({ id: "c-b-10a2", schoolId: SCHOOL_B, yearId: YEAR_B, gradeId: "g-b-10", name: "10A2", capacity: 40, roomId: "r-b-2", status: "draft" });
  const shellClasses: Record<string, [number, number]> = { "sch-lqd": [6, 12], "sch-hoasen": [1, 15], "sch-nguyenhue": [10, 18], "sch-tranphu": [6, 10], "sch-kimdong": [1, 8] };
  for (const [sid, [firstGrade, n]] of Object.entries(shellClasses)) {
    for (let i = 0; i < n; i++) {
      const grade = firstGrade + Math.floor(i / 4);
      const name = `${grade}A${(i % 4) + 1}`;
      if (sid === "sch-tranphu" && name === "8A1") continue;
      db.classes.push({ id: `c-${sid}-${i}`, schoolId: sid, yearId: `y-${sid}-2026`, gradeId: `g-${sid}-${grade}`, name, capacity: 40, status: sid === "sch-kimdong" ? "archived" : "active", createdAt: "2026-08-12T09:00:00+07:00", version: 1 });
    }
  }
  db.classes.push({ id: "c-tp-8a1", schoolId: "sch-tranphu", yearId: "y-sch-tranphu-2026", gradeId: "g-tp-8", name: "8A1", capacity: 40, status: "active", createdAt: "2026-08-12T09:00:00+07:00", version: 1 });

  /* ------------------------------------------------------------------ assignments */
  const sub = (p: "a" | "b", code: string) => `sub-${p}-${code}`;
  const assign = (schoolId: string, userId: string, kind: "homeroom" | "subject", classId: string, subjectId?: string, extra: Partial<Assignment> = {}) => {
    const mId = db.memberships.find((m) => m.schoolId === schoolId && m.userId === userId)!.id;
    const actions: ActionKey[] = kind === "homeroom" ? [...HOMEROOM_ACTIONS] : [...SUBJECT_ACTIONS];
    db.assignments.push({
      id: `as-${db.assignments.length + 1}`, schoolId, membershipId: mId, kind, classId, subjectId, actions,
      validFrom: "2026-08-15", status: "active", createdBy: schoolId === SCHOOL_A ? "u-hanh" : "u-khang",
      createdAt: "2026-08-15T09:00:00+07:00", version: 1, ...extra,
    });
  };
  // Cô Lan: homeroom 10A1 + Ngữ văn 10A1 + Ngữ văn 10A2 (subject only)
  assign(SCHOOL_A, "u-lan", "homeroom", CLASS_A_10A1);
  assign(SCHOOL_A, "u-lan", "subject", CLASS_A_10A1, sub("a", "van"));
  assign(SCHOOL_A, "u-lan", "subject", CLASS_A_10A2, sub("a", "van"));
  assign(SCHOOL_A, "u-hung", "subject", CLASS_A_10A1, sub("a", "toan"));
  assign(SCHOOL_A, "u-hung", "subject", CLASS_A_10A2, sub("a", "toan"));
  assign(SCHOOL_A, "u-mai", "subject", CLASS_A_10A1, sub("a", "anh"));
  assign(SCHOOL_A, "u-mai", "subject", CLASS_A_10A2, sub("a", "anh"));
  for (const c of [CLASS_A_10A1, CLASS_A_10A2, CLASS_A_11A1]) assign(SCHOOL_A, "u-nam", "subject", c, sub("a", "ly"));
  assign(SCHOOL_A, "u-minh", "homeroom", CLASS_A_10A2);
  for (const c of [CLASS_A_10A1, CLASS_A_10A2, CLASS_A_11A1]) assign(SCHOOL_A, "u-minh", "subject", c, sub("a", "hoa"));
  assign(SCHOOL_A, "u-thu", "homeroom", CLASS_A_11A1);
  assign(SCHOOL_A, "u-thu", "subject", CLASS_A_11A1, sub("a", "sinh"));
  for (const c of [CLASS_A_10A1, CLASS_A_10A2]) assign(SCHOOL_A, "u-huong", "subject", c, sub("a", "sinh"));
  for (const c of [CLASS_A_10A1, CLASS_A_10A2, CLASS_A_11A1]) assign(SCHOOL_A, "u-kimanh", "subject", c, sub("a", "su"));
  for (const c of [CLASS_A_10A1, CLASS_A_10A2]) assign(SCHOOL_A, "u-khoa", "subject", c, sub("a", "dia"));
  assign(SCHOOL_A, "u-anhthu", "subject", CLASS_A_11A1, sub("a", "dia"));
  for (const c of [CLASS_A_10A1, CLASS_A_10A2, CLASS_A_11A1]) assign(SCHOOL_A, "u-tuan", "subject", c, sub("a", "gdtc"));
  for (const c of [CLASS_A_10A1, CLASS_A_10A2, CLASS_A_11A1]) assign(SCHOOL_A, "u-vinh", "subject", c, sub("a", "ktpl"));
  for (const c of [CLASS_A_10A1, CLASS_A_10A2, CLASS_A_11A1]) assign(SCHOOL_A, "u-tai", "subject", c, sub("a", "tin"), { status: "revoked", validTo: "2026-09-14", revokedAt: "2026-09-15T08:00:00+07:00", reason: "Chuyển công tác" });
  for (const c of [CLASS_A_10A1, CLASS_A_10A2, CLASS_A_11A1]) assign(SCHOOL_A, "u-tam", "subject", c, sub("a", "tin"), { validFrom: "2026-09-15" });
  for (const c of [CLASS_A_10A1, CLASS_A_10A2, CLASS_A_11A1]) assign(SCHOOL_A, "u-hang", "subject", c, sub("a", "cn"));
  assign(SCHOOL_A, "u-diep", "subject", CLASS_A_11A1, sub("a", "van"));
  assign(SCHOOL_A, "u-phuc", "subject", CLASS_A_11A1, sub("a", "toan"));
  assign(SCHOOL_A, "u-thuha", "subject", CLASS_A_11A1, sub("a", "anh"));
  // School B
  assign(SCHOOL_B, "u-hoa", "homeroom", CLASS_B_10A1);
  assign(SCHOOL_B, "u-hoa", "subject", CLASS_B_10A1, sub("b", "van"));
  assign(SCHOOL_B, "u-son", "subject", CLASS_B_10A1, sub("b", "toan"));
  assign(SCHOOL_B, "u-yen", "subject", CLASS_B_10A1, sub("b", "anh"));
  assign(SCHOOL_B, "u-nam", "subject", CLASS_B_10A1, sub("b", "ly"));

  /* ------------------------------------------------------------------ students */
  const usedNames = new Set<string>();
  const genName = (female: boolean) => {
    for (;;) {
      const n = `${pick(rnd, FAMILY)} ${female ? pick(rnd, MID_F) : pick(rnd, MID_M)} ${female ? pick(rnd, GIVEN_F) : pick(rnd, GIVEN_M)}`;
      if (!usedNames.has(n)) { usedNames.add(n); return n; }
    }
  };
  let codeA = 0, codeB = 0;
  const addStudent = (schoolId: string, fullName: string, gender: "Nam" | "Nữ", extra: Partial<Student> = {}, id?: string): Student => {
    const code = schoolId === SCHOOL_B ? `AH26${String(++codeB).padStart(3, "0")}` : schoolId === SCHOOL_A ? `HS26${String(++codeA).padStart(3, "0")}` : `TP26${String(db.students.length).padStart(3, "0")}`;
    const year = gender === "Nam" ? 2011 : 2011;
    const s: Student = {
      id: id ?? (schoolId === SCHOOL_A ? `st-a-${String(codeA).padStart(4, "0")}` : schoolId === SCHOOL_B ? `st-b-${String(codeB).padStart(4, "0")}` : `st-x-${db.students.length}`),
      schoolId, code, fullName, dob: `${year}-${String((db.students.length % 12) + 1).padStart(2, "0")}-${String((db.students.length * 7) % 27 + 1).padStart(2, "0")}`,
      gender, status: "studying", avatarTone: TONES[db.students.length % 5], version: 1, updatedAt: "2026-08-20T09:00:00+07:00", ...extra,
    };
    usedNames.add(fullName);
    db.students.push(s);
    return s;
  };
  const enroll = (studentId: string, classId: string, yearId: string, schoolId: string, start: string, end?: string, endReason?: string) => {
    db.enrollments.push({ id: `en-${db.enrollments.length + 1}`, schoolId, studentId, classId, yearId, startDate: start, endDate: end, status: end ? "ended" : "active", endReason });
  };

  // 10A1 — named students first (ids stable)
  const minhAnh = addStudent(SCHOOL_A, "Nguyễn Minh Anh", "Nữ", {}, MINH_ANH);
  const named10A1: [string, "Nam" | "Nữ"][] = [
    ["Trần Bảo Châu", "Nữ"], ["Lê Quang Dũng", "Nam"], ["Phạm Thị Hà", "Nữ"], ["Hoàng Gia Huy", "Nam"], ["Đặng Thu Trang", "Nữ"],
    ["Ngô Khánh Linh", "Nữ"], ["Bùi Đức Minh", "Nam"], ["Trịnh Ngọc Anh", "Nữ"],
  ];
  const a10a1: Student[] = [minhAnh, ...named10A1.map(([n, g]) => addStudent(SCHOOL_A, n, g))];
  while (a10a1.length < 41) { const f = rnd() < 0.5; a10a1.push(addStudent(SCHOOL_A, genName(f), f ? "Nữ" : "Nam")); }
  for (const s of a10a1) enroll(s.id, CLASS_A_10A1, YEAR_A, SCHOOL_A, "2026-09-05");
  // left student (history kept)
  const tu = addStudent(SCHOOL_A, "Hồ Văn Tú", "Nam", { status: "left", statusDate: "2026-09-28", internalNote: "Gia đình chuyển nơi ở, đã hoàn tất thủ tục." });
  enroll(tu.id, CLASS_A_10A1, YEAR_A, SCHOOL_A, "2026-09-05", "2026-09-27", "Ngừng theo học");
  // 10A2
  const a10a2: Student[] = [];
  const tuanAnh = addStudent(SCHOOL_A, "Vũ Tuấn Anh", "Nam");
  enroll(tuanAnh.id, CLASS_A_10A2, YEAR_A, SCHOOL_A, "2026-09-05", "2026-09-20", "Chuyển sang 10A1");
  enroll(tuanAnh.id, CLASS_A_10A1, YEAR_A, SCHOOL_A, "2026-09-21");
  a10a1.push(tuanAnh); // 42 active in 10A1
  const dupChau = addStudent(SCHOOL_A, "Trần Bảo Châu", "Nữ"); // same name, different id (11A1)
  while (a10a2.length < 40) { const f = rnd() < 0.5; a10a2.push(addStudent(SCHOOL_A, genName(f), f ? "Nữ" : "Nam")); }
  for (const s of a10a2) enroll(s.id, CLASS_A_10A2, YEAR_A, SCHOOL_A, "2026-09-05");
  // 11A1
  const thuHa = addStudent(SCHOOL_A, "Lê Thu Hà", "Nữ");
  const a11a1: Student[] = [thuHa, dupChau];
  while (a11a1.length < 36) { const f = rnd() < 0.5; a11a1.push(addStudent(SCHOOL_A, genName(f), f ? "Nữ" : "Nam")); }
  a11a1.forEach((s, i) => {
    enroll(s.id, i % 2 ? "c-a-2025-10a2" : "c-a-2025-10a1", YEAR_A_OLD, SCHOOL_A, "2025-09-05", "2026-05-31", "Hoàn thành năm học");
    enroll(s.id, CLASS_A_11A1, YEAR_A, SCHOOL_A, "2026-09-05");
  });
  // School B 10A1 — note "Nguyễn Minh Anh"-like names are NOT reused; different school, independent data
  const b10a1: Student[] = [];
  while (b10a1.length < 35) { const f = rnd() < 0.5; b10a1.push(addStudent(SCHOOL_B, genName(f), f ? "Nữ" : "Nam")); }
  for (const s of b10a1) enroll(s.id, CLASS_B_10A1, YEAR_B, SCHOOL_B, "2026-09-05");
  // Suspended school: one student for link test
  const khoi = addStudent("sch-tranphu", "Phạm Minh Khôi", "Nam", {}, "st-tp-001");
  enroll(khoi.id, "c-tp-8a1", "y-sch-tranphu-2026", "sch-tranphu", "2026-09-05");

  db.transfers.push(
    { id: "tr-1", schoolId: SCHOOL_A, studentId: tuanAnh.id, fromClassId: CLASS_A_10A2, toClassId: CLASS_A_10A1, kind: "transfer", effectiveDate: "2026-09-21", reason: "Cân đối sĩ số, theo nguyện vọng gia đình", status: "approved", requestedBy: "u-minh", requestedAt: "2026-09-16T10:00:00+07:00", decidedBy: "u-hanh", decidedAt: "2026-09-18T09:00:00+07:00" },
    { id: "tr-2", schoolId: SCHOOL_A, studentId: tu.id, fromClassId: CLASS_A_10A1, kind: "leave", effectiveDate: "2026-09-28", reason: "Gia đình chuyển nơi ở", status: "approved", requestedBy: "u-lan", requestedAt: "2026-09-24T10:00:00+07:00", decidedBy: "u-hanh", decidedAt: "2026-09-25T09:00:00+07:00" },
    { id: "tr-3", schoolId: SCHOOL_A, studentId: a10a2[5].id, fromClassId: CLASS_A_10A2, toClassId: CLASS_A_11A1, kind: "transfer", effectiveDate: "2026-10-12", reason: "Đề nghị xếp lại lớp theo tổ hợp môn (mẫu)", status: "pending", requestedBy: "u-minh", requestedAt: "2026-10-02T14:00:00+07:00" },
  );

  /* ------------------------------------------------------------------ guardians & links */
  const addGuardian = (schoolId: string, fullName: string, idx: number): Guardian => {
    const g: Guardian = { id: `gd-${db.guardians.length + 1}`, schoolId, fullName, phoneMasked: `09${(idx * 13) % 90 + 10} *** ${(idx * 71) % 900 + 100}`, email: `ph${db.guardians.length + 1}@phuhuynh.test`, version: 1 };
    db.guardians.push(g);
    return g;
  };
  const relate = (g: Guardian, s: Student, relation: GuardianRelationship["relation"], primary: boolean, verification: GuardianRelationship["verification"] = "verified", verifiedBy = "u-lan") => {
    const r: GuardianRelationship = {
      id: `rel-${db.relationships.length + 1}`, schoolId: s.schoolId, guardianId: g.id, studentId: s.id, relation, isPrimaryContact: primary,
      verification, verifiedBy: verification === "verified" ? verifiedBy : undefined,
      verifiedAt: verification === "verified" ? "2026-09-10T16:00:00+07:00" : undefined,
      verificationNote: verification === "verified" ? "Đối chiếu hồ sơ nhập học và gặp trực tiếp tại buổi họp phụ huynh." : undefined,
    };
    db.relationships.push(r);
    return r;
  };
  const gDungFather = addGuardian(SCHOOL_A, "Nguyễn Văn Dũng", 1);
  const gHuongMother = addGuardian(SCHOOL_A, "Trần Thu Hương", 2);
  const relMother = relate(gHuongMother, minhAnh, "Mẹ", true);
  const relFather = relate(gDungFather, minhAnh, "Bố", false);
  const gHoa = addGuardian(SCHOOL_A, "Lê Văn Hòa", 3);
  const relHoaDung = relate(gHoa, a10a1[2], "Bố", true);
  const relHoaThuHa = relate(gHoa, thuHa, "Bố", true, "verified", "u-thu");
  const allStudentsWithClass: [Student, string][] = [
    ...a10a1.map((s) => [s, CLASS_A_10A1] as [Student, string]), ...a10a2.map((s) => [s, CLASS_A_10A2] as [Student, string]),
    ...a11a1.map((s) => [s, CLASS_A_11A1] as [Student, string]), ...b10a1.map((s) => [s, CLASS_B_10A1] as [Student, string]), [tu, CLASS_A_10A1], [khoi, "c-tp-8a1"],
  ];
  const homeroomOf: Record<string, string> = { [CLASS_A_10A1]: "u-lan", [CLASS_A_10A2]: "u-minh", [CLASS_A_11A1]: "u-thu", [CLASS_B_10A1]: "u-hoa", "c-tp-8a1": "u-tp-admin" };
  allStudentsWithClass.forEach(([s, cid], i) => {
    if (s.id === minhAnh.id || s.id === a10a1[2].id || s.id === thuHa.id) return;
    const family = s.fullName.split(" ")[0];
    const fatherName = `${family} ${pick(rnd, PARENT_MID_M)} ${pick(rnd, GIVEN_M)}`;
    const motherName = `${pick(rnd, FAMILY)} ${pick(rnd, PARENT_MID_F)} ${pick(rnd, GIVEN_F)}`;
    const unverified = s.fullName === "Đặng Thu Trang";
    const two = i % 3 !== 0;
    const m = addGuardian(s.schoolId, motherName, i + 10);
    relate(m, s, "Mẹ", true, unverified ? "unverified" : "verified", homeroomOf[cid]);
    if (two) relate(addGuardian(s.schoolId, fatherName, i + 400), s, "Bố", false, unverified ? "unverified" : "verified", homeroomOf[cid]);
  });

  const allModules: ParentModule[] = ["attendance", "conduct", "timetable", "duties", "activities", "announcements", "teachers", "documents"];
  const access = (id: string, token: string, rel: GuardianRelationship, yearId: string, extra: Partial<ParentAccess> = {}): ParentAccess => {
    const pa: ParentAccess = {
      id, schoolId: rel.schoolId, studentId: rel.studentId, relationshipId: rel.id, yearId, token, modules: allModules,
      issuedAt: "2026-09-12T10:00:00+07:00", issuedBy: homeroomOf[CLASS_A_10A1], expiresAt: "2027-07-31T23:59:00+07:00", ...extra,
    };
    db.parentAccesses.push(pa);
    return pa;
  };
  const relOf = (studentId: string, relation?: string) => db.relationships.find((r) => r.studentId === studentId && (!relation || r.relation === relation))!;
  access("pa-minhanh-me", "demo-minhanh-me", relMother, YEAR_A);
  access("pa-minhanh-bo", "demo-minhanh-bo", relFather, YEAR_A, { issuedAt: "2026-09-12T10:05:00+07:00" });
  access("pa-hoa-dung", "demo-hoa-quangdung", relHoaDung, YEAR_A);
  access("pa-hoa-thuha", "demo-hoa-thuha", relHoaThuHa, YEAR_A, { issuedBy: "u-thu" });
  access("pa-expired", "demo-expired", relOf(a10a1[3].id, "Mẹ"), YEAR_A, { issuedAt: "2026-09-01T10:00:00+07:00", expiresAt: "2026-09-30T23:59:00+07:00" });
  const huyRel = relOf(a10a1[4].id, "Mẹ");
  access("pa-huy-new", "demo-huy-new", huyRel, YEAR_A, { issuedAt: "2026-09-28T09:30:00+07:00" });
  access("pa-revoked", "demo-revoked", huyRel, YEAR_A, { issuedAt: "2026-09-12T10:00:00+07:00", revokedAt: "2026-09-28T09:25:00+07:00", revokedBy: "u-lan", revokeReason: "Gia đình báo link đã bị chuyển tiếp nhầm vào nhóm chung.", replacedById: "pa-huy-new" });
  access("pa-limited", "demo-limited", relOf(a10a1[7].id, "Mẹ"), YEAR_A, { modules: ["attendance", "timetable"] });
  access("pa-oldyear", "demo-old-year", relOf(a11a1[3].id, "Mẹ"), YEAR_A_OLD, { issuedAt: "2025-09-15T10:00:00+07:00", issuedBy: "u-hanh", expiresAt: "2026-07-31T23:59:00+07:00" });
  access("pa-suspended", "demo-truong-tam-dung", relOf(khoi.id, "Mẹ"), "y-sch-tranphu-2026", { issuedBy: "u-tp-admin" });
  access("pa-anhoa-01", "demo-anhoa-01", relOf(b10a1[0].id, "Mẹ"), YEAR_B, { issuedBy: "u-hoa" });

  const log = (accessId: string, at: string, event: ParentAccessLog["event"], module?: ParentAccessLog["module"], device?: string, note?: string) => {
    const pa = db.parentAccesses.find((p) => p.id === accessId)!;
    db.parentAccessLogs.push({ id: `pal-${db.parentAccessLogs.length + 1}`, accessId, schoolId: pa.schoolId, at, event, module, device, note });
  };
  for (const pa of db.parentAccesses) log(pa.id, pa.issuedAt, "issued", undefined, undefined, "Cấp link riêng cho người giám hộ đã xác minh");
  const views: [string, string, ParentAccessLog["module"]][] = [
    ["pa-minhanh-me", "2026-09-12T20:32:00+07:00", "overview"], ["pa-minhanh-me", "2026-09-20T19:15:00+07:00", "conduct"],
    ["pa-minhanh-bo", "2026-09-21T07:48:00+07:00", "timetable"], ["pa-minhanh-me", "2026-09-27T21:10:00+07:00", "attendance"],
    ["pa-minhanh-bo", "2026-10-04T18:27:00+07:00", "activities"], ["pa-minhanh-me", "2026-10-04T20:05:00+07:00", "conduct"],
    ["pa-hoa-dung", "2026-09-22T20:00:00+07:00", "overview"], ["pa-hoa-thuha", "2026-09-22T20:03:00+07:00", "overview"],
    ["pa-anhoa-01", "2026-09-25T19:00:00+07:00", "overview"],
  ];
  views.forEach(([id, at, mod], i) => log(id, at, i % 3 === 0 ? "opened" : "viewed", mod, DEVICES[i % DEVICES.length]));
  log("pa-revoked", "2026-09-28T09:25:00+07:00", "revoked", undefined, undefined, "Thu hồi: link bị chuyển tiếp nhầm");
  log("pa-revoked", "2026-09-29T21:40:00+07:00", "blocked", "overview", DEVICES[1], "Lần mở sau khi thu hồi đã bị chặn");

  /* ------------------------------------------------------------------ groups, positions, seating */
  const setupClassOrg = (classId: string, roster: Student[], leaders: Record<number, number | null>, unassigned: string[]) => {
    const groupIds = [1, 2, 3, 4].map((i) => {
      const g: ClassGroup = { id: `grp-${classId}-${i}`, classId, name: `Tổ ${i}`, order: i };
      db.groups.push(g);
      return g.id;
    });
    const assignedRoster = roster.filter((s) => !unassigned.includes(s.id));
    assignedRoster.forEach((s, i) => {
      const gi = i < 11 ? 0 : i < 22 ? 1 : i < 32 ? 2 : 3;
      db.groupMemberships.push({ id: `gm-${db.groupMemberships.length + 1}`, classId, groupId: groupIds[gi], studentId: s.id, validFrom: "2026-09-07" });
    });
    Object.entries(leaders).forEach(([gIdx, rIdx]) => {
      if (rIdx === null) return;
      db.positions.push({ id: `pos-${db.positions.length + 1}`, classId, studentId: assignedRoster[rIdx].id, position: "group_leader", groupId: groupIds[Number(gIdx)], validFrom: "2026-09-07" });
    });
    return groupIds;
  };
  const org10a1 = [...a10a1.slice(0, 41)]; // Vũ Tuấn Anh (index 41) not yet in a group
  setupClassOrg(CLASS_A_10A1, [...org10a1, tuanAnh], { 0: 1, 1: 4, 2: 22, 3: null }, [tuanAnh.id]);
  // Tổ 1: Minh Anh(0), Bảo Châu(1)… ; Tổ 2 starts at index 11 → put Hoàng Gia Huy there by reordering is not needed: leader index 4 is in Tổ 1.
  db.positions = db.positions.filter((p) => p.classId !== CLASS_A_10A1);
  const gm = (sid: string) => db.groupMemberships.find((x) => x.studentId === sid && x.classId === CLASS_A_10A1)!;
  // move Hoàng Gia Huy + Ngô Khánh Linh into groups 2 and 3 for a realistic spread
  gm(a10a1[4].id).groupId = `grp-${CLASS_A_10A1}-2`;
  gm(a10a1[11].id).groupId = `grp-${CLASS_A_10A1}-1`;
  gm(a10a1[6].id).groupId = `grp-${CLASS_A_10A1}-3`;
  gm(a10a1[22].id).groupId = `grp-${CLASS_A_10A1}-1`;
  const pos = (studentId: string, position: StudentPosition["position"], groupId?: string) =>
    db.positions.push({ id: `pos-${db.positions.length + 1}`, classId: CLASS_A_10A1, studentId, position, groupId, validFrom: "2026-09-07" });
  pos(minhAnh.id, "class_monitor");
  pos(a10a1[3].id, "secretary");
  pos(a10a1[7].id, "vice_study");
  pos(a10a1[1].id, "group_leader", `grp-${CLASS_A_10A1}-1`);
  pos(a10a1[4].id, "group_leader", `grp-${CLASS_A_10A1}-2`);
  pos(a10a1[6].id, "group_leader", `grp-${CLASS_A_10A1}-3`);
  setupClassOrg(CLASS_A_10A2, a10a2, { 0: 0, 1: 11, 2: 22, 3: 32 }, []);
  setupClassOrg(CLASS_A_11A1, a11a1, { 0: 0, 1: 11, 2: 22, 3: 32 }, []);
  setupClassOrg(CLASS_B_10A1, b10a1, { 0: 0, 1: 11, 2: 22, 3: 32 }, []);

  const seatingFor = (classId: string, roster: Student[], rows: number, cols: number, createdBy: string): SeatingPlan => {
    const seats: SeatingPlan["seats"] = [];
    let k = 0;
    for (let r = 1; r <= rows; r++) for (let c = 1; c <= cols; c++) seats.push({ seat: `r${r}c${c}`, studentId: roster[k++]?.id ?? null });
    return { id: `seat-${classId}-v1`, classId, version: 1, rows, cols, effectiveDate: "2026-09-07", status: "active", seats, createdBy, createdAt: "2026-09-06T15:00:00+07:00" };
  };
  db.seatingPlans.push(
    seatingFor(CLASS_A_10A1, org10a1, 8, 6, "u-lan"),
    seatingFor(CLASS_A_10A2, a10a2, 7, 6, "u-minh"),
    seatingFor(CLASS_A_11A1, a11a1, 6, 6, "u-thu"),
    seatingFor(CLASS_B_10A1, b10a1, 6, 6, "u-hoa"),
  );

  /* ------------------------------------------------------------------ timetable */
  const buildTimetable = (p: "a" | "b", schoolId: string, yearId: string, classId: string, teacherOf: Record<string, string | undefined>, pins: [number, number, string][], busy: Map<string, Set<string>>) => {
    const counts: [string, number][] = [["toan", 4], ["van", 4], ["anh", 3], ["ly", 2], ["hoa", 2], ["sinh", 2], ["su", 2], ["dia", 2], ["ktpl", 2], ["tin", 2], ["cn", 1], ["gdtc", 2]];
    const grid = new Map<string, string>();
    const put = (d: number, per: number, code: string) => {
      grid.set(`${d}-${per}`, code);
      const t = teacherOf[code];
      if (t) { if (!busy.has(t)) busy.set(t, new Set()); busy.get(t)!.add(`${d}-${per}`); }
    };
    put(1, 1, "chaoco");
    put(6, 5, "shl");
    for (const [d, per, code] of pins) put(d, per, code);
    const remaining: string[] = [];
    for (const [code, n] of counts) {
      const pinned = pins.filter((x) => x[2] === code).length;
      for (let i = pinned; i < n; i++) remaining.push(code);
    }
    const r2 = mulberry32(classId.length * 97 + p.charCodeAt(0));
    remaining.sort(() => r2() - 0.5);
    for (const code of remaining) {
      const t = teacherOf[code];
      let placed = false;
      for (let attempt = 0; attempt < 60 && !placed; attempt++) {
        const d = 1 + Math.floor(r2() * 6), per = 1 + Math.floor(r2() * 5);
        const key = `${d}-${per}`;
        if (grid.has(key)) continue;
        if (t && busy.get(t)?.has(key)) continue;
        const sameDay = [...grid.entries()].filter(([k, v]) => k.startsWith(`${d}-`) && v === code).length;
        if (sameDay >= 2) continue;
        put(d, per, code); placed = true;
      }
      if (!placed) for (let d = 1; d <= 6 && !placed; d++) for (let per = 1; per <= 5 && !placed; per++) {
        const key = `${d}-${per}`;
        if (!grid.has(key) && !(t && busy.get(t)?.has(key))) { put(d, per, code); placed = true; }
      }
    }
    const homeroom = db.assignments.find((a) => a.classId === classId && a.kind === "homeroom")?.membershipId;
    for (const [key, code] of grid) {
      const [d, per] = key.split("-").map(Number);
      const tUser = teacherOf[code];
      const membershipId = code === "shl" ? homeroom : tUser ? db.memberships.find((m) => m.schoolId === schoolId && m.userId === tUser)?.id : undefined;
      const room = db.classes.find((c) => c.id === classId)?.roomId;
      db.lessons.push({
        id: `ls-${classId}-${d}-${per}`, schoolId, yearId, classId, weekday: d, period: per, subjectId: `sub-${p}-${code}`,
        teacherMembershipId: membershipId, roomId: code === "tin" && p === "a" ? "r-a-11" : room, validFrom: "2026-09-07", status: "published",
      });
    }
  };
  const busyA = new Map<string, Set<string>>();
  buildTimetable("a", SCHOOL_A, YEAR_A, CLASS_A_10A1, { toan: "u-hung", van: "u-lan", anh: "u-mai", ly: "u-nam", hoa: "u-minh", sinh: "u-huong", su: "u-kimanh", dia: "u-khoa", ktpl: "u-vinh", tin: "u-tam", cn: "u-hang", gdtc: "u-tuan" },
    [[1, 2, "van"], [1, 3, "toan"], [1, 4, "anh"], [1, 5, "ly"], [3, 1, "van"], [3, 2, "van"]], busyA);
  buildTimetable("a", SCHOOL_A, YEAR_A, CLASS_A_10A2, { toan: "u-hung", van: "u-lan", anh: "u-mai", ly: "u-nam", hoa: "u-minh", sinh: "u-huong", su: "u-kimanh", dia: "u-khoa", ktpl: "u-vinh", tin: "u-tam", cn: "u-hang", gdtc: "u-tuan" },
    [[1, 2, "toan"], [1, 4, "van"], [1, 3, "hoa"], [3, 3, "van"]], busyA);
  buildTimetable("a", SCHOOL_A, YEAR_A, CLASS_A_11A1, { toan: "u-phuc", van: "u-diep", anh: "u-thuha", ly: "u-nam", hoa: "u-minh", sinh: "u-thu", su: "u-kimanh", dia: "u-anhthu", ktpl: "u-vinh", tin: "u-tam", cn: "u-hang", gdtc: "u-tuan" }, [], busyA);
  buildTimetable("b", SCHOOL_B, YEAR_B, CLASS_B_10A1, { toan: "u-son", van: "u-hoa", anh: "u-yen", ly: "u-nam" }, [], new Map());
  db.lessonChanges.push({
    id: "lc-1", schoolId: SCHOOL_A, classId: CLASS_A_10A1, date: "2026-10-09", period: 3, kind: "substitute", subjectId: "sub-a-toan",
    teacherMembershipId: "m-a-hoa2", reason: "Thầy Hùng dự tập huấn chuyên môn — cô Hòa dạy thay", status: "published", createdBy: "u-hanh", createdAt: "2026-10-02T10:00:00+07:00",
  });

  /* ------------------------------------------------------------------ attendance + linked conduct */
  const ruleSetA1: RuleSet = {
    id: "rs-a-1", schoolId: SCHOOL_A, name: "Nội quy thi đua 2026–2027", versionNo: 1, status: "published", effectiveFrom: "2026-09-07", effectiveTo: "2026-10-11",
    baseScore: 100, rules: [
      { id: "late", code: "CC01", label: "Đi muộn", points: -5, category: "Chuyên cần", icon: "clock", attendanceLink: "late", shareWithParent: true },
      { id: "unexcused", code: "CC02", label: "Nghỉ học không phép", points: -10, category: "Chuyên cần", icon: "user-x", attendanceLink: "unexcused", shareWithParent: true },
      { id: "uniform", code: "NN01", label: "Không đồng phục", points: -10, category: "Nề nếp", icon: "shirt", shareWithParent: true },
      { id: "homework", code: "HT01", label: "Không làm bài tập", points: -10, category: "Học tập", icon: "file-x", shareWithParent: true },
      { id: "rules", code: "NN02", label: "Vi phạm nội quy", points: -15, category: "Nề nếp", icon: "alert", shareWithParent: true },
      { id: "speak", code: "HT02", label: "Tích cực phát biểu", points: 2, category: "Học tập", icon: "message", shareWithParent: true },
      { id: "helpclass", code: "PT01", label: "Hỗ trợ lớp", points: 10, category: "Phong trào", icon: "users", shareWithParent: true },
      { id: "movement", code: "PT02", label: "Tham gia hoạt động phong trào", points: 10, category: "Phong trào", icon: "flag", shareWithParent: true },
      { id: "rolemodel", code: "PT03", label: "Gương mẫu, giúp đỡ bạn", points: 5, category: "Phong trào", icon: "star", shareWithParent: true },
    ],
    bands: [{ min: 90, label: "Tốt", tone: "success" }, { min: 75, label: "Khá", tone: "info" }, { min: 60, label: "Đạt", tone: "warning" }, { min: -9999, label: "Cần cố gắng", tone: "danger" }],
    entryDeadlineDays: 2, createdBy: "u-hanh", publishedAt: "2026-09-01T09:00:00+07:00", version: 1,
  };
  const ruleSetA2: RuleSet = {
    ...ruleSetA1, id: "rs-a-2", name: "Nội quy thi đua 2026–2027 (bản 2)", versionNo: 2, effectiveFrom: "2026-10-12", effectiveTo: undefined,
    rules: ruleSetA1.rules.map((r) => (r.id === "late" ? { ...r, points: -3 } : r)), publishedAt: "2026-10-01T10:00:00+07:00", version: 1,
  };
  const ruleSetA3: RuleSet = {
    ...ruleSetA2, id: "rs-a-3", name: "Nội quy thi đua — dự thảo bổ sung", versionNo: 3, status: "draft", effectiveFrom: "2026-11-02", publishedAt: undefined,
    rules: [...ruleSetA2.rules, { id: "clean", code: "NN03", label: "Giữ gìn vệ sinh chung", points: 3, category: "Nề nếp", icon: "sparkles", shareWithParent: true }],
  };
  const ruleSetB1: RuleSet = {
    ...ruleSetA1, id: "rs-b-1", schoolId: SCHOOL_B, name: "Quy chế thi đua THPT An Hòa", effectiveTo: undefined,
    rules: ruleSetA1.rules.map((r) => (r.id === "late" ? { ...r, points: -4 } : r.id === "speak" ? { ...r, points: 3 } : r)), createdBy: "u-khang",
  };
  db.ruleSets.push(ruleSetA1, ruleSetA2, ruleSetA3, ruleSetB1);

  const rosterOn = (classId: string, date: string) =>
    db.enrollments.filter((e) => e.classId === classId && e.startDate <= date && (!e.endDate || e.endDate >= date)).map((e) => db.students.find((s) => s.id === e.studentId)!);
  const weeksOf = (yid: string) => db.weeks.filter((w) => w.yearId === yid);
  const weekOfDate = (yid: string, date: string) => weeksOf(yid).find((w) => w.startDate <= date && w.endDate >= date)!;

  const addConduct = (c: Omit<ConductRecord, "id" | "version" | "createdAt" | "schoolId" | "weekId" | "ruleSetId" | "points"> & { yearId: string; schoolId: string; ruleSet: RuleSet; createdAt?: string }) => {
    const rule = c.ruleSet.rules.find((r) => r.id === c.ruleId)!;
    const w = weekOfDate(c.yearId, c.date);
    const rec: ConductRecord = {
      id: `cr-${db.conductRecords.length + 1}`, schoolId: c.schoolId, classId: c.classId, studentId: c.studentId, weekId: w.id, date: c.date,
      ruleSetId: c.ruleSet.id, ruleId: c.ruleId, points: rule.points, reason: c.reason, sourceEventKey: c.sourceEventKey,
      linkedAttendanceRecordId: c.linkedAttendanceRecordId, createdBy: c.createdBy, createdAt: c.createdAt ?? localDateTime(c.date, "09:30"),
      status: c.status, reviewNote: c.reviewNote, version: 1,
    };
    db.conductRecords.push(rec);
    return rec;
  };

  const attendanceClasses: [string, string, string, string, RuleSet][] = [
    [CLASS_A_10A1, SCHOOL_A, YEAR_A, "u-lan", ruleSetA1], [CLASS_A_10A2, SCHOOL_A, YEAR_A, "u-minh", ruleSetA1],
    [CLASS_A_11A1, SCHOOL_A, YEAR_A, "u-thu", ruleSetA1], [CLASS_B_10A1, SCHOOL_B, YEAR_B, "u-hoa", ruleSetB1],
  ];
  const ra = mulberry32(777);
  for (const [classId, schoolId, yearId, teacher, rs] of attendanceClasses) {
    for (let day = 0; day < 27; day++) {
      const date = addDays("2026-09-07", day);
      if (weekdayOf(date) === 7) continue;
      const session: AttendanceSession = {
        id: `as-${classId}-${date}-m`, schoolId, classId, date, slot: "morning", status: "published", version: 1,
        updatedAt: localDateTime(date, "07:10"), updatedBy: teacher, publishedAt: localDateTime(date, "11:30"),
      };
      db.attendanceSessions.push(session);
      for (const s of rosterOn(classId, date)) {
        let st: AttendanceStatus = "present";
        const x = ra();
        if (s.id === minhAnh.id) st = date === "2026-09-28" ? "late" : "present";
        else if (x < 0.028) st = "late";
        else if (x < 0.04) st = "excused";
        else if (x < 0.045) st = "unexcused";
        const recId = `ar-${session.id}-${s.id}`;
        const key = st === "late" || st === "unexcused" ? `att:${session.id}:${s.id}` : undefined;
        db.attendanceRecords.push({
          id: recId, sessionId: session.id, classId, studentId: s.id, date, status: st, sourceEventKey: key,
          note: st === "excused" ? "Gia đình xin phép (ốm)" : st === "late" ? `Đến lúc 07:${10 + Math.floor(ra() * 15)}` : undefined, history: [],
        });
        if (key) addConduct({ classId, schoolId, yearId, studentId: s.id, date, ruleSet: rs, ruleId: st, reason: st === "late" ? "Đi muộn (từ điểm danh)" : "Nghỉ học không phép (từ điểm danh)", sourceEventKey: key, linkedAttendanceRecordId: recId, createdBy: teacher, status: "approved" });
      }
    }
  }
  // Non-attendance conduct in weeks 1–4
  const extraRules = ["speak", "speak", "speak", "homework", "uniform", "movement", "rolemodel", "helpclass"];
  for (const [classId, schoolId, yearId, teacher, rs] of attendanceClasses) {
    for (let w = 0; w < 4; w++) {
      const n = 6 + Math.floor(ra() * 5);
      for (let i = 0; i < n; i++) {
        const date = addDays("2026-09-07", w * 7 + Math.floor(ra() * 6));
        const roster = rosterOn(classId, date).filter((s) => s.id !== minhAnh.id);
        const s = roster[Math.floor(ra() * roster.length)];
        const ruleId = extraRules[Math.floor(ra() * extraRules.length)];
        addConduct({ classId, schoolId, yearId, studentId: s.id, date, ruleSet: rs, ruleId, reason: rs.rules.find((r) => r.id === ruleId)!.label, createdBy: ruleId === "speak" && classId !== CLASS_B_10A1 ? "u-hung" : teacher, status: "approved" });
      }
    }
  }
  // Minh Anh: week 2 +2, week 4 +2 (Wed) → week 4 total 100 − 5 + 2 = 97
  addConduct({ classId: CLASS_A_10A1, schoolId: SCHOOL_A, yearId: YEAR_A, studentId: minhAnh.id, date: "2026-09-16", ruleSet: ruleSetA1, ruleId: "speak", reason: "Tích cực phát biểu giờ Toán", createdBy: "u-hung", status: "approved" });
  addConduct({ classId: CLASS_A_10A1, schoolId: SCHOOL_A, yearId: YEAR_A, studentId: minhAnh.id, date: "2026-09-30", ruleSet: ruleSetA1, ruleId: "speak", reason: "Tích cực phát biểu giờ Toán", createdBy: "u-hung", status: "approved" });
  // Lê Quang Dũng week 4: homework recorded (will be subject of a pending adjustment)
  const dungHw = addConduct({ classId: CLASS_A_10A1, schoolId: SCHOOL_A, yearId: YEAR_A, studentId: a10a1[2].id, date: "2026-10-01", ruleSet: ruleSetA1, ruleId: "homework", reason: "Không nộp bài tập Toán", createdBy: "u-hung", status: "approved" });

  // Week 1–4: lock & publish snapshots (single computation path)
  for (const [classId, schoolId, yearId, teacher, rs] of attendanceClasses) {
    for (let w = 1; w <= 4; w++) {
      const week = weeksOf(yearId).find((x) => x.index === w)!;
      const roster = rosterOn(classId, week.startDate === "2026-09-07" ? "2026-09-07" : week.startDate);
      const recs = db.conductRecords.filter((r) => r.classId === classId && r.weekId === week.id && r.status === "approved");
      const snap: PublishedSnapshot = {
        id: `snap-${classId}-w${w}-v1`, schoolId, classId, weekId: week.id, kind: "conduct_week", versionNo: 1, ruleSetId: rs.id,
        ruleSetVersionNo: rs.versionNo, ruleSetName: rs.name, lockedAt: localDateTime(addDays(week.endDate, -1), "11:30"), lockedBy: teacher,
        publishedAt: localDateTime(addDays(week.endDate, -1), "11:35"), publishedBy: teacher, status: "published", rows: computeRows(roster, recs, rs, db.ruleSets),
      };
      db.snapshots.push(snap);
      db.conductPeriods.push({ id: `cp-${classId}-w${w}`, schoolId, classId, weekId: week.id, status: "published", lockedAt: snap.lockedAt, lockedBy: teacher, currentSnapshotId: snap.id, version: 1 });
    }
  }
  // Pending adjustment on week 4 (Lê Quang Dũng) — parent keeps seeing the published version meanwhile
  const w4snap = db.snapshots.find((s) => s.id === `snap-${CLASS_A_10A1}-w4-v1`)!;
  const dungRow = w4snap.rows.find((r) => r.studentId === a10a1[2].id)!;
  db.adjustments.push({
    id: "adj-1", schoolId: SCHOOL_A, classId: CLASS_A_10A1, snapshotId: w4snap.id, studentId: a10a1[2].id, recordId: dungHw.id, kind: "remove_record",
    beforeTotal: dungRow.total, afterTotal: dungRow.total + 10, reason: "Ghi nhầm: em đã nộp bài cho giáo viên bộ môn trong ngày, xác nhận lại với thầy Hùng.",
    status: "pending", requestedBy: "u-lan", requestedAt: "2026-10-03T10:20:00+07:00",
  });

  // Today (Mon 05/10): 10A1 morning saved, not published — 38 / 2 / 1 / 1
  const today = "2026-10-05";
  const todaySession: AttendanceSession = { id: `as-${CLASS_A_10A1}-${today}-m`, schoolId: SCHOOL_A, classId: CLASS_A_10A1, date: today, slot: "morning", status: "saved", version: 1, updatedAt: "2026-10-05T07:05:00+07:00", updatedBy: "u-lan" };
  db.attendanceSessions.push(todaySession);
  const roster10A1 = rosterOn(CLASS_A_10A1, today);
  const specialToday: Record<string, AttendanceStatus> = { [a10a1[1].id]: "late", [a10a1[2].id]: "late", [a10a1[12].id]: "excused", [a10a1[20].id]: "unexcused" };
  for (const s of roster10A1) {
    const st = specialToday[s.id] ?? "present";
    const recId = `ar-${todaySession.id}-${s.id}`;
    const key = st === "late" || st === "unexcused" ? `att:${todaySession.id}:${s.id}` : undefined;
    db.attendanceRecords.push({ id: recId, sessionId: todaySession.id, classId: CLASS_A_10A1, studentId: s.id, date: today, status: st, sourceEventKey: key,
      note: st === "late" ? "Đến lúc 07:12" : st === "excused" ? "Nghỉ ốm (có giấy phép)" : undefined, history: [] });
    if (key) addConduct({ classId: CLASS_A_10A1, schoolId: SCHOOL_A, yearId: YEAR_A, studentId: s.id, date: today, ruleSet: ruleSetA1, ruleId: st, reason: st === "late" ? "Đi muộn (từ điểm danh)" : "Nghỉ học không phép (từ điểm danh)", sourceEventKey: key, linkedAttendanceRecordId: recId, createdBy: "u-lan", status: "pending_review", createdAt: "2026-10-05T07:05:00+07:00" });
  }
  // Week 5 other pending records incl. a possible duplicate
  addConduct({ classId: CLASS_A_10A1, schoolId: SCHOOL_A, yearId: YEAR_A, studentId: a10a1[6].id, date: today, ruleSet: ruleSetA1, ruleId: "speak", reason: "Tích cực phát biểu", createdBy: "u-hung", status: "pending_review", createdAt: "2026-10-05T07:55:00+07:00" });
  addConduct({ classId: CLASS_A_10A1, schoolId: SCHOOL_A, yearId: YEAR_A, studentId: a10a1[4].id, date: today, ruleSet: ruleSetA1, ruleId: "uniform", reason: "Không mặc áo đồng phục", sourceEventKey: "evt:10a1:2026-10-05:uniform:huy", createdBy: "u-lan", status: "pending_review", createdAt: "2026-10-05T07:20:00+07:00" });
  addConduct({ classId: CLASS_A_10A1, schoolId: SCHOOL_A, yearId: YEAR_A, studentId: a10a1[4].id, date: today, ruleSet: ruleSetA1, ruleId: "uniform", reason: "Không đồng phục (ghi từ tiết Toán)", createdBy: "u-hung", status: "pending_review", createdAt: "2026-10-05T07:58:00+07:00" });
  for (const [classId, schoolId] of [[CLASS_A_10A1, SCHOOL_A], [CLASS_A_10A2, SCHOOL_A], [CLASS_A_11A1, SCHOOL_A], [CLASS_B_10A1, SCHOOL_B]] as const) {
    const yid = schoolId === SCHOOL_A ? YEAR_A : YEAR_B;
    db.conductPeriods.push({ id: `cp-${classId}-w5`, schoolId, classId, weekId: `${yid}-w5`, status: "open", version: 1 });
  }

  /* ------------------------------------------------------------------ duties */
  for (let d = 0; d < 12; d++) {
    const date = addDays("2026-10-05", d);
    const wd = weekdayOf(date);
    if (wd === 7) continue;
    const gi = ((wd - 1) % 4) + 1;
    const groupId = `grp-${CLASS_A_10A1}-${gi}`;
    const members = db.groupMemberships.filter((m) => m.groupId === groupId).map((m) => m.studentId);
    db.duties.push({ id: `du-${date}`, classId: CLASS_A_10A1, date, task: wd % 2 ? "Lau bảng, quét lớp đầu giờ" : "Đổ rác, kê bàn ghế cuối buổi", groupId, studentIds: members.slice(0, 4), status: d < 6 ? "published" : "draft", createdBy: "u-lan" });
  }

  /* ------------------------------------------------------------------ files, activities, evidence */
  const file = (f: Omit<FileAsset, "id" | "status" | "createdAt"> & Partial<FileAsset>): FileAsset => {
    const x: FileAsset = { id: `f-${db.files.length + 1}`, status: "active", createdAt: "2026-09-20T10:00:00+07:00", ...f };
    db.files.push(x);
    return x;
  };
  const act = (a: Omit<Activity, "schoolId" | "version" | "createdAt"> & Partial<Activity>) => { db.activities.push({ schoolId: SCHOOL_A, version: 1, createdAt: "2026-09-25T09:00:00+07:00", ...a }); };
  const all10A1 = a10a1.map((s) => s.id);
  const group2 = db.groupMemberships.filter((m) => m.groupId === `grp-${CLASS_A_10A1}-2`).map((m) => m.studentId);
  act({ id: "act-1", classId: CLASS_A_10A1, title: "Phong trào “Lớp học tích cực”", description: "Mỗi học sinh ghi lại một việc tốt đã làm cho lớp trong hai tuần; giáo viên ghi nhận minh chứng nhận được.", illustration: "trophy", dueDate: "2026-10-20", assignedStudentIds: all10A1, evidenceRequired: true, status: "active", publishedToParents: true, createdBy: "u-lan" });
  act({ id: "act-2", classId: CLASS_A_10A1, title: "Trải nghiệm STEM: sản phẩm tái chế", description: "Thực hiện sản phẩm sáng tạo từ vật liệu tái chế và ghi lại quá trình thực hiện.", illustration: "stem", dueDate: "2026-10-25", assignedStudentIds: all10A1, evidenceRequired: true, status: "active", publishedToParents: true, createdBy: "u-lan" });
  act({ id: "act-3", classId: CLASS_A_10A1, title: "Vệ sinh lớp học theo tổ", description: "Tổ 2 chụp ảnh ghi lại hoạt động vệ sinh lớp học sau giờ học theo lịch phân công.", illustration: "clean", dueDate: "2026-10-10", assignedStudentIds: group2, assignedGroupId: `grp-${CLASS_A_10A1}-2`, evidenceRequired: true, status: "active", publishedToParents: true, createdBy: "u-lan" });
  act({ id: "act-4", classId: CLASS_A_10A1, title: "Tìm hiểu pháp luật cho học sinh", description: "Bản nháp: chuẩn bị bài thu hoạch theo chủ đề nhà trường phát động.", illustration: "book", dueDate: "2026-11-05", assignedStudentIds: all10A1, evidenceRequired: false, status: "draft", publishedToParents: false, createdBy: "u-lan" });
  act({ id: "act-5", classId: CLASS_A_10A2, title: "Câu lạc bộ đọc sách", description: "Đọc và chia sẻ cảm nhận về một cuốn sách.", illustration: "book", dueDate: "2026-10-30", assignedStudentIds: a10a2.map((s) => s.id), evidenceRequired: true, status: "active", publishedToParents: true, createdBy: "u-minh" });
  const pattern = ["poster", "plant", "notebook", "model", "cleaning", "drawing"];
  const subStatus = (actId: string, idx: number, sid: string): ActivitySubmission["status"] => {
    if (actId === "act-1") { if (sid === minhAnh.id) return "approved"; return idx < 12 ? "approved" : idx < 18 ? "pending_review" : idx < 21 ? "needs_supplement" : idx < 25 ? "received" : "not_received"; }
    if (actId === "act-2") { if (sid === minhAnh.id) return "pending_review"; return idx < 5 ? "approved" : idx < 9 ? "pending_review" : "not_received"; }
    if (actId === "act-3") return idx < 8 ? "approved" : idx < 9 ? "needs_supplement" : "not_received";
    if (actId === "act-5") return idx < 10 ? "approved" : idx < 14 ? "pending_review" : "not_received";
    return "not_received";
  };
  for (const a of db.activities) {
    a.assignedStudentIds.forEach((sid, idx) => {
      const st = a.status === "draft" ? "not_received" : subStatus(a.id, idx, sid);
      db.submissions.push({ id: `sub-${a.id}-${sid}`, activityId: a.id, studentId: sid, status: st, updatedAt: localDateTime(addDays("2026-09-28", idx % 7), "10:15"), updatedBy: a.createdBy, note: st === "needs_supplement" ? "Ảnh chưa thể hiện rõ quá trình thực hiện, cần bổ sung." : undefined });
      if (st === "approved" || st === "pending_review" || st === "needs_supplement") {
        const f = file({ schoolId: SCHOOL_A, classId: a.classId, studentId: sid, name: `minh-chung-${a.id}-${idx + 1}.png`, mime: "image/png", size: 180_000 + idx * 3_517, source: { kind: "synthetic", pattern: pattern[(idx + a.id.length) % pattern.length] }, ownerId: a.createdBy, share: st === "approved" ? "student_parent" : "internal", category: "evidence", createdAt: localDateTime(addDays("2026-09-28", idx % 7), "10:10") });
        db.evidence.push({ id: `ev-${a.id}-${sid}`, schoolId: SCHOOL_A, classId: a.classId, activityId: a.id, studentId: sid, fileId: f.id, uploadedBy: a.createdBy, uploadedAt: f.createdAt, status: st === "approved" ? "approved" : st === "pending_review" ? "pending" : "supplement", reviewNote: st === "needs_supplement" ? "Cần bổ sung ảnh quá trình." : undefined, sharedWithParent: st === "approved" });
      }
    });
  }
  file({ schoolId: SCHOOL_A, classId: CLASS_A_10A1, name: "Nội quy lớp 10A1.pdf", mime: "application/pdf", size: 248_000, source: { kind: "synthetic", pattern: "doc-rules" }, ownerId: "u-lan", share: "class_parents", category: "document", createdAt: "2026-09-06T10:00:00+07:00" });
  file({ schoolId: SCHOOL_A, classId: CLASS_A_10A1, name: "Kế hoạch hoạt động tháng 10.docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: 86_000, source: { kind: "synthetic", pattern: "doc-plan" }, ownerId: "u-lan", share: "internal", category: "document", createdAt: "2026-09-30T10:00:00+07:00" });
  file({ schoolId: SCHOOL_A, classId: CLASS_A_10A1, name: "Danh sách tổ và chức vụ.pdf", mime: "application/pdf", size: 132_000, source: { kind: "synthetic", pattern: "doc-groups" }, ownerId: "u-lan", share: "internal", category: "document", createdAt: "2026-09-08T10:00:00+07:00" });
  file({ schoolId: SCHOOL_A, classId: CLASS_A_10A1, name: "Ảnh lớp đầu năm.png", mime: "image/png", size: 540_000, source: { kind: "synthetic", pattern: "drawing" }, ownerId: "u-lan", share: "internal", category: "document", status: "archived", createdAt: "2026-09-07T10:00:00+07:00" });
  const reportFile = file({ schoolId: SCHOOL_A, classId: CLASS_A_10A1, studentId: minhAnh.id, name: "Phiếu liên lạc tháng 9 – Nguyễn Minh Anh.pdf", mime: "application/pdf", size: 96_000, source: { kind: "synthetic", pattern: "doc-report" }, ownerId: "u-lan", share: "student_parent", category: "report", createdAt: "2026-10-02T16:00:00+07:00" });
  const planFile = file({ schoolId: SCHOOL_A, name: "Kế hoạch năm học 2026–2027.pdf", mime: "application/pdf", size: 412_000, source: { kind: "synthetic", pattern: "doc-plan" }, ownerId: "u-hanh", share: "class_parents", category: "announcement", createdAt: "2026-09-01T08:00:00+07:00" });
  void reportFile;

  /* ------------------------------------------------------------------ announcements */
  const ann = (a: Omit<Announcement, "history" | "version" | "createdAt" | "updatedAt" | "attachmentIds" | "isPublic" | "origin"> & Partial<Announcement>) => {
    const created = a.publishedAt ?? a.scheduledAt ?? "2026-10-01T09:00:00+07:00";
    db.announcements.push({ origin: "school", isPublic: false, attachmentIds: [], createdAt: created, updatedAt: created, version: 1, history: [{ at: created, by: a.createdBy, action: a.status === "draft" ? "Tạo bản nháp" : a.status === "scheduled" ? "Đặt lịch công bố (mô phỏng)" : "Công bố" }], ...a });
  };
  ann({ id: "an-1", schoolId: SCHOOL_A, title: "Kế hoạch năm học 2026–2027", summary: "Nhà trường công bố kế hoạch năm học, lịch học kỳ và các mốc quan trọng.", body: [{ type: "p", text: "Kính gửi cán bộ, giáo viên và gia đình học sinh," }, { type: "p", text: "Nhà trường công bố kế hoạch năm học 2026–2027 với hai học kỳ. Học kỳ 1 từ 07/09/2026 đến 10/01/2027." }, { type: "li", text: "Khai giảng: 05/09/2026" }, { type: "li", text: "Kiểm tra giữa học kỳ 1: tuần 9" }, { type: "p", text: "Chi tiết xem tệp đính kèm." }], audience: "all", scope: { type: "school" }, isPublic: true, attachmentIds: [planFile.id], status: "published", publishedAt: "2026-09-01T08:00:00+07:00", createdBy: "u-hanh" });
  ann({ id: "an-2", schoolId: SCHOOL_A, title: "Lịch họp phụ huynh đầu năm khối 10", summary: "Họp phụ huynh khối 10 vào sáng Chủ nhật 20/09/2026 tại các phòng học.", body: [{ type: "p", text: "Nhà trường tổ chức họp phụ huynh đầu năm cho khối 10 lúc 08:00 Chủ nhật, 20/09/2026, tại phòng học của từng lớp." }], audience: "families", scope: { type: "grade", gradeIds: ["g-a-10"] }, status: "published", publishedAt: "2026-09-14T09:00:00+07:00", createdBy: "u-hanh" });
  ann({ id: "an-3", schoolId: SCHOOL_A, title: "Hướng dẫn sử dụng EduManage cho giáo viên", summary: "Tài liệu nội bộ hướng dẫn điểm danh, ghi nhận thi đua và công bố.", body: [{ type: "p", text: "Tài liệu nội bộ dành cho giáo viên. Phụ huynh không nhận thông báo này." }], audience: "staff", scope: { type: "school" }, status: "published", publishedAt: "2026-09-04T09:00:00+07:00", createdBy: "u-quan" });
  ann({ id: "an-4", schoolId: SCHOOL_A, title: "Kế hoạch hội thao chào mừng 20/11", summary: "Bản nháp — chưa công bố.", body: [{ type: "p", text: "Dự thảo kế hoạch hội thao, đang lấy ý kiến tổ chuyên môn." }], audience: "all", scope: { type: "school" }, status: "draft", createdBy: "u-hanh", internalNote: "Chờ BGH góp ý trước 10/10." });
  ann({ id: "an-5", schoolId: SCHOOL_A, title: "Điều chỉnh giờ vào lớp buổi sáng", summary: "Thông báo đã thu hồi do có điều chỉnh mới.", body: [{ type: "p", text: "Từ 28/09/2026 giờ vào lớp là 06:55." }], audience: "families", scope: { type: "school" }, status: "withdrawn", publishedAt: "2026-09-22T09:00:00+07:00", withdrawnAt: "2026-09-25T09:00:00+07:00", withdrawReason: "Nhà trường giữ nguyên giờ vào lớp 07:00.", createdBy: "u-hanh" });
  ann({ id: "an-6", schoolId: SCHOOL_A, title: "Lịch kiểm tra giữa học kỳ 1", summary: "Lịch kiểm tra định kỳ các môn Toán, Ngữ văn, Tiếng Anh khối 10 và 11.", body: [{ type: "p", text: "Kiểm tra giữa học kỳ 1 diễn ra trong tuần 9 (02/11 – 07/11/2026)." }], audience: "all", scope: { type: "grade", gradeIds: ["g-a-10", "g-a-11"] }, status: "scheduled", scheduledAt: "2026-10-12T07:00:00+07:00", createdBy: "u-hanh" });
  ann({ id: "an-7", schoolId: SCHOOL_A, origin: "class", originClassId: CLASS_A_10A1, title: "Họp phụ huynh giữa kỳ lớp 10A1", summary: "Trao đổi kết quả rèn luyện và kế hoạch học tập nửa đầu học kỳ.", body: [{ type: "p", text: "Kính mời phụ huynh lớp 10A1 dự họp lúc 08:00 Chủ nhật 25/10/2026 tại phòng A1.03." }], audience: "families", scope: { type: "class", classIds: [CLASS_A_10A1] }, status: "scheduled", scheduledAt: "2026-10-10T08:00:00+07:00", createdBy: "u-lan" });
  ann({ id: "an-8", schoolId: SCHOOL_A, origin: "class", originClassId: CLASS_A_10A1, title: "Nhắc bổ sung giấy khám sức khỏe", summary: "Gia đình vui lòng gửi bản sao giấy khám sức khỏe cho giáo viên chủ nhiệm.", body: [{ type: "p", text: "Gia đình em Minh Anh vui lòng gửi bản sao giấy khám sức khỏe cho cô chủ nhiệm trước 10/10/2026." }], audience: "families", scope: { type: "student", studentIds: [minhAnh.id], classIds: [CLASS_A_10A1] }, status: "published", publishedAt: "2026-10-02T16:30:00+07:00", createdBy: "u-lan" });
  ann({ id: "an-9", schoolId: SCHOOL_A, origin: "class", originClassId: CLASS_A_10A1, title: "Nhắc hoàn thiện sản phẩm STEM", summary: "Nhắc riêng gia đình em Bảo Châu về hạn nộp sản phẩm.", body: [{ type: "p", text: "Em Bảo Châu cần hoàn thiện sản phẩm STEM trước 25/10/2026." }], audience: "families", scope: { type: "student", studentIds: [a10a1[1].id], classIds: [CLASS_A_10A1] }, status: "published", publishedAt: "2026-10-03T09:00:00+07:00", createdBy: "u-lan" });
  ann({ id: "an-10", schoolId: SCHOOL_A, origin: "class", originClassId: CLASS_A_10A1, title: "Lịch trực nhật tuần 5", summary: "Lịch trực nhật theo tổ từ 05/10 đến 10/10/2026.", body: [{ type: "p", text: "Các tổ thực hiện trực nhật theo lịch đã công bố trên EduManage." }], audience: "families", scope: { type: "class", classIds: [CLASS_A_10A1] }, status: "published", publishedAt: "2026-10-04T17:00:00+07:00", createdBy: "u-lan" });
  ann({ id: "an-11", schoolId: SCHOOL_A, origin: "class", originClassId: CLASS_A_10A1, title: "Chuẩn bị đồ dùng giờ thực hành", summary: "Bản nháp chưa công bố.", body: [{ type: "p", text: "Nháp nội bộ." }], audience: "families", scope: { type: "class", classIds: [CLASS_A_10A1] }, status: "draft", createdBy: "u-lan", internalNote: "Kiểm tra lại danh sách đồ dùng với thầy Nam." });
  ann({ id: "an-b-1", schoolId: SCHOOL_B, title: "Chào mừng năm học mới", summary: "THPT An Hòa chào mừng học sinh và gia đình.", body: [{ type: "p", text: "Thông báo công khai của trường An Hòa (giả định)." }], audience: "all", scope: { type: "school" }, isPublic: true, status: "published", publishedAt: "2026-09-05T08:00:00+07:00", createdBy: "u-khang" });

  /* ------------------------------------------------------------------ notifications */
  const notify = (userId: string, schoolId: string, kind: StaffNotification["kind"], title: string, body: string, href: string | undefined, at: string, read = false) =>
    db.notifications.push({ id: `nt-${db.notifications.length + 1}`, userId, schoolId, kind, title, body, href, createdAt: at, readAt: read ? at : undefined });
  const cr = `/classroom/${SCHOOL_A}/${YEAR_A}/${CLASS_A_10A1}`;
  notify("u-lan", SCHOOL_A, "task", "5 ghi nhận thi đua chờ rà soát", "Lớp 10A1 — tuần 5", `${cr}/conduct/review`, "2026-10-05T07:58:00+07:00");
  notify("u-lan", SCHOOL_A, "task", "Minh chứng cần duyệt", "Hoạt động “Lớp học tích cực” có minh chứng mới", `${cr}/evidence`, "2026-10-04T10:12:00+07:00");
  notify("u-lan", SCHOOL_A, "announcement", "Nhà trường công bố thông báo", "Hướng dẫn sử dụng EduManage cho giáo viên", `/teacher/${SCHOOL_A}/announcements`, "2026-09-04T09:00:00+07:00", true);
  notify("u-lan", SCHOOL_B, "system", "Lời mời từ THPT An Hòa", "Bạn được mời thỉnh giảng Ngữ văn", `/invitations/inv-b-lan`, "2026-10-04T08:30:00+07:00");
  notify("u-hung", SCHOOL_A, "task", "Tiết Toán 10A1 thứ Sáu có giáo viên dạy thay", "Tiết 3 ngày 09/10/2026", `/teacher/${SCHOOL_A}/schedule`, "2026-10-02T10:00:00+07:00");
  notify("u-hanh", SCHOOL_A, "task", "2 lớp chưa có giáo viên chủ nhiệm", "10A3, 12A1 đang ở trạng thái nháp", `/school/${SCHOOL_A}/assignments`, "2026-10-04T09:00:00+07:00");
  notify("u-hanh", SCHOOL_A, "task", "Yêu cầu chuyển lớp chờ duyệt", "10A2 → 11A1, hiệu lực 12/10/2026", `/school/${SCHOOL_A}/transfers`, "2026-10-02T14:00:00+07:00");
  notify("u-dung", SCHOOL_A, "task", "Điều chỉnh sau chốt chờ duyệt", "Lớp 10A1 — tuần 4", `${cr}/adjustments`, "2026-10-03T10:20:00+07:00");
  notify("u-hanh", SCHOOL_A, "permission", "Yêu cầu quyền hỗ trợ", "Nền tảng đề nghị xem nhật ký nhập dữ liệu trong 7 ngày", `/school/${SCHOOL_A}/support`, "2026-10-01T11:00:00+07:00", true);

  /* ------------------------------------------------------------------ support, audit, jobs */
  db.tickets.push(
    { id: "tk-1", schoolId: SCHOOL_A, title: "Nhập danh sách 11A1 báo lỗi cột ngày sinh", body: "Tệp nhập danh sách lớp 11A1 báo lỗi ở 2 dòng ngày sinh, cần hướng dẫn định dạng.", priority: "normal", status: "resolved", createdBy: "u-quan", createdAt: "2026-09-08T09:00:00+07:00", assigneeUserId: "u-linh-op",
      updates: [{ at: "2026-09-08T10:00:00+07:00", by: "u-linh-op", text: "Định dạng ngày sinh cần là dd/MM/yyyy. Đã gửi tệp mẫu.", side: "platform" }, { at: "2026-09-08T14:00:00+07:00", by: "u-quan", text: "Đã nhập lại thành công.", side: "school" }] },
    { id: "tk-2", schoolId: SCHOOL_A, title: "Cần xem lại lịch khối 10 hiển thị trùng tiết", body: "Lịch 10A2 hiển thị hai môn trong cùng tiết sau khi đổi tiết.", priority: "high", status: "in_progress", createdBy: "u-hanh", createdAt: "2026-10-01T10:30:00+07:00", assigneeUserId: "u-linh-op",
      updates: [{ at: "2026-10-01T11:00:00+07:00", by: "u-linh-op", text: "Đề nghị nhà trường cho phép xem nhật ký nhập dữ liệu trong 7 ngày để kiểm tra.", side: "platform" }] },
    { id: "tk-3", schoolId: "sch-lqd", title: "Hướng dẫn cấp link tra cứu hàng loạt", body: "Trường muốn biết cách cấp link cho nhiều gia đình.", priority: "low", status: "open", createdBy: "u-lqd-admin", createdAt: "2026-10-04T15:00:00+07:00", updates: [] },
    { id: "tk-4", schoolId: "sch-tranphu", title: "Đề nghị tạm dừng sử dụng", body: "Nhà trường đề nghị tạm dừng để rà soát quy trình nội bộ.", priority: "normal", status: "resolved", createdBy: "u-tp-admin", createdAt: "2026-09-20T09:00:00+07:00", assigneeUserId: "u-bao", updates: [{ at: "2026-09-21T09:00:00+07:00", by: "u-bao", text: "Đã tạm dừng theo đề nghị; dữ liệu được giữ nguyên.", side: "platform" }] },
    { id: "tk-5", schoolId: "sch-nguyenhue", title: "Cập nhật logo và màu nhận diện", body: "Nhờ hướng dẫn cập nhật logo mới.", priority: "low", status: "waiting_school", createdBy: "u-nh-admin", createdAt: "2026-10-02T09:00:00+07:00", assigneeUserId: "u-linh-op", updates: [{ at: "2026-10-02T11:00:00+07:00", by: "u-linh-op", text: "Nhà trường có thể tự cập nhật trong mục Thông tin trường.", side: "platform" }] },
  );
  db.supportGrants.push(
    { id: "sg-1", schoolId: SCHOOL_A, ticketId: "tk-2", scopes: ["import_logs", "class_structure"], reason: "Kiểm tra lỗi hiển thị lịch khối 10", requestedBy: "u-linh-op", approvedBy: "u-hanh", validFrom: "2026-10-01T14:00:00+07:00", validTo: "2026-10-08T14:00:00+07:00", status: "active" },
    { id: "sg-2", schoolId: SCHOOL_A, ticketId: "tk-1", scopes: ["import_logs"], reason: "Hỗ trợ nhập danh sách 11A1", requestedBy: "u-linh-op", approvedBy: "u-quan", validFrom: "2026-09-08T10:00:00+07:00", validTo: "2026-09-10T10:00:00+07:00", status: "expired" },
    { id: "sg-3", schoolId: "sch-nguyenhue", ticketId: "tk-5", scopes: ["school_config"], reason: "Hỗ trợ cập nhật nhận diện", requestedBy: "u-linh-op", validTo: "2026-10-09T17:00:00+07:00", status: "requested" },
    { id: "sg-4", schoolId: "sch-lqd", scopes: ["staff_directory"], reason: "Kiểm tra lời mời giáo viên", requestedBy: "u-bao", approvedBy: "u-lqd-admin", validFrom: "2026-09-15T09:00:00+07:00", validTo: "2026-09-30T09:00:00+07:00", status: "revoked", revokedAt: "2026-09-18T09:00:00+07:00" },
  );
  const audit = (e: Omit<AuditEvent, "id">) => db.audit.push({ id: `au-${db.audit.length + 1}`, ...e });
  audit({ level: "platform", actorId: "u-bao", action: "Kích hoạt trường", entityType: "school", entityId: "sch-lqd", entityLabel: "Trường THCS Lê Quý Đôn", before: { status: "draft" }, after: { status: "active" }, at: "2026-06-10T09:00:00+07:00" });
  audit({ level: "platform", actorId: "u-bao", action: "Kích hoạt trường", entityType: "school", entityId: SCHOOL_A, entityLabel: "Trường THPT Bình Minh", before: { status: "draft" }, after: { status: "active" }, at: "2026-06-05T10:00:00+07:00" });
  audit({ level: "platform", actorId: "u-bao", action: "Tạm dừng trường", entityType: "school", entityId: "sch-tranphu", entityLabel: "Trường THCS Trần Phú", before: { status: "active" }, after: { status: "suspended" }, reason: "Theo đề nghị của nhà trường", at: "2026-09-21T09:00:00+07:00" });
  audit({ level: "platform", actorId: "u-bao", action: "Lưu trữ trường", entityType: "school", entityId: "sch-kimdong", entityLabel: "Trường Tiểu học Kim Đồng", before: { status: "suspended" }, after: { status: "archived" }, reason: "Kết thúc thí điểm", at: "2026-08-01T09:00:00+07:00" });
  audit({ level: "platform", actorId: "u-bao", action: "Tạo trường (nháp)", entityType: "school", entityId: "sch-chuvanan", entityLabel: "Trường THCS Chu Văn An", at: "2026-10-01T09:50:00+07:00" });
  audit({ level: "platform", actorId: "u-bao", action: "Mời quản trị trường", entityType: "invitation", entityId: "inv-cva-admin", entityLabel: "admin@chu-van-an.edu.test", at: "2026-10-01T10:00:00+07:00" });
  audit({ level: "platform", actorId: "u-linh-op", action: "Đề nghị quyền hỗ trợ tạm thời", entityType: "supportGrant", entityId: "sg-1", entityLabel: "THPT Bình Minh — nhật ký nhập dữ liệu", at: "2026-10-01T11:00:00+07:00" });
  audit({ level: "platform", actorId: "u-bao", action: "Cập nhật cấu hình nền tảng", entityType: "platformSettings", entityId: "platform", entityLabel: "Liên hệ hỗ trợ", before: { supportPhone: "cũ" }, after: { supportPhone: "1900 xx xx 68 (mẫu)" }, at: "2026-10-03T16:00:00+07:00" });
  audit({ level: "school", schoolId: SCHOOL_A, actorId: "u-hanh", action: "Tạo năm học", entityType: "year", entityId: YEAR_A, entityLabel: "Năm học 2026–2027", at: "2026-08-01T09:00:00+07:00" });
  audit({ level: "school", schoolId: SCHOOL_A, actorId: "u-hanh", action: "Phân công chủ nhiệm", entityType: "assignment", entityId: "as-1", entityLabel: "Cô Trần Thị Lan — chủ nhiệm 10A1", at: "2026-08-15T09:00:00+07:00" });
  audit({ level: "school", schoolId: SCHOOL_A, actorId: "u-hanh", action: "Thu hồi thành viên", entityType: "membership", entityId: "m-a-tai", entityLabel: "Thầy Lê Đức Tài", before: { status: "active" }, after: { status: "revoked" }, reason: "Chuyển công tác", at: "2026-09-15T08:00:00+07:00" });
  audit({ level: "school", schoolId: SCHOOL_A, actorId: "u-hanh", action: "Tạm khóa thành viên", entityType: "membership", entityId: "m-a-huong", entityLabel: "Cô Đặng Thị Hương", before: { status: "active" }, after: { status: "suspended" }, reason: "Nghỉ phép dài hạn", at: "2026-09-20T08:00:00+07:00" });
  audit({ level: "school", schoolId: SCHOOL_A, actorId: "u-hanh", action: "Duyệt chuyển lớp", entityType: "transfer", entityId: "tr-1", entityLabel: "Vũ Tuấn Anh: 10A2 → 10A1", at: "2026-09-18T09:00:00+07:00" });
  audit({ level: "school", schoolId: SCHOOL_A, actorId: "u-lan", action: "Thu hồi link tra cứu", entityType: "parentAccess", entityId: "pa-revoked", entityLabel: "Link cấp cho mẹ em Hoàng Gia Huy", reason: "Link bị chuyển tiếp nhầm", at: "2026-09-28T09:25:00+07:00" });
  audit({ level: "school", schoolId: SCHOOL_A, actorId: "u-lan", action: "Cấp link tra cứu", entityType: "parentAccess", entityId: "pa-huy-new", entityLabel: "Link cấp cho mẹ em Hoàng Gia Huy", at: "2026-09-28T09:30:00+07:00" });
  audit({ level: "school", schoolId: SCHOOL_A, actorId: "u-lan", action: "Chốt và công bố thi đua", entityType: "snapshot", entityId: `snap-${CLASS_A_10A1}-w4-v1`, entityLabel: "10A1 — tuần 4", at: "2026-10-03T11:35:00+07:00" });
  audit({ level: "school", schoolId: SCHOOL_A, actorId: "u-hanh", action: "Ban hành nội quy", entityType: "ruleSet", entityId: "rs-a-2", entityLabel: "Nội quy thi đua 2026–2027 (bản 2)", before: { "Đi muộn": -5 }, after: { "Đi muộn": -3 }, reason: "Áp dụng từ tuần 6", at: "2026-10-01T10:00:00+07:00" });
  audit({ level: "school", schoolId: SCHOOL_A, actorId: "u-hanh", action: "Cho phép hỗ trợ tạm thời", entityType: "supportGrant", entityId: "sg-1", entityLabel: "Nhật ký nhập dữ liệu, cấu trúc lớp — 7 ngày", at: "2026-10-01T14:00:00+07:00" });
  audit({ level: "school", schoolId: SCHOOL_B, actorId: "u-khang", action: "Phân công chủ nhiệm", entityType: "assignment", entityId: "as-b", entityLabel: "Cô Lý Thị Hoa — chủ nhiệm 10A1", at: "2026-08-15T09:00:00+07:00" });

  db.imports.push(
    { id: "imp-1", schoolId: SCHOOL_A, kind: "students", fileName: "danh-sach-10A1.xlsx", status: "completed", createdBy: "u-quan", createdAt: "2026-08-25T09:00:00+07:00", batchId: "BATCH-0825-01", counts: { added: 41, updated: 0, skipped: 0, errors: 0 }, errorRows: [], targetClassId: CLASS_A_10A1 },
    { id: "imp-2", schoolId: SCHOOL_A, kind: "students", fileName: "11A1-bo-sung.csv", status: "completed", createdBy: "u-quan", createdAt: "2026-09-08T14:00:00+07:00", batchId: "BATCH-0908-02", counts: { added: 3, updated: 1, skipped: 1, errors: 2 }, targetClassId: CLASS_A_11A1,
      errorRows: [{ row: 4, message: "Ngày sinh không đúng định dạng dd/MM/yyyy", data: { "Họ và tên": "Nguyễn Hoài Nam", "Ngày sinh": "2010-13-05" } }, { row: 7, message: "Thiếu họ và tên", data: { "Họ và tên": "", "Ngày sinh": "03/03/2010" } }] },
  );
  db.exports.push(
    { id: "ex-1", schoolId: SCHOOL_A, title: "Chuyên cần tháng 9 — toàn trường", reportType: "attendance", format: "xlsx", params: { month: "2026-09" }, status: "ready", createdBy: "u-dung", createdAt: "2026-10-01T08:00:00+07:00", expiresAt: "2026-10-08T08:00:00+07:00", fileName: "chuyen-can-thang-9.xlsx", rowCount: 3 },
    { id: "ex-2", schoolId: SCHOOL_A, title: "Thi đua tuần 4 — khối 10", reportType: "conduct", format: "csv", params: { week: "4" }, status: "cancelled", createdBy: "u-hanh", createdAt: "2026-10-04T09:00:00+07:00", expiresAt: "2026-10-11T09:00:00+07:00", fileName: "thi-dua-tuan-4.csv", rowCount: 0 },
  );
  db.policies.push(
    { schoolId: SCHOOL_A, lockBy: "homeroom", publishBy: "homeroom", requireLeaderApproval: false, weekCloseDay: "monday", defaultParentModules: allModules, attendanceAutoPublish: false, version: 1 },
    { schoolId: SCHOOL_B, lockBy: "homeroom", publishBy: "school_leader", requireLeaderApproval: true, weekCloseDay: "monday", defaultParentModules: allModules, attendanceAutoPublish: false, version: 1 },
  );
  db.settings.push(
    { schoolId: SCHOOL_A, language: "vi", timezone: "Asia/Ho_Chi_Minh", linkDefaultDays: 300, reportHeader: "TRƯỜNG THPT BÌNH MINH (TÊN GIẢ ĐỊNH)", shareTeacherPhone: true, shareTeacherEmail: true, contactHours: "Thứ 2 – Thứ 6 (07:00 – 17:00)", version: 1 },
    { schoolId: SCHOOL_B, language: "vi", timezone: "Asia/Ho_Chi_Minh", linkDefaultDays: 180, reportHeader: "TRƯỜNG THPT AN HÒA (TÊN GIẢ ĐỊNH)", shareTeacherPhone: false, shareTeacherEmail: true, contactHours: "Thứ 2 – Thứ 6 (07:30 – 16:30)", version: 1 },
  );
  return db;
}

export const DEMO_TODAY = "2026-10-05";
