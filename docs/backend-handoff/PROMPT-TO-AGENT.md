# Đoạn giao việc cho Agent

Đọc `backend-handoff/AGENT-BACKEND.md` và toàn bộ file theo thứ tự được chỉ dẫn.

Tiếp tục trên source frontend EduManage đang có; không dựng lại UI hoặc dùng source hệ thống cũ. Xây backend NestJS/Fastify, PostgreSQL, phân quyền thật theo trường/lớp/môn/thời gian; phụ huynh chỉ đọc qua link riêng và chỉ nhận dữ liệu đã công bố. Không thanh toán, không tài khoản phụ huynh/học sinh, không bật module điểm học tập/AI ngoài phạm vi.

Dùng SQL/database diagram, OpenAPI và bảng screenId → operationId trong handoff làm hợp đồng. Kiểm tra schema trên PostgreSQL thật, nối toàn bộ HttpRepository, bỏ fallback mock ở connected mode, chạy integration/contract/E2E và giữ giao diện tham chiếu.

Hoàn tất rồi merge template deploy/scripts vào root, build Docker local tại `http://127.0.0.1:18763`. Kiểm port trước, không mở DB ra host, không xóa volume hoặc tác động dự án khác. Kiểm health, luồng giáo viên → công bố → phụ huynh, revoke, restart giữ dữ liệu, backup/restore và đo hiệu năng. Chuẩn bị runbook aaPanel, không tự deploy production chưa được chỉ định.

Thực hiện theo các mốc B0–B7. Báo cáo commit, trạng thái operation/screen, test đã chạy, URL local thật và blockers. Không nhận HTTP200 hoặc tồn tại file config là bằng chứng toàn hệ thống đã hoàn thành. Không báo PASS cho test chưa chạy.
