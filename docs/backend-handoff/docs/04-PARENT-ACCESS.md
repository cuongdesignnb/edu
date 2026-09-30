# 04 — Phụ huynh chỉ xem, không tài khoản

## Đường đi

Giáo viên xác minh quan hệ → cấp link gắn đúng student/school/year/guardian → gửi riêng → người nhận mở link → backend tạo phiên chỉ đọc → lấy projection đã công bố. Không parent user row, mật khẩu, đăng ký, OTP bắt buộc hoặc chat.

Route UI giữ `/p/:schoolSlug/access` và các PA02–PA14. Link dạng `.../p/{schoolSlug}/access#token={random}`. Fragment không tự đi vào HTTP request, nhưng vẫn là bí mật mà người cầm có thể chia sẻ. FE đọc fragment rồi xóa URL; POST token same-origin vào `/api/v1/parent/{schoolSlug}/access/exchange`. Không consume token vì GET/preview bot. Bootstrap không tải tracker/font/asset bên thứ ba.

Token32 byte random; hash SHA256 phù hợp token high entropy (khác password). DB không lưu link gốc. Hạn đề xuất90 ngày hoặc cuối năm được cấp, mốc sớm hơn; từng trường có thể rút ngắn. Các mục xem và quyền download explicit, không wildcard hết học sinh. Mở link không chứng minh danh tính người nhận; audit ghi “link cấp cho ... được sử dụng”, không “ông A chắc chắn đăng nhập”.

## Một link không làm lộ cả lớp

`parent_publication_items` lưu payload **một học sinh/một section/một bản công bố**, không mảng cả lớp. Tạo bằng allowlist mapper có runtime schema, không `...student`/`...staffSnapshot`. `edu_parent` chỉ SELECT projection và document items qua RLS; không SELECT raw students/guardians/conduct/attendance/staff_snapshot.

Backend xác minh hash cookie → resolve session (pool auth) → đặt sessionId và schoolId trong transaction parent pool → query projection. Function SECURITY DEFINER có search_path cố định, owner migration bị FORCE RLS, kiểm session/link/relationship/school/year/section/publication. Không dùng user-supplied UUID session làm trusted identity.

Các nguồn lịch/hoạt động/thông báo/chuyên cần đều có publication revision. Tổng quan cho parent chỉ trả thông tin tối thiểu của con và teacher work contact được cho phép, tuyệt đối không phone riêng/default user.email. Quan hệ revoked/can_receive=false thì mọi link tương ứng không đọc tiếp được. File phải AVAILABLE và document còn quyền, checked ngay trước stream.

## Đa tab/đa con

Bản đầu **một context parent đang hoạt động trong cùng browser cookie jar**. Mỗi lần exchange tạo viewId bằng session ID không phải bearer secret. FE giữ viewId trong memory/sessionStorage theo tab và gửi `X-Parent-View`. Mở link con khác thay cookie; tab cũ gửi viewId khác phải nhận409 PARENT_CONTEXT_CHANGED, không tự hiển thị dữ liệu con vừa mở. Trường hợp hai phụ huynh dùng chung thiết bị cần đóng phiên/đổi link có thông báo rõ.

Một người có hai con dùng hai link riêng; không tìm cả gia đình bằng phone. Muốn hỗ trợ song song nhiều context sẽ cần thiết kế cookie/tab binding riêng và test, không tự bỏ check này.

## Thu hồi, cấp lại và lịch sử

- Revoke cập nhật link và revoke sessions liên quan, audit transaction; lần đọc/tải mới bị chặn ngay. Frontend cần revalidate khi focus/navigation, không persist private payload lâu dài. Không có lời hứa xóa screenshot/file đã lưu trước.
- Reissue tạo token mới + revoke cũ atomically. Token gốc chỉ trả một lần; copy/QR chỉ thời điểm tạo. GET chi tiết link không trả token.
- Idempotent replay issue/reissue không thể trả token từ hash: trả409 `LINK_ALREADY_ISSUED`/ID kết quả, UI hướng dẫn cấp lại có xác nhận. Không cất rawToken vào idempotency response_metadata/log.
- Trong cùng trường+năm, chuyển lớp giữ link cho chính student và lịch sử đúng enrollment. Sang năm/trường khác phải cấp quyền mới; không auto mở rộng.
- Với link không hợp lệ trả lỗi chung, không tên con/người giám hộ. Sau context đã valid có thể giải thích hết hạn/thu hồi nhưng không lộ thêm thông tin ngoài scope.

## Cache và preview

Mọi parent/API private `Cache-Control: no-store`, no-referrer, noindex; không cho CDN/service worker cache. Noindex không phải access control. Staff preview đòi `parent_access.preview` + scope, gọi cùng serializer nhưng không đổi cookie staff, không được xem draft để giả như phụ huynh đã thấy.

Không tự cấp download chỉ vì được xem metadata. Khi deny export report parent, trả403 nếu context hợp lệ. File download qua API streaming, không public uploads URL; link ký nếu chuyển S3 sau này vẫn có thời gian sống dư, cần chốt thay vì cam kết thu hồi tức thì cho presigned URL.
