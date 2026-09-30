# Ánh xạ toàn bộ sitemap frontend → backend

Giữ nguyên ID và URL frontend từ bộ handoff đã giao. Nhiều trang dùng chung API. Không phải mỗi UI state cần endpoint riêng. `not_started` không phải xác nhận source hiện tại chưa làm; Agent phải audit repo thực trước.

| ID | Màn hình | Route frontend | operationId phải nối |
|---|---|---|---|
| AU01 | Đăng nhập nhân sự | `/login` | `getCsrf`, `login`, `getMyContext` |
| AU02 | Quên mật khẩu | `/forgot-password` | `getCsrf`, `forgotPassword` |
| AU03 | Đặt lại mật khẩu | `/reset-password` | `getCsrf`, `resetPassword` |
| AU04 | Nhận lời mời nhân sự | `/invitations/:inviteId` | `getCsrf`, `inspectInvitation`, `acceptInvitation`, `declineInvitation` |
| AU05 | Chọn không gian làm việc | `/choose-school` | `getMyContext` |
| AU06 | Hồ sơ cá nhân nhân sự | `/account/profile` | `getMyProfile`, `updateMyProfile` |
| AU07 | Bảo mật và phiên demo | `/account/security` | `logout`, `changePassword`, `listMySessions`, `revokeMySession` |
| AU08 | Chưa được phân công / bị thu hồi quyền | `/account/no-access` | `getMyContext` |
| AU09 | Trung tâm thông báo nhân sự | `/notifications` | `listMyNotifications`, `readMyNotification` |
| AU10 | Hướng dẫn sử dụng | `/help` | Nội dung hướng dẫn được version cùng frontend, không cần backend CRUD. |
| PL01 | Tổng quan nền tảng | `/platform` | `getPlatformOverview`, `listPlatformSchools` |
| PL02 | Danh sách trường | `/platform/schools` | `listPlatformSchools`, `setSchoolStatus` |
| PL03 | Tạo trường | `/platform/schools/new` | `createSchool`, `inviteSchoolAdmin` |
| PL04 | Hồ sơ trường | `/platform/schools/:schoolId` | `getPlatformSchool`, `updatePlatformSchool`, `setSchoolStatus` |
| PL05 | Quản trị trường | `/platform/schools/:schoolId/admins` | `listSchoolAdmins`, `inviteSchoolAdmin`, `revokeSchoolAdmin` |
| PL06 | Yêu cầu hỗ trợ | `/platform/support` | `listPlatformTickets` |
| PL07 | Chi tiết yêu cầu hỗ trợ | `/platform/support/:ticketId` | `getPlatformTicket`, `updatePlatformTicket`, `listPlatformTicketMessages`, `postPlatformTicketMessage` |
| PL08 | Quyền hỗ trợ tạm thời | `/platform/support-access` | `listPlatformSupportAccess` |
| PL09 | Nhật ký nền tảng | `/platform/audit` | `listPlatformAudit` |
| PL10 | Tình trạng vận hành | `/platform/operations` | `listOperations` |
| PL11 | Cấu hình nền tảng | `/platform/settings` | `getPlatformSettings`, `updatePlatformSettings` |
| SC01 | Tổng quan trường | `/school/:schoolId` | `getSchoolOverview` |
| SC02 | Thông tin và nhận diện trường | `/school/:schoolId/profile` | `getSchoolProfile`, `updateSchoolProfile`, `uploadFile` |
| SC03 | Danh sách năm học | `/school/:schoolId/academic-years` | `listYears`, `createYear`, `getYear`, `updateYear` |
| SC04 | Thiết lập năm học | `/school/:schoolId/academic-years/new` | `listYears`, `createYear`, `getYear`, `updateYear` |
| SC05 | Chi tiết năm học | `/school/:schoolId/academic-years/:yearId` | `listYears`, `createYear`, `getYear`, `updateYear`, `listTerms`, `createTerm`, `getTerm`, `updateTerm`, `listWeeks`, `createWeek`, `getWeek`, `updateWeek`, `activateYear` |
| SC06 | Học kỳ, tuần và ngày nghỉ | `/school/:schoolId/academic-years/:yearId/calendar` | `listTerms`, `createTerm`, `getTerm`, `updateTerm`, `listWeeks`, `createWeek`, `getWeek`, `updateWeek`, `listCalendarEvents`, `createCalendarEvent`, `getCalendarEvent`, `updateCalendarEvent`, `publishCalendarEvent` |
| SC07 | Kết thúc năm và chuẩn bị năm mới | `/school/:schoolId/academic-years/:yearId/rollover` | `archiveYear`, `createRollover`, `getRollover`, `validateRollover`, `commitRollover` |
| SC08 | Danh mục khối, môn, phòng | `/school/:schoolId/dictionaries` | `listDictionary`, `createDictionary`, `updateDictionary` |
| SC09 | Danh sách lớp | `/school/:schoolId/classes` | `listClasss`, `createClass`, `getClass`, `updateClass`, `activateClass`, `archiveClass` |
| SC10 | Danh sách giáo viên | `/school/:schoolId/teachers` | `listMembers`, `suspendMember`, `reactivateMember`, `listInvitations`, `inviteStaff`, `revokeInvitation` |
| SC11 | Hồ sơ và phân công giáo viên | `/school/:schoolId/teachers/:memberId` | `getMember`, `updateMember`, `suspendMember`, `reactivateMember`, `revokeGrant`, `listAssignments`, `revokeAssignment` |
| SC12 | Ma trận phân công | `/school/:schoolId/assignments` | `previewGrant`, `createGrant`, `listAssignments`, `createAssignment`, `revokeAssignment` |
| SC13 | Mẫu quyền nhà trường | `/school/:schoolId/roles` | `listRoles`, `createRole` |
| SC14 | Chi tiết mẫu quyền | `/school/:schoolId/roles/:roleId` | `getRole`, `updateRole`, `previewGrant`, `createGrant`, `revokeGrant` |
| SC15 | Bàn giao giáo viên chủ nhiệm | `/school/:schoolId/handovers` | `listHandovers`, `createHandover`, `approveHandover` |
| SC16 | Danh sách học sinh | `/school/:schoolId/students` | `listStudents` |
| SC17 | Thêm học sinh | `/school/:schoolId/students/new` | `createStudent`, `createEnrollment` |
| SC18 | Hồ sơ học sinh | `/school/:schoolId/students/:studentId` | `getStudent`, `listStudentEnrollments`, `createGuardian`, `listRelationships`, `createRelationship`, `issueParentAccess` |
| SC19 | Sửa học sinh | `/school/:schoolId/students/:studentId/edit` | `getStudent`, `updateStudent` |
| SC20 | Chuyển lớp và trạng thái theo học | `/school/:schoolId/transfers` | `createEnrollment`, `listTransfers`, `createTransfer`, `approveTransfer`, `rejectTransfer` |
| SC21 | Người giám hộ | `/school/:schoolId/guardians` | `listGuardians`, `createGuardian` |
| SC22 | Quan hệ và quyền nhận thông tin | `/school/:schoolId/guardians/:guardianId` | `getGuardian`, `updateGuardian`, `listRelationships`, `createRelationship`, `verifyRelationship`, `revokeRelationship` |
| SC23 | Quyền tra cứu phụ huynh | `/school/:schoolId/parent-access` | `listParentAccess`, `issueParentAccess` |
| SC24 | Chi tiết quyền tra cứu | `/school/:schoolId/parent-access/:accessId` | `getParentAccess`, `revokeParentAccess`, `reissueParentAccess`, `listParentAccessEvents` |
| SC25 | Xem trước trang phụ huynh | `/school/:schoolId/parent-access/:accessId/preview` | `previewParent` |
| SC26 | Trung tâm nhập dữ liệu | `/school/:schoolId/imports` | `listImports` |
| SC27 | Nhập danh sách bằng file | `/school/:schoolId/imports/new` | `uploadFile`, `createImport`, `validateImport`, `listImportRows`, `commitImport` |
| SC28 | Kết quả nhập | `/school/:schoolId/imports/:importId` | `getImport`, `listImportRows`, `cancelImport`, `downloadImportErrors` |
| SC29 | Nội quy và phiên bản | `/school/:schoolId/conduct-rules` | `listRuleSets`, `createRuleSet` |
| SC30 | Soạn bộ nội quy | `/school/:schoolId/conduct-rules/:ruleSetId` | `createRuleSet`, `getRuleSet`, `updateRuleSet`, `issueRuleSet`, `simulateRules` |
| SC31 | Quy trình chốt và công bố | `/school/:schoolId/publication-policy` | `getSchoolSettings`, `updateSchoolSettings` |
| SC32 | Lịch toàn trường | `/school/:schoolId/timetable` | `listSchoolLessons`, `createTimetable`, `validateTimetable`, `publishTimetable` |
| SC33 | Thông báo nhà trường | `/school/:schoolId/announcements` | `listSchoolAnnouncements`, `createSchoolAnnouncement`, `getSchoolAnnouncement`, `updateSchoolAnnouncement`, `publishSchoolAnnouncement`, `scheduleSchoolAnnouncement`, `withdrawSchoolAnnouncement` |
| SC34 | Soạn thông báo trường | `/school/:schoolId/announcements/new` | `listSchoolAnnouncements`, `createSchoolAnnouncement`, `getSchoolAnnouncement`, `updateSchoolAnnouncement`, `publishSchoolAnnouncement`, `scheduleSchoolAnnouncement`, `withdrawSchoolAnnouncement` |
| SC35 | Chi tiết thông báo trường | `/school/:schoolId/announcements/:announcementId` | `listSchoolAnnouncements`, `createSchoolAnnouncement`, `getSchoolAnnouncement`, `updateSchoolAnnouncement`, `publishSchoolAnnouncement`, `scheduleSchoolAnnouncement`, `withdrawSchoolAnnouncement` |
| SC36 | Trung tâm rà soát và công bố | `/school/:schoolId/publications` | `listSchoolPublications`, `withdrawPublication` |
| SC37 | Trung tâm báo cáo trường | `/school/:schoolId/reports` | `getSchoolReport` |
| SC38 | Xem báo cáo trường | `/school/:schoolId/reports/:reportType` | `getSchoolReport`, `createExport` |
| SC39 | Các bản xuất dữ liệu | `/school/:schoolId/exports` | `listExports`, `createExport`, `getExport`, `downloadExport`, `cancelExport` |
| SC40 | Nhật ký nhà trường | `/school/:schoolId/audit` | `listSchoolAudit` |
| SC41 | Cài đặt hiển thị và chia sẻ | `/school/:schoolId/settings` | `getSchoolSettings`, `updateSchoolSettings` |
| SC42 | Hỗ trợ và ủy quyền hỗ trợ | `/school/:schoolId/support` | `listSchoolTickets`, `createTicket`, `listSchoolSupportAccess`, `createSupportAccess` |
| SC43 | Chi tiết hỗ trợ của trường | `/school/:schoolId/support/:ticketId` | `getSchoolTicket`, `listSchoolMessages`, `postSchoolMessage`, `listSchoolSupportAccess`, `createSupportAccess`, `approveSupportAccess`, `revokeSupportAccess` |
| TE01 | Việc cần làm của giáo viên | `/teacher/:schoolId` | `getTeacherOverview` |
| TE02 | Lớp học của tôi | `/teacher/:schoolId/classes` | `listMyClasses` |
| TE03 | Lịch dạy của tôi | `/teacher/:schoolId/schedule` | `listMySchedule` |
| TE04 | Việc cần xử lý | `/teacher/:schoolId/tasks` | `listMyTasks` |
| TE05 | Thông báo dành cho giáo viên | `/teacher/:schoolId/announcements` | `listMyNotifications`, `readMyNotification`, `listTeacherAnnouncements` |
| TE06 | Báo cáo được phép | `/teacher/:schoolId/reports` | `getSchoolReport` |
| CL01 | Tổng quan lớp | `/classroom/:schoolId/:yearId/:classId` | `getClassOverview` |
| CL02 | Học sinh trong lớp | `/classroom/:schoolId/:yearId/:classId/students` | `listClassStudents` |
| CL03 | Hồ sơ học sinh trong phạm vi lớp | `/classroom/:schoolId/:yearId/:classId/students/:studentId` | `createTransfer`, `getClassStudent` |
| CL04 | Điểm danh theo ngày/tiết | `/classroom/:schoolId/:yearId/:classId/attendance` | `listAttendanceSessions`, `createAttendanceSession`, `getAttendanceSession`, `saveAttendanceRecords`, `publishAttendance`, `reopenAttendance` |
| CL05 | Chuyên cần theo tuần | `/classroom/:schoolId/:yearId/:classId/attendance/weekly` | `listAttendanceSessions`, `getAttendanceSummary` |
| CL06 | Ghi nhận thi đua | `/classroom/:schoolId/:yearId/:classId/conduct` | `createConductPeriod`, `listConductRecords`, `createConductRecord`, `updateConductRecord` |
| CL07 | Tổng hợp thi đua tuần | `/classroom/:schoolId/:yearId/:classId/conduct/weekly` | `listConductPeriods`, `createConductPeriod`, `getConductSummary` |
| CL08 | Rà soát và chốt tuần | `/classroom/:schoolId/:yearId/:classId/conduct/review` | `approveConductRecord`, `excludeConductRecord`, `reviewConductPeriod`, `lockConductPeriod`, `publishConductPeriod`, `lockAndPublishConduct` |
| CL09 | Lịch sử kết quả công bố | `/classroom/:schoolId/:yearId/:classId/publications` | `listClassPublications` |
| CL10 | Bản kết quả đã công bố | `/classroom/:schoolId/:yearId/:classId/publications/:publicationId` | `getClassPublication`, `withdrawPublication` |
| CL11 | Điều chỉnh sau chốt | `/classroom/:schoolId/:yearId/:classId/adjustments` | `listAdjustments`, `createAdjustment`, `approveAdjustment`, `rejectAdjustment`, `applyAdjustment` |
| CL12 | Nội quy áp dụng tại lớp | `/classroom/:schoolId/:yearId/:classId/rules` | `getClassRules`, `applyClassRules` |
| CL13 | Tổ và chức vụ | `/classroom/:schoolId/:yearId/:classId/groups` | `listGroups`, `createGroup`, `listPositions`, `createPosition`, `updateGroup`, `updatePosition`, `listPositionAssignments`, `endPositionAssignment`, `assignGroup`, `assignPosition` |
| CL14 | Sơ đồ lớp | `/classroom/:schoolId/:yearId/:classId/seating` | `listSeatingPlans`, `createSeatingPlan`, `getSeatingPlan`, `updateSeatingPlan`, `activateSeatingPlan` |
| CL15 | Lịch học của lớp | `/classroom/:schoolId/:yearId/:classId/timetable` | `listClassTimetables`, `createTimetable`, `getTimetable`, `updateTimetable`, `validateTimetable`, `publishTimetable` |
| CL16 | Lịch trực nhật | `/classroom/:schoolId/:yearId/:classId/duties` | `listDuties`, `createDuty`, `updateDuty`, `publishDuty` |
| CL17 | Hoạt động lớp | `/classroom/:schoolId/:yearId/:classId/activities` | `listActivities` |
| CL18 | Tạo hoạt động | `/classroom/:schoolId/:yearId/:classId/activities/new` | `createActivity`, `assignActivity` |
| CL19 | Chi tiết hoạt động | `/classroom/:schoolId/:yearId/:classId/activities/:activityId` | `getActivity`, `updateActivity`, `setParticipantStatus`, `listParticipants`, `assignActivity`, `publishActivity`, `listEvidence`, `createEvidence`, `reviewEvidence` |
| CL20 | Minh chứng của lớp | `/classroom/:schoolId/:yearId/:classId/evidence` | `listEvidence`, `createEvidence`, `reviewEvidence`, `uploadFile`, `downloadFile` |
| CL21 | Thông báo lớp | `/classroom/:schoolId/:yearId/:classId/announcements` | `listClassAnnouncements`, `createClassAnnouncement`, `getClassAnnouncement`, `updateClassAnnouncement`, `publishClassAnnouncement`, `scheduleClassAnnouncement`, `withdrawClassAnnouncement` |
| CL22 | Soạn thông báo lớp | `/classroom/:schoolId/:yearId/:classId/announcements/new` | `listClassAnnouncements`, `createClassAnnouncement`, `getClassAnnouncement`, `updateClassAnnouncement`, `publishClassAnnouncement`, `scheduleClassAnnouncement`, `withdrawClassAnnouncement` |
| CL23 | Chi tiết thông báo lớp | `/classroom/:schoolId/:yearId/:classId/announcements/:announcementId` | `listClassAnnouncements`, `createClassAnnouncement`, `getClassAnnouncement`, `updateClassAnnouncement`, `publishClassAnnouncement`, `scheduleClassAnnouncement`, `withdrawClassAnnouncement` |
| CL24 | Tệp lớp | `/classroom/:schoolId/:yearId/:classId/files` | `listClassFiles`, `uploadFile`, `getFile`, `downloadFile`, `archiveFile`, `createFileLink` |
| CL25 | Báo cáo lớp | `/classroom/:schoolId/:yearId/:classId/reports` | `getClassReport` |
| CL26 | Chi tiết báo cáo lớp | `/classroom/:schoolId/:yearId/:classId/reports/:reportType` | `getClassReport`, `createExport`, `downloadExport` |
| PA01 | Mở đường dẫn riêng | `/p/:schoolSlug/access` | `getCsrf`, `exchangeParentLink`, `getParentContext` |
| PA02 | Thông tin của con | `/p/:schoolSlug/overview` | `getParentOverview` |
| PA03 | Chuyên cần của con | `/p/:schoolSlug/attendance` | `getParentAttendance` |
| PA04 | Thi đua đã công bố của con | `/p/:schoolSlug/conduct` | `listParentConduct` |
| PA05 | Chi tiết kỳ thi đua của con | `/p/:schoolSlug/conduct/:periodId` | `getParentConduct` |
| PA06 | Lịch học của con | `/p/:schoolSlug/timetable` | `getParentTimetable` |
| PA07 | Nhiệm vụ trực nhật của con | `/p/:schoolSlug/duties` | `getParentDuties` |
| PA08 | Hoạt động của con | `/p/:schoolSlug/activities` | `listParentActivities` |
| PA09 | Chi tiết hoạt động của con | `/p/:schoolSlug/activities/:activityId` | `getParentActivity` |
| PA10 | Thông báo dành cho gia đình | `/p/:schoolSlug/announcements` | `listParentAnnouncements` |
| PA11 | Chi tiết thông báo phụ huynh | `/p/:schoolSlug/announcements/:announcementId` | `getParentAnnouncement` |
| PA12 | Giáo viên phụ trách | `/p/:schoolSlug/teachers` | `getParentTeachers` |
| PA13 | Tài liệu và báo cáo được chia sẻ | `/p/:schoolSlug/documents` | `listParentDocuments`, `downloadParentDocument` |
| PA14 | Link không sử dụng được | `/p/:schoolSlug/access-unavailable` | `getParentContext`, `endParentSession` |
| SY01 | Trang công khai trường | `/schools/:schoolSlug` | `getPublicSchool` |
| SY02 | Tin công khai của trường | `/schools/:schoolSlug/announcements/:announcementId` | `getPublicAnnouncement` |
| SY03 | Thông tin quyền riêng tư | `/privacy` | Trang chính sách cần chủ dự án duyệt, nội dung tĩnh. |
| SY04 | Điều kiện sử dụng | `/terms` | Điều kiện sử dụng tĩnh, không billing. |
| SY05 | Không có quyền | `/access-denied` | `getMyContext` |
| SY06 | Trường tạm dừng | `/school-suspended` | `getMyContext` |
| SY07 | Bảo trì mô phỏng | `/maintenance` | `healthReady` |
| SY08 | Không tìm thấy và ranh giới lỗi | `/*` | `healthReady` |
| DV01 | Chọn vai trò và kịch bản demo | `/demo` | Không đưa UI lab/demo vào API thật. |
| DV02 | Thư viện ảnh tham chiếu | `/preview/references` | Không đưa UI lab/demo vào API thật. |
| DV03 | Sitemap triển khai | `/preview/sitemap` | Không đưa UI lab/demo vào API thật. |
| DV04 | Checklist giao diện | `/preview/checklist` | Không đưa UI lab/demo vào API thật. |
| DV05 | Thư viện component | `/preview/components` | Không đưa UI lab/demo vào API thật. |
| DV06 | Trạng thái và tương tác | `/preview/states` | Không đưa UI lab/demo vào API thật. |
| DV07 | Các luồng nghiệp vụ demo | `/preview/flows` | Không đưa UI lab/demo vào API thật. |
| EX01 | Kết quả học tập tổng hợp | `/school/:schoolId/academic-results` | Mở rộng tắt mặc định, ngoài hợp đồng core. |
| EX02 | Kết quả môn được phân công | `/classroom/:schoolId/:yearId/:classId/academic-results` | Mở rộng tắt mặc định, ngoài hợp đồng core. |
| EX03 | Kết quả học tập đã công bố của con | `/p/:schoolSlug/academic-results` | Mở rộng tắt mặc định, ngoài hợp đồng core. |
