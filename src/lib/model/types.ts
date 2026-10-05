/**
 * EduManage frontend domain model (demo). These are FRONTEND models, not a
 * database schema. All data is synthetic. See docs/frontend-data-contract.md.
 */

export type ID = string;
export type ISODate = string; // yyyy-MM-dd
export type ISODateTime = string; // ISO 8601 with offset

/* ------------------------------ Platform ------------------------------ */
export type SchoolStatus = "draft" | "active" | "suspended" | "archived";

export interface School {
  id: ID;
  slug: string;
  code: string;
  name: string;
  shortName: string;
  level: "THPT" | "THCS" | "Tiểu học";
  province: string;
  address: string;
  publicPhone: string;
  publicEmail: string;
  website?: string;
  accentColor: string;
  motto: string;
  publicIntro: string;
  status: SchoolStatus;
  statusReason?: string;
  createdAt: ISODateTime;
  activatedAt?: ISODateTime;
  onboarding: OnboardingState;
  /** Operational counters for schools that are not fully modelled in the demo. */
  version: number;
}

export interface OnboardingState {
  profileDone: boolean;
  adminAssigned: boolean;
  yearCreated: boolean;
  classesCreated: boolean;
  teachersInvited: boolean;
  studentsImported: boolean;
  homeroomAssigned: boolean;
  rulesPublished: boolean;
}

export interface PlatformSettings {
  brandName: string;
  supportEmail: string;
  supportPhone: string;
  dateFormat: "dd/MM/yyyy";
  timezone: "Asia/Ho_Chi_Minh";
  footerNote: string;
  version: number;
}

/* ------------------------------ Identity ------------------------------ */
export type Honorific = "Thầy" | "Cô";

export interface StaffUser {
  id: ID;
  fullName: string;
  honorific?: Honorific;
  email: string;
  workPhone: string; // masked demo number
  avatarTone: "blue" | "green" | "amber" | "pink" | "purple";
  isPlatformOperator?: boolean;
  bio?: string;
  version: number;
}

export type MembershipStatus = "active" | "suspended" | "revoked";

export interface Membership {
  id: ID;
  schoolId: ID;
  userId: ID;
  staffCode: string;
  department: string;
  /** School-level role templates (school_admin, principal, academic_staff). Teachers usually have none. */
  roleTemplateIds: ID[];
  status: MembershipStatus;
  joinedAt: ISODate;
  statusReason?: string;
  version: number;
}

export type InvitationStatus = "pending" | "accepted" | "declined" | "expired" | "revoked";

export interface Invitation {
  id: ID;
  schoolId: ID;
  email: string;
  fullName: string;
  invitedByUserId: ID;
  roleTemplateIds: ID[];
  proposedDuty: string;
  createdAt: ISODateTime;
  expiresAt: ISODateTime;
  status: InvitationStatus;
  existingUserId?: ID;
}

/* ------------------------------ Permissions ------------------------------ */
/** Actions are Vietnamese-labelled in permissions/actions.ts. */
export type ActionKey =
  // school scope
  | "school.view" | "school.profile.edit" | "school.settings.edit"
  | "year.manage" | "class.manage" | "dictionary.manage"
  | "staff.view" | "staff.invite" | "staff.suspend" | "assignment.manage" | "role.manage"
  | "student.view.all" | "student.edit" | "student.transfer" | "guardian.manage.all" | "parentAccess.manage.all"
  | "import.run" | "rules.manage" | "policy.manage" | "timetable.manage"
  | "announcement.school" | "publication.oversee" | "report.school" | "export.run" | "audit.view" | "support.manage"
  // class scope
  | "class.view" | "roster.view" | "student.profile.view" | "guardian.view" | "guardian.edit"
  | "parentAccess.issue" | "attendance.record" | "attendance.publish"
  | "conduct.record" | "conduct.review" | "conduct.lock" | "conduct.publish"
  | "adjustment.request" | "adjustment.approve"
  | "groups.manage" | "seating.manage" | "timetable.edit" | "duty.manage"
  | "activity.manage" | "evidence.manage" | "announcement.class" | "files.manage"
  | "report.class" | "report.export";

export interface RoleTemplate {
  id: ID;
  schoolId: ID;
  key: "school_admin" | "principal" | "academic_staff" | "homeroom" | "subject";
  name: string;
  description: string;
  level: "school" | "class";
  actions: ActionKey[];
  version: number;
  updatedAt: ISODateTime;
}

export type AssignmentKind = "homeroom" | "subject";
export type AssignmentStatus = "active" | "ended" | "revoked";

/** A grant = actions × school × class/subject scope × validity window. */
export interface Assignment {
  id: ID;
  schoolId: ID;
  membershipId: ID;
  kind: AssignmentKind;
  classId: ID;
  subjectId?: ID;
  actions: ActionKey[];
  validFrom: ISODate;
  validTo?: ISODate;
  status: AssignmentStatus;
  createdBy: ID;
  createdAt: ISODateTime;
  revokedAt?: ISODateTime;
  reason?: string;
  version: number;
}

/* ------------------------------ Academic structure ------------------------------ */
export type YearStatus = "draft" | "active" | "archived";

export interface AcademicYear {
  id: ID;
  schoolId: ID;
  label: string; // "2026–2027"
  startDate: ISODate;
  endDate: ISODate;
  status: YearStatus;
  version: number;
}

export interface Term {
  id: ID;
  yearId: ID;
  schoolId: ID;
  name: string;
  startDate: ISODate;
  endDate: ISODate;
  openingDate?: ISODate;
  weekCount: number;
}

export interface Week {
  id: ID;
  schoolId: ID;
  yearId: ID;
  termId: ID;
  index: number;
  startDate: ISODate; // Monday
  endDate: ISODate; // Sunday
  closeDeadline: ISODate;
}

export interface Holiday {
  id: ID;
  schoolId: ID;
  yearId: ID;
  name: string;
  startDate: ISODate;
  endDate: ISODate;
}

export type DictStatus = "active" | "inactive";
export interface Grade { id: ID; schoolId: ID; level: number; name: string; status: DictStatus; }
export interface Subject { id: ID; schoolId: ID; code: string; name: string; status: DictStatus; color: string; }
export interface Room { id: ID; schoolId: ID; code: string; name: string; capacity: number; status: DictStatus; }

export type ClassStatus = "draft" | "active" | "archived";

export interface ClassRoom {
  id: ID;
  schoolId: ID;
  yearId: ID;
  gradeId: ID;
  name: string;
  capacity: number;
  roomId?: ID;
  motto?: string;
  status: ClassStatus;
  createdAt: ISODateTime;
  version: number;
}

/* ------------------------------ Students & families ------------------------------ */
export type StudentStatus = "studying" | "transferred_out" | "left";
export type Gender = "Nam" | "Nữ";

export interface Student {
  id: ID;
  schoolId: ID;
  code: string;
  fullName: string;
  dob: ISODate;
  gender: Gender;
  status: StudentStatus;
  statusDate?: ISODate;
  internalNote?: string;
  avatarTone: "blue" | "green" | "amber" | "pink" | "purple";
  version: number;
  updatedAt: ISODateTime;
  updatedBy?: ID;
}

export interface Enrollment {
  id: ID;
  schoolId: ID;
  studentId: ID;
  classId: ID;
  yearId: ID;
  startDate: ISODate;
  endDate?: ISODate;
  status: "active" | "ended";
  endReason?: string;
}

export interface TransferRequest {
  id: ID;
  schoolId: ID;
  studentId: ID;
  fromClassId: ID;
  toClassId?: ID;
  kind: "transfer" | "leave";
  effectiveDate: ISODate;
  reason: string;
  status: "pending" | "approved" | "rejected";
  requestedBy: ID;
  requestedAt: ISODateTime;
  decidedBy?: ID;
  decidedAt?: ISODateTime;
}

export interface Guardian {
  id: ID;
  schoolId: ID;
  fullName: string;
  phoneMasked: string;
  email?: string;
  note?: string;
  version: number;
}

export type VerificationStatus = "unverified" | "verified" | "revoked";

export interface GuardianRelationship {
  id: ID;
  schoolId: ID;
  guardianId: ID;
  studentId: ID;
  relation: "Mẹ" | "Bố" | "Ông" | "Bà" | "Người giám hộ khác";
  isPrimaryContact: boolean;
  verification: VerificationStatus;
  verifiedBy?: ID;
  verifiedAt?: ISODateTime;
  verificationNote?: string;
  revokedReason?: string;
}

export type ParentModule = "attendance" | "conduct" | "timetable" | "duties" | "activities" | "announcements" | "teachers" | "documents";

export interface ParentAccess {
  id: ID;
  schoolId: ID;
  studentId: ID;
  relationshipId: ID;
  yearId: ID;
  token: string; // demo token only — NOT a production security token
  modules: ParentModule[];
  issuedAt: ISODateTime;
  issuedBy: ID;
  expiresAt: ISODateTime;
  revokedAt?: ISODateTime;
  revokedBy?: ID;
  revokeReason?: string;
  replacedById?: ID;
}

export interface ParentAccessLog {
  id: ID;
  accessId: ID;
  schoolId: ID;
  at: ISODateTime;
  event: "issued" | "opened" | "viewed" | "blocked" | "revoked" | "reissued";
  module?: ParentModule | "overview";
  device?: string; // sample label, demo only
  note?: string;
}

/* ------------------------------ Class organisation ------------------------------ */
export interface ClassGroup { id: ID; classId: ID; name: string; order: number; }

export interface GroupMembership {
  id: ID;
  classId: ID;
  groupId: ID;
  studentId: ID;
  validFrom: ISODate;
  validTo?: ISODate;
}

export type StudentPositionKey = "class_monitor" | "secretary" | "vice_study" | "vice_labor" | "group_leader";

export interface StudentPosition {
  id: ID;
  classId: ID;
  studentId: ID;
  position: StudentPositionKey;
  groupId?: ID;
  validFrom: ISODate;
  validTo?: ISODate;
}

export interface SeatingPlan {
  id: ID;
  classId: ID;
  version: number;
  rows: number;
  cols: number;
  effectiveDate: ISODate;
  status: "draft" | "active" | "superseded";
  seats: { seat: string; studentId: ID | null }[]; // seat = "r{row}c{col}"
  createdBy: ID;
  createdAt: ISODateTime;
  note?: string;
}

/* ------------------------------ Timetable & duties ------------------------------ */
export interface Lesson {
  id: ID;
  schoolId: ID;
  yearId: ID;
  classId: ID;
  weekday: number; // 1 = Thứ 2 … 6 = Thứ 7
  period: number; // 1..8
  subjectId: ID;
  teacherMembershipId?: ID;
  roomId?: ID;
  validFrom: ISODate;
  validTo?: ISODate;
  status: "published" | "draft";
}

export interface LessonChange {
  id: ID;
  schoolId: ID;
  classId: ID;
  date: ISODate;
  period: number;
  kind: "swap" | "cancel" | "substitute" | "room";
  subjectId?: ID;
  teacherMembershipId?: ID;
  roomId?: ID;
  reason: string;
  status: "draft" | "published";
  createdBy: ID;
  createdAt: ISODateTime;
}

export interface Duty {
  id: ID;
  classId: ID;
  date: ISODate;
  task: string;
  groupId?: ID;
  studentIds: ID[];
  status: "draft" | "published";
  createdBy: ID;
}

/* ------------------------------ Attendance ------------------------------ */
export type AttendanceStatus = "unmarked" | "present" | "late" | "excused" | "unexcused";

export interface AttendanceSession {
  id: ID;
  schoolId: ID;
  classId: ID;
  date: ISODate;
  slot: "morning" | "afternoon" | `period-${number}`;
  subjectId?: ID; // period session of a subject teacher
  status: "open" | "saved" | "published";
  version: number;
  updatedAt: ISODateTime;
  updatedBy?: ID;
  publishedAt?: ISODateTime;
}

export interface AttendanceRecord {
  id: ID;
  sessionId: ID;
  classId: ID;
  studentId: ID;
  date: ISODate;
  status: AttendanceStatus;
  note?: string;
  /** Source event key shared with conduct records to prevent double counting. */
  sourceEventKey?: string;
  history: { at: ISODateTime; by: ID; from: AttendanceStatus; to: AttendanceStatus; reason?: string }[];
}

/* ------------------------------ Conduct ------------------------------ */
export interface ConductRule {
  id: ID;
  code: string;
  label: string;
  points: number; // signed
  category: "Chuyên cần" | "Nề nếp" | "Học tập" | "Phong trào";
  icon: string;
  attendanceLink?: "late" | "unexcused";
  shareWithParent: boolean;
}

export interface GradeBand { min: number; label: string; tone: "success" | "info" | "warning" | "danger"; }

export interface RuleSet {
  id: ID;
  schoolId: ID;
  name: string;
  versionNo: number;
  status: "draft" | "published" | "retired";
  effectiveFrom: ISODate;
  effectiveTo?: ISODate;
  baseScore: number;
  cap?: number;
  floor?: number;
  rules: ConductRule[];
  bands: GradeBand[];
  entryDeadlineDays: number;
  createdBy: ID;
  publishedAt?: ISODateTime;
  version: number;
}

export type ConductRecordStatus = "pending_review" | "approved" | "rejected" | "void";

export interface ConductRecord {
  id: ID;
  schoolId: ID;
  classId: ID;
  studentId: ID;
  weekId: ID;
  date: ISODate;
  ruleSetId: ID;
  ruleId: ID;
  points: number;
  reason: string;
  sourceEventKey?: string;
  linkedAttendanceRecordId?: ID;
  createdBy: ID;
  createdAt: ISODateTime;
  status: ConductRecordStatus;
  reviewNote?: string;
  version: number;
}

export type PeriodStatus = "open" | "locked" | "published";

export interface ConductPeriod {
  id: ID;
  schoolId: ID;
  classId: ID;
  weekId: ID;
  status: PeriodStatus;
  lockedAt?: ISODateTime;
  lockedBy?: ID;
  currentSnapshotId?: ID;
  version: number;
}

export interface SnapshotRow {
  studentId: ID;
  studentName: string;
  studentCode: string;
  base: number;
  plus: number;
  minus: number;
  total: number;
  grade: string;
  items: { recordId: ID; date: ISODate; label: string; points: number; shareWithParent: boolean }[];
}

export interface PublishedSnapshot {
  id: ID;
  schoolId: ID;
  classId: ID;
  weekId: ID;
  kind: "conduct_week";
  versionNo: number;
  ruleSetId: ID;
  ruleSetVersionNo: number;
  ruleSetName: string;
  lockedAt: ISODateTime;
  lockedBy: ID;
  publishedAt?: ISODateTime;
  publishedBy?: ID;
  status: "locked" | "published" | "superseded" | "withdrawn";
  supersedesId?: ID;
  adjustmentNote?: string;
  rows: SnapshotRow[];
}

export interface AdjustmentRequest {
  id: ID;
  schoolId: ID;
  classId: ID;
  snapshotId: ID;
  studentId: ID;
  recordId?: ID;
  kind: "remove_record" | "change_points" | "add_record";
  newPoints?: number;
  ruleId?: ID;
  beforeTotal: number;
  afterTotal: number;
  reason: string;
  status: "pending" | "approved" | "rejected" | "published";
  requestedBy: ID;
  requestedAt: ISODateTime;
  decidedBy?: ID;
  decidedAt?: ISODateTime;
  decisionNote?: string;
  resultSnapshotId?: ID;
}

/* ------------------------------ Activities & files ------------------------------ */
export interface Activity {
  id: ID;
  schoolId: ID;
  classId: ID;
  title: string;
  description: string;
  illustration: "trophy" | "stem" | "clean" | "book" | "heart";
  dueDate: ISODate;
  startsAt?: ISODateTime | null;
  maxFiles?: number;
  assignedStudentIds: ID[];
  assignedGroupId?: ID;
  evidenceRequired: boolean;
  status: "draft" | "active" | "closed";
  publishedToParents: boolean;
  createdBy: ID;
  createdAt: ISODateTime;
  version: number;
  dataVersion?: number;
  publicationId?: string | null;
  canPublish?: boolean;
}

export type SubmissionStatus = "not_received" | "received" | "pending_review" | "approved" | "needs_supplement";

export interface ActivitySubmission {
  id: ID;
  activityId: ID;
  studentId: ID;
  status: SubmissionStatus;
  updatedAt: ISODateTime;
  updatedBy?: ID;
  note?: string;
}

export interface Evidence {
  id: ID;
  schoolId: ID;
  classId: ID;
  activityId: ID;
  studentId: ID;
  fileId: ID;
  uploadedBy: ID; // always staff in core scope
  uploadedAt: ISODateTime;
  status: "pending" | "approved" | "rejected" | "supplement";
  reviewNote?: string;
  sharedWithParent: boolean;
  version?: number;
}

export type FileShare = "internal" | "class_parents" | "student_parent";

export interface FileAsset {
  id: ID;
  schoolId: ID;
  classId?: ID;
  studentId?: ID;
  name: string;
  mime: string;
  size: number;
  /** Seed files render from a synthetic generator; uploads keep a Blob in IndexedDB. */
  source: { kind: "synthetic"; pattern: string } | { kind: "blob"; blobKey: string } | { kind: "staff_api"; schoolId: string; fileId: string; owner: {assertCurrent: () => void} };
  version?: number;
  ownerId: ID;
  share: FileShare;
  category: "evidence" | "document" | "announcement" | "report";
  status: "active" | "archived" | "revoked" | "processing" | "rejected";
  createdAt: ISODateTime;
}

/* ------------------------------ Announcements & notifications ------------------------------ */
export interface AnnouncementScope {
  type: "school" | "grade" | "class" | "student";
  gradeIds?: ID[];
  classIds?: ID[];
  studentIds?: ID[];
}

export interface Announcement {
  id: ID;
  schoolId: ID;
  origin: "school" | "class";
  originClassId?: ID;
  title: string;
  summary: string;
  body: { type: "p" | "h" | "li"; text: string }[];
  audience: "staff" | "families" | "all";
  scope: AnnouncementScope;
  isPublic: boolean;
  attachmentIds: ID[];
  status: "draft" | "scheduled" | "published" | "withdrawn";
  scheduledAt?: ISODateTime;
  publishedAt?: ISODateTime;
  withdrawnAt?: ISODateTime;
  withdrawReason?: string;
  createdBy: ID;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  internalNote?: string;
  history: { at: ISODateTime; by: ID; action: string }[];
  version: number;
}

export interface StaffNotification {
  id: ID;
  schoolId: ID;
  userId: ID;
  kind: "task" | "announcement" | "system" | "permission";
  title: string;
  body: string;
  href?: string;
  createdAt: ISODateTime;
  readAt?: ISODateTime;
}

/* ------------------------------ Support, audit, jobs ------------------------------ */
export interface SupportTicket {
  id: ID;
  schoolId: ID;
  title: string;
  body: string;
  priority: "low" | "normal" | "high";
  status: "open" | "in_progress" | "waiting_school" | "resolved";
  createdBy: ID;
  createdAt: ISODateTime;
  assigneeUserId?: ID;
  updates: { at: ISODateTime; by: ID; text: string; side: "platform" | "school" }[];
}

export type SupportScope = "school_config" | "class_structure" | "staff_directory" | "import_logs";

export interface SupportGrant {
  id: ID;
  schoolId: ID;
  ticketId?: ID;
  scopes: SupportScope[];
  reason: string;
  requestedBy: ID; // platform operator
  approvedBy?: ID; // school admin
  validFrom?: ISODateTime;
  validTo: ISODateTime;
  status: "requested" | "active" | "revoked" | "expired" | "declined";
  revokedAt?: ISODateTime;
}

export interface AuditEvent {
  id: ID;
  level: "platform" | "school";
  schoolId?: ID;
  actorId: ID;
  action: string;
  entityType: string;
  entityId: ID;
  entityLabel: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  reason?: string;
  at: ISODateTime;
}

export interface ImportJob {
  id: ID;
  schoolId: ID;
  kind: "students" | "teachers" | "classes" | "timetable";
  fileName: string;
  status: "completed" | "failed";
  createdBy: ID;
  createdAt: ISODateTime;
  batchId: string;
  counts: { added: number; updated: number; skipped: number; errors: number };
  errorRows: { row: number; message: string; data: Record<string, string> }[];
  targetClassId?: ID;
}

export interface ExportJob {
  id: ID;
  schoolId: ID;
  title: string;
  reportType: string;
  format: "csv" | "xlsx" | "print";
  params: Record<string, string>;
  status: "running" | "ready" | "cancelled";
  createdBy: ID;
  createdAt: ISODateTime;
  expiresAt: ISODateTime;
  fileName: string;
  rowCount: number;
}

export interface PublicationPolicy {
  schoolId: ID;
  lockBy: "homeroom" | "school_leader";
  publishBy: "homeroom" | "school_leader";
  requireLeaderApproval: boolean;
  weekCloseDay: "sunday" | "monday";
  defaultParentModules: ParentModule[];
  attendanceAutoPublish: boolean;
  version: number;
}

export interface SchoolSettings {
  weeklyDeadlineDay?: number;weeklySubmitTime?: string;weeklyLockTime?: string;
  schoolId: ID;
  language: "vi";
  timezone: "Asia/Ho_Chi_Minh";
  linkDefaultDays: number;
  reportHeader: string;
  shareTeacherPhone: boolean;
  shareTeacherEmail: boolean;
  contactHours: string;
  version: number;
}

/* ------------------------------ Aggregate store ------------------------------ */
export interface DemoDB {
  meta: { schema: "edumanage-ui-demo-v1"; seededAt: ISODateTime; revision: number };
  platformSettings: PlatformSettings;
  schools: School[];
  users: StaffUser[];
  memberships: Membership[];
  invitations: Invitation[];
  roleTemplates: RoleTemplate[];
  assignments: Assignment[];
  years: AcademicYear[];
  terms: Term[];
  weeks: Week[];
  holidays: Holiday[];
  grades: Grade[];
  subjects: Subject[];
  rooms: Room[];
  classes: ClassRoom[];
  students: Student[];
  enrollments: Enrollment[];
  transfers: TransferRequest[];
  guardians: Guardian[];
  relationships: GuardianRelationship[];
  parentAccesses: ParentAccess[];
  parentAccessLogs: ParentAccessLog[];
  groups: ClassGroup[];
  groupMemberships: GroupMembership[];
  positions: StudentPosition[];
  seatingPlans: SeatingPlan[];
  lessons: Lesson[];
  lessonChanges: LessonChange[];
  duties: Duty[];
  attendanceSessions: AttendanceSession[];
  attendanceRecords: AttendanceRecord[];
  ruleSets: RuleSet[];
  conductRecords: ConductRecord[];
  conductPeriods: ConductPeriod[];
  snapshots: PublishedSnapshot[];
  adjustments: AdjustmentRequest[];
  activities: Activity[];
  submissions: ActivitySubmission[];
  evidence: Evidence[];
  files: FileAsset[];
  announcements: Announcement[];
  notifications: StaffNotification[];
  tickets: SupportTicket[];
  supportGrants: SupportGrant[];
  audit: AuditEvent[];
  imports: ImportJob[];
  exports: ExportJob[];
  policies: PublicationPolicy[];
  settings: SchoolSettings[];
}
