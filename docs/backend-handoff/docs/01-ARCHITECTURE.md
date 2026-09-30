# 01 — Kiến trúc tổng thể

## Hiểu đơn giản

Frontend là nơi thao tác. Backend quyết định người này được làm gì và xử lý nghiệp vụ. PostgreSQL là nơi lưu dữ liệu chuẩn. Worker làm công việc dài để không làm chậm thao tác của giáo viên. Nginx là một cửa vào duy nhất.

```text
Trình duyệt → 127.0.0.1:18763 → Nginx :8080
                                    ├── /api/* → API NestJS/Fastify :3001
                                    └── phần còn lại → Next.js :3000
API ↔ PostgreSQL :5432 ↔ Worker (cùng image API)
API/Worker ↔ volume tệp riêng tư
Production: Internet HTTPS → Nginx aaPanel → gateway loopback như trên
```

Không tạo một database/một container cho mỗi trường ở bản đầu. Các trường dùng cùng schema có school_id và kiểm tra phạm vi. Không có frontend browser kết nối trực tiếp database.

## Quyết định kỹ thuật

| Phần | Lựa chọn | Vì sao / đánh đổi |
|---|---|---|
| Backend | NestJS + Fastify, TypeScript strict | Tổ chức module và policy rõ; không khẳng định framework tự làm app nhanh/an toàn |
| Dữ liệu | PostgreSQL 17, SQL migration + pg | Ràng buộc quan hệ, giao dịch, index, RLS rõ; cần repository/service test nghiêm túc |
| Session | Opaque random cookie, hash lưu DB | Thu hồi và kiểm tra ngay mỗi request, không phụ thuộc JWT dài hạn khó thu hồi |
| Jobs | PostgreSQL outbox + worker nhỏ | Bớt Redis; cần lease/retry/idempotent handler và cleanup hợp lý |
| Tệp | Volume private + StorageAdapter | Nhẹ một VPS; scale nhiều máy phải chuyển shared object storage, không tự scale API sang host khác |
| Báo cáo PDF | PDFKit + font Unicode hợp lệ | Nhẹ hơn browser render; phải thiết kế template riêng, không hứa pixel-exact screenshot |
| Triển khai | Docker Compose, một gateway | aaPanel chỉ lo domain/SSL/reverse proxy, không chạy thêm Node/PM2 host |

## Ranh giới module

Identity chỉ quản lý danh tính/phiên. Schools quản lý không gian trường. Academics tổ chức năm/lớp. Staff quản lý membership và phân công. Students giữ hồ sơ và lịch sử. Attendance/Conduct làm nghiệp vụ. Publication chịu trách nhiệm bản chia sẻ bất biến. Parent chỉ đọc projection, không đọc các aggregate quản trị. Files/Jobs/Reports là hạ tầng được policy bao quanh, không đường tắt bỏ qua quyền.

**Không dùng dependency vòng:** Conduct có thể nhận ID nguồn Attendance, nhưng Attendance không trực tiếp sửa điểm; application service điều phối bằng transaction/outbox. Parent không gọi StaffController rồi lọc vài cột.

## Cấu hình / môi trường

`APP_ENV` tách local/test/production; `DATA_MODE=connected` bắt buộc ở stack này. `NODE_ENV=production` vẫn được dùng cho image chạy local để test đúng build. Demo visual chỉ ở môi trường riêng; không dùng trình chọn vai trò demo để nhận session thật.

Database credentials theo process: API dùng edu_app và pool parent edu_parent; worker dùng edu_worker; migration dùng edu_migrator; postgres/admin chỉ init, backup, thao tác DBA được ủy quyền. Secret migration không mount API.

Không cần service health dashboard giả. PL10 lấy `operation_runs` thực tế hoặc hiện chưa có dữ liệu; giao diện không được chạy shell trên máy chủ. Không cần Cloudflare cho kiến trúc này.

## Giới hạn được chấp nhận

Một host chưa phải high availability; mất VPS cần restore. Một gateway + PG là điểm phụ thuộc, phải backup và theo dõi. Không có lời hứa 100 trường/100 nghìn user chỉ từ sơ đồ. Tối ưu và capacity theo phép đo ở tài liệu 12.
