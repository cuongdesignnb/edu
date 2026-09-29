# Kiểm tra gói bàn giao — không phải QA ứng dụng

## Đã kiểm tra thực tế

| Hạng mục | Kết quả |
|---|---|
| Ảnh thiết kế gốc | 15 file PNG hợp lệ, 15 SHA-256 khác nhau; không bỏ nhầm ảnh do tên `imagegen.png` trùng trước đây. |
| Phân loại | 10 concept chính, 4 planning board, 1 concept ban đầu. |
| Giữ chất lượng | Từng file đã đối chiếu byte với bản gốc đang có trong phiên; đổi tên nhưng không resize/nén lại. |
| Contact sheet | Tạo từ 15 ảnh gốc, đã xem kiểm tra trực quan; chỉ để xem nhanh. |
| Ánh xạ Markdown | 15 đường dẫn ảnh đều xuất hiện trong chỉ dẫn chính và manifest; các link nội bộ được kiểm tra tồn tại. |
| Registry route/view | 118 core + 7 nội bộ demo + 3 optional; ID và route canonical không trùng. |
| Component/overlay/state | 75 component, 34 overlay/form, 28 nhóm trạng thái; ID hợp lệ, các tham chiếu component từ screen tồn tại. |
| Trạng thái tiến độ | Tất cả đầu vào `not_started`, không khai báo đã code hoặc đã QA ứng dụng. |
| QA giao cho Agent | 48 mục nghiệm thu và 12 luồng mock; chưa được chạy vì chưa có ứng dụng. |
| Gallery HTML | Kiểm tra cấu trúc và 15 ảnh/link cục bộ tồn tại, nhóm 10/4/1 đúng. Không phụ thuộc tài nguyên mạng. |
| Font | Không kèm file font. |

## Giới hạn kiểm tra

Đã thử chạy browser để kiểm gallery. Playwright mặc định thiếu browser binary; binary Chromium có sẵn chặn truy cập `file://` theo cấu hình môi trường. Vì vậy **chưa xác nhận tương tác filter/responsive của gallery bằng browser**, không ghi PASS cho phần đó. Gallery chỉ là tiện ích xem ảnh, không phải frontend CMS.

Chưa tạo frontend CMS, chưa chạy build/lint/E2E CMS, chưa có backend, chưa triển khai production. Các trang `derived` là đặc tả cần Agent thiết kế và hiện thực hóa bằng component; chưa có ảnh riêng từng trang. Không tuyên bố 118 ảnh đã thiết kế hay 118 màn hình đã code.

Script `tools/verify_bundle.py` kiểm tra tính nhất quán của gói, không kiểm nghiệm tính an toàn hay hoạt động của một ứng dụng chưa tồn tại.
