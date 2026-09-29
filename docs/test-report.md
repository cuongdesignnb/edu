# Báo cáo kiểm thử — EduManage frontend demo

Môi trường: Windows 11 Pro, Node 20.15.1, npm 10.7, Microsoft Edge (Playwright channel `msedge`), Next.js 16.3.6. Ngày chạy: 29/09/2026 (giờ máy); DemoClock ứng dụng cố định 05/10/2026 08:00 +07. **Kết quả chỉ chứng minh hành vi giao diện + adapter mock; không chứng minh bảo mật hay hiệu năng backend.**

## Kết quả lần chạy cuối

| Kiểm tra | Lệnh | Kết quả |
|---|---|---|
| Typecheck | `npm run typecheck` | **PASS** — 0 lỗi |
| Lint | `npm run lint` | **PASS** — 0 lỗi, 3 cảnh báo (xem dưới) |
| Unit | `npm test` | **PASS** — 37/37 (3 file) |
| Build production | `npm run build` | **PASS** — 135 route |
| E2E (bản production, `next start -p 3001`) | `E2E_BASE_URL=http://localhost:3001 npm run test:e2e -- --workers=3` | **PASS** — 262/262 trong 7,9 phút |

### Unit (Vitest) — `tests/unit`
- `seed.test.ts` (7): seed xác định; sĩ số 42/40/36/35 = 153; hôm nay 38+2+1+1 (hiện diện 40); Minh Anh tuần 4 = 100 − 5 + 2 = 97; trùng tên khác mã; lịch không trùng giáo viên.
- `permissions.test.ts` (9): Q13/Q14/Q15 — quyền không lan giữa lớp/môn/trường; admin/BGH/giáo vụ khác nhau; platform không đọc học sinh; thành viên/ trường tạm dừng bị chặn.
- `flows.test.ts` (21): F02, NV-03 (thu hồi phân công chặn lần ghi sau), Q15/Q16, F03–F05 (nháp không lộ → chốt không lộ → công bố 97 → điều chỉnh 102, người đề nghị không tự duyệt, bản cũ superseded), NV-08, F07/Q20/Q21, F06/Q27–Q31, Q34, F12/NV-14/Q40/Q41, F09/Q36, F08/Q19, F04 trường B (lãnh đạo công bố), SC07/NV-13 rollover, F11/Q35 xung đột đổi tiết.

### E2E (Playwright) — `tests/e2e`
- `smoke.spec.ts` (251): mọi route core + nội bộ (125) ở 1448×1086 và 390×844 với persona phù hợp — không 404 ngoài ý muốn, không lỗi runtime/console, không tràn ngang body, không mojibake; trang phụ huynh không có ô mật khẩu/chat/“Kết quả học tập”; EX01–EX03 trả 404 (Q44).
- `flows.spec.ts` (6): F02 tab/URL trực tiếp, Q15, Q16, Q29, Q30, Q23/Q24.
- `links.spec.ts` (5): Q48 — mọi liên kết nội bộ xuất hiện trên toàn bộ route đều trỏ tới route tồn tại.

### Script QA theo nhóm (Playwright, Edge) — đã chạy PASS trong quá trình dựng
`scripts/qa-auth-platform-system-flows.mjs`, `qa-school-org-flows.mjs`, `qa-students-families.mjs`, `qa-school-ops-flows.mjs`, `qa-teacher-class-1-flows.mjs`, `qa-class-conduct-flow.mjs` (F03→F05 qua UI, đổi persona), `qa-class-activities-flow.mjs`, `qa-parent-f06.mjs` (thu hồi link qua UI, tab phụ huynh đang mở tự chặn), `qa-ui-lab-*.mjs`. Các script chạy trên context trình duyệt mới (seed mới) và không phải bộ test CI.

### Responsive
Toàn bộ route: 1448 và 390 (smoke). Chụp bổ sung 360/768/1024 cho CL04, SC16, CL14, SC32, PL02 — `overflowX = 0`, không lỗi console (`qa/screenshots/*-w360|w768|w1024.png`).

## Lỗi phát hiện và đã sửa trong QA cuối (không còn mở)
1. Vòng lặp tải lại vô hạn khi query lỗi được observer mới mount (nhân sự trường khác mở lớp thấy skeleton mãi) — sửa `refetchOnMount` cho query lỗi + chốt lựa chọn shell.
2. Liên kết sai `/conduct/adjustments` ở SC36 (prefetch 404 treo) — sửa và thêm `links.spec.ts`.
3. Banner kịch bản demo đóng băng trang (snapshot không ổn định) — cache snapshot.
4. Chọn mục trong menu dòng bảng kích hoạt điều hướng dòng — chặn sự kiện từ portal.
5. Chính sách công bố trường B chưa được áp — kiểm ở repository.

## Cảnh báo lint còn lại (không phải lỗi)
- `src/app/global-error.tsx`: dùng `<a href="/">` có chủ đích (global-error thay thế root layout).
- `src/features/reports/school-reports.tsx`, `src/features/school-org/roles.tsx`: gợi ý phụ thuộc `useMemo` (không ảnh hưởng hành vi đã kiểm).

## Chưa kiểm / giới hạn
- `app/error.tsx` và `global-error.tsx` chưa được kích hoạt thực tế (không có cách an toàn tạo lỗi render).
- Không kiểm trên thiết bị di động thật, Safari/Firefox; chỉ Edge (Chromium) với viewport giả lập.
- Không kiểm trình đọc màn hình tự động (axe); focus/keyboard được kiểm thủ công một phần qua component Radix và script nhóm.
- `tools/verify_bundle.py` là công cụ kiểm gói bàn giao gốc, quét cả `node_modules` nên không áp dụng cho dự án đã cài; đã kiểm riêng 15 ảnh tham chiếu khớp SHA-256 trong manifest và không sửa tài liệu đầu vào.
