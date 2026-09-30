# 09 — Kế hoạch kiểm thử bắt buộc

Không dùng SQLite/in-memory làm bằng chứng cho PostgreSQL/RLS/exclusion. Test trên database disposable PostgreSQL17 với role runtime thật, không chỉ postgres. Fixtures synthetic hai trường, cùng tên lớp, hai người trùng tên, cô Lan GVCN A + bộ môn B, một user thuộc hai trường, hai guardian/mộtstudent, link khác nhau.

| ID | Kịch bản | Kết quả cần chứng minh |
|---|---|---|
| BE01 | Migrate DB sạch, chạy lại, sửa checksum | Lần1 thành công; lần2 no-op; mismatch fail |
| BE02 | FK student/guardian/class khác school | DB/service từ chối, không dữ liệu chéo |
| BE03 | edu_app query không tenant hoặc tenant B | Không trả dữ liệu A; SET LOCAL không tồn tại sau release pool |
| BE04 | Bootstrap memberships userA | Chỉ membershipA; không identity B; context có tenant không OR bypass |
| BE05 | GVCN10A1 + SUBJECT10A2 | Không đổi sơ đồ/guardian10A2; vẫn ghi sự việc đúng tiết/môn |
| BE06 | Thu hồi membership/grant khi tab đang mở | Request mới401/403; không cache quyền vô hạn |
| BE07 | Invitation cho email đã tồn tại trường khác | Không reset identity; chỉ accept đúng user; hạn/revoke hoạt động |
| BE08 | Login CSRF, fixation, brute force/reset enumeration | Fail an toàn; opaquecookie flags đúng; rate429 có giới hạn |
| BE09 | Cùng key/body mutation retry, hai request đồng thời | Một kết quả; khác body409 |
| BE10 | Hai giáo viên PATCH cùng version | Một thành công, một409; không last-write-wins |
| BE11 | Chưa điểm danh vs có mặt, daily+lesson | UNMARKED rõ, mẫu số không double |
| BE12 | Thi đua fixed/manuallimit/source duplicate | Server tính; không chấp nhận điểm tùy ý/trừ hai lần |
| BE13 | Chốt khi còn pending hoặc source stale |409/422; không publication một nửa |
| BE14 | Thay rule sau issued | Bản cũ bị chặn sửa; tuần công bố giữ nguyên điểm |
| BE15 | Điều chỉnh sau chốt | Bản cũ còn đến khi bản mới published; before/after/reason còn |
| BE16 | Publish concurrently cùng period | Chỉ một current revision; count/hash projection khớp |
| BE17 | Parent không token/invalid/studentId đổi |401/404, không full class/family/internal notes |
| BE18 | Parent có link hợp lệ nhưng onlyattendance | Không xem conduct/documents ngoài section |
| BE19 | Thu hồi một link, guardian hoặc trường | Link/session đó chặn đọc/tải mới; guardian khác độc lập |
| BE20 | Hai link/hai con mở hai tab | Tab cũ409 contextchanged, không hiển thị nhầm |
| BE21 | Request trực tiếp edu_parent SELECT app.students | Permission denied, projection với invalid session0rows |
| BE22 | Parent reads while source drafting | Chỉ current publication; draft không xuất hiện trong network |
| BE23 | Chuyển lớp cùng năm, rollover | Ngày và lịch sử đúng; link cùng student/year; không sang năm/trường ngoài quyền |
| BE24 | Handover/lastadmin concurrent | Thu hồi/gán atomic; không mất admin cuối |
| BE25 | Teacher/room/class overlap lịch |422/exclusion; không sửa occurrence đã điểm danh |
| BE26 | Upload spoof/ext/traversal/zipbomb | Reject/quarantine; không ghi ngoài privatefolder |
| BE27 | UserA download file schoolB hoặc file nháp parent |403/404, no-store; không URL public |
| BE28 | Export bị thu hồi quyền khi job đang chờ | Không leak file; trạng thái failed/cancelled rõ |
| BE29 | Worker kill sau claim/sauwrite/beforeack | Lease recovery; no duplicate record; không job mất |
| BE30 | Import file lỗi/duplicate/retry/cancel | Row errors thật, partial rõ, không replace cả lớp |
| BE31 | Mail chưa SMTP hoặc SMTPfail | Localfile/FAILED; không báo sent giả; no secrets logs |
| BE32 | Frontend error/offline API | Không fallback fixtures, giữ form chưa lưu |
| BE33 | Restart containers không xóa volumes | Dữ liệu/attachments còn, session theo DB |
| BE34 | Port và mạng | Chỉ127.0.0.1:18763; DB không publish |
| BE35 | Production demo/weakconfig | Startup/preflight fail; /demo /preview404 |
| BE36 | Backup restore vào stack khác | Migrations/counts/hashfile/login/parentnegative còn đúng |
| BE37 | Chạy tải có số liệu | p50/p95/error/RSS/CPU/DBpool ghi thật |
| BE38 | UI 360/390/768/1448px sau nối | Không font lỗi/trànbody, mọi core action có response đúng |
| BE39 | Support read grant hết hạn | Không ghi/đọc sau expiry; log operator thật |
| BE40 | Schema/spec/frontend mapping diff | Mọi operation implemented hoặc BLOCKED rõ; không fakePASS |

## Các lớp test

Unit: score calculator/threshold/permissions/date/snapshot serializers. Integration: Postgres role/transaction/concurrency/exclusion. Contract: requests/responses validate OAS. E2E: Playwright hai browsercontext teacher/parent. Load: script dùng fixture valid, không login tấn công mỗi request; benchmark tại máy xác định.

Chạy `npm run lint`, typecheck, build trong frontend+backend; backend unit/integration/contract; E2E; compose config; migrations; smoke; restore drill. Tên script phải được Agent khai báo trong package.json, không chỉ viết lệnh README không tồn tại.

## SQL probes

`database/tests/static-smoke.sql` là probe cấu trúc/roles read-only. Test dữ liệu phải tạo fixture thật theo schema và chạy `BE01..BE40`; không nhận probe là đủ kiểm chứng phân quyền. Handoff không chạy được PostgreSQL trong môi trường tạo tài liệu; trạng thái gốc NOT_RUN.

Báo cáo mỗi test ghi command, dateUTC, commit/image digest, env, exitcode, phần chứng cứ đã redact. Không lưu token/password/PII vào qa hoặc CI artifacts. Những fixture linkdemo vẫn cấp qua backend, không dùng fixed secret có thể trùng production.
