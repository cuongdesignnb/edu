# QA và điều kiện bàn giao frontend

Tài liệu này là checklist cho Agent thực hiện sau khi code. Bộ handoff không chứa kết quả đã chạy ứng dụng. Test frontend mock không chứng minh bảo mật/hiệu năng backend production.

## 1. Bằng chứng phải có

- Lint, typecheck, production build, unit tests, browser/E2E: ghi đúng lệnh và kết quả; không giả PASS khi môi trường chưa chạy.
- Screenshot desktop của R01–R10 với route/context fixture tương ứng; R03/R04 có trạng thái drawer đang mở để so ảnh.
- Screenshot parent và giáo viên trên 390 px; bảng/form/modal trên 360, 768, 1024 px ở các luồng đại diện.
- Smoke test mọi route core/internal bằng fixture ID thực tại desktop và mobile. Optional OFF không xuất hiện trong menu hoặc thành broken link.
- Ảnh được chụp khi font/assets tải xong, DemoClock cố định, dữ liệu fixture cố định, motion tắt cho snapshot.
- Không assert pixel tuyệt đối với concept AI có dữ liệu/label sai; kiểm layout và ghi ngoại lệ nghiệp vụ cụ thể. Không dùng ngoại lệ đó để bỏ toàn bộ style gốc.

## 2. Bảng kiểm nghiệm thu

| Mã | Kiểm tra | Kết quả đúng |
|---|---|---|
| Q01 | Mở app theo README | Chạy được; không thiếu assets/font/dependency/env secret. |
| Q02 | Mở từng route core/internal | Không placeholder, không 404 ngoài kịch bản cố ý. |
| Q03 | Đối chiếu R01–R10 | Bám bố cục/màu/type/card/menu; khác biệt được nêu, không UI kit mặc định. |
| Q04 | Mở màn hình derived | Có bố cục đầy đủ, dữ liệu và hành động, cùng design system. |
| Q05 | Kiểm UTF-8 | Không `�`, mojibake, dấu lỗi hoặc chữ chồng. |
| Q06 | Viewport 360 và 390 | Không body overflow; table scroll nội bộ/card; modal/keyboard không che CTA. |
| Q07 | Keyboard và focus | Menu/dialog/select/table actions thao tác được; focus quay lại nơi mở. |
| Q08 | Loading/empty/error | Phân biệt rõ, có retry/hướng dẫn phù hợp quyền. |
| Q09 | Search/filter/sort/page | Dữ liệu thực đổi; số tổng đúng; filter mới reset trang. |
| Q10 | Bulk select | Không nhầm chọn trang với mọi kết quả; confirm đúng số mục. |
| Q11 | Form lỗi | Lỗi đúng field, không mất form, hủy không mutation. |
| Q12 | Tạo lớp và giáo viên | Lists/KPI/selectors cập nhật từ cùng mock store. |
| Q13 | Cô Lan chủ nhiệm 10A1, bộ môn 10A2 | Quyền không lan: không giám hộ/sơ đồ/chốt toàn 10A2. |
| Q14 | Giáo vụ vs BGH vs admin | Menu/action và mock repository nhất quán theo cấp quyền. |
| Q15 | Hai trường cùng nhãn lớp | Không trộn dữ liệu trong UI/adapter/cache của demo. |
| Q16 | Platform xem chi tiết trường | Chỉ dữ liệu vận hành; không tự mở hồ sơ học sinh cả trường. |
| Q17 | Thu hồi membership/grant khi tab mở | Lần đọc/ghi mới từ chối trong mock, cache phù hợp. |
| Q18 | Học sinh trùng tên | Không gộp theo tên; ID/enrollment đúng. |
| Q19 | Chuyển lớp/bàn giao | Giữ dữ liệu quá khứ và tác giả, quyền hiện tại cập nhật. |
| Q20 | Chưa điểm danh | Không tính thành có mặt; tổng trạng thái bằng sĩ số. |
| Q21 | Điểm danh liên kết thi đua | Không trừ hai lần cùng sự kiện nguồn. |
| Q22 | Quy tắc ví dụ | 100 - 5 + 2 = 97, không số từ ảnh gây mâu thuẫn. |
| Q23 | Đã chốt chưa công bố | Parent không thấy dữ liệu vừa chốt nhưng chưa công bố. |
| Q24 | Công bố tuần | Parent đúng em thấy snapshot công bố, không cả lớp. |
| Q25 | Thay bộ nội quy mới | Snapshot quá khứ giữ nguyên, rule version hiện rõ. |
| Q26 | Điều chỉnh sau chốt | Có lý do/bản mới, không ghi đè bản đã công bố âm thầm. |
| Q27 | Cấp link chưa xác minh người nhận | Bị chặn/hướng dẫn xác minh, không cấp ngầm. |
| Q28 | Parent không account | Không login/signup/password/chat/upload/nút sửa, không đổi học sinh tùy ý. |
| Q29 | Parent nhập ID bản ghi khác qua URL | Mock adapter từ chối; chỉ scope link; đây không là chứng minh security thật. |
| Q30 | Link hết hạn/thu hồi | Không trả dữ liệu cho lần đọc mới, bao gồm tab cùng origin; link khác độc lập. |
| Q31 | Nhật ký link | Nhãn đúng “Link cấp cho…”, không khẳng định danh tính người mở. |
| Q32 | Link mở bằng QR demo | QR encode route đúng, không hình mẫu vô nghĩa; thiết bị khác chỉ có seed của nó. |
| Q33 | Parent xem hoạt động/tệp | Chỉ của con và được công bố, không gallery bạn khác. |
| Q34 | Thông báo cá nhân | Em B không có tin riêng cho em A; thu hồi dừng đọc mới. |
| Q35 | Lịch đổi tiết | Có ngày hiệu lực, báo trùng, không đổi lịch quá khứ để khớp tương lai. |
| Q36 | Import file lỗi/trùng | Preview và báo đúng dòng; không overwrite âm thầm; nhập lại không nhân đôi. |
| Q37 | Upload mẫu hợp lệ/lỗi | Blob preview thật; retry đúng; không báo đã upload lên server. |
| Q38 | CSV/XLSX | File tải mở được; đúng số dòng/bộ lọc/quyền; .xlsx là workbook thật. |
| Q39 | In/lưu PDF | Không sidebar/button/cắt dòng vô lý; tiếng Việt đúng; nhãn browser print đúng khả năng. |
| Q40 | Mock network error khi lưu | Không success giả; giữ draft; retry không double-submit. |
| Q41 | Version conflict | Hiện thay đổi; không ghi đè dữ liệu mới. |
| Q42 | Refresh và đổi tab | Store cục bộ nhất quán; demo publish/revoke cập nhật cùng origin. |
| Q43 | Chọn trường/năm | Xóa selection/cache không phù hợp, không rò context trước. |
| Q44 | Optional/AI/payments | Không nằm core/menu mặc định; không endpoint ngoài phạm vi. |
| Q45 | Internal preview pages | Không lẫn menu sản phẩm; số checklist lấy từ registry/progress có chứng cứ. |
| Q46 | Dữ liệu nhạy cảm/secret | Không dùng thông tin thật, credentials, API keys hoặc token production. |
| Q47 | Runtime errors | Không console error/asset 404/hydration error không chủ đích trong luồng bình thường. |
| Q48 | Tất cả CTA | Có thao tác/điều hướng, hoặc nhãn mô phỏng/ngoài phạm vi được giải thích; không “Coming soon” thay core. |

## 3. Cách đối chiếu thị giác

Đối chiếu lần lượt shell → typography → spacing/grid → cards/tables → ảnh trang trí → tương tác. Có thể tạo overlay/diff hỗ trợ, nhưng không coi diff do số/ngày/avatar fixture khác là lỗi bắt buộc sao chép dữ liệu sai.

Báo cáo mỗi ảnh gồm: mã R, route và viewport, screenshot Agent chụp, phần đã bám, ngoại lệ nghiệp vụ, sai khác thị giác còn cần sửa. Không tuyên bố “giống 100%” nếu chưa đo/đối chiếu, hoặc bỏ qua phần illustration chưa có.

## 4. Phân biệt các mốc

`Đã dựng`: route và giao diện tồn tại.  
`Đã nối mock`: hoạt động với dữ liệu chung.  
`Đã QA`: có test/screenshot thực tế và lỗi quan trọng đã xử lý.  
`Sẵn sàng backend`: interface/frontend data contract được mô tả, chưa có backend.  
`Sẵn sàng production`: **không phải kết luận của task này**.

Các nhãn Done/Pass trong ảnh planning không là dữ liệu tiến độ. Nếu Agent không có browser hoặc môi trường build thì ghi NOT_RUN + hạn chế cụ thể, không tạo ảnh/nhật ký kiểm thử giả.
