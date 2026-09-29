# Dữ liệu mẫu và luồng frontend tương tác

## 1. Không có backend thật trong giai đoạn này

Tất cả dữ liệu là giả định. Chỉ dựng frontend và adapter mô phỏng. Không Firebase, không PostgreSQL, không migration, không seed dữ liệu học sinh thật, không endpoint sản xuất, không thông tin xác thực thật.

Phân quyền ở frontend và `MockRepository` chỉ để trình diễn/test logic giao diện. Bất kỳ dữ liệu nào gửi xuống trình duyệt đều không được xem là đã bảo mật. Không triển khai dùng thật cho nhà trường chỉ vì mock guard/test frontend đã pass.

## 2. Nguồn dữ liệu duy nhất

```text
Fixture có kiểu dữ liệu
   → MockRepository / adapter bất đồng bộ
   → Query/cache + selectors/commands
   → Domain components
   → Screens

Commands: create / edit / approve / publish / revoke / transfer
   → cập nhật store mô phỏng + version + audit event
   → làm mới các view liên quan
```

Không khai báo `const students = [...]` riêng ở mỗi page. Không tính KPI bằng số cứng trong JSX. `Student`, `Enrollment`, `Assignment`, `RuleVersion`, `AttendanceRecord`, `ConductRecord`, `PublishedSnapshot`, `GuardianRelationship`, `ParentAccess`, `Activity`, `Evidence`, `Announcement`… là model frontend, không phải schema database đã chốt.

Adapter bất đồng bộ mô phỏng loading/error và có kiểu kết quả rõ. Với ghi dữ liệu, trả thành công sau khi ghi cục bộ thành công. Fake delay cố định/điều khiển qua kịch bản; không `Math.random()` tự gây lỗi hoặc đổi dữ liệu mỗi render.

## 3. Fixture bắt buộc

| Đối tượng | Bộ dữ liệu đề xuất để Agent tạo |
|---|---|
| Trường | 8 trường giả định để bảng platform có dữ liệu; ít nhất hai trường A/B được dựng đầy đủ cho kiểm thử cách ly. Trường khác có thể chưa khởi tạo, phải hiện đúng trạng thái. |
| Trường A | Tên trình bày “Trường THPT Bình Minh” là tên mẫu; ID `demo-school-a`. |
| Trường B | “Trường THPT An Hòa”, ID `demo-school-b`; có lớp trùng nhãn 10A1 để test scope giữa hai trường. |
| Năm | Năm 2026–2027; lưu một năm cũ để test read-only/lịch sử. |
| Lớp | A: 10A1 có 42 học sinh, 10A2 có 40, 11A1 có 36. B: lớp cùng tên 10A1 có 35. Bộ đầy đủ này có 153 học sinh giả định. |
| Giáo viên | Cô Lan: GVCN A/10A1 và môn Ngữ văn A/10A2. Thầy Hùng: Toán A/10A1 và A/10A2, không có quyền giám hộ/chốt toàn lớp mặc định. Có một giáo viên thuộc cả A/B với membership độc lập. |
| Nhân sự trường | Quản trị trường A; BGH có quyền xem/duyệt cụ thể; giáo vụ quản lý hồ sơ không sửa kết quả đã chốt; một lời mời hết hạn; một thành viên đã thu hồi. |
| Học sinh kiểm thử | Minh Anh (`demo-student-a-001`), hai em trùng tên nhưng ID khác, một em chuyển lớp, một em ngừng theo học, một hồ sơ chưa xác minh giám hộ. Không dùng dữ liệu thật trong ảnh. |
| Danh tính hiển thị | Cùng học sinh/giáo viên luôn cùng tên, avatar, lớp trong đúng thời gian. Dùng avatar local/initials; không gọi dịch vụ avatar bên ngoài. |
| Giám hộ | Hai người nhận của Minh Anh có link riêng; một người có hai con dùng hai link; không gộp theo số điện thoại. |
| Link | Có active, expired, revoked, hạn năm cũ, thiếu scope module, trường suspended. Link của người giám hộ khác không thay trạng thái khi một link bị thu hồi. |
| Nội quy | Phiên bản 1: gốc 100, đi muộn -5, phát biểu +2, không đặt trần/sàn cho tổng điểm trong fixture này; phiên bản 2 đổi một rule từ tuần sau. Đây là ví dụ có thể cấu hình, không quy định bắt buộc. |
| Thi đua | Một tuần đã công bố, tuần hiện tại nháp; một ghi nhận trùng nguồn; một bản điều chỉnh đang duyệt. |
| Điểm danh | Ngày mẫu 42 em: 38 có mặt đúng giờ, 2 đi muộn, 1 nghỉ phép, 1 không phép. Kịch bản khác có chưa điểm danh và tổng vẫn bằng sĩ số. “Hiện diện” nếu tính riêng là 40; không lẫn với nhóm đúng giờ. |
| Hoạt động | Ít nhất 3 hoạt động và các tình trạng chưa nhận/đã nhận/chờ duyệt/được duyệt/cần bổ sung. Người upload là giáo viên. |
| Thông báo | Toàn trường, một lớp, riêng một học sinh; draft/published/withdrawn/scheduled demo. |
| Tệp | Tệp tổng hợp hoàn toàn giả, không chứa ảnh hồ sơ thật; loại hợp lệ, loại lỗi, vượt giới hạn giả lập. |

Không lấy các số 128 trường/2.845 giáo viên/12.430 phụ huynh trong ảnh làm thống kê thật nếu fixture không có.

`DemoClock` có thời điểm cố định, ví dụ `2026-10-05T08:00:00+07:00`, để screenshot và test lặp lại. Các ngày/kỳ nằm trong năm demo. Danh sách mẫu, số lượng và thời gian phải được tính thống nhất; ghi rõ “Dữ liệu minh họa”.

## 4. Lưu cục bộ và đồng bộ các tab demo

Đề xuất dùng IndexedDB cho dữ liệu nhỏ có cấu trúc và blob tệp mẫu; version namespace `edumanage-ui-demo-v1`. Có reset seed với xác nhận. Không lưu mật khẩu, khóa API hoặc token thật.

Sau thao tác create/update/publish/revoke, ghi version và invalidate cache. Dùng `BroadcastChannel` hoặc cơ chế tương đương để parent preview và teacher tab **trong cùng trình duyệt/cùng origin** cập nhật khi dữ liệu demo đổi. Fixture phải initialize một lần, không mỗi route mount.

Đây không phải realtime đa thiết bị. Link mở trên thiết bị khác không tự nhận những thay đổi IndexedDB của máy hiện tại. Khi QA đồng bộ publish/revoke, dùng các tab cùng origin hoặc parent preview nội bộ. Bản mobile trong giai đoạn này được QA bằng viewport của cùng môi trường.

Trước mọi mutation mô phỏng, kiểm tra version và scope. Trạng thái đã chốt, membership bị thu hồi, link hết hạn phải tạo lỗi có kiểu phù hợp để UI xử lý. Đồng bộ cục bộ/guard demo không thay thế phân quyền backend sau này.

## 5. Mười hai luồng phải thao tác được

### F01 — Một trường bắt đầu sử dụng

Platform tạo trường → mời quản trị (mock) → school setup năm/lớp → gán giáo viên → import danh sách giả → lớp đủ điều kiện hoạt động. Lớp khác thiếu phân công hiện cảnh báo, không bị lấp bằng dữ liệu giả ngoài fixture.

### F02 — Giáo viên có hai nhiệm vụ khác nhau

Mở Cô Lan → lớp 10A1 cho phép quản lý chủ nhiệm → lớp 10A2 chỉ phần Ngữ văn được giao. Mở trực tiếp route sửa giám hộ 10A2 phải bị mock adapter từ chối, không chỉ biến mất nút.

### F03 — Một tuần từ nhập đến phụ huynh xem

Ghi đi muộn -5 và phát biểu +2 → rà soát → chốt/công bố → parent Minh Anh xem 97. Trước công bố parent không thấy draft. Cập nhật các KPI/tasks liên quan từ cùng store.

### F04 — Chốt và công bố là hai trạng thái khác nhau

Người chỉ được chốt tạo “Đã chốt, chưa công bố”. Người có quyền công bố mới hiển thị cho parent. Nút gộp “Chốt và công bố” chỉ khi có đủ hai quyền và không còn lỗi chặn.

### F05 — Điều chỉnh kết quả đã công bố

Bản 97 vẫn giữ nguyên → đề nghị bỏ ghi nhận nhầm -5, nêu lý do → duyệt → bản mới 102 theo fixture không đặt trần; nếu thử một cấu hình trần khác thì hiển thị phép tính và giới hạn đó rõ ràng → công bố bản mới. Snapshot cũ không bị ghi đè, đổi nội quy hiện tại không tự đổi lịch sử.

### F06 — Cấp/thu hồi link không có account parent

Xác minh quan hệ → cấp link cho mẹ → copy/QR → mở parent không login → thu hồi → đọc/tải mới bị chặn trong mock. Link của bố vẫn độc lập. Ghi nhật ký link, không khẳng định ai thực sự cầm link.

### F07 — Điểm danh không đếm trùng thi đua

Ghi đi muộn → tạo/liên kết một sự kiện nguồn nếu quy tắc cho phép → thử nhập lại từ thi đua → báo trùng, không tạo thêm -5. Chưa điểm danh không tự có mặt, bulk mark cần xác nhận.

### F08 — Chuyển lớp và bàn giao chủ nhiệm

Chọn ngày chuyển → xem lớp cũ/mới → xác nhận → hiện lịch sử đúng, báo cáo cũ giữ lớp cũ. Bàn giao GVCN giữ tác giả record lịch sử, nhưng thu hồi khả năng thao tác tiếp của người cũ. Link cùng trường/năm vẫn chỉ cho chính em theo phạm vi đã cấp, không mở lớp/học sinh khác.

### F09 — Import có lỗi

Chọn CSV/XLSX cục bộ → map cột → báo dòng lỗi/trùng → preview → xác nhận phần hợp lệ theo lựa chọn rõ → kết quả nhập và file lỗi. Hai người cùng tên không tự gộp. Không có nút âm thầm xóa danh sách hiện tại rồi thay thế.

### F10 — Hoạt động và minh chứng

Giáo viên giao hoạt động → ghi nhận tệp đã nhận từ bên ngoài → duyệt/yêu cầu bổ sung → công bố tình trạng của em. Parent chỉ đọc và chỉ xem tệp của con được chia sẻ; không upload và không tự cộng điểm khi hoạt động hoàn tất.

### F11 — Lịch và thông báo riêng tư

Đổi tiết có ngày áp dụng → phát hiện trùng giáo viên/phòng → chỉnh lại → công bố. Soạn thông báo riêng cho em A; parent B không có tin đó. Thu hồi tin dừng các lần đọc mới, không tuyên bố xóa được screenshot đã lưu.

### F12 — Lỗi, concurrency và khôi phục UI

Chọn kịch bản network error khi lưu → giữ draft, không thành công giả → retry một lần không nhân đôi. Chọn version conflict → hiện bản mới và yêu cầu xác nhận, không overwrite. Đăng xuất demo/đổi trường không làm rò context cũ.

## 6. File export và tác vụ ngoại vi

CSV: tạo file UTF-8 có BOM phù hợp tiếng Việt. XLSX: dùng thư viện frontend được Agent kiểm tra tương thích, tạo workbook thật; không đổi đuôi CSV thành .xlsx. PDF: giai đoạn này dùng view in sạch + browser Print / Save as PDF, nhãn nút đúng chức năng. Không báo có worker PDF hoặc gửi báo cáo thật.

Upload: đọc/tạo preview Blob cục bộ, giới hạn loại/size theo config demo, revoke object URL khi cleanup. Các mẫu lớn chỉ dùng dữ liệu tổng hợp, không yêu cầu upload hồ sơ thật.

Lên lịch công bố: chỉ mô phỏng với DemoClock/advance time khi demo đang chạy; có nhãn rõ. Không hứa thông báo sẽ gửi hoặc công bố khi đóng browser. Liên hệ mail/điện thoại trong fixture dùng nội dung mẫu, không tự gửi/gọi.
