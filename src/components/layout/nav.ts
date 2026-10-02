import type { ActionKey, ParentModule } from "@/lib/model/types";

export interface NavLink { label: string; href: string; icon: string; need?: ActionKey[]; exact?: boolean; badge?: number; tour?:string }
export interface NavGroup { label: string; icon: string; children: NavLink[]; href?: string; tour?:string }
export type NavEntry = NavLink | NavGroup;

export const isGroup = (e: NavEntry): e is NavGroup => "children" in e;

/** PlatformShell — no student/family/payment menus. */
export function platformNav(): NavEntry[] {
  return [
    { label: "Tổng quan", href: "/platform", icon: "home", exact: true },
    { label: "Trường học", icon: "school", tour:'platform-schools', children: [
      { label: "Danh sách trường", href: "/platform/schools", icon: "list" },
      { label: "Tạo trường", href: "/platform/schools/new", icon: "plus" },
    ] },
    { label: "Hỗ trợ", icon: "lifebuoy", tour:'platform-support', children: [
      { label: "Yêu cầu hỗ trợ", href: "/platform/support", icon: "inbox" },
      { label: "Quyền hỗ trợ tạm thời", href: "/platform/support-access", icon: "key" },
    ] },
    { label: "Vận hành", href: "/platform/operations", icon: "activity",tour:'platform-operations' },
    { label: "Nhật ký", href: "/platform/audit", icon: "scroll" },
    { label: "Cấu hình", href: "/platform/settings", icon: "settings",tour:'platform-settings' },
  ];
}

/** SchoolShell — entries appear only when the actor holds the matching school-level action. */
export function schoolNav(schoolId: string): NavEntry[] {
  const b = `/school/${schoolId}`;
  return [
    { label: "Tổng quan", href: b, icon: "home", exact: true, need: ["school.view"] },
    { label: "Năm học & lớp học", icon: "calendar",tour:'school-classes', children: [
      { label: "Năm học", href: `${b}/academic-years`, icon: "calendar", need: ["school.view"] },
      { label: "Danh sách lớp", href: `${b}/classes`, icon: "layers", need: ["school.view"] },
      { label: "Lịch toàn trường", href: `${b}/timetable`, icon: "table", need: ["school.view"] },
      { label: "Danh mục khối, môn, phòng", href: `${b}/dictionaries`, icon: "book", need: ["school.view"] },
    ] },
    { label: "Giáo viên & phân công", icon: "users",tour:'school-teachers', children: [
      { label: "Giáo viên", href: `${b}/teachers`, icon: "users", need: ["staff.view"] },
      { label: "Ma trận phân công", href: `${b}/assignments`, icon: "grid", need: ["staff.view"] },
      { label: "Mẫu quyền", href: `${b}/roles`, icon: "shield", need: ["staff.view"] },
      { label: "Bàn giao chủ nhiệm", href: `${b}/handovers`, icon: "swap", need: ["assignment.manage"] },
    ] },
    { label: "Học sinh & gia đình", icon: "graduation",tour:'school-students', children: [
      { label: "Học sinh", href: `${b}/students`, icon: "graduation", need: ["student.view.all"] },
      { label: "Chuyển lớp", href: `${b}/transfers`, icon: "swap", need: ["student.transfer", "student.view.all"] },
      { label: "Người giám hộ", href: `${b}/guardians`, icon: "family", need: ["guardian.manage.all"] },
      { label: "Quyền tra cứu", href: `${b}/parent-access`, icon: "link", need: ["parentAccess.manage.all"] },
      { label: "Nhập dữ liệu", href: `${b}/imports`, icon: "upload", need: ["import.run"] },
    ] },
    { label: "Nội quy & công bố", icon: "clipboard",tour:'school-publication', children: [
      { label: "Nội quy thi đua", href: `${b}/conduct-rules`, icon: "clipboard", need: ["school.view"] },
      { label: "Quy trình chốt, công bố", href: `${b}/publication-policy`, icon: "workflow", need: ["school.view"] },
      { label: "Rà soát & công bố", href: `${b}/publications`, icon: "check", need: ["publication.oversee"] },
    ] },
    { label: "Thông báo", href: `${b}/announcements`, icon: "megaphone", need: ["school.view"] },
    { label: "Báo cáo", icon: "chart",tour:'school-reports', children: [
      { label: "Báo cáo", href: `${b}/reports`, icon: "chart", need: ["report.school"] },
      { label: "Bản xuất dữ liệu", href: `${b}/exports`, icon: "download", need: ["export.run", "report.school"] },
      { label: "Nhật ký nhà trường", href: `${b}/audit`, icon: "scroll", need: ["audit.view"] },
    ] },
    { label: "Cài đặt", icon: "settings", children: [
      { label: "Thông tin trường", href: `${b}/profile`, icon: "school", need: ["school.view"] },
      { label: "Hiển thị và chia sẻ", href: `${b}/settings`, icon: "settings", need: ["school.view"] },
      { label: "Hỗ trợ", href: `${b}/support`, icon: "lifebuoy", need: ["support.manage"] },
    ] },
  ];
}

export function teacherNav(schoolId: string, classes: { id: string; yearId: string; name: string; role: string }[]): NavEntry[] {
  const b = `/teacher/${schoolId}`;
  return [
    { label: "Việc hôm nay", href: b, icon: "home", exact: true },
    { label: "Lớp học của tôi", icon: "users",tour:'teacher-my-classes', href: `${b}/classes`, children: [
      { label: "Tất cả lớp được giao", href: `${b}/classes`, icon: "layers", exact: true },
      ...classes.map((c) => ({ label: `${c.name} · ${c.role}`, href: `/classroom/${schoolId}/${c.yearId}/${c.id}`, icon: "class" })),
    ] },
    { label: "Lịch dạy", href: `${b}/schedule`, icon: "calendar",tour:'teacher-schedule' },
    { label: "Việc cần xử lý", href: `${b}/tasks`, icon: "checklist",tour:'teacher-tasks-nav' },
    { label: "Thông báo", href: `${b}/announcements`, icon: "megaphone",tour:'teacher-announcements' },
    { label: "Báo cáo được phép", href: `${b}/reports`, icon: "chart" },
  ];
}

export const PARENT_NAV: { label: string; href: string; icon: string; module?: ParentModule }[] = [
  { label: "Trang chủ", href: "overview", icon: "home" },
  { label: "Chuyên cần", href: "attendance", icon: "calendarCheck", module: "attendance" },
  { label: "Thi đua", href: "conduct", icon: "star", module: "conduct" },
  { label: "Lịch học", href: "timetable", icon: "calendar", module: "timetable" },
  { label: "Trực nhật", href: "duties", icon: "broom", module: "duties" },
  { label: "Hoạt động", href: "activities", icon: "users", module: "activities" },
  { label: "Thông báo", href: "announcements", icon: "bell", module: "announcements" },
  { label: "Giáo viên liên hệ", href: "teachers", icon: "contact", module: "teachers" },
  { label: "Tài liệu", href: "documents", icon: "file", module: "documents" },
];

export function accountNav(): NavEntry[] {
  return [
    { label: "Chọn không gian", href: "/choose-school", icon: "school" },
    { label: "Thông báo của tôi", href: "/notifications", icon: "bell" },
    { label: "Hồ sơ cá nhân", href: "/account/profile", icon: "user" },
    { label: "Bảo mật và phiên", href: "/account/security", icon: "shield" },
    { label: "Hướng dẫn sử dụng", href: "/help", icon: "book" },
  ];
}
