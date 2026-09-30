# QA của bộ tài liệu

Đọc HANDOFF-QA.md và static-validation.json. Có thể chạy lại `python3 qa/validate-static.py` từ môi trường có Python3 + PyYAML + Bash. Script chỉ kiểm tra cấu trúc của bộ handoff và sự hiện diện của preview đã tạo, không tự chạy lại browser screenshot, SQL hoặc Docker.

Ảnh previews được tạo bằng Chromium/Playwright từ HTML tài liệu, không phải hệ thống CMS. Các test runtime được giao trong docs/09-TEST-AND-ACCEPTANCE.md.
