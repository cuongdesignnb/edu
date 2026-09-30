# 08 — Tệp riêng, công việc nền, import và báo cáo

## Files

Metadata app.files, binary volume private_files dưới `/data/uploads/{schoolId}/{randomObjectId}` do server tạo. Không lưu Base64 binary trong JSON/PG; không dùng originalName/path từ request để open filesystem. Không expose /uploads trên Nginx. Authorization theo file_link/source và principal, không chỉ biết UUID.

Mặc định cho JPG/PNG/WebP để minh chứng (decode/re-encode bỏ EXIF), PDF tài liệu và CSV/XLSX import. Cấm HTML/SVG/script/exe/archive tùy ý. Max25MiB/file, ảnh max 20 MP, import max 10 MB/5.000 rows (mục tiêu khởi đầu điều chỉnh có phép). XLSX zip không được giải nén vô hạn; cap uncompressed bytes, sheet/cell count, không execute formula/external links. Signature+MIME+parser đều kiểm; không tin browser Content-Type [S6].

Upload trạng thái QUARANTINED → AVAILABLE hoặc REJECTED; thời gian xử lý phụ thuộc parser. Không tuyên bố virus sạch nếu chưa có scanner. Bản local có thể file-scan adapter bypass chỉ **được ghi rõ “not scanned”**, không đưa dữ liệu thật vào. Production phải chọn scanner/sandbox được duyệt hoặc giới hạn upload hình ảnh re-encode và không mở PDF/XLSX từ nguồn không tin cậy; đây là production gate, không thêm public virus API làm lộ hồ sơ học sinh.

Chỉ AVAILABLE mới gắn vào publication/tải; ghi business association sau kiểm quyền. Hết quota/disk stop upload503/422 có hướng dẫn, không corrupt file. Staging tempfile rồi atomic rename; orphan GC theo grace24 giờ, chỉ xóa file không còn reference/retention, không sweeper mù mọi archive.

## Job queue trên PostgreSQL

`app.outbox_events` ghi cùng transaction nghiệp vụ. Worker enumerate active schools từ metadata, đặt tenant trên từng transaction; không dùng postgres/bypass để quét tất cả payload. Claim jobs `SELECT FOR UPDATE SKIP LOCKED`, đặt lease_owner UUID và lease_until, COMMIT trước làm việc dài. TTL đề xuất60 giây, renew với ownership, worker concurrency2, poll1–2 giây có backoff. Không giữ DBtransaction chờ SMTP/export.

Handler kiểm idempotency,dedupe, expected source version và authorization nếu hành động do nhân sự lên lịch. Ack phải đúng lease_owner, owner mất lease không đánh DONE. Retry exponential + jitter (tối đa5), DEAD/FAILED visible với error code sanitized. Crash sau sideeffect trước ack không nhân đôi publication/file rows; email có thể bị gửi lại ở ranh giới SMTP—không hứa exactly-once, dùng Message-ID ổn định và lưu trạng thái.

`identity.mail_outbox` phục vụ email identity không có school. Payload chứa invite/reset rawtoken phải AES-256-GCM encrypt bằng mail_key có key version, xóa payload sau gửi/hết hạn; không ghi token plaintext vào DB/log. SMTP credential khác mail encryption key. Local driver ghi file vào `/data/mail`, nhãn LOCAL_FILE/không gửi Internet; đọc bằng CLI được phép, không dashboard công khai.

## Imports

Server upload → parse → mapping → validate → preview → commit theo batch. Lưu app.import_jobs/import_rows chứa source row/canonical/errors; không gộp người vì trùng tên. Identifier học sinh/giáo viên rõ; chế độ mặc định thêm hoặc cập nhật **do người dùng chọn**, không replace/delete cả lớp.

Preview hash gồm file hash+mapping+target year+existing-data version; commit stale phải validate lại. Batch lỗi được hiển thị từng dòng, chính sách all-or-nothing cho lớp nhỏ, từng chunktransaction với trạng thái partial rõ khi >500 rows. `source_key` ổn định chống nhập lại; samefile với mappingkhác phải review, không auto silent skip. Đổi tên trường trongfile không được đổi school tenant.

Import teacher tạo hồ sơ/lời mời có rate limit, không gửi5.000 email trong request. Import CSV cell beginning =,+,-,@,… phải xử lý formula injection khi xuất lại lỗi; không execute.

## Exports và PDF

Small report đọc SQL scoped; export job202 tạo nội dung vào file private. Worker kiểm requester còn quyền, filters từ allowlist và school/class/năm, không nhận raw SQL hay arbitrary remote HTML. Với report “đã công bố” pin publication revisions để snapshot nhất quán. Tổng hợp nháp gắn asOf/nguồn và thời điểm đọc, không giả official.

CSV/XLSX dùng streaming giới hạn bộ nhớ. PDFKit render template A4 có font Unicode hỗ trợ tiếng Việt đúng giấy phép; embed font vào PDF, nhưng không lấy font từ container ChatGPT để chia sẻ. Header trường/năm, footers sốtrang, cột đọc được, page-break ổn định. Tệp sinh server statusREADY, download permission kiểm lại dù job trước đây hợp lệ. TTL export đề xuất24 giờ, không lưu vô hạn.

Parent không được dùng staff export URL. Muốn chia sẻ một báo cáo cá nhân phải có parent_document_items gắn student/year/section/publication, allowDownload=true. Không tách một file cả lớp bằng CSS để tưởng đã chỉ có một học sinh.
