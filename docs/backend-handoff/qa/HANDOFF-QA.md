# Kết quả kiểm tra bộ handoff

**Trạng thái:** PASS_STATIC · 30/09/2026

Đây là kiểm tra tài liệu/config và trình xem sơ đồ, **không phải kiểm thử ứng dụng đã triển khai**.

| Kiểm tra | Kết quả | Ghi chú |
|---|---|---|
| DB_TABLE_NAMES_UNIQUE | PASS |  |
| FK_COLUMNS_TYPES_TARGET_UNIQUES | PASS | 222 foreign keys checked |
| SQL_TABLES_MATCH_MODEL | PASS | 75 tables |
| DBML_TABLES_MATCH_MODEL | PASS |  |
| SQL_FKS_MATCH_MODEL | PASS |  |
| RLS_ALL_TENANT_TABLES_DECLARED | PASS | 60 tables; declaration check only |
| NO_DESTRUCTIVE_BASELINE_DROP | PASS |  |
| OPENAPI_LOCAL_REF_RESOLUTION | PASS | 300 schemas; not official OpenAPI validator |
| OPENAPI_REQUIRED_FIELDS_EXIST | PASS |  |
| OPENAPI_OPERATION_ID_UNIQUE | PASS | 264 operations, 207 paths |
| OPENAPI_PATH_PARAMETERS | PASS |  |
| OPENAPI_REGISTRY_MATCH | PASS |  |
| FRONTEND_REGISTRY_IDS_COVERED | PASS | 128 input screen/view IDs |
| FRONTEND_OPERATION_REFS_RESOLVE | PASS |  |
| NO_ACADEMIC_OPTIONAL_APIS | PASS |  |
| ROLE_ACTIONS_ALLOWLIST | PASS |  |
| COMPOSE_local_LOOPBACK_ONLY | PASS | [('gateway', '127.0.0.1:${APP_PORT:-18763}:8080')] |
| COMPOSE_local_DEPENDENCY_NAMES | PASS |  |
| COMPOSE_local_SECRET_NAMES | PASS |  |
| COMPOSE_local_PG_INTERNAL | PASS |  |
| COMPOSE_local_NO_SOCKET | PASS |  |
| COMPOSE_production_LOOPBACK_ONLY | PASS | [('gateway', '127.0.0.1:${APP_PORT:-18763}:8080')] |
| COMPOSE_production_DEPENDENCY_NAMES | PASS |  |
| COMPOSE_production_SECRET_NAMES | PASS |  |
| COMPOSE_production_PG_INTERNAL | PASS |  |
| COMPOSE_production_NO_SOCKET | PASS |  |
| COMPOSE_PRODUCTION_NO_BUILD | PASS |  |
| PYTHON_SYNTAX_preflight.py | PASS |  |
| PYTHON_SYNTAX_prepare-local.py | PASS |  |
| PYTHON_SYNTAX_smoke-local.py | PASS |  |
| PYTHON_SYNTAX_prepare-production-secrets.py | PASS |  |
| BASH_SYNTAX_dev-up.sh | PASS |  |
| BASH_SYNTAX_prod-up.sh | PASS |  |
| BASH_SYNTAX_common.sh | PASS |  |
| BASH_SYNTAX_seed-local.sh | PASS |  |
| BASH_SYNTAX_dev-down.sh | PASS |  |
| BASH_SYNTAX_backup.sh | PASS |  |
| BASH_SYNTAX_init-db.sh | PASS |  |
| SVG_EXPECTED_COUNT | PASS |  |
| DIAGRAM_HTML_EMBEDS_ALL_SVGS | PASS |  |
| DIAGRAM_HTML_NO_EXTERNAL_SCRIPTS | PASS |  |
| DIAGRAM_BROWSER_PREVIEWS_EXIST | PASS |  |
| DOCUMENT_LINK_TARGETS_EXIST | PASS | [] |
| NO_SECRETS_PACKAGED | PASS |  |

## Kiểm tra chưa chạy

- **NOT_RUN:** PostgreSQL migration execution
- **NOT_RUN:** Database/RLS fixture integration tests
- **NOT_RUN:** Official OpenAPI validator (package unavailable)
- **NOT_RUN:** Docker Compose config/build/up (Docker unavailable)
- **NOT_RUN:** Application unit/contract/E2E tests (source implementation not provided)
- **NOT_RUN:** Performance benchmark
- **NOT_RUN:** Production aaPanel deployment
- **NOT_RUN:** Backup restore drill

## Giới hạn môi trường

Môi trường tạo tài liệu không có Docker hoặc PostgreSQL server/client và không có source ứng dụng frontend/backend đã lập trình. Thử cài công cụ validate bổ sung không thành công do DNS/network; không thay kết quả này bằng PASS. Ràng buộc SQL được đối chiếu tĩnh với model, chưa chứng minh PostgreSQL chấp nhận và thực thi đúng.

11 sơ đồ SVG được render bằng Graphviz. HTML được nạp nội dung trực tiếp trong Chromium/Playwright, chuyển tab/zoom và chụp desktop/mobile, không có JavaScript page errors. Điều hướng file:// bị chính sách browser môi trường chặn; không khẳng định đã thử mở file trên máy người dùng. HTML tự chứa SVG, không cần CDN hoặc network để hiển thị.

Ảnh trong qa/previews chỉ là trình xem tài liệu, không phải ảnh CMS đang chạy. Agent phải chạy migration, validator chính thức, Compose, integration/E2E và đo hiệu năng trước khi báo hoàn tất.
