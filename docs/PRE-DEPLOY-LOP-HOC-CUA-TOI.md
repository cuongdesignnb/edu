# Checklist trước deploy — Thiết kế lại "Lớp học của tôi"

| | |
|---|---|
| Ngày kiểm tra | 07/10/2026, môi trường local WSL2 Ubuntu 24.04, Node 24.19 |
| Mã nguồn gốc | `f349150` (v1.0.10), nhánh `codex/new-machine-audit-20261002` |
| Tag phát hành | `v1.0.11`: commit, tag và publish image theo yêu cầu chủ dự án ngày 07/10/2026; **production chưa update** |
| Loại thay đổi | **Chỉ frontend**: không đổi API, migration, cấu hình `.env`, Dockerfile hay compose |
| Tài liệu nghiệp vụ | [BA-REVIEW-LOP-HOC-CUA-TOI.md](BA-REVIEW-LOP-HOC-CUA-TOI.md) |
| Kết luận kỹ thuật | **Sẵn sàng về kỹ thuật.** Chủ dự án chỉ chạy owner update khi đủ điều kiện ở mục 4 |

## 1. Phạm vi thay đổi

**Commit phát hành chỉ gồm các file sau.** Không đưa vào các thay đổi dở dang có sẵn trước đó trong working tree: `docs/backend-progress.json`, `qa/backend/fast-track-*`, `docs/INTEGRATION-REMAINING.md`, `docs/NEW-MACHINE-HANDOFF.md`, `docs/new-machine-evidence/`, `media/`…

| File | Thay đổi |
|---|---|
| `src/features/classroom/sections.ts` (mới) | Gom tab server thành 6 mục; xác định mục và mục con đang chọn |
| `src/features/classroom/overview.tsx` (mới) | Trang Tổng quan mới |
| `src/features/classroom/context.tsx` | Đầu trang lớp mới, thanh 6 mục + mục con, ô "Lớp đang mở", `ClassStats`, `HomeroomCard`; bỏ `ClassTabs` |
| `src/app/classroom/[schoolId]/[yearId]/[classId]/page.tsx` | Route Tổng quan dùng `ClassOverview` |
| `src/app/.../students/page.tsx`, `src/features/activities/{activity-detail,activity-form,activity-list,evidence-page,shared}.tsx`, `src/features/class-comms/{announcements,files,reports}.tsx`, `src/features/class-org/{duties,groups,seating}.tsx`, `src/features/notebook/notebook-page.tsx` | Bỏ prop `variant` của `ClassHeader`; bỏ các thanh điều hướng con trùng lặp |
| `src/features/class-org/org-nav.tsx` (xóa) | Đã thay bằng thanh mục con chung |
| `src/features/notebook/quick-status.tsx` | Thẻ "Sổ chủ nhiệm" thành hook `useNotebookTasks` (cùng 2 API như cũ) |
| `src/features/attendance/sheet.tsx` | Nút "Có mặt cho N em còn lại" (chỉ đổi bản nháp) |
| `src/components/onboarding/registry.ts` | Tour lớp 6 bước, mốc mới `class-sections`, `class-tasks`, `class-quick` |
| `src/styles/globals.css` | Breakpoint `desk` = 1400px; style `.class-section-tab`, `.class-subtab` |
| `public/assets/illustrations/class-banner.png` (mới) | Ảnh banner cắt từ mockup *(cần xác nhận quyền dùng, Q9)* |
| `tests/native-ui-contract/class-{header,overview}-contract.spec.ts` | Cập nhật fixture lỗi thời: tab theo quy tắc header hiện tại, mock `me/onboarding`, `notebook` |
| `docs/CLASS-WORKSPACE-REDESIGN.md`, `docs/BA-REVIEW-LOP-HOC-CUA-TOI.md`, `docs/PRE-DEPLOY-LOP-HOC-CUA-TOI.md`, `qa/screenshots/class-redesign/*` | Tài liệu và ảnh bằng chứng (không nằm trong image vì `.dockerignore` loại `docs`, `qa`) |

## 2. Kết quả kiểm tra kỹ thuật

| # | Hạng mục | Lệnh / cách chạy | Kết quả |
|---|---|---|---|
| 1 | Typecheck toàn bộ | `tsc --noEmit` | **PASS** (0 lỗi) |
| 2 | Lint phần thay đổi | `eslint src tests` | **PASS** cho file thay đổi. Toàn repo còn 1 lỗi có sẵn ở `src/features/notebook/officer-workspace.tsx:24` (file không sửa) và 11 cảnh báo cũ |
| 3 | Unit test **đúng danh sách CI release** (`.github/workflows/publish-production-images.yml`) | `vitest run` 17 file | **PASS 106/106** |
| 4 | Toàn bộ unit test | `vitest run tests/unit` | 505/509. **4 lỗi có sẵn, không do thay đổi này** (mục 3) |
| 5 | Build image production | `docker build -f deploy/Dockerfile.web` (`npm ci` → `npm run typecheck` → `next build`) | **PASS**: compiled, TypeScript OK, 36/36 trang tĩnh. Image kiểm tra local `edumanage-web:redesign-check` (`sha256:811cb970aace…`), không dùng để phát hành |
| 6 | Chạy thử image production | `docker run` image ở mục 5 | **PASS**: `/login` trả 200; `/assets/illustrations/class-banner.png` trả 200 `image/png`; route lớp trả 200 |
| 7 | Test hợp đồng giao diện (API giả lập) cho đầu trang và Tổng quan | Playwright `class-header-contract`, `class-overview-contract` | **PASS 11/11** |
| 8 | Duyệt thật toàn bộ trang lớp (API + PostgreSQL local, seed + dữ liệu bổ sung) | `.secrets/local/redesign/real-shots.mjs` | **PASS 18/18 trang ở 1448px và 18/18 ở 390px**: đúng mục và mục con, 1 h1/trang, 0 lỗi JS, 0 lỗi API, 0 tràn ngang |
| 9 | Tương tác thật | `.secrets/local/redesign/uat-checks.mjs` | **PASS 6/6**: nút việc cần làm (UAT-10), 9 trang sâu (UAT-03), điểm danh nhanh không đổi em đã chọn (UAT-21/22), cảnh báo rời trang khi chuyển lớp (UAT-08), chuyển lớp (UAT-07), tour 6/5 bước (UAT-25) |
| 10 | Phân quyền theo vai trò | Đọc `workspace-header` của GVCN, GVBM, quản trị trường | Khớp bảng 4.2 trong tài liệu BA; GVBM không thấy mục ngoài quyền |
| 11 | Backend | — | Không đổi. Không cần chạy lại test tích hợp backend; CI release vẫn chạy chúng |

Ghi chú về môi trường kiểm tra:
- `node_modules` gốc cài trên Windows. Bản native cho Linux được cài riêng vào `.secrets/local/redesign/native` qua `NODE_PATH`; `package.json` và lockfile không đổi.
- Thư viện hệ thống cho Chromium headless được giải nén cục bộ (không cần root).
- Image production build bằng `npm ci` sạch trong Docker, nên không bị ảnh hưởng bởi các điều trên.

## 3. Lỗi có sẵn, không chặn phát hành

| Lỗi | Bằng chứng không liên quan thay đổi này |
|---|---|
| `tests/unit/api-activities-workspace.test.ts`: 3 test lỗi | Test chỉ import `src/lib/repositories/connected/activities.ts` và `src/lib/api/*`, không file nào bị sửa |
| `tests/unit/onboarding.test.ts`: 1 test mong `TOURS['class-homeroom'].autoPrompt === false` | Giá trị `true` có từ v1.0.10, không đổi. Chờ BA chốt (Q8) |
| ESLint `officer-workspace.tsx:24` "Cannot access refs during render" | File không sửa |
| Phần lớn spec `tests/native-ui-contract/*` khác (announcement, attendance, class-duties, class-organization, class-roster, class-student, parent-attendance, teacher-classes) | Fixture lỗi thời từ trước: nhãn tab cũ khiến header bị từ chối; thiếu mock `me/onboarding`. Spec phụ huynh và danh sách lớp của giáo viên (không dùng code mới) cũng lỗi y như vậy. Với roster và announcement, mọi kiểm tra giao diện đều qua, chỉ vướng lệnh gọi onboarding. Đã tạo việc riêng để sửa. Không nằm trong CI release |
| `scripts/verify-form-data-browser.mjs` còn kiểm `data-class-tabs` và menu "Thêm" của thanh tab cũ | Script QA thủ công của v1.0.x, không nằm trong CI; cần cập nhật nếu chạy lại |

## 4. Điều kiện Go / No-Go

- [ ] BA duyệt [BA-REVIEW-LOP-HOC-CUA-TOI.md](BA-REVIEW-LOP-HOC-CUA-TOI.md) và trả lời các câu hỏi chặn: **Q5** (khẩu hiệu mặc định), **Q9** (quyền dùng ảnh banner). Các câu khác có thể để đợt sau.
- [ ] UAT đạt, gồm các mục dev chưa kiểm: **UAT-13, UAT-18, UAT-23, UAT-26**.
- [ ] Chủ dự án duyệt nội dung commit (mục 1) và cho phép push/tag.
- [ ] CI `publish-production-images` của tag mới PASS, đủ 2 image, digest khớp.
- [ ] Chọn giờ deploy ngoài giờ học/điểm danh: `update-production.sh` có khoảng bảo trì ngắn (dừng writer → backup → migration → khởi động), không phải zero-downtime.
- [ ] Đã báo giáo viên về giao diện mới (mẫu ở mục 8).

## 5. Quy trình phát hành (theo quy trình hiện có của dự án)

> Bước 1–4 (commit, tag, push, publish image) dev đã làm theo yêu cầu chủ dự án. Bước 5 (owner update production) chỉ làm khi đủ điều kiện ở mục 4; dev không SSH production.

1. Đặt Git author identity của người được duyệt (máy hiện tại chưa cấu hình).
2. Commit **chỉ** các file ở mục 1. Ví dụ: `git add <danh sách file>`, rồi `git commit -m "feat(classroom): six-section class workspace, actionable overview, quick attendance"`.
3. Tag và push nhánh cùng tag: `git tag v1.0.11` → `git push origin codex/new-machine-audit-20261002 v1.0.11`.
4. Theo dõi GitHub Actions `publish-production-images`: core checks, test tích hợp backend, build 2 image. Kiểm SHA remote và nhãn OCI revision/version/digest.
5. Trên máy chủ (chủ dự án chạy):
   ```bash
   cd /www/wwwroot/edu && bash scripts/update-production.sh v1.0.11 && bash scripts/prod-status.sh
   ```
6. Kỳ vọng:
   - `RELEASE=v1.0.11`.
   - Schema và migration **không đổi** so với v1.0.10, `SCHEMA_MATCHES_RELEASE=YES`.
   - API, worker, web healthy; HTTPS PASS.

## 6. Smoke test sau deploy (production, chỉ đọc)

Dùng tài khoản giáo viên chủ nhiệm thật. **Không bấm Lưu hay Công bố trên dữ liệu thật.**

- [ ] Đăng nhập → Lớp học của tôi → mở lớp chủ nhiệm: thấy 6 mục; Tổng quan có Việc cần làm, Thao tác nhanh, Thống kê lớp.
- [ ] Bấm qua 6 mục và vài mục con: mở đúng trang, không có màn lỗi.
- [ ] Trang Điểm danh: có nút "Có mặt cho N em còn lại" nếu buổi chưa điểm danh. Chỉ kiểm hiển thị.
- [ ] Ô "Lớp đang mở" (nếu giáo viên có từ 2 lớp): chuyển lớp mở đúng Tổng quan.
- [ ] Mở bằng điện thoại thật: 6 mục dạng lưới, không tràn ngang.
- [ ] Một tài khoản giáo viên bộ môn: chỉ thấy mục được cấp.
- [ ] Một tài khoản quản trị trường: mở lớp từ Danh sách lớp, có nhãn "Xem theo quyền nhà trường".
- [ ] Ảnh banner hiển thị trên màn hình rộng (từ 1360px).
- [ ] `bash scripts/prod-logs.sh --tail 200`: không có lỗi mới từ web.

## 7. Rollback

Thay đổi chỉ ở frontend, không có migration, nên rollback image an toàn theo điều kiện trong `docs/PRODUCTION-FIRST-DEPLOY.md`:

```bash
cd /www/wwwroot/edu && bash scripts/rollback.sh v1.0.10 && bash scripts/prod-status.sh
```

Dữ liệu ghi trong thời gian chạy v1.0.11 (điểm danh, thi đua…) dùng cùng API và schema, nên vẫn còn nguyên sau rollback.

## 8. Mẫu thông báo cho giáo viên

> **Giao diện lớp học mới.** Khi mở một lớp, thầy cô sẽ thấy 6 mục: Tổng quan · Học sinh · Điểm danh & Rèn luyện · Lịch & Tổ chức · Hoạt động · Phụ huynh & Báo cáo. Bấm một mục, các phần nhỏ hiện ngay bên dưới.
>
> Trang Tổng quan liệt kê **việc cần làm hôm nay**, mỗi việc có nút làm ngay. Khi điểm danh, bấm **"Có mặt cho N em còn lại"** rồi chỉ cần sửa các em vắng hoặc đi muộn, sau đó bấm **Lưu điểm danh** (và **Công bố** khi muốn phụ huynh xem).
>
> Nếu dạy nhiều lớp, đổi lớp ở ô **"Lớp đang mở"** trên đầu trang. Bấm **"Hướng dẫn lớp này"** để xem hướng dẫn 6 bước.

## 9. Môi trường thử để BA làm UAT

- URL: http://localhost:24380. Chỉ chạy trên máy dev; muốn BA truy cập từ máy khác thì cần mở cổng hoặc dựng môi trường staging riêng.
- Tài khoản:
  - `teacher-a@example.invalid`: GVCN 10A1, GVBM Toán 10A2.
  - `admin-a@example.invalid`: quản trị trường.
  - `teacher-b@example.invalid`: GVBM 10A1.
- Mật khẩu: nằm trong `.secrets/local/redesign/login_password`, dev gửi riêng.
- Bật/tắt: `bash .secrets/local/redesign/up.sh` / `bash .secrets/local/redesign/down.sh`. Dữ liệu chỉ là dữ liệu giả.
