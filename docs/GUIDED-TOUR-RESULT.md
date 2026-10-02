# EduManage — nghiệm thu hướng dẫn sử dụng

Ngày nghiệm thu: 02/10/2026. Hạng mục riêng sau checkpoint core `7d13565d6104c3b8e02117cc8d73c2fbfb772d1c`.

```text
EDUMANAGE_GUIDED_TOUR_RESULT
TOURS_IMPLEMENTED=platform-overview,school-overview,teacher-overview,class-homeroom,class-subject,class-staff,parent-overview
AUTO_START=PASS
SKIP_AND_REPLAY=PASS
STAFF_PROGRESS_CROSS_BROWSER=PASS
PARENT_NO_ACCOUNT_OR_TOKEN_STORAGE=PASS
PERMISSION_SCOPE_AND_CLEANUP=PASS
BUSINESS_WRITES_BY_TOUR=NONE
RESPONSIVE_KEYBOARD=PASS; school 320/390/768/1440; parent 390/768/1440; representative class 390
SOURCE_COMMIT=commit chứa báo cáo này; SHA cụ thể được xác minh sau push và ghi trong bàn giao
RUNNING_BUILD=tour-20261002-5d5e8f927976
LOCAL_URL=http://127.0.0.1:18763
BLOCKERS=NONE trong phạm vi hạng mục
PRODUCTION_DEPLOYED=NO
```

## Chức năng đã nghiệm thu

Lời mời chỉ xuất hiện khi session, không gian, quyền và DOM sẵn sàng; spotlight bắt đầu sau khi người dùng bấm Bắt đầu. Tối đa một lời mời tự động mỗi phiên. Tour lớp mở thủ công từ Hướng dẫn lớp này. Trợ giúp → Xem lại hướng dẫn luôn cho phép xem lại khi trang sẵn sàng và không có thao tác đang làm.

Bỏ qua, × và Esc lưu skipped; chỉ Hoàn tất lưu completed. Xem lại không hạ completed. Đổi route/context, logout hoặc mất target chỉ dọn tour, không ghi trạng thái kết thúc tự nguyện. Form chưa lưu, thao tác đang gửi và modal/menu đang mở chặn khởi động. Nút trong tour không thực hiện nghiệp vụ; nền và target bị chặn tương tác.

Nhân sự dùng GET/PUT `/api/v1/me/onboarding`, session/CSRF/contract hiện có và migration tiến `056-personal-onboarding-progress.sql`. Khóa theo owner, trường hoặc PLATFORM, loại tour và version; server kiểm membership còn hiệu lực, quyền và whitelist. PostgreSQL unique/upsert giữ completed khi PUT lặp hoặc đồng thời; RLS giới hạn owner. Progress không cấp quyền. GVBM không có bước công bố cả lớp; nhiệm vụ được lấy từ lớp đang mở.

Phụ huynh chỉ dùng cờ `edu:onboarding:parent-overview:v1` với giá trị skipped/completed. Tour không lưu token, link, ID học sinh hoặc hồ sơ; không tạo account/endpoint ghi cho parent. Preview của nhân sự không thay cờ parent. Trình duyệt khác hoặc xóa bộ nhớ có thể được mời lại. Nếu localStorage bị chặn, chỉ ghi nhớ trong bộ nhớ phiên. Nếu PUT nhân sự lỗi, tour đóng ngay, ghi nhớ phiên và báo chưa đồng bộ; máy khác có thể còn lời mời.

Registry có tối đa bảy bước; bỏ bước không có target thật hoặc không thuộc quyền. Trên điện thoại, menu hiện có được mở an toàn; phần bị che được lọc, nên số bước có thể ít hơn desktop. Có giới hạn chờ target, cleanup listener/inert, focus trap/restore, tên truy cập và reduced motion. Không thay layout, không thêm dịch vụ hoặc tracking.

Driver.js được pin `1.8.0`, giấy phép MIT; engine nạp khi cần ở client. Căn cứ API: [configuration](https://driverjs.com/docs/configuration), [async tour](https://driverjs.com/docs/async-tour), [installation](https://driverjs.com/docs/installation). Accessibility và persistence được triển khai/kiểm tra riêng trong ứng dụng.

## Kiểm thử đã chạy

| Phạm vi | Lệnh hoặc nhóm kiểm tra | Kết quả |
| --- | --- | --- |
| Frontend typecheck | `npm run typecheck` | PASS |
| Frontend lint | `npm run lint` | PASS; 0 lỗi, 1 cảnh báo có sẵn ở global-error.tsx về Link |
| Frontend build | `npm run build` và Docker web build | PASS |
| Frontend unit | `npx vitest run tests/unit/onboarding.test.ts tests/unit/api-session.test.ts tests/unit/api-parent-session.test.ts tests/unit/api-query-boundary.test.ts tests/unit/api-scope-guard.test.ts` | 33/33 PASS; sáu ca onboarding chạy lại sau sửa lọc target cũng PASS |
| Backend build/lint | `npm run build`, `npm run lint` trong backend | PASS |
| Backend unit | `npm test` trong backend | 30/30 PASS |
| Contract | `npm run test:contract` trong backend | 47/47 PASS |
| PostgreSQL thật | runner Docker test, foundation với pattern TOUR/B5/BE01/BE03/BE04/BE05/BE06 | 9/9 PASS |
| Browser thật | `npx playwright test tests/e2e/guided-tour.spec.ts --workers=1 --reporter=list` trên Microsoft Edge | 11/11 PASS, 39.2 giây ở lượt cuối |

Pattern PostgreSQL: `^(TOUR|B5 all|BE01 migration|BE03 no-tenant|BE04 bootstrap|BE05 HOMEROOM|BE06 revoked)`. Kiểm tra owner, scope nhiều trường, duty lớp khác, membership bị thu hồi, CSRF, version sai, unique/upsert đồng thời và completed không bị hạ. Chạy trên database kiểm thử riêng hiện có.

Browser kiểm tra login → workspace → lớp → đọc dữ liệu/kết quả đã công bố → link parent hợp lệ; skip/replay/complete ở các vai trò; phiên thứ hai; dirty form; cleanup route/logout; target mất; PUT lỗi; localStorage bị chặn; link parent invalid. Request receipt thực chỉ có PUT progress ngoài các request tạo/kết thúc session đăng nhập. Không có lỗi JavaScript, không có request ghi nghiệp vụ do tour, không tạo fixture nghiệp vụ mới. Accessibility axe, Tab/Shift+Tab/Esc, focus restore và reduced motion được kiểm tra trên tour đại diện. Lượt đầu đã kiểm lời mời của user chưa có progress; lượt cuối giữ nguyên progress và kiểm không mời lại, không reset trạng thái để làm đẹp kết quả.

Log, receipt và ảnh nghiệm thu nằm trong `.secrets/local`, không đưa vào Git. Không chạy lại full audit, restore hoặc load toàn CMS.

## Docker và nguồn bàn giao

API, worker và web đang dùng tag `tour-20261002-5d5e8f927976`; readiness trả cùng build. Gateway tiếp tục bind `127.0.0.1:18763`. Chỉ rebuild/recreate dịch vụ ứng dụng bị ảnh hưởng, giữ database, volume và secret. Migration 056 đã chạy thành công một lần; các migration cũ giữ nguyên byte/checksum.

Build-input SHA-256: `5d5e8f92797669b52e2e42d791b4113566e22762f94f2444f31bbfbdac4f056e`. Manifest ghi baseline HEAD và source DIRTY lúc build, vì feature chưa commit khi chạy test. Bàn giao đối chiếu working tree và Git index với manifest; chỉ chấp nhận CRLF→LF theo .gitattributes cho text, SQL giữ nguyên byte. Tests và báo cáo không nằm trong build inputs. Không đổi tag runtime thành SHA commit mới.

Repository: https://github.com/cuongdesignnb/edu. Branch: `codex/new-machine-audit-20261002`. Chỉ stage source, migration, contract, dependency lock, test và báo cáo này. Các bằng chứng riêng còn thay đổi từ core được giữ tại máy; không commit env, secret, token, dump, backup, private upload hoặc log riêng. Chưa deploy production.
