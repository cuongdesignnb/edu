# FORM DATA AUDIT RESULT — 2026-10-06

Repository: https://github.com/cuongdesignnb/edu
Branch: `codex/new-machine-audit-20261002`
Baseline: `669b21160385bf417373b6a8daa0c6b35999b4d9` (`v1.0.5`).

Đã hoàn thành audit và fix trong phạm vi toàn bộ form/select/picker, Quick Create và tab lớp. Inventory chi tiết tại [FORM-DATA-AUDIT.md](FORM-DATA-AUDIT.md): **126 nhóm**, gồm **57 FIXED**, **58 ALREADY_CORRECT**, **11 NOT_APPLICABLE** (preview). FIXED tính nhóm có sửa trực tiếp hoặc sửa query owner chi phối control; không phải 57 endpoint mới.

## Thay đổi đã kiểm chứng

- Direct Staff dùng assignment-picker riêng cho năm/lớp/môn; DRAFT và ACTIVE chọn được khi gán GVCN, ARCHIVED bị loại. Schedule giữ semantic ACTIVE riêng. School-wide schedule chấp nhận root yearId null theo contract nhưng kiểm từng class đúng năm yêu cầu.
- Dependency keys và lựa chọn được làm mới/clear theo school/year/class/student/guardian/activity và ngày hiệu lực. Officer/notebook có onDate native, giữ tenant/permission và write validation.
- Quick Create đủ năm, khối, phòng, lớp, môn, giáo viên, học sinh, người giám hộ, tổ, chức vụ và hoạt động trong context phù hợp. Các child reuse native form, giữ parent mounted/input, refetch trước khi chọn dữ liệu hợp lệ. Tạo guardian vẫn cần xác minh explicit trước khi cấp link.
- Tải/lỗi/empty tách riêng, retry giữ input; nested ESC xử lý top layer và focus về opener. Button tạo nhanh trong notebook đã tách khỏi label select để bàn phím/screen reader nhận đúng tên.
- Tab active theo pathname/MATCH, lưu horizontal scroll theo school/year/class, restore và đưa tab active vào viewport bằng container.scrollTo(left). Link dùng scroll=false. Mobile giữ 4 tab + Thêm, aria-current đúng.

## Gates

| Gate | Kết quả |
|---|---|
| Frontend targeted unit | PASS — 20/20, 3 files |
| Backend targeted native integration | PASS — 3/3 groups; Node 24.21.0 + PostgreSQL 17.11, SMTP disabled |
| Browser native cross-form / desktop / 390px | PASS — 30 distinct cases; không runtime pageerror |
| Frontend typecheck / production build | PASS |
| Backend typecheck / build | PASS |
| Script syntax / git diff --check | PASS |

Backend integration kiểm: DRAFT/ACTIVE/ARCHIVED, current/future/archived years, tenant và permission deny; direct GVCN → activate → student/guardian source; dated enrollment/group và officer capability (outside year/week rejected). Native timetable conflict check trả valid=true cho bộ môn/giáo viên/phòng mới. API/Web/worker browser QA dùng database/volume riêng trên loopback. Không seed hoặc chạy thao tác nào lên production.

Ba file backend chạy trong QA image khớp SHA-256 với source hiện tại: notebook.service.ts, officers.service.ts và generated/contract.json. Frontend browser dùng production build tại thời điểm các case chạy; sau các callback cuối chỉ chạy lại phần liên quan. Mật khẩu fixture sinh ngẫu nhiên, lưu riêng trong đường dẫn ignored; không nằm trong báo cáo hay source.

## Browser cases

1. PASS — DirectStaff multi-year semantic options
2. PASS — Nested class→grade/room quick create, DRAFT auto-select and parent inputs
3. PASS — Nested ESC closes top only and restores focus
4. PASS — Subject quick create auto-select without F5
5. PASS — Year quick create and child reset
6. PASS — Direct teacher creates homeroom assignment on new DRAFT class
7. PASS — New class/header refresh and activation
8. PASS — Parent-access Quick Student selects newly created ACTIVE-year enrollment
9. PASS — Quick Guardian refetch preserves parent fields and requires explicit verification
10. PASS — Explicit guardian verification auto-selects eligible relationship and issues parent access
11. PASS — Student year filter clears old class without F5
12. PASS — Manual timetable Quick Subject/Teacher retains entry/date and auto-selects native options
13. PASS — Manual timetable Quick Room and native draft validation
14. PASS — Evidence Quick Activity retains file/note and sees newly created student
15. PASS — Class tab manual horizontal scroll persists and active periodic stays visible
16. PASS — Class tabs timetable→groups→duties→reports do not reset to start
17. PASS — Direct URLs and refresh reveal active tab for all five sections
18. PASS — Class tab browser Back/Forward active and visible
19. PASS — Spreadsheet alias mapping sees freshly created subject/teacher without F5
20. PASS — Cross-form activity/evidence upload and workspace refresh
21. PASS — Tab visibility correction preserves page vertical scroll
22. PASS — 390px mobile More menu remains active and navigates correctly
23. PASS — Notebook Quick Group auto-selects native group and clears incompatible student
24. PASS — Notebook Quick Position auto-selects compatible role/group scope
25. PASS — Assignment picker loading/error/retry keeps parent input and never fabricates empty options
26. PASS — Restricted teacher cannot see school-admin dependency Quick Create
27. PASS — Fresh ClassDrawer grade/room validation preserves inputs and parent class auto-selection
28. PASS — Fresh DirectStaff year validation selects eligible year and shows scoped empty class state
29. PASS — Native timetable conflict validation returns valid=true for newly created dependencies
30. PASS — Fresh Student year options auto-select and retain student fields

Kiểm tra vertical scroll cho phép sai số layout 4px; correction chỉ tác động scrollLeft của thanh tab và không gọi scrollIntoView. Các case trực tiếp kiểm active nằm trọn trong viewport ngang, sessionStorage không về 0, URL/Back/Forward và menu mobile. Error case cố ý trả 503 một lần cho assignment picker rồi retry; 401 ở bootstrap login là expected.

## Chạy lại có chọn lọc

Frontend:

```powershell
npm run typecheck
npx vitest run tests/unit/form-data.test.ts tests/unit/api-query-boundary.test.ts tests/unit/api-schedule-adapter.test.ts
npm run build
```

Backend targeted integration tạo project test riêng, giữ volume, dừng PostgreSQL test khi xong (không xóa volume):

```powershell
$env:FORM_DATA_EVIDENCE_PATH = "$PWD/.secrets/local/form-data-retest"
& 'C:/Program Files/Git/bin/bash.exe' backend/tests/run-form-data.sh
```

`FORM_DATA_TEST_SUBNET` có thể chỉ định nếu host dùng nhiều Docker networks. Backend test guard bắt buộc APP_ENV=test và DB_NAME=edumanage_test_local. Fixture sinh ra có marker FORM_DATA_QA, gồm credential local QA; không commit fixture.

Browser runner: [verify-form-data-browser.mjs](../scripts/verify-form-data-browser.mjs). Khởi động API/worker từ đúng test project và Web production build trên loopback, APP_URL khớp URL proxy. Dùng fixture vừa sinh và output ignored riêng. Runner từ chối URL ngoài loopback. `all` cần fixture/database mới, chạy tuần tự staff → students → schedule → mapping → activity → organization → tabs → errors; callback/validation là stages kiểm bổ sung. Đã kiểm các flow theo stage trong lần bàn giao này, không tuyên bố một run all duy nhất.

```powershell
$env:FORM_BROWSER_FIXTURE = "$PWD/.secrets/local/form-data-retest/fixture.json"
$env:FORM_BROWSER_OUTPUT_DIR = "$PWD/.secrets/local/form-data-retest/browser"
$env:FORM_BROWSER_URL = 'http://127.0.0.1:24273'
$env:FORM_BROWSER_STAGE = 'all'
node scripts/verify-form-data-browser.mjs
```

`tabs`, `mapping`, `validation`, `errors` chạy lại trên fixture có browser-state đã tạo. Các stage ghi entity như staff/students/schedule/callbacks cần fixture sạch tương ứng để tránh mã fixture trùng. Screenshots/body diagnostics và browser-state nằm trong output ignored. Không ghi password hoặc token ra console.

## Bàn giao Git

Commit message: `fix(forms): keep pickers in sync and preserve class tab position`. Chỉ source/contract/test/script và hai báo cáo FORM-DATA được stage. Giữ riêng các evidence/draft docs có sẵn trước job, docs/backend-progress.json, file môi trường/secret/private data. Final SHA và SHA remote được xác minh sau push và trả trong kết quả bàn giao.

PRODUCTION_DEPLOYED=NO. Không SSH, không tag/release mới, không move tag, không sửa migration/checksum. Không có blocker trong phạm vi job.
