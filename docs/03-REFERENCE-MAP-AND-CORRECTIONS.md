# Cách sử dụng ảnh và sửa các sai khác nghiệp vụ

## 1. Ba loại ảnh — không nhầm lẫn

- `references/screens/`: 10 concept giao diện nghiệp vụ. Đây là chuẩn thẩm mỹ cho bố cục, màu sắc, card, bảng, menu và cảm giác sản phẩm; không phải chứng nhận nghiệp vụ/tiến độ đã đúng.
- `references/planning/`: 4 ảnh trình bày sitemap, checklist, component và states. Chỉ làm đầu vào cho `/preview/*`, không tạo một menu “Kế hoạch & Chiến lược” hay “Full Sitemap CMS” trong CMS khách hàng.
- `references/archive/`: 1 concept tra cứu giáo viên ban đầu. Giữ trong gói để đủ bộ; chỉ tham khảo cách trình bày giáo viên và liên hệ. Các chi tiết tài khoản phụ huynh, chat, chọn trường trong ảnh này đã bị thay thế bởi nghiệp vụ mới.

Ảnh PNG nguyên bản được sao chép không resize, không nén lại, không đổi nội dung. `manifests/reference-images.json` có tên gốc, tên mới, kích thước và SHA-256. Bản contact sheet chỉ để xem nhanh, không thay ảnh gốc khi đối chiếu.

## 2. Thứ tự quyết định khi có mâu thuẫn

```text
Ràng buộc trực tiếp của chủ dự án trong yêu cầu hiện tại
  → Nghiệp vụ mới trong docs/BUSINESS-V2.md
  → Quyết định/frontend scope trong AGENT-FRONTEND.md
  → Sitemap + hành vi + các chỉnh sửa trong tài liệu này
  → Bố cục và phong cách ảnh tham chiếu
  → Chi tiết chữ/số minh họa trong ảnh
```

Không áp dụng bản kế hoạch kỹ thuật trước đây, không bắt buộc 63 bảng, không đọc/clone source trước, không dựng migration. Đây là frontend của sản phẩm mới.

## 3. Những chi tiết KHÔNG sao chép nguyên từ ảnh

| Sai khác trong concept | Yêu cầu khi code |
|---|---|
| Sidebar hoặc avatar Quản trị nền tảng xuất hiện trong lớp, học sinh, điểm danh | Dùng đúng SchoolShell/TeacherShell; platform không mặc định truy cập hồ sơ học sinh. |
| Tên tài khoản phụ huynh, menu tài khoản, đăng nhập hoặc đổi trường tùy ý | Bỏ. ParentShell chỉ context học sinh từ link demo, năm học trong phạm vi cấp, không tài khoản. |
| Nút nhắn tin, log “phụ huynh đã gửi tin nhắn”, học sinh tự upload | Không triển khai trong core. Thay bằng “Xem thông báo” hoặc “Xem liên hệ” phù hợp. Minh chứng do nhân sự ghi nhận. |
| Mục Kết quả học tập / học bạ | Ngoài phạm vi mặc định. Ẩn menu/route, đặt feature flag OFF; ba mục EX trong registry chỉ làm khi được chốt bổ sung. |
| GVCN có quyền điểm danh/công bố toàn trường chỉ vì có role GVCN | Phân quyền theo nhiệm vụ + lớp/môn + hiệu lực, không theo avatar hoặc tên role chung. |
| Permission code tiếng Anh hiển thị tràn như nội dung chính | Dùng nhãn tiếng Việt dễ hiểu: “Nhập điểm danh”, “Công bố thi đua”, “Cấp link tra cứu”. Mã quyền chỉ ở chi tiết kỹ thuật nếu cần. |
| KPI sĩ số/có mặt/vắng mặt và phép cộng điểm không khớp | Dẫn xuất từ cùng fixture. Mặc định ví dụ 42 học sinh = 38 đúng giờ + 2 đi muộn + 1 nghỉ phép + 1 không phép. Điểm ví dụ 100 - 5 + 2 = 97. |
| Nhiều năm học 2024–2025/2026–2027, tên/GVCN/avatar mâu thuẫn | Dùng một fixture năm 2026–2027 và một danh tính nhất quán xuyên màn hình. Không chép số liệu riêng ở từng component. |
| “Phụ huynh đã kích hoạt” | Đổi thành “Link đã cấp”, “Link đã được mở”, hoặc “Lượt mở link demo” theo dữ liệu thật của mock. Không gọi là kích hoạt tài khoản. |
| Nhật ký ghi chắc chắn bố/mẹ nào đã mở link | Chỉ ghi “Link cấp cho … được mở”, thời gian, context demo. Không khẳng định danh tính người cầm link. |
| URL ngắn chứa mã học sinh/QR minh họa trong ảnh | Không coi là thiết kế bảo mật. Dùng link fixture rõ ràng là demo, QR encode đúng link đó; production token để giai đoạn backend xử lý. |
| Dữ liệu nháp hoặc nội bộ hiển thị cho phụ huynh | Parent projection trả riêng dữ liệu đã công bố và field được cấp. Không chỉ ẩn bằng CSS. Đây vẫn chỉ là mô phỏng frontend, không bảo vệ dữ liệu thật. |
| Địa chỉ, điện thoại, email, CCCD/dân tộc của người trong ảnh | Không lấy làm dữ liệu thật. Dùng tên giả định, email `.test`, số liên hệ đã che. Không thu thêm dữ liệu nhạy cảm không nằm nghiệp vụ. |
| “84 màn hình, 18 đã thiết kế”, các tick Done và các tỷ lệ trong ảnh checklist | Chỉ là chữ minh họa. Thống kê theo registry và test thực tế; mặc định tất cả `not_started`. |
| Khung điện thoại dựng bên cạnh dashboard desktop | Là cách trình bày mockup, không phải phần tử phải xuất hiện trong giao diện desktop thật. Tạo responsive layout riêng. |
| Thông tin “đã sao lưu”, “đã gửi Zalo”, “đã tải lên” khi chưa có tích hợp | Có nhãn “Mô phỏng”; không gọi dịch vụ thật, không ghi log thành công giả. |
| Mọi màn hình đều có quá nhiều card giới thiệu/khẩu hiệu | Giữ ngôn ngữ thẩm mỹ, giảm phần trang trí ở màn hình tác nghiệp/mobile; không làm mất khoảng trống quan trọng trong mẫu chính. |

## 4. Cách giữ độ giống ảnh mà vẫn đúng nghiệp vụ

Bắt đầu đối chiếu ở viewport **1448 × 1086** cho R01–R10. A01 có tỷ lệ khác, chỉ tham khảo. Bản thực có thể cuộn; không ép toàn bộ nội dung bất kỳ độ dài nào phải vừa trong một khung 1086 px.

Duy trì những yếu tố nhận diện: sidebar trái xanh rất nhạt; logo EduManage; topbar trắng; chữ navy; primary xanh; nền trắng/xanh sương; card bo góc vừa phải; border nhạt; badge pastel; icon nét gọn; banner minh họa trường/gia đình vừa phải. Không tự đổi thành dark mode, gradient toàn trang, hoặc template dashboard khác.

Không dùng ảnh screenshot nguyên trang làm nền rồi phủ vài nút. Chữ, bảng, card, biểu đồ và form phải là HTML/component có dữ liệu và thao tác. Có thể trích riêng phần minh họa thuần trang trí hoặc dùng asset/SVG tương thích, không cắt nguyên card có chữ/số. Nếu asset chưa đạt phải ghi trong visual gap report, không nói đã giống hoàn toàn.

Đối với màn hình chưa có ảnh riêng, lấy component từ mẫu đã hoàn thành, giữ cùng tỷ lệ/spacings. `derived` không có nghĩa là được bỏ qua hoặc làm placeholder.

## 5. Bảng ánh xạ chính xác

| Mã | Ảnh được Agent đọc | Dùng chính cho |
|---|---|---|
| **R01** | [references/screens/01-platform-overview.png](../references/screens/01-platform-overview.png) | Tổng quan nền tảng; PL01, PL02, PL03, PL04, PL06, PL07, PL09, PL10, PL11, SC42, SC43 |
| **R02** | [references/screens/02-school-overview.png](../references/screens/02-school-overview.png) | Tổng quan nhà trường; AU05, PL04, SC01, SC02, SC37, SC38, SC41, SY01 |
| **R03** | [references/screens/03-academic-years-and-classes.png](../references/screens/03-academic-years-and-classes.png) | Năm học và lớp học; SC03, SC04, SC05, SC06, SC07, SC08, SC09, SC12, SC26, SC32, CL15 |
| **R04** | [references/screens/04-teachers-and-permissions.png](../references/screens/04-teachers-and-permissions.png) | Giáo viên và phân quyền; AU01, AU02, AU03, AU04, AU06, AU07, PL05, PL08, SC10, SC11, SC12, SC13, SC14, SC15… (15 mục tham chiếu) |
| **R05** | [references/screens/05-teacher-my-classes.png](../references/screens/05-teacher-my-classes.png) | Lớp học của tôi; AU05, AU09, TE01, TE02, TE03, TE04, CL01 |
| **R06** | [references/screens/06-classroom-students-and-seating.png](../references/screens/06-classroom-students-and-seating.png) | Lớp học, học sinh và sơ đồ; SC07, SC09, SC15, SC16, SC20, SC26, SC27, SC28, CL01, CL02, CL13, CL14, CL16 |
| **R07** | [references/screens/07-student-profile-and-parent-access.png](../references/screens/07-student-profile-and-parent-access.png) | Hồ sơ học sinh và quyền tra cứu; SC16, SC17, SC18, SC19, SC20, SC21, SC22, SC23, SC24, SC39, SC40, SC41, CL03, PA13 |
| **R08** | [references/screens/08-attendance-and-conduct.png](../references/screens/08-attendance-and-conduct.png) | Điểm danh và thi đua; SC29, SC30, SC31, SC36, SC37, SC38, TE06, CL04, CL05, CL06, CL07, CL08, CL09, CL10… (21 mục tham chiếu) |
| **R09** | [references/screens/09-activities-evidence-announcements.png](../references/screens/09-activities-evidence-announcements.png) | Hoạt động, minh chứng và thông báo; AU09, SC33, SC34, SC35, SC36, TE05, CL17, CL18, CL19, CL20, CL21, CL22, CL23, CL24… (20 mục tham chiếu) |
| **R10** | [references/screens/10-parent-portal-overview.png](../references/screens/10-parent-portal-overview.png) | Tổng quan cổng phụ huynh; SC25, SC32, TE03, CL15, CL16, PA01, PA02, PA03, PA04, PA05, PA06, PA07, PA08, PA09… (26 mục tham chiếu) |
| **P01** | [references/planning/11-sitemap-board.png](../references/planning/11-sitemap-board.png) | Bảng định hướng sitemap; DV01, DV02, DV03 |
| **P02** | [references/planning/12-screen-checklist-board.png](../references/planning/12-screen-checklist-board.png) | Bảng định hướng checklist màn hình; DV04 |
| **P03** | [references/planning/13-component-checklist-board.png](../references/planning/13-component-checklist-board.png) | Bảng định hướng component; DV05 |
| **P04** | [references/planning/14-ux-states-and-flows-board.png](../references/planning/14-ux-states-and-flows-board.png) | Bảng định hướng trạng thái và luồng; AU08, AU10, PL03, PL06, PL07, PL09, PL10, SC27, SC28, SC31, SC39, SC40, SC42, SC43… (23 mục tham chiếu) |
| **A01** | [references/archive/15-parent-teacher-directory-early-concept.png](../references/archive/15-parent-teacher-directory-early-concept.png) | Concept ban đầu: giáo viên phụ trách; PA12 |
