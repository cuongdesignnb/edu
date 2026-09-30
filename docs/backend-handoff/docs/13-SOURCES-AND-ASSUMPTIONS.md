# 13 — Nguồn, phiên bản và giới hạn

## Nguồn nội bộ đã đọc

Handoff frontend trong cùng cuộc hội thoại: AGENT-FRONTEND.md, sitemap, screens.json và BUSINESS-V2.md — bản sản phẩm xây mới hoàn toàn. Bản sao nằm trong `inputs/` để Agent đối chiếu. Registry có 118 core, 7 demo và 3 optional; không phải bằng chứng từng màn hình đã được lập trình. Không có repo frontend đã triển khai hoặc quyền máy chủ production trong handoff này.

Bộ backend mới quyết định PostgreSQL 17, NestJS/Fastify, SQL migrations, queue PostgreSQL và port 18763. Các quyết định này thay giới hạn “chưa API/database” của phase frontend, không đưa source hoặc migration dữ liệu cũ trở lại.

## Nguồn kỹ thuật chính thức đối chiếu ngày 30/09/2026

- **S1 — Node release/LTS:** https://nodejs.org/en/about/previous-releases . Chọn Node 24 LTS; Agent pin bản vá thực tế tương thích với lockfile.
- **S2 — PostgreSQL 17 RLS:** https://www.postgresql.org/docs/17/ddl-rowsecurity.html ; support policy: https://www.postgresql.org/support/versioning/ . FORCE, table owner và BYPASSRLS phải cấu hình và kiểm thử; chỉ có school_id chưa đủ.
- **S3 — OWASP Authorization:** https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html . Kiểm quyền từng request và áp dụng least privilege.
- **S4 — Docker dependencies:** https://docs.docker.com/compose/how-tos/startup-order/ ; port publishing: https://docs.docker.com/engine/network/port-publishing/ . Loopback và health dependencies không thay application tests.
- **S5 — Next self-hosting:** https://nextjs.org/docs/app/guides/self-hosting . Reverse proxy, build-time public env và cache riêng tư phải được cấu hình đúng.
- **S6 — OWASP File Upload:** https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html . Allowlist, type validation, limits và private storage là các lớp bảo vệ, không có một biện pháp bảo đảm mọi tệp an toàn.
- **S7 — OWASP Password Storage / Session:** https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html ; https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html . Password hashing và token ngẫu nhiên có cách xử lý khác nhau.
- **S8 — PostgreSQL pg_dump:** https://www.postgresql.org/docs/17/backup-dump.html . Backup logical database không tự gồm roles, uploads hoặc khóa bí mật.

Không lấy được các URL tài liệu aaPanel trực tiếp qua công cụ ở lượt này. Runbook hướng dẫn Nginx/Docker, không khẳng định tên menu aaPanel hiện hành đã được xác minh. Agent xem đúng phiên bản đang cài khi triển khai.

Thời hạn link/session, upload quota và chỉ tiêu hiệu năng là đề xuất cấu hình sản phẩm, cần được chủ dự án/nhà trường duyệt. Không có tuyên bố chứng nhận pháp lý hoặc 100% uptime. Phần scanner, PDF/font và SMTP phải được kiểm thử thật. QA của handoff ghi rõ nội dung đã kiểm tra tĩnh và các kiểm tra runtime chưa thực hiện.
