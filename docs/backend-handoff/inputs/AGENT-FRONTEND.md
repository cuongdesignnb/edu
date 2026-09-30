# AGENT TASK — DỰNG TOÀN BỘ FRONTEND EDUMANAGE THEO BỘ THIẾT KẾ

**Ngôn ngữ sản phẩm:** Tiếng Việt.  
**Giai đoạn:** Giao diện tương tác hoàn chỉnh với dữ liệu giả định; chưa nối backend thật.  
**Tính chất:** Sản phẩm xây mới hoàn toàn. Không sử dụng source, tài khoản, database, công thức cố định hay quy trình chuyển đổi của phần mềm trước.  
**Đầu ra:** Source frontend chạy được, các trang/luồng/component đầy đủ theo registry, responsive, kết quả kiểm thử và ảnh đối chiếu. Không chỉ tạo ảnh, không chỉ tạo landing page/dashboard.

---

## 0. Đọc trước khi viết code

Đọc theo thứ tự:

1. Tài liệu này — phạm vi và cách triển khai.
2. [Nghiệp vụ sản phẩm mới](docs/BUSINESS-V2.md).
3. [Ánh xạ ảnh và các sai khác phải sửa](docs/03-REFERENCE-MAP-AND-CORRECTIONS.md).
4. [Sitemap và checklist màn hình](docs/01-SITEMAP-AND-SCREENS.md).
5. [Component, overlay, trạng thái](docs/02-COMPONENTS-OVERLAYS-STATES.md).
6. [Design system và responsive](docs/04-DESIGN-SYSTEM-AND-RESPONSIVE.md).
7. [Mock data và luồng sử dụng](docs/05-MOCK-DATA-AND-FLOWS.md).
8. [Checklist nghiệm thu](docs/06-QA-AND-DELIVERY.md).

Mở trực tiếp từng ảnh trong `references/screens/`. Không dựa vào tên file hoặc contact sheet để đo bố cục. Xem thêm bốn ảnh `planning/` để hiểu thư viện trạng thái/component, nhưng không chép chúng thành các trang nghiệp vụ khách hàng.

Tên ảnh và đường dẫn là cố định trong `manifests/reference-images.json`. Các manifest được cung cấp là **đầu vào đặc tả**, không phải code đã triển khai. Trạng thái ban đầu `not_started` có chủ ý; không đổi thành “đã hoàn tất” chỉ để bảng checklist xanh.

## 1. Mục tiêu trải nghiệm

> Mỗi trường một không gian. Nhà trường giao đúng người, đúng lớp, đúng môn. Giáo viên mở lớp được giao để làm việc hằng ngày. Phụ huynh mở đường dẫn riêng để đọc thông tin đã công bố của con, không có tài khoản.

Dựng bốn không gian độc lập về trải nghiệm: **Platform**, **School**, **Teacher + ClassWorkspace**, **Parent**. Cùng một hệ thống thiết kế, không cùng một sidebar tất cả quyền.

Mục tiêu hình thức là bám sát ngôn ngữ giao diện trong ảnh: nền xanh rất nhạt/trắng, primary xanh, text navy, card pastel, bảng gọn, minh họa giáo dục, font tiếng Việt rõ ràng. Không thay bằng dashboard mặc định của thư viện hoặc dark theme.

## 2. Ràng buộc không được đổi

- Không thanh toán, gói cước, thuê bao, công nợ, doanh thu, hóa đơn hoặc cổng thanh toán.
- Không đăng ký tự do cho nhân sự; nhân sự được trường mời/cấp quyền. Auth ở bản này chỉ mô phỏng giao diện/luồng.
- Phụ huynh không tài khoản, không đăng ký/đăng nhập/quên mật khẩu, không chat, không gửi đơn, không upload, không sửa dữ liệu. Chỉ xem qua link demo.
- Không cho parent chọn tùy ý trường/lớp/học sinh hoặc xem điểm, số điện thoại, minh chứng của người khác.
- Chức vụ lớp trưởng/tổ trưởng là dữ liệu tổ chức lớp, không tài khoản nhập liệu học sinh.
- GVCN một lớp không tự có quyền quản lý lớp khác nơi họ chỉ dạy bộ môn.
- Platform operator không mặc định được đọc mọi hồ sơ học sinh/gia đình; hỗ trợ dữ liệu có phạm vi/thời hạn do trường cho phép.
- “Đã lưu”, “Đã chốt”, “Đã công bố” là các trạng thái khác nhau. Parent chỉ thấy dữ liệu công bố và field được cấp.
- Không triển khai backend, API nghiệp vụ thật, database, worker, token bảo mật production, tích hợp email/Zalo/AI, backup máy chủ hoặc deploy hạ tầng trong task này.
- Module kết quả học tập/điểm môn và AI là mở rộng **tắt mặc định**. Không bị ảnh minh họa ép thêm vào core; EX01–EX03 chỉ triển khai sau khi chủ dự án bật rõ ràng.
- Không tạo route “Full Sitemap CMS”, “Checklist component” trong menu người dùng. Chúng chỉ thuộc UI lab nội bộ demo.

**Không tuyên bố frontend mock đã bảo mật dữ liệu.** Mọi dữ liệu gửi xuống browser có thể bị xem. Chỉ dùng dữ liệu giả; cần backend/phân quyền thật ở giai đoạn sau mới đánh giá dùng thật.

## 3. Mức độ hoàn thành được yêu cầu

Phải vượt qua mức “10 ảnh dashboard”:

- Các route/view trong `manifests/screens.json`: **118 mục core**, **7 mục demo nội bộ**, **3 mục optional tắt mặc định**.
- **75 component dùng lại**, **34 mẫu overlay/form**, **28 nhóm trạng thái** trong các manifest tương ứng.
- Những mục `reference` bám concept ảnh trực tiếp. Những mục `derived` chưa có ảnh riêng: thiết kế và code tiếp bằng design system, có dữ liệu, hành động, error/empty/loading. Không bỏ qua.
- Không tính lại component/form dùng nhiều nơi như nhiều sản phẩm độc lập. Số trên là phạm vi đặc tả, không phải số ảnh đã được duyệt hay số trang code đã hoàn thành.

Nếu môi trường không đủ để làm hết một lượt, hoàn thành theo giai đoạn và cập nhật `docs/progress.md` bằng ID còn thiếu. Không tự thu hẹp phạm vi, không bịa PASS hoặc gọi một dashboard là “toàn bộ CMS”.

## 4. Tên ảnh phải dùng

| Mã | File | Dùng làm chuẩn |
|---|---|---|
| R01 | `references/screens/01-platform-overview.png` | Tổng quan nền tảng, bảng trường, KPI vận hành. |
| R02 | `references/screens/02-school-overview.png` | Tổng quan nhà trường, thao tác nhanh, tiến độ khởi tạo. |
| R03 | `references/screens/03-academic-years-and-classes.png` | Năm học, học kỳ, lớp và drawer tạo lớp. |
| R04 | `references/screens/04-teachers-and-permissions.png` | Giáo viên, bảng nhân sự và chi tiết phân quyền. |
| R05 | `references/screens/05-teacher-my-classes.png` | Việc hôm nay, lớp giáo viên phụ trách, lịch dạy. |
| R06 | `references/screens/06-classroom-students-and-seating.png` | Roster lớp, tổ/chức vụ, sơ đồ lớp. |
| R07 | `references/screens/07-student-profile-and-parent-access.png` | Hồ sơ, giám hộ, lịch sử, quyền tra cứu. |
| R08 | `references/screens/08-attendance-and-conduct.png` | Điểm danh, ghi nhận thi đua, rà soát/chốt/công bố. |
| R09 | `references/screens/09-activities-evidence-announcements.png` | Hoạt động, minh chứng, thông báo. |
| R10 | `references/screens/10-parent-portal-overview.png` | Parent desktop và cách chuyển bố cục mobile. |
| P01 | `references/planning/11-sitemap-board.png` | Sơ đồ điều hướng; chỉ UI lab. |
| P02 | `references/planning/12-screen-checklist-board.png` | Checklist màn hình; số liệu phải tính lại theo registry. |
| P03 | `references/planning/13-component-checklist-board.png` | Danh mục component/biến thể; không sao chép tick Done. |
| P04 | `references/planning/14-ux-states-and-flows-board.png` | Trạng thái, popup, luồng; chỉ UI lab. |
| A01 | `references/archive/15-parent-teacher-directory-early-concept.png` | Chỉ cách trình bày giáo viên liên hệ; nghiệp vụ tài khoản/chat trong ảnh đã bị thay thế. |

Dữ liệu, số lượng, tên, liên hệ, vai trò và một số CTA trong ảnh là ví dụ không thống nhất. **Sửa theo nghiệp vụ, nhưng giữ thiết kế.** Tất cả ngoại lệ đã ghi ở `docs/03-REFERENCE-MAP-AND-CORRECTIONS.md`.

## 5. Stack và cấu trúc source frontend

### Lựa chọn triển khai

Nếu thư mục dự án mới chưa có stack: dùng **Next.js App Router + React + TypeScript**, Tailwind/CSS variables cho tokens, icon SVG thống nhất (ví dụ Lucide), một thư viện UI primitives có accessibility nhưng phải restyle theo ảnh. Dùng thư viện form/schema, bảng, lịch/drag-drop và biểu đồ tương thích khi cần; không tự viết lại mọi primitive.

Nếu chủ dự án đã tạo một workspace frontend phù hợp: kiểm tra `package.json`, scripts và lockfile trước, tiếp tục trong workspace đó. Đây không cho phép quay lại repo/source phần mềm cũ. Không nâng major hàng loạt, không cài một danh sách phiên bản `latest` không kiểm tra. Ghi các phiên bản thực tế đã dùng trong báo cáo.

Không cần NestJS/PostgreSQL/Docker ở giai đoạn này. Server rendering cơ bản của framework không đồng nghĩa triển khai backend nghiệp vụ; không dựng API thật hoặc kết nối dịch vụ bên ngoài để lấp chỗ mock.

### Cấu trúc gợi ý

```text
project-root/
├── AGENT-FRONTEND.md
├── references/                 # Ảnh để đọc/QA, không nhúng nguyên screenshot thành app
├── manifests/                  # Đặc tả đầy đủ từ bộ handoff
├── docs/                       # Nghiệp vụ và tài liệu triển khai
├── public/assets/              # Logo, avatar giả, minh họa hợp lệ; không dữ liệu thật
├── src/
│   ├── app/                    # Route thật theo sitemap; route groups không đổi public URL
│   ├── components/
│   │   ├── ui/                 # Primitives thống nhất
│   │   ├── layout/             # Platform/School/Teacher/Parent shells
│   │   ├── data/               # Table, filters, pagination, charts
│   │   └── domain/             # Attendance, conduct, access, seating...
│   ├── features/               # Controllers/hooks/models theo module
│   ├── lib/
│   │   ├── demo/               # DemoClock, scenarios, fixtures
│   │   ├── repositories/       # Interface + MockRepository
│   │   ├── permissions/        # Điều kiện scope mô phỏng, không bảo mật thật
│   │   ├── routing/            # Registry + tạo URL với fixture hợp lệ
│   │   └── formatters/         # Ngày, số, tên trạng thái tiếng Việt
│   └── styles/                 # Tokens + global/type scale
├── tests/                      # Unit và browser/E2E
└── package.json + lockfile
```

Các page chỉ ghép component và gọi query/command. Không một file JSX hàng nghìn dòng cho cả hệ thống. Bản table/student card/role badge phải dùng chung giữa các module. JSX không chứa các danh sách dữ liệu mẫu rải rác.

## 6. Chế độ demo và ranh giới phạm vi

Dựng `/demo` để chọn kịch bản và vai trò thử, không bắt reviewer phải nhớ email/password mẫu. Bản `/login` vẫn phải có form đẹp và các trạng thái để duyệt trải nghiệm nhân sự; không gửi xác thực thật, không lưu mật khẩu người nhập.

Dựng `/preview/sitemap`, `/preview/checklist`, `/preview/components`, `/preview/states`, `/preview/flows`, `/preview/references` để review. Các trang này có nhãn “Nội bộ demo”, tách hoàn toàn khỏi navigation khách hàng và chỉ bật khi app mode là demo. Việc tắt UI lab không làm ứng dụng thành sản phẩm production bảo mật.

Menu/context/button lấy từ **một** mô hình quyền. Mỗi grant chứa `action + school + class/subject scope + valid time`; không cộng tất cả hành động của mọi lớp thành toàn quyền trên mọi lớp.

Parent page dùng một `ParentAccessContext` giả định. Không đọc `studentId` tùy ý từ query để mở thêm học sinh. Link có hạn, scope và trạng thái trong mock. Bản này không tạo token production; đừng dùng cấu trúc URL/QR trong screenshot như đặc tả bảo mật.

## 7. Dữ liệu và tương tác phải liên thông

Đọc chi tiết trong `docs/05-MOCK-DATA-AND-FLOWS.md`. Các điều kiện tối thiểu:

- Tạo/sửa lớp cập nhật danh sách lớp, KPI và lựa chọn lớp liên quan.
- Gán/thu hồi giáo viên thay đổi danh sách “Lớp học của tôi” và mock quyền ở lần đọc/ghi tiếp theo.
- Học sinh/giám hộ có ID ổn định; không dùng tên hoặc vị trí mảng làm khóa nghiệp vụ.
- Tất cả bảng có tìm kiếm, lọc, sort, phân trang thật; lựa chọn bulk phân biệt chọn trang với chọn tất cả kết quả.
- Điểm danh có trạng thái “Chưa điểm danh”; biểu đồ và số lượng không mâu thuẫn.
- Thi đua giải trình được từng điểm; chốt/publication là snapshot, không thay theo rule mới.
- Parent preview chỉ hiển thị phần đã công bố; mutation của nhân sự không tự lộ draft.
- Tệp demo upload/preview local, báo rõ mô phỏng. CSV/XLSX tải được và có nội dung đúng; PDF dùng bản in sạch và browser save as PDF.
- Cấp link → copy/QR mở được route demo → xem đúng em → thu hồi → chặn lần đọc mới trong mock.
- Form có validate, cancel, dirty warning; save không bị gọi trùng; error không tạo toast thành công.
- Không button `href="#"`, `alert('Coming soon')`, TODO placeholder hay các action trang trí không làm việc. Với tích hợp ngoài phạm vi phải ghi “Chưa kết nối / Mô phỏng”, không giả thành công thật.

Dữ liệu chỉ lưu cục bộ demo, đề xuất IndexedDB và đồng bộ giữa tab cùng origin. Không hứa đồng bộ giữa các thiết bị khi chưa có server. Có reset demo và kịch bản lỗi deterministically.

## 8. Quy tắc thị giác

- Text, table, form, chart là component HTML có hành vi; không dùng full screenshot làm background UI, canvas một ảnh hoặc nhúng ảnh thay cho trang.
- Giữ sidebar/topbar, cấu trúc card, màu, typography, icon, khoảng cách và minh họa đúng định hướng. Đừng mặc định style của UI library.
- Toàn bộ chữ nghiệp vụ tiếng Việt UTF-8, không emoji, không mojibake. Dùng font có dấu đầy đủ, không phụ thuộc font CDN khi runtime nếu có thể local-host.
- Không đưa khung điện thoại trong R10 vào desktop thật. Code responsive riêng, dùng cùng dữ liệu.
- R01–R10 đối chiếu tại 1448 × 1086; viewport khác có thể cuộn hợp lý. Không cố co font để vừa toàn bộ nội dung vào một ảnh.
- Kiểm tra 360/390/768/1024/1448 px. Bảng/seat map có overflow nội bộ hợp lý, body không tràn ngang. Parent mobile ưu tiên đọc và thao tác nhẹ.
- Motion ngắn cho hover/focus/modal/drawer, hỗ trợ reduced motion. Không video/parallax/animation trang trí nặng trong dashboard.
- Ảnh minh họa có thể tách phần trang trí từ ảnh được cấp hoặc dùng asset tương thích; không cắt nguyên card có text/KPI để né code. Không tự tải avatar/hồ sơ người thật.

## 9. Các giai đoạn triển khai

### G0 — Kiểm kê trước khi code

Đọc tài liệu và 15 ảnh. Ghi `docs/progress.md` từ registry: mọi ID chưa thực hiện, không lấy trạng thái Done trong ảnh. Kiểm tra workspace/stack và liệt kê quyết định triển khai, không làm lại bảng nghiệp vụ cũ.

### G1 — Nền tảng UI

Tokens, font, icon, shells, route registry, mock repository, demo chooser, guards mô phỏng, các primitives và UI lab. Lúc này route còn scaffold phải ghi chưa xong, không nghiệm thu.

### G2 — Quản lý nền tảng và trường

R01–R04: dashboard, trường, năm/kỳ/khối/lớp, nhân sự, phân công, quyền, import, setup. Hoàn thành cả form/drawer/validation, không chỉ danh sách.

### G3 — Không gian giáo viên và hồ sơ

R05–R07: lớp được giao, roster, hồ sơ, giám hộ, link tra cứu, tổ/sơ đồ, chuyển lớp và bàn giao. Kiểm tra người có nhiều nhiệm vụ không được quyền chéo.

### G4 — Nghiệp vụ lớp

R08–R09: điểm danh, nội quy/thi đua, rà soát/chốt/công bố/điều chỉnh, lịch, trực nhật, hoạt động, minh chứng, thông báo, báo cáo. Các module sử dụng chung store và snapshot.

### G5 — Parent và trang công khai

R10 + phần hợp lệ A01: toàn bộ trang chỉ đọc, published-only, mobile, link unavailable, tài liệu/liên hệ. Chạy luồng publish/revoke với tab nhân sự cùng origin; không thêm account/chat.

### G6 — Hoàn thiện mọi mục derived và trạng thái

Đi hết registry core còn lại; thực hiện 75 component, 34 overlay, 28 nhóm state. UI lab là chỗ kiểm tra tương tác thật, không chỉ ảnh screenshot của component.

### G7 — Đối chiếu và bàn giao

Chạy lint/typecheck/build/unit/E2E; chụp ảnh đối chiếu 10 màn chính, responsive và form/state; cập nhật status theo bằng chứng. Chỉ đánh dấu hoàn thành khi các mục core/internal thực sự có route, dữ liệu và thao tác; optional OFF không tính lỗi thiếu core.

Mỗi giai đoạn giữ ứng dụng chạy được; review diff trước khi thay đổi lớn. Không xóa tài liệu/ảnh đầu vào. Không push/deploy vào remote hoặc hosting chưa được chủ dự án xác định và cho phép.

## 10. Điều kiện nghiệm thu không được bỏ

Đọc bảng chi tiết trong `docs/06-QA-AND-DELIVERY.md` và thực hiện test liên quan. Tối thiểu:

- Mọi ID core/internal có route/demo link hợp lệ; không 404 vô ý; chỉ trạng thái lỗi chủ đích mới có error.
- Mười màn tham chiếu chính bám bố cục, không đổi template; khác biệt nghiệp vụ được ghi.
- Không font lỗi, chữ chồng, body tràn ngang hoặc ảnh bị vỡ; table/form dùng được trên mobile.
- Hai trường và các vai trò hiển thị đúng mô phỏng; parent không có tài khoản và không đọc draft/học sinh khác qua adapter.
- Thêm/sửa/lọc/đổi trang/upload/preview/export/confirm/cancel có hiệu quả đúng; không thành công giả.
- Chốt/công bố/điều chỉnh/revoke/lịch sử đúng luồng và nhất quán xuyên màn hình.
- Unit và E2E có kết quả thực tế; nếu chưa chạy phải ghi CHƯA KIỂM TRA, không PASS.

## 11. File Agent phải bàn giao sau khi code

```text
README.md                    Cài đặt, chạy, build, test, chế độ demo và giới hạn
.env.example                 Chỉ cấu hình demo/feature flag; không secret
package.json + lockfile      Dependencies và scripts xác định
src/...                      Frontend thực
manifests/...                Giữ registry gốc; mapping route thật nếu có đổi
/docs/progress.md            ID + trạng thái + route demo + test + việc còn thiếu
/docs/implementation-report.md  Màn hình, component, luồng đã làm / chưa làm
/docs/visual-diff-report.md  So ảnh R01–R10; ngoại lệ nghiệp vụ và sai khác còn lại
/docs/test-report.md         Lệnh, kết quả, môi trường, failure chưa sửa
/docs/frontend-data-contract.md  Model/repository contract để nối backend sau
/qa/screenshots/...          Ảnh desktop/mobile/overlay/state do Agent thực sự chụp
```

README phải nói rõ: **chưa có backend thật, chưa xác thực/phân quyền bảo mật thật, chỉ dữ liệu giả, không dùng production**. Không ghi “SaaS hoàn chỉnh đã sẵn sàng vận hành” khi mới dựng UI.

### Mẫu báo cáo cuối

```text
FRONTEND_BUILD_RESULT
CORE_ITEMS_DONE=<số có bằng chứng>/118
INTERNAL_ITEMS_DONE=<số có bằng chứng>/7
OPTIONAL_ACADEMIC_RESULTS=OFF hoặc APPROVED_SCOPE
REFERENCE_SCREENS_REVIEWED=<thực tế>/10
COMPONENTS_DONE=<thực tế>/75
OVERLAYS_DONE=<thực tế>/34
STATE_GROUPS_DONE=<thực tế>/28
MOCK_FLOWS_PASS=<thực tế>/12
LINT=<PASS/FAIL/NOT_RUN>
TYPECHECK=<PASS/FAIL/NOT_RUN>
BUILD=<PASS/FAIL/NOT_RUN>
E2E=<PASS/FAIL/NOT_RUN>
VISUAL_QA=<PASS_WITH_DOCUMENTED_EXCEPTIONS/FAIL/NOT_RUN>
BACKEND_CONNECTED=NO
REAL_DATA_USED=NO
PRODUCTION_DEPLOYED=NO
BLOCKERS=<nêu rõ hoặc NONE>
```

**Bắt đầu bằng kiểm kê → dựng foundation → hoàn thiện từng giai đoạn. Không dừng ở dashboard và không thay bộ ảnh bằng một thiết kế khác.**
