# 06 — Quy ước API và contract

**Canonical:** `api/openapi.yaml`. `api/ROUTES.md` là bảng dễ đọc sinh từ cùng registry; `frontend-api-map.json` ánh xạ screenId → operationId. Không suy luận URL API từ URL UI bằng replace string.

Base `/api/v1`; controller nhóm /auth,/me,/platform,/schools/{schoolId},/parent/{schoolSlug},/public. Classroom UI chứa yearId nhưng resource class API đã trỏ year; backend xác nhận class.year_id khớp year context khi query yearId có truyền, không cho đổi UI year để đọc lịch sử sai.

## Format

- Body camelCase, DB snake_case qua mapper rõ. JSON numbers cho counter, điểm decimal string. ID UUID; timestamp RFC3339 UTC; date YYYY-MM-DD.
- Read singular `{data: {...}, requestId}`; list `{data: [],page:{limit,nextCursor,hasMore,total?},requestId}`. Limit mặc định25,max 100. Cursor opaque encode lastsort+id, kiểm scope/filter fingerprint; invalid cursor422/400 không SQL injection.
- List `q` chỉ trường được phép; sort allowlist có tie-breaker id. `total` chỉ tính khi cần/bound scope, không lệch filter. Keyset cho log lớn; không gửi 10nghìn student để UI tự phân trang.
- PATCH có `expectedVersion`; version mismatch409 `VERSION_CONFLICT` kèm currentVersion, không tự overwrite. Body không chấp nhận unknown fields. Từ chối actor/school/status ngoài command chuyên biệt.
- POST trạng thái có command riêng (`.../publish`, `.../revoke`, `.../approve`); GET không thay đổi nghiệp vụ. Parent POST chỉ exchange/revoke-session, không writes học sinh.

## Lỗi

`application/problem+json`: type,title,status,code,requestId; fieldErrors khi có; detail không chứa SQL, host DB hoặc PII. 401 session không hợp lệ;403 action/CSRF/suspended;404 ngoài scope/không tồn tại;409 stale/conflicting state;422 input domain;429 rate;503 chưa sẵn sàng. Retry-After khi429/503 phù hợp.

Mã tối thiểu: VALIDATION_ERROR, UNAUTHENTICATED, FORBIDDEN, SCHOOL_SUSPENDED, RESOURCE_NOT_FOUND, VERSION_CONFLICT, IDEMPOTENCY_CONFLICT, PERIOD_LOCKED, PENDING_REVIEW, DUPLICATE_SOURCE, SCHEDULE_CONFLICT, LAST_ADMIN_REQUIRED, PARENT_ACCESS_UNAVAILABLE, PARENT_CONTEXT_CHANGED, LINK_ALREADY_ISSUED, FILE_UNAVAILABLE, JOB_FAILED.

## Ví dụ thao tác

```http
GET /api/v1/auth/csrf
POST /api/v1/auth/login
Content-Type: application/json
X-CSRF-Token: <bootstrap token>

{"email":"teacher-a@example.invalid","password":"<nhập qua form, không lưu log>"}
```

Cookie được browser giữ HttpOnly. Frontend gọi `/me/context`, rồi `/schools/{schoolId}/teacher/classes`; không gửi role client.

```http
POST /api/v1/schools/{schoolId}/classes/{classId}/conduct-periods/{periodId}/publish
Content-Type: application/json
X-CSRF-Token: <staff token>
Idempotency-Key: <random cho command này>

{"expectedSourceVersion":12,"reason":"Đã rà soát tuần"}
```

URL publish thực dùng đúng bảng ROUTES; ví dụ phải được integration test khớp registry. Chưa bao giờ lấy deltaSnapshot/finalPoints client để commit score.

## Contract và docs chính xác

OpenAPI trong handoff là thiết kế, chưa phải Swagger của app đã deploy. Agent validate spec, generate client types, test response validation và diff spec thực thi. Operation auth='none' không có nghĩa bỏ CSRF/rate/Origin cho anonymous mutations. `permission` ghi `a+b` nghĩa cần cả hai trên **cùng resource**, không OR tùy tiện.

Uploads streaming multipart, max 25 MiB+overhead gateway26MiB; request DTO upload không cho path. Download trả binary; Content-Disposition attachment sanitized; Content-Type chỉ từ type đã xác minh. Jobs202 tức đã queued, chưa “đã gửi/đã xuất”. Link/password tokens không log query/body; frontend dùng fragment và POST.

Health/live chỉ process; ready phải pg/schema/storage. Ready response public minimal; chi tiết vận hành endpoint có platform permission. Production không public Swagger/spec nội bộ chứa endpoints chưa được phép trừ khi được duyệt.

## Chống lặp

Mutations scope school yêu cầu Idempotency-Key theo OAS. Server reserve row và payload hash trong cùng transaction; concurrent retry đọc kết quả sau commit hoặc409 IN_PROGRESS, không chạy lần2. TTL đề xuất24 giờ, nhưng source unique lâu dài. Lệnh trả secret lần đầu là ngoại lệ hash-only, xem tài liệu parent. Password/login chống retry theo policy không chép secret vào idempotency cache.
