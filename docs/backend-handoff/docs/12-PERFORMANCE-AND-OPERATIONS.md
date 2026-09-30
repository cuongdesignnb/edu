# 12 — Hiệu năng và độ ổn định

## Mục tiêu ban đầu, chưa phải kết quả đo

Gợi ý máy test runtime riêng cho stack: **2 vCPU, 4 GB RAM và SSD**. Trên VPS aaPanel có website khác, cần trừ tài nguyên đang dùng và có headroom. Build Next.js/TypeScript có thể cần RAM cao hơn runtime; ưu tiên CI hoặc máy build. Memory limits trong Compose là budget khởi đầu, không phải bằng chứng sizing phù hợp mọi trường.

Kịch bản đo đề xuất: hai trường, 40 lớp, 1.600 học sinh, 60 nhân sự, 50.000 bản ghi chuyên cần/thi đua, có các tuần đã công bố; 100 phiên đọc đồng thời và 10 writer. Báo cáo ghi cấu hình máy, commit, dataset, tỷ lệ loại request và trạng thái warm/cold.

Mục tiêu khởi đầu tại nội mạng: p95 read dưới 300 ms, write dưới 700 ms, không tính upload/job dài; lỗi ngoài lỗi chủ đích dưới 1%; không OOM hoặc cạn connection pool. Đây là **mục tiêu cần đo và điều chỉnh**, không được viết PASS chỉ vì chọn Fastify/PostgreSQL.

## Các quyết định để giữ nhẹ

Pool API 10, parent pool 5, worker 5 và migration 2 connection, vẫn để headroom trong cấu hình PostgreSQL max_connections=100. Không tạo pool mới cho mỗi request. Worker hai job đồng thời; không `Promise.all` hàng nghìn insert. Điểm danh bulk dùng một giao dịch thay vì một request riêng cho mỗi học sinh.

Bảng danh sách phân trang 25/50/100 dòng. Log lớn dùng keyset pagination. Index theo tenant, đối tượng và thời gian; foreign key có index nếu chưa có index với prefix thích hợp. Không thêm index trên mọi cột theo cảm tính. Dashboard không load toàn bộ records về bộ nhớ để cộng số.

Khi query chậm, đo `EXPLAIN (ANALYZE, BUFFERS)` trên staging synthetic. Không chạy lệnh có write trên production để thử mà quên ANALYZE thực sự thực thi statement. Tổng số bản ghi phải tính trên cùng filter/phạm vi với danh sách, tránh count toàn trường cho một giáo viên chỉ được một lớp.

Parent projection nhỏ và bất biến giúp tránh join nhiều bảng nghiệp vụ, nhưng vẫn kiểm tra thu hồi mỗi lần đọc. Permission cache chỉ trong request; không giữ quyền một giờ trong khi yêu cầu thu hồi ngay. Public school content có thể cache bằng version/invalidation riêng, không trộn payload riêng tư.

Upload streaming, quota theo trường, giới hạn ảnh/tệp và disk free. PDF/Excel chạy nền có giới hạn bộ nhớ và deadline. Retry có backoff; job thất bại có trạng thái để xử lý, không lặp mãi. Cleanup rate-limit/idempotency/mail theo TTL; không tự xóa audit và lịch sử khi chính sách lưu giữ chưa được duyệt.

## Quan sát vận hành

Log JSON gồm requestId, route template, status, duration và actor ID khi được phép. Không log password, token, raw cookie, payload gia đình hay URL chứa bí mật. Nginx/container logs giới hạn 10 MB × 3 file mỗi service trong template.

Theo dõi connection pool wait, slow query, outbox lag và số job lỗi, disk free, container restart, RSS, CPU, ready failures và SMTP errors. Dịch vụ không có số liệu thật thì hiển thị “chưa có dữ liệu”, không biểu đồ tình trạng giả.

Liveness không thay readiness. Worker heartbeat chỉ cập nhật sau khi vòng xử lý/DB check hoạt động, không dùng timer mù. Shutdown ngừng nhận việc mới, hoàn tất transaction ngắn và nhả hoặc để hết lease đúng cách. Stop grace 30–60 giây trong template phải được thử với công việc thực tế.

## Phục hồi và mở rộng

Kiểm thử DB restart, worker crash, SMTP mất kết nối và disk đầy. Một VPS chưa phải hệ thống high availability: cần backup off-host và restore drill. Bước mở rộng hợp lý là đo query/pool trước, sau đó shared object storage và thêm worker có lease, cuối cùng mới thêm API replica/load balancer.

Không tự scale API sang hai máy mà mỗi máy giữ một volume uploads khác nhau. Redis, pgBouncer hoặc hệ thống tìm kiếm chỉ được thêm khi có áp lực đo được và phương án vận hành rõ; không thêm để làm kiến trúc có vẻ phức tạp.
