# Báo cáo triển khai frontend EduManage

> Frontend demo, **chưa có backend thật, chưa xác thực/phân quyền bảo mật thật, chỉ dữ liệu giả, không dùng production**. Chi tiết từng ID và bằng chứng: `docs/progress.md` (tự sinh từ `qa/status/*.json`). Kết quả kiểm thử: `docs/test-report.md`. Đối chiếu ảnh: `docs/visual-diff-report.md`. Hợp đồng dữ liệu: `docs/frontend-data-contract.md`.

## 1. Stack và phiên bản thực tế

Next.js 16.3.6 (App Router, Turbopack), React 19.3, TypeScript 5.9, Tailwind CSS 4.3 (tokens CSS variables, `@theme static`), @tanstack/react-query 5.104, Radix UI (dialog, dropdown-menu, tabs, switch, popover, tooltip), lucide-react 1.48, react-hook-form 7.89 + zod 4.6 (có sẵn, form chủ yếu dùng state + lỗi từ repository), idb-keyval 6.3 (IndexedDB), papaparse 5.7 (CSV), write-excel-file 4.1 / read-excel-file 9.3 (XLSX thật), qrcode 1.5, date-fns 4.4, @fontsource/be-vietnam-pro 5.3 (font host cục bộ). Kiểm thử: Vitest 3.2 (Vitest 5 thiếu binding rolldown trên Windows — đã hạ), Playwright 1.63 dùng Microsoft Edge có sẵn (không tải trình duyệt), ESLint 9 + eslint-config-next 16. Node 20.15.1.

## 2. Kiến trúc

- **Model frontend** `src/lib/model/types.ts` (DemoDB) — không phải schema database.
- **Seed xác định** `src/lib/fixtures/seed.ts` (PRNG cố định): 8 trường (A Bình Minh, B An Hòa đầy đủ; 6 trường vận hành ở các trạng thái), 153 học sinh đang học (42/40/36/35), năm 2026–2027 + năm lưu trữ 2025–2026, trùng tên khác mã, chuyển lớp, ngừng học, giám hộ chưa xác minh, người có 2 con, 11 link (active/hết hạn/thu hồi/năm cũ/thiếu mục/trường tạm dừng/trường B), nội quy v1–v3, tuần 1–4 đã công bố (Minh Anh tuần 4 = 97), tuần 5 đang mở với ghi nhận chờ + cặp trùng, điều chỉnh chờ duyệt, điểm danh hôm nay 38/2/1/1, hoạt động/minh chứng, thông báo trường/lớp/cá nhân/nháp/đặt lịch/thu hồi, hỗ trợ, nhật ký.
- **Mô hình quyền duy nhất** `src/lib/permissions` — grant = hành động × trường × lớp/môn × hiệu lực; mẫu quyền trường (Quản trị/BGH/Giáo vụ) + phân công lớp (GVCN/GVBM). Menu, nút, tab lớp và guard repository đọc cùng một nguồn. Quy trình công bố của trường (chủ nhiệm hay lãnh đạo chốt/công bố) được áp ở repository.
- **MockRepository** `src/lib/repositories/*` — hàm bất đồng bộ, đọc/ghi IndexedDB (`edumanage-ui-demo-v1`), commit nguyên tử trên bản sao, `BroadcastChannel` cho các tab cùng origin, kịch bản lỗi xác định (mất mạng, xung đột, lỗi đọc, chậm), idempotency, version, audit. Phụ huynh đi qua `parentRepo` (projection chỉ dữ liệu công bố của đúng một học sinh, kiểm link mỗi lần đọc).
- **UI**: primitives `src/components/{ui,data,layout}`, shell theo vai trò (Platform/School/Teacher/Account/Public/Parent/Preview), `ClassroomLayout` chọn shell theo quan hệ thật với lớp, component nghiệp vụ `src/features/*`, trang chỉ ghép component.
- **Xuất/nhập**: CSV UTF-8 BOM, XLSX workbook thật, in/lưu PDF bằng trình duyệt (layout in sạch), parse CSV/XLSX cục bộ, tệp tải lên là Blob trong IndexedDB, tệp mẫu là SVG tổng hợp có nhãn “Dữ liệu minh họa”.

## 3. Phạm vi đã làm (có bằng chứng)

| Nhóm | Số mục | Trạng thái |
|---|---|---|
| Màn hình core | 118/118 | có route + dữ liệu + thao tác; ảnh desktop/mobile; smoke E2E 1448 & 390 |
| Nội bộ demo | 7/7 | `/demo`, `/preview/{references,sitemap,checklist,components,states,flows}` — chỉ bật khi `NEXT_PUBLIC_APP_MODE=demo`, không trong menu sản phẩm |
| Mở rộng kết quả học tập | 0/3 (OFF) | Không có route/menu; smoke xác nhận 404 |
| Component | 75/75 | ghi nhận nơi dùng + ảnh; 58 ví dụ chạy trực tiếp ở `/preview/components` |
| Overlay/form | 34/34 | 20 mở hộp thoại thật trong `/preview/states`, tất cả có trong route nghiệp vụ |
| Nhóm trạng thái | 28/28 | ví dụ sống ở `/preview/states` + trong route |

Mười màn tham chiếu R01–R10 được đối chiếu; ngoại lệ nghiệp vụ và sai khác còn lại ghi ở `docs/visual-diff-report.md`.

## 4. Luồng nghiệp vụ F01–F12

| Luồng | Bằng chứng |
|---|---|
| F01 Một trường bắt đầu | `scripts/qa-auth-platform-system-flows.mjs` (tạo trường nháp, mời quản trị, chặn kích hoạt khi thiếu quản trị), `scripts/qa-school-org-flows.mjs` (năm/lớp/phân công), `scripts/qa-students-families.mjs --commit` (nhập danh sách); lớp thiếu GVCN giữ Nháp + cảnh báo |
| F02 Hai nhiệm vụ | unit `F02/Q13`, `permissions.test.ts`; E2E `flows.spec.ts` (tab 10A1 vs 10A2, URL trực tiếp bị chặn) |
| F03 Một tuần đến phụ huynh | `scripts/qa-class-conduct-flow.mjs` (UI, đổi persona) + unit — phụ huynh thấy 97 chỉ sau công bố |
| F04 Chốt ≠ công bố | cùng script; unit trường B (GVCN chỉ chốt, lãnh đạo công bố) |
| F05 Điều chỉnh sau chốt | UI script: đề nghị → BGH duyệt → công bố lại → 102, bản 97 superseded; unit |
| F06 Link không tài khoản | `scripts/qa-parent-f06.mjs` (thu hồi qua UI SC24, tab phụ huynh đang mở tự chuyển trang không dùng được, link bố vẫn hoạt động); unit; E2E Q30 |
| F07 Không trừ trùng | unit (điểm danh tạo 1 ghi nhận, ghi tay bị DUPLICATE); UI O18 hard/soft |
| F08 Chuyển lớp & bàn giao | unit (lịch sử giữ lớp cũ); UI bàn giao 11A1, đề nghị chuyển lớp |
| F09 Nhập có lỗi | unit (preview lỗi từng dòng, nhập lại không nhân đôi); UI wizard 5 bước |
| F10 Hoạt động & minh chứng | `scripts/qa-class-activities-flow.mjs` (giao, giáo viên ghi nhận, duyệt + chia sẻ); PA09 chỉ tệp của con |
| F11 Lịch & thông báo riêng | unit (xung đột giáo viên, chặn công bố, không sửa quá khứ; tin riêng; thu hồi); UI đổi tiết nháp→công bố; E2E Q29 |
| F12 Lỗi & concurrency | unit (NETWORK không ghi, retry không nhân đôi, CONFLICT); UI `/preview/states` (ST05/06/07/08/20), SC19 xung đột thật; đổi vai trò xóa cache (`qc.clear`) |

## 5. Quyết định/ngoại lệ đáng chú ý

- Phụ huynh: token demo đọc được trong URL `/p/:slug/access?t=` rồi bị gỡ khỏi thanh địa chỉ và giữ trong `sessionStorage` của tab — **không phải thiết kế bảo mật**; backend phải thiết kế token thật.
- `/login` chỉ khớp email trong seed, không kiểm/lưu mật khẩu; `/demo` là cách duyệt chính.
- Đặt lịch công bố: mô phỏng theo DemoClock (có preset đổi giờ ở `/demo`), không có tác vụ nền.
- Điểm danh bộ môn theo tiết được lưu nhưng báo cáo tuần/phụ huynh dùng buổi sáng (buổi chủ nhiệm); ghi chú hiển thị trên CL05.
- Nhập “Giáo viên/Lớp/Lịch” ở SC26 chỉ có tệp mẫu, nhãn “Mô phỏng: chưa bật nhập tự động”.

## 6. Đợt sửa hạn chế cuối (đã kiểm)

- Ranh giới lỗi `error.tsx`/`global-error.tsx` kích hoạt thật qua `/preview/crash` (chỉ demo) + E2E.
- SC07 chạy trọn trên UI (E2E `rollover.spec.ts`).
- Tổng quan lớp năm lưu trữ: bỏ việc cần làm/lịch/điểm danh hôm nay, thay bằng lối tắt báo cáo; header hiện “Đã lưu trữ”.
- Roster trên điện thoại hiển thị dạng thẻ; header lớp “full” gọn 2 cột trên điện thoại.
- Hoạt động nháp chỉ hiện cho người có quyền quản lý hoạt động lớp (repository, cả list và detail).
- “Hoạt động gần đây” của giáo viên và lớp khớp nhật ký theo id thực thể/lớp (`auditClassIds`), không theo tên lớp.
- “In QR” chỉ hiện sau khi hiển thị link (SC13).
- Sơ đồ chỗ ngồi áp dụng hôm nay chuyển bản đang dùng sang “Đã thay”.
- Thông báo chỉ mở được khi thành viên và trường còn hoạt động.
- PublicShell bỏ padding kép; AuditDiff hiển thị nhãn tiếng Việt cho trường/giá trị.
- Lịch sử trường ở nền tảng gồm lời mời/quyền quản trị/quyền hỗ trợ (không lộ nhật ký nội bộ trường).
- Accessibility: axe 0 vi phạm serious/critical trên 123 route (chi tiết ở test-report).
- Sửa lỗi hydration do extension trình duyệt (ảnh lỗi `cz-shortcut-listen`).

## 7. Còn thiếu / hạn chế đã biết

- Không backend, không xác thực thật, không đồng bộ đa thiết bị, không email/Zalo, không lưu trữ tệp thật.
- Nội dung pháp lý (SY03/SY04) là bản nháp chờ chủ dự án/pháp chế duyệt — không thể tự hoàn tất.
- Báo cáo chuyên cần tuần/phụ huynh dùng buổi sáng (buổi chủ nhiệm); điểm danh theo tiết được lưu nhưng chưa gộp vào tỉ lệ — quyết định nghiệp vụ cần chủ dự án xác nhận, đã ghi chú trên CL05.
- Chưa kiểm trên thiết bị thật, Safari/Firefox, trình đọc màn hình thật.
- Ảnh bằng chứng sao sang `public/preview-references/evidence` (≈100 MB, đã gitignore; tạo lại bằng `node scripts/copy-references.mjs`).
