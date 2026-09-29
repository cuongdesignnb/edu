# Checklist component, overlay và trạng thái

Phạm vi: **75 component dùng lại**, **34 mẫu overlay/form tương tác**, **28 nhóm trạng thái**. Đây là yêu cầu triển khai, không phải các component đã được lập trình.

## Quy ước

Component không có màu/font/khoảng cách tự chế ở mỗi màn hình. Variants dùng chung tokens; có mẫu chạy được trong `/preview/components`. State và overlay dùng lại trong route nghiệp vụ, không chỉ xuất hiện ở trang gallery.

## Bố cục và điều hướng

| Checklist | Biến thể | Điều kiện nghiệm thu |
|---|---|---|
| [ ] **C001 `AppShell`** | Platform / School / Teacher / Parent / Public / Preview | Không chia sẻ nhầm sidebar hoặc context giữa các vai trò |
| [ ] **C002 `Sidebar`** | Mở rộng / thu gọn / mobile drawer | Active theo route thật; chỉ menu trong scope; focus bàn phím |
| [ ] **C003 `Topbar`** | Nhân sự / phụ huynh chỉ đọc | Parent không avatar tài khoản, user menu hay trường tùy chọn |
| [ ] **C004 `ContextSwitcher`** | School / AcademicYear / Class | Chỉ context được cấp; đổi context xóa cache/query không tương thích |
| [ ] **C005 `Breadcrumbs`** | Trang / lớp / chi tiết | Link thật và nhãn thân thiện, không hiện ID kỹ thuật thô |
| [ ] **C006 `PageHeader`** | Tiêu đề / subtitle / actions / illustration | Đúng typography và khoảng trắng theo ảnh, không header quá cao trên mobile |
| [ ] **C007 `TabsAndSectionNav`** | Tabs trang / tabs lớp / mobile section menu | Deep link, focus, nội dung hiện đúng, không hàng 12 tab tràn màn hình |
| [ ] **C008 `GlobalSearch`** | Dialog nhân sự / tìm cục bộ | Không tìm dữ liệu vượt scope; không tồn tại search cả hệ thống cho parent |
| [ ] **C009 `UserMenu`** | Hồ sơ / trường / thoát demo | Không đặt role switcher giả làm tính năng production |
| [ ] **C010 `FooterAndHelp`** | Nhân sự / public / parent | Không footer cố định đè bảng, liên kết hữu dụng và dễ đọc |

## Hành động và nhập liệu

| Checklist | Biến thể | Điều kiện nghiệm thu |
|---|---|---|
| [ ] **C011 `Button`** | Primary / secondary / ghost / destructive / loading / disabled | Không nút chết; icon đơn có accessible name; chống bấm gửi hai lần |
| [ ] **C012 `DropdownActionMenu`** | Hành động dòng / menu nhiều lựa chọn | Xử lý focus/escape; destructive có confirm đúng đối tượng |
| [ ] **C013 `TextField`** | Text / email / password / search / read-only | Label, helper, lỗi tiếng Việt; không dùng placeholder thay label |
| [ ] **C014 `Textarea`** | Ngắn / nhiều dòng / đếm ký tự | Giữ nội dung lỗi, chiều cao phù hợp, cảnh báo chưa lưu |
| [ ] **C015 `SelectCombobox`** | Single / multi / async mock / no results | Tìm kiếm có bàn phím; chỉ option đúng school/class/scope |
| [ ] **C016 `CheckboxRadioSwitch`** | Mặc định / focus / disabled / indeterminate | Ghi nhãn rõ; không dùng switch thay hành động cần phê duyệt |
| [ ] **C017 `DateTimePicker`** | Date / range / time / timezone | Hiển thị dd/MM/yyyy và Asia/Ho_Chi_Minh; kiểm tra khoảng ngày |
| [ ] **C018 `NumberInput`** | Điểm âm/dương / số lượng / giới hạn | Không chấp nhận NaN; phân biệt 0 với chưa có dữ liệu |
| [ ] **C019 `FormFieldAndErrorSummary`** | Inline error / summary / success | Submit đưa focus đến lỗi, không xóa dữ liệu đã nhập |
| [ ] **C020 `FileDropzone`** | Single/multi / upload / invalid / retry | Kiểm dung lượng/loại file; blob cục bộ; báo không upload máy chủ |
| [ ] **C021 `RichTextEditor`** | Toolbar gọn / preview / read-only | Nội dung có cấu trúc, không chèn script; đúng tiếng Việt |
| [ ] **C022 `AudienceSelector`** | Trường / khối / lớp / học sinh | Chỉ đối tượng được phép; hiển thị số người nhận ước tính từ fixture |
| [ ] **C023 `FilterBar`** | Search / chips / advanced / reset | Tìm/lọc/sort thật từ repository; reset về trang 1 khi đổi filter |
| [ ] **C024 `StickyActionBar`** | Form dirty / chọn nhiều / chốt | Không đè nội dung/keyboard mobile; có hủy và trạng thái xử lý |

## Hiển thị dữ liệu

| Checklist | Biến thể | Điều kiện nghiệm thu |
|---|---|---|
| [ ] **C025 `DataTable`** | Sticky header / sort / selectable / row action | Search/filter/page thật; không paginate chỉ thay số nhưng giữ dữ liệu |
| [ ] **C026 `Pagination`** | Compact / full / page size | Tổng dòng từ kết quả lọc; xử lý trang cuối và không có dữ liệu |
| [ ] **C027 `BulkSelectionBar`** | Chọn trang / chọn tất cả kết quả | Phân biệt hai phạm vi; xác nhận số bản ghi bị ảnh hưởng |
| [ ] **C028 `KpiCard`** | Số / tỷ lệ / không có dữ liệu | Tính từ fixture; tăng/giảm có cơ sở so sánh hoặc bỏ chỉ số tăng trưởng |
| [ ] **C029 `StatusBadge`** | Draft / active / locked / published / revoked | Chữ + icon/màu; không chỉ màu |
| [ ] **C030 `AvatarAndIdentity`** | Người / trường / fallback initials | Tên/avatar nhất quán giữa màn hình, ảnh local không broken |
| [ ] **C031 `CardAndPanel`** | Bảng / thông tin / nổi bật / pastel | Border/radius/shadow nhất quán với ảnh, không default kit khác style |
| [ ] **C032 `TimelineAndAuditDiff`** | Sự kiện / trước-sau / hiệu lực | Tách lịch sử nghiệp vụ và nhật ký mở link, không sửa lịch sử đã chốt |
| [ ] **C033 `ProgressAndStepper`** | Wizard / tiến độ / phần trăm | Tỷ lệ tính đúng; quay bước không mất dữ liệu; hoàn tất không giả |
| [ ] **C034 `Charts`** | Bar / donut / trend / no data | Có bảng thay thế; mẫu số rõ; không tạo số ngẫu nhiên mỗi render |
| [ ] **C035 `FilePreviewAndDownload`** | Image / PDF browser / unsupported / revoked | Preview đúng blob, có fallback; quyền mock kiểm mỗi lần đọc |
| [ ] **C036 `EmptyFilteredList`** | Không bản ghi / không khớp bộ lọc | Phân biệt chưa có dữ liệu với bộ lọc không có kết quả |

## Popup và phản hồi

| Checklist | Biến thể | Điều kiện nghiệm thu |
|---|---|---|
| [ ] **C037 `ModalDialog`** | Form / confirm / small / wide | Focus trap, escape theo trạng thái, trả focus về nút mở |
| [ ] **C038 `SideDrawer`** | Chi tiết / form / audit | Mobile thành full-screen/bottom sheet; không chồng layer lỗi |
| [ ] **C039 `MobileBottomSheet`** | Chọn trạng thái / bộ lọc / menu lớp | Touch targets đủ lớn, bàn phím không che nút chính |
| [ ] **C040 `ConfirmDialog`** | Archive / revoke / publish / transfer | Tên đối tượng, hậu quả, lý do nếu cần; hủy không thay dữ liệu |
| [ ] **C041 `ToastAndInlineFeedback`** | Success / error / retry / warning | Chỉ báo thành công sau mock transaction thành công |
| [ ] **C042 `LoadingSkeleton`** | Table / form / cards / parent | Giữ bố cục tránh nhảy, có aria-busy; không che lỗi vô thời hạn |
| [ ] **C043 `EmptyState`** | Chưa phân công / chưa công bố / chưa nhập | CTA phù hợp quyền; parent không CTA nhập dữ liệu |
| [ ] **C044 `ErrorAndDeniedState`** | Network / retry / no permission / not found | Không stack trace/PII; giữ unsaved draft khi retry |
| [ ] **C045 `UnsavedChangesGuard`** | Navigation / context switch / dialog close | Lưu hoặc bỏ rõ ràng; không tự mất form khi chọn trường khác |
| [ ] **C046 `VersionConflictResolver`** | Dữ liệu cũ / tải lại / xem thay đổi | Không ghi đè âm thầm; hiển thị người/thời điểm demo thay đổi |
| [ ] **C047 `DemoScenarioBanner`** | Demo / state preset / reset | Phân biệt prototype với hệ thống thật; không lộ vai trò giả trên production |

## Component nghiệp vụ

| Checklist | Biến thể | Điều kiện nghiệm thu |
|---|---|---|
| [ ] **C048 `SchoolCardAndOnboarding`** | Draft / active / suspended / archived | Checklist khởi tạo có hành động thật, không do thanh toán |
| [ ] **C049 `TeacherAssignmentPicker`** | Chủ nhiệm / bộ môn / thời gian | Grant là tổ hợp nhiệm vụ+scope; không hợp nhất quyền chéo lớp |
| [ ] **C050 `PermissionMatrix`** | Vai trò mẫu / xem / chỉnh / diff | Nhãn tiếng Việt; chọn quyền không tự nâng cấp người đang thao tác |
| [ ] **C051 `ClassCardAndContextHeader`** | Chủ nhiệm / bộ môn / admin | Luôn thấy trường/năm/lớp, sĩ số thống nhất với roster |
| [ ] **C052 `StudentRosterAndQuickView`** | Full / subject-minimal / read-only | Bộ môn không thấy giám hộ/ghi chú nội bộ nếu thiếu quyền |
| [ ] **C053 `StudentProfileSections`** | Trường / lớp / parent-minimal | Một nguồn dữ liệu; chọn field theo scope, không reuse toàn bộ cho parent |
| [ ] **C054 `GuardianRelationshipCard`** | Chưa xác minh / đã xác minh / revoked | Xác minh quan hệ khác với tài khoản; không gộp qua số điện thoại |
| [ ] **C055 `ParentAccessCard`** | Mới cấp / active / expired / revoked | Scope một em+trường+năm; cấp link riêng từng giám hộ |
| [ ] **C056 `QrAndLinkDisplay`** | Show-on-issue / copy / print / invalid | QR demo dùng thực được trong app demo; không hiển thị QR giả ngẫu nhiên |
| [ ] **C057 `ParentAccessLog`** | Link / lần mở / thời gian / thiết bị mẫu | Ghi Link cấp cho…, không tuyên bố chính người đó đã mở |
| [ ] **C058 `AttendanceRow`** | Chưa điểm danh / có mặt / đi muộn / nghỉ phép / nghỉ không phép | Trạng thái loại trừ nhau; không mặc định có mặt |
| [ ] **C059 `AttendanceMobileCard`** | Học sinh + các nút trạng thái | Dễ thao tác bằng một tay; giữ lựa chọn khi đổi người |
| [ ] **C060 `ConductRulePicker`** | Cộng / trừ / tùy chỉnh được phép | Hiện số điểm và lý do; chỉ rule version còn hiệu lực |
| [ ] **C061 `ConductRecordForm`** | Tạo / chỉnh / từ sự kiện nguồn / duplicate | Cùng sự kiện không ghi trùng điểm; validate phiên bản |
| [ ] **C062 `WeeklyConductTable`** | Chưa rà / đã chốt / công bố | Giải trình phép tính; khóa dữ liệu sau chốt |
| [ ] **C063 `ReviewAndPublishPanel`** | Checklist / preview / chốt / công bố | Không nhầm lưu với công bố; không publish khi còn lỗi chặn |
| [ ] **C064 `PublishedSnapshotAndDiff`** | Bản công bố / bản điều chỉnh | Giữ bản cũ; thay rule hiện tại không đổi snapshot |
| [ ] **C065 `GroupsAndRolesBoard`** | Tổ / lớp trưởng / nhiệm vụ | Chức vụ là dữ liệu học sinh, không quyền đăng nhập |
| [ ] **C066 `SeatingMapEditor`** | Layout / assign / empty / undo / effective date | Có chọn ghế qua form thay kéo; không 1 học sinh ở 2 ghế cùng phiên bản |
| [ ] **C067 `TimetableGridAndDayList`** | Tuần desktop / ngày mobile | Conflict giáo viên/phòng; giữ lịch sử theo ngày hiệu lực |
| [ ] **C068 `DutyAssignmentBoard`** | Ngày / tổ / học sinh | Parent projection chỉ nhiệm vụ của con, không thông tin bạn khác |
| [ ] **C069 `ActivityProgressCard`** | Nháp / đang thực hiện / đến hạn / hoàn tất | Mẫu số là số học sinh được giao; không tự cộng điểm |
| [ ] **C070 `EvidenceReviewPanel`** | Pending / approved / rejected / supplement | Người tải là nhân sự trong core; từ chối/yêu cầu bổ sung có lý do |
| [ ] **C071 `AnnouncementComposerAndPreview`** | Trường / lớp / cá nhân / scheduled mock | Scope đúng, parent không xem bản nháp hoặc file chưa chia sẻ |
| [ ] **C072 `ImportWizardAndMapping`** | File / mapping / validation / preview / result | Báo dòng lỗi, xung đột, không overwrite âm thầm |
| [ ] **C073 `TransferAndHandoverWizard`** | Chuyển lớp / bàn giao / kết thúc năm | Có ngày hiệu lực và preview thay đổi quyền/lịch sử |
| [ ] **C074 `ReportViewerAndExport`** | Cá nhân / lớp / trường | Không xuất dữ liệu vượt quyền; CSV/XLSX/PDF thật ở mức file cục bộ |
| [ ] **C075 `ParentReadOnlyShell`** | Overview / detail / unavailable | Không đăng ký, đăng nhập, upload, sửa, chat, chọn học sinh tùy ý |

## Popup / drawer / sheet / wizard dùng lại

Các mẫu dưới đây không buộc tất cả phải là modal. Form dài dùng full-page wizard; chi tiết ngắn dùng drawer; xác nhận dùng dialog; mobile thích nghi thành sheet/full-screen. Không đếm lại một form vừa là route vừa là drawer như hai thiết kế độc lập.

| Checklist | Trường dữ liệu / nội dung | Điều kiện |
|---|---|---|
| [ ] **O01 — Thay đổi trạng thái trường** | Tên trường, trạng thái mới, lý do | Confirm; tạm dừng không xóa dữ liệu; chỉ platform |
| [ ] **O02 — Mời / thay quản trị trường** | Email demo, vai trò, thời hạn | Không mất quản trị cuối; không gửi email thật |
| [ ] **O03 — Tạo / sửa lớp** | Năm, khối, tên, sức chứa, chủ nhiệm tùy giai đoạn | Mã/tên đúng scope; chưa đủ phân công thì lớp giữ nháp |
| [ ] **O04 — Học kỳ / mốc tuần / hạn chốt** | Ngày bắt đầu-kết thúc, hạn, hiệu lực | Không chồng kỳ sai, không áp ngược dữ liệu đã chốt |
| [ ] **O05 — Mời giáo viên** | Email, nhiệm vụ sơ bộ, lớp/môn, thời hạn | Người đã có danh tính chỉ thêm membership, không đổi mật khẩu chung |
| [ ] **O06 — Gán phân công** | Người, nhiệm vụ, lớp, môn, từ-đến | Kiểm trùng phân công chủ nhiệm chính, preview quyền từng scope |
| [ ] **O07 — Xem thay đổi quyền** | Quyền trước-sau, phạm vi, tác động | Xác nhận cụ thể; không nút Toàn quyền tất cả lớp mặc định |
| [ ] **O08 — Thu hồi thành viên / phân công** | Người, scope bị thu hồi, thời điểm, lý do | Không xóa danh tính toàn hệ thống hoặc lịch sử dữ liệu |
| [ ] **O09 — Thêm / sửa người giám hộ** | Tên, quan hệ, kênh liên hệ, người xác minh | Không tự xác minh chỉ vì nhập số điện thoại |
| [ ] **O10 — Xác minh / thu hồi quan hệ** | Người giám hộ, học sinh, căn cứ ghi chú, lý do | Quyền nhận thông tin tách biệt với trường liên hệ |
| [ ] **O11 — Chuyển lớp / ngừng theo học** | Lớp đích, ngày hiệu lực, lý do | Giữ enrollment cũ, không hard-delete lịch sử |
| [ ] **O12 — Cấp đường dẫn riêng** | Học sinh, giám hộ đã xác minh, năm, mục được xem, hạn | Mock link một trường/một em/một năm; không nhiều em tùy chọn cho parent |
| [ ] **O13 — Kết quả cấp link / in QR** | Link demo, QR thực biểu diễn link, cảnh báo chia sẻ | Copy có phản hồi, bản in rõ đúng người được cấp; không đăng nhóm chung |
| [ ] **O14 — Thu hồi / cấp lại link** | Access id, người được cấp, lý do | Chặn lần đọc mới từ link cũ; link giám hộ khác không đổi |
| [ ] **O15 — Ghi chú và sửa điểm danh** | Học sinh, buổi/tiết, trạng thái, lý do | Chưa điểm danh không có mặt; sửa đã công bố phải có lịch sử |
| [ ] **O16 — Điểm danh hàng loạt** | Phạm vi được chọn, trạng thái đích, số dòng thay | Xác nhận rõ chỉ chọn trang hay tất cả, không ghi đè ngoài lựa chọn |
| [ ] **O17 — Ghi nhận cộng / trừ** | Học sinh, rule version, thời điểm, điểm, lý do, nguồn | Chống nhân đôi sự kiện nguồn; không nhập sai lớp/môn |
| [ ] **O18 — Xử lý ghi nhận trùng** | Sự kiện cũ/mới, điểm hiện tại, lựa chọn bỏ/liên kết | Không nút cứ lưu 2 lần mặc định; có giải thích |
| [ ] **O19 — Xem giải trình điểm** | Điểm gốc, từng record, rule version, tổng, giới hạn | Tổng chính xác; nguồn đã duyệt và trạng thái rõ |
| [ ] **O20 — Chốt / công bố kết quả** | Kỳ, lớp, người nhận, lỗi còn lại, preview | Chỉ đủ quyền; success sau mutation; draft không rò vào parent |
| [ ] **O21 — Điều chỉnh sau chốt** | Bản cũ, giá trị mới, lý do, người duyệt | Giữ snapshot cũ, tạo bản điều chỉnh và công bố lại |
| [ ] **O22 — Thêm quy tắc / ban hành phiên bản** | Nhóm, điểm, cách tính, ngày hiệu lực | Không sửa âm thầm bản đã ban hành; không áp lại quá khứ |
| [ ] **O23 — Phân tổ / chức vụ** | Học sinh, tổ/chức vụ, thời gian | Không tạo account học sinh, không gán trùng chức vụ duy nhất |
| [ ] **O24 — Đổi ghế / lưu sơ đồ** | Ghế nguồn-đích, học sinh, ngày hiệu lực | Validate một học sinh một ghế, cancel không thay đổi |
| [ ] **O25 — Đổi tiết / lịch nghỉ** | Lớp, môn, giáo viên, phòng, thời gian, hiệu lực | Hiện xung đột và quyền; không ghi đè lịch quá khứ |
| [ ] **O26 — Phân công trực nhật** | Ngày, học sinh/tổ, nhiệm vụ | Scope lớp hiện tại; có preview phần parent thấy |
| [ ] **O27 — Tải / duyệt minh chứng** | Học sinh, hoạt động, file, nhận xét, trạng thái | File blob cục bộ; người tải giáo viên; giới hạn loại/size |
| [ ] **O28 — Xem tệp / ảnh** | Metadata, ảnh/PDF, quyền tải | Chặn file chưa chia sẻ khi xem parent; fallback loại không preview |
| [ ] **O29 — Công bố / thu hồi thông báo** | Audience, nội dung preview, thời điểm | Giữ riêng tin cá nhân; lịch hẹn chỉ simulation, không background server |
| [ ] **O30 — Chọn định dạng xuất** | Báo cáo, kỳ, scope, CSV/XLSX/In-PDF | Tệp đúng nội dung và định dạng, không giả .xlsx bằng CSV |
| [ ] **O31 — Lưu trữ / xóa dữ liệu nháp** | Đối tượng, hậu quả, lý do | Record có lịch sử thì archive; xóa vĩnh viễn không mặc định |
| [ ] **O32 — Chưa lưu thay đổi** | Lưu / bỏ / ở lại | Chặn điều hướng/context switch, không mất form |
| [ ] **O33 — Xung đột phiên bản** | Bản vừa tải, bản mới trong mock, chi tiết đổi | Không overwrite âm thầm; retry an toàn |
| [ ] **O34 — Yêu cầu / thu hồi hỗ trợ** | Trường, scope, lý do, hạn | Trường cho phép, platform không tự cấp quyền đọc trẻ em |

## Trạng thái toàn hệ thống

| Checklist | Cách thể hiện đúng |
|---|---|
| [ ] **ST01 — Đang tải** | Loading skeleton đúng bố cục, không spinner vô hạn |
| [ ] **ST02 — Chưa có dữ liệu** | Mô tả và CTA theo quyền để khởi tạo |
| [ ] **ST03 — Không có kết quả lọc** | Giữ filter, có Xóa bộ lọc |
| [ ] **ST04 — Lỗi đọc dữ liệu** | Thông điệp không kỹ thuật, nút Thử lại |
| [ ] **ST05 — Mất mạng khi lưu** | Không toast thành công; giữ nội dung chưa lưu |
| [ ] **ST06 — Đang lưu** | Khóa submit chống bấm trùng, không khóa mọi điều hướng vô lý |
| [ ] **ST07 — Đã lưu cục bộ demo** | Có trạng thái mô phỏng, không khẳng định đã gửi lên server |
| [ ] **ST08 — Lỗi form** | Inline errors và focus đến lỗi đầu |
| [ ] **ST09 — Không có quyền** | Không hiện dữ liệu bị cấm và không gợi ý tự nâng quyền |
| [ ] **ST10 — Chưa được phân công** | Chỉ dẫn liên hệ trường, không tạo dữ liệu mẫu lấp khoảng trống |
| [ ] **ST11 — Hết phiên nhân sự demo** | Quay đăng nhập demo an toàn, giữ draft ở mức được phép |
| [ ] **ST12 — Lời mời hết hạn / thu hồi** | Không cho chấp nhận, liên hệ người mời |
| [ ] **ST13 — Trường tạm dừng** | Chặn thao tác nghiệp vụ mô phỏng, không xóa dữ liệu |
| [ ] **ST14 — Chưa điểm danh** | Trạng thái độc lập, không tự đếm có mặt |
| [ ] **ST15 — Chưa công bố** | Parent không hiện 0 điểm hoặc Không vi phạm thay dữ liệu chưa có |
| [ ] **ST16 — Đã chốt chưa công bố** | Nhân sự đủ quyền xem; parent vẫn chưa thấy |
| [ ] **ST17 — Đã công bố** | Hiện phiên bản và thời điểm, đúng đối tượng |
| [ ] **ST18 — Đang điều chỉnh** | Parent vẫn bản công bố trước, không thấy draft điều chỉnh |
| [ ] **ST19 — Bị thu hồi công bố** | Lần tải mới dừng hiển thị, không giữ cache cũ |
| [ ] **ST20 — Xung đột phiên bản** | Có trước/sau và lựa chọn an toàn, không đè |
| [ ] **ST21 — Trùng sự kiện** | Cảnh báo có record nguồn, không nhân đôi điểm |
| [ ] **ST22 — Link tra cứu hết hạn / thu hồi / không hợp lệ** | Trang giải thích hạn chế, không hiện PII; một template nhiều biến thể |
| [ ] **ST23 — Tệp lỗi / không hỗ trợ / bị thu hồi** | Có lý do và retry/thay tệp khi có quyền |
| [ ] **ST24 — Năm học lưu trữ** | Read-only trừ workflow được cấp riêng |
| [ ] **ST25 — Học sinh chuyển lớp / nghỉ học** | Hiện lịch sử đúng thời gian, không biến mất báo cáo cũ |
| [ ] **ST26 — Giáo viên bị thu hồi trong tab đang mở** | Lần đọc/ghi mock tiếp theo bị chặn; UI cập nhật lại |
| [ ] **ST27 — Thao tác cần xác nhận** | Nêu đúng đối tượng, tác động, confirm/cancel có focus |
| [ ] **ST28 — 404 và lỗi toàn trang** | Not-found/error boundary, retry không lộ stack trace |

## Checklist một component trước khi dùng rộng

- [ ] Dùng tokens typography, màu, spacing, radius thống nhất.
- [ ] Default / hover / focus-visible / disabled / loading / error (nếu phù hợp).
- [ ] Desktop, tablet, mobile, keyboard; không text bị cắt không có cách đọc.
- [ ] Props có kiểu TypeScript; không lẫn business mutation và JSX trình bày.
- [ ] Có test tương tác quan trọng và một sample gắn dữ liệu từ mock repository.
- [ ] Không emoji thay icon; không font lỗi; không chỉ màu để phân biệt trạng thái.
