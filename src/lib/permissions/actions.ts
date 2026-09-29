import type { ActionKey, RoleTemplate } from "@/lib/model/types";

/** Vietnamese labels. Technical keys only appear in "chi tiết kỹ thuật". */
export const ACTION_LABELS: Record<ActionKey, { label: string; group: string; level: "school" | "class" }> = {
  "school.view": { label: "Xem không gian nhà trường", group: "Nhà trường", level: "school" },
  "school.profile.edit": { label: "Sửa thông tin và nhận diện trường", group: "Nhà trường", level: "school" },
  "school.settings.edit": { label: "Sửa cài đặt hiển thị và chia sẻ", group: "Nhà trường", level: "school" },
  "year.manage": { label: "Quản lý năm học, học kỳ, tuần", group: "Năm học & lớp", level: "school" },
  "class.manage": { label: "Tạo và sửa lớp", group: "Năm học & lớp", level: "school" },
  "dictionary.manage": { label: "Quản lý danh mục khối, môn, phòng", group: "Năm học & lớp", level: "school" },
  "staff.view": { label: "Xem danh sách nhân sự", group: "Giáo viên & phân công", level: "school" },
  "staff.invite": { label: "Mời giáo viên, nhân sự", group: "Giáo viên & phân công", level: "school" },
  "staff.suspend": { label: "Khóa / thu hồi thành viên trường", group: "Giáo viên & phân công", level: "school" },
  "assignment.manage": { label: "Phân công chủ nhiệm, bộ môn", group: "Giáo viên & phân công", level: "school" },
  "role.manage": { label: "Chỉnh mẫu quyền", group: "Giáo viên & phân công", level: "school" },
  "student.view.all": { label: "Xem hồ sơ học sinh toàn trường", group: "Học sinh & gia đình", level: "school" },
  "student.edit": { label: "Thêm, sửa hồ sơ học sinh", group: "Học sinh & gia đình", level: "school" },
  "student.transfer": { label: "Duyệt chuyển lớp, ngừng theo học", group: "Học sinh & gia đình", level: "school" },
  "guardian.manage.all": { label: "Quản lý người giám hộ toàn trường", group: "Học sinh & gia đình", level: "school" },
  "parentAccess.manage.all": { label: "Quản lý link tra cứu toàn trường", group: "Học sinh & gia đình", level: "school" },
  "import.run": { label: "Nhập dữ liệu từ tệp", group: "Học sinh & gia đình", level: "school" },
  "rules.manage": { label: "Ban hành nội quy thi đua", group: "Nội quy & công bố", level: "school" },
  "policy.manage": { label: "Cấu hình quy trình chốt, công bố", group: "Nội quy & công bố", level: "school" },
  "timetable.manage": { label: "Quản lý lịch toàn trường", group: "Lịch", level: "school" },
  "announcement.school": { label: "Soạn, công bố thông báo nhà trường", group: "Thông báo", level: "school" },
  "publication.oversee": { label: "Theo dõi rà soát, công bố các lớp", group: "Nội quy & công bố", level: "school" },
  "report.school": { label: "Xem báo cáo toàn trường", group: "Báo cáo", level: "school" },
  "export.run": { label: "Xuất dữ liệu báo cáo", group: "Báo cáo", level: "school" },
  "audit.view": { label: "Xem nhật ký nhà trường", group: "Báo cáo", level: "school" },
  "support.manage": { label: "Yêu cầu và ủy quyền hỗ trợ", group: "Nhà trường", level: "school" },

  "class.view": { label: "Mở không gian lớp", group: "Lớp học", level: "class" },
  "roster.view": { label: "Xem danh sách học sinh", group: "Lớp học", level: "class" },
  "student.profile.view": { label: "Xem hồ sơ học sinh của lớp", group: "Học sinh", level: "class" },
  "guardian.view": { label: "Xem người giám hộ", group: "Học sinh", level: "class" },
  "guardian.edit": { label: "Cập nhật, xác minh người giám hộ", group: "Học sinh", level: "class" },
  "parentAccess.issue": { label: "Cấp / thu hồi link tra cứu", group: "Học sinh", level: "class" },
  "attendance.record": { label: "Nhập điểm danh", group: "Chuyên cần", level: "class" },
  "attendance.publish": { label: "Công bố chuyên cần", group: "Chuyên cần", level: "class" },
  "conduct.record": { label: "Ghi nhận thi đua", group: "Thi đua", level: "class" },
  "conduct.review": { label: "Rà soát ghi nhận thi đua", group: "Thi đua", level: "class" },
  "conduct.lock": { label: "Chốt thi đua tuần", group: "Thi đua", level: "class" },
  "conduct.publish": { label: "Công bố thi đua", group: "Thi đua", level: "class" },
  "adjustment.request": { label: "Đề nghị điều chỉnh sau chốt", group: "Thi đua", level: "class" },
  "adjustment.approve": { label: "Duyệt điều chỉnh sau chốt", group: "Thi đua", level: "class" },
  "groups.manage": { label: "Xếp tổ, chức vụ", group: "Tổ chức lớp", level: "class" },
  "seating.manage": { label: "Cập nhật sơ đồ lớp", group: "Tổ chức lớp", level: "class" },
  "timetable.edit": { label: "Đổi tiết, lịch lớp", group: "Tổ chức lớp", level: "class" },
  "duty.manage": { label: "Phân công trực nhật", group: "Tổ chức lớp", level: "class" },
  "activity.manage": { label: "Tạo, quản lý hoạt động", group: "Hoạt động", level: "class" },
  "evidence.manage": { label: "Ghi nhận, duyệt minh chứng", group: "Hoạt động", level: "class" },
  "announcement.class": { label: "Soạn, công bố thông báo lớp", group: "Thông báo", level: "class" },
  "files.manage": { label: "Quản lý tệp lớp", group: "Hoạt động", level: "class" },
  "report.class": { label: "Xem báo cáo lớp", group: "Báo cáo", level: "class" },
  "report.export": { label: "Xuất báo cáo lớp", group: "Báo cáo", level: "class" },
};

export const HOMEROOM_ACTIONS: ActionKey[] = [
  "class.view", "roster.view", "student.profile.view", "guardian.view", "guardian.edit", "parentAccess.issue",
  "attendance.record", "attendance.publish", "conduct.record", "conduct.review", "conduct.lock", "conduct.publish",
  "adjustment.request", "groups.manage", "seating.manage", "timetable.edit", "duty.manage", "activity.manage",
  "evidence.manage", "announcement.class", "files.manage", "report.class", "report.export",
];

/** Subject teachers: teaching needs only — no guardians, seating, lock or parent links by default. */
export const SUBJECT_ACTIONS: ActionKey[] = [
  "class.view", "roster.view", "attendance.record", "conduct.record", "activity.manage", "evidence.manage", "report.class",
];

/** Class-level actions granted school-wide through school role templates. */
export const SCHOOL_CLASS_OVERSIGHT: ActionKey[] = [
  "class.view", "roster.view", "student.profile.view", "guardian.view", "report.class", "report.export",
];

export function buildRoleTemplates(schoolId: string, updatedAt: string): RoleTemplate[] {
  const adminSchool: ActionKey[] = [
    "school.view", "school.profile.edit", "school.settings.edit", "year.manage", "class.manage", "dictionary.manage",
    "staff.view", "staff.invite", "staff.suspend", "assignment.manage", "role.manage", "student.view.all", "student.edit",
    "student.transfer", "guardian.manage.all", "parentAccess.manage.all", "import.run", "rules.manage", "policy.manage",
    "timetable.manage", "announcement.school", "publication.oversee", "report.school", "export.run", "audit.view", "support.manage",
    ...SCHOOL_CLASS_OVERSIGHT, "guardian.edit", "parentAccess.issue", "adjustment.approve", "timetable.edit",
  ];
  const principal: ActionKey[] = [
    "school.view", "staff.view", "student.view.all", "publication.oversee", "report.school", "export.run", "audit.view",
    "announcement.school", ...SCHOOL_CLASS_OVERSIGHT, "adjustment.approve",
  ];
  const academic: ActionKey[] = [
    "school.view", "staff.view", "student.view.all", "student.edit", "student.transfer", "guardian.manage.all",
    "import.run", "timetable.manage", "dictionary.manage", "report.school", ...SCHOOL_CLASS_OVERSIGHT, "guardian.edit", "timetable.edit",
  ];
  return [
    { id: `${schoolId}-role-admin`, schoolId, key: "school_admin", name: "Quản trị trường", level: "school",
      description: "Toàn bộ công việc tổ chức của trường: năm học, lớp, nhân sự, phân công, nội quy và cài đặt. Không tự sửa bảng thi đua lớp đã công bố.",
      actions: adminSchool, version: 1, updatedAt },
    { id: `${schoolId}-role-principal`, schoolId, key: "principal", name: "Ban giám hiệu", level: "school",
      description: "Theo dõi tình hình các lớp, xem báo cáo, duyệt điều chỉnh sau chốt và công bố thông báo toàn trường.",
      actions: principal, version: 1, updatedAt },
    { id: `${schoolId}-role-academic`, schoolId, key: "academic_staff", name: "Giáo vụ", level: "school",
      description: "Cập nhật hồ sơ học sinh, xếp lớp, nhập dữ liệu và lịch. Không sửa kết quả thi đua đã chốt.",
      actions: academic, version: 1, updatedAt },
    { id: `${schoolId}-role-homeroom`, schoolId, key: "homeroom", name: "Giáo viên chủ nhiệm", level: "class",
      description: "Áp dụng cho đúng lớp được phân công chủ nhiệm, trong thời gian hiệu lực.",
      actions: HOMEROOM_ACTIONS, version: 1, updatedAt },
    { id: `${schoolId}-role-subject`, schoolId, key: "subject", name: "Giáo viên bộ môn", level: "class",
      description: "Áp dụng cho đúng lớp và môn được phân công. Không mặc định xem giám hộ, sơ đồ hoặc chốt thi đua.",
      actions: SUBJECT_ACTIONS, version: 1, updatedAt },
  ];
}
