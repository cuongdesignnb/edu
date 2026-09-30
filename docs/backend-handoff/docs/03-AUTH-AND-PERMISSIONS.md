# 03 — Danh tính, session và phân quyền phạm vi

## Tài khoản nhân sự

Email normalized để tìm danh tính, không gộp account mù dựa vào displayName. Hash password bằng Argon2id với thư viện có kiểm thử; tối thiểu cấu hình OWASP hiện hành, benchmark hash để tránh DoS; không SHA256 cho password [S7]. User được tạo qua invitation hoặc CLI bootstrap có kiểm soát. Không POST /register.

Invitation token ngẫu nhiên32 byte, lưu hash; hạn đề xuất48 giờ, một lần, revoke được. Trường có default roles trước khi gửi admin invite. Email đã có user: phải đăng nhập đúng email; lời mời trường B không reset mật khẩu của identity đang ở A. Cập nhật membership và grant atomically khi accept. Hai lần accept không tạo hai member.

Forgot-password luôn thông điệp chung; queue chỉ khi hợp lệ, throttle. Reset token hạn đề xuất30 phút, một lần; đổi mật khẩu thu hồi các session theo chính sách. Không trả email existence qua mã lỗi/thời gian dễ phân biệt. Password reset không cho quản trị đọc lại mật khẩu.

## Session cookie

Sinh32 byte random/session; DB chỉ hash. Cookie staff và parent khác tên; local HTTP cookie `edu_staff`/`edu_parent`, production `__Host-edu_staff`/`__Host-edu_parent` + Secure + HttpOnly + SameSite=Lax + Path=/, không Domain. Cookie TTL không thay check hết hạn DB. Rotate sau login/password change; không lưu token trong localStorage/IndexedDB.

Đề xuất staff idle30 phút, absolute12 giờ; parent idle30 phút absolute8 giờ. TTL là cấu hình sản phẩm ban đầu, không phát biểu nghĩa vụ pháp lý. Update last_seen gộp khoảng60 giây để giảm ghi, nhưng idle và revoked phải check ngay. Origin đúng APP_URL, CSRF bắt buộc mutations, kể cả login/logout/exchange. `/auth/csrf` cấp anonymous CSRF signed cookie + header token, không cấp staff quyền.

Không dùng CORS `*` kèm credential; cùng origin qua gateway là mặc định. Nginx/API chỉ tin proxy mạng được cấu hình; không nhận X-User, X-Role, X-School làm authority. Session revoked check DB mỗi request/download; các request đã hoàn tất trước revoke không thể “thu hồi” response đã gửi.

## Quyền = hành động và phạm vi cùng một grant

```text
User ACTIVE
AND session còn hạn/chưa revoke
AND School ACTIVE (trừ thao tác setup được chỉ định)
AND Membership ACTIVE
AND EXISTS grant có đúng action + scope + thời gian
AND assignment còn hiệu lực nếu action cần phân công
AND đối tượng cùng school/class/subject/year
AND trạng thái nghiệp vụ cho phép
```

Không lấy tập action của một grant cộng với class scope của grant khác. Cô Lan chủ nhiệm10A1 + Toán10A2 chỉ có quyền sơ đồ10A1, không10A2. SUBJECT scope không đồng nghĩa quản lý người giám hộ/công bố thi đua lớp.

`api/permissions.json` là allowlist action; `api/role-templates.json` là mẫu mặc định. Chủ nhiệm có thể được cấp chốt/công bố lớp theo mặc định, nhưng chỉ trong CLASS scope. GVBM chỉ đọc danh sách tối thiểu, lịch/tiết mình và ghi nhận được giao. Thông tin family/internalNote chỉ trả theo field-policy, không đủ “student.read” là trả mọi cột.

Quản trị trường chỉ được cấp action trong trần ủy quyền school; không tạo platform role. Custom role không được nhận action ngoài allowlist hoặc nâng quyền của người chỉnh. Scope và validity cần xem trước tác động. Thu hồi assignment phải thu hồi grant tương ứng trong cùng transaction; việc lịch sử vẫn giữ tác giả. Handover không xóa người dùng toàn hệ thống.

## Platform và support

Platform operator chỉ có metadata trường, trạng thái, admin bootstrap, tickets/operations. Dashboard aggregate không mở được danh sách điểm/family mọi trường. Route trường vẫn đòi membership hoặc support access do trường duyệt; không “platform=true bỏ qua mọi policy”.

Support access bản đầu chỉ READ, school + class tùy giới hạn + action allowlist + expires + lý do + người duyệt. Request phải chọn grant rõ ràng; API tính valid scope, log cả operator thật và grant. Không endpoint impersonate teacher; không hỗ trợ tự duyệt quyền mình. Trường tạm dừng có ngoại lệ support read do operator được ủy quyền để bàn giao; không tự mở cho parent.

## Hành vi API khi thiếu quyền

401 thiếu/hết session. 403 thiếu action biết rõ hoặc school suspended với context hợp lệ. Resource nằm ngoài scope →404 không tiết lộ nó tồn tại. Auth/session info công khai không trả stack, connection string hay danh tính người khác. Log nhạy cảm được che, audit actor là ID nhân sự thật.

Kiểm tra quyền trên **list, detail, create, update, export, download, worker callback**; chỉ ẩn nút không bảo mật [S3]. API báo hiệu quyền đổi bằng contextVersion/refresh context hoặc401/403; frontend đóng form và xóa query cache tương ứng, không cho lưu offline rồi tự đồng bộ sau khi bị thu hồi.
