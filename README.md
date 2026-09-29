# EduManage — Bộ bàn giao dựng frontend

**Mục đích:** giao bộ ảnh có tên cố định và chỉ dẫn đầy đủ cho Agent lập trình toàn bộ giao diện nền tảng trước khi làm backend.

## Dùng ngay

1. Giải nén gói ZIP. Đặt các thư mục `references/`, `docs/`, `manifests/` và file `AGENT-FRONTEND.md` vào thư mục dự án frontend mới. Giữ nguyên cấu trúc tên và đường dẫn.
2. Mở `preview/index.html` bằng trình duyệt để xem đủ ảnh đã sắp xếp, hoặc mở `preview/00-reference-contact-sheet.jpg` xem tổng quan.
3. Gửi đoạn chỉ dẫn dưới đây cho Agent. Agent đọc `AGENT-FRONTEND.md` trước, sau đó các tài liệu được liên kết.

### Đoạn gửi Agent

```text
Hãy đọc AGENT-FRONTEND.md và toàn bộ tài liệu mà file này chỉ dẫn.
Đọc trực tiếp 15 ảnh trong references/ theo manifests/reference-images.json.

Lập trình frontend EduManage mới hoàn toàn, không dùng source hay dữ liệu
của phần mềm trước. Bám phong cách và bố cục các ảnh R01–R10; các màn hình
chưa có ảnh riêng phải được dựng tiếp bằng cùng design system.

Làm đầy đủ theo docs/01-SITEMAP-AND-SCREENS.md và
 docs/02-COMPONENTS-OVERLAYS-STATES.md: màn hình, component, form, modal,
drawer, trạng thái, responsive và luồng thao tác với dữ liệu mẫu liên thông.
Không dừng ở 10 dashboard. Không chép các bảng sitemap/checklist thành menu
nghiệp vụ; chúng chỉ dùng trong UI lab nội bộ demo.

Giai đoạn này chỉ frontend + mock repository, chưa backend/database/API thật,
không thanh toán, không account phụ huynh. Giáo viên có quyền theo lớp/môn;
phụ huynh chỉ đọc thông tin đã công bố của con từ link demo riêng.

Theo đúng các sửa sai nghiệp vụ trong tài liệu thay vì chép nguyên chữ/số
mâu thuẫn của ảnh. Giữ font tiếng Việt, màu, bố cục, các card và minh họa.
Không dùng screenshot nguyên trang thay cho HTML/component.

Triển khai theo các giai đoạn trong AGENT-FRONTEND.md; kiểm thử thực tế,
chụp ảnh đối chiếu và cập nhật tiến độ bằng ID. Phần chưa làm/chưa test
phải ghi rõ, không tự đánh dấu toàn bộ hoàn tất. Không push/deploy khi
chưa có repo/đích triển khai được chủ dự án cho phép.
```

## Trong gói có gì?

| Tệp/thư mục | Mục đích |
|---|---|
| [AGENT-FRONTEND.md](AGENT-FRONTEND.md) | Chỉ dẫn chính, phạm vi, kiến trúc frontend, giai đoạn, nghiệm thu. |
| [docs/01-SITEMAP-AND-SCREENS.md](docs/01-SITEMAP-AND-SCREENS.md) | 118 mục core, 7 mục demo nội bộ, 3 mục mở rộng tắt mặc định. |
| [docs/02-COMPONENTS-OVERLAYS-STATES.md](docs/02-COMPONENTS-OVERLAYS-STATES.md) | 75 component, 34 mẫu overlay/form, 28 nhóm trạng thái. |
| [docs/03-REFERENCE-MAP-AND-CORRECTIONS.md](docs/03-REFERENCE-MAP-AND-CORRECTIONS.md) | Tên ảnh, vai trò từng ảnh và các chi tiết không được chép sai. |
| [docs/04-DESIGN-SYSTEM-AND-RESPONSIVE.md](docs/04-DESIGN-SYSTEM-AND-RESPONSIVE.md) | Màu, font, spacing, layout, responsive và khả năng truy cập. |
| [docs/05-MOCK-DATA-AND-FLOWS.md](docs/05-MOCK-DATA-AND-FLOWS.md) | Dữ liệu giả định và 12 luồng demo phải chạy. |
| [docs/06-QA-AND-DELIVERY.md](docs/06-QA-AND-DELIVERY.md) | 48 điểm nghiệm thu và bằng chứng Agent phải cung cấp. |
| [docs/BUSINESS-V2.md](docs/BUSINESS-V2.md) | Bản nghiệp vụ mới làm cơ sở, không tài liệu migration cũ. |
| [docs/PACKAGE-QA.md](docs/PACKAGE-QA.md) | Kiểm tra gói bàn giao, không phải QA ứng dụng. |
| `references/screens/` | 10 concept giao diện chính. |
| `references/planning/` | 4 ảnh sitemap/checklist/component/states. |
| `references/archive/` | 1 concept tra cứu giáo viên ban đầu, chỉ tham khảo phần hợp lệ. |
| `manifests/` | Registry JSON cho ảnh, screens, components, overlays, states; trạng thái đầu vào chưa làm. |
| [preview/index.html](preview/index.html) | Gallery offline 15 ảnh với tên đúng, không cần CDN. |
| `tools/verify_bundle.py` | Kiểm tra checksum ảnh, registry và đường dẫn tài liệu. |

## Những con số này nghĩa là gì?

15 ảnh gốc được thu thập từ các lượt thiết kế trong cuộc hội thoại: **10 concept màn hình chính + 4 bảng định hướng + 1 concept ban đầu**. Không có 118 ảnh hi-fi cho từng trang.

118 mục core là **danh mục route/view được đề xuất để triển khai frontend đầy đủ trong phạm vi nghiệp vụ mới**. Nhiều trang dùng chung component/template, chưa được thiết kế từng ảnh riêng. 7 trang nội bộ chỉ hỗ trợ demo/QA. 3 mục kết quả học tập là phần mở rộng tắt mặc định.

75 component, 34 overlay và 28 nhóm trạng thái là checklist công việc **chưa được code**. Không dùng số “84 màn hình / 18 đã thiết kế” hoặc tick Done trong ảnh planning làm báo cáo tiến độ.

Bộ này không chứa backend, code frontend đã triển khai, dữ liệu học sinh thật hay font file. Ảnh kiểm tra HTML tài liệu nghiệp vụ không phải concept giao diện ứng dụng nên không nhập vào thư viện ảnh thiết kế; contact sheet là ảnh tổng hợp xem nhanh được tạo thêm từ 15 ảnh gốc.

## Kiểm tra gói

```bash
python tools/verify_bundle.py
```

Chạy tại thư mục gói hoặc gọi script bằng đường dẫn đầy đủ. Script chỉ đọc file, không gọi mạng, không sửa/xóa dữ liệu. Kết quả PASS chỉ cho biết gói bàn giao nhất quán; không có nghĩa frontend đã được lập trình hay đạt nghiệm thu.
