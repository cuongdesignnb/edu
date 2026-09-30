# 07 — Nối backend mà không phá UI

## Kiểm kê contract đang có

Đọc frontend repository interfaces và docs/frontend-data-contract.md của repo **thật**. `inputs/screens.json` là registry đặc tả, không chứng minh routes/components đã được code. Tạo một bảng status từ `api/frontend-api-map.json`, không lấy số tick trên PNG.

118 core items có mapping API hoặc rõ là static/error/help. DV01–DV07 chỉ UI lab mock, không phát hành endpoint đổi role/reset database. EX01–EX03 không route nghiệp vụ API mặc định, menu tắt. Không bắt backend 1controller tương ứng1page: nhiều screen dùng cùng source/query.

## Repository adapter

Giữ interfaces nơi có thể. Thêm HttpRepository/DataSource, `DATA_MODE=connected`. Frontend public base `/api/v1`, relative same-origin, fetch credentials include. Trong connected mode **không import fixture/IndexedDB** để fallback; networkfail hiển thị error/retry giữ form dirty, không toast success. Dữ liệu cache là cache của response, không source of truth.

Dùng generated client types từ OAS nhưng field-policy DTO là nguồn tối thiểu; không đưa DB model chứa token/password vào browser. Map camelCase/decimal string/date rõ. Không gửi expectedVersion cũ sau conflict rồi retry overwrite, phải cho user xem bản mới.

## Context và cache

Query key có principal/mode/school/year/class/filters. Đổi school/logout/revoke xóa cache cần thiết. Parent cache thêm viewId, không persist private data, một link một student/year. Refetch on focus và sau publish; tối ưu request dedupe, không auto polling mỗi giây mọi bảng.

Server components gọi nội bộ `API_INTERNAL_URL` và forward cookie của request, không dùng singleton global auth header/token. Mark fetch private no-store, không static generate student pages. Cookie trả từ backend qua Nginx, tránh rewrites/server-action double auth không cần thiết. UI vẫn phải hiển thị state permission change khi backend401/403, không tin context tải một lần lúc login.

## Mutation xuyên màn hình

Tạo lớp xong invalidate classes/dashboard/assign-picker. Grant change invalidate context + teacher classes; revoke tab cũ đọc/ghi bị chặn. Attendance update summary cùng store API. Publish invalidates staff publication list và parent query khi refresh. Parent preview gọi projection API có permission riêng, không gắn mock DTO vào màn hình để giả liên thông.

Import client preview chỉ hỗ trợ UX; server parse/validate lại file thật. Server trả job state và row errors; 202 không reset form “đã thành công”. Exports trả job download sau READY và kiểm quyền khi tải. Unavailable file hiển thị đúng error không link CDN vô điều kiện.

## Form và status

fieldErrors → từng trường;409 → drawer so sánh/lý do làm mới;403 → không quyền;503/offline → giữ dữ liệu chưa lưu;429 → thời gian thử lại. UNMARKED ≠ PRESENT; unpublished ≠0điểm; Đã lưu ≠ Đã công bố. Các trạng thái sai nghiệp vụ trong PNG phải giữ bản corrections của frontend, không hoàn nguyên.

## Nghiệm thu nối thật

Mở browser A teacher và B parent. Teacher nhập nháp → B không thấy. Publish → B refresh thấy đúng snapshot. Restart api/web → dữ liệu vẫn còn PostgreSQL. Thu hồi link → B lần đọc mới bị chặn. Thử thay studentId/classId ngoài scope bằng request thủ công →403/404, không chỉ bị ẩn UI. Kiểm source network không chứa raw dataset toàn trường khi parent load.
