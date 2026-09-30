# 11 — Production trên aaPanel

## Điều kiện trước khi triển khai

Cần domain, DNS, chứng chỉ SSL, release đã kiểm thử, backup và restore drill; SMTP thật; người nhận cảnh báo; chính sách lưu giữ dữ liệu được nhà trường duyệt. Cấu hình kiểm tra tệp upload phải được chốt trước khi dùng tài liệu thật. Bộ handoff chưa có quyền truy cập máy chủ hoặc domain của dự án, do đó không tự thực hiện deploy production.

Tên menu aaPanel tùy phiên bản. Tài liệu này hướng dẫn kiến trúc Nginx/Docker, **không khẳng định giao diện aaPanel trên máy chủ của Cường đã được kiểm chứng**. Không bắt buộc Cloudflare. Không chạy thêm PostgreSQL hoặc Node/PM2 của cùng ứng dụng trên host: aaPanel quản lý vhost/SSL; Compose quản lý ứng dụng.

## Triển khai lần đầu

1. Tạo thư mục dự án riêng, ví dụ `/www/wwwroot/edumanage`. Kiểm tra RAM, disk, port và tài nguyên của các website đang chạy; không dừng hoặc xóa stack khác.
2. Build API và frontend ở CI hoặc máy build, ghi commit và digest của từng image. Giữ release trước để có thể rollback khi schema tương thích.
3. Copy `deploy/` và `scripts/` đã được Agent kiểm thử vào server. Tạo `.env.production` từ example; API, web, PostgreSQL và Nginx dùng `image@sha256:...`. Secret production phải khác local. Thư mục secret chỉ người vận hành được truy cập; quyền file phải đủ cho UID container đọc. Không commit secret.
4. Đặt `APP_URL=https://<domain>`, `APP_PORT=18763` nếu còn trống, `COOKIE_SECURE=true`, `MAIL_MODE=smtp`. Startup production phải từ chối demo, mock fallback, mail-file và cấu hình cookie không an toàn.
5. Sau khi duyệt release, chạy `MODE=production bash scripts/prod-up.sh --confirm-production`. Script kéo image, chạy migration riêng và khởi động stack. Tạo quản trị đầu tiên bằng CLI được ủy quyền, không chạy seed demo.
6. Tạo website/vhost Nginx và SSL trong aaPanel. Merge `deploy/aapanel-location.conf` vào cấu hình; không thay toàn bộ vhost hoặc chứng chỉ. Tránh trùng `location /`, giữ `/.well-known` để gia hạn SSL. Reverse proxy tới `http://127.0.0.1:18763`.
7. Kiểm tra cấu hình Nginx trước khi reload. Kiểm tra bằng domain HTTPS: đăng nhập, cookie, portal phụ huynh, tải tệp, cache, quyền và các route thật. Curl loopback thành công chưa đủ nghiệm thu domain production.

### Tạo secret production mới

```bash
python3 scripts/prepare-production-secrets.py --directory .secrets/production --confirm-new
```

Lệnh từ chối thư mục đã tồn tại. Bổ sung `smtp_password` bằng mật khẩu thật của nhà cung cấp qua thao tác quản lý secret, không nhập vào command history. Không dùng lệnh này để xoay mật khẩu PostgreSQL đang lưu trong volume: rotation cần `ALTER ROLE`, cập nhật file và restart consumer theo kế hoạch.

Hai file `app_key`/`mail_key` chứa 64 ký tự hex, runtime decode thành 32 byte; khóa mail dùng AES-256-GCM với nonce mới cho mỗi payload, có key version và authentication tag. Không dùng chuỗi hex 64 byte trực tiếp làm khóa AES-256. Các mật khẩu DB đọc nguyên chuỗi, bỏ newline cuối file.

## Headers, địa chỉ IP và cache

Gateway production đặt forwarded protocol là HTTPS và chỉ được dùng sau aaPanel. Backend chỉ tin gateway trong mạng nội bộ được cấu hình, không `trustProxy=true` với mọi nguồn. Các header `X-User`, `X-Role`, `X-School` không phải bằng chứng cấp quyền.

Template reset X-Forwarded-For để không nhận giá trị giả do browser tự gửi. Điều này có thể làm backend chỉ thấy IP proxy khi chưa cấu hình các hop tin cậy. Agent phải kiểm tra mạng/proxy thực tế, cấu hình Nginx real-IP và Fastify trust-proxy với đúng IP/CIDR, rồi thử giả mạo header. Không sửa thành tin mọi XFF để lấy IP cho nhanh. Rate limit còn phải kết hợp account, link và session, không chỉ IP.

Không cache `/api`, `/p`, `/school`, `/classroom`, `/teacher` bằng CDN hoặc Nginx cache. Không static-export trang hồ sơ. CSP cần phù hợp với Next.js thực tế, không dán một policy làm ứng dụng trắng trang. HSTS chỉ bật sau khi HTTPS hoạt động ổn định. Không publish 5432/3000/3001; hạn chế SSH/panel theo chính sách máy chủ.

## Cập nhật release

Đánh giá migration trước; backup và bố trí maintenance window nếu thay đổi không thể online. Dùng image đã kiểm thử, chạy migration với `edu_migrator`, thay API/worker/web, kiểm tra health và E2E. Script `prod-up.sh` **không tự backup**; người vận hành không được bỏ bước này.

Migration tương thích có thể rollback image. Migration phá tương thích thì không thể khôi phục dữ liệu bằng đổi image. Không tự chạy SQL down/DROP khi release lỗi. Mọi thủ tục thu hẹp cột/bảng dùng một release riêng sau khi đã chứng minh không còn code cũ phụ thuộc.

## Backup và restore drill

```bash
MODE=production bash scripts/backup.sh --confirm-maintenance
```

Script dừng gateway/web/API/worker để chụp một tập dữ liệu nhất quán: `pg_dump` đầy đủ bằng tài khoản backup/admin, cộng bản sao uploads; sau đó khởi động lại các service đã dừng. Người vận hành phải ngăn CLI hoặc writer ngoài stack ghi thêm trước khi chạy. Không tar thư mục pgdata đang chạy.

Backup trên cùng VPS chưa đủ. Mã hóa, sao chép off-host, kiểm checksum và lưu khóa giải mã ở nơi độc lập. Script không bao gồm khóa ứng dụng/SMTP trong archive; phải backup khóa riêng có kiểm soát. Metadata môi trường trong thư mục backup cũng là thông tin riêng tư, không đưa lên Git hoặc chat.

Restore vào **project Compose, database và port riêng**, không đè production:

- Khởi tạo roles/extensions với chủ sở hữu đúng; có đủ secret và khóa phục hồi.
- Restore database bằng tài khoản DBA, giữ owner/grants phù hợp; không restore bằng `edu_parent`.
- Phục hồi uploads và UID của volume; không chạy seed demo lên dữ liệu vừa khôi phục.
- Chạy `verify-installation`; đối soát số trường, học sinh, publications và checksum tệp.
- Kiểm thử đăng nhập, phân quyền giữa hai trường, quyền parent và trường hợp bị từ chối.
- Khi backup có nguy cơ lộ, thu hồi session/link theo phương án sự cố; không đổi khóa mã hóa tùy tiện làm mất khả năng đọc dữ liệu.

`pg_dump` không tự bao gồm server roles, uploads hoặc secret [S8](13-SOURCES-AND-ASSUMPTIONS.md). Một file dump tồn tại không chứng minh restore thành công. RPO/RTO phải được thống nhất và đo bằng restore drill, không cam kết “không mất dữ liệu” từ cấu hình.

## Ngừng sử dụng hoặc sự cố

Khôi phục database từ backup sẽ bỏ các write sau mốc backup nếu không có cơ chế phục hồi bổ sung. Phải có người quyết định và kế hoạch đối soát. Ngừng một trường là trạng thái vận hành, không tự xóa dữ liệu. Yêu cầu xóa hồ sơ cần quy trình lưu giữ/riêng tư riêng, không xóa hàng loạt để giải phóng ổ đĩa.

## Checklist production

Domain và SSL đúng; digest cố định; cookie an toàn; demo routes tắt; SMTP thật; thủ tục xoay secret; restore đã thử; các test từ chối quyền đạt; upload policy đã chốt; giới hạn log và cảnh báo disk; UI responsive; kết quả đo hiệu năng. Trạng thái “running” trong aaPanel không thay thế các kiểm tra này.
