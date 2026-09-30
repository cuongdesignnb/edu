-- EduManage: thiết kế mới. Áp dụng qua migration runner, không vào DB hiện có chưa đối chiếu.

-- Các ngày hiệu lực dùng khoảng [bắt đầu, kết thúc), ends_on là ngày không còn hiệu lực.

BEGIN;

CREATE SCHEMA IF NOT EXISTS identity;

CREATE SCHEMA IF NOT EXISTS platform;

CREATE SCHEMA IF NOT EXISTS app;

REVOKE ALL ON SCHEMA identity, platform, app FROM PUBLIC;

CREATE TABLE identity.users (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  email_normalized text NOT NULL,
  display_name text NOT NULL,
  password_hash text,
  status text NOT NULL DEFAULT 'INVITED' CHECK (status IN ('INVITED','ACTIVE','LOCKED')),
  authz_version integer NOT NULL DEFAULT 1,
  password_changed_at timestamptz,
  email_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (email_normalized)
);

COMMENT ON TABLE identity.users IS 'Danh tính nhân sự';

CREATE TABLE identity.staff_sessions (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  token_hash text NOT NULL,
  csrf_hash text NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  idle_expires_at timestamptz NOT NULL,
  absolute_expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  user_agent_summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (token_hash),
  CHECK (idle_expires_at <= absolute_expires_at)
);

COMMENT ON TABLE identity.staff_sessions IS 'Phiên nhân sự';

CREATE TABLE identity.auth_challenges (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  email_normalized text NOT NULL,
  purpose text NOT NULL DEFAULT 'PASSWORD_RESET' CHECK (purpose IN ('PASSWORD_RESET','VERIFY_EMAIL')),
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (token_hash)
);

COMMENT ON TABLE identity.auth_challenges IS 'Xác minh email / khôi phục mật khẩu';

CREATE TABLE identity.parent_sessions (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  access_link_id uuid NOT NULL,
  token_hash text NOT NULL,
  csrf_hash text NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  idle_expires_at timestamptz NOT NULL,
  absolute_expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (token_hash),
  CHECK (idle_expires_at <= absolute_expires_at)
);

COMMENT ON TABLE identity.parent_sessions IS 'Phiên tra cứu không tài khoản';

CREATE TABLE identity.rate_limit_buckets (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  bucket_hash text NOT NULL,
  window_start timestamptz NOT NULL,
  hits integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bucket_hash,window_start),
  CHECK (hits >= 0)
);

COMMENT ON TABLE identity.rate_limit_buckets IS 'Giới hạn tần suất tối thiểu';

CREATE TABLE identity.mail_outbox (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  school_id uuid,
  template_key text NOT NULL,
  encrypted_payload text NOT NULL,
  dedupe_key text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','LEASED','SENT','FAILED','CANCELLED')),
  attempts integer NOT NULL DEFAULT 0,
  run_after timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  lease_owner text,
  sent_at timestamptz,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dedupe_key)
);

COMMENT ON TABLE identity.mail_outbox IS 'Email bảo mật, payload mã hóa';

CREATE TABLE platform.schools (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  code text NOT NULL,
  slug text NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ACTIVE','SUSPENDED','ARCHIVED')),
  timezone text NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
  public_contact_email text,
  public_contact_phone text,
  public_address text,
  logo_object_key text,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (code),
  UNIQUE (slug)
);

COMMENT ON TABLE platform.schools IS 'Không gian trường học';

CREATE TABLE platform.operator_grants (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  action_code text NOT NULL,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_until IS NULL OR valid_until > valid_from)
);

COMMENT ON TABLE platform.operator_grants IS 'Quyền vận hành nền tảng';

CREATE TABLE platform.settings (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  key text NOT NULL,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (key)
);

COMMENT ON TABLE platform.settings IS 'Cấu hình vận hành không chứa secret';

CREATE TABLE platform.support_tickets (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  requester_id uuid NOT NULL,
  assignee_id uuid,
  subject text NOT NULL,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_PROGRESS','RESOLVED','CLOSED')),
  priority text NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('NORMAL','HIGH')),
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE platform.support_tickets IS 'Yêu cầu hỗ trợ';

CREATE TABLE platform.support_messages (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL,
  author_id uuid NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE platform.support_messages IS 'Trao đổi hỗ trợ nội bộ';

CREATE TABLE platform.support_access (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  ticket_id uuid NOT NULL,
  operator_id uuid NOT NULL,
  approved_by_user_id uuid,
  class_id uuid,
  allowed_actions text[] NOT NULL DEFAULT ARRAY[]::text[],
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED','APPROVED','REVOKED','REJECTED')),
  valid_from timestamptz NOT NULL,
  valid_until timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_until > valid_from)
);

COMMENT ON TABLE platform.support_access IS 'Ủy quyền hỗ trợ chỉ đọc, có hạn';

CREATE TABLE platform.audit_events (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  actor_id uuid,
  school_id uuid,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id uuid,
  request_id text NOT NULL,
  redacted_diff jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE platform.audit_events IS 'Nhật ký vận hành, không payload học sinh';

CREATE TABLE platform.operation_runs (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  status text NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','RUNNING','SUCCEEDED','FAILED')),
  started_at timestamptz,
  finished_at timestamptz,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  artifact_checksum text,
  artifact_location_redacted text,
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE platform.operation_runs IS 'Kết quả kiểm tra / backup thực tế';

CREATE TABLE platform.public_school_content (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  announcement_id uuid NOT NULL,
  revision integer NOT NULL,
  title text NOT NULL,
  sanitized_html text NOT NULL,
  published_at timestamptz NOT NULL,
  withdrawn_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,announcement_id,revision)
);

COMMENT ON TABLE platform.public_school_content IS 'Bản tin trường công khai đã duyệt';

CREATE TABLE app.memberships (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  user_id uuid NOT NULL,
  staff_code text,
  work_display_name text NOT NULL,
  department text,
  work_email text,
  work_phone text,
  share_work_contact boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'INVITED' CHECK (status IN ('INVITED','ACTIVE','SUSPENDED','ENDED')),
  joined_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,id),
  UNIQUE (school_id,user_id),
  UNIQUE (school_id,staff_code)
);

COMMENT ON TABLE app.memberships IS 'Thành viên và hồ sơ công tác';

CREATE TABLE app.roles (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  code text NOT NULL,
  label text NOT NULL,
  system_role boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,id),
  UNIQUE (school_id,code)
);

COMMENT ON TABLE app.roles IS 'Mẫu nhiệm vụ tại trường';

CREATE TABLE app.role_permissions (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  role_id uuid NOT NULL,
  action_code text NOT NULL,
  allowed_scopes text[] NOT NULL DEFAULT ARRAY['SCHOOL']::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,id),
  UNIQUE (school_id,role_id,action_code)
);

COMMENT ON TABLE app.role_permissions IS 'Hành động của mẫu quyền';

CREATE TABLE app.role_grants (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  member_id uuid NOT NULL,
  role_id uuid NOT NULL,
  scope_type text NOT NULL DEFAULT 'SCHOOL' CHECK (scope_type IN ('SCHOOL','CLASS','SUBJECT')),
  class_id uuid,
  subject_id uuid,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  revoked_at timestamptz,
  granted_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,id),
  CHECK ((scope_type='SCHOOL' AND class_id IS NULL AND subject_id IS NULL) OR (scope_type='CLASS' AND class_id IS NOT NULL AND subject_id IS NULL) OR (scope_type='SUBJECT' AND class_id IS NOT NULL AND subject_id IS NOT NULL)),
  CHECK (valid_until IS NULL OR valid_until > valid_from)
);

COMMENT ON TABLE app.role_grants IS 'Giao quyền đúng phạm vi và thời gian';

CREATE TABLE app.staff_invitations (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  email_normalized text NOT NULL,
  token_hash text NOT NULL,
  proposed_assignments jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACCEPTED','DECLINED','REVOKED')),
  expires_at timestamptz NOT NULL,
  invited_by uuid NOT NULL,
  accepted_at timestamptz,
  accepted_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,id),
  UNIQUE (school_id,token_hash)
);

COMMENT ON TABLE app.staff_invitations IS 'Lời mời nhân sự không đăng ký tự do';

CREATE TABLE app.grade_levels (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,id),
  UNIQUE (school_id,code)
);

COMMENT ON TABLE app.grade_levels IS 'Khối học';

CREATE TABLE app.subjects (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,id),
  UNIQUE (school_id,code)
);

COMMENT ON TABLE app.subjects IS 'Môn học';

CREATE TABLE app.rooms (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  capacity integer,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,id),
  UNIQUE (school_id,code)
);

COMMENT ON TABLE app.rooms IS 'Phòng học';

CREATE TABLE app.academic_years (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ACTIVE','ARCHIVED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,id),
  UNIQUE (school_id,code),
  CHECK (ends_on > starts_on)
);

COMMENT ON TABLE app.academic_years IS 'Năm học độc lập';

CREATE TABLE app.terms (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  year_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,id),
  UNIQUE (school_id,year_id,code),
  UNIQUE (school_id,id,year_id),
  CHECK (ends_on > starts_on)
);

COMMENT ON TABLE app.terms IS 'Học kỳ';

CREATE TABLE app.school_weeks (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  year_id uuid NOT NULL,
  term_id uuid NOT NULL,
  week_number integer NOT NULL,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  input_deadline timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,id),
  UNIQUE (school_id,year_id,week_number),
  UNIQUE (school_id,id,year_id),
  CHECK (ends_on > starts_on),
  CHECK (week_number > 0)
);

COMMENT ON TABLE app.school_weeks IS 'Tuần học và hạn nhập';

CREATE TABLE app.classes (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  year_id uuid NOT NULL,
  grade_level_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  capacity integer NOT NULL DEFAULT 45,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ACTIVE','ARCHIVED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,id),
  UNIQUE (school_id,year_id,code),
  UNIQUE (school_id,id,year_id),
  CHECK (capacity > 0)
);

COMMENT ON TABLE app.classes IS 'Lớp của một năm học';

CREATE TABLE app.calendar_events (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  year_id uuid NOT NULL,
  class_id uuid,
  title text NOT NULL,
  kind text NOT NULL DEFAULT 'HOLIDAY' CHECK (kind IN ('HOLIDAY','EVENT','DEADLINE')),
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PUBLISHED','WITHDRAWN')),
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,id),
  CHECK (ends_on > starts_on)
);

COMMENT ON TABLE app.calendar_events IS 'Ngày nghỉ / mốc công việc';

CREATE TABLE app.teaching_assignments (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  class_id uuid NOT NULL,
  member_id uuid NOT NULL,
  role_grant_id uuid NOT NULL,
  subject_id uuid,
  kind text NOT NULL DEFAULT 'HOMEROOM' CHECK (kind IN ('HOMEROOM','SUBJECT')),
  starts_on date NOT NULL,
  ends_on date,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,id),
  UNIQUE (school_id,role_grant_id),
  CHECK ((kind='HOMEROOM' AND subject_id IS NULL) OR (kind='SUBJECT' AND subject_id IS NOT NULL)),
  CHECK (ends_on IS NULL OR ends_on > starts_on)
);

COMMENT ON TABLE app.teaching_assignments IS 'Phân công chủ nhiệm / bộ môn';

CREATE TABLE app.students (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  student_code text NOT NULL,
  full_name text NOT NULL,
  date_of_birth date,
  preferred_name text,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','LEFT','GRADUATED','ARCHIVED')),
  internal_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,id),
  UNIQUE (school_id,student_code)
);

COMMENT ON TABLE app.students IS 'Hồ sơ học sinh tối thiểu';

CREATE TABLE app.enrollments (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  student_id uuid NOT NULL,
  class_id uuid NOT NULL,
  year_id uuid NOT NULL,
  starts_on date NOT NULL,
  ends_on date,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ENDED','CANCELLED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,id),
  UNIQUE (school_id,id,class_id),
  UNIQUE (school_id,id,student_id,year_id),
  CHECK (ends_on IS NULL OR ends_on > starts_on)
);

COMMENT ON TABLE app.enrollments IS 'Quá trình theo học có thời hạn';

CREATE TABLE app.guardians (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  full_name text NOT NULL,
  phone text,
  email text,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,id)
);

COMMENT ON TABLE app.guardians IS 'Liên hệ người giám hộ, không user';

CREATE TABLE app.guardian_relationships (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  student_id uuid NOT NULL,
  guardian_id uuid NOT NULL,
  relationship_label text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  can_receive_info boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'UNVERIFIED' CHECK (status IN ('UNVERIFIED','VERIFIED','REVOKED')),
  verified_by uuid,
  verified_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,id),
  UNIQUE (school_id,student_id,guardian_id),
  UNIQUE (school_id,id,student_id),
  CHECK (status <> 'VERIFIED' OR (verified_by IS NOT NULL AND verified_at IS NOT NULL))
);

COMMENT ON TABLE app.guardian_relationships IS 'Quan hệ và quyền nhận thông tin';

CREATE TABLE app.parent_access_links (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  student_id uuid NOT NULL,
  year_id uuid NOT NULL,
  relationship_id uuid NOT NULL,
  token_hash text NOT NULL,
  allowed_sections text[] NOT NULL DEFAULT ARRAY['overview','teachers','announcements']::text[],
  allow_download boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoke_reason text,
  issued_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,id),
  UNIQUE (school_id,token_hash),
  UNIQUE (school_id,id,student_id,year_id),
  CHECK (expires_at > created_at)
);

COMMENT ON TABLE app.parent_access_links IS 'Chìa khóa tra cứu một học sinh/năm';

CREATE TABLE app.parent_access_events (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  access_link_id uuid NOT NULL,
  event_kind text NOT NULL,
  request_id text NOT NULL,
  ip_daily_hash text,
  device_summary text,
  section text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,id)
);

COMMENT ON TABLE app.parent_access_events IS 'Sử dụng link, không chứng minh danh tính';

CREATE TABLE app.transfer_requests (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  student_id uuid NOT NULL,
  from_enrollment_id uuid NOT NULL,
  to_class_id uuid,
  effective_on date NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SUBMITTED','APPROVED','REJECTED','APPLIED','CANCELLED')),
  requested_by uuid NOT NULL,
  decided_by uuid,
  applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,id)
);

COMMENT ON TABLE app.transfer_requests IS 'Yêu cầu chuyển lớp / ngừng học';

CREATE TABLE app.handover_requests (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  class_id uuid NOT NULL,
  from_assignment_id uuid NOT NULL,
  to_member_id uuid NOT NULL,
  effective_on date NOT NULL,
  reason text NOT NULL,
  checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SUBMITTED','APPROVED','APPLIED','REJECTED')),
  requested_by uuid NOT NULL,
  decided_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,id)
);

COMMENT ON TABLE app.handover_requests IS 'Bàn giao chủ nhiệm';

CREATE TABLE app.rollover_batches (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  source_year_id uuid NOT NULL,
  target_year_id uuid NOT NULL,
  plan jsonb NOT NULL DEFAULT '[]'::jsonb,
  plan_hash text,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','VALIDATED','APPLYING','APPLIED','FAILED')),
  requested_by uuid NOT NULL,
  applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,id),
  CHECK (source_year_id <> target_year_id)
);

COMMENT ON TABLE app.rollover_batches IS 'Chuẩn bị năm mới có xem trước';

CREATE TABLE app.class_groups (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  class_id uuid NOT NULL,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,id),
  UNIQUE (school_id,class_id,name),
  UNIQUE (school_id,id,class_id)
);

COMMENT ON TABLE app.class_groups IS 'Tổ trong lớp';

CREATE TABLE app.class_positions (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  class_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  single_holder boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,id),
  UNIQUE (school_id,class_id,code),
  UNIQUE (school_id,id,class_id)
);

COMMENT ON TABLE app.class_positions IS 'Chức vụ học sinh';

CREATE TABLE app.group_memberships (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  class_id uuid NOT NULL,
  group_id uuid NOT NULL,
  enrollment_id uuid NOT NULL,
  starts_on date NOT NULL,
  ends_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,id),
  CHECK (ends_on IS NULL OR ends_on > starts_on)
);

COMMENT ON TABLE app.group_memberships IS 'Lịch sử xếp tổ';

CREATE TABLE app.position_assignments (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  class_id uuid NOT NULL,
  position_id uuid NOT NULL,
  enrollment_id uuid NOT NULL,
  starts_on date NOT NULL,
  ends_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,id),
  CHECK (ends_on IS NULL OR ends_on > starts_on)
);

COMMENT ON TABLE app.position_assignments IS 'Lịch sử giao chức vụ';

CREATE TABLE app.seating_plans (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  class_id uuid NOT NULL,
  revision integer NOT NULL,
  effective_on date NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ACTIVE','ARCHIVED')),
  layout jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,id),
  UNIQUE (school_id,class_id,revision),
  UNIQUE (school_id,id,class_id)
);

COMMENT ON TABLE app.seating_plans IS 'Phiên bản sơ đồ lớp';

CREATE TABLE app.seat_assignments (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  class_id uuid NOT NULL,
  plan_id uuid NOT NULL,
  seat_key text NOT NULL,
  enrollment_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,id),
  UNIQUE (school_id,plan_id,seat_key),
  UNIQUE (school_id,plan_id,enrollment_id)
);

COMMENT ON TABLE app.seat_assignments IS 'Vị trí ngồi của một bản sơ đồ';

CREATE TABLE app.rule_sets (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  name text NOT NULL,
  revision integer NOT NULL,
  base_points numeric(10,2) NOT NULL DEFAULT 100,
  minimum_points numeric(10,2),
  maximum_points numeric(10,2),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ISSUED','RETIRED')),
  issued_at timestamptz,
  issued_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,id),
  CHECK (minimum_points IS NULL OR maximum_points IS NULL OR minimum_points <= maximum_points)
);

COMMENT ON TABLE app.rule_sets IS 'Bộ nội quy có phiên bản';

CREATE TABLE app.conduct_rules (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  rule_set_id uuid NOT NULL,
  code text NOT NULL,
  label text NOT NULL,
  group_name text NOT NULL,
  value_mode text NOT NULL DEFAULT 'FIXED' CHECK (value_mode IN ('FIXED','MANUAL')),
  default_delta numeric(10,2) NOT NULL,
  minimum_delta numeric(10,2),
  maximum_delta numeric(10,2),
  max_occurrences_per_day integer,
  reason_required boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,id),
  UNIQUE (school_id,rule_set_id,code),
  UNIQUE (school_id,id,rule_set_id)
);

COMMENT ON TABLE app.conduct_rules IS 'Quy tắc cộng trừ';

CREATE TABLE app.rule_thresholds (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  rule_set_id uuid NOT NULL,
  label text NOT NULL,
  minimum_score numeric(10,2) NOT NULL,
  sort_order integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,id),
  UNIQUE (school_id,rule_set_id,minimum_score)
);

COMMENT ON TABLE app.rule_thresholds IS 'Mốc xếp loại nội bộ';

CREATE TABLE app.class_rule_periods (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  class_id uuid NOT NULL,
  rule_set_id uuid NOT NULL,
  starts_on date NOT NULL,
  ends_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,id),
  CHECK (ends_on IS NULL OR ends_on > starts_on)
);

COMMENT ON TABLE app.class_rule_periods IS 'Nội quy áp dụng theo giai đoạn lớp';

CREATE TABLE app.attendance_sessions (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  class_id uuid NOT NULL,
  year_id uuid NOT NULL,
  session_date date NOT NULL,
  granularity text NOT NULL DEFAULT 'DAILY' CHECK (granularity IN ('DAILY','LESSON')),
  slot_key text NOT NULL,
  lesson_id uuid,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','LOCKED')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,id),
  UNIQUE (school_id,class_id,session_date,slot_key),
  UNIQUE (school_id,id,class_id),
  CHECK ((granularity='DAILY' AND lesson_id IS NULL AND slot_key='daily') OR (granularity='LESSON' AND lesson_id IS NOT NULL AND slot_key<>'daily'))
);

COMMENT ON TABLE app.attendance_sessions IS 'Buổi / tiết điểm danh';

CREATE TABLE app.attendance_records (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  class_id uuid NOT NULL,
  session_id uuid NOT NULL,
  enrollment_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'UNMARKED' CHECK (status IN ('UNMARKED','PRESENT','LATE','EXCUSED','UNEXCUSED')),
  late_minutes integer,
  public_note text,
  internal_note text,
  recorded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,id),
  UNIQUE (school_id,session_id,enrollment_id),
  CHECK (late_minutes IS NULL OR late_minutes >= 0)
);

COMMENT ON TABLE app.attendance_records IS 'Trạng thái chuyên cần từng học sinh';

CREATE TABLE app.conduct_periods (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  class_id uuid NOT NULL,
  year_id uuid NOT NULL,
  week_id uuid NOT NULL,
  rule_set_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_REVIEW','LOCKED')),
  data_version integer NOT NULL DEFAULT 1,
  input_deadline timestamptz,
  locked_at timestamptz,
  locked_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,id),
  UNIQUE (school_id,class_id,week_id),
  UNIQUE (school_id,id,class_id),
  UNIQUE (school_id,id,rule_set_id)
);

COMMENT ON TABLE app.conduct_periods IS 'Kỳ thi đua của lớp';

CREATE TABLE app.conduct_records (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  class_id uuid NOT NULL,
  period_id uuid NOT NULL,
  rule_set_id uuid NOT NULL,
  rule_id uuid NOT NULL,
  enrollment_id uuid NOT NULL,
  delta_snapshot numeric(10,2) NOT NULL,
  rule_label_snapshot text NOT NULL,
  public_reason text NOT NULL,
  internal_note text,
  occurred_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','APPROVED','EXCLUDED')),
  source_kind text NOT NULL,
  source_key text NOT NULL,
  supersedes_id uuid,
  recorded_by uuid NOT NULL,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,id)
);

COMMENT ON TABLE app.conduct_records IS 'Sổ sự kiện thi đua có nguồn';

CREATE TABLE app.adjustment_requests (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  period_id uuid NOT NULL,
  baseline_publication_id uuid NOT NULL,
  reason text NOT NULL,
  proposed_changes jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('SUBMITTED','APPROVED','REJECTED','APPLIED','CANCELLED')),
  requested_by uuid NOT NULL,
  decided_by uuid,
  decided_at timestamptz,
  applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,id)
);

COMMENT ON TABLE app.adjustment_requests IS 'Điều chỉnh có phê duyệt sau chốt';

CREATE TABLE app.timetable_versions (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  class_id uuid NOT NULL,
  year_id uuid NOT NULL,
  revision integer NOT NULL,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','READY','PUBLISHED','ARCHIVED')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,id),
  UNIQUE (school_id,class_id,revision),
  UNIQUE (school_id,id,class_id),
  CHECK (ends_on > starts_on)
);

COMMENT ON TABLE app.timetable_versions IS 'Lịch tuần nháp và bản công bố';

CREATE TABLE app.timetable_entries (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  class_id uuid NOT NULL,
  timetable_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  member_id uuid NOT NULL,
  room_id uuid,
  weekday integer NOT NULL,
  period_number integer NOT NULL,
  starts_at_local time NOT NULL,
  ends_at_local time NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,id),
  UNIQUE (school_id,timetable_id,weekday,period_number),
  CHECK (weekday BETWEEN 1 AND 7),
  CHECK (period_number > 0),
  CHECK (ends_at_local > starts_at_local)
);

COMMENT ON TABLE app.timetable_entries IS 'Tiết học mẫu trong tuần';

CREATE TABLE app.lesson_occurrences (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  class_id uuid NOT NULL,
  timetable_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  member_id uuid NOT NULL,
  room_id uuid,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED','CANCELLED')),
  change_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,id),
  CHECK (ends_at > starts_at)
);

COMMENT ON TABLE app.lesson_occurrences IS 'Tiết học thực tế và kiểm tra trùng';

CREATE TABLE app.duty_schedules (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  class_id uuid NOT NULL,
  year_id uuid NOT NULL,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PUBLISHED','ARCHIVED')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,id),
  UNIQUE (school_id,id,class_id),
  CHECK (ends_on > starts_on)
);

COMMENT ON TABLE app.duty_schedules IS 'Lịch trực nhật của lớp';

CREATE TABLE app.duty_assignments (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  class_id uuid NOT NULL,
  schedule_id uuid NOT NULL,
  enrollment_id uuid NOT NULL,
  duty_date date NOT NULL,
  task text NOT NULL,
  status text NOT NULL DEFAULT 'ASSIGNED' CHECK (status IN ('ASSIGNED','DONE','CANCELLED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,id)
);

COMMENT ON TABLE app.duty_assignments IS 'Nhiệm vụ từng học sinh';

CREATE TABLE app.activities (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  class_id uuid NOT NULL,
  year_id uuid NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  due_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ASSIGNED','CLOSED','ARCHIVED')),
  evidence_required boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,id),
  UNIQUE (school_id,id,class_id)
);

COMMENT ON TABLE app.activities IS 'Hoạt động do giáo viên tổ chức';

CREATE TABLE app.activity_participants (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  class_id uuid NOT NULL,
  activity_id uuid NOT NULL,
  enrollment_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'ASSIGNED' CHECK (status IN ('ASSIGNED','SUBMITTED','NEEDS_REVISION','APPROVED','EXCUSED')),
  review_note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,id),
  UNIQUE (school_id,activity_id,enrollment_id)
);

COMMENT ON TABLE app.activity_participants IS 'Học sinh được giao hoạt động';

CREATE TABLE app.files (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  object_key text NOT NULL,
  original_name text NOT NULL,
  content_type text NOT NULL,
  byte_size bigint NOT NULL,
  sha256 text NOT NULL,
  status text NOT NULL DEFAULT 'UPLOADING' CHECK (status IN ('UPLOADING','QUARANTINED','READY','REJECTED','ARCHIVED')),
  storage_driver text NOT NULL DEFAULT 'local',
  uploaded_by uuid NOT NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,id),
  UNIQUE (school_id,object_key),
  CHECK (byte_size >= 0)
);

COMMENT ON TABLE app.files IS 'Metadata tệp riêng tư';

CREATE TABLE app.evidence (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  participant_id uuid NOT NULL,
  file_id uuid NOT NULL,
  submitted_by uuid NOT NULL,
  caption text,
  status text NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('SUBMITTED','APPROVED','NEEDS_REVISION','REJECTED')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_reason text,
  share_with_guardian boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,id)
);

COMMENT ON TABLE app.evidence IS 'Minh chứng giáo viên tải thay';

CREATE TABLE app.announcements (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  year_id uuid NOT NULL,
  class_id uuid,
  title text NOT NULL,
  sanitized_html text NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SCHEDULED','PUBLISHED','WITHDRAWN')),
  scheduled_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,id)
);

COMMENT ON TABLE app.announcements IS 'Thông báo và quy trình công bố';

CREATE TABLE app.announcement_targets (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  announcement_id uuid NOT NULL,
  audience_kind text NOT NULL DEFAULT 'PUBLIC' CHECK (audience_kind IN ('PUBLIC','SCHOOL','GRADE','CLASS','STUDENT','STAFF')),
  grade_id uuid,
  class_id uuid,
  student_id uuid,
  member_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,id),
  CHECK ((audience_kind IN ('PUBLIC','SCHOOL') AND num_nonnulls(grade_id,class_id,student_id,member_id)=0) OR (audience_kind='GRADE' AND grade_id IS NOT NULL AND num_nonnulls(grade_id,class_id,student_id,member_id)=1) OR (audience_kind='CLASS' AND class_id IS NOT NULL AND num_nonnulls(grade_id,class_id,student_id,member_id)=1) OR (audience_kind='STUDENT' AND student_id IS NOT NULL AND num_nonnulls(grade_id,class_id,student_id,member_id)=1) OR (audience_kind='STAFF' AND member_id IS NOT NULL AND num_nonnulls(grade_id,class_id,student_id,member_id)=1))
);

COMMENT ON TABLE app.announcement_targets IS 'Đối tượng nhận thông báo';

CREATE TABLE app.file_links (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  file_id uuid NOT NULL,
  student_id uuid,
  class_id uuid,
  activity_id uuid,
  announcement_id uuid,
  share_with_guardian boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,id),
  CHECK (num_nonnulls(student_id,class_id,activity_id,announcement_id)=1)
);

COMMENT ON TABLE app.file_links IS 'Vị trí dùng tệp và khả năng chia sẻ';

CREATE TABLE app.publication_revisions (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  class_id uuid,
  year_id uuid NOT NULL,
  kind text NOT NULL DEFAULT 'CONDUCT' CHECK (kind IN ('CONDUCT','ATTENDANCE','TIMETABLE','DUTY','ACTIVITY','ANNOUNCEMENT')),
  conduct_period_id uuid,
  attendance_session_id uuid,
  timetable_id uuid,
  duty_schedule_id uuid,
  activity_id uuid,
  announcement_id uuid,
  revision integer NOT NULL,
  status text NOT NULL DEFAULT 'READY' CHECK (status IN ('READY','PUBLISHED','SUPERSEDED','WITHDRAWN')),
  source_version integer NOT NULL,
  content_hash text NOT NULL,
  staff_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL,
  published_at timestamptz,
  published_by uuid,
  withdrawn_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,id),
  UNIQUE (school_id,id,year_id),
  CHECK (num_nonnulls(conduct_period_id,attendance_session_id,timetable_id,duty_schedule_id,activity_id,announcement_id)=1),
  CHECK ((kind='CONDUCT' AND conduct_period_id IS NOT NULL) OR (kind='ATTENDANCE' AND attendance_session_id IS NOT NULL) OR (kind='TIMETABLE' AND timetable_id IS NOT NULL) OR (kind='DUTY' AND duty_schedule_id IS NOT NULL) OR (kind='ACTIVITY' AND activity_id IS NOT NULL) OR (kind='ANNOUNCEMENT' AND announcement_id IS NOT NULL))
);

COMMENT ON TABLE app.publication_revisions IS 'Bản chốt/công bố bất biến';

CREATE TABLE app.parent_publication_items (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  publication_id uuid NOT NULL,
  student_id uuid NOT NULL,
  year_id uuid NOT NULL,
  section text NOT NULL DEFAULT 'conduct' CHECK (section IN ('conduct','attendance','timetable','duties','activities','announcements')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,id),
  UNIQUE (school_id,publication_id,student_id)
);

COMMENT ON TABLE app.parent_publication_items IS 'Dữ liệu đã lọc riêng từng học sinh';

CREATE TABLE app.parent_document_items (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  student_id uuid NOT NULL,
  year_id uuid NOT NULL,
  file_id uuid NOT NULL,
  publication_id uuid,
  title text NOT NULL,
  download_allowed boolean NOT NULL DEFAULT false,
  published_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,id)
);

COMMENT ON TABLE app.parent_document_items IS 'Tệp cho đúng người xem';

CREATE TABLE app.import_jobs (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  kind text NOT NULL DEFAULT 'STUDENTS' CHECK (kind IN ('STUDENTS','STAFF','CLASSES','TIMETABLE')),
  file_id uuid NOT NULL,
  requested_by uuid NOT NULL,
  column_mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  preview_hash text,
  status text NOT NULL DEFAULT 'UPLOADED' CHECK (status IN ('UPLOADED','VALIDATING','READY','APPLYING','COMPLETED','FAILED','CANCELLED')),
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,id)
);

COMMENT ON TABLE app.import_jobs IS 'Nhập file có kiểm tra và xác nhận';

CREATE TABLE app.import_rows (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  import_id uuid NOT NULL,
  row_number integer NOT NULL,
  normalized_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','VALID','INVALID','APPLIED','SKIPPED')),
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  business_key text,
  result_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,id),
  UNIQUE (school_id,import_id,row_number)
);

COMMENT ON TABLE app.import_rows IS 'Kết quả từng dòng import';

CREATE TABLE app.export_jobs (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  requested_by uuid NOT NULL,
  class_id uuid,
  report_type text NOT NULL,
  format text NOT NULL DEFAULT 'CSV' CHECK (format IN ('CSV','XLSX','PDF')),
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','RUNNING','COMPLETED','FAILED','CANCELLED','EXPIRED')),
  file_id uuid,
  expires_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,id)
);

COMMENT ON TABLE app.export_jobs IS 'Bản xuất dữ liệu có phạm vi';

CREATE TABLE app.notifications (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  member_id uuid NOT NULL,
  kind text NOT NULL,
  title text NOT NULL,
  target_kind text NOT NULL,
  target_id uuid,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,id)
);

COMMENT ON TABLE app.notifications IS 'Thông báo nội bộ cho nhân sự';

CREATE TABLE app.audit_events (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  actor_user_id uuid,
  actor_kind text NOT NULL,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id uuid,
  request_id text NOT NULL,
  reason text,
  redacted_before jsonb NOT NULL DEFAULT '{}'::jsonb,
  redacted_after jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,id)
);

COMMENT ON TABLE app.audit_events IS 'Nhật ký thay đổi nghiệp vụ';

CREATE TABLE app.outbox_events (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  kind text NOT NULL,
  dedupe_key text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','LEASED','DONE','FAILED','CANCELLED')),
  attempts integer NOT NULL DEFAULT 0,
  run_after timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  lease_owner text,
  processed_at timestamptz,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,id),
  UNIQUE (school_id,dedupe_key)
);

COMMENT ON TABLE app.outbox_events IS 'Hàng đợi bền vững bằng PostgreSQL';

CREATE TABLE app.idempotency_keys (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  actor_user_id uuid NOT NULL,
  operation_id text NOT NULL,
  key_hash text NOT NULL,
  request_hash text NOT NULL,
  status text NOT NULL DEFAULT 'IN_PROGRESS' CHECK (status IN ('IN_PROGRESS','COMPLETED')),
  response_status integer,
  response_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,id),
  UNIQUE (school_id,actor_user_id,operation_id,key_hash)
);

COMMENT ON TABLE app.idempotency_keys IS 'Chống gửi lặp thao tác';

ALTER TABLE identity.staff_sessions ADD CONSTRAINT fk_001 FOREIGN KEY (user_id) REFERENCES identity.users (id) ON DELETE RESTRICT;

ALTER TABLE identity.auth_challenges ADD CONSTRAINT fk_002 FOREIGN KEY (user_id) REFERENCES identity.users (id) ON DELETE RESTRICT;

ALTER TABLE identity.parent_sessions ADD CONSTRAINT fk_003 FOREIGN KEY (school_id) REFERENCES platform.schools (id) ON DELETE RESTRICT;

ALTER TABLE identity.parent_sessions ADD CONSTRAINT fk_004 FOREIGN KEY (school_id,access_link_id) REFERENCES app.parent_access_links (school_id,id) ON DELETE RESTRICT;

ALTER TABLE identity.mail_outbox ADD CONSTRAINT fk_005 FOREIGN KEY (user_id) REFERENCES identity.users (id) ON DELETE RESTRICT;

ALTER TABLE identity.mail_outbox ADD CONSTRAINT fk_006 FOREIGN KEY (school_id) REFERENCES platform.schools (id) ON DELETE RESTRICT;

ALTER TABLE platform.operator_grants ADD CONSTRAINT fk_007 FOREIGN KEY (user_id) REFERENCES identity.users (id) ON DELETE RESTRICT;

ALTER TABLE platform.support_tickets ADD CONSTRAINT fk_008 FOREIGN KEY (school_id) REFERENCES platform.schools (id) ON DELETE RESTRICT;

ALTER TABLE platform.support_tickets ADD CONSTRAINT fk_009 FOREIGN KEY (requester_id) REFERENCES identity.users (id) ON DELETE RESTRICT;

ALTER TABLE platform.support_tickets ADD CONSTRAINT fk_010 FOREIGN KEY (assignee_id) REFERENCES identity.users (id) ON DELETE RESTRICT;

ALTER TABLE platform.support_messages ADD CONSTRAINT fk_011 FOREIGN KEY (ticket_id) REFERENCES platform.support_tickets (id) ON DELETE RESTRICT;

ALTER TABLE platform.support_messages ADD CONSTRAINT fk_012 FOREIGN KEY (author_id) REFERENCES identity.users (id) ON DELETE RESTRICT;

ALTER TABLE platform.support_access ADD CONSTRAINT fk_013 FOREIGN KEY (school_id) REFERENCES platform.schools (id) ON DELETE RESTRICT;

ALTER TABLE platform.support_access ADD CONSTRAINT fk_014 FOREIGN KEY (ticket_id) REFERENCES platform.support_tickets (id) ON DELETE RESTRICT;

ALTER TABLE platform.support_access ADD CONSTRAINT fk_015 FOREIGN KEY (operator_id) REFERENCES identity.users (id) ON DELETE RESTRICT;

ALTER TABLE platform.support_access ADD CONSTRAINT fk_016 FOREIGN KEY (approved_by_user_id) REFERENCES identity.users (id) ON DELETE RESTRICT;

ALTER TABLE platform.support_access ADD CONSTRAINT fk_017 FOREIGN KEY (school_id,class_id) REFERENCES app.classes (school_id,id) ON DELETE RESTRICT;

ALTER TABLE platform.audit_events ADD CONSTRAINT fk_018 FOREIGN KEY (actor_id) REFERENCES identity.users (id) ON DELETE RESTRICT;

ALTER TABLE platform.audit_events ADD CONSTRAINT fk_019 FOREIGN KEY (school_id) REFERENCES platform.schools (id) ON DELETE RESTRICT;

ALTER TABLE platform.public_school_content ADD CONSTRAINT fk_020 FOREIGN KEY (school_id) REFERENCES platform.schools (id) ON DELETE RESTRICT;

ALTER TABLE platform.public_school_content ADD CONSTRAINT fk_021 FOREIGN KEY (school_id,announcement_id) REFERENCES app.announcements (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.memberships ADD CONSTRAINT fk_022 FOREIGN KEY (school_id) REFERENCES platform.schools (id) ON DELETE RESTRICT;

ALTER TABLE app.memberships ADD CONSTRAINT fk_023 FOREIGN KEY (user_id) REFERENCES identity.users (id) ON DELETE RESTRICT;

ALTER TABLE app.roles ADD CONSTRAINT fk_024 FOREIGN KEY (school_id) REFERENCES platform.schools (id) ON DELETE RESTRICT;

ALTER TABLE app.role_permissions ADD CONSTRAINT fk_025 FOREIGN KEY (school_id) REFERENCES platform.schools (id) ON DELETE RESTRICT;

ALTER TABLE app.role_permissions ADD CONSTRAINT fk_026 FOREIGN KEY (school_id,role_id) REFERENCES app.roles (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.role_grants ADD CONSTRAINT fk_027 FOREIGN KEY (school_id) REFERENCES platform.schools (id) ON DELETE RESTRICT;

ALTER TABLE app.role_grants ADD CONSTRAINT fk_028 FOREIGN KEY (school_id,member_id) REFERENCES app.memberships (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.role_grants ADD CONSTRAINT fk_029 FOREIGN KEY (school_id,role_id) REFERENCES app.roles (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.role_grants ADD CONSTRAINT fk_030 FOREIGN KEY (school_id,class_id) REFERENCES app.classes (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.role_grants ADD CONSTRAINT fk_031 FOREIGN KEY (school_id,subject_id) REFERENCES app.subjects (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.role_grants ADD CONSTRAINT fk_032 FOREIGN KEY (granted_by) REFERENCES identity.users (id) ON DELETE RESTRICT;

ALTER TABLE app.staff_invitations ADD CONSTRAINT fk_033 FOREIGN KEY (school_id) REFERENCES platform.schools (id) ON DELETE RESTRICT;

ALTER TABLE app.staff_invitations ADD CONSTRAINT fk_034 FOREIGN KEY (invited_by) REFERENCES identity.users (id) ON DELETE RESTRICT;

ALTER TABLE app.staff_invitations ADD CONSTRAINT fk_035 FOREIGN KEY (accepted_user_id) REFERENCES identity.users (id) ON DELETE RESTRICT;

ALTER TABLE app.grade_levels ADD CONSTRAINT fk_036 FOREIGN KEY (school_id) REFERENCES platform.schools (id) ON DELETE RESTRICT;

ALTER TABLE app.subjects ADD CONSTRAINT fk_037 FOREIGN KEY (school_id) REFERENCES platform.schools (id) ON DELETE RESTRICT;

ALTER TABLE app.rooms ADD CONSTRAINT fk_038 FOREIGN KEY (school_id) REFERENCES platform.schools (id) ON DELETE RESTRICT;

ALTER TABLE app.academic_years ADD CONSTRAINT fk_039 FOREIGN KEY (school_id) REFERENCES platform.schools (id) ON DELETE RESTRICT;

ALTER TABLE app.terms ADD CONSTRAINT fk_040 FOREIGN KEY (school_id) REFERENCES platform.schools (id) ON DELETE RESTRICT;

ALTER TABLE app.terms ADD CONSTRAINT fk_041 FOREIGN KEY (school_id,year_id) REFERENCES app.academic_years (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.school_weeks ADD CONSTRAINT fk_042 FOREIGN KEY (school_id) REFERENCES platform.schools (id) ON DELETE RESTRICT;

ALTER TABLE app.school_weeks ADD CONSTRAINT fk_043 FOREIGN KEY (school_id,year_id) REFERENCES app.academic_years (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.school_weeks ADD CONSTRAINT fk_044 FOREIGN KEY (school_id,term_id,year_id) REFERENCES app.terms (school_id,id,year_id) ON DELETE RESTRICT;

ALTER TABLE app.classes ADD CONSTRAINT fk_045 FOREIGN KEY (school_id) REFERENCES platform.schools (id) ON DELETE RESTRICT;

ALTER TABLE app.classes ADD CONSTRAINT fk_046 FOREIGN KEY (school_id,year_id) REFERENCES app.academic_years (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.classes ADD CONSTRAINT fk_047 FOREIGN KEY (school_id,grade_level_id) REFERENCES app.grade_levels (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.calendar_events ADD CONSTRAINT fk_048 FOREIGN KEY (school_id) REFERENCES platform.schools (id) ON DELETE RESTRICT;

ALTER TABLE app.calendar_events ADD CONSTRAINT fk_049 FOREIGN KEY (school_id,year_id) REFERENCES app.academic_years (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.calendar_events ADD CONSTRAINT fk_050 FOREIGN KEY (school_id,class_id,year_id) REFERENCES app.classes (school_id,id,year_id) ON DELETE RESTRICT;

ALTER TABLE app.teaching_assignments ADD CONSTRAINT fk_051 FOREIGN KEY (school_id) REFERENCES platform.schools (id) ON DELETE RESTRICT;

ALTER TABLE app.teaching_assignments ADD CONSTRAINT fk_052 FOREIGN KEY (school_id,class_id) REFERENCES app.classes (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.teaching_assignments ADD CONSTRAINT fk_053 FOREIGN KEY (school_id,member_id) REFERENCES app.memberships (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.teaching_assignments ADD CONSTRAINT fk_054 FOREIGN KEY (school_id,role_grant_id) REFERENCES app.role_grants (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.teaching_assignments ADD CONSTRAINT fk_055 FOREIGN KEY (school_id,subject_id) REFERENCES app.subjects (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.students ADD CONSTRAINT fk_056 FOREIGN KEY (school_id) REFERENCES platform.schools (id) ON DELETE RESTRICT;

ALTER TABLE app.enrollments ADD CONSTRAINT fk_057 FOREIGN KEY (school_id) REFERENCES platform.schools (id) ON DELETE RESTRICT;

ALTER TABLE app.enrollments ADD CONSTRAINT fk_058 FOREIGN KEY (school_id,student_id) REFERENCES app.students (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.enrollments ADD CONSTRAINT fk_059 FOREIGN KEY (school_id,class_id,year_id) REFERENCES app.classes (school_id,id,year_id) ON DELETE RESTRICT;

ALTER TABLE app.guardians ADD CONSTRAINT fk_060 FOREIGN KEY (school_id) REFERENCES platform.schools (id) ON DELETE RESTRICT;

ALTER TABLE app.guardian_relationships ADD CONSTRAINT fk_061 FOREIGN KEY (school_id) REFERENCES platform.schools (id) ON DELETE RESTRICT;

ALTER TABLE app.guardian_relationships ADD CONSTRAINT fk_062 FOREIGN KEY (school_id,student_id) REFERENCES app.students (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.guardian_relationships ADD CONSTRAINT fk_063 FOREIGN KEY (school_id,guardian_id) REFERENCES app.guardians (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.guardian_relationships ADD CONSTRAINT fk_064 FOREIGN KEY (verified_by) REFERENCES identity.users (id) ON DELETE RESTRICT;

ALTER TABLE app.parent_access_links ADD CONSTRAINT fk_065 FOREIGN KEY (school_id) REFERENCES platform.schools (id) ON DELETE RESTRICT;

ALTER TABLE app.parent_access_links ADD CONSTRAINT fk_066 FOREIGN KEY (school_id,student_id) REFERENCES app.students (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.parent_access_links ADD CONSTRAINT fk_067 FOREIGN KEY (school_id,year_id) REFERENCES app.academic_years (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.parent_access_links ADD CONSTRAINT fk_068 FOREIGN KEY (issued_by) REFERENCES identity.users (id) ON DELETE RESTRICT;

ALTER TABLE app.parent_access_links ADD CONSTRAINT fk_069 FOREIGN KEY (school_id,relationship_id,student_id) REFERENCES app.guardian_relationships (school_id,id,student_id) ON DELETE RESTRICT;

ALTER TABLE app.parent_access_events ADD CONSTRAINT fk_070 FOREIGN KEY (school_id) REFERENCES platform.schools (id) ON DELETE RESTRICT;

ALTER TABLE app.parent_access_events ADD CONSTRAINT fk_071 FOREIGN KEY (school_id,access_link_id) REFERENCES app.parent_access_links (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.transfer_requests ADD CONSTRAINT fk_072 FOREIGN KEY (school_id) REFERENCES platform.schools (id) ON DELETE RESTRICT;

ALTER TABLE app.transfer_requests ADD CONSTRAINT fk_073 FOREIGN KEY (school_id,student_id) REFERENCES app.students (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.transfer_requests ADD CONSTRAINT fk_074 FOREIGN KEY (school_id,from_enrollment_id) REFERENCES app.enrollments (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.transfer_requests ADD CONSTRAINT fk_075 FOREIGN KEY (school_id,to_class_id) REFERENCES app.classes (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.transfer_requests ADD CONSTRAINT fk_076 FOREIGN KEY (requested_by) REFERENCES identity.users (id) ON DELETE RESTRICT;

ALTER TABLE app.transfer_requests ADD CONSTRAINT fk_077 FOREIGN KEY (decided_by) REFERENCES identity.users (id) ON DELETE RESTRICT;

ALTER TABLE app.handover_requests ADD CONSTRAINT fk_078 FOREIGN KEY (school_id) REFERENCES platform.schools (id) ON DELETE RESTRICT;

ALTER TABLE app.handover_requests ADD CONSTRAINT fk_079 FOREIGN KEY (school_id,class_id) REFERENCES app.classes (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.handover_requests ADD CONSTRAINT fk_080 FOREIGN KEY (school_id,from_assignment_id) REFERENCES app.teaching_assignments (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.handover_requests ADD CONSTRAINT fk_081 FOREIGN KEY (school_id,to_member_id) REFERENCES app.memberships (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.handover_requests ADD CONSTRAINT fk_082 FOREIGN KEY (requested_by) REFERENCES identity.users (id) ON DELETE RESTRICT;

ALTER TABLE app.handover_requests ADD CONSTRAINT fk_083 FOREIGN KEY (decided_by) REFERENCES identity.users (id) ON DELETE RESTRICT;

ALTER TABLE app.rollover_batches ADD CONSTRAINT fk_084 FOREIGN KEY (school_id) REFERENCES platform.schools (id) ON DELETE RESTRICT;

ALTER TABLE app.rollover_batches ADD CONSTRAINT fk_085 FOREIGN KEY (school_id,source_year_id) REFERENCES app.academic_years (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.rollover_batches ADD CONSTRAINT fk_086 FOREIGN KEY (school_id,target_year_id) REFERENCES app.academic_years (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.rollover_batches ADD CONSTRAINT fk_087 FOREIGN KEY (requested_by) REFERENCES identity.users (id) ON DELETE RESTRICT;

ALTER TABLE app.class_groups ADD CONSTRAINT fk_088 FOREIGN KEY (school_id) REFERENCES platform.schools (id) ON DELETE RESTRICT;

ALTER TABLE app.class_groups ADD CONSTRAINT fk_089 FOREIGN KEY (school_id,class_id) REFERENCES app.classes (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.class_positions ADD CONSTRAINT fk_090 FOREIGN KEY (school_id) REFERENCES platform.schools (id) ON DELETE RESTRICT;

ALTER TABLE app.class_positions ADD CONSTRAINT fk_091 FOREIGN KEY (school_id,class_id) REFERENCES app.classes (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.group_memberships ADD CONSTRAINT fk_092 FOREIGN KEY (school_id) REFERENCES platform.schools (id) ON DELETE RESTRICT;

ALTER TABLE app.group_memberships ADD CONSTRAINT fk_093 FOREIGN KEY (school_id,group_id,class_id) REFERENCES app.class_groups (school_id,id,class_id) ON DELETE RESTRICT;

ALTER TABLE app.group_memberships ADD CONSTRAINT fk_094 FOREIGN KEY (school_id,enrollment_id,class_id) REFERENCES app.enrollments (school_id,id,class_id) ON DELETE RESTRICT;

ALTER TABLE app.position_assignments ADD CONSTRAINT fk_095 FOREIGN KEY (school_id) REFERENCES platform.schools (id) ON DELETE RESTRICT;

ALTER TABLE app.position_assignments ADD CONSTRAINT fk_096 FOREIGN KEY (school_id,position_id,class_id) REFERENCES app.class_positions (school_id,id,class_id) ON DELETE RESTRICT;

ALTER TABLE app.position_assignments ADD CONSTRAINT fk_097 FOREIGN KEY (school_id,enrollment_id,class_id) REFERENCES app.enrollments (school_id,id,class_id) ON DELETE RESTRICT;

ALTER TABLE app.seating_plans ADD CONSTRAINT fk_098 FOREIGN KEY (school_id) REFERENCES platform.schools (id) ON DELETE RESTRICT;

ALTER TABLE app.seating_plans ADD CONSTRAINT fk_099 FOREIGN KEY (school_id,class_id) REFERENCES app.classes (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.seating_plans ADD CONSTRAINT fk_100 FOREIGN KEY (created_by) REFERENCES identity.users (id) ON DELETE RESTRICT;

ALTER TABLE app.seat_assignments ADD CONSTRAINT fk_101 FOREIGN KEY (school_id) REFERENCES platform.schools (id) ON DELETE RESTRICT;

ALTER TABLE app.seat_assignments ADD CONSTRAINT fk_102 FOREIGN KEY (school_id,plan_id,class_id) REFERENCES app.seating_plans (school_id,id,class_id) ON DELETE RESTRICT;

ALTER TABLE app.seat_assignments ADD CONSTRAINT fk_103 FOREIGN KEY (school_id,enrollment_id,class_id) REFERENCES app.enrollments (school_id,id,class_id) ON DELETE RESTRICT;

ALTER TABLE app.rule_sets ADD CONSTRAINT fk_104 FOREIGN KEY (school_id) REFERENCES platform.schools (id) ON DELETE RESTRICT;

ALTER TABLE app.rule_sets ADD CONSTRAINT fk_105 FOREIGN KEY (issued_by) REFERENCES identity.users (id) ON DELETE RESTRICT;

ALTER TABLE app.conduct_rules ADD CONSTRAINT fk_106 FOREIGN KEY (school_id) REFERENCES platform.schools (id) ON DELETE RESTRICT;

ALTER TABLE app.conduct_rules ADD CONSTRAINT fk_107 FOREIGN KEY (school_id,rule_set_id) REFERENCES app.rule_sets (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.rule_thresholds ADD CONSTRAINT fk_108 FOREIGN KEY (school_id) REFERENCES platform.schools (id) ON DELETE RESTRICT;

ALTER TABLE app.rule_thresholds ADD CONSTRAINT fk_109 FOREIGN KEY (school_id,rule_set_id) REFERENCES app.rule_sets (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.class_rule_periods ADD CONSTRAINT fk_110 FOREIGN KEY (school_id) REFERENCES platform.schools (id) ON DELETE RESTRICT;

ALTER TABLE app.class_rule_periods ADD CONSTRAINT fk_111 FOREIGN KEY (school_id,class_id) REFERENCES app.classes (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.class_rule_periods ADD CONSTRAINT fk_112 FOREIGN KEY (school_id,rule_set_id) REFERENCES app.rule_sets (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.attendance_sessions ADD CONSTRAINT fk_113 FOREIGN KEY (school_id) REFERENCES platform.schools (id) ON DELETE RESTRICT;

ALTER TABLE app.attendance_sessions ADD CONSTRAINT fk_114 FOREIGN KEY (school_id,class_id,year_id) REFERENCES app.classes (school_id,id,year_id) ON DELETE RESTRICT;

ALTER TABLE app.attendance_sessions ADD CONSTRAINT fk_115 FOREIGN KEY (school_id,lesson_id) REFERENCES app.lesson_occurrences (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.attendance_sessions ADD CONSTRAINT fk_116 FOREIGN KEY (created_by) REFERENCES identity.users (id) ON DELETE RESTRICT;

ALTER TABLE app.attendance_records ADD CONSTRAINT fk_117 FOREIGN KEY (school_id) REFERENCES platform.schools (id) ON DELETE RESTRICT;

ALTER TABLE app.attendance_records ADD CONSTRAINT fk_118 FOREIGN KEY (school_id,session_id,class_id) REFERENCES app.attendance_sessions (school_id,id,class_id) ON DELETE RESTRICT;

ALTER TABLE app.attendance_records ADD CONSTRAINT fk_119 FOREIGN KEY (school_id,enrollment_id,class_id) REFERENCES app.enrollments (school_id,id,class_id) ON DELETE RESTRICT;

ALTER TABLE app.attendance_records ADD CONSTRAINT fk_120 FOREIGN KEY (recorded_by) REFERENCES identity.users (id) ON DELETE RESTRICT;

ALTER TABLE app.conduct_periods ADD CONSTRAINT fk_121 FOREIGN KEY (school_id) REFERENCES platform.schools (id) ON DELETE RESTRICT;

ALTER TABLE app.conduct_periods ADD CONSTRAINT fk_122 FOREIGN KEY (school_id,class_id,year_id) REFERENCES app.classes (school_id,id,year_id) ON DELETE RESTRICT;

ALTER TABLE app.conduct_periods ADD CONSTRAINT fk_123 FOREIGN KEY (school_id,week_id,year_id) REFERENCES app.school_weeks (school_id,id,year_id) ON DELETE RESTRICT;

ALTER TABLE app.conduct_periods ADD CONSTRAINT fk_124 FOREIGN KEY (school_id,rule_set_id) REFERENCES app.rule_sets (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.conduct_periods ADD CONSTRAINT fk_125 FOREIGN KEY (locked_by) REFERENCES identity.users (id) ON DELETE RESTRICT;

ALTER TABLE app.conduct_records ADD CONSTRAINT fk_126 FOREIGN KEY (school_id) REFERENCES platform.schools (id) ON DELETE RESTRICT;

ALTER TABLE app.conduct_records ADD CONSTRAINT fk_127 FOREIGN KEY (school_id,period_id,class_id) REFERENCES app.conduct_periods (school_id,id,class_id) ON DELETE RESTRICT;

ALTER TABLE app.conduct_records ADD CONSTRAINT fk_128 FOREIGN KEY (school_id,enrollment_id,class_id) REFERENCES app.enrollments (school_id,id,class_id) ON DELETE RESTRICT;

ALTER TABLE app.conduct_records ADD CONSTRAINT fk_129 FOREIGN KEY (school_id,period_id,rule_set_id) REFERENCES app.conduct_periods (school_id,id,rule_set_id) ON DELETE RESTRICT;

ALTER TABLE app.conduct_records ADD CONSTRAINT fk_130 FOREIGN KEY (school_id,rule_id,rule_set_id) REFERENCES app.conduct_rules (school_id,id,rule_set_id) ON DELETE RESTRICT;

ALTER TABLE app.conduct_records ADD CONSTRAINT fk_131 FOREIGN KEY (school_id,supersedes_id) REFERENCES app.conduct_records (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.conduct_records ADD CONSTRAINT fk_132 FOREIGN KEY (recorded_by) REFERENCES identity.users (id) ON DELETE RESTRICT;

ALTER TABLE app.conduct_records ADD CONSTRAINT fk_133 FOREIGN KEY (approved_by) REFERENCES identity.users (id) ON DELETE RESTRICT;

ALTER TABLE app.adjustment_requests ADD CONSTRAINT fk_134 FOREIGN KEY (school_id) REFERENCES platform.schools (id) ON DELETE RESTRICT;

ALTER TABLE app.adjustment_requests ADD CONSTRAINT fk_135 FOREIGN KEY (school_id,period_id) REFERENCES app.conduct_periods (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.adjustment_requests ADD CONSTRAINT fk_136 FOREIGN KEY (school_id,baseline_publication_id) REFERENCES app.publication_revisions (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.adjustment_requests ADD CONSTRAINT fk_137 FOREIGN KEY (requested_by) REFERENCES identity.users (id) ON DELETE RESTRICT;

ALTER TABLE app.adjustment_requests ADD CONSTRAINT fk_138 FOREIGN KEY (decided_by) REFERENCES identity.users (id) ON DELETE RESTRICT;

ALTER TABLE app.timetable_versions ADD CONSTRAINT fk_139 FOREIGN KEY (school_id) REFERENCES platform.schools (id) ON DELETE RESTRICT;

ALTER TABLE app.timetable_versions ADD CONSTRAINT fk_140 FOREIGN KEY (school_id,class_id,year_id) REFERENCES app.classes (school_id,id,year_id) ON DELETE RESTRICT;

ALTER TABLE app.timetable_versions ADD CONSTRAINT fk_141 FOREIGN KEY (created_by) REFERENCES identity.users (id) ON DELETE RESTRICT;

ALTER TABLE app.timetable_entries ADD CONSTRAINT fk_142 FOREIGN KEY (school_id) REFERENCES platform.schools (id) ON DELETE RESTRICT;

ALTER TABLE app.timetable_entries ADD CONSTRAINT fk_143 FOREIGN KEY (school_id,timetable_id,class_id) REFERENCES app.timetable_versions (school_id,id,class_id) ON DELETE RESTRICT;

ALTER TABLE app.timetable_entries ADD CONSTRAINT fk_144 FOREIGN KEY (school_id,subject_id) REFERENCES app.subjects (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.timetable_entries ADD CONSTRAINT fk_145 FOREIGN KEY (school_id,member_id) REFERENCES app.memberships (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.timetable_entries ADD CONSTRAINT fk_146 FOREIGN KEY (school_id,room_id) REFERENCES app.rooms (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.lesson_occurrences ADD CONSTRAINT fk_147 FOREIGN KEY (school_id) REFERENCES platform.schools (id) ON DELETE RESTRICT;

ALTER TABLE app.lesson_occurrences ADD CONSTRAINT fk_148 FOREIGN KEY (school_id,timetable_id,class_id) REFERENCES app.timetable_versions (school_id,id,class_id) ON DELETE RESTRICT;

ALTER TABLE app.lesson_occurrences ADD CONSTRAINT fk_149 FOREIGN KEY (school_id,subject_id) REFERENCES app.subjects (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.lesson_occurrences ADD CONSTRAINT fk_150 FOREIGN KEY (school_id,member_id) REFERENCES app.memberships (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.lesson_occurrences ADD CONSTRAINT fk_151 FOREIGN KEY (school_id,room_id) REFERENCES app.rooms (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.duty_schedules ADD CONSTRAINT fk_152 FOREIGN KEY (school_id) REFERENCES platform.schools (id) ON DELETE RESTRICT;

ALTER TABLE app.duty_schedules ADD CONSTRAINT fk_153 FOREIGN KEY (school_id,class_id,year_id) REFERENCES app.classes (school_id,id,year_id) ON DELETE RESTRICT;

ALTER TABLE app.duty_schedules ADD CONSTRAINT fk_154 FOREIGN KEY (created_by) REFERENCES identity.users (id) ON DELETE RESTRICT;

ALTER TABLE app.duty_assignments ADD CONSTRAINT fk_155 FOREIGN KEY (school_id) REFERENCES platform.schools (id) ON DELETE RESTRICT;

ALTER TABLE app.duty_assignments ADD CONSTRAINT fk_156 FOREIGN KEY (school_id,schedule_id,class_id) REFERENCES app.duty_schedules (school_id,id,class_id) ON DELETE RESTRICT;

ALTER TABLE app.duty_assignments ADD CONSTRAINT fk_157 FOREIGN KEY (school_id,enrollment_id,class_id) REFERENCES app.enrollments (school_id,id,class_id) ON DELETE RESTRICT;

ALTER TABLE app.activities ADD CONSTRAINT fk_158 FOREIGN KEY (school_id) REFERENCES platform.schools (id) ON DELETE RESTRICT;

ALTER TABLE app.activities ADD CONSTRAINT fk_159 FOREIGN KEY (school_id,class_id,year_id) REFERENCES app.classes (school_id,id,year_id) ON DELETE RESTRICT;

ALTER TABLE app.activities ADD CONSTRAINT fk_160 FOREIGN KEY (created_by) REFERENCES identity.users (id) ON DELETE RESTRICT;

ALTER TABLE app.activity_participants ADD CONSTRAINT fk_161 FOREIGN KEY (school_id) REFERENCES platform.schools (id) ON DELETE RESTRICT;

ALTER TABLE app.activity_participants ADD CONSTRAINT fk_162 FOREIGN KEY (school_id,activity_id,class_id) REFERENCES app.activities (school_id,id,class_id) ON DELETE RESTRICT;

ALTER TABLE app.activity_participants ADD CONSTRAINT fk_163 FOREIGN KEY (school_id,enrollment_id,class_id) REFERENCES app.enrollments (school_id,id,class_id) ON DELETE RESTRICT;

ALTER TABLE app.activity_participants ADD CONSTRAINT fk_164 FOREIGN KEY (reviewed_by) REFERENCES identity.users (id) ON DELETE RESTRICT;

ALTER TABLE app.files ADD CONSTRAINT fk_165 FOREIGN KEY (school_id) REFERENCES platform.schools (id) ON DELETE RESTRICT;

ALTER TABLE app.files ADD CONSTRAINT fk_166 FOREIGN KEY (uploaded_by) REFERENCES identity.users (id) ON DELETE RESTRICT;

ALTER TABLE app.evidence ADD CONSTRAINT fk_167 FOREIGN KEY (school_id) REFERENCES platform.schools (id) ON DELETE RESTRICT;

ALTER TABLE app.evidence ADD CONSTRAINT fk_168 FOREIGN KEY (school_id,participant_id) REFERENCES app.activity_participants (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.evidence ADD CONSTRAINT fk_169 FOREIGN KEY (school_id,file_id) REFERENCES app.files (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.evidence ADD CONSTRAINT fk_170 FOREIGN KEY (submitted_by) REFERENCES identity.users (id) ON DELETE RESTRICT;

ALTER TABLE app.evidence ADD CONSTRAINT fk_171 FOREIGN KEY (reviewed_by) REFERENCES identity.users (id) ON DELETE RESTRICT;

ALTER TABLE app.announcements ADD CONSTRAINT fk_172 FOREIGN KEY (school_id) REFERENCES platform.schools (id) ON DELETE RESTRICT;

ALTER TABLE app.announcements ADD CONSTRAINT fk_173 FOREIGN KEY (school_id,year_id) REFERENCES app.academic_years (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.announcements ADD CONSTRAINT fk_174 FOREIGN KEY (school_id,class_id,year_id) REFERENCES app.classes (school_id,id,year_id) ON DELETE RESTRICT;

ALTER TABLE app.announcements ADD CONSTRAINT fk_175 FOREIGN KEY (created_by) REFERENCES identity.users (id) ON DELETE RESTRICT;

ALTER TABLE app.announcement_targets ADD CONSTRAINT fk_176 FOREIGN KEY (school_id) REFERENCES platform.schools (id) ON DELETE RESTRICT;

ALTER TABLE app.announcement_targets ADD CONSTRAINT fk_177 FOREIGN KEY (school_id,announcement_id) REFERENCES app.announcements (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.announcement_targets ADD CONSTRAINT fk_178 FOREIGN KEY (school_id,grade_id) REFERENCES app.grade_levels (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.announcement_targets ADD CONSTRAINT fk_179 FOREIGN KEY (school_id,class_id) REFERENCES app.classes (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.announcement_targets ADD CONSTRAINT fk_180 FOREIGN KEY (school_id,student_id) REFERENCES app.students (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.announcement_targets ADD CONSTRAINT fk_181 FOREIGN KEY (school_id,member_id) REFERENCES app.memberships (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.file_links ADD CONSTRAINT fk_182 FOREIGN KEY (school_id) REFERENCES platform.schools (id) ON DELETE RESTRICT;

ALTER TABLE app.file_links ADD CONSTRAINT fk_183 FOREIGN KEY (school_id,file_id) REFERENCES app.files (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.file_links ADD CONSTRAINT fk_184 FOREIGN KEY (school_id,student_id) REFERENCES app.students (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.file_links ADD CONSTRAINT fk_185 FOREIGN KEY (school_id,class_id) REFERENCES app.classes (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.file_links ADD CONSTRAINT fk_186 FOREIGN KEY (school_id,activity_id) REFERENCES app.activities (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.file_links ADD CONSTRAINT fk_187 FOREIGN KEY (school_id,announcement_id) REFERENCES app.announcements (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.publication_revisions ADD CONSTRAINT fk_188 FOREIGN KEY (school_id) REFERENCES platform.schools (id) ON DELETE RESTRICT;

ALTER TABLE app.publication_revisions ADD CONSTRAINT fk_189 FOREIGN KEY (school_id,conduct_period_id) REFERENCES app.conduct_periods (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.publication_revisions ADD CONSTRAINT fk_190 FOREIGN KEY (school_id,attendance_session_id) REFERENCES app.attendance_sessions (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.publication_revisions ADD CONSTRAINT fk_191 FOREIGN KEY (school_id,timetable_id) REFERENCES app.timetable_versions (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.publication_revisions ADD CONSTRAINT fk_192 FOREIGN KEY (school_id,duty_schedule_id) REFERENCES app.duty_schedules (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.publication_revisions ADD CONSTRAINT fk_193 FOREIGN KEY (school_id,activity_id) REFERENCES app.activities (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.publication_revisions ADD CONSTRAINT fk_194 FOREIGN KEY (school_id,announcement_id) REFERENCES app.announcements (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.publication_revisions ADD CONSTRAINT fk_195 FOREIGN KEY (school_id,class_id) REFERENCES app.classes (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.publication_revisions ADD CONSTRAINT fk_196 FOREIGN KEY (school_id,year_id) REFERENCES app.academic_years (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.publication_revisions ADD CONSTRAINT fk_197 FOREIGN KEY (created_by) REFERENCES identity.users (id) ON DELETE RESTRICT;

ALTER TABLE app.publication_revisions ADD CONSTRAINT fk_198 FOREIGN KEY (published_by) REFERENCES identity.users (id) ON DELETE RESTRICT;

ALTER TABLE app.parent_publication_items ADD CONSTRAINT fk_199 FOREIGN KEY (school_id) REFERENCES platform.schools (id) ON DELETE RESTRICT;

ALTER TABLE app.parent_publication_items ADD CONSTRAINT fk_200 FOREIGN KEY (school_id,publication_id,year_id) REFERENCES app.publication_revisions (school_id,id,year_id) ON DELETE RESTRICT;

ALTER TABLE app.parent_publication_items ADD CONSTRAINT fk_201 FOREIGN KEY (school_id,student_id) REFERENCES app.students (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.parent_document_items ADD CONSTRAINT fk_202 FOREIGN KEY (school_id) REFERENCES platform.schools (id) ON DELETE RESTRICT;

ALTER TABLE app.parent_document_items ADD CONSTRAINT fk_203 FOREIGN KEY (school_id,student_id) REFERENCES app.students (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.parent_document_items ADD CONSTRAINT fk_204 FOREIGN KEY (school_id,year_id) REFERENCES app.academic_years (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.parent_document_items ADD CONSTRAINT fk_205 FOREIGN KEY (school_id,file_id) REFERENCES app.files (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.parent_document_items ADD CONSTRAINT fk_206 FOREIGN KEY (school_id,publication_id) REFERENCES app.publication_revisions (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.import_jobs ADD CONSTRAINT fk_207 FOREIGN KEY (school_id) REFERENCES platform.schools (id) ON DELETE RESTRICT;

ALTER TABLE app.import_jobs ADD CONSTRAINT fk_208 FOREIGN KEY (school_id,file_id) REFERENCES app.files (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.import_jobs ADD CONSTRAINT fk_209 FOREIGN KEY (requested_by) REFERENCES identity.users (id) ON DELETE RESTRICT;

ALTER TABLE app.import_rows ADD CONSTRAINT fk_210 FOREIGN KEY (school_id) REFERENCES platform.schools (id) ON DELETE RESTRICT;

ALTER TABLE app.import_rows ADD CONSTRAINT fk_211 FOREIGN KEY (school_id,import_id) REFERENCES app.import_jobs (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.export_jobs ADD CONSTRAINT fk_212 FOREIGN KEY (school_id) REFERENCES platform.schools (id) ON DELETE RESTRICT;

ALTER TABLE app.export_jobs ADD CONSTRAINT fk_213 FOREIGN KEY (requested_by) REFERENCES identity.users (id) ON DELETE RESTRICT;

ALTER TABLE app.export_jobs ADD CONSTRAINT fk_214 FOREIGN KEY (school_id,class_id) REFERENCES app.classes (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.export_jobs ADD CONSTRAINT fk_215 FOREIGN KEY (school_id,file_id) REFERENCES app.files (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.notifications ADD CONSTRAINT fk_216 FOREIGN KEY (school_id) REFERENCES platform.schools (id) ON DELETE RESTRICT;

ALTER TABLE app.notifications ADD CONSTRAINT fk_217 FOREIGN KEY (school_id,member_id) REFERENCES app.memberships (school_id,id) ON DELETE RESTRICT;

ALTER TABLE app.audit_events ADD CONSTRAINT fk_218 FOREIGN KEY (school_id) REFERENCES platform.schools (id) ON DELETE RESTRICT;

ALTER TABLE app.audit_events ADD CONSTRAINT fk_219 FOREIGN KEY (actor_user_id) REFERENCES identity.users (id) ON DELETE RESTRICT;

ALTER TABLE app.outbox_events ADD CONSTRAINT fk_220 FOREIGN KEY (school_id) REFERENCES platform.schools (id) ON DELETE RESTRICT;

ALTER TABLE app.idempotency_keys ADD CONSTRAINT fk_221 FOREIGN KEY (school_id) REFERENCES platform.schools (id) ON DELETE RESTRICT;

ALTER TABLE app.idempotency_keys ADD CONSTRAINT fk_222 FOREIGN KEY (actor_user_id) REFERENCES identity.users (id) ON DELETE RESTRICT;

COMMIT;
