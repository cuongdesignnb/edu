# 02 — PostgreSQL: cấu trúc, quan hệ và tính toàn vẹn

## Những file dùng làm chuẩn

`database/model.json` là danh mục máy đọc; `DATABASE.dbml` để xem quan hệ; `001-schema.sql` là DDL khởi đầu; `002-invariants.sql` bổ sung index/check/trigger; `003-rls-and-grants.sql` phân quyền DB; `004-auth-bootstrap.sql` phục vụ chọn trường của chính nhân sự và chặn thêm projection sau khi bản công bố không còn READY. `DATA-DICTIONARY.md` liệt kê từng cột, kiểu và FK. Sơ đồ SVG/HTML được render từ cùng model, không vẽ tay sai quan hệ.

SQL này là **baseline cần Agent chạy trên PostgreSQL 17 dùng một lần trong database test sạch**. Sau khi merge thành migration đã áp dụng, không chỉnh nội dung file cũ; thêm migration mới. DDL không chứa tài khoản hay học sinh thật. Metadata `public.schema_migrations(version,checksum,applied_at)` là bảng kỹ thuật của runner, không nằm trong số bảng nghiệp vụ.

## Ba nhóm dữ liệu

| Schema | Vai trò | Ví dụ |
|---|---|---|
| identity | Danh tính và phiên toàn nền tảng | users, staff_sessions, auth_challenges, parent_sessions, mail_outbox |
| platform | Metadata trường/vận hành | schools, operator_grants, support_access, operation_runs |
| app | Dữ liệu theo trường, áp RLS | classes, enrollments, rules, records, publications, files… |

Một người có identity dùng ở hai trường nhưng hai membership riêng. **Không gộp student giữa hai trường**, không dùng số điện thoại làm identity gia đình toàn nền tảng. Mã lớp chỉ unique trong trường+năm; tên người không unique.

## Quy ước chung

- UUID ID không mang quyền truy cập. `school_id` bắt buộc ở bảng app; `UNIQUE(school_id,id)` để FK composite giữ biên trường.
- Timestamp UTC `timestamptz`; ngày học là `date`, timezone trường dùng để chuyển lịch sang UTC. Khoảng ngày `[starts_on,ends_on)` kết thúc loại trừ: từ 01/09 đến hết 30/09 lưu ends_on=01/10. API/UI phải diễn giải rõ, không sai một ngày khi chuyển lớp.
- `version` dùng optimistic concurrency; trigger tăng version khi UPDATE. API WHERE id + school_id + version, không tăng lần hai trong code. Aggregate `conduct_periods.data_version` tăng khi child record đổi; `expectedSourceVersion` không phải chỉ version dòng summary.
- Điểm `numeric(10,2)`; API decimal string, dùng decimal arithmetic. Tuyệt đối không coi binary float là sổ điểm chuẩn.
- `jsonb` dành settings đã validate/snapshot có schema; **không đổ toàn bộ trường hoặc mọi màn hình vào một JSON**. Snapshot không dùng để thay các quan hệ tác nghiệp.
- FK RESTRICT, trạng thái archive/end thay hard delete. Audit append-only với runtime; đây không phải bất biến chống DBA sửa, muốn chống giả mạo mạnh phải có lưu trữ/audit bên ngoài.

## Quan hệ quan trọng

Trường → năm → lớp. Student → enrollment(student,class,year,ngày) tách biệt hồ sơ. Chuyển lớp kết thúc enrollment cũ và tạo enrollment mới; mọi điểm danh/thi đua giữ enrollment của lúc xảy ra.

Member → grant(role+scope+thời gian) ↔ teaching_assignment. FK và trigger đảm bảo assignment trỏ đúng member/class/subject; application vẫn phải kiểm role/scopes/action/date tương ứng.

Guardian → relationship(student,đã xác minh,quyền nhận) → access_link(student,year,sections,expiry) → session. Quyền của link độc lập với tài khoản nhân sự. Link không lưu token gốc.

Publication revision có một trong sáu FK typed source: conduct, attendance, timetable, duty, activity, announcement. Trạng thái công bố và projection per student tách khỏi dữ liệu nhập. Không parent SELECT staff_snapshot. Job/export/file có metadata và ownership, không tên file tùy ý làm đường dẫn hệ thống.

## Database bảo vệ phần nào?

SQL có FK composite, CHECK trạng thái, unique keys, index nguồn thi đua chống lặp cùng rule, GiST exclusion cho enrollment/homeroom/lịch, trigger giữ issued rules và payload publication, FORCE RLS. `class_id` và `year_id` ở quan hệ con phải khớp qua FK khi có tuple hỗ trợ.

**Service bắt buộc bổ sung các invariant không được một FK đơn lẻ bảo vệ:**

| Điều kiện | Cách kiểm |
|---|---|
| Khối/lớp/năm/trạng thái school nhất quán | Validate reference bằng cùng tenant và khóa đúng row |
| Ngày phân công nằm trong grant và năm học | Kiểm date/time cả trước lưu và khi request có quyền |
| Publication source cùng class/year/type | Typed lookup + SELECT FOR UPDATE; không tin classId/body |
| Group/position/seating/lesson thuộc đúng enrollment tại ngày áp dụng | Join enrollment và timeframe; unique ghế/chức vụ đơn; từ chối hai holder cùng thời gian |
| Membership suspended không còn quyền | Policy kiểm trạng thái DB mỗi request, không tin cached grant |
| Support ticket và access thuộc cùng trường | Kiểm ticket.school_id trong transaction grant |
| Không còn quản trị cuối | Khóa school trước đếm/cập nhật; hai request đồng thời phải bị chặn |
| File đính kèm được phép cho đối tượng | Kiểm file_link typed target + uploader scope, không chỉ school_id |
| Một sự việc không cộng/trừ hai lần qua hai rules/nguồn khác nhau | Canonical event identity + review; UNIQUE theo rule không thay toàn bộ phát hiện trùng nghiệp vụ |

Các trường polymorphic như audit entity_type/entity_id chỉ là tham chiếu nhật ký, **không phải FK bảo đảm tồn tại**. API phải validate target trước tạo link/jobs.

## Migrations

Runner lấy advisory lock riêng, đọc checksum, áp từng file transaction, ghi metadata sau thành công. `001..004` có BEGIN/COMMIT nên runner không bọc transaction chồng vô ý. DDL extension btree_gist do init/admin trước, role migration là DB owner không superuser. Khi volume không trống, init-db không chạy lại.

Production: expand trước (cột nullable/tables mới), code đọc/ghi tương thích, backfill theo batch, validate, contract sau release khác. `CREATE INDEX CONCURRENTLY` phải migration no-transaction riêng. Hủy release không chạy tự động DROP/down; image cũ chỉ rollback nếu schema còn tương thích.

## RLS không thay authorization

Runtime edu_app không owner, không BYPASSRLS; mỗi tenant transaction `set_config('app.school_id',schoolId,true)` (SET LOCAL), không SET session-level rồi thả lại pool. Policy chặn quên WHERE tenant nhưng **không tự biết giáo viên được lớp nào**. Client có DB credential vẫn nguy hiểm; không expose DB. Tenant GUC chỉ do backend đã xác thực đặt.

Bootstrap /me/context: sau xác thực session, transaction chưa có school_id đặt app.authenticated_user_id. Policy riêng chỉ cho SELECT memberships của chính user khi tenant null. Sau đó resolve grant từng trường; policy bootstrap không được dùng để đọc dữ liệu trường khác. Bình thường có tenant thì bootstrap policy không mở rộng SELECT. Kiểm regression connection reuse giữa A và B và context không có user.

RLS và owner-bypass/FORCE được PostgreSQL mô tả trong tài liệu chính thức [S2](13-SOURCES-AND-ASSUMPTIONS.md). Không sửa database role sang postgres để tránh test fail.
