# EduManage — dropdown và chi tiết thông báo

Nghiệm thu ngày 02/10/2026, sau commit tour `56b4b07d8a262dc9b10c9d989b96a508d151851c`.

Bấm chuông trên thanh đầu trang mở dropdown gồm tối đa sáu thông báo gần nhất, tiêu đề, nội dung rút gọn, trường, thời gian và dấu chưa đọc. Dropdown có cuộn khi cần; nút **Xem thêm** ở cuối mở `/notifications`. Bấm từng thông báo mở `/notifications/{notificationId}`. Trang danh sách cũng có liên kết tiêu đề và nút **Xem chi tiết**.

Trang chi tiết hiển thị nội dung thông báo cá nhân, tự đánh dấu đã đọc bằng endpoint hiện có, cập nhật số chưa đọc và cho mở nội dung nghiệp vụ liên quan khi server xác nhận quyền. Nếu ghi đã đọc thất bại, không giả lập thành công; người dùng có thể thử lại bằng nút Đánh dấu đã đọc. Không tìm thấy ID trong feed của tài khoản hiện tại thì hiển thị không khả dụng, không gửi read receipt cho ID đó. Quyền thay đổi tiếp tục dùng cache/session scope và dữ liệu đã được server loại nội dung ngoài quyền.

Dropdown, danh sách và chi tiết dùng chung query của feed cá nhân hiện có. Không thêm API, database, migration, account, fixture hoặc quyền nghiệp vụ. Có trạng thái tải/lỗi/thử lại/rỗng; dropdown platform vẫn dẫn đến trang thông báo hiện có. Nội dung được render dưới dạng text. Dùng Radix, token giao diện và quản lý bàn phím/focus sẵn có.

## Kiểm tra

- `npm run typecheck`: PASS.
- ESLint các file thay đổi và test dropdown: PASS, không lỗi/cảnh báo.
- `npx vitest run tests/unit/api-session.test.ts tests/unit/api-query-boundary.test.ts tests/unit/api-scope-guard.test.ts tests/unit/onboarding.test.ts`: 25/25 PASS.
- Docker web build, gồm `npm run build`: PASS.
- `npx playwright test tests/e2e/notification-dropdown.spec.ts --workers=1 --reporter=list`: 5/5 PASS trên Microsoft Edge, HTTP/database local thật. Kiểm dropdown → danh sách, click → đúng chi tiết, read receipt và reload, keyboard/Esc/focus, axe, responsive 320/390/768/1440, tài khoản khác/ID không tồn tại và dropdown platform rỗng. Request ghi ngoài auth chỉ có POST endpoint đã đọc; không ghi nghiệp vụ.
- Tour dùng chung topbar: `npx playwright test tests/e2e/guided-tour.spec.ts --grep 'school replay|dirty forms|platform tour' --workers=1 --reporter=list`: 3/3 PASS. Không chạy lại full CMS audit.

Ảnh dropdown, danh sách và chi tiết để xem tại `D:\Edu\Anh-tour`; log/receipt và build manifest ở `.secrets/local`. Không đưa các ảnh, thông tin riêng hoặc credential vào Git.

## Runtime và bàn giao

- Local URL: http://127.0.0.1:18763.
- Web image: `edumanage-web:notifications-20261002-6bcc42c14f4a`.
- Build-input SHA-256: `6bcc42c14f4a18d463694cbd8700305d3bfb933994828da75bca4dfc79b2f8ba`.
- API/worker giữ build `tour-20261002-5d5e8f927976`; readiness của API tiếp tục trả build đó. Không gán API cho tag web mới.
- Compose hỗ trợ `WEB_IMAGE_TAG` riêng, mặc định vẫn theo `IMAGE_TAG`. Chỉ build/recreate web; giữ nguyên API, worker, gateway, PostgreSQL, volume và secret.
- Repository: https://github.com/cuongdesignnb/edu, branch `codex/new-machine-audit-20261002`. SHA mới được xác minh sau push trong bàn giao; commit chứa báo cáo này chỉ bao gồm phần dropdown/chi tiết, cấu hình tag web, test và báo cáo.
- Working build inputs được đối chiếu với manifest; Git chỉ chuẩn hóa CRLF→LF theo .gitattributes, không đưa sửa ứng dụng chưa test vào commit. Không deploy production.
