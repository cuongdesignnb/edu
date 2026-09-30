# Backend operation and screen progress

Baseline `14dfad5`. UI status is separate from API evidence.

| operationId | screenId | Status | Evidence |
|---|---|---|---|
| healthLive |  | TESTED | B0-B1 foundation source, build/typecheck/lint exit0; qa/backend/b1-integration.log: 10/10 exit0; tests/contract/schemas.test.mjs |
| healthReady |  | TESTED | B0-B1 foundation source, build/typecheck/lint exit0; qa/backend/b1-integration.log: 10/10 exit0; tests/contract/schemas.test.mjs |
| getCsrf | AU01, AU02, AU03, AU04, PA01 | TESTED | B0-B1 foundation source, build/typecheck/lint exit0; qa/backend/b1-integration.log: 10/10 exit0; tests/contract/schemas.test.mjs |
| login | AU01 | TESTED | B0-B1 foundation source, build/typecheck/lint exit0; qa/backend/b1-integration.log: 10/10 exit0; tests/contract/schemas.test.mjs |
| logout | AU07 | TESTED | B0-B1 foundation source, build/typecheck/lint exit0; qa/backend/b1-integration.log: 10/10 exit0; tests/contract/schemas.test.mjs |
| forgotPassword | AU02 | IMPLEMENTED | B0-B1 foundation source, build/typecheck/lint exit0 |
| resetPassword | AU03 | IMPLEMENTED | B0-B1 foundation source, build/typecheck/lint exit0 |
| changePassword | AU07 | IMPLEMENTED | B0-B1 foundation source, build/typecheck/lint exit0 |
| getMyContext | AU01, AU05, AU08, SY05, SY06 | TESTED | B0-B1 foundation source, build/typecheck/lint exit0; qa/backend/b1-integration.log: 10/10 exit0; tests/contract/schemas.test.mjs |
| getMyProfile | AU06 | TESTED | B0-B1 foundation source, build/typecheck/lint exit0; qa/backend/b1-integration.log: 10/10 exit0; tests/contract/schemas.test.mjs |
| updateMyProfile | AU06 | TESTED | B0-B1 foundation source, build/typecheck/lint exit0; qa/backend/b1-integration.log: 10/10 exit0; tests/contract/schemas.test.mjs |
| listMySessions | AU07 | IMPLEMENTED | B0-B1 foundation source, build/typecheck/lint exit0 |
| revokeMySession | AU07 | IMPLEMENTED | B0-B1 foundation source, build/typecheck/lint exit0 |
| inspectInvitation | AU04 | NOT_STARTED |  |
| acceptInvitation | AU04 | NOT_STARTED |  |
| declineInvitation | AU04 | NOT_STARTED |  |
| listMyNotifications | AU09, TE05 | NOT_STARTED |  |
| readMyNotification | AU09, TE05 | NOT_STARTED |  |
| getPlatformOverview | PL01 | NOT_STARTED |  |
| listPlatformSchools | PL01, PL02 | NOT_STARTED |  |
| createSchool | PL03 | NOT_STARTED |  |
| getPlatformSchool | PL04 | NOT_STARTED |  |
| updatePlatformSchool | PL04 | NOT_STARTED |  |
| setSchoolStatus | PL02, PL04 | NOT_STARTED |  |
| listSchoolAdmins | PL05 | NOT_STARTED |  |
| inviteSchoolAdmin | PL03, PL05 | NOT_STARTED |  |
| revokeSchoolAdmin | PL05 | NOT_STARTED |  |
| listPlatformTickets | PL06 | NOT_STARTED |  |
| getPlatformTicket | PL07 | NOT_STARTED |  |
| updatePlatformTicket | PL07 | NOT_STARTED |  |
| listPlatformTicketMessages | PL07 | NOT_STARTED |  |
| postPlatformTicketMessage | PL07 | NOT_STARTED |  |
| listPlatformSupportAccess | PL08 | NOT_STARTED |  |
| listPlatformAudit | PL09 | NOT_STARTED |  |
| listOperations | PL10 | NOT_STARTED |  |
| getPlatformSettings | PL11 | NOT_STARTED |  |
| updatePlatformSettings | PL11 | NOT_STARTED |  |
| getSchoolOverview | SC01 | NOT_STARTED |  |
| getSchoolProfile | SC02 | NOT_STARTED |  |
| updateSchoolProfile | SC02 | NOT_STARTED |  |
| listYears | SC03, SC04, SC05 | NOT_STARTED |  |
| createYear | SC03, SC04, SC05 | NOT_STARTED |  |
| getYear | SC03, SC04, SC05 | NOT_STARTED |  |
| updateYear | SC03, SC04, SC05 | NOT_STARTED |  |
| listTerms | SC05, SC06 | NOT_STARTED |  |
| createTerm | SC05, SC06 | NOT_STARTED |  |
| getTerm | SC05, SC06 | NOT_STARTED |  |
| updateTerm | SC05, SC06 | NOT_STARTED |  |
| listWeeks | SC05, SC06 | NOT_STARTED |  |
| createWeek | SC05, SC06 | NOT_STARTED |  |
| getWeek | SC05, SC06 | NOT_STARTED |  |
| updateWeek | SC05, SC06 | NOT_STARTED |  |
| listCalendarEvents | SC06 | NOT_STARTED |  |
| createCalendarEvent | SC06 | NOT_STARTED |  |
| getCalendarEvent | SC06 | NOT_STARTED |  |
| updateCalendarEvent | SC06 | NOT_STARTED |  |
| listClasss | SC09 | NOT_STARTED |  |
| createClass | SC09 | NOT_STARTED |  |
| getClass | SC09 | NOT_STARTED |  |
| updateClass | SC09 | NOT_STARTED |  |
| activateYear | SC05 | NOT_STARTED |  |
| archiveYear | SC07 | NOT_STARTED |  |
| activateClass | SC09 | NOT_STARTED |  |
| archiveClass | SC09 | NOT_STARTED |  |
| publishCalendarEvent | SC06 | NOT_STARTED |  |
| listDictionary | SC08 | NOT_STARTED |  |
| createDictionary | SC08 | NOT_STARTED |  |
| updateDictionary | SC08 | NOT_STARTED |  |
| createRollover | SC07 | NOT_STARTED |  |
| getRollover | SC07 | NOT_STARTED |  |
| validateRollover | SC07 | NOT_STARTED |  |
| commitRollover | SC07 | NOT_STARTED |  |
| listMembers | SC10 | NOT_STARTED |  |
| getMember | SC11 | NOT_STARTED |  |
| updateMember | SC11 | NOT_STARTED |  |
| suspendMember | SC10, SC11 | NOT_STARTED |  |
| reactivateMember | SC10, SC11 | NOT_STARTED |  |
| listInvitations | SC10 | NOT_STARTED |  |
| inviteStaff | SC10 | NOT_STARTED |  |
| revokeInvitation | SC10 | NOT_STARTED |  |
| listRoles | SC13 | NOT_STARTED |  |
| getRole | SC14 | NOT_STARTED |  |
| createRole | SC13 | NOT_STARTED |  |
| updateRole | SC14 | NOT_STARTED |  |
| previewGrant | SC12, SC14 | NOT_STARTED |  |
| createGrant | SC12, SC14 | NOT_STARTED |  |
| revokeGrant | SC11, SC14 | NOT_STARTED |  |
| listAssignments | SC11, SC12 | NOT_STARTED |  |
| createAssignment | SC12 | NOT_STARTED |  |
| revokeAssignment | SC11, SC12 | NOT_STARTED |  |
| listHandovers | SC15 | NOT_STARTED |  |
| createHandover | SC15 | NOT_STARTED |  |
| approveHandover | SC15 | NOT_STARTED |  |
| listStudents | SC16 | NOT_STARTED |  |
| createStudent | SC17 | NOT_STARTED |  |
| getStudent | SC18, SC19 | NOT_STARTED |  |
| updateStudent | SC19 | NOT_STARTED |  |
| listStudentEnrollments | SC18 | NOT_STARTED |  |
| createEnrollment | SC17, SC20 | NOT_STARTED |  |
| listTransfers | SC20 | NOT_STARTED |  |
| createTransfer | SC20, CL03 | NOT_STARTED |  |
| approveTransfer | SC20 | NOT_STARTED |  |
| rejectTransfer | SC20 | NOT_STARTED |  |
| listGuardians | SC21 | NOT_STARTED |  |
| createGuardian | SC21, SC18 | NOT_STARTED |  |
| getGuardian | SC22 | NOT_STARTED |  |
| updateGuardian | SC22 | NOT_STARTED |  |
| listRelationships | SC18, SC22 | NOT_STARTED |  |
| createRelationship | SC18, SC22 | NOT_STARTED |  |
| verifyRelationship | SC22 | NOT_STARTED |  |
| revokeRelationship | SC22 | NOT_STARTED |  |
| listParentAccess | SC23 | NOT_STARTED |  |
| issueParentAccess | SC18, SC23 | NOT_STARTED |  |
| getParentAccess | SC24 | NOT_STARTED |  |
| revokeParentAccess | SC24 | NOT_STARTED |  |
| reissueParentAccess | SC24 | NOT_STARTED |  |
| listParentAccessEvents | SC24 | NOT_STARTED |  |
| previewParent | SC25 | NOT_STARTED |  |
| getTeacherOverview | TE01 | NOT_STARTED |  |
| listMyClasses | TE02 | NOT_STARTED |  |
| listMySchedule | TE03 | NOT_STARTED |  |
| listMyTasks | TE04 | NOT_STARTED |  |
| listTeacherAnnouncements | TE05 | NOT_STARTED |  |
| getClassOverview | CL01 | NOT_STARTED |  |
| listClassStudents | CL02 | NOT_STARTED |  |
| getClassStudent | CL03 | NOT_STARTED |  |
| listGroups | CL13 | NOT_STARTED |  |
| createGroup | CL13 | NOT_STARTED |  |
| listPositions | CL13 | NOT_STARTED |  |
| createPosition | CL13 | NOT_STARTED |  |
| listSeatingPlans | CL14 | NOT_STARTED |  |
| createSeatingPlan | CL14 | NOT_STARTED |  |
| updateGroup | CL13 | NOT_STARTED |  |
| updatePosition | CL13 | NOT_STARTED |  |
| listPositionAssignments | CL13 | NOT_STARTED |  |
| endPositionAssignment | CL13 | NOT_STARTED |  |
| assignGroup | CL13 | NOT_STARTED |  |
| assignPosition | CL13 | NOT_STARTED |  |
| getSeatingPlan | CL14 | NOT_STARTED |  |
| updateSeatingPlan | CL14 | NOT_STARTED |  |
| activateSeatingPlan | CL14 | NOT_STARTED |  |
| listAttendanceSessions | CL04, CL05 | NOT_STARTED |  |
| createAttendanceSession | CL04 | NOT_STARTED |  |
| getAttendanceSession | CL04 | NOT_STARTED |  |
| saveAttendanceRecords | CL04 | NOT_STARTED |  |
| getAttendanceSummary | CL05 | NOT_STARTED |  |
| publishAttendance | CL04 | NOT_STARTED |  |
| reopenAttendance | CL04 | NOT_STARTED |  |
| listRuleSets | SC29 | NOT_STARTED |  |
| createRuleSet | SC29, SC30 | NOT_STARTED |  |
| getRuleSet | SC30 | NOT_STARTED |  |
| updateRuleSet | SC30 | NOT_STARTED |  |
| issueRuleSet | SC30 | NOT_STARTED |  |
| simulateRules | SC30 | NOT_STARTED |  |
| getClassRules | CL12 | NOT_STARTED |  |
| applyClassRules | CL12 | NOT_STARTED |  |
| listConductPeriods | CL07 | NOT_STARTED |  |
| createConductPeriod | CL06, CL07 | NOT_STARTED |  |
| getConductSummary | CL07 | NOT_STARTED |  |
| listConductRecords | CL06 | NOT_STARTED |  |
| createConductRecord | CL06 | NOT_STARTED |  |
| updateConductRecord | CL06 | NOT_STARTED |  |
| approveConductRecord | CL08 | NOT_STARTED |  |
| excludeConductRecord | CL08 | NOT_STARTED |  |
| reviewConductPeriod | CL08 | NOT_STARTED |  |
| lockConductPeriod | CL08 | NOT_STARTED |  |
| publishConductPeriod | CL08 | NOT_STARTED |  |
| lockAndPublishConduct | CL08 | NOT_STARTED |  |
| listAdjustments | CL11 | NOT_STARTED |  |
| createAdjustment | CL11 | NOT_STARTED |  |
| approveAdjustment | CL11 | NOT_STARTED |  |
| rejectAdjustment | CL11 | NOT_STARTED |  |
| applyAdjustment | CL11 | NOT_STARTED |  |
| listSchoolPublications | SC36 | NOT_STARTED |  |
| listClassPublications | CL09 | NOT_STARTED |  |
| getClassPublication | CL10 | NOT_STARTED |  |
| withdrawPublication | SC36, CL10 | NOT_STARTED |  |
| listSchoolLessons | SC32 | NOT_STARTED |  |
| listClassTimetables | CL15 | NOT_STARTED |  |
| createTimetable | CL15, SC32 | NOT_STARTED |  |
| getTimetable | CL15 | NOT_STARTED |  |
| updateTimetable | CL15 | NOT_STARTED |  |
| validateTimetable | CL15, SC32 | NOT_STARTED |  |
| publishTimetable | CL15, SC32 | NOT_STARTED |  |
| listDuties | CL16 | NOT_STARTED |  |
| createDuty | CL16 | NOT_STARTED |  |
| updateDuty | CL16 | NOT_STARTED |  |
| publishDuty | CL16 | NOT_STARTED |  |
| listActivities | CL17 | NOT_STARTED |  |
| createActivity | CL18 | NOT_STARTED |  |
| getActivity | CL19 | NOT_STARTED |  |
| updateActivity | CL19 | NOT_STARTED |  |
| setParticipantStatus | CL19 | NOT_STARTED |  |
| listParticipants | CL19 | NOT_STARTED |  |
| assignActivity | CL18, CL19 | NOT_STARTED |  |
| publishActivity | CL19 | NOT_STARTED |  |
| listEvidence | CL20, CL19 | NOT_STARTED |  |
| createEvidence | CL20, CL19 | NOT_STARTED |  |
| reviewEvidence | CL20, CL19 | NOT_STARTED |  |
| listClassFiles | CL24 | NOT_STARTED |  |
| uploadFile | SC02, CL20, CL24, SC27 | NOT_STARTED |  |
| getFile | CL24 | NOT_STARTED |  |
| downloadFile | CL24, CL20 | NOT_STARTED |  |
| archiveFile | CL24 | NOT_STARTED |  |
| createFileLink | CL24 | NOT_STARTED |  |
| listSchoolAnnouncements | SC33, SC34, SC35 | NOT_STARTED |  |
| createSchoolAnnouncement | SC33, SC34, SC35 | NOT_STARTED |  |
| getSchoolAnnouncement | SC33, SC34, SC35 | NOT_STARTED |  |
| updateSchoolAnnouncement | SC33, SC34, SC35 | NOT_STARTED |  |
| publishSchoolAnnouncement | SC33, SC34, SC35 | NOT_STARTED |  |
| scheduleSchoolAnnouncement | SC33, SC34, SC35 | NOT_STARTED |  |
| withdrawSchoolAnnouncement | SC33, SC34, SC35 | NOT_STARTED |  |
| listClassAnnouncements | CL21, CL22, CL23 | NOT_STARTED |  |
| createClassAnnouncement | CL21, CL22, CL23 | NOT_STARTED |  |
| getClassAnnouncement | CL21, CL22, CL23 | NOT_STARTED |  |
| updateClassAnnouncement | CL21, CL22, CL23 | NOT_STARTED |  |
| publishClassAnnouncement | CL21, CL22, CL23 | NOT_STARTED |  |
| scheduleClassAnnouncement | CL21, CL22, CL23 | NOT_STARTED |  |
| withdrawClassAnnouncement | CL21, CL22, CL23 | NOT_STARTED |  |
| listImports | SC26 | NOT_STARTED |  |
| createImport | SC27 | NOT_STARTED |  |
| getImport | SC28 | NOT_STARTED |  |
| validateImport | SC27 | NOT_STARTED |  |
| listImportRows | SC27, SC28 | NOT_STARTED |  |
| commitImport | SC27 | NOT_STARTED |  |
| cancelImport | SC28 | NOT_STARTED |  |
| downloadImportErrors | SC28 | NOT_STARTED |  |
| getSchoolReport | SC37, SC38, TE06 | NOT_STARTED |  |
| getClassReport | CL25, CL26 | NOT_STARTED |  |
| listExports | SC39 | NOT_STARTED |  |
| createExport | SC38, SC39, CL26 | NOT_STARTED |  |
| getExport | SC39 | NOT_STARTED |  |
| downloadExport | SC39, CL26 | NOT_STARTED |  |
| cancelExport | SC39 | NOT_STARTED |  |
| listSchoolAudit | SC40 | NOT_STARTED |  |
| getSchoolSettings | SC31, SC41 | NOT_STARTED |  |
| updateSchoolSettings | SC31, SC41 | NOT_STARTED |  |
| listSchoolTickets | SC42 | NOT_STARTED |  |
| createTicket | SC42 | NOT_STARTED |  |
| getSchoolTicket | SC43 | NOT_STARTED |  |
| listSchoolMessages | SC43 | NOT_STARTED |  |
| postSchoolMessage | SC43 | NOT_STARTED |  |
| listSchoolSupportAccess | SC42, SC43 | NOT_STARTED |  |
| createSupportAccess | SC42, SC43 | NOT_STARTED |  |
| approveSupportAccess | SC43 | NOT_STARTED |  |
| revokeSupportAccess | SC43 | NOT_STARTED |  |
| exchangeParentLink | PA01 | NOT_STARTED |  |
| getParentContext | PA01, PA14 | NOT_STARTED |  |
| endParentSession | PA14 | NOT_STARTED |  |
| getParentOverview | PA02 | NOT_STARTED |  |
| getParentAttendance | PA03 | NOT_STARTED |  |
| listParentConduct | PA04 | NOT_STARTED |  |
| getParentConduct | PA05 | NOT_STARTED |  |
| getParentTimetable | PA06 | NOT_STARTED |  |
| getParentDuties | PA07 | NOT_STARTED |  |
| listParentActivities | PA08 | NOT_STARTED |  |
| getParentActivity | PA09 | NOT_STARTED |  |
| listParentAnnouncements | PA10 | NOT_STARTED |  |
| getParentAnnouncement | PA11 | NOT_STARTED |  |
| getParentTeachers | PA12 | NOT_STARTED |  |
| listParentDocuments | PA13 | NOT_STARTED |  |
| downloadParentDocument | PA13 | NOT_STARTED |  |
| getPublicSchool | SY01 | NOT_STARTED |  |
| getPublicAnnouncement | SY02 | NOT_STARTED |  |

| screenId | Scope | API status | UI status | Static mapping |
|---|---|---|---|---|
| AU01 | core | TESTED | NOT_STARTED |  |
| AU02 | core | IMPLEMENTED | NOT_STARTED |  |
| AU03 | core | IMPLEMENTED | NOT_STARTED |  |
| AU04 | core | PARTIAL | NOT_STARTED |  |
| AU05 | core | TESTED | NOT_STARTED |  |
| AU06 | core | TESTED | NOT_STARTED |  |
| AU07 | core | IMPLEMENTED | NOT_STARTED |  |
| AU08 | core | TESTED | NOT_STARTED |  |
| AU09 | core | PARTIAL | NOT_STARTED |  |
| AU10 | core | NOT_REQUIRED | STATIC_UNVERIFIED | Nội dung hướng dẫn được version cùng frontend, không cần backend CRUD. |
| PL01 | core | PARTIAL | NOT_STARTED |  |
| PL02 | core | PARTIAL | NOT_STARTED |  |
| PL03 | core | PARTIAL | NOT_STARTED |  |
| PL04 | core | PARTIAL | NOT_STARTED |  |
| PL05 | core | PARTIAL | NOT_STARTED |  |
| PL06 | core | PARTIAL | NOT_STARTED |  |
| PL07 | core | PARTIAL | NOT_STARTED |  |
| PL08 | core | PARTIAL | NOT_STARTED |  |
| PL09 | core | PARTIAL | NOT_STARTED |  |
| PL10 | core | PARTIAL | NOT_STARTED |  |
| PL11 | core | PARTIAL | NOT_STARTED |  |
| SC01 | core | PARTIAL | NOT_STARTED |  |
| SC02 | core | PARTIAL | NOT_STARTED |  |
| SC03 | core | PARTIAL | NOT_STARTED |  |
| SC04 | core | PARTIAL | NOT_STARTED |  |
| SC05 | core | PARTIAL | NOT_STARTED |  |
| SC06 | core | PARTIAL | NOT_STARTED |  |
| SC07 | core | PARTIAL | NOT_STARTED |  |
| SC08 | core | PARTIAL | NOT_STARTED |  |
| SC09 | core | PARTIAL | NOT_STARTED |  |
| SC10 | core | PARTIAL | NOT_STARTED |  |
| SC11 | core | PARTIAL | NOT_STARTED |  |
| SC12 | core | PARTIAL | NOT_STARTED |  |
| SC13 | core | PARTIAL | NOT_STARTED |  |
| SC14 | core | PARTIAL | NOT_STARTED |  |
| SC15 | core | PARTIAL | NOT_STARTED |  |
| SC16 | core | PARTIAL | NOT_STARTED |  |
| SC17 | core | PARTIAL | NOT_STARTED |  |
| SC18 | core | PARTIAL | NOT_STARTED |  |
| SC19 | core | PARTIAL | NOT_STARTED |  |
| SC20 | core | PARTIAL | NOT_STARTED |  |
| SC21 | core | PARTIAL | NOT_STARTED |  |
| SC22 | core | PARTIAL | NOT_STARTED |  |
| SC23 | core | PARTIAL | NOT_STARTED |  |
| SC24 | core | PARTIAL | NOT_STARTED |  |
| SC25 | core | PARTIAL | NOT_STARTED |  |
| SC26 | core | PARTIAL | NOT_STARTED |  |
| SC27 | core | PARTIAL | NOT_STARTED |  |
| SC28 | core | PARTIAL | NOT_STARTED |  |
| SC29 | core | PARTIAL | NOT_STARTED |  |
| SC30 | core | PARTIAL | NOT_STARTED |  |
| SC31 | core | PARTIAL | NOT_STARTED |  |
| SC32 | core | PARTIAL | NOT_STARTED |  |
| SC33 | core | PARTIAL | NOT_STARTED |  |
| SC34 | core | PARTIAL | NOT_STARTED |  |
| SC35 | core | PARTIAL | NOT_STARTED |  |
| SC36 | core | PARTIAL | NOT_STARTED |  |
| SC37 | core | PARTIAL | NOT_STARTED |  |
| SC38 | core | PARTIAL | NOT_STARTED |  |
| SC39 | core | PARTIAL | NOT_STARTED |  |
| SC40 | core | PARTIAL | NOT_STARTED |  |
| SC41 | core | PARTIAL | NOT_STARTED |  |
| SC42 | core | PARTIAL | NOT_STARTED |  |
| SC43 | core | PARTIAL | NOT_STARTED |  |
| TE01 | core | PARTIAL | NOT_STARTED |  |
| TE02 | core | PARTIAL | NOT_STARTED |  |
| TE03 | core | PARTIAL | NOT_STARTED |  |
| TE04 | core | PARTIAL | NOT_STARTED |  |
| TE05 | core | PARTIAL | NOT_STARTED |  |
| TE06 | core | PARTIAL | NOT_STARTED |  |
| CL01 | core | PARTIAL | NOT_STARTED |  |
| CL02 | core | PARTIAL | NOT_STARTED |  |
| CL03 | core | PARTIAL | NOT_STARTED |  |
| CL04 | core | PARTIAL | NOT_STARTED |  |
| CL05 | core | PARTIAL | NOT_STARTED |  |
| CL06 | core | PARTIAL | NOT_STARTED |  |
| CL07 | core | PARTIAL | NOT_STARTED |  |
| CL08 | core | PARTIAL | NOT_STARTED |  |
| CL09 | core | PARTIAL | NOT_STARTED |  |
| CL10 | core | PARTIAL | NOT_STARTED |  |
| CL11 | core | PARTIAL | NOT_STARTED |  |
| CL12 | core | PARTIAL | NOT_STARTED |  |
| CL13 | core | PARTIAL | NOT_STARTED |  |
| CL14 | core | PARTIAL | NOT_STARTED |  |
| CL15 | core | PARTIAL | NOT_STARTED |  |
| CL16 | core | PARTIAL | NOT_STARTED |  |
| CL17 | core | PARTIAL | NOT_STARTED |  |
| CL18 | core | PARTIAL | NOT_STARTED |  |
| CL19 | core | PARTIAL | NOT_STARTED |  |
| CL20 | core | PARTIAL | NOT_STARTED |  |
| CL21 | core | PARTIAL | NOT_STARTED |  |
| CL22 | core | PARTIAL | NOT_STARTED |  |
| CL23 | core | PARTIAL | NOT_STARTED |  |
| CL24 | core | PARTIAL | NOT_STARTED |  |
| CL25 | core | PARTIAL | NOT_STARTED |  |
| CL26 | core | PARTIAL | NOT_STARTED |  |
| PA01 | core | PARTIAL | NOT_STARTED |  |
| PA02 | core | PARTIAL | NOT_STARTED |  |
| PA03 | core | PARTIAL | NOT_STARTED |  |
| PA04 | core | PARTIAL | NOT_STARTED |  |
| PA05 | core | PARTIAL | NOT_STARTED |  |
| PA06 | core | PARTIAL | NOT_STARTED |  |
| PA07 | core | PARTIAL | NOT_STARTED |  |
| PA08 | core | PARTIAL | NOT_STARTED |  |
| PA09 | core | PARTIAL | NOT_STARTED |  |
| PA10 | core | PARTIAL | NOT_STARTED |  |
| PA11 | core | PARTIAL | NOT_STARTED |  |
| PA12 | core | PARTIAL | NOT_STARTED |  |
| PA13 | core | PARTIAL | NOT_STARTED |  |
| PA14 | core | PARTIAL | NOT_STARTED |  |
| SY01 | core | PARTIAL | NOT_STARTED |  |
| SY02 | core | PARTIAL | NOT_STARTED |  |
| SY03 | core | NOT_REQUIRED | STATIC_UNVERIFIED | Trang chính sách cần chủ dự án duyệt, nội dung tĩnh. |
| SY04 | core | NOT_REQUIRED | STATIC_UNVERIFIED | Điều kiện sử dụng tĩnh, không billing. |
| SY05 | core | TESTED | NOT_STARTED |  |
| SY06 | core | TESTED | NOT_STARTED |  |
| SY07 | core | TESTED | NOT_STARTED | Frontend boundary cho 503/maintenance; healthReady cung cấp tín hiệu. |
| SY08 | core | TESTED | NOT_STARTED | Not-found/error boundary frontend, xử lý status từ API. |
| DV01 | internal | NOT_REQUIRED | STATIC_UNVERIFIED | Không đưa UI lab/demo vào API thật. |
| DV02 | internal | NOT_REQUIRED | STATIC_UNVERIFIED | Không đưa UI lab/demo vào API thật. |
| DV03 | internal | NOT_REQUIRED | STATIC_UNVERIFIED | Không đưa UI lab/demo vào API thật. |
| DV04 | internal | NOT_REQUIRED | STATIC_UNVERIFIED | Không đưa UI lab/demo vào API thật. |
| DV05 | internal | NOT_REQUIRED | STATIC_UNVERIFIED | Không đưa UI lab/demo vào API thật. |
| DV06 | internal | NOT_REQUIRED | STATIC_UNVERIFIED | Không đưa UI lab/demo vào API thật. |
| DV07 | internal | NOT_REQUIRED | STATIC_UNVERIFIED | Không đưa UI lab/demo vào API thật. |
| EX01 | optional | NOT_REQUIRED | STATIC_UNVERIFIED | Mở rộng tắt mặc định, ngoài hợp đồng core. |
| EX02 | optional | NOT_REQUIRED | STATIC_UNVERIFIED | Mở rộng tắt mặc định, ngoài hợp đồng core. |
| EX03 | optional | NOT_REQUIRED | STATIC_UNVERIFIED | Mở rộng tắt mặc định, ngoài hợp đồng core. |
