# EduManage — quyền giáo viên V2 và TKB của GVCN

Repository: https://github.com/cuongdesignnb/edu
Branch: `codex/new-machine-audit-20261002`
Baseline: `v1.0.8` / `3ea1223f3803b1ecbba581a4d699fad4434c9044`
Release dự kiến: `v1.0.10`, chỉ tạo sau khi các kiểm tra bên dưới PASS.

Tag `v1.0.9` giữ nguyên ở `f559e8eeea3f726fad0e64691481f08aa490830a`. CI của tag này dừng ở test migration cũ do assertion lấy `teacher.self` của mọi role. Patch `v1.0.10` chỉ giới hạn assertion vào đúng TEACHER được giữ nguyên trong fixture và cập nhật tài liệu release; không đổi thêm logic ứng dụng hay migration.

## Kết quả ứng dụng

Mọi thành viên giữ SCHOOL_ADMIN đang có hiệu lực được dùng đủ 75 quyền thuộc nhà trường trong cùng tenant, bao gồm tạo trực tiếp tài khoản giáo viên và quyền đọc nhập dữ liệu. Admin mở và thao tác lớp bằng chính tài khoản của mình; audit giữ actor admin. Migration `066-school-admin-permission-authority.sql` bổ sung quyền thiếu theo từng tenant, giữ nguyên checksum các migration cũ. System role vẫn không sửa được qua API/UI.

Editor sinh từ `contract.permissions` thông qua `backend/scripts/teacher-permission-contract.mjs`. Danh mục hiển thị 75/75 quyền ngoài platform, nhãn và nhóm tiếng Việt, tìm kiếm, chọn/bỏ nhóm và bốn preset. Metadata phạm vi dùng chung cho backend và frontend; scope không hợp lệ trả 422 `INVALID_PERMISSION_SCOPE`. Platform permission không xuất hiện và không được School Admin cấp.

Admin sao chép mẫu hệ thống với đúng từng quyền/phạm vi, sửa bản tùy chỉnh, đặt mặc định GVCN/GVBM hoặc đổi mẫu của một phân công. Đổi mặc định có hai lựa chọn: chỉ phân công mới hoặc các phân công đang hiệu lực; preview đếm ảnh hưởng, yêu cầu lý do và xác nhận. Đổi phân công giữ nguyên giáo viên, lớp/môn và ngày; transaction tạo grant mới, đổi liên kết, thu hồi grant cũ, ghi audit. Kiểm tra version, delegation, last-admin, own-role, RLS và tenant isolation vẫn có hiệu lực.

Grant tùy chỉnh liên kết `assignment_id` được kiểm tra lớp, môn, ngày bắt đầu/kết thúc và trạng thái thu hồi như mẫu hệ thống. Hết hạn/thu hồi mất quyền ngay tại API. Phiên giáo viên đang mở tự cập nhật quyền và nút thao tác qua cơ chế refresh hiện có, không cần F5.

Hồ sơ giáo viên tách quyền toàn trường và quyền theo phân công. Mỗi quyền hiệu lực được gộp một lần, vẫn hiển thị từng nguồn, phạm vi, thời hạn. Admin có nút Quản lý quyền, Xem quyền, Đổi mẫu quyền và Mở không gian lớp đúng năm học.

## Bật quyền cho GVCN hiện có

Không tự thay quyền của toàn bộ giáo viên khi nâng cấp. Mẫu HOMEROOM hệ thống được giữ nguyên; nếu trường chưa chọn mẫu mặc định, hệ thống tiếp tục fallback mẫu cũ.

1. Vào **Giáo viên & phân công → Mẫu quyền**, mở mẫu GVCN hệ thống.
2. Chọn **Sao chép & tùy chỉnh**, nhập mã/tên mẫu riêng và lý do.
3. Trên bản sao, chọn **GVCN đầy đủ**, ghi lý do, xem thay đổi và xác nhận lưu.
4. Chọn **Đặt làm mặc định cho GVCN**. Chọn áp dụng cho các phân công đang có hiệu lực nếu muốn cập nhật GVCN hiện tại; xem số ảnh hưởng rồi xác nhận.
5. Muốn ngoại lệ cho một giáo viên: mở hồ sơ → Quyền theo phân công → Đổi mẫu quyền.

GVCN đầy đủ có 53 quyền CLASS, gồm thêm/dán/import học sinh, tổ/chức vụ, sơ đồ, chuyên cần, rèn luyện, báo cáo tuần/định kỳ, nội quy áp dụng của lớp, TKB, trực nhật, hoạt động/minh chứng, thông báo, tệp, người giám hộ/link phụ huynh, báo cáo và QR. GVBM tiêu chuẩn có 17 quyền SUBJECT, chỉ trong đúng lớp/môn/ngày được giao.

## Upload và điều chỉnh TKB của lớp

GVCN có `schedule.manage` và `schedule.publish` trong đúng lớp dùng được **Nhập từ file Excel/Spreadsheet**, **Nhập tay / Sao chép TKB**, sửa bản nháp, kiểm tra trùng, công bố và rút lịch tương lai. CSV import TKB còn cần `import.manage` và `file.upload` trong lớp. Không sửa lịch đã qua; dữ liệu chưa công bố vẫn là bản nháp. Không có quyền ghi vào lớp khác. GVBM tiêu chuẩn chỉ đọc TKB, không có các nút nhập/sửa/công bố.

Nhập học sinh/TKB có `classId` kiểm tra quyền CLASS và quyền nghiệp vụ tương ứng. Import STAFF/CLASSES cần SCHOOL; GVCN không import được nhân sự hoặc danh sách lớp. Các picker và dữ liệu tự refresh sau thao tác, giữ ranh giới lớp.

## Kiểm tra có mục tiêu

- Backend unit: 40 PASS; danh mục, preset, binding ngày/lớp/môn và delegation.
- PostgreSQL integration quyền: 7 PASS; nâng cấp populated 065 → 066 của hai tenant, admin thứ hai toàn quyền, clone, phạm vi sai, mặc định, đổi phân công, thao tác các tab, nhập HS/TKB đúng lớp, từ chối lớp/môn khác, hết hạn/thu hồi và phiên đang đăng nhập.
- Migration RLS: 8 PASS — kiểm tra nâng cấp/rollback/checksum/serialization/tenant-context và bảo toàn role TEACHER; assertion bảo toàn permission lọc đúng role ID.
- Populated 060 → 066 / all-remaining: 3 PASS, giữ checksum cũ và RLS.
- Frontend targeted: 41 PASS; editor, role/assignment adapters, permission/session/query boundaries.
- Browser: admin 16/16 tab, GVCN đầy đủ 16/16 tab, GVBM 9 tab được phép; không có read API 403/404 trong tab được phép. Catalog 75/75; nút TKB theo quyền; form thêm/import HS của GVCN tải được; thêm/bỏ quyền cập nhật không reload.
- Browser đổi mẫu quyền: PASS luồng system immutable, clone exact, sửa preset, preview/default và đổi phân công giữ nguyên ngày.
- Typecheck và production build frontend/backend: PASS. ESLint các TSX thay đổi: 0 lỗi; 1 cảnh báo dependency có sẵn ở DirectStaffDialog.
- Production guard tests: 12 PASS, 1 kiểm tra flock chỉ chạy Linux được skip trên Windows. GitHub Actions chạy lại kiểm tra Linux cùng các release gates trước khi publish.

Pipeline **Publish production images** bổ sung suite quyền này và giữ các release gates hiện có. API/Web chỉ publish sau gates, cùng SHA của immutable release tag; owner chỉ update sau khi Actions PASS và OCI revision/version/digest của cả hai image được xác minh.

## Owner update

```bash
cd /www/wwwroot/edu && bash scripts/update-production.sh v1.0.10 && bash scripts/prod-status.sh
```

Không SSH hoặc deploy production trong job này. Không đưa env, secret, token, mật khẩu, private uploads, dump, backup hay log riêng vào commit. Các QA/handoff cũ ngoài phạm vi được giữ local.
