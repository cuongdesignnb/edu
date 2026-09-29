# Build brief — quy tắc chung cho mọi nhóm dựng màn hình

Dự án: `D:\Edu` — Next.js 16 App Router, React 19, TypeScript, Tailwind v4, TanStack Query, Radix. Nền tảng (model, seed, repository mock, UI kit, shells) **đã có**. Mỗi nhóm chỉ dựng các ID được giao.

## Đọc trước khi code
1. `AGENT-FRONTEND.md` (phạm vi, ràng buộc) và `docs/BUSINESS-V2.md` (nghiệp vụ).
2. `docs/ui-conventions.md` — **bắt buộc tuân theo** (component, hook, mẫu trang).
3. `docs/01-SITEMAP-AND-SCREENS.md` — dòng của từng ID được giao (bố cục + thao tác phải có).
4. `docs/02-COMPONENTS-OVERLAYS-STATES.md` — overlay (O..) và state (ST..) liên quan.
5. `docs/03-REFERENCE-MAP-AND-CORRECTIONS.md` — sai khác nghiệp vụ phải sửa (không chép nguyên chữ/số sai của ảnh).
6. Mở trực tiếp ảnh tham chiếu (Read tool) được liệt kê cho nhóm mình trong `references/screens/*.png` (1448×1086) và bám sát bố cục/màu/thẻ.
7. Đọc code hiện có: `src/lib/model/types.ts`, repository liên quan trong `src/lib/repositories/*.ts` (API bạn gọi), `src/components/**`, mẫu `src/app/platform/page.tsx` + `src/features/platform/schools-table.tsx` (trang danh sách), `src/app/classroom/[schoolId]/[yearId]/[classId]/page.tsx` (trang trong lớp), `src/features/classroom/context.tsx`, `src/features/parent/shell.tsx`, `src/lib/fixtures/seed.ts` (dữ liệu mẫu).

## Dữ liệu mẫu hay dùng
- Trường A `demo-school-a` (slug `binh-minh`), năm `y-a-2026` (năm cũ `y-a-2025` lưu trữ), lớp `c-a-10a1` (42 HS), `c-a-10a2` (40), `c-a-11a1` (36), nháp `c-a-10a3`, `c-a-12a1`. Trường B `demo-school-b` (slug `an-hoa`), `y-b-2026`, `c-b-10a1` (35). Trường tạm dừng `sch-tranphu` (slug `tran-phu`).
- Minh Anh `demo-student-a-001` (10A1). Tuần hiện tại = tuần 5 (`y-a-2026-w5`, mở); tuần 1–4 đã công bố; tuần 4 Minh Anh = 97; có 1 điều chỉnh chờ duyệt (`adj-1`).
- DemoClock: Thứ Hai 05/10/2026 08:00 (+07). Hôm nay 10A1 buổi sáng đã lưu (38/2/1/1), chưa công bố.
- Persona (`--as=`): `platform:u-bao` (vận hành), `u-hanh` (QT trường A), `u-dung` (BGH A), `u-quan` (Giáo vụ A), `u-lan` (GVCN 10A1 + Ngữ văn 10A2), `u-hung` (Toán 10A1/10A2), `u-nam` (Vật lý, 2 trường), `u-khang` (QT trường B), `u-hoa` (GVCN B/10A1).
- Link phụ huynh: `/p/binh-minh/access?t=demo-minhanh-me` (mẹ), `demo-minhanh-bo` (bố), `demo-expired`, `demo-revoked`, `demo-limited` (chỉ 2 mục), `/p/tran-phu/access?t=demo-truong-tam-dung`, `/p/an-hoa/access?t=demo-anhoa-01`.

## Quy tắc
- Chỉ tạo/sửa file trong phạm vi sở hữu của nhóm. **Không sửa** file dùng chung: `src/lib/**`, `src/components/**`, `src/styles/**`, `src/features/classroom/context.tsx`, `src/features/parent/shell.tsx`, các `layout.tsx` đã có, route của nhóm khác. Cần dữ liệu mới → tạo file mới `src/lib/repositories/<nhóm>-extra.ts` theo mẫu `core.ts` (`read`/`write`, `requireAction`/`allowed`, `audit`, `validation`), import trực tiếp (không sửa `index.ts`). Phát hiện lỗi ở code dùng chung → **không tự sửa**, ghi vào báo cáo cuối (file:dòng + đề xuất).
- Tiếng Việt đủ dấu; không emoji; không `href="#"`; không `alert()`; không placeholder/“sắp có”; không mảng dữ liệu mẫu trong trang; mọi số lấy từ repository; phân biệt Đã lưu / Đã chốt / Đã công bố; không thanh toán; phụ huynh không tài khoản/chat/upload; module kết quả học tập tắt.
- Mỗi màn hình: dữ liệu thật từ repository, thao tác thật (`useCommand`), loading/empty/error, nút theo quyền (`can(...)`), form có validate + hủy + cảnh báo chưa lưu, xác nhận cho thao tác huỷ/công bố/thu hồi, responsive 390 & 1448 không tràn ngang body.
- File trang chỉ ghép component; phần tái sử dụng đặt trong `src/features/<nhóm>/`.
- Dev server **đang chạy** ở `http://localhost:3000` — không khởi động server khác, không chạy `next build`, không cài package mới trừ khi thật cần (khi đó ghi vào báo cáo).
- Typecheck: `npx tsc --noEmit 2>&1 | grep -E "<đường dẫn của nhóm>"` (nhóm khác đang làm song song — bỏ qua lỗi file không thuộc mình). Hạn chế chạy tsc quá dày (máy dùng chung).
- Chụp màn hình (Git Bash): `MSYS_NO_PATHCONV=1 node scripts/shot.mjs <route> D:/Edu/qa/screenshots/<ID>-desktop.png --as=<persona> --wait=2500` và bản điện thoại `--w=390 --h=844` lưu `<ID>-mobile.png`. Script in `overflowX` (phải 0) và lỗi console (phải rỗng). Màn hình có ảnh tham chiếu: chụp 1448×1086 và mở cả hai ảnh để so; sửa khác biệt bố cục. Với drawer/modal, viết script Playwright nhỏ `scripts/qa-<nhóm>-*.mjs` (channel `msedge`, cùng cách đặt phiên như `scripts/shot.mjs`) để mở rồi chụp.
- Ghi tiến độ `qa/status/<nhóm>.json`: `{ "screens": { "ID": { "status": "built" | "mock_connected" | "qa_screenshot", "route": "...", "evidence": ["qa/screenshots/..."], "notes": "..." } }, "overlays": { "O..": {...} }, "states": { "ST..": {...} }, "components": { "C..": {...} } }`. Chỉ ghi `qa_screenshot` khi đã thật sự chụp, xem và sửa lỗi nhìn thấy. Ghi rõ phần còn thiếu.
- Không commit git (trưởng nhóm sẽ review và commit).
- Báo cáo cuối: theo từng ID — route, đã dựng gì, thao tác hỗ trợ, ảnh chụp, thiếu sót; danh sách lỗi/đề xuất cho code dùng chung.
