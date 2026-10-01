# Frontend data contract — EduManage (bản demo)

> Cập nhật B6: ứng dụng chính đã chuyển sang `DATA_MODE=connected`, facade API và phiên cookie thật. Hiện kích hoạt 64 phương thức native (tài khoản, nền tảng, nhà trường), khớp 61/231 phương thức cũ; phần chưa nối hiển thị lỗi, không đọc fixture/IndexedDB. Các interface demo dưới đây là tài liệu baseline và chỉ còn được dùng cho test hồi quy/lab đã tắt. Cổng phụ huynh chưa kích hoạt adapter native; token intake đã chuyển sang fragment và bộ nhớ, không lưu storage/cache key. Xem `frontend-adapter-inventory.json` và `backend-implementation-report.md` để biết trạng thái thực tế. E2E PostgreSQL và nghiệm thu toàn bộ giao diện còn chờ.

Tài liệu này mô tả **hợp đồng dữ liệu phía frontend**: các model và các hàm repository mà màn hình đang gọi. Khi có backend, thay phần hiện thực bên trong `src/lib/repositories/*` bằng lời gọi API **giữ nguyên chữ ký hàm, kiểu trả về và mã lỗi**, màn hình không phải sửa. Đây **không** phải thiết kế database hay đặc tả bảo mật: bản demo chạy hoàn toàn trong trình duyệt nên mọi kiểm tra quyền ở đây chỉ để giao diện và adapter nhất quán.

## 1. Nguyên tắc chung

| Nguyên tắc | Hiện thực trong demo | Yêu cầu với backend sau này |
|---|---|---|
| Ngữ cảnh người thao tác | `Ctx = { actor, today, now }`; `actor` là `platform` / `staff` / `anonymous` (phiên demo, không phải xác thực) | Lấy từ phiên xác thực thật ở server; client không tự khai `actor` |
| Quyền | `grant = hành động × trường × lớp/môn × hiệu lực` (`src/lib/permissions/can.ts`); school role template cho hành động cấp trường; assignment cho hành động cấp lớp. Không gộp quyền của nhiều lớp thành toàn trường | Kiểm tra lại toàn bộ ở server trên mỗi lần đọc/ghi |
| Phụ huynh | Không có actor phụ huynh. Mỗi lần đọc nhận `ParentKey = { token }` (demo token) → đúng 1 học sinh × 1 trường × 1 năm, chỉ dữ liệu đã công bố và module được cấp | Token production do backend thiết kế (không dùng cấu trúc demo); thu hồi có hiệu lực ngay ở lần đọc sau |
| Ghi dữ liệu | Mỗi lệnh chạy trên bản sao DB, lưu IndexedDB rồi mới trả thành công; phát `BroadcastChannel` cho các tab cùng origin | Trả thành công chỉ sau khi commit; client nhận lỗi mạng thì giữ nháp |
| Phiên bản | Thực thể có `version`; lệnh sửa nhận `version`/`expectedVersion`, lệch → `CONFLICT` | Optimistic concurrency tương tự (ETag/version) |
| Idempotency | Ghi nhận thi đua nhận `requestId` → `sourceEventKey = manual:<requestId>`; gọi lại trả bản cũ | Idempotency key phía server |
| Nhật ký | Lệnh quan trọng ghi `AuditEvent` (người, hành động, đối tượng, trước/sau, lý do) | Nhật ký bất biến phía server |
| Thời gian | `DemoClock` cố định `2026-10-05T08:00:00+07:00`, ngày `yyyy-MM-dd`, giờ ISO `+07:00`, hiển thị `dd/MM/yyyy`, Asia/Ho_Chi_Minh | Server là nguồn thời gian |

### Mã lỗi (`RepoError.code`)

| Mã | Ý nghĩa | UI xử lý |
|---|---|---|
| `NETWORK` | Mất kết nối (mô phỏng) — **chưa lưu gì** | Toast lỗi, giữ form, cho thử lại |
| `CONFLICT` | Dữ liệu đổi sau khi mở | `ConflictDialog`, không ghi đè |
| `FORBIDDEN` | Ngoài phạm vi quyền (hoặc module phụ huynh chưa cấp: message `module`) | `DeniedState` / “chưa chia sẻ” |
| `NOT_FOUND` | Không tồn tại / không thuộc phạm vi (phụ huynh: message `invalid`) | Not found / trang link không dùng được |
| `VALIDATION` | Lỗi dữ liệu; `fieldErrors` theo field | Lỗi inline + `ErrorSummary` |
| `DUPLICATE` | Có thể trùng; `details.existing`, `details.hard` | Hộp thoại xử lý trùng (O18) |
| `LOCKED` | Kỳ đã chốt / năm lưu trữ | Hướng sang điều chỉnh sau chốt |
| `REVOKED` / `EXPIRED` | Thành viên / link bị thu hồi, hết hạn | Trang không có quyền / link không dùng được |
| `SUSPENDED` | Trường tạm dừng / lưu trữ | Trang trường tạm dừng |
| `UNVERIFIED` | Người giám hộ chưa xác minh | Chặn cấp link, hướng dẫn xác minh |
| `READ_ERROR` | Lỗi đọc (mô phỏng) | `ErrorState` + Thử lại |
| `NO_SESSION` | Chưa chọn vai trò / phiên hết | Về chọn vai trò / đăng nhập mô phỏng |

### Danh sách phân trang

`ListQuery = { q, page, pageSize, sort, dir, filters }` → `Page<T> = { items, total, page, pageSize, pageCount, allIds }`. `total` là tổng sau lọc; `allIds` cho phép “chọn tất cả kết quả lọc” khác với “chọn trang này”.

## 2. Model frontend

Định nghĩa đầy đủ ở `src/lib/model/types.ts` (`DemoDB`). Nhóm chính: `School`, `StaffUser`, `Membership`, `Invitation`, `RoleTemplate`, `Assignment`; `AcademicYear`, `Term`, `Week`, `Holiday`, `Grade`, `Subject`, `Room`, `ClassRoom`; `Student`, `Enrollment` (lịch sử theo học — chuyển lớp tạo bản ghi mới, không sửa quá khứ), `TransferRequest`, `Guardian`, `GuardianRelationship` (xác minh tách biệt với liên hệ), `ParentAccess`, `ParentAccessLog` (“link cấp cho … được mở” — không khẳng định danh tính); `ClassGroup`, `GroupMembership`, `StudentPosition` (chức vụ là dữ liệu, không phải tài khoản), `SeatingPlan` (có phiên bản, ngày hiệu lực); `Lesson`, `LessonChange`, `Duty`; `AttendanceSession` (open/saved/published), `AttendanceRecord` (5 trạng thái, có `unmarked`, `sourceEventKey`, `history`); `RuleSet` (phiên bản, hiệu lực), `ConductRecord` (pending_review/approved/rejected/void), `ConductPeriod` (open/locked/published), `PublishedSnapshot` (bất biến, gồm phiên bản nội quy), `AdjustmentRequest`; `Activity`, `ActivitySubmission`, `Evidence` (người tải là nhân sự), `FileAsset` (blob cục bộ hoặc tệp tổng hợp); `Announcement` (scope trường/khối/lớp/học sinh, draft/scheduled/published/withdrawn), `StaffNotification`; `SupportTicket`, `SupportGrant`; `AuditEvent`; `ImportJob`, `ExportJob`; `PublicationPolicy`, `SchoolSettings`, `PlatformSettings`.

## 3. Repository theo module

Mọi hàm (trừ `demoLogin`, `publicSchool`, `publicNews`, `parentRepo.*`, `simulate`) nhận `ctx: Ctx` đầu tiên. Đọc: `read()`; ghi: `write()` (xem `src/lib/repositories/core.ts`).

### sessionRepo (`session.ts`)
`demoLogin(email, password)` (mô phỏng, không lưu mật khẩu) · `me(ctx)` → user + workspaces (trường, vai trò, nhiệm vụ, có không gian nhà trường/giáo viên) · `schoolActions(ctx, schoolId)` · `updateProfile(ctx, {fullName, workPhone, bio, version})` · `invitation(ctx, inviteId)` · `respondInvitation(ctx, inviteId, accept, fullName?)` (danh tính có sẵn chỉ thêm membership) · `notifications(ctx, {unreadOnly, schoolId})` · `markNotificationsRead(ctx, ids|"all")`.

### platformRepo (`platform.ts`) — chỉ dữ liệu vận hành, không hồ sơ học sinh
`overview` · `listSchools(q)` · `school(schoolId)` · `createSchool(input)` (luôn tạo nháp, kiểm mã/slug trùng, mời quản trị đầu tiên) · `updateSchoolOps` · `changeSchoolStatus(schoolId, status, reason)` (không xóa dữ liệu; kích hoạt cần quản trị) · `inviteSchoolAdmin` · `revokeSchoolAdmin` (chặn thu hồi quản trị cuối) · `revokeInvitation` · `tickets(q)` · `ticket(id)` · `updateTicket` · `supportGrants` · `requestSupportGrant` (chỉ đề nghị; trường duyệt) · `audit(q)` · `settings` · `saveSettings`.

### schoolRepo (`school.ts`)
`context(schoolId)` · `overview(schoolId, yearId)` (KPI, tiến độ khởi tạo tính từ dữ liệu, lớp cần xử lý, việc hôm nay) · `profile`/`saveProfile` · `settings`/`saveSettings` · `years` · `yearDetail` · `createYear(input)` (tạo tuần theo học kỳ, không chuyển học sinh) · `updateTerm` (chặn chồng kỳ, không đẩy tuần đã chốt ra ngoài) · `updateWeekDeadline` · `addHoliday`/`removeHoliday` · `setYearStatus` · `rolloverPreview`/`rolloverApply` (không sửa năm nguồn) · `dictionaries` · `saveDictionaryItem` · `setDictionaryStatus` (mục có lịch sử chỉ ngừng dùng) · `classes(q)` · `classOptions` · `formOptions` · `saveClass(input)` (không có GVCN → nháp) · `setClassStatus` · `weekOf`.

### staffRepo (`staff.ts`)
`teachers(q)` · `invitations` · `member(membershipId)` · `invite(input)` (không cấp vượt quyền người mời) · `revokeInvitation` · `setMembershipStatus` (chỉ tại trường này; không tự khóa; không khóa quản trị cuối) · `setMemberRoles` · `assignmentMatrix(yearId?)` · `previewAssignment` · `assign(input)` (một GVCN mỗi lớp; một lớp chủ nhiệm mỗi GV/năm; một GV mỗi môn/lớp) · `revokeAssignment` (hiệu lực ở lần đọc/ghi sau) · `handoverPreview` · `handover` · `roles` · `role` · `saveRole` (không sửa mẫu mình đang giữ, không thêm quyền mình không có).

### studentsRepo (`students.ts`)
`list(q)` · `profile(studentId, classId?)` (chiếu trường theo quyền: bộ môn nhận bản tối giản) · `create(input)` (giám hộ nhập kèm luôn “chưa xác minh”) · `update(..., version)` · `transfers(q)` · `requestTransfer(input)` · `decideTransfer` · `guardians(q)` · `guardian(id)` · `saveGuardian(input)` (không gộp theo số điện thoại) · `setVerification(relId, verified|revoked, note)` (thu hồi quan hệ thu hồi link của quan hệ đó) · `accessList(q)` · `access(id)` · `issueAccess({relationshipId, modules, expiresOn, replaceAccessId?})` (chỉ giám hộ đã xác minh; hạn ≤ hết năm) · `revokeAccess(id, reason)` · `importPreview(classId, rows, mode)` · `importCommit(input)` (không xóa/ghi đè danh sách; nhập lại không nhân đôi) · `imports` · `importJob`.

### classroomRepo (`classroom.ts`)
`header` (tab & hành động theo đúng quyền lớp) · `overview` · `roster(opts)` (bộ môn không thấy giám hộ/link) · `groups` · `setGroup` · `setPosition` (chức vụ duy nhất) · `seating` · `saveSeating(... basedOnVersion)` (một học sinh một ghế) · `timetable(weekStart?)` · `checkLessonChange` · `saveLessonChange` (không đổi ngày đã qua; công bố bị chặn khi xung đột) · `publishLessonChange` · `deleteDraftChange` · `schoolTimetable(filter)` · `duties` · `saveDuty` · `deleteDuty` · `teacherHome` · `teacherSchedule` · `teacherTasks` · `teacherClasses` · `weekRoster` · `subjectTeachers`.

### attendanceRepo (`attendance.ts`)
`sheet(date, slot)` · `save({date, slot, entries, expectedVersion, linkConduct, reason})` (“chưa điểm danh” giữ nguyên; muộn/không phép tạo **một** ghi nhận liên kết theo `sourceEventKey`; sửa bản đã công bố cần lý do) · `publish(date, slot)` (chặn khi còn chưa điểm danh) · `weekly(weekStart?)` · `canRecordPeriod`.

### conductRepo (`conduct.ts`)
Nội quy: `ruleSets` · `ruleSet` · `newRuleSetVersion` · `saveRuleSetDraft` · `publishRuleSet` (không áp ngược, không vào tuần đã chốt) · `deleteRuleSetDraft` · `policy`/`savePolicy`. Lớp: `classRules` · `weekOptions` · `records(weekId)` · `createRecord({studentId, date, ruleId, reason, requestId, confirmDistinct?, distinctNote?})` · `updateRecord` · `review({recordIds, decision})` · `weekSummary(weekId)` (bảng chính thức hoặc bản xem trước có ghi nhận chờ) · `lock(weekId, alsoPublish)` (tạo snapshot bất biến; **không** hiện cho phụ huynh nếu chưa công bố) · `reopen` (chỉ khi đã chốt chưa công bố) · `publish(weekId)` · `snapshots` · `snapshot(id)` · `adjustments` · `requestAdjustment` · `decideAdjustment` (người đề nghị không tự duyệt; tạo bản mới đã chốt) · `publishAdjustment` (bản cũ → superseded) · `publicationCenter(weekId?)` · `simulate(ruleSet, points)`.

### activitiesRepo (`activities.ts`)
`list` · `detail` · `formOptions` · `save(input)` (mẫu số tiến độ = số học sinh được giao; không tự cộng điểm) · `setActivityStatus` · `addEvidence` (nhân sự ghi nhận; blob cục bộ; giới hạn loại/dung lượng) · `setSubmission` · `reviewEvidence` (chia sẻ phụ huynh chỉ khi duyệt và chọn chia sẻ) · `evidence` · `files` · `uploadFile` · `updateFile` · `file`.

### announcementsRepo (`announcements.ts`)
`schoolList(q)` · `classList(classId)` · `detail(id)` · `composeOptions(classId?)` · `estimate(scope, audience)` · `save(input)` (nháp / công bố / đặt lịch mô phỏng; thông báo lớp chỉ trong lớp đó) · `withdraw(id, reason)` · `deleteDraft` · `forTeacher` · `markTeacherRead` · `publicSchool(slug)` · `publicNews(slug, id)` (chỉ tin công khai).

### reportsRepo (`reports.ts`)
`schoolCatalog` · `school(type, params)` · `classCatalog` · `classReport(type, params)` · `teacherCatalog` · `exports` · `recordExport(input)` (tệp CSV/XLSX tạo ở client) · `cancelExport`. `ReportData` gồm KPI, biểu đồ có mẫu số, cột, dòng (`_href` để drill-down), ghi chú, thời điểm tạo.

### supportRepo (`support.ts`) — phía nhà trường
`overview` · `ticket` · `createTicket` · `addUpdate` · `decideGrant(approve|decline|revoke)` · `audit(q)` (chỉ đọc).

### parentRepo (`parent.ts`) — không có tài khoản
`open(key, slug)` · `logView` · `context` · `overview` · `attendance(month)` · `conductList` · `conductDetail(periodId)` · `timetable(weekStart)` · `duties` · `activities` · `activity(id)` · `announcements(q)` · `announcement(id)` · `teachers` · `documents` · `file(id)`. Mọi hàm xác thực lại link ở từng lần đọc; chỉ trả dữ liệu đã công bố của đúng học sinh và module được cấp. `ParentKey` dạng `{ preview: { ctx, accessId } }` dùng cho xem trước nội bộ (kiểm quyền nhân sự).

### searchRepo (`search.ts`)
`search(q, schoolId?)` — chỉ trong phạm vi được phân công.

## 4. Điểm cần backend quyết định (chưa làm trong frontend)

Xác thực/phiên thật, thiết kế token link phụ huynh, lưu tệp và quét mã độc, gửi email/Zalo, chạy nền cho “đặt lịch công bố”, sao lưu/khôi phục, chính sách lưu giữ và xóa dữ liệu cá nhân, đồng bộ đa thiết bị, giới hạn tần suất, nhật ký bất biến, phân quyền phía server cho từng hàm trên.
