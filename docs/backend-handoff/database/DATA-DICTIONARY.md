# Từ điển dữ liệu — PostgreSQL

Có 75 bảng trong thiết kế; đây là mô hình đề xuất mới, không phải DB đã triển khai vào ứng dụng.

Cột `id`, `created_at` có ở tất cả bảng; bảng sửa được có `version`, `updated_at`. Bảng `app.*` luôn có `school_id`, FK tổng hợp để chặn tham chiếu chéo trường. `jsonb` chỉ dùng nội dung linh hoạt, snapshot có schema hoặc metadata; không nhét toàn bộ trường vào một JSON.

## Các nhóm

- **01-identity**: 11 bảng.
- **02-organization**: 13 bảng.
- **03-students**: 5 bảng.
- **04-classroom**: 6 bảng.
- **05-parent**: 6 bảng.
- **06-conduct**: 9 bảng.
- **07-schedule**: 5 bảng.
- **08-content**: 7 bảng.
- **09-operations**: 13 bảng.

## `identity.users` — Danh tính nhân sự

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `email_normalized` | `text` | Có | — |
| `display_name` | `text` | Có | — |
| `password_hash` | `text` | Không | — |
| `status` | `text` | Có | `'INVITED'` |
| `authz_version` | `integer` | Có | `1` |
| `password_changed_at` | `timestamptz` | Không | — |
| `email_verified_at` | `timestamptz` | Không | — |
| `created_at` | `timestamptz` | Có | `now()` |
| `version` | `integer` | Có | `1` |
| `updated_at` | `timestamptz` | Có | `now()` |

Khóa duy nhất: `email_normalized`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `identity.staff_sessions` — Phiên nhân sự

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `user_id` | `uuid` | Có | — |
| `token_hash` | `text` | Có | — |
| `csrf_hash` | `text` | Có | — |
| `last_seen_at` | `timestamptz` | Có | `now()` |
| `idle_expires_at` | `timestamptz` | Có | — |
| `absolute_expires_at` | `timestamptz` | Có | — |
| `revoked_at` | `timestamptz` | Không | — |
| `user_agent_summary` | `text` | Không | — |
| `created_at` | `timestamptz` | Có | `now()` |
| `version` | `integer` | Có | `1` |
| `updated_at` | `timestamptz` | Có | `now()` |

Khóa duy nhất: `token_hash`.
- FK `user_id` → `identity.users(id)`.
- CHECK: `idle_expires_at <= absolute_expires_at`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `identity.auth_challenges` — Xác minh email / khôi phục mật khẩu

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `user_id` | `uuid` | Không | — |
| `email_normalized` | `text` | Có | — |
| `purpose` | `text` | Có | `'PASSWORD_RESET'` |
| `token_hash` | `text` | Có | — |
| `expires_at` | `timestamptz` | Có | — |
| `consumed_at` | `timestamptz` | Không | — |
| `attempts` | `integer` | Có | `0` |
| `created_at` | `timestamptz` | Có | `now()` |
| `version` | `integer` | Có | `1` |
| `updated_at` | `timestamptz` | Có | `now()` |

Khóa duy nhất: `token_hash`.
- FK `user_id` → `identity.users(id)`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `identity.parent_sessions` — Phiên tra cứu không tài khoản

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `school_id` | `uuid` | Có | — |
| `access_link_id` | `uuid` | Có | — |
| `token_hash` | `text` | Có | — |
| `csrf_hash` | `text` | Có | — |
| `last_seen_at` | `timestamptz` | Có | `now()` |
| `idle_expires_at` | `timestamptz` | Có | — |
| `absolute_expires_at` | `timestamptz` | Có | — |
| `revoked_at` | `timestamptz` | Không | — |
| `created_at` | `timestamptz` | Có | `now()` |
| `version` | `integer` | Có | `1` |
| `updated_at` | `timestamptz` | Có | `now()` |

Khóa duy nhất: `token_hash`.
- FK `school_id` → `platform.schools(id)`.
- FK `school_id,access_link_id` → `app.parent_access_links(school_id,id)`.
- CHECK: `idle_expires_at <= absolute_expires_at`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `identity.rate_limit_buckets` — Giới hạn tần suất tối thiểu

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `bucket_hash` | `text` | Có | — |
| `window_start` | `timestamptz` | Có | — |
| `hits` | `integer` | Có | `0` |
| `expires_at` | `timestamptz` | Có | — |
| `created_at` | `timestamptz` | Có | `now()` |
| `version` | `integer` | Có | `1` |
| `updated_at` | `timestamptz` | Có | `now()` |

Khóa duy nhất: `bucket_hash,window_start`.
- CHECK: `hits >= 0`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `identity.mail_outbox` — Email bảo mật, payload mã hóa

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `user_id` | `uuid` | Không | — |
| `school_id` | `uuid` | Không | — |
| `template_key` | `text` | Có | — |
| `encrypted_payload` | `text` | Có | — |
| `dedupe_key` | `text` | Có | — |
| `status` | `text` | Có | `'PENDING'` |
| `attempts` | `integer` | Có | `0` |
| `run_after` | `timestamptz` | Có | `now()` |
| `lease_until` | `timestamptz` | Không | — |
| `lease_owner` | `text` | Không | — |
| `sent_at` | `timestamptz` | Không | — |
| `last_error_code` | `text` | Không | — |
| `created_at` | `timestamptz` | Có | `now()` |
| `version` | `integer` | Có | `1` |
| `updated_at` | `timestamptz` | Có | `now()` |

Khóa duy nhất: `dedupe_key`.
- FK `user_id` → `identity.users(id)`.
- FK `school_id` → `platform.schools(id)`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `platform.schools` — Không gian trường học

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `code` | `text` | Có | — |
| `slug` | `text` | Có | — |
| `name` | `text` | Có | — |
| `status` | `text` | Có | `'DRAFT'` |
| `timezone` | `text` | Có | `'Asia/Ho_Chi_Minh'` |
| `public_contact_email` | `text` | Không | — |
| `public_contact_phone` | `text` | Không | — |
| `public_address` | `text` | Không | — |
| `logo_object_key` | `text` | Không | — |
| `settings` | `jsonb` | Có | `'{}'::jsonb` |
| `created_at` | `timestamptz` | Có | `now()` |
| `version` | `integer` | Có | `1` |
| `updated_at` | `timestamptz` | Có | `now()` |

Khóa duy nhất: `code`; `slug`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `platform.operator_grants` — Quyền vận hành nền tảng

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `user_id` | `uuid` | Có | — |
| `action_code` | `text` | Có | — |
| `valid_from` | `timestamptz` | Có | `now()` |
| `valid_until` | `timestamptz` | Không | — |
| `revoked_at` | `timestamptz` | Không | — |
| `created_at` | `timestamptz` | Có | `now()` |
| `version` | `integer` | Có | `1` |
| `updated_at` | `timestamptz` | Có | `now()` |
- FK `user_id` → `identity.users(id)`.
- CHECK: `valid_until IS NULL OR valid_until > valid_from`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `platform.settings` — Cấu hình vận hành không chứa secret

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `key` | `text` | Có | — |
| `value` | `jsonb` | Có | `'{}'::jsonb` |
| `created_at` | `timestamptz` | Có | `now()` |
| `version` | `integer` | Có | `1` |
| `updated_at` | `timestamptz` | Có | `now()` |

Khóa duy nhất: `key`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `platform.support_tickets` — Yêu cầu hỗ trợ

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `school_id` | `uuid` | Có | — |
| `requester_id` | `uuid` | Có | — |
| `assignee_id` | `uuid` | Không | — |
| `subject` | `text` | Có | — |
| `description` | `text` | Có | — |
| `status` | `text` | Có | `'OPEN'` |
| `priority` | `text` | Có | `'NORMAL'` |
| `created_at` | `timestamptz` | Có | `now()` |
| `version` | `integer` | Có | `1` |
| `updated_at` | `timestamptz` | Có | `now()` |
- FK `school_id` → `platform.schools(id)`.
- FK `requester_id` → `identity.users(id)`.
- FK `assignee_id` → `identity.users(id)`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `platform.support_messages` — Trao đổi hỗ trợ nội bộ

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `ticket_id` | `uuid` | Có | — |
| `author_id` | `uuid` | Có | — |
| `body` | `text` | Có | — |
| `created_at` | `timestamptz` | Có | `now()` |
- FK `ticket_id` → `platform.support_tickets(id)`.
- FK `author_id` → `identity.users(id)`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `platform.support_access` — Ủy quyền hỗ trợ chỉ đọc, có hạn

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `school_id` | `uuid` | Có | — |
| `ticket_id` | `uuid` | Có | — |
| `operator_id` | `uuid` | Có | — |
| `approved_by_user_id` | `uuid` | Không | — |
| `class_id` | `uuid` | Không | — |
| `allowed_actions` | `text[]` | Có | `ARRAY[]::text[]` |
| `reason` | `text` | Có | — |
| `status` | `text` | Có | `'REQUESTED'` |
| `valid_from` | `timestamptz` | Có | — |
| `valid_until` | `timestamptz` | Có | — |
| `revoked_at` | `timestamptz` | Không | — |
| `created_at` | `timestamptz` | Có | `now()` |
| `version` | `integer` | Có | `1` |
| `updated_at` | `timestamptz` | Có | `now()` |
- FK `school_id` → `platform.schools(id)`.
- FK `ticket_id` → `platform.support_tickets(id)`.
- FK `operator_id` → `identity.users(id)`.
- FK `approved_by_user_id` → `identity.users(id)`.
- FK `school_id,class_id` → `app.classes(school_id,id)`.
- CHECK: `valid_until > valid_from`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `platform.audit_events` — Nhật ký vận hành, không payload học sinh

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `actor_id` | `uuid` | Không | — |
| `school_id` | `uuid` | Không | — |
| `action` | `text` | Có | — |
| `target_type` | `text` | Có | — |
| `target_id` | `uuid` | Không | — |
| `request_id` | `text` | Có | — |
| `redacted_diff` | `jsonb` | Có | `'{}'::jsonb` |
| `created_at` | `timestamptz` | Có | `now()` |
- FK `actor_id` → `identity.users(id)`.
- FK `school_id` → `platform.schools(id)`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `platform.operation_runs` — Kết quả kiểm tra / backup thực tế

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `kind` | `text` | Có | — |
| `status` | `text` | Có | `'QUEUED'` |
| `started_at` | `timestamptz` | Không | — |
| `finished_at` | `timestamptz` | Không | — |
| `summary` | `jsonb` | Có | `'{}'::jsonb` |
| `artifact_checksum` | `text` | Không | — |
| `artifact_location_redacted` | `text` | Không | — |
| `created_at` | `timestamptz` | Có | `now()` |
| `version` | `integer` | Có | `1` |
| `updated_at` | `timestamptz` | Có | `now()` |

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `platform.public_school_content` — Bản tin trường công khai đã duyệt

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `school_id` | `uuid` | Có | — |
| `announcement_id` | `uuid` | Có | — |
| `revision` | `integer` | Có | — |
| `title` | `text` | Có | — |
| `sanitized_html` | `text` | Có | — |
| `published_at` | `timestamptz` | Có | — |
| `withdrawn_at` | `timestamptz` | Không | — |
| `created_at` | `timestamptz` | Có | `now()` |
| `version` | `integer` | Có | `1` |
| `updated_at` | `timestamptz` | Có | `now()` |

Khóa duy nhất: `school_id,announcement_id,revision`.
- FK `school_id` → `platform.schools(id)`.
- FK `school_id,announcement_id` → `app.announcements(school_id,id)`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `app.memberships` — Thành viên và hồ sơ công tác

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `school_id` | `uuid` | Có | — |
| `user_id` | `uuid` | Có | — |
| `staff_code` | `text` | Không | — |
| `work_display_name` | `text` | Có | — |
| `department` | `text` | Không | — |
| `work_email` | `text` | Không | — |
| `work_phone` | `text` | Không | — |
| `share_work_contact` | `boolean` | Có | `false` |
| `status` | `text` | Có | `'INVITED'` |
| `joined_at` | `timestamptz` | Không | — |
| `ended_at` | `timestamptz` | Không | — |
| `created_at` | `timestamptz` | Có | `now()` |
| `version` | `integer` | Có | `1` |
| `updated_at` | `timestamptz` | Có | `now()` |

Khóa duy nhất: `school_id,id`; `school_id,user_id`; `school_id,staff_code`.
- FK `school_id` → `platform.schools(id)`.
- FK `user_id` → `identity.users(id)`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `app.roles` — Mẫu nhiệm vụ tại trường

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `school_id` | `uuid` | Có | — |
| `code` | `text` | Có | — |
| `label` | `text` | Có | — |
| `system_role` | `boolean` | Có | `false` |
| `status` | `text` | Có | `'ACTIVE'` |
| `created_at` | `timestamptz` | Có | `now()` |
| `version` | `integer` | Có | `1` |
| `updated_at` | `timestamptz` | Có | `now()` |

Khóa duy nhất: `school_id,id`; `school_id,code`.
- FK `school_id` → `platform.schools(id)`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `app.role_permissions` — Hành động của mẫu quyền

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `school_id` | `uuid` | Có | — |
| `role_id` | `uuid` | Có | — |
| `action_code` | `text` | Có | — |
| `allowed_scopes` | `text[]` | Có | `ARRAY['SCHOOL']::text[]` |
| `created_at` | `timestamptz` | Có | `now()` |
| `version` | `integer` | Có | `1` |
| `updated_at` | `timestamptz` | Có | `now()` |

Khóa duy nhất: `school_id,id`; `school_id,role_id,action_code`.
- FK `school_id` → `platform.schools(id)`.
- FK `school_id,role_id` → `app.roles(school_id,id)`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `app.role_grants` — Giao quyền đúng phạm vi và thời gian

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `school_id` | `uuid` | Có | — |
| `member_id` | `uuid` | Có | — |
| `role_id` | `uuid` | Có | — |
| `scope_type` | `text` | Có | `'SCHOOL'` |
| `class_id` | `uuid` | Không | — |
| `subject_id` | `uuid` | Không | — |
| `valid_from` | `timestamptz` | Có | `now()` |
| `valid_until` | `timestamptz` | Không | — |
| `revoked_at` | `timestamptz` | Không | — |
| `granted_by` | `uuid` | Có | — |
| `created_at` | `timestamptz` | Có | `now()` |
| `version` | `integer` | Có | `1` |
| `updated_at` | `timestamptz` | Có | `now()` |

Khóa duy nhất: `school_id,id`.
- FK `school_id` → `platform.schools(id)`.
- FK `school_id,member_id` → `app.memberships(school_id,id)`.
- FK `school_id,role_id` → `app.roles(school_id,id)`.
- FK `school_id,class_id` → `app.classes(school_id,id)`.
- FK `school_id,subject_id` → `app.subjects(school_id,id)`.
- FK `granted_by` → `identity.users(id)`.
- CHECK: `(scope_type='SCHOOL' AND class_id IS NULL AND subject_id IS NULL) OR (scope_type='CLASS' AND class_id IS NOT NULL AND subject_id IS NULL) OR (scope_type='SUBJECT' AND class_id IS NOT NULL AND subject_id IS NOT NULL)`.
- CHECK: `valid_until IS NULL OR valid_until > valid_from`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `app.staff_invitations` — Lời mời nhân sự không đăng ký tự do

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `school_id` | `uuid` | Có | — |
| `email_normalized` | `text` | Có | — |
| `token_hash` | `text` | Có | — |
| `proposed_assignments` | `jsonb` | Có | `'[]'::jsonb` |
| `status` | `text` | Có | `'PENDING'` |
| `expires_at` | `timestamptz` | Có | — |
| `invited_by` | `uuid` | Có | — |
| `accepted_at` | `timestamptz` | Không | — |
| `accepted_user_id` | `uuid` | Không | — |
| `created_at` | `timestamptz` | Có | `now()` |
| `version` | `integer` | Có | `1` |
| `updated_at` | `timestamptz` | Có | `now()` |

Khóa duy nhất: `school_id,id`; `school_id,token_hash`.
- FK `school_id` → `platform.schools(id)`.
- FK `invited_by` → `identity.users(id)`.
- FK `accepted_user_id` → `identity.users(id)`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `app.grade_levels` — Khối học

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `school_id` | `uuid` | Có | — |
| `code` | `text` | Có | — |
| `name` | `text` | Có | — |
| `sort_order` | `integer` | Có | `0` |
| `status` | `text` | Có | `'ACTIVE'` |
| `created_at` | `timestamptz` | Có | `now()` |
| `version` | `integer` | Có | `1` |
| `updated_at` | `timestamptz` | Có | `now()` |

Khóa duy nhất: `school_id,id`; `school_id,code`.
- FK `school_id` → `platform.schools(id)`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `app.subjects` — Môn học

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `school_id` | `uuid` | Có | — |
| `code` | `text` | Có | — |
| `name` | `text` | Có | — |
| `status` | `text` | Có | `'ACTIVE'` |
| `created_at` | `timestamptz` | Có | `now()` |
| `version` | `integer` | Có | `1` |
| `updated_at` | `timestamptz` | Có | `now()` |

Khóa duy nhất: `school_id,id`; `school_id,code`.
- FK `school_id` → `platform.schools(id)`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `app.rooms` — Phòng học

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `school_id` | `uuid` | Có | — |
| `code` | `text` | Có | — |
| `name` | `text` | Có | — |
| `capacity` | `integer` | Không | — |
| `status` | `text` | Có | `'ACTIVE'` |
| `created_at` | `timestamptz` | Có | `now()` |
| `version` | `integer` | Có | `1` |
| `updated_at` | `timestamptz` | Có | `now()` |

Khóa duy nhất: `school_id,id`; `school_id,code`.
- FK `school_id` → `platform.schools(id)`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `app.academic_years` — Năm học độc lập

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `school_id` | `uuid` | Có | — |
| `code` | `text` | Có | — |
| `name` | `text` | Có | — |
| `starts_on` | `date` | Có | — |
| `ends_on` | `date` | Có | — |
| `status` | `text` | Có | `'DRAFT'` |
| `created_at` | `timestamptz` | Có | `now()` |
| `version` | `integer` | Có | `1` |
| `updated_at` | `timestamptz` | Có | `now()` |

Khóa duy nhất: `school_id,id`; `school_id,code`.
- FK `school_id` → `platform.schools(id)`.
- CHECK: `ends_on > starts_on`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `app.terms` — Học kỳ

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `school_id` | `uuid` | Có | — |
| `year_id` | `uuid` | Có | — |
| `code` | `text` | Có | — |
| `name` | `text` | Có | — |
| `starts_on` | `date` | Có | — |
| `ends_on` | `date` | Có | — |
| `created_at` | `timestamptz` | Có | `now()` |
| `version` | `integer` | Có | `1` |
| `updated_at` | `timestamptz` | Có | `now()` |

Khóa duy nhất: `school_id,id`; `school_id,year_id,code`; `school_id,id,year_id`.
- FK `school_id` → `platform.schools(id)`.
- FK `school_id,year_id` → `app.academic_years(school_id,id)`.
- CHECK: `ends_on > starts_on`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `app.school_weeks` — Tuần học và hạn nhập

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `school_id` | `uuid` | Có | — |
| `year_id` | `uuid` | Có | — |
| `term_id` | `uuid` | Có | — |
| `week_number` | `integer` | Có | — |
| `starts_on` | `date` | Có | — |
| `ends_on` | `date` | Có | — |
| `input_deadline` | `timestamptz` | Không | — |
| `created_at` | `timestamptz` | Có | `now()` |
| `version` | `integer` | Có | `1` |
| `updated_at` | `timestamptz` | Có | `now()` |

Khóa duy nhất: `school_id,id`; `school_id,year_id,week_number`; `school_id,id,year_id`.
- FK `school_id` → `platform.schools(id)`.
- FK `school_id,year_id` → `app.academic_years(school_id,id)`.
- FK `school_id,term_id,year_id` → `app.terms(school_id,id,year_id)`.
- CHECK: `ends_on > starts_on`.
- CHECK: `week_number > 0`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `app.classes` — Lớp của một năm học

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `school_id` | `uuid` | Có | — |
| `year_id` | `uuid` | Có | — |
| `grade_level_id` | `uuid` | Có | — |
| `code` | `text` | Có | — |
| `name` | `text` | Có | — |
| `capacity` | `integer` | Có | `45` |
| `status` | `text` | Có | `'DRAFT'` |
| `created_at` | `timestamptz` | Có | `now()` |
| `version` | `integer` | Có | `1` |
| `updated_at` | `timestamptz` | Có | `now()` |

Khóa duy nhất: `school_id,id`; `school_id,year_id,code`; `school_id,id,year_id`.
- FK `school_id` → `platform.schools(id)`.
- FK `school_id,year_id` → `app.academic_years(school_id,id)`.
- FK `school_id,grade_level_id` → `app.grade_levels(school_id,id)`.
- CHECK: `capacity > 0`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `app.calendar_events` — Ngày nghỉ / mốc công việc

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `school_id` | `uuid` | Có | — |
| `year_id` | `uuid` | Có | — |
| `class_id` | `uuid` | Không | — |
| `title` | `text` | Có | — |
| `kind` | `text` | Có | `'HOLIDAY'` |
| `starts_on` | `date` | Có | — |
| `ends_on` | `date` | Có | — |
| `status` | `text` | Có | `'DRAFT'` |
| `created_at` | `timestamptz` | Có | `now()` |
| `version` | `integer` | Có | `1` |
| `updated_at` | `timestamptz` | Có | `now()` |

Khóa duy nhất: `school_id,id`.
- FK `school_id` → `platform.schools(id)`.
- FK `school_id,year_id` → `app.academic_years(school_id,id)`.
- FK `school_id,class_id,year_id` → `app.classes(school_id,id,year_id)`.
- CHECK: `ends_on > starts_on`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `app.teaching_assignments` — Phân công chủ nhiệm / bộ môn

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `school_id` | `uuid` | Có | — |
| `class_id` | `uuid` | Có | — |
| `member_id` | `uuid` | Có | — |
| `role_grant_id` | `uuid` | Có | — |
| `subject_id` | `uuid` | Không | — |
| `kind` | `text` | Có | `'HOMEROOM'` |
| `starts_on` | `date` | Có | — |
| `ends_on` | `date` | Không | — |
| `revoked_at` | `timestamptz` | Không | — |
| `created_at` | `timestamptz` | Có | `now()` |
| `version` | `integer` | Có | `1` |
| `updated_at` | `timestamptz` | Có | `now()` |

Khóa duy nhất: `school_id,id`; `school_id,role_grant_id`.
- FK `school_id` → `platform.schools(id)`.
- FK `school_id,class_id` → `app.classes(school_id,id)`.
- FK `school_id,member_id` → `app.memberships(school_id,id)`.
- FK `school_id,role_grant_id` → `app.role_grants(school_id,id)`.
- FK `school_id,subject_id` → `app.subjects(school_id,id)`.
- CHECK: `(kind='HOMEROOM' AND subject_id IS NULL) OR (kind='SUBJECT' AND subject_id IS NOT NULL)`.
- CHECK: `ends_on IS NULL OR ends_on > starts_on`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `app.students` — Hồ sơ học sinh tối thiểu

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `school_id` | `uuid` | Có | — |
| `student_code` | `text` | Có | — |
| `full_name` | `text` | Có | — |
| `date_of_birth` | `date` | Không | — |
| `preferred_name` | `text` | Không | — |
| `status` | `text` | Có | `'ACTIVE'` |
| `internal_note` | `text` | Không | — |
| `created_at` | `timestamptz` | Có | `now()` |
| `version` | `integer` | Có | `1` |
| `updated_at` | `timestamptz` | Có | `now()` |

Khóa duy nhất: `school_id,id`; `school_id,student_code`.
- FK `school_id` → `platform.schools(id)`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `app.enrollments` — Quá trình theo học có thời hạn

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `school_id` | `uuid` | Có | — |
| `student_id` | `uuid` | Có | — |
| `class_id` | `uuid` | Có | — |
| `year_id` | `uuid` | Có | — |
| `starts_on` | `date` | Có | — |
| `ends_on` | `date` | Không | — |
| `status` | `text` | Có | `'ACTIVE'` |
| `created_at` | `timestamptz` | Có | `now()` |
| `version` | `integer` | Có | `1` |
| `updated_at` | `timestamptz` | Có | `now()` |

Khóa duy nhất: `school_id,id`; `school_id,id,class_id`; `school_id,id,student_id,year_id`.
- FK `school_id` → `platform.schools(id)`.
- FK `school_id,student_id` → `app.students(school_id,id)`.
- FK `school_id,class_id,year_id` → `app.classes(school_id,id,year_id)`.
- CHECK: `ends_on IS NULL OR ends_on > starts_on`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `app.guardians` — Liên hệ người giám hộ, không user

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `school_id` | `uuid` | Có | — |
| `full_name` | `text` | Có | — |
| `phone` | `text` | Không | — |
| `email` | `text` | Không | — |
| `status` | `text` | Có | `'ACTIVE'` |
| `created_at` | `timestamptz` | Có | `now()` |
| `version` | `integer` | Có | `1` |
| `updated_at` | `timestamptz` | Có | `now()` |

Khóa duy nhất: `school_id,id`.
- FK `school_id` → `platform.schools(id)`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `app.guardian_relationships` — Quan hệ và quyền nhận thông tin

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `school_id` | `uuid` | Có | — |
| `student_id` | `uuid` | Có | — |
| `guardian_id` | `uuid` | Có | — |
| `relationship_label` | `text` | Có | — |
| `is_primary` | `boolean` | Có | `false` |
| `can_receive_info` | `boolean` | Có | `false` |
| `status` | `text` | Có | `'UNVERIFIED'` |
| `verified_by` | `uuid` | Không | — |
| `verified_at` | `timestamptz` | Không | — |
| `revoked_at` | `timestamptz` | Không | — |
| `created_at` | `timestamptz` | Có | `now()` |
| `version` | `integer` | Có | `1` |
| `updated_at` | `timestamptz` | Có | `now()` |

Khóa duy nhất: `school_id,id`; `school_id,student_id,guardian_id`; `school_id,id,student_id`.
- FK `school_id` → `platform.schools(id)`.
- FK `school_id,student_id` → `app.students(school_id,id)`.
- FK `school_id,guardian_id` → `app.guardians(school_id,id)`.
- FK `verified_by` → `identity.users(id)`.
- CHECK: `status <> 'VERIFIED' OR (verified_by IS NOT NULL AND verified_at IS NOT NULL)`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `app.parent_access_links` — Chìa khóa tra cứu một học sinh/năm

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `school_id` | `uuid` | Có | — |
| `student_id` | `uuid` | Có | — |
| `year_id` | `uuid` | Có | — |
| `relationship_id` | `uuid` | Có | — |
| `token_hash` | `text` | Có | — |
| `allowed_sections` | `text[]` | Có | `ARRAY['overview','teachers','announcements']::text[]` |
| `allow_download` | `boolean` | Có | `false` |
| `expires_at` | `timestamptz` | Có | — |
| `revoked_at` | `timestamptz` | Không | — |
| `revoke_reason` | `text` | Không | — |
| `issued_by` | `uuid` | Có | — |
| `created_at` | `timestamptz` | Có | `now()` |
| `version` | `integer` | Có | `1` |
| `updated_at` | `timestamptz` | Có | `now()` |

Khóa duy nhất: `school_id,id`; `school_id,token_hash`; `school_id,id,student_id,year_id`.
- FK `school_id` → `platform.schools(id)`.
- FK `school_id,student_id` → `app.students(school_id,id)`.
- FK `school_id,year_id` → `app.academic_years(school_id,id)`.
- FK `issued_by` → `identity.users(id)`.
- FK `school_id,relationship_id,student_id` → `app.guardian_relationships(school_id,id,student_id)`.
- CHECK: `expires_at > created_at`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `app.parent_access_events` — Sử dụng link, không chứng minh danh tính

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `school_id` | `uuid` | Có | — |
| `access_link_id` | `uuid` | Có | — |
| `event_kind` | `text` | Có | — |
| `request_id` | `text` | Có | — |
| `ip_daily_hash` | `text` | Không | — |
| `device_summary` | `text` | Không | — |
| `section` | `text` | Không | — |
| `created_at` | `timestamptz` | Có | `now()` |

Khóa duy nhất: `school_id,id`.
- FK `school_id` → `platform.schools(id)`.
- FK `school_id,access_link_id` → `app.parent_access_links(school_id,id)`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `app.transfer_requests` — Yêu cầu chuyển lớp / ngừng học

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `school_id` | `uuid` | Có | — |
| `student_id` | `uuid` | Có | — |
| `from_enrollment_id` | `uuid` | Có | — |
| `to_class_id` | `uuid` | Không | — |
| `effective_on` | `date` | Có | — |
| `reason` | `text` | Có | — |
| `status` | `text` | Có | `'DRAFT'` |
| `requested_by` | `uuid` | Có | — |
| `decided_by` | `uuid` | Không | — |
| `applied_at` | `timestamptz` | Không | — |
| `created_at` | `timestamptz` | Có | `now()` |
| `version` | `integer` | Có | `1` |
| `updated_at` | `timestamptz` | Có | `now()` |

Khóa duy nhất: `school_id,id`.
- FK `school_id` → `platform.schools(id)`.
- FK `school_id,student_id` → `app.students(school_id,id)`.
- FK `school_id,from_enrollment_id` → `app.enrollments(school_id,id)`.
- FK `school_id,to_class_id` → `app.classes(school_id,id)`.
- FK `requested_by` → `identity.users(id)`.
- FK `decided_by` → `identity.users(id)`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `app.handover_requests` — Bàn giao chủ nhiệm

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `school_id` | `uuid` | Có | — |
| `class_id` | `uuid` | Có | — |
| `from_assignment_id` | `uuid` | Có | — |
| `to_member_id` | `uuid` | Có | — |
| `effective_on` | `date` | Có | — |
| `reason` | `text` | Có | — |
| `checklist` | `jsonb` | Có | `'{}'::jsonb` |
| `status` | `text` | Có | `'DRAFT'` |
| `requested_by` | `uuid` | Có | — |
| `decided_by` | `uuid` | Không | — |
| `created_at` | `timestamptz` | Có | `now()` |
| `version` | `integer` | Có | `1` |
| `updated_at` | `timestamptz` | Có | `now()` |

Khóa duy nhất: `school_id,id`.
- FK `school_id` → `platform.schools(id)`.
- FK `school_id,class_id` → `app.classes(school_id,id)`.
- FK `school_id,from_assignment_id` → `app.teaching_assignments(school_id,id)`.
- FK `school_id,to_member_id` → `app.memberships(school_id,id)`.
- FK `requested_by` → `identity.users(id)`.
- FK `decided_by` → `identity.users(id)`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `app.rollover_batches` — Chuẩn bị năm mới có xem trước

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `school_id` | `uuid` | Có | — |
| `source_year_id` | `uuid` | Có | — |
| `target_year_id` | `uuid` | Có | — |
| `plan` | `jsonb` | Có | `'[]'::jsonb` |
| `plan_hash` | `text` | Không | — |
| `status` | `text` | Có | `'DRAFT'` |
| `requested_by` | `uuid` | Có | — |
| `applied_at` | `timestamptz` | Không | — |
| `created_at` | `timestamptz` | Có | `now()` |
| `version` | `integer` | Có | `1` |
| `updated_at` | `timestamptz` | Có | `now()` |

Khóa duy nhất: `school_id,id`.
- FK `school_id` → `platform.schools(id)`.
- FK `school_id,source_year_id` → `app.academic_years(school_id,id)`.
- FK `school_id,target_year_id` → `app.academic_years(school_id,id)`.
- FK `requested_by` → `identity.users(id)`.
- CHECK: `source_year_id <> target_year_id`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `app.class_groups` — Tổ trong lớp

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `school_id` | `uuid` | Có | — |
| `class_id` | `uuid` | Có | — |
| `name` | `text` | Có | — |
| `sort_order` | `integer` | Có | `0` |
| `created_at` | `timestamptz` | Có | `now()` |
| `version` | `integer` | Có | `1` |
| `updated_at` | `timestamptz` | Có | `now()` |

Khóa duy nhất: `school_id,id`; `school_id,class_id,name`; `school_id,id,class_id`.
- FK `school_id` → `platform.schools(id)`.
- FK `school_id,class_id` → `app.classes(school_id,id)`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `app.class_positions` — Chức vụ học sinh

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `school_id` | `uuid` | Có | — |
| `class_id` | `uuid` | Có | — |
| `code` | `text` | Có | — |
| `name` | `text` | Có | — |
| `single_holder` | `boolean` | Có | `true` |
| `created_at` | `timestamptz` | Có | `now()` |
| `version` | `integer` | Có | `1` |
| `updated_at` | `timestamptz` | Có | `now()` |

Khóa duy nhất: `school_id,id`; `school_id,class_id,code`; `school_id,id,class_id`.
- FK `school_id` → `platform.schools(id)`.
- FK `school_id,class_id` → `app.classes(school_id,id)`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `app.group_memberships` — Lịch sử xếp tổ

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `school_id` | `uuid` | Có | — |
| `class_id` | `uuid` | Có | — |
| `group_id` | `uuid` | Có | — |
| `enrollment_id` | `uuid` | Có | — |
| `starts_on` | `date` | Có | — |
| `ends_on` | `date` | Không | — |
| `created_at` | `timestamptz` | Có | `now()` |
| `version` | `integer` | Có | `1` |
| `updated_at` | `timestamptz` | Có | `now()` |

Khóa duy nhất: `school_id,id`.
- FK `school_id` → `platform.schools(id)`.
- FK `school_id,group_id,class_id` → `app.class_groups(school_id,id,class_id)`.
- FK `school_id,enrollment_id,class_id` → `app.enrollments(school_id,id,class_id)`.
- CHECK: `ends_on IS NULL OR ends_on > starts_on`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `app.position_assignments` — Lịch sử giao chức vụ

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `school_id` | `uuid` | Có | — |
| `class_id` | `uuid` | Có | — |
| `position_id` | `uuid` | Có | — |
| `enrollment_id` | `uuid` | Có | — |
| `starts_on` | `date` | Có | — |
| `ends_on` | `date` | Không | — |
| `created_at` | `timestamptz` | Có | `now()` |
| `version` | `integer` | Có | `1` |
| `updated_at` | `timestamptz` | Có | `now()` |

Khóa duy nhất: `school_id,id`.
- FK `school_id` → `platform.schools(id)`.
- FK `school_id,position_id,class_id` → `app.class_positions(school_id,id,class_id)`.
- FK `school_id,enrollment_id,class_id` → `app.enrollments(school_id,id,class_id)`.
- CHECK: `ends_on IS NULL OR ends_on > starts_on`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `app.seating_plans` — Phiên bản sơ đồ lớp

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `school_id` | `uuid` | Có | — |
| `class_id` | `uuid` | Có | — |
| `revision` | `integer` | Có | — |
| `effective_on` | `date` | Có | — |
| `status` | `text` | Có | `'DRAFT'` |
| `layout` | `jsonb` | Có | `'{}'::jsonb` |
| `created_by` | `uuid` | Có | — |
| `created_at` | `timestamptz` | Có | `now()` |
| `version` | `integer` | Có | `1` |
| `updated_at` | `timestamptz` | Có | `now()` |

Khóa duy nhất: `school_id,id`; `school_id,class_id,revision`; `school_id,id,class_id`.
- FK `school_id` → `platform.schools(id)`.
- FK `school_id,class_id` → `app.classes(school_id,id)`.
- FK `created_by` → `identity.users(id)`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `app.seat_assignments` — Vị trí ngồi của một bản sơ đồ

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `school_id` | `uuid` | Có | — |
| `class_id` | `uuid` | Có | — |
| `plan_id` | `uuid` | Có | — |
| `seat_key` | `text` | Có | — |
| `enrollment_id` | `uuid` | Không | — |
| `created_at` | `timestamptz` | Có | `now()` |
| `version` | `integer` | Có | `1` |
| `updated_at` | `timestamptz` | Có | `now()` |

Khóa duy nhất: `school_id,id`; `school_id,plan_id,seat_key`; `school_id,plan_id,enrollment_id`.
- FK `school_id` → `platform.schools(id)`.
- FK `school_id,plan_id,class_id` → `app.seating_plans(school_id,id,class_id)`.
- FK `school_id,enrollment_id,class_id` → `app.enrollments(school_id,id,class_id)`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `app.rule_sets` — Bộ nội quy có phiên bản

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `school_id` | `uuid` | Có | — |
| `name` | `text` | Có | — |
| `revision` | `integer` | Có | — |
| `base_points` | `numeric(10,2)` | Có | `100` |
| `minimum_points` | `numeric(10,2)` | Không | — |
| `maximum_points` | `numeric(10,2)` | Không | — |
| `status` | `text` | Có | `'DRAFT'` |
| `issued_at` | `timestamptz` | Không | — |
| `issued_by` | `uuid` | Không | — |
| `created_at` | `timestamptz` | Có | `now()` |
| `version` | `integer` | Có | `1` |
| `updated_at` | `timestamptz` | Có | `now()` |

Khóa duy nhất: `school_id,id`.
- FK `school_id` → `platform.schools(id)`.
- FK `issued_by` → `identity.users(id)`.
- CHECK: `minimum_points IS NULL OR maximum_points IS NULL OR minimum_points <= maximum_points`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `app.conduct_rules` — Quy tắc cộng trừ

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `school_id` | `uuid` | Có | — |
| `rule_set_id` | `uuid` | Có | — |
| `code` | `text` | Có | — |
| `label` | `text` | Có | — |
| `group_name` | `text` | Có | — |
| `value_mode` | `text` | Có | `'FIXED'` |
| `default_delta` | `numeric(10,2)` | Có | — |
| `minimum_delta` | `numeric(10,2)` | Không | — |
| `maximum_delta` | `numeric(10,2)` | Không | — |
| `max_occurrences_per_day` | `integer` | Không | — |
| `reason_required` | `boolean` | Có | `true` |
| `created_at` | `timestamptz` | Có | `now()` |
| `version` | `integer` | Có | `1` |
| `updated_at` | `timestamptz` | Có | `now()` |

Khóa duy nhất: `school_id,id`; `school_id,rule_set_id,code`; `school_id,id,rule_set_id`.
- FK `school_id` → `platform.schools(id)`.
- FK `school_id,rule_set_id` → `app.rule_sets(school_id,id)`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `app.rule_thresholds` — Mốc xếp loại nội bộ

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `school_id` | `uuid` | Có | — |
| `rule_set_id` | `uuid` | Có | — |
| `label` | `text` | Có | — |
| `minimum_score` | `numeric(10,2)` | Có | — |
| `sort_order` | `integer` | Có | — |
| `created_at` | `timestamptz` | Có | `now()` |
| `version` | `integer` | Có | `1` |
| `updated_at` | `timestamptz` | Có | `now()` |

Khóa duy nhất: `school_id,id`; `school_id,rule_set_id,minimum_score`.
- FK `school_id` → `platform.schools(id)`.
- FK `school_id,rule_set_id` → `app.rule_sets(school_id,id)`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `app.class_rule_periods` — Nội quy áp dụng theo giai đoạn lớp

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `school_id` | `uuid` | Có | — |
| `class_id` | `uuid` | Có | — |
| `rule_set_id` | `uuid` | Có | — |
| `starts_on` | `date` | Có | — |
| `ends_on` | `date` | Không | — |
| `created_at` | `timestamptz` | Có | `now()` |
| `version` | `integer` | Có | `1` |
| `updated_at` | `timestamptz` | Có | `now()` |

Khóa duy nhất: `school_id,id`.
- FK `school_id` → `platform.schools(id)`.
- FK `school_id,class_id` → `app.classes(school_id,id)`.
- FK `school_id,rule_set_id` → `app.rule_sets(school_id,id)`.
- CHECK: `ends_on IS NULL OR ends_on > starts_on`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `app.attendance_sessions` — Buổi / tiết điểm danh

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `school_id` | `uuid` | Có | — |
| `class_id` | `uuid` | Có | — |
| `year_id` | `uuid` | Có | — |
| `session_date` | `date` | Có | — |
| `granularity` | `text` | Có | `'DAILY'` |
| `slot_key` | `text` | Có | — |
| `lesson_id` | `uuid` | Không | — |
| `status` | `text` | Có | `'OPEN'` |
| `created_by` | `uuid` | Có | — |
| `created_at` | `timestamptz` | Có | `now()` |
| `version` | `integer` | Có | `1` |
| `updated_at` | `timestamptz` | Có | `now()` |

Khóa duy nhất: `school_id,id`; `school_id,class_id,session_date,slot_key`; `school_id,id,class_id`.
- FK `school_id` → `platform.schools(id)`.
- FK `school_id,class_id,year_id` → `app.classes(school_id,id,year_id)`.
- FK `school_id,lesson_id` → `app.lesson_occurrences(school_id,id)`.
- FK `created_by` → `identity.users(id)`.
- CHECK: `(granularity='DAILY' AND lesson_id IS NULL AND slot_key='daily') OR (granularity='LESSON' AND lesson_id IS NOT NULL AND slot_key<>'daily')`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `app.attendance_records` — Trạng thái chuyên cần từng học sinh

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `school_id` | `uuid` | Có | — |
| `class_id` | `uuid` | Có | — |
| `session_id` | `uuid` | Có | — |
| `enrollment_id` | `uuid` | Có | — |
| `status` | `text` | Có | `'UNMARKED'` |
| `late_minutes` | `integer` | Không | — |
| `public_note` | `text` | Không | — |
| `internal_note` | `text` | Không | — |
| `recorded_by` | `uuid` | Có | — |
| `created_at` | `timestamptz` | Có | `now()` |
| `version` | `integer` | Có | `1` |
| `updated_at` | `timestamptz` | Có | `now()` |

Khóa duy nhất: `school_id,id`; `school_id,session_id,enrollment_id`.
- FK `school_id` → `platform.schools(id)`.
- FK `school_id,session_id,class_id` → `app.attendance_sessions(school_id,id,class_id)`.
- FK `school_id,enrollment_id,class_id` → `app.enrollments(school_id,id,class_id)`.
- FK `recorded_by` → `identity.users(id)`.
- CHECK: `late_minutes IS NULL OR late_minutes >= 0`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `app.conduct_periods` — Kỳ thi đua của lớp

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `school_id` | `uuid` | Có | — |
| `class_id` | `uuid` | Có | — |
| `year_id` | `uuid` | Có | — |
| `week_id` | `uuid` | Có | — |
| `rule_set_id` | `uuid` | Có | — |
| `status` | `text` | Có | `'OPEN'` |
| `data_version` | `integer` | Có | `1` |
| `input_deadline` | `timestamptz` | Không | — |
| `locked_at` | `timestamptz` | Không | — |
| `locked_by` | `uuid` | Không | — |
| `created_at` | `timestamptz` | Có | `now()` |
| `version` | `integer` | Có | `1` |
| `updated_at` | `timestamptz` | Có | `now()` |

Khóa duy nhất: `school_id,id`; `school_id,class_id,week_id`; `school_id,id,class_id`; `school_id,id,rule_set_id`.
- FK `school_id` → `platform.schools(id)`.
- FK `school_id,class_id,year_id` → `app.classes(school_id,id,year_id)`.
- FK `school_id,week_id,year_id` → `app.school_weeks(school_id,id,year_id)`.
- FK `school_id,rule_set_id` → `app.rule_sets(school_id,id)`.
- FK `locked_by` → `identity.users(id)`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `app.conduct_records` — Sổ sự kiện thi đua có nguồn

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `school_id` | `uuid` | Có | — |
| `class_id` | `uuid` | Có | — |
| `period_id` | `uuid` | Có | — |
| `rule_set_id` | `uuid` | Có | — |
| `rule_id` | `uuid` | Có | — |
| `enrollment_id` | `uuid` | Có | — |
| `delta_snapshot` | `numeric(10,2)` | Có | — |
| `rule_label_snapshot` | `text` | Có | — |
| `public_reason` | `text` | Có | — |
| `internal_note` | `text` | Không | — |
| `occurred_at` | `timestamptz` | Có | — |
| `status` | `text` | Có | `'DRAFT'` |
| `source_kind` | `text` | Có | — |
| `source_key` | `text` | Có | — |
| `supersedes_id` | `uuid` | Không | — |
| `recorded_by` | `uuid` | Có | — |
| `approved_by` | `uuid` | Không | — |
| `approved_at` | `timestamptz` | Không | — |
| `created_at` | `timestamptz` | Có | `now()` |
| `version` | `integer` | Có | `1` |
| `updated_at` | `timestamptz` | Có | `now()` |

Khóa duy nhất: `school_id,id`.
- FK `school_id` → `platform.schools(id)`.
- FK `school_id,period_id,class_id` → `app.conduct_periods(school_id,id,class_id)`.
- FK `school_id,enrollment_id,class_id` → `app.enrollments(school_id,id,class_id)`.
- FK `school_id,period_id,rule_set_id` → `app.conduct_periods(school_id,id,rule_set_id)`.
- FK `school_id,rule_id,rule_set_id` → `app.conduct_rules(school_id,id,rule_set_id)`.
- FK `school_id,supersedes_id` → `app.conduct_records(school_id,id)`.
- FK `recorded_by` → `identity.users(id)`.
- FK `approved_by` → `identity.users(id)`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `app.adjustment_requests` — Điều chỉnh có phê duyệt sau chốt

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `school_id` | `uuid` | Có | — |
| `period_id` | `uuid` | Có | — |
| `baseline_publication_id` | `uuid` | Có | — |
| `reason` | `text` | Có | — |
| `proposed_changes` | `jsonb` | Có | `'[]'::jsonb` |
| `status` | `text` | Có | `'SUBMITTED'` |
| `requested_by` | `uuid` | Có | — |
| `decided_by` | `uuid` | Không | — |
| `decided_at` | `timestamptz` | Không | — |
| `applied_at` | `timestamptz` | Không | — |
| `created_at` | `timestamptz` | Có | `now()` |
| `version` | `integer` | Có | `1` |
| `updated_at` | `timestamptz` | Có | `now()` |

Khóa duy nhất: `school_id,id`.
- FK `school_id` → `platform.schools(id)`.
- FK `school_id,period_id` → `app.conduct_periods(school_id,id)`.
- FK `school_id,baseline_publication_id` → `app.publication_revisions(school_id,id)`.
- FK `requested_by` → `identity.users(id)`.
- FK `decided_by` → `identity.users(id)`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `app.timetable_versions` — Lịch tuần nháp và bản công bố

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `school_id` | `uuid` | Có | — |
| `class_id` | `uuid` | Có | — |
| `year_id` | `uuid` | Có | — |
| `revision` | `integer` | Có | — |
| `starts_on` | `date` | Có | — |
| `ends_on` | `date` | Có | — |
| `status` | `text` | Có | `'DRAFT'` |
| `created_by` | `uuid` | Có | — |
| `created_at` | `timestamptz` | Có | `now()` |
| `version` | `integer` | Có | `1` |
| `updated_at` | `timestamptz` | Có | `now()` |

Khóa duy nhất: `school_id,id`; `school_id,class_id,revision`; `school_id,id,class_id`.
- FK `school_id` → `platform.schools(id)`.
- FK `school_id,class_id,year_id` → `app.classes(school_id,id,year_id)`.
- FK `created_by` → `identity.users(id)`.
- CHECK: `ends_on > starts_on`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `app.timetable_entries` — Tiết học mẫu trong tuần

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `school_id` | `uuid` | Có | — |
| `class_id` | `uuid` | Có | — |
| `timetable_id` | `uuid` | Có | — |
| `subject_id` | `uuid` | Có | — |
| `member_id` | `uuid` | Có | — |
| `room_id` | `uuid` | Không | — |
| `weekday` | `integer` | Có | — |
| `period_number` | `integer` | Có | — |
| `starts_at_local` | `time` | Có | — |
| `ends_at_local` | `time` | Có | — |
| `created_at` | `timestamptz` | Có | `now()` |
| `version` | `integer` | Có | `1` |
| `updated_at` | `timestamptz` | Có | `now()` |

Khóa duy nhất: `school_id,id`; `school_id,timetable_id,weekday,period_number`.
- FK `school_id` → `platform.schools(id)`.
- FK `school_id,timetable_id,class_id` → `app.timetable_versions(school_id,id,class_id)`.
- FK `school_id,subject_id` → `app.subjects(school_id,id)`.
- FK `school_id,member_id` → `app.memberships(school_id,id)`.
- FK `school_id,room_id` → `app.rooms(school_id,id)`.
- CHECK: `weekday BETWEEN 1 AND 7`.
- CHECK: `period_number > 0`.
- CHECK: `ends_at_local > starts_at_local`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `app.lesson_occurrences` — Tiết học thực tế và kiểm tra trùng

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `school_id` | `uuid` | Có | — |
| `class_id` | `uuid` | Có | — |
| `timetable_id` | `uuid` | Có | — |
| `subject_id` | `uuid` | Có | — |
| `member_id` | `uuid` | Có | — |
| `room_id` | `uuid` | Không | — |
| `starts_at` | `timestamptz` | Có | — |
| `ends_at` | `timestamptz` | Có | — |
| `status` | `text` | Có | `'SCHEDULED'` |
| `change_reason` | `text` | Không | — |
| `created_at` | `timestamptz` | Có | `now()` |
| `version` | `integer` | Có | `1` |
| `updated_at` | `timestamptz` | Có | `now()` |

Khóa duy nhất: `school_id,id`.
- FK `school_id` → `platform.schools(id)`.
- FK `school_id,timetable_id,class_id` → `app.timetable_versions(school_id,id,class_id)`.
- FK `school_id,subject_id` → `app.subjects(school_id,id)`.
- FK `school_id,member_id` → `app.memberships(school_id,id)`.
- FK `school_id,room_id` → `app.rooms(school_id,id)`.
- CHECK: `ends_at > starts_at`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `app.duty_schedules` — Lịch trực nhật của lớp

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `school_id` | `uuid` | Có | — |
| `class_id` | `uuid` | Có | — |
| `year_id` | `uuid` | Có | — |
| `starts_on` | `date` | Có | — |
| `ends_on` | `date` | Có | — |
| `status` | `text` | Có | `'DRAFT'` |
| `created_by` | `uuid` | Có | — |
| `created_at` | `timestamptz` | Có | `now()` |
| `version` | `integer` | Có | `1` |
| `updated_at` | `timestamptz` | Có | `now()` |

Khóa duy nhất: `school_id,id`; `school_id,id,class_id`.
- FK `school_id` → `platform.schools(id)`.
- FK `school_id,class_id,year_id` → `app.classes(school_id,id,year_id)`.
- FK `created_by` → `identity.users(id)`.
- CHECK: `ends_on > starts_on`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `app.duty_assignments` — Nhiệm vụ từng học sinh

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `school_id` | `uuid` | Có | — |
| `class_id` | `uuid` | Có | — |
| `schedule_id` | `uuid` | Có | — |
| `enrollment_id` | `uuid` | Có | — |
| `duty_date` | `date` | Có | — |
| `task` | `text` | Có | — |
| `status` | `text` | Có | `'ASSIGNED'` |
| `created_at` | `timestamptz` | Có | `now()` |
| `version` | `integer` | Có | `1` |
| `updated_at` | `timestamptz` | Có | `now()` |

Khóa duy nhất: `school_id,id`.
- FK `school_id` → `platform.schools(id)`.
- FK `school_id,schedule_id,class_id` → `app.duty_schedules(school_id,id,class_id)`.
- FK `school_id,enrollment_id,class_id` → `app.enrollments(school_id,id,class_id)`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `app.activities` — Hoạt động do giáo viên tổ chức

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `school_id` | `uuid` | Có | — |
| `class_id` | `uuid` | Có | — |
| `year_id` | `uuid` | Có | — |
| `title` | `text` | Có | — |
| `description` | `text` | Có | — |
| `due_at` | `timestamptz` | Có | — |
| `status` | `text` | Có | `'DRAFT'` |
| `evidence_required` | `boolean` | Có | `false` |
| `created_by` | `uuid` | Có | — |
| `created_at` | `timestamptz` | Có | `now()` |
| `version` | `integer` | Có | `1` |
| `updated_at` | `timestamptz` | Có | `now()` |

Khóa duy nhất: `school_id,id`; `school_id,id,class_id`.
- FK `school_id` → `platform.schools(id)`.
- FK `school_id,class_id,year_id` → `app.classes(school_id,id,year_id)`.
- FK `created_by` → `identity.users(id)`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `app.activity_participants` — Học sinh được giao hoạt động

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `school_id` | `uuid` | Có | — |
| `class_id` | `uuid` | Có | — |
| `activity_id` | `uuid` | Có | — |
| `enrollment_id` | `uuid` | Có | — |
| `status` | `text` | Có | `'ASSIGNED'` |
| `review_note` | `text` | Không | — |
| `reviewed_by` | `uuid` | Không | — |
| `reviewed_at` | `timestamptz` | Không | — |
| `created_at` | `timestamptz` | Có | `now()` |
| `version` | `integer` | Có | `1` |
| `updated_at` | `timestamptz` | Có | `now()` |

Khóa duy nhất: `school_id,id`; `school_id,activity_id,enrollment_id`.
- FK `school_id` → `platform.schools(id)`.
- FK `school_id,activity_id,class_id` → `app.activities(school_id,id,class_id)`.
- FK `school_id,enrollment_id,class_id` → `app.enrollments(school_id,id,class_id)`.
- FK `reviewed_by` → `identity.users(id)`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `app.files` — Metadata tệp riêng tư

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `school_id` | `uuid` | Có | — |
| `object_key` | `text` | Có | — |
| `original_name` | `text` | Có | — |
| `content_type` | `text` | Có | — |
| `byte_size` | `bigint` | Có | — |
| `sha256` | `text` | Có | — |
| `status` | `text` | Có | `'UPLOADING'` |
| `storage_driver` | `text` | Có | `'local'` |
| `uploaded_by` | `uuid` | Có | — |
| `expires_at` | `timestamptz` | Không | — |
| `created_at` | `timestamptz` | Có | `now()` |
| `version` | `integer` | Có | `1` |
| `updated_at` | `timestamptz` | Có | `now()` |

Khóa duy nhất: `school_id,id`; `school_id,object_key`.
- FK `school_id` → `platform.schools(id)`.
- FK `uploaded_by` → `identity.users(id)`.
- CHECK: `byte_size >= 0`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `app.evidence` — Minh chứng giáo viên tải thay

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `school_id` | `uuid` | Có | — |
| `participant_id` | `uuid` | Có | — |
| `file_id` | `uuid` | Có | — |
| `submitted_by` | `uuid` | Có | — |
| `caption` | `text` | Không | — |
| `status` | `text` | Có | `'SUBMITTED'` |
| `reviewed_by` | `uuid` | Không | — |
| `reviewed_at` | `timestamptz` | Không | — |
| `review_reason` | `text` | Không | — |
| `share_with_guardian` | `boolean` | Có | `false` |
| `created_at` | `timestamptz` | Có | `now()` |
| `version` | `integer` | Có | `1` |
| `updated_at` | `timestamptz` | Có | `now()` |

Khóa duy nhất: `school_id,id`.
- FK `school_id` → `platform.schools(id)`.
- FK `school_id,participant_id` → `app.activity_participants(school_id,id)`.
- FK `school_id,file_id` → `app.files(school_id,id)`.
- FK `submitted_by` → `identity.users(id)`.
- FK `reviewed_by` → `identity.users(id)`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `app.announcements` — Thông báo và quy trình công bố

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `school_id` | `uuid` | Có | — |
| `year_id` | `uuid` | Có | — |
| `class_id` | `uuid` | Không | — |
| `title` | `text` | Có | — |
| `sanitized_html` | `text` | Có | — |
| `status` | `text` | Có | `'DRAFT'` |
| `scheduled_at` | `timestamptz` | Không | — |
| `created_by` | `uuid` | Có | — |
| `created_at` | `timestamptz` | Có | `now()` |
| `version` | `integer` | Có | `1` |
| `updated_at` | `timestamptz` | Có | `now()` |

Khóa duy nhất: `school_id,id`.
- FK `school_id` → `platform.schools(id)`.
- FK `school_id,year_id` → `app.academic_years(school_id,id)`.
- FK `school_id,class_id,year_id` → `app.classes(school_id,id,year_id)`.
- FK `created_by` → `identity.users(id)`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `app.announcement_targets` — Đối tượng nhận thông báo

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `school_id` | `uuid` | Có | — |
| `announcement_id` | `uuid` | Có | — |
| `audience_kind` | `text` | Có | `'PUBLIC'` |
| `grade_id` | `uuid` | Không | — |
| `class_id` | `uuid` | Không | — |
| `student_id` | `uuid` | Không | — |
| `member_id` | `uuid` | Không | — |
| `created_at` | `timestamptz` | Có | `now()` |
| `version` | `integer` | Có | `1` |
| `updated_at` | `timestamptz` | Có | `now()` |

Khóa duy nhất: `school_id,id`.
- FK `school_id` → `platform.schools(id)`.
- FK `school_id,announcement_id` → `app.announcements(school_id,id)`.
- FK `school_id,grade_id` → `app.grade_levels(school_id,id)`.
- FK `school_id,class_id` → `app.classes(school_id,id)`.
- FK `school_id,student_id` → `app.students(school_id,id)`.
- FK `school_id,member_id` → `app.memberships(school_id,id)`.
- CHECK: `(audience_kind IN ('PUBLIC','SCHOOL') AND num_nonnulls(grade_id,class_id,student_id,member_id)=0) OR (audience_kind='GRADE' AND grade_id IS NOT NULL AND num_nonnulls(grade_id,class_id,student_id,member_id)=1) OR (audience_kind='CLASS' AND class_id IS NOT NULL AND num_nonnulls(grade_id,class_id,student_id,member_id)=1) OR (audience_kind='STUDENT' AND student_id IS NOT NULL AND num_nonnulls(grade_id,class_id,student_id,member_id)=1) OR (audience_kind='STAFF' AND member_id IS NOT NULL AND num_nonnulls(grade_id,class_id,student_id,member_id)=1)`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `app.file_links` — Vị trí dùng tệp và khả năng chia sẻ

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `school_id` | `uuid` | Có | — |
| `file_id` | `uuid` | Có | — |
| `student_id` | `uuid` | Không | — |
| `class_id` | `uuid` | Không | — |
| `activity_id` | `uuid` | Không | — |
| `announcement_id` | `uuid` | Không | — |
| `share_with_guardian` | `boolean` | Có | `false` |
| `created_at` | `timestamptz` | Có | `now()` |
| `version` | `integer` | Có | `1` |
| `updated_at` | `timestamptz` | Có | `now()` |

Khóa duy nhất: `school_id,id`.
- FK `school_id` → `platform.schools(id)`.
- FK `school_id,file_id` → `app.files(school_id,id)`.
- FK `school_id,student_id` → `app.students(school_id,id)`.
- FK `school_id,class_id` → `app.classes(school_id,id)`.
- FK `school_id,activity_id` → `app.activities(school_id,id)`.
- FK `school_id,announcement_id` → `app.announcements(school_id,id)`.
- CHECK: `num_nonnulls(student_id,class_id,activity_id,announcement_id)=1`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `app.publication_revisions` — Bản chốt/công bố bất biến

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `school_id` | `uuid` | Có | — |
| `class_id` | `uuid` | Không | — |
| `year_id` | `uuid` | Có | — |
| `kind` | `text` | Có | `'CONDUCT'` |
| `conduct_period_id` | `uuid` | Không | — |
| `attendance_session_id` | `uuid` | Không | — |
| `timetable_id` | `uuid` | Không | — |
| `duty_schedule_id` | `uuid` | Không | — |
| `activity_id` | `uuid` | Không | — |
| `announcement_id` | `uuid` | Không | — |
| `revision` | `integer` | Có | — |
| `status` | `text` | Có | `'READY'` |
| `source_version` | `integer` | Có | — |
| `content_hash` | `text` | Có | — |
| `staff_snapshot` | `jsonb` | Có | `'{}'::jsonb` |
| `created_by` | `uuid` | Có | — |
| `published_at` | `timestamptz` | Không | — |
| `published_by` | `uuid` | Không | — |
| `withdrawn_at` | `timestamptz` | Không | — |
| `created_at` | `timestamptz` | Có | `now()` |
| `version` | `integer` | Có | `1` |
| `updated_at` | `timestamptz` | Có | `now()` |

Khóa duy nhất: `school_id,id`; `school_id,id,year_id`.
- FK `school_id` → `platform.schools(id)`.
- FK `school_id,conduct_period_id` → `app.conduct_periods(school_id,id)`.
- FK `school_id,attendance_session_id` → `app.attendance_sessions(school_id,id)`.
- FK `school_id,timetable_id` → `app.timetable_versions(school_id,id)`.
- FK `school_id,duty_schedule_id` → `app.duty_schedules(school_id,id)`.
- FK `school_id,activity_id` → `app.activities(school_id,id)`.
- FK `school_id,announcement_id` → `app.announcements(school_id,id)`.
- FK `school_id,class_id` → `app.classes(school_id,id)`.
- FK `school_id,year_id` → `app.academic_years(school_id,id)`.
- FK `created_by` → `identity.users(id)`.
- FK `published_by` → `identity.users(id)`.
- CHECK: `num_nonnulls(conduct_period_id,attendance_session_id,timetable_id,duty_schedule_id,activity_id,announcement_id)=1`.
- CHECK: `(kind='CONDUCT' AND conduct_period_id IS NOT NULL) OR (kind='ATTENDANCE' AND attendance_session_id IS NOT NULL) OR (kind='TIMETABLE' AND timetable_id IS NOT NULL) OR (kind='DUTY' AND duty_schedule_id IS NOT NULL) OR (kind='ACTIVITY' AND activity_id IS NOT NULL) OR (kind='ANNOUNCEMENT' AND announcement_id IS NOT NULL)`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `app.parent_publication_items` — Dữ liệu đã lọc riêng từng học sinh

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `school_id` | `uuid` | Có | — |
| `publication_id` | `uuid` | Có | — |
| `student_id` | `uuid` | Có | — |
| `year_id` | `uuid` | Có | — |
| `section` | `text` | Có | `'conduct'` |
| `payload` | `jsonb` | Có | `'{}'::jsonb` |
| `created_at` | `timestamptz` | Có | `now()` |

Khóa duy nhất: `school_id,id`; `school_id,publication_id,student_id`.
- FK `school_id` → `platform.schools(id)`.
- FK `school_id,publication_id,year_id` → `app.publication_revisions(school_id,id,year_id)`.
- FK `school_id,student_id` → `app.students(school_id,id)`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `app.parent_document_items` — Tệp cho đúng người xem

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `school_id` | `uuid` | Có | — |
| `student_id` | `uuid` | Có | — |
| `year_id` | `uuid` | Có | — |
| `file_id` | `uuid` | Có | — |
| `publication_id` | `uuid` | Không | — |
| `title` | `text` | Có | — |
| `download_allowed` | `boolean` | Có | `false` |
| `published_at` | `timestamptz` | Có | — |
| `revoked_at` | `timestamptz` | Không | — |
| `created_at` | `timestamptz` | Có | `now()` |
| `version` | `integer` | Có | `1` |
| `updated_at` | `timestamptz` | Có | `now()` |

Khóa duy nhất: `school_id,id`.
- FK `school_id` → `platform.schools(id)`.
- FK `school_id,student_id` → `app.students(school_id,id)`.
- FK `school_id,year_id` → `app.academic_years(school_id,id)`.
- FK `school_id,file_id` → `app.files(school_id,id)`.
- FK `school_id,publication_id` → `app.publication_revisions(school_id,id)`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `app.import_jobs` — Nhập file có kiểm tra và xác nhận

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `school_id` | `uuid` | Có | — |
| `kind` | `text` | Có | `'STUDENTS'` |
| `file_id` | `uuid` | Có | — |
| `requested_by` | `uuid` | Có | — |
| `column_mapping` | `jsonb` | Có | `'{}'::jsonb` |
| `preview_hash` | `text` | Không | — |
| `status` | `text` | Có | `'UPLOADED'` |
| `summary` | `jsonb` | Có | `'{}'::jsonb` |
| `completed_at` | `timestamptz` | Không | — |
| `created_at` | `timestamptz` | Có | `now()` |
| `version` | `integer` | Có | `1` |
| `updated_at` | `timestamptz` | Có | `now()` |

Khóa duy nhất: `school_id,id`.
- FK `school_id` → `platform.schools(id)`.
- FK `school_id,file_id` → `app.files(school_id,id)`.
- FK `requested_by` → `identity.users(id)`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `app.import_rows` — Kết quả từng dòng import

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `school_id` | `uuid` | Có | — |
| `import_id` | `uuid` | Có | — |
| `row_number` | `integer` | Có | — |
| `normalized_data` | `jsonb` | Có | `'{}'::jsonb` |
| `status` | `text` | Có | `'PENDING'` |
| `errors` | `jsonb` | Có | `'[]'::jsonb` |
| `business_key` | `text` | Không | — |
| `result_id` | `uuid` | Không | — |
| `created_at` | `timestamptz` | Có | `now()` |
| `version` | `integer` | Có | `1` |
| `updated_at` | `timestamptz` | Có | `now()` |

Khóa duy nhất: `school_id,id`; `school_id,import_id,row_number`.
- FK `school_id` → `platform.schools(id)`.
- FK `school_id,import_id` → `app.import_jobs(school_id,id)`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `app.export_jobs` — Bản xuất dữ liệu có phạm vi

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `school_id` | `uuid` | Có | — |
| `requested_by` | `uuid` | Có | — |
| `class_id` | `uuid` | Không | — |
| `report_type` | `text` | Có | — |
| `format` | `text` | Có | `'CSV'` |
| `filters` | `jsonb` | Có | `'{}'::jsonb` |
| `status` | `text` | Có | `'QUEUED'` |
| `file_id` | `uuid` | Không | — |
| `expires_at` | `timestamptz` | Không | — |
| `completed_at` | `timestamptz` | Không | — |
| `created_at` | `timestamptz` | Có | `now()` |
| `version` | `integer` | Có | `1` |
| `updated_at` | `timestamptz` | Có | `now()` |

Khóa duy nhất: `school_id,id`.
- FK `school_id` → `platform.schools(id)`.
- FK `requested_by` → `identity.users(id)`.
- FK `school_id,class_id` → `app.classes(school_id,id)`.
- FK `school_id,file_id` → `app.files(school_id,id)`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `app.notifications` — Thông báo nội bộ cho nhân sự

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `school_id` | `uuid` | Có | — |
| `member_id` | `uuid` | Có | — |
| `kind` | `text` | Có | — |
| `title` | `text` | Có | — |
| `target_kind` | `text` | Có | — |
| `target_id` | `uuid` | Không | — |
| `read_at` | `timestamptz` | Không | — |
| `created_at` | `timestamptz` | Có | `now()` |
| `version` | `integer` | Có | `1` |
| `updated_at` | `timestamptz` | Có | `now()` |

Khóa duy nhất: `school_id,id`.
- FK `school_id` → `platform.schools(id)`.
- FK `school_id,member_id` → `app.memberships(school_id,id)`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `app.audit_events` — Nhật ký thay đổi nghiệp vụ

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `school_id` | `uuid` | Có | — |
| `actor_user_id` | `uuid` | Không | — |
| `actor_kind` | `text` | Có | — |
| `action` | `text` | Có | — |
| `target_type` | `text` | Có | — |
| `target_id` | `uuid` | Không | — |
| `request_id` | `text` | Có | — |
| `reason` | `text` | Không | — |
| `redacted_before` | `jsonb` | Có | `'{}'::jsonb` |
| `redacted_after` | `jsonb` | Có | `'{}'::jsonb` |
| `created_at` | `timestamptz` | Có | `now()` |

Khóa duy nhất: `school_id,id`.
- FK `school_id` → `platform.schools(id)`.
- FK `actor_user_id` → `identity.users(id)`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `app.outbox_events` — Hàng đợi bền vững bằng PostgreSQL

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `school_id` | `uuid` | Có | — |
| `kind` | `text` | Có | — |
| `dedupe_key` | `text` | Có | — |
| `payload` | `jsonb` | Có | `'{}'::jsonb` |
| `status` | `text` | Có | `'PENDING'` |
| `attempts` | `integer` | Có | `0` |
| `run_after` | `timestamptz` | Có | `now()` |
| `lease_until` | `timestamptz` | Không | — |
| `lease_owner` | `text` | Không | — |
| `processed_at` | `timestamptz` | Không | — |
| `last_error_code` | `text` | Không | — |
| `created_at` | `timestamptz` | Có | `now()` |
| `version` | `integer` | Có | `1` |
| `updated_at` | `timestamptz` | Có | `now()` |

Khóa duy nhất: `school_id,id`; `school_id,dedupe_key`.
- FK `school_id` → `platform.schools(id)`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.

## `app.idempotency_keys` — Chống gửi lặp thao tác

| Cột | Kiểu PostgreSQL | Bắt buộc | Mặc định |
|---|---|---|---|
| `id` | `uuid` | Có | `gen_random_uuid()` |
| `school_id` | `uuid` | Có | — |
| `actor_user_id` | `uuid` | Có | — |
| `operation_id` | `text` | Có | — |
| `key_hash` | `text` | Có | — |
| `request_hash` | `text` | Có | — |
| `status` | `text` | Có | `'IN_PROGRESS'` |
| `response_status` | `integer` | Không | — |
| `response_metadata` | `jsonb` | Có | `'{}'::jsonb` |
| `expires_at` | `timestamptz` | Có | — |
| `created_at` | `timestamptz` | Có | `now()` |
| `version` | `integer` | Có | `1` |
| `updated_at` | `timestamptz` | Có | `now()` |

Khóa duy nhất: `school_id,id`; `school_id,actor_user_id,operation_id,key_hash`.
- FK `school_id` → `platform.schools(id)`.
- FK `actor_user_id` → `identity.users(id)`.

Quy tắc liên bảng/thời gian/quyền bổ sung: xem `docs/03-AUTH-TENANCY.md`, `docs/04-BUSINESS-TRANSACTIONS.md` và `database/002-invariants.sql`.
