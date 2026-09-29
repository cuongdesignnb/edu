# Tiến độ triển khai theo ID

> Tự sinh bởi `npm run progress` lúc 2026-09-29T06:37:29.627Z. Nguồn: `qa/status/*.json` (bằng chứng của từng nhóm) + manifest gốc. Mục không có bằng chứng giữ **chưa làm**. Không có mục nào được đánh dấu chỉ vì có tiêu đề.

| Nhóm | Tổng | Đã nối mock trở lên | Đã QA (ảnh) | Đã QA (E2E) |
|---|---|---|---|---|
| Màn hình core | 118 | 67 | 67 | 0 |
| Màn hình internal | 7 | 1 | 0 | 0 |
| Màn hình optional | 3 | 0 | 0 | 0 |
| Component | 75 | 4 | 4 | 0 |
| Overlay | 34 | 17 | 14 | 0 |
| Trạng thái | 28 | 6 | 6 | 0 |

## Màn hình

| ID | Tên | Phạm vi | Route demo | Trạng thái | Bằng chứng | Ghi chú / còn thiếu |
|---|---|---|---|---|---|---|
| AU01 | Đăng nhập nhân sự | core | `/login` | đã QA (ảnh chụp) | [ảnh](../qa/screenshots/AU01-desktop.png) [ảnh](../qa/screenshots/AU01-mobile.png) [ảnh](../qa/screenshots/AU01-validation.png) [ảnh](../qa/screenshots/AU01-error.png) [ảnh](../qa/screenshots/AU01-success-choose-school.png) | Form email+mật khẩu (nhãn hiện, validate, hiện/ẩn mật khẩu), sessionRepo.demoLogin, lỗi chung không lộ trường nào sai, loading, callout phiên hết / phiên đang mở, hướng dẫn lời mời, chip email demo (authDemoRepo.loginHints), không đăng ký tự do. Điều hướng: platform→/platform; đúng 1 không gian→/school hoặc /teacher; còn lại→/choose-school (đã kiểm: u-nam→/choose-school, u-hanh→/school/demo-school-a). |
| AU02 | Quên mật khẩu | core | `/forgot-password` | đã QA (ảnh chụp) | [ảnh](../qa/screenshots/AU02-desktop.png) [ảnh](../qa/screenshots/AU02-mobile.png) [ảnh](../qa/screenshots/AU02-result.png) | Kết quả chung không xác nhận tài khoản tồn tại; 'Đã gửi hướng dẫn (mô phỏng, không gửi email)'; link /reset-password?token=demo-valid và demo-expired. |
| AU03 | Đặt lại mật khẩu | core | `/reset-password?token=demo-valid` | đã QA (ảnh chụp) | [ảnh](../qa/screenshots/AU03-desktop.png) [ảnh](../qa/screenshots/AU03-mobile.png) [ảnh](../qa/screenshots/AU03-validation.png) [ảnh](../qa/screenshots/AU03-success.png) [ảnh](../qa/screenshots/AU03-expired-desktop.png) [ảnh](../qa/screenshots/AU03-expired-mobile.png) | demo-valid → form + quy tắc hiển thị trực tiếp; demo-expired/thiếu token → trạng thái hết hạn; thành công mô phỏng, không lưu. |
| AU04 | Nhận lời mời nhân sự | core | `/invitations/inv-b-lan` | đã QA (ảnh chụp) | [ảnh](../qa/screenshots/AU04-desktop.png) [ảnh](../qa/screenshots/AU04-mobile.png) [ảnh](../qa/screenshots/AU04-new-desktop.png) [ảnh](../qa/screenshots/AU04-new-mobile.png) [ảnh](../qa/screenshots/AU04-accepted.png) [ảnh](../qa/screenshots/AU04-decline-confirm.png) [ảnh](../qa/screenshots/AU04-declined.png) [ảnh](../qa/screenshots/ST12-expired-desktop.png) [ảnh](../qa/screenshots/ST12-revoked-desktop.png) | Trường, nhiệm vụ, người mời, hạn, danh tính sẵn có (inv-b-lan); người mới nhập họ tên (inv-a-ngoc); chấp nhận → 'Vào không gian (demo)' signIn(via invitation) → /choose-school; từ chối có xác nhận; accepted / expired (inv-a-loan) / revoked (inv-a-duc) / declined. |
| AU05 | Chọn không gian làm việc | core | `/choose-school` | đã QA (ảnh chụp) | [ảnh](../qa/screenshots/AU05-desktop.png) [ảnh](../qa/screenshots/AU05-mobile.png) [ảnh](../qa/screenshots/AU05-suspended-member-desktop.png) [ảnh](../qa/screenshots/AU05-suspended-member-mobile.png) [ảnh](../qa/screenshots/ST13-choose-desktop.png) [ảnh](../qa/screenshots/ST13-choose-mobile.png) [ảnh](../qa/screenshots/AU05-new-member-unassigned.png) | AccountShell. Thẻ trường từ sessionRepo.me: trạng thái trường và thành viên, vai trò, nhiệm vụ; nút 'Quản lý nhà trường'/'Lớp học của tôi' chỉ khi có; thành viên tạm khóa/thu hồi bị khóa + giải thích; trường tạm dừng → /school-suspended?school=slug; chưa phân công → AU08; tài khoản platform có thẻ vào /platform. |
| AU06 | Hồ sơ cá nhân nhân sự | core | `/account/profile` | đã QA (ảnh chụp) | [ảnh](../qa/screenshots/AU06-desktop.png) [ảnh](../qa/screenshots/AU06-mobile.png) [ảnh](../qa/screenshots/AU06-validation.png) [ảnh](../qa/screenshots/AU06-saved.png) | Sửa họ tên/số liên hệ/giới thiệu có version; email chỉ đọc; ErrorSummary; hủy; cảnh báo chưa lưu; ConflictDialog; danh sách trường tham gia chỉ đọc, không sửa phân công. |
| AU07 | Bảo mật và phiên demo | core | `/account/security` | đã QA (ảnh chụp) | [ảnh](../qa/screenshots/AU07-desktop.png) [ảnh](../qa/screenshots/AU07-mobile.png) [ảnh](../qa/screenshots/ST11-session-expired.png) [ảnh](../qa/screenshots/ST11-login-after-expire.png) | Đổi mật khẩu mô phỏng (validate, không lưu), thông tin phiên demo, 'Kết thúc phiên demo' → expire() → ST11, 'Thoát phiên' → /login; nhãn Mô phỏng rõ. |
| AU08 | Chưa được phân công / bị thu hồi quyền | core | `/account/no-access` | đã QA (ảnh chụp) | [ảnh](../qa/screenshots/AU08-desktop.png) [ảnh](../qa/screenshots/AU08-mobile.png) | Giải thích chung, không lộ dữ liệu; liệt kê trường bị giới hạn (thành viên tạm khóa/thu hồi, trường tạm dừng, chưa phân công); nút chọn không gian hợp lệ. Chụp với u-huong (thành viên tạm khóa) thay cho u-lan của registry để thấy nội dung. |
| AU09 | Trung tâm thông báo nhân sự | core | `/notifications` | đã QA (ảnh chụp) | [ảnh](../qa/screenshots/AU09-desktop.png) [ảnh](../qa/screenshots/AU09-mobile.png) [ảnh](../qa/screenshots/AU09-unread.png) [ảnh](../qa/screenshots/AU09-all-read.png) | Tab Tất cả/Chưa đọc, lọc trường + loại, tìm kiếm, phân trang, đánh dấu đã đọc từng mục/tất cả mục đang lọc; 'Mở' chỉ khi accessible (tự đánh dấu đã đọc); tài khoản platform được hướng sang nhật ký nền tảng. |
| AU10 | Hướng dẫn sử dụng | core | `/help` | đã QA (ảnh chụp) | [ảnh](../qa/screenshots/AU10-desktop.png) [ảnh](../qa/screenshots/AU10-mobile.png) [ảnh](../qa/screenshots/AU10-session-desktop.png) [ảnh](../qa/screenshots/AU10-session-mobile.png) [ảnh](../qa/screenshots/AU10-anchor-publication.png) [ảnh](../qa/screenshots/AU10-search.png) | Anchor #nen-tang #nha-truong #giao-vien #phu-huynh #quy-trinh-cong-bo; tìm kiếm cục bộ; giải thích Lưu ≠ Chốt ≠ Công bố; PublicShell khi không có phiên, AccountShell khi có; nút quay lại theo vai trò; không chat. |
| PL01 | Tổng quan nền tảng | core | `/platform` | đã QA (ảnh chụp) | [ảnh](../qa/screenshots/PL01-desktop.png) [ảnh](../qa/screenshots/PL01-mobile.png) | R01 layout; KPIs from fixture (8 schools); 4th KPI renamed to link-open count (no parent accounts); row actions with O01. |
| PL02 | Danh sách trường | core | `/platform/schools` | đã QA (ảnh chụp) | [ảnh](../qa/screenshots/PL02-desktop.png) [ảnh](../qa/screenshots/PL02-mobile.png) | KPI từ platformRepo.overview + SchoolsTable (tìm/lọc/sort/phân trang ở repository, O01 kích hoạt/tạm dừng/lưu trữ). |
| PL03 | Tạo trường | core | `/platform/schools/new` | đã QA (ảnh chụp) | [ảnh](../qa/screenshots/PL03-desktop.png) [ảnh](../qa/screenshots/PL03-mobile.png) [ảnh](../qa/screenshots/PL03-validation.png) [ảnh](../qa/screenshots/PL03-duplicate-code.png) [ảnh](../qa/screenshots/PL03-step2.png) [ảnh](../qa/screenshots/PL03-review.png) [ảnh](../qa/screenshots/PL03-done.png) | Wizard 4 bước; gợi ý slug; kiểm tra trùng mã/slug trực tiếp (platformExtraRepo.checkSchoolIdentity) + repo kiểm lại; lưu nháp ở mọi bước; luôn 'Chờ kích hoạt'; màn hoàn tất có link lời mời demo + sao chép; cảnh báo chưa lưu. |
| PL04 | Hồ sơ trường | core | `/platform/schools/demo-school-a` | đã QA (ảnh chụp) | [ảnh](../qa/screenshots/PL04-desktop.png) [ảnh](../qa/screenshots/PL04-mobile.png) [ảnh](../qa/screenshots/PL04-draft-desktop.png) [ảnh](../qa/screenshots/PL04-draft-mobile.png) [ảnh](../qa/screenshots/PL04-edit-drawer.png) [ảnh](../qa/screenshots/PL04-activate-blocked.png) [ảnh](../qa/screenshots/O01-suspend-confirm.png) | Hồ sơ vận hành, chỉ số tổng hợp, checklist khởi tạo, quản trị + lời mời, lịch sử; drawer sửa thông tin vận hành (version, conflict, guard); đổi trạng thái O01; kích hoạt bị chặn khi thiếu quản trị; không liên kết học sinh/gia đình. |
| PL05 | Quản trị trường | core | `/platform/schools/demo-school-a/admins` | đã QA (ảnh chụp) | [ảnh](../qa/screenshots/PL05-desktop.png) [ảnh](../qa/screenshots/PL05-mobile.png) [ảnh](../qa/screenshots/PL05-last-admin-guard.png) [ảnh](../qa/screenshots/PL05-after-invite.png) [ảnh](../qa/screenshots/O02-invite-admin.png) [ảnh](../qa/screenshots/O02-replace-admin.png) | Bảng quản trị + lời mời (hạn, trạng thái, mở/sao chép/thu hồi), lịch sử; O02 mời/thay; chặn thu hồi quản trị cuối (menu disabled + callout + repository). |
| PL06 | Yêu cầu hỗ trợ | core | `/platform/support` | đã QA (ảnh chụp) | [ảnh](../qa/screenshots/PL06-desktop.png) [ảnh](../qa/screenshots/PL06-mobile.png) [ảnh](../qa/screenshots/PL06-assign.png) [ảnh](../qa/screenshots/PL06-after-assign.png) | KPI theo trạng thái (platformExtraRepo.ticketStats), tìm/lọc trạng thái + ưu tiên/sort/phân trang, phân công nội bộ (platformExtraRepo.assignTicket). |
| PL07 | Chi tiết yêu cầu hỗ trợ | core | `/platform/support/tk-2` | đã QA (ảnh chụp) | [ảnh](../qa/screenshots/PL07-desktop.png) [ảnh](../qa/screenshots/PL07-mobile.png) | Nội dung, timeline cập nhật, ghi cập nhật + đổi trạng thái (updateTicket), phân công, quyền hỗ trợ liên quan, đề nghị O34; nêu rõ không có chức năng đăng nhập thay giáo viên. |
| PL08 | Quyền hỗ trợ tạm thời | core | `/platform/support-access` | đã QA (ảnh chụp) | [ảnh](../qa/screenshots/PL08-desktop.png) [ảnh](../qa/screenshots/PL08-mobile.png) [ảnh](../qa/screenshots/O34-request-support.png) [ảnh](../qa/screenshots/O34-validation.png) | Danh sách quyền (lọc/tìm/phân trang), đề nghị O34 (requestSupportGrant), rút đề nghị / kết thúc sớm (platformExtraRepo.relinquishGrant); duyệt chỉ ở phía trường. |
| PL09 | Nhật ký nền tảng | core | `/platform/audit` | đã QA (ảnh chụp) | [ảnh](../qa/screenshots/PL09-desktop.png) [ảnh](../qa/screenshots/PL09-mobile.png) [ảnh](../qa/screenshots/PL09-detail-drawer.png) [ảnh](../qa/screenshots/PL09-detail-drawer-mobile.png) | Lọc tìm kiếm/người thao tác/từ–đến ngày, phân trang, drawer chi tiết với AuditDiff (nhãn tiếng Việt), xuất CSV/XLSX toàn bộ kết quả lọc (đã kiểm tải về bằng Playwright). |
| PL10 | Tình trạng vận hành | core | `/platform/operations` | đã QA (ảnh chụp) | [ảnh](../qa/screenshots/PL10-desktop.png) [ảnh](../qa/screenshots/PL10-mobile.png) [ảnh](../qa/screenshots/PL10-restore-explained.png) | Dịch vụ/sao lưu mô phỏng có nhãn; checklist tính từ dữ liệu demo; thông tin kho demo thật; nút Sao lưu/Khôi phục chỉ mở giải thích, không thực thi. |
| PL11 | Cấu hình nền tảng | core | `/platform/settings` | đã QA (ảnh chụp) | [ảnh](../qa/screenshots/PL11-desktop.png) [ảnh](../qa/screenshots/PL11-mobile.png) [ảnh](../qa/screenshots/PL11-preview-validation.png) | Form thương hiệu/liên hệ hỗ trợ/ghi chú, xem trước trực tiếp, lưu có version + conflict + guard; không có gói cước/thanh toán. |
| SC01 | Tổng quan trường | core | — | chưa làm | — |  |
| SC02 | Thông tin và nhận diện trường | core | — | chưa làm | — |  |
| SC03 | Danh sách năm học | core | — | chưa làm | — |  |
| SC04 | Thiết lập năm học | core | — | chưa làm | — |  |
| SC05 | Chi tiết năm học | core | — | chưa làm | — |  |
| SC06 | Học kỳ, tuần và ngày nghỉ | core | — | chưa làm | — |  |
| SC07 | Kết thúc năm và chuẩn bị năm mới | core | — | chưa làm | — |  |
| SC08 | Danh mục khối, môn, phòng | core | — | chưa làm | — |  |
| SC09 | Danh sách lớp | core | — | chưa làm | — |  |
| SC10 | Danh sách giáo viên | core | — | chưa làm | — |  |
| SC11 | Hồ sơ và phân công giáo viên | core | — | chưa làm | — |  |
| SC12 | Ma trận phân công | core | — | chưa làm | — |  |
| SC13 | Mẫu quyền nhà trường | core | — | chưa làm | — |  |
| SC14 | Chi tiết mẫu quyền | core | — | chưa làm | — |  |
| SC15 | Bàn giao giáo viên chủ nhiệm | core | — | chưa làm | — |  |
| SC16 | Danh sách học sinh | core | `/school/:schoolId/students` | đã QA (ảnh chụp) | [ảnh](../qa/screenshots/SC16-desktop.png) [ảnh](../qa/screenshots/SC16-mobile.png) [ảnh](../qa/screenshots/SC16-u-dung.png) | Tìm tên/mã, lọc lớp/trạng thái/chưa xác minh giám hộ, sắp xếp tên/mã/lớp, phân trang repo, chọn trang vs tất cả kết quả lọc, xuất CSV/XLSX; trùng tên phân biệt bằng mã+ngày sinh+lớp; menu dòng mở hồ sơ/sửa/chuyển lớp (O11). |
| SC17 | Thêm học sinh | core | `/school/:schoolId/students/new` | đã QA (ảnh chụp) | [ảnh](../qa/screenshots/SC17-desktop.png) [ảnh](../qa/screenshots/SC17-mobile.png) | Trường tối thiểu + giám hộ tùy chọn (lưu chưa xác minh); validate client + fieldErrors repo; cảnh báo chưa lưu; thành công → hồ sơ. |
| SC18 | Hồ sơ học sinh | core | `/school/:schoolId/students/:studentId` | đã QA (ảnh chụp) | [ảnh](../qa/screenshots/SC18-desktop.png) [ảnh](../qa/screenshots/SC18-mobile.png) [ảnh](../qa/screenshots/SC18-desktop-full.png) [ảnh](../qa/screenshots/SC18-u-dung.png) [ảnh](../qa/screenshots/SC18-u-quan.png) | So với R07 ở 1448×1086: bố cục header/thông tin/giám hộ/lịch sử lớp/quyền xem/nội dung được xem/nhật ký. Khác ảnh có chủ đích: không CCCD/dân tộc/email/SĐT/địa chỉ HS, không IP, không 'Kết quả học tập', QR ẩn tới khi bấm 'Hiện link/QR demo', ảnh chân dung thay bằng avatar chữ. |
| SC19 | Sửa học sinh | core | `/school/:schoolId/students/:studentId/edit` | đã QA (ảnh chụp) | [ảnh](../qa/screenshots/SC19-desktop.png) [ảnh](../qa/screenshots/SC19-mobile.png) [ảnh](../qa/screenshots/SC19-conflict-desktop.png) [ảnh](../qa/screenshots/SC19-conflict-mobile.png) | Có version; nút 'Mô phỏng' lưu bản ghi ở phiên khác → Lưu gặp CONFLICT → ConflictDialog, không ghi đè; tải bản mới cập nhật form. |
| SC20 | Chuyển lớp và trạng thái theo học | core | `/school/:schoolId/transfers` | đã QA (ảnh chụp) | [ảnh](../qa/screenshots/SC20-desktop.png) [ảnh](../qa/screenshots/SC20-mobile.png) | Lọc trạng thái, tìm, phân trang; duyệt/từ chối qua ConfirmDialog; tạo yêu cầu (O11). |
| SC21 | Người giám hộ | core | `/school/:schoolId/guardians` | đã QA (ảnh chụp) | [ảnh](../qa/screenshots/SC21-desktop.png) [ảnh](../qa/screenshots/SC21-mobile.png) | KPI, tìm, lọc xác minh, số HS liên quan và link đang hoạt động. |
| SC22 | Quan hệ và quyền nhận thông tin | core | `/school/:schoolId/guardians/:guardianId` | đã QA (ảnh chụp) | [ảnh](../qa/screenshots/SC22-desktop.png) [ảnh](../qa/screenshots/SC22-mobile.png) | Thẻ quan hệ từng học sinh: xác minh/thu hồi (O10), sửa (O09), cấp link (O12, bị khóa khi chưa xác minh), thu hồi link (O14), lịch sử. |
| SC23 | Quyền tra cứu phụ huynh | core | `/school/:schoolId/parent-access` | đã QA (ảnh chụp) | [ảnh](../qa/screenshots/SC23-desktop.png) [ảnh](../qa/screenshots/SC23-mobile.png) [ảnh](../qa/screenshots/SC23-u-quan.png) | KPI hoạt động/hết hạn/thu hồi, lọc trạng thái/lớp, tìm, sắp xếp, phân trang, menu chi tiết/xem trước (route SC25 của nhóm khác)/thu hồi/cấp lại; nút Cấp link chọn học sinh. |
| SC24 | Chi tiết quyền tra cứu | core | `/school/:schoolId/parent-access/:accessId` | đã QA (ảnh chụp) | [ảnh](../qa/screenshots/SC24-desktop.png) [ảnh](../qa/screenshots/SC24-mobile.png) [ảnh](../qa/screenshots/SC24-revealed-desktop.png) | Thông tin quyền, mục được xem, link/QR chỉ hiện sau khi bấm (cảnh báo không đăng nhóm chung), in thẻ QR (print-only), link khác của HS, nhật ký đầy đủ. |
| SC25 | Xem trước trang phụ huynh | core | — | chưa làm | — |  |
| SC26 | Trung tâm nhập dữ liệu | core | `/school/:schoolId/imports` | đã QA (ảnh chụp) | [ảnh](../qa/screenshots/SC26-desktop.png) [ảnh](../qa/screenshots/SC26-mobile.png) | 4 loại; Học sinh chạy thật, 3 loại còn lại tải mẫu CSV/XLSX + nhãn Mô phỏng; lịch sử nhập tìm/lọc/phân trang. |
| SC27 | Nhập danh sách bằng file | core | `/school/:schoolId/imports/new` | đã QA (ảnh chụp) | [ảnh](../qa/screenshots/SC27-desktop.png) [ảnh](../qa/screenshots/SC27-mobile.png) [ảnh](../qa/screenshots/SC27-step1-desktop.png) [ảnh](../qa/screenshots/SC27-step1-mobile.png) [ảnh](../qa/screenshots/SC27-step2-desktop.png) [ảnh](../qa/screenshots/SC27-step2-mobile.png) [ảnh](../qa/screenshots/SC27-step3-desktop.png) [ảnh](../qa/screenshots/SC27-step3-mobile.png) [ảnh](../qa/screenshots/SC27-step4-desktop.png) [ảnh](../qa/screenshots/SC27-step4-mobile.png) [ảnh](../qa/screenshots/SC27-step5-desktop.png) [ảnh](../qa/screenshots/SC27-step5-mobile.png) | Tệp → Ghép cột (tự khớp) → Kiểm tra từng dòng → Xem trước (lớp, chế độ, gồm cảnh báo) → Nhập → SC28. |
| SC28 | Kết quả nhập | core | `/school/:schoolId/imports/:importId` | đã QA (ảnh chụp) | [ảnh](../qa/screenshots/SC28-desktop.png) [ảnh](../qa/screenshots/SC28-mobile.png) [ảnh](../qa/screenshots/SC28-after-import-desktop.png) | Số thêm/cập nhật/bỏ qua/lỗi, batch id, bảng dòng lỗi, tải tệp lỗi CSV/XLSX, giải thích nhập lại không nhân đôi. |
| SC29 | Nội quy và phiên bản | core | `/school/demo-school-a/conduct-rules` | đã QA (ảnh chụp) | [ảnh](../qa/screenshots/SC29-desktop.png) [ảnh](../qa/screenshots/SC29-mobile.png) | Versions, status, effective range, current marker, snapshot count; O22 create (one draft rule). Flow tested: delete draft -> new version -> publish. |
| SC30 | Soạn bộ nội quy | core | `/school/demo-school-a/conduct-rules/rs-a-3` | đã QA (ảnh chụp) | [ảnh](../qa/screenshots/SC30-desktop.png) [ảnh](../qa/screenshots/SC30-mobile.png) [ảnh](../qa/screenshots/SC30-published-readonly.png) [ảnh](../qa/screenshots/O22-publish-ruleset.png) [ảnh](../qa/screenshots/O31-delete-ruleset-draft.png) | Draft editor (rows, base/cap/floor, bands, effective date, deadline), simulator via conductRepo.simulate (rs-a-1: 100-5+2=97), diff vs previous, publish confirm (NV-08), delete draft; published = read-only + copy. |
| SC31 | Quy trình chốt và công bố | core | `/school/demo-school-a/publication-policy` | đã QA (ảnh chụp) | [ảnh](../qa/screenshots/SC31-desktop.png) [ảnh](../qa/screenshots/SC31-mobile.png) | Lock/publish roles, leader approval, week close day, parent module chips, attendance auto publish; confirm lists changes + impact; conflict dialog. u-dung sees read-only. |
| SC32 | Lịch toàn trường | core | `/school/demo-school-a/timetable` | đã QA (ảnh chụp) | [ảnh](../qa/screenshots/SC32-desktop.png) [ảnh](../qa/screenshots/SC32-mobile.png) [ảnh](../qa/screenshots/SC32-timetable-mobile-agenda.png) [ảnh](../qa/screenshots/O25-lesson-change-drawer.png) [ảnh](../qa/screenshots/O25-lesson-change-drawer-mobile.png) | Filters class/teacher/room, week nav, desktop grid, mobile day agenda, clash callout (none in seed), O25 drawer with live conflict check, draft/publish, week change list with publish/delete draft. Past days read-only. |
| SC33 | Thông báo nhà trường | core | `/school/demo-school-a/announcements` | đã QA (ảnh chụp) | [ảnh](../qa/screenshots/SC33-desktop.png) [ảnh](../qa/screenshots/SC33-mobile.png) | Status tabs with counts, origin filter, search, pagination, delete draft O31. |
| SC34 | Soạn thông báo trường | core | `/school/demo-school-a/announcements/new` | đã QA (ảnh chụp) | [ảnh](../qa/screenshots/SC34-desktop.png) [ảnh](../qa/screenshots/SC34-mobile.png) [ảnh](../qa/screenshots/C071-composer-filled.png) [ảnh](../qa/screenshots/C071-composer-preview-mobile.png) [ảnh](../qa/screenshots/C071-composer-validation.png) | AnnouncementComposer origin school. Flow tested: save draft -> detail -> publish. |
| SC35 | Chi tiết thông báo trường | core | `/school/demo-school-a/announcements/an-4` | đã QA (ảnh chụp) | [ảnh](../qa/screenshots/SC35-desktop.png) [ảnh](../qa/screenshots/SC35-mobile.png) [ảnh](../qa/screenshots/O29-withdraw.png) [ảnh](../qa/screenshots/O31-delete-announcement-draft.png) | Content, audience, estimate, status, history, attachments, internal note 'Nội bộ'; edit route /announcements/[id]/edit; publish, withdraw (reason, screenshot warning), delete draft. |
| SC36 | Trung tâm rà soát và công bố | core | `/school/demo-school-a/publications` | đã QA (ảnh chụp) | [ảnh](../qa/screenshots/SC36-desktop.png) [ảnh](../qa/screenshots/SC36-mobile.png) | Week selector, per-class status/pending/blocking/overdue/attendance, links to class review, adjustments, pending announcements. No bulk actions. |
| SC37 | Trung tâm báo cáo trường | core | `/school/demo-school-a/reports` | đã QA (ảnh chụp) | [ảnh](../qa/screenshots/SC37-desktop.png) [ảnh](../qa/screenshots/SC37-mobile.png) | Cards from SCHOOL_REPORTS + keyword/group filters; no academic report. |
| SC38 | Xem báo cáo trường | core | `/school/demo-school-a/reports/conduct` | đã QA (ảnh chụp) | [ảnh](../qa/screenshots/SC38-desktop.png) [ảnh](../qa/screenshots/SC38-mobile.png) [ảnh](../qa/screenshots/SC38-print-preview.png) [ảnh](../qa/screenshots/O30-export-format.png) | Filters week/date range/grade -> ReportViewer; exports recorded via recordExport (tested xlsx download + SC39 row). Export buttons hidden without export.run (u-quan). |
| SC39 | Các bản xuất dữ liệu | core | `/school/demo-school-a/exports` | đã QA (ảnh chụp) | [ảnh](../qa/screenshots/SC39-desktop.png) [ảnh](../qa/screenshots/SC39-mobile.png) | Status/creator/expiry/rows, Tải lại regenerates locally (schoolOpsRepo.regenerateExport), cancel confirm, expired/cancelled -> recreate link; no email. |
| SC40 | Nhật ký nhà trường | core | `/school/demo-school-a/audit` | đã QA (ảnh chụp) | [ảnh](../qa/screenshots/SC40-desktop.png) [ảnh](../qa/screenshots/SC40-mobile.png) [ảnh](../qa/screenshots/SC40-audit-detail.png) | Filters entity/actor/date range/keyword, paginated table, detail drawer with AuditDiff + reason, filtered CSV export; read-only. |
| SC41 | Cài đặt hiển thị và chia sẻ | core | `/school/demo-school-a/settings` | đã QA (ảnh chụp) | [ảnh](../qa/screenshots/SC41-desktop.png) [ảnh](../qa/screenshots/SC41-mobile.png) | Link days, teacher phone/email, contact hours, report header + preview, legal disclaimer, conflict dialog, dirty guard. |
| SC42 | Hỗ trợ và ủy quyền hỗ trợ | core | `/school/demo-school-a/support` | đã QA (ảnh chụp) | [ảnh](../qa/screenshots/SC42-desktop.png) [ảnh](../qa/screenshots/SC42-mobile.png) [ảnh](../qa/screenshots/SC42-create-ticket.png) [ảnh](../qa/screenshots/O34-revoke-grant.png) | Tickets list/filter/search + create (PII warning), grants approve/decline/revoke with O34 confirm. Seed has no 'requested' grant for school A so approve/decline buttons not visually captured. |
| SC43 | Chi tiết hỗ trợ của trường | core | `/school/demo-school-a/support/tk-2` | đã QA (ảnh chụp) | [ảnh](../qa/screenshots/SC43-desktop.png) [ảnh](../qa/screenshots/SC43-mobile.png) | Ticket info, updates thread, add update, grants of the ticket (revoke). |
| TE01 | Việc cần làm của giáo viên | core | — | chưa làm | — |  |
| TE02 | Lớp học của tôi | core | — | chưa làm | — |  |
| TE03 | Lịch dạy của tôi | core | — | chưa làm | — |  |
| TE04 | Việc cần xử lý | core | — | chưa làm | — |  |
| TE05 | Thông báo dành cho giáo viên | core | — | chưa làm | — |  |
| TE06 | Báo cáo được phép | core | — | chưa làm | — |  |
| CL01 | Tổng quan lớp | core | `/classroom/demo-school-a/y-a-2026/c-a-10a1` | đã QA (ảnh chụp) | [ảnh](../qa/screenshots/CL01-desktop.png) [ảnh](../qa/screenshots/CL01-mobile.png) | Derived from R05/R06: ClassHeader full, tasks, attendance donut (38/2/1/1/0), today's timetable, groups, activities progress. |
| CL02 | Học sinh trong lớp | core | — | chưa làm | — |  |
| CL03 | Hồ sơ học sinh trong phạm vi lớp | core | — | chưa làm | — |  |
| CL04 | Điểm danh theo ngày/tiết | core | — | chưa làm | — |  |
| CL05 | Chuyên cần theo tuần | core | — | chưa làm | — |  |
| CL06 | Ghi nhận thi đua | core | — | chưa làm | — |  |
| CL07 | Tổng hợp thi đua tuần | core | — | chưa làm | — |  |
| CL08 | Rà soát và chốt tuần | core | — | chưa làm | — |  |
| CL09 | Lịch sử kết quả công bố | core | — | chưa làm | — |  |
| CL10 | Bản kết quả đã công bố | core | — | chưa làm | — |  |
| CL11 | Điều chỉnh sau chốt | core | — | chưa làm | — |  |
| CL12 | Nội quy áp dụng tại lớp | core | — | chưa làm | — |  |
| CL13 | Tổ và chức vụ | core | — | chưa làm | — |  |
| CL14 | Sơ đồ lớp | core | — | chưa làm | — |  |
| CL15 | Lịch học của lớp | core | — | chưa làm | — |  |
| CL16 | Lịch trực nhật | core | — | chưa làm | — |  |
| CL17 | Hoạt động lớp | core | `/classroom/:schoolId/:yearId/:classId/activities` | đã QA (ảnh chụp) | [ảnh](../qa/screenshots/CL17-desktop.png) [ảnh](../qa/screenshots/CL17-desktop-full.png) [ảnh](../qa/screenshots/CL17-mobile.png) [ảnh](../qa/screenshots/CL17-u-hung.png) [ảnh](../qa/screenshots/CL17-u-hanh.png) | R09 layout: section tabs, activity cards (illustration/icon tile, due date red when due soon/overdue, scope Cả lớp/Tổ/N học sinh, status badge, x/y assigned approved + bar + %, row menu), overview KPIs, recent feed, pending evidence table (FileThumb + Duyệt/Yêu cầu bổ sung), upcoming class announcements (only with announcement.class). Search + status filter + pagination. |
| CL18 | Tạo hoạt động | core | `/classroom/:schoolId/:yearId/:classId/activities/new (edit: /activities/:activityId/edit)` | đã QA (ảnh chụp) | [ảnh](../qa/screenshots/CL18-desktop.png) [ảnh](../qa/screenshots/CL18-mobile.png) [ảnh](../qa/screenshots/CL18-validation-desktop.png) | Title/description/illustration/due date (>= today)/whole class/tổ/students (Combobox multi)/evidence toggle; Lưu nháp vs Giao hoạt động; validation + ErrorSummary; unsaved guard with save; conflict dialog; note no automatic conduct points. Flow tested (scripts/qa-class-activities-flow.mjs). |
| CL19 | Chi tiết hoạt động | core | `/classroom/:schoolId/:yearId/:classId/activities/:activityId` | đã QA (ảnh chụp) | [ảnh](../qa/screenshots/CL19-desktop.png) [ảnh](../qa/screenshots/CL19-mobile.png) [ảnh](../qa/screenshots/CL19-progress-desktop.png) [ảnh](../qa/screenshots/CL19-evidence-desktop.png) | Tabs Thông tin/Tiến độ/Minh chứng/Lịch sử; per-student table with search/status/tổ filters, sort, paging, bulk status (needs_supplement requires note); record evidence O27; review approve (share toggle)/supplement/reject; O28 viewer; close/reopen/publish draft with confirm. |
| CL20 | Minh chứng của lớp | core | `/classroom/:schoolId/:yearId/:classId/evidence` | đã QA (ảnh chụp) | [ảnh](../qa/screenshots/CL20-desktop.png) [ảnh](../qa/screenshots/CL20-mobile.png) | Gallery/table toggle, filters status/activity/search (?status=pending deep link), bulk approve of selected pending items, same dialogs; teacher-recorded only. |
| CL21 | Thông báo lớp | core | `/classroom/:schoolId/:yearId/:classId/announcements` | đã QA (ảnh chụp) | [ảnh](../qa/screenshots/CL21-desktop.png) [ảnh](../qa/screenshots/CL21-mobile.png) [ảnh](../qa/screenshots/CL21-u-hung.png) | Own announcements (Nháp/Đã đặt lịch/Đã công bố/Đã thu hồi) with search/status filter/paging + 'Từ nhà trường' section. u-hung gets DeniedState. |
| CL22 | Soạn thông báo lớp | core | `/classroom/:schoolId/:yearId/:classId/announcements/new (edit: /announcements/:announcementId/edit)` | đã QA (ảnh chụp) | [ảnh](../qa/screenshots/CL22-desktop.png) [ảnh](../qa/screenshots/CL22-mobile.png) | Uses shared AnnouncementComposer origin=class (school-ops). Cancel link in header (guarded by unsaved-changes provider). |
| CL23 | Chi tiết thông báo lớp | core | `/classroom/:schoolId/:yearId/:classId/announcements/:announcementId` | đã QA (ảnh chụp) | [ảnh](../qa/screenshots/CL23-desktop.png) [ảnh](../qa/screenshots/CL23-mobile.png) | Content, audience (Lớp / Riêng em …), estimate, status, history, attachments, internal note 'Nội bộ — phụ huynh không thấy'; edit draft/scheduled, publish, withdraw with reason, delete draft (O31), parent preview. |
| CL24 | Tệp lớp | core | `/classroom/:schoolId/:yearId/:classId/files` | đã QA (ảnh chụp) | [ảnh](../qa/screenshots/CL24-desktop.png) [ảnh](../qa/screenshots/CL24-mobile.png) [ảnh](../qa/screenshots/CL24-upload-desktop.png) [ảnh](../qa/screenshots/CL24-upload-mobile.png) [ảnh](../qa/screenshots/CL24-u-hung.png) | List (name/type/size/owner/share/status), filters, paging; upload (local blob, share scope, student when riêng một em, blocks images to Phụ huynh cả lớp); preview/download O28; change share; revoke sharing (→ Nội bộ, confirm); archive/restore (confirm). |
| CL25 | Báo cáo lớp | core | `/classroom/:schoolId/:yearId/:classId/reports` | đã QA (ảnh chụp) | [ảnh](../qa/screenshots/CL25-desktop.png) [ảnh](../qa/screenshots/CL25-mobile.png) [ảnh](../qa/screenshots/CL25-u-hung.png) | Catalog from activitiesExtraRepo.classReportCatalog (subject teacher: attendance + activities only). |
| CL26 | Chi tiết báo cáo lớp | core | `/classroom/:schoolId/:yearId/:classId/reports/:reportType` | đã QA (ảnh chụp) | [ảnh](../qa/screenshots/CL26-desktop.png) [ảnh](../qa/screenshots/CL26-mobile.png) | Params (week for conduct, date range + quick picks for attendance, student Combobox for student type; ?studentId= deep link) -> reportsRepo.classReport -> shared ReportViewer; exports recorded via reportsRepo.recordExport only when report.export; print uses no-print shell. |
| PA01 | Mở đường dẫn riêng | core | — | chưa làm | — |  |
| PA02 | Thông tin của con | core | — | chưa làm | — |  |
| PA03 | Chuyên cần của con | core | — | chưa làm | — |  |
| PA04 | Thi đua đã công bố của con | core | — | chưa làm | — |  |
| PA05 | Chi tiết kỳ thi đua của con | core | — | chưa làm | — |  |
| PA06 | Lịch học của con | core | — | chưa làm | — |  |
| PA07 | Nhiệm vụ trực nhật của con | core | — | chưa làm | — |  |
| PA08 | Hoạt động của con | core | — | chưa làm | — |  |
| PA09 | Chi tiết hoạt động của con | core | — | chưa làm | — |  |
| PA10 | Thông báo dành cho gia đình | core | — | chưa làm | — |  |
| PA11 | Chi tiết thông báo phụ huynh | core | — | chưa làm | — |  |
| PA12 | Giáo viên phụ trách | core | — | chưa làm | — |  |
| PA13 | Tài liệu và báo cáo được chia sẻ | core | — | chưa làm | — |  |
| PA14 | Link không sử dụng được | core | — | chưa làm | — |  |
| SY01 | Trang công khai trường | core | `/schools/binh-minh` | đã QA (ảnh chụp) | [ảnh](../qa/screenshots/SY01-desktop.png) [ảnh](../qa/screenshots/SY01-mobile.png) | PublicShell: nhận diện, liên hệ chính thức, tin công khai (tìm/phân trang), thẻ phụ huynh giải thích link riêng; không có công cụ tra cứu học sinh; trường tạm dừng ẩn tin. |
| SY02 | Tin công khai của trường | core | `/schools/binh-minh/announcements/an-1` | đã QA (ảnh chụp) | [ảnh](../qa/screenshots/SY02-desktop.png) [ảnh](../qa/screenshots/SY02-mobile.png) | Chỉ bản công khai (repository trả NOT_FOUND cho tin riêng tư), tệp công khai tải được, quay lại trường. |
| SY03 | Thông tin quyền riêng tư | core | `/privacy` | đã QA (ảnh chụp) | [ảnh](../qa/screenshots/SY03-desktop.png) [ảnh](../qa/screenshots/SY03-mobile.png) | Bản nháp chờ chủ dự án/pháp chế duyệt; mục lục anchor; liên hệ lấy từ cấu hình nền tảng; không tuyên bố tuân thủ/chứng nhận. |
| SY04 | Điều kiện sử dụng | core | `/terms` | đã QA (ảnh chụp) | [ảnh](../qa/screenshots/SY04-desktop.png) [ảnh](../qa/screenshots/SY04-mobile.png) | Bản nháp, đánh dấu chưa thẩm định pháp lý, không có điều khoản thanh toán. |
| SY05 | Không có quyền | core | `/access-denied` | đã QA (ảnh chụp) | [ảnh](../qa/screenshots/SY05-desktop.png) [ảnh](../qa/screenshots/SY05-mobile.png) | Không tiết lộ dữ liệu bị chặn; về không gian hợp lệ / quay lại / vì sao. |
| SY06 | Trường tạm dừng | core | `/school-suspended?school=tran-phu` | đã QA (ảnh chụp) | [ảnh](../qa/screenshots/SY06-desktop.png) [ảnh](../qa/screenshots/SY06-mobile.png) | Giải thích vận hành, lý do, đầu mối công khai; không có nút ghi dữ liệu; liệt kê trường khác còn làm việc được. |
| SY07 | Bảo trì mô phỏng | core | `/maintenance` | đã QA (ảnh chụp) | [ảnh](../qa/screenshots/SY07-desktop.png) [ảnh](../qa/screenshots/SY07-mobile.png) [ảnh](../qa/screenshots/SY07-retry-ok.png) | Không đưa ETA; 'Thử lại' kiểm kho demo cục bộ; về nơi an toàn. |
| SY08 | Không tìm thấy và ranh giới lỗi | core | `/khong-ton-tai-demo` | đã QA (ảnh chụp) | [ảnh](../qa/screenshots/SY08-desktop.png) [ảnh](../qa/screenshots/SY08-mobile.png) | app/not-found.tsx đã chụp. app/error.tsx (retry, không stack trace) và app/global-error.tsx (html/body riêng) đã dựng nhưng chưa chụp — không có cách kích hoạt lỗi render chủ đích an toàn. |
| DV01 | Chọn vai trò và kịch bản demo | internal | `/demo` | đã nối mock | — | Personas (9), parent demo links from repository, write/read scenarios, DemoClock presets, reset seed with confirm. |
| DV02 | Thư viện ảnh tham chiếu | internal | — | chưa làm | — |  |
| DV03 | Sitemap triển khai | internal | — | chưa làm | — |  |
| DV04 | Checklist giao diện | internal | — | chưa làm | — |  |
| DV05 | Thư viện component | internal | — | chưa làm | — |  |
| DV06 | Trạng thái và tương tác | internal | — | chưa làm | — |  |
| DV07 | Các luồng nghiệp vụ demo | internal | — | chưa làm | — |  |
| EX01 | Kết quả học tập tổng hợp | optional | — | chưa làm | — | Tắt mặc định (ENABLE_ACADEMIC_RESULTS_PREVIEW=false) — không triển khai. |
| EX02 | Kết quả môn được phân công | optional | — | chưa làm | — | Tắt mặc định (ENABLE_ACADEMIC_RESULTS_PREVIEW=false) — không triển khai. |
| EX03 | Kết quả học tập đã công bố của con | optional | — | chưa làm | — | Tắt mặc định (ENABLE_ACADEMIC_RESULTS_PREVIEW=false) — không triển khai. |

## Component

| ID | Tên | Trạng thái | Bằng chứng / nơi dùng | Ghi chú |
|---|---|---|---|---|
| C001 | AppShell | chưa làm |   |  |
| C002 | Sidebar | chưa làm |   |  |
| C003 | Topbar | chưa làm |   |  |
| C004 | ContextSwitcher | chưa làm |   |  |
| C005 | Breadcrumbs | chưa làm |   |  |
| C006 | PageHeader | chưa làm |   |  |
| C007 | TabsAndSectionNav | chưa làm |   |  |
| C008 | GlobalSearch | chưa làm |   |  |
| C009 | UserMenu | chưa làm |   |  |
| C010 | FooterAndHelp | chưa làm |   |  |
| C011 | Button | chưa làm |   |  |
| C012 | DropdownActionMenu | chưa làm |   |  |
| C013 | TextField | chưa làm |   |  |
| C014 | Textarea | chưa làm |   |  |
| C015 | SelectCombobox | chưa làm |   |  |
| C016 | CheckboxRadioSwitch | chưa làm |   |  |
| C017 | DateTimePicker | chưa làm |   |  |
| C018 | NumberInput | chưa làm |   |  |
| C019 | FormFieldAndErrorSummary | chưa làm |   |  |
| C020 | FileDropzone | chưa làm |   |  |
| C021 | RichTextEditor | đã QA (ảnh chụp) | `src/features/announcements/composer.tsx (RichTextEditor)` [ảnh](../qa/screenshots/C071-composer-filled.png) | structured blocks p/h/li, toolbar, preview |
| C022 | AudienceSelector | đã QA (ảnh chụp) | `src/features/announcements/composer.tsx (AudienceSelector)` [ảnh](../qa/screenshots/SC34-desktop.png) |  |
| C023 | FilterBar | chưa làm |   |  |
| C024 | StickyActionBar | chưa làm |   |  |
| C025 | DataTable | chưa làm |   |  |
| C026 | Pagination | chưa làm |   |  |
| C027 | BulkSelectionBar | chưa làm |   |  |
| C028 | KpiCard | chưa làm |   |  |
| C029 | StatusBadge | chưa làm |   |  |
| C030 | AvatarAndIdentity | chưa làm |   |  |
| C031 | CardAndPanel | chưa làm |   |  |
| C032 | TimelineAndAuditDiff | chưa làm |   |  |
| C033 | ProgressAndStepper | chưa làm |   |  |
| C034 | Charts | chưa làm |   |  |
| C035 | FilePreviewAndDownload | chưa làm |   |  |
| C036 | EmptyFilteredList | chưa làm |   |  |
| C037 | ModalDialog | chưa làm |   |  |
| C038 | SideDrawer | chưa làm |   |  |
| C039 | MobileBottomSheet | chưa làm |   |  |
| C040 | ConfirmDialog | chưa làm |   |  |
| C041 | ToastAndInlineFeedback | chưa làm |   |  |
| C042 | LoadingSkeleton | chưa làm |   |  |
| C043 | EmptyState | chưa làm |   |  |
| C044 | ErrorAndDeniedState | chưa làm |   |  |
| C045 | UnsavedChangesGuard | chưa làm |   |  |
| C046 | VersionConflictResolver | chưa làm |   |  |
| C047 | DemoScenarioBanner | chưa làm |   |  |
| C048 | SchoolCardAndOnboarding | chưa làm |   |  |
| C049 | TeacherAssignmentPicker | chưa làm |   |  |
| C050 | PermissionMatrix | chưa làm |   |  |
| C051 | ClassCardAndContextHeader | chưa làm |   |  |
| C052 | StudentRosterAndQuickView | chưa làm |   |  |
| C053 | StudentProfileSections | chưa làm |   |  |
| C054 | GuardianRelationshipCard | chưa làm |   |  |
| C055 | ParentAccessCard | chưa làm |   |  |
| C056 | QrAndLinkDisplay | chưa làm |   |  |
| C057 | ParentAccessLog | chưa làm |   |  |
| C058 | AttendanceRow | chưa làm |   |  |
| C059 | AttendanceMobileCard | chưa làm |   |  |
| C060 | ConductRulePicker | chưa làm |   |  |
| C061 | ConductRecordForm | chưa làm |   |  |
| C062 | WeeklyConductTable | chưa làm |   |  |
| C063 | ReviewAndPublishPanel | chưa làm |   |  |
| C064 | PublishedSnapshotAndDiff | chưa làm |   |  |
| C065 | GroupsAndRolesBoard | chưa làm |   |  |
| C066 | SeatingMapEditor | chưa làm |   |  |
| C067 | TimetableGridAndDayList | chưa làm |   |  |
| C068 | DutyAssignmentBoard | chưa làm |   |  |
| C069 | ActivityProgressCard | chưa làm |   |  |
| C070 | EvidenceReviewPanel | chưa làm |   |  |
| C071 | AnnouncementComposerAndPreview | đã QA (ảnh chụp) | `src/features/announcements/composer.tsx` [ảnh](../qa/screenshots/C071-composer-filled.png) [ảnh](../qa/screenshots/C071-composer-preview-mobile.png) | AnnouncementComposer; optional onCancel prop added on lead request |
| C072 | ImportWizardAndMapping | chưa làm |   |  |
| C073 | TransferAndHandoverWizard | chưa làm |   |  |
| C074 | ReportViewerAndExport | đã QA (ảnh chụp) | `src/features/reports/viewer.tsx` [ảnh](../qa/screenshots/SC38-desktop.png) [ảnh](../qa/screenshots/SC38-print-preview.png) [ảnh](../qa/screenshots/O30-export-format.png) | ReportViewer; optional canExport prop (default true) |
| C075 | ParentReadOnlyShell | chưa làm |   |  |

## Overlay / form

| ID | Tên | Trạng thái | Bằng chứng / nơi dùng | Ghi chú |
|---|---|---|---|---|
| O01 | Thay đổi trạng thái trường | đã QA (ảnh chụp) | `/platform/schools/demo-school-a` [ảnh](../qa/screenshots/O01-suspend-confirm.png) [ảnh](../qa/screenshots/PL04-activate-blocked.png) | Dùng lại src/features/platform/school-status-dialog.tsx có sẵn. / SchoolStatusDialog: activate/suspend/archive with reason; last-admin rule enforced by repository. |
| O02 | Mời / thay quản trị trường | đã QA (ảnh chụp) | `/platform/schools/demo-school-a/admins` [ảnh](../qa/screenshots/O02-invite-admin.png) [ảnh](../qa/screenshots/O02-replace-admin.png) [ảnh](../qa/screenshots/PL05-after-invite.png) | src/features/platform/invite-admin-dialog.tsx — mời/thay, thời hạn, không gửi email, không để mất quản trị cuối. |
| O03 | Tạo / sửa lớp | chưa làm |   |  |
| O04 | Học kỳ / mốc tuần / hạn chốt | chưa làm |   |  |
| O05 | Mời giáo viên | chưa làm |   |  |
| O06 | Gán phân công | chưa làm |   |  |
| O07 | Xem thay đổi quyền | chưa làm |   |  |
| O08 | Thu hồi thành viên / phân công | chưa làm |   |  |
| O09 | Thêm / sửa người giám hộ | đã nối mock | `SC18/SC22`  | Thêm/sửa giám hộ; không tự xác minh. |
| O10 | Xác minh / thu hồi quan hệ | đã nối mock | `SC18/SC22`  | Xác minh (căn cứ bắt buộc) / thu hồi (thu hồi link của quan hệ đó). |
| O11 | Chuyển lớp / ngừng theo học | đã nối mock | `SC16/SC18/SC20`  | Chuyển lớp cùng năm / ngừng theo học; ngày hiệu lực; lý do; áp dụng ngay nếu có quyền. |
| O12 | Cấp đường dẫn riêng | đã QA (ảnh chụp) | `SC18/SC22/SC23` [ảnh](../qa/screenshots/O12-desktop.png) [ảnh](../qa/screenshots/O12-unverified-desktop.png) [ảnh](../qa/screenshots/O12-mobile.png) | Chỉ chọn được quan hệ đã xác minh; mục mặc định theo chính sách; hạn ≤ hết năm học. |
| O13 | Kết quả cấp link / in QR | đã QA (ảnh chụp) | `SC18/SC22/SC23` [ảnh](../qa/screenshots/O13-desktop.png) [ảnh](../qa/screenshots/O13-mobile.png) | QR thật (qrcode) mã hóa link demo, sao chép có toast 'Đã sao chép', in thẻ QR. |
| O14 | Thu hồi / cấp lại link | đã QA (ảnh chụp) | `SC18/SC22/SC23/SC24` [ảnh](../qa/screenshots/O14-desktop.png) | Thu hồi có lý do; cấp lại thu hồi link cũ + tạo link mới; link giám hộ khác không đổi. |
| O15 | Ghi chú và sửa điểm danh | chưa làm |   |  |
| O16 | Điểm danh hàng loạt | chưa làm |   |  |
| O17 | Ghi nhận cộng / trừ | chưa làm |   |  |
| O18 | Xử lý ghi nhận trùng | chưa làm |   |  |
| O19 | Xem giải trình điểm | chưa làm |   |  |
| O20 | Chốt / công bố kết quả | chưa làm |   |  |
| O21 | Điều chỉnh sau chốt | chưa làm |   |  |
| O22 | Thêm quy tắc / ban hành phiên bản | đã QA (ảnh chụp) | `/school/demo-school-a/conduct-rules` [ảnh](../qa/screenshots/O22-publish-ruleset.png) | New version dialog + publish confirm |
| O23 | Phân tổ / chức vụ | chưa làm |   |  |
| O24 | Đổi ghế / lưu sơ đồ | chưa làm |   |  |
| O25 | Đổi tiết / lịch nghỉ | đã QA (ảnh chụp) | `/school/demo-school-a/timetable` [ảnh](../qa/screenshots/O25-lesson-change-drawer.png) [ảnh](../qa/screenshots/O25-lesson-change-drawer-mobile.png) |  |
| O26 | Phân công trực nhật | chưa làm |   |  |
| O27 | Tải / duyệt minh chứng | đã QA (ảnh chụp) |  [ảnh](../qa/screenshots/O27-desktop.png) [ảnh](../qa/screenshots/O27-mobile.png) [ảnh](../qa/screenshots/O27-validation-desktop.png) [ảnh](../qa/screenshots/O27-discard-mobile.png) [ảnh](../qa/screenshots/review-approve-desktop.png) | Record evidence (student limited to assigned, image/PDF <= 5MB, note, local-only label) + review dialog (approve with share toggle, supplement/reject with reason). |
| O28 | Xem tệp / ảnh | đã QA (ảnh chụp) |  [ảnh](../qa/screenshots/O28-desktop.png) [ảnh](../qa/screenshots/O28-mobile.png) | FilePreview in Modal with metadata + download; revoked fallback from FilePreview. |
| O29 | Công bố / thu hồi thông báo | đã QA (ảnh chụp) | `/school/demo-school-a/announcements/an-1` [ảnh](../qa/screenshots/CL23-desktop.png) [ảnh](../qa/screenshots/C071-composer-filled.png) [ảnh](../qa/screenshots/O29-withdraw.png) |  |
| O30 | Chọn định dạng xuất | đã QA (ảnh chụp) | `/school/demo-school-a/reports/attendance` [ảnh](../qa/screenshots/O30-export-format.png) |  |
| O31 | Lưu trữ / xóa dữ liệu nháp | đã QA (ảnh chụp) | `/school/demo-school-a/announcements/an-4` [ảnh](../qa/screenshots/CL23-desktop.png) [ảnh](../qa/screenshots/O31-delete-announcement-draft.png) [ảnh](../qa/screenshots/O31-delete-ruleset-draft.png) |  |
| O32 | Chưa lưu thay đổi | chưa làm |   |  |
| O33 | Xung đột phiên bản | đã QA (ảnh chụp) | `SC19` [ảnh](../qa/screenshots/SC19-conflict-desktop.png) | ConflictDialog dùng chung. |
| O34 | Yêu cầu / thu hồi hỗ trợ | đã QA (ảnh chụp) | `/platform/support-access` [ảnh](../qa/screenshots/O34-request-support.png) [ảnh](../qa/screenshots/O34-validation.png) [ảnh](../qa/screenshots/O34-revoke-grant.png) | Phía nền tảng: src/features/platform/support-request-dialog.tsx (chỉ đề nghị; trường duyệt/thu hồi ở nhóm school). |

## Trạng thái

| ID | Tên | Trạng thái | Bằng chứng / nơi dùng | Ghi chú |
|---|---|---|---|---|
| ST01 | Đang tải | chưa làm |   |  |
| ST02 | Chưa có dữ liệu | chưa làm |   |  |
| ST03 | Không có kết quả lọc | đã dựng | `lists`  | EmptyFiltered in all lists |
| ST04 | Lỗi đọc dữ liệu | chưa làm |   |  |
| ST05 | Mất mạng khi lưu | chưa làm |   |  |
| ST06 | Đang lưu | chưa làm |   |  |
| ST07 | Đã lưu cục bộ demo | chưa làm |   |  |
| ST08 | Lỗi form | đã QA (ảnh chụp) | `/school/demo-school-a/announcements/new` [ảnh](../qa/screenshots/C071-composer-validation.png) |  |
| ST09 | Không có quyền | chưa làm |   |  |
| ST10 | Chưa được phân công | chưa làm |   |  |
| ST11 | Hết phiên nhân sự demo | đã QA (ảnh chụp) | `/account/security` [ảnh](../qa/screenshots/ST11-session-expired.png) [ảnh](../qa/screenshots/ST11-login-after-expire.png) | expire() → RequireStaffSession hiển thị 'Phiên demo đã hết'; /login có callout phiên trước đã hết. |
| ST12 | Lời mời hết hạn / thu hồi | đã QA (ảnh chụp) | `/invitations/inv-a-loan` [ảnh](../qa/screenshots/ST12-expired-desktop.png) [ảnh](../qa/screenshots/ST12-expired-mobile.png) [ảnh](../qa/screenshots/ST12-revoked-desktop.png) [ảnh](../qa/screenshots/ST12-revoked-mobile.png) | Không cho chấp nhận, nêu người mời để liên hệ. |
| ST13 | Trường tạm dừng | đã QA (ảnh chụp) | `/school-suspended?school=tran-phu` [ảnh](../qa/screenshots/SY06-desktop.png) [ảnh](../qa/screenshots/SY06-mobile.png) [ảnh](../qa/screenshots/ST13-choose-desktop.png) | Không nút ghi dữ liệu; dữ liệu không bị xóa. |
| ST14 | Chưa điểm danh | chưa làm |   |  |
| ST15 | Chưa công bố | chưa làm |   |  |
| ST16 | Đã chốt chưa công bố | chưa làm |   |  |
| ST17 | Đã công bố | chưa làm |   |  |
| ST18 | Đang điều chỉnh | chưa làm |   |  |
| ST19 | Bị thu hồi công bố | chưa làm |   |  |
| ST20 | Xung đột phiên bản | đã dựng | `settings/policy/rules/composer`  | ConflictDialog on CONFLICT |
| ST21 | Trùng sự kiện | chưa làm |   |  |
| ST22 | Link tra cứu hết hạn / thu hồi / không hợp lệ | chưa làm |   |  |
| ST23 | Tệp lỗi / không hỗ trợ / bị thu hồi | chưa làm |   |  |
| ST24 | Năm học lưu trữ | chưa làm |   |  |
| ST25 | Học sinh chuyển lớp / nghỉ học | chưa làm |   |  |
| ST26 | Giáo viên bị thu hồi trong tab đang mở | chưa làm |   |  |
| ST27 | Thao tác cần xác nhận | đã QA (ảnh chụp) | `many` [ảnh](../qa/screenshots/O29-withdraw.png) |  |
| ST28 | 404 và lỗi toàn trang | đã QA (ảnh chụp) | `/khong-ton-tai-demo` [ảnh](../qa/screenshots/SY08-desktop.png) [ảnh](../qa/screenshots/SY08-mobile.png) | not-found chụp được; error.tsx/global-error.tsx dựng xong, chưa chụp. |
