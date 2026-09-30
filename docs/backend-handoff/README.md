# EduManage — Backend PostgreSQL & Docker Handoff

**Phiên bản 1.0 · 30/09/2026 · Sản phẩm mới hoàn toàn**

Bộ đặc tả và template cho Agent tiếp tục **frontend đang làm**, xây backend thật, nối API, kiểm thử rồi chạy local bằng Docker. Đây **không phải source ứng dụng đã hoàn thành**, không phải bằng chứng đã deploy vào máy của chủ dự án.

## Mở gì trước?

1. [AGENT-BACKEND.md](AGENT-BACKEND.md) — yêu cầu giao việc chính.
2. [Kiến trúc dễ hiểu](docs/01-ARCHITECTURE.md) và [bộ sơ đồ offline](diagrams/index.html).
3. [Database dictionary](database/DATA-DICTIONARY.md), [DBML](database/DATABASE.dbml), [quy tắc dữ liệu](docs/02-DATABASE.md).
4. [API routes](api/ROUTES.md), [OpenAPI](api/openapi.yaml), [màn hình → API](api/FRONTEND-API-MAP.md).
5. [Docker local](docs/10-DOCKER-LOCAL.md), [production aaPanel](docs/11-AAPANEL-PRODUCTION.md).
6. [Trạng thái kiểm tra của chính bộ tài liệu](qa/HANDOFF-QA.md).

## Chốt phạm vi

Một hệ thống nhiều trường, tài khoản nhân sự do trường cấp, giáo viên làm đúng lớp/môn. Phụ huynh dùng link riêng chỉ đọc, không có tài khoản. Không thanh toán, không mã nguồn cũ, không migration dữ liệu cũ. Điểm môn/AI/tài khoản học sinh tắt mặc định.

**Stack đề xuất:** frontend Next.js hiện có + backend NestJS/Fastify + PostgreSQL 17 + worker dùng cùng code backend + Nginx. Không Redis/MinIO/Kafka/Elasticsearch trong bản đầu. Lưu tệp trên volume riêng, không trong database.

**Địa chỉ local mặc định:** `http://127.0.0.1:18763`. Chỉ gateway publish port. Đây là lựa chọn ít phổ biến, không đảm bảo trống trên mọi máy và không phải cơ chế bảo mật.

## Cách đặt tài liệu vào dự án

Giữ nguyên thư mục này tại `backend-handoff/` trong repo frontend để tra cứu. **Copy/merge riêng** `deploy/` và `scripts/` vào root repo. Không thay thư mục `docs/` hay `manifests/` của frontend bằng thư mục khác. Agent tạo `backend/`, copy SQL thành migration có checksum; không đổi frontend route đã có nếu không có lý do và mapping.

```text
project-root/
├── src/ hoặc app/               # frontend hiện có — giữ thiết kế
├── package.json + lockfile
├── backend-handoff/             # toàn bộ tài liệu này
├── backend/                     # Agent sẽ lập trình
├── deploy/                      # merge template từ handoff
└── scripts/                     # merge script từ handoff
```

Sau khi Agent đã lập trình và test hợp đồng build:

```bash
python3 scripts/prepare-local.py
bash scripts/dev-up.sh
bash scripts/seed-local.sh
```

Không chạy các lệnh trên trong thư mục tài liệu rồi kỳ vọng có app: chưa có `package.json` ứng dụng, controller, service và frontend build trong ZIP này. Preflight cố ý dừng khi thiếu source.

## Tiêu chuẩn bàn giao thật

Phải có code, migration đã chạy trên PostgreSQL thật, contract/E2E test, Docker healthy, frontend không fallback mock, parent chỉ đọc bản công bố và báo cáo QA có bằng chứng. Backup và restore-drill là hai việc khác nhau. Không đánh dấu production-ready chỉ vì HTTP 200.
