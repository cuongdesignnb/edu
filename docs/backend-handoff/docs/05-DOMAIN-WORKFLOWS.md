# 05 — Nghiệp vụ, trạng thái và giao dịch

## Transaction chuẩn cho command

Xác thực → xác định school/scope → BEGIN đúng connection → SET LOCAL tenant → khóa row aggregate cần thay đổi → kiểm version/idempotency/trạng thái → validation domain → update/insert + audit + outbox → COMMIT → trả response. Lỗi bất kỳ rollback; không gửi mail hay chờ PDF trong transaction.

Idempotency key unique theo tenant+actor+operation+key, kèm request hash. Cùng key/body replay kết quả an toàn; khác body409. Thao tác tạo điểm có canonical source riêng, không chỉ dựa key do client sinh. Chốt/export/import có dedupe key, worker at-least-once không nhân đôi nghiệp vụ.

## 1. Trường và năm học

Create school DRAFT + default roles + policy được validate; gửi lời mời admin sau commit qua mail queue. Active đòi ít nhất một admin hợp lệ; khóa trường không xóa dữ liệu. Không chỉnh trạng thái do chưa thanh toán.

Năm `[start,end)`; học kỳ/tuần nằm trong năm, tuần nằm trong kỳ; ngày nghỉ được biểu diễn riêng, không tính tuần bằng cách hardcode35. Tạo lớp unique mã trong năm; có sĩ số max theo cấu hình. Bắt buộc kiểm capacity khi nhập/chuyển; không trust counter từ UI.

Rollover là batch preview → phân loại lên lớp/lưu ban/chuyển đi → xác nhận → idempotent execute. Dữ liệu năm cũ không đổi. Phân công mới và link parent mới không tự kế thừa nếu chưa phê duyệt.

## 2. Phân công và bàn giao

Tạo grant và assignment atomic, loại HOMEROOM hoặc SUBJECT. Homeroom active không overlap trong một lớp. Subject cần đúng subject và member, ngày trong grant/năm. Handover khóa lớp, tính nhiệm vụ mở, end assignment/grant cũ, tạo mới, audit; không gán lại tác giả record cũ. Người cũ mất quyền ở request tiếp theo, trừ grant lịch sử được cấp riêng.

Ngày phân công có lịch sử không tự tạo quyền hiện tại. Backdated changes chỉ role trường được phép, reason bắt buộc, không mở lại snapshot im lặng.

## 3. Học sinh và gia đình

Student code riêng, không gộp trùng tên. Hồ sơ tối thiểu, không thu CCCD/dân tộc/ảnh nhận diện mặc định nếu nghiệp vụ chưa duyệt. Guardian relationship verified bởi nhân sự được quyền, timestamp/reason ghi lại; phone/email không tự chứng minh quan hệ.

Chuyển lớp DRAFT/SUBMITTED → APPROVED/APPLIED hoặc REJECTED/CANCELLED theo enum schema. Execute khóa student/enrollments/classes theo thứ tự ID để giảm deadlock; kiểm capacity và overlap; ends_on của lớp cũ bằng starts_on lớp mới; ghi enrollment mới + transfer status. Record cũ vẫn đúng lớp cũ. Không tự chia sẻ dữ liệu sang trường khác.

## 4. Điểm danh

Session một lớp+ngày+granularity. DAILY và LESSON không cộng vào cùng mẫu số. Mọi enrollment phải có hiệu lực ngày điểm danh; lesson đúng phân công giáo viên. Ban đầu `UNMARKED`, không tự PRESENT. Bulk button “Tất cả có mặt” yêu cầu xác nhận rõ và đúng danh sách được chọn, không ghi tất cả trường.

OPEN cho sửa có version. LOCKED không sửa trực tiếp; mở lại đòi quyền+reason, tạo publication mới sau sửa. Attendance public note tách internalNote. Những records chưa công bố không vào parent report. Một lần đi muộn nếu liên kết conduct phải có source canonical; sửa attendance không âm thầm đổi score đã chốt.

## 5. Nội quy và thi đua

Rule set DRAFT → ISSUED → RETIRED. Bản đã issued và rules/thresholds không sửa; tạo revision mới. ClassRulePeriod không overlap. Kỳ thi đua lấy rule set có hiệu lực ngay lúc tạo; phiên bản không đổi giữa chừng. Bản đầu chỉ cho thay rule set ở đầu tuần tiếp theo, không chia nhiều công thức trong cùng tuần. Đầu năm trường chọn base/limits/thresholds; ví dụ100 không là mặc định nghiệp vụ mọi trường.

Điểm do server tính: base + tổng delta APPROVED, clamp theo min/max nếu có, classification theo threshold được lưu. Penalty tổng trả dạng trị tuyệt đối hay âm phải nhất quán: **penaltyPoints là số âm, bonusPoints số không âm**, final=base+bonus+penalty trước clamp. Fixed rule bỏ qua/từ chối client manualDelta; MANUAL đòi quyền/bounds/reason. Snapshot label/delta tại thời điểm ghi nhận.

Record DRAFT → APPROVED hoặc EXCLUDED. EXCLUDED giữ lại có lý do. Period OPEN → IN_REVIEW → LOCKED. Parent không xem bảng OPEN, không xếp hạng cả lớp. Review blockers: records pending, duplicate unresolved, thiếu enrollment/rule, deadline conflict, score inconsistencies.

## 6. Chốt và công bố không trộn với lưu

`data_version` kỳ tăng mỗi child change. Chốt đọc/lock kỳ, kiểm expectedSourceVersion, kiểm permission conduct.lock, tạo snapshot từ records/rules dưới cùng transaction view, đặt LOCKED. Publish đòi conduct.publish; có thể kết hợp bằng một command khi cùng người đủ hai quyền; không gộp grant sai scope.

Publication READY → PUBLISHED; bản hiện hành cũ → SUPERSEDED trong cùng transaction. Chỉ một current PUBLISHED mỗi source. Payload + content_hash + source_version bất biến. Tạo parent items đầy đủ trước khi flip published. Với trường lớn stage chunks READY, lưu expected count/hash, final transaction xác minh count/version/authorization trước publish. Không để nửa lớp thấy bản mới.

Source version stale409. Khi user chỉ có lock không publish, để READY và người publish xử lý. Withdraw lifecycle metadata và chặn projection trong request mới; không DELETE snapshot.

## 7. Điều chỉnh sau chốt

Tạo adjustment dựa baselinePublicationId + reason + proposed changes. Không sửa record nguồn LOCKED ngay. Người có quyền duyệt xem before/after; chỉ sau approve mới áp thay đổi có tác giả, audit, new snapshot revision. Nếu source/current publication đổi trong lúc duyệt thì409 phải review lại. Bản cũ giữ hiển thị cho đến khi bản mới PUBLISHED atomically.

Không dùng unlock tuần để tự né quy trình. Dữ liệu approved cũ và rules_snapshot được dùng giải thích lịch sử, không join rule set current rồi tính lại.

## 8. Lịch, tổ, ghế và trực nhật

Tổ/chức vụ theo ngày; một enrollment một tổ tại thời điểm, chức vụ singleHolder không hai người overlap. Sơ đồ draft có unique seat key và học sinh chỉ một ghế; active date mới lưu revision, không ghi đè sơ đồ tháng trước. Undo UI trước lưu, không tự rollback dữ liệu đã publish.

Timetable recurring draft → validate → materialize lesson occurrences trong date range giới hạn → kiểm teacher/class/room overlap bằng exclusion + service → publish. Kiểm lịch nghỉ và phân công. Đổi lịch không được backwrite attendance/lesson cũ; occurrence có lịch sử/notes. Không materialize vô hạn.

Trực nhật assignment cụ thể enrollment/date. Parent chỉ phần của con từ publication, không danh sách contact hay tên cả tổ nếu không cần. Group assignment được expand/cố định tại ngày công bố, không đổi lịch cũ theo tổ hiện tại.

## 9. Hoạt động, minh chứng và thông báo

Hoạt động có participant enrollment explicit; tiến độ mẫu số là số người được giao, không toàn lớp mặc định. Giáo viên nhận/upload minh chứng; parent không upload. Review APPROVED/NEEDS_REVISION/EXCUSED có lý do; state public chỉ đổi khi publish. Complete activity không tự tạo score nếu chưa có liên kết rule được duyệt.

Thông báo DRAFT/SCHEDULED/PUBLISHED/WITHDRAWN theo schema; audience SCHOOL/CLASS/STUDENT/STAFF/PUBLIC phải validate. Public không chứa hồ sơ riêng; server allowlist HTML/tệp. Schedule queue không đồng nghĩa sent; đến giờ worker kiểm người tạo còn quyền, scope/trạng thái còn hợp lệ; nếu không BLOCKED/FAILED để rà soát. Muốn sửa đã publish tạo bản nháp mới và publish lại; không sửa payload người xem đang đọc.

## 10. Báo cáo và hỗ trợ

Staff report có lựa chọn nguồn “nháp được phép” hoặc “đã công bố”; label rõ. Parent chỉ published. Every aggregate filter có tenant/year/class/action scope từ server, total và export dùng cùng predicate. Teacher subject không xuất full guardian CSV nhờ có report.export.

Support update chỉ ticket liên quan; dữ liệu mô tả nhạy cảm hạn chế/redact, file không public. Role hỗ trợ không đồng nghĩa account giáo viên. Các operation schema status là canonical; nếu diễn giải mô tả nghiệp vụ cần trạng thái chưa có enum, thêm ADR + migration + DTO + UI map, không phát minh riêng ở frontend.
