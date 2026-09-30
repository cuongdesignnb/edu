# Backend operation and screen progress

Baseline `14dfad5`. UI status is separate from API evidence.

| operationId | screenId | Status | Evidence |
|---|---|---|---|
| healthLive |  | TESTED | B0-B1 foundation source, build/typecheck/lint exit0; qa/backend/b1-integration.log: 10/10 exit0; tests/contract/schemas.test.mjs |
| healthReady |  | TESTED | B0-B1 foundation source, build/typecheck/lint exit0; qa/backend/b1-integration.log: 10/10 exit0; tests/contract/schemas.test.mjs |
| getCsrf | AU01, AU02, AU03, AU04, PA01 | TESTED | B0-B1 foundation source, build/typecheck/lint exit0; qa/backend/b1-integration.log: 10/10 exit0; tests/contract/schemas.test.mjs |
| login | AU01 | TESTED | B0-B1 foundation source, build/typecheck/lint exit0; qa/backend/b1-integration.log: 10/10 exit0; tests/contract/schemas.test.mjs |
| logout | AU07 | TESTED | B0-B1 foundation source, build/typecheck/lint exit0; qa/backend/b1-integration.log: 10/10 exit0; tests/contract/schemas.test.mjs |
| forgotPassword | AU02 | TESTED | B0-B1 foundation source, build/typecheck/lint exit0; qa/backend/b2-integration.log; 21/21 real PostgreSQL checks |
| resetPassword | AU03 | TESTED | B0-B1 foundation source, build/typecheck/lint exit0; qa/backend/b2-integration.log; 21/21 real PostgreSQL checks |
| changePassword | AU07 | TESTED | B0-B1 foundation source, build/typecheck/lint exit0; qa/backend/b6-auth-integration.log: 83/83 PostgreSQL checks; migration028; current own context and real identity/session commands |
| getMyContext | AU01, AU05, AU08, SY05, SY06 | TESTED | B0-B1 foundation source, build/typecheck/lint exit0; qa/backend/b1-integration.log: 10/10 exit0; tests/contract/schemas.test.mjs; qa/backend/b6-auth-integration.log: 83/83 PostgreSQL checks; migration028; current own context and real identity/session commands |
| getMyProfile | AU06 | TESTED | B0-B1 foundation source, build/typecheck/lint exit0; qa/backend/b1-integration.log: 10/10 exit0; tests/contract/schemas.test.mjs; qa/backend/b6-auth-integration.log: 83/83 PostgreSQL checks; migration028; current own context and real identity/session commands |
| updateMyProfile | AU06 | TESTED | B0-B1 foundation source, build/typecheck/lint exit0; qa/backend/b1-integration.log: 10/10 exit0; tests/contract/schemas.test.mjs; qa/backend/b6-auth-integration.log: 83/83 PostgreSQL checks; migration028; current own context and real identity/session commands |
| listMySessions | AU07 | TESTED | B0-B1 foundation source, build/typecheck/lint exit0; qa/backend/b6-auth-integration.log: 83/83 PostgreSQL checks; migration028; current own context and real identity/session commands |
| revokeMySession | AU07 | TESTED | B0-B1 foundation source, build/typecheck/lint exit0; qa/backend/b6-auth-integration.log: 83/83 PostgreSQL checks; migration028; current own context and real identity/session commands |
| inspectInvitation | AU04 | TESTED | backend/src/modules; B2 TypeScript build; qa/backend/b2-integration.log; 21/21 real PostgreSQL checks; qa/backend/b6-auth-integration.log: 83/83 PostgreSQL checks; migration028; current own context and real identity/session commands |
| acceptInvitation | AU04 | TESTED | backend/src/modules; B2 TypeScript build; qa/backend/b2-integration.log; 21/21 real PostgreSQL checks |
| declineInvitation | AU04 | TESTED | backend/src/modules; B2 TypeScript build; qa/backend/b6-auth-integration.log: 83/83 PostgreSQL checks; migration028; current own context and real identity/session commands |
| listMyNotifications | AU09, TE05 | TESTED | qa/backend/notifications-integration.log: 62/62 exit0; migration022 applied/replayed; real invitation/publication/evidence producers; UI pending |
| readMyNotification | AU09, TE05 | TESTED | qa/backend/notifications-integration.log: 62/62 exit0; migration022 applied/replayed; real invitation/publication/evidence producers; UI pending |
| getPlatformOverview | PL01 | TESTED | qa/backend/platform-integration.log |
| listPlatformSchools | PL01, PL02 | TESTED | qa/backend/platform-integration.log; qa/backend/b6-platform-wizard-integration-final.log: 92/92 PostgreSQL, 30 migration checksums/replay, atomic optional first admin, current delegation/replay authority and redacted purpose-bound platform metadata |
| createSchool | PL03 | TESTED | qa/backend/platform-integration.log; qa/backend/b6-platform-wizard-integration-final.log: 92/92 PostgreSQL, 30 migration checksums/replay, atomic optional first admin, current delegation/replay authority and redacted purpose-bound platform metadata |
| getPlatformSchool | PL04 | TESTED | qa/backend/platform-integration.log |
| updatePlatformSchool | PL04 | TESTED | qa/backend/platform-integration.log |
| setSchoolStatus | PL02, PL04 | TESTED | qa/backend/platform-integration.log |
| listSchoolAdmins | PL05 | TESTED | qa/backend/platform-integration.log |
| inviteSchoolAdmin | PL03, PL05 | TESTED | qa/backend/platform-integration.log; qa/backend/b6-platform-wizard-integration-final.log: 92/92 PostgreSQL, 30 migration checksums/replay, atomic optional first admin, current delegation/replay authority and redacted purpose-bound platform metadata |
| revokeSchoolAdmin | PL05 | TESTED | qa/backend/platform-integration.log |
| listPlatformTickets | PL06 | TESTED | qa/backend/support-integration.log; qa/backend/b6-support-ui-integration-final.log: 94/94 PostgreSQL, 30 migrations, SQL support choices/states/counts, atomic message/status save, same-school own-operator consent request/relinquish, current replay revocation and actor/local-date keysets |
| getPlatformTicket | PL07 | TESTED | qa/backend/support-integration.log; qa/backend/b6-support-ui-integration-final.log: 94/94 PostgreSQL, 30 migrations, SQL support choices/states/counts, atomic message/status save, same-school own-operator consent request/relinquish, current replay revocation and actor/local-date keysets |
| updatePlatformTicket | PL07 | TESTED | qa/backend/support-integration.log; qa/backend/b6-support-ui-integration-final.log: 94/94 PostgreSQL, 30 migrations, SQL support choices/states/counts, atomic message/status save, same-school own-operator consent request/relinquish, current replay revocation and actor/local-date keysets |
| listPlatformTicketMessages | PL07 | TESTED | qa/backend/support-integration.log |
| postPlatformTicketMessage | PL07 | TESTED | qa/backend/support-integration.log |
| listPlatformSupportAccess | PL08 | TESTED | qa/backend/support-integration.log; qa/backend/b6-support-ui-integration-final.log: 94/94 PostgreSQL, 30 migrations, SQL support choices/states/counts, atomic message/status save, same-school own-operator consent request/relinquish, current replay revocation and actor/local-date keysets |
| listPlatformAudit | PL09 | TESTED | qa/backend/platform-integration.log; qa/backend/b6-support-ui-integration-final.log: 94/94 PostgreSQL, 30 migrations, SQL support choices/states/counts, atomic message/status save, same-school own-operator consent request/relinquish, current replay revocation and actor/local-date keysets |
| listOperations | PL10 | TESTED | qa/backend/platform-integration.log; 97/97 actual PostgreSQL integration, 31 migrations/checksums/replay; qa/backend/b6-school-operations-integration-final.log; backend 15/15 unit-contract; frontend 69/69 unit; UI activation/E2E still pending. |
| getPlatformSettings | PL11 | TESTED | qa/backend/platform-integration.log |
| updatePlatformSettings | PL11 | TESTED | qa/backend/platform-integration.log |
| getSchoolOverview | SC01 | TESTED | qa/backend/dashboards-integration.log; qa/backend/b6-school-overview-integration-isolated.log: 90/90 PostgreSQL checks; independent SCHOOL totals, null unavailable panels, six-row SQL preview with full count and current revocation |
| getSchoolProfile | SC02 | TESTED | backend/src/modules; B2 TypeScript build; qa/backend/support-read-integration.log; qa/backend/b6-organization-integration-final.log: 84/84 PostgreSQL checks; migration029 persisted form fields and scoped dictionary usage |
| updateSchoolProfile | SC02 | TESTED | backend/src/modules; B2 TypeScript build; qa/backend/b6-organization-integration-final.log: 84/84 PostgreSQL checks; migration029 persisted form fields and scoped dictionary usage |
| listYears | SC03, SC04, SC05 | TESTED | backend/src/modules; B2 TypeScript build; qa/backend/b2-integration.log; 21/21 real PostgreSQL checks; qa/backend/support-read-integration.log; qa/backend/b6-organization-rls-integration.log: 87/87; migration030 fast parent denial; atomic year/calendar/homeroom and authorized SQL metadata; qa/backend/b6-form-pickers-integration-final.log: 88/88 PostgreSQL checks; purpose-bound redacted write-authority pickers, immediate revocation and onDate SQL boundaries |
| createYear | SC03, SC04, SC05 | TESTED | backend/src/modules; B2 TypeScript build; qa/backend/b2-integration.log; 21/21 real PostgreSQL checks; qa/backend/b6-organization-rls-integration.log: 87/87; migration030 fast parent denial; atomic year/calendar/homeroom and authorized SQL metadata |
| getYear | SC03, SC04, SC05 | TESTED | backend/src/modules; B2 TypeScript build; qa/backend/b2-integration.log; 21/21 real PostgreSQL checks; qa/backend/support-read-integration.log; qa/backend/b6-organization-rls-integration.log: 87/87; migration030 fast parent denial; atomic year/calendar/homeroom and authorized SQL metadata |
| updateYear | SC03, SC04, SC05 | IMPLEMENTED | backend/src/modules; B2 TypeScript build |
| listTerms | SC05, SC06 | TESTED | backend/src/modules; B2 TypeScript build; qa/backend/support-read-integration.log; qa/backend/b6-organization-rls-integration.log: 87/87; migration030 fast parent denial; atomic year/calendar/homeroom and authorized SQL metadata |
| createTerm | SC05, SC06 | TESTED | backend/src/modules; B2 TypeScript build; qa/backend/b6-organization-integration-final.log: 84/84 PostgreSQL checks; migration029 persisted form fields and scoped dictionary usage |
| getTerm | SC05, SC06 | TESTED | backend/src/modules; B2 TypeScript build; qa/backend/support-read-integration.log; qa/backend/b6-organization-rls-integration.log: 87/87; migration030 fast parent denial; atomic year/calendar/homeroom and authorized SQL metadata |
| updateTerm | SC05, SC06 | TESTED | backend/src/modules; B2 TypeScript build; qa/backend/b6-organization-integration-final.log: 84/84 PostgreSQL checks; migration029 persisted form fields and scoped dictionary usage; qa/backend/b6-organization-rls-integration.log: 87/87; migration030 fast parent denial; atomic year/calendar/homeroom and authorized SQL metadata |
| listWeeks | SC05, SC06 | TESTED | backend/src/modules; B2 TypeScript build; qa/backend/support-read-integration.log; qa/backend/b6-organization-rls-integration.log: 87/87; migration030 fast parent denial; atomic year/calendar/homeroom and authorized SQL metadata; qa/backend/b6-form-pickers-integration-final.log: 88/88 PostgreSQL checks; purpose-bound redacted write-authority pickers, immediate revocation and onDate SQL boundaries |
| createWeek | SC05, SC06 | IMPLEMENTED | backend/src/modules; B2 TypeScript build |
| getWeek | SC05, SC06 | TESTED | backend/src/modules; B2 TypeScript build; qa/backend/support-read-integration.log; qa/backend/b6-organization-rls-integration.log: 87/87; migration030 fast parent denial; atomic year/calendar/homeroom and authorized SQL metadata |
| updateWeek | SC05, SC06 | TESTED | backend/src/modules; B2 TypeScript build; qa/backend/b6-organization-rls-integration.log: 87/87; migration030 fast parent denial; atomic year/calendar/homeroom and authorized SQL metadata |
| listCalendarEvents | SC06 | TESTED | backend/src/modules; B2 TypeScript build; qa/backend/b6-organization-rls-integration.log: 87/87; migration030 fast parent denial; atomic year/calendar/homeroom and authorized SQL metadata |
| createCalendarEvent | SC06 | TESTED | backend/src/modules; B2 TypeScript build; qa/backend/b6-organization-rls-integration.log: 87/87; migration030 fast parent denial; atomic year/calendar/homeroom and authorized SQL metadata |
| getCalendarEvent | SC06 | TESTED | backend/src/modules; B2 TypeScript build; qa/backend/b6-organization-rls-integration.log: 87/87; migration030 fast parent denial; atomic year/calendar/homeroom and authorized SQL metadata |
| updateCalendarEvent | SC06 | TESTED | backend/src/modules; B2 TypeScript build; qa/backend/b6-organization-rls-integration.log: 87/87; migration030 fast parent denial; atomic year/calendar/homeroom and authorized SQL metadata |
| listClasss | SC09 | TESTED | backend/src/modules; B2 TypeScript build; qa/backend/b2-integration.log; 21/21 real PostgreSQL checks; qa/backend/support-read-integration.log; qa/backend/b6-organization-rls-integration.log: 87/87; migration030 fast parent denial; atomic year/calendar/homeroom and authorized SQL metadata; qa/backend/b6-form-pickers-integration-final.log: 88/88 PostgreSQL checks; purpose-bound redacted write-authority pickers, immediate revocation and onDate SQL boundaries |
| createClass | SC09 | TESTED | backend/src/modules; B2 TypeScript build; qa/backend/b2-integration.log; 21/21 real PostgreSQL checks; qa/backend/b6-organization-rls-integration.log: 87/87; migration030 fast parent denial; atomic year/calendar/homeroom and authorized SQL metadata |
| getClass | SC09 | TESTED | backend/src/modules; B2 TypeScript build; qa/backend/b2-integration.log; 21/21 real PostgreSQL checks; qa/backend/support-read-integration.log; qa/backend/b6-organization-rls-integration.log: 87/87; migration030 fast parent denial; atomic year/calendar/homeroom and authorized SQL metadata |
| updateClass | SC09 | TESTED | backend/src/modules; B2 TypeScript build; qa/backend/b2-integration.log; 21/21 real PostgreSQL checks; qa/backend/b6-organization-integration-final.log: 84/84 PostgreSQL checks; migration029 persisted form fields and scoped dictionary usage; qa/backend/b6-organization-rls-integration.log: 87/87; migration030 fast parent denial; atomic year/calendar/homeroom and authorized SQL metadata |
| activateYear | SC05 | IMPLEMENTED | backend/src/modules; B2 TypeScript build |
| archiveYear | SC07 | TESTED | backend/src/modules; B2 TypeScript build; qa/backend/b6-organization-rls-integration.log: 87/87; migration030 fast parent denial; atomic year/calendar/homeroom and authorized SQL metadata |
| activateClass | SC09 | TESTED | backend/src/modules; B2 TypeScript build; qa/backend/b6-organization-rls-integration.log: 87/87; migration030 fast parent denial; atomic year/calendar/homeroom and authorized SQL metadata |
| archiveClass | SC09 | IMPLEMENTED | backend/src/modules; B2 TypeScript build |
| publishCalendarEvent | SC06 | IMPLEMENTED | backend/src/modules; B2 TypeScript build |
| listDictionary | SC08 | TESTED | backend/src/modules; B2 TypeScript build; qa/backend/support-read-integration.log; qa/backend/b6-organization-integration-final.log: 84/84 PostgreSQL checks; migration029 persisted form fields and scoped dictionary usage; qa/backend/b6-form-pickers-integration-final.log: 88/88 PostgreSQL checks; purpose-bound redacted write-authority pickers, immediate revocation and onDate SQL boundaries |
| createDictionary | SC08 | TESTED | backend/src/modules; B2 TypeScript build; qa/backend/b6-organization-integration-final.log: 84/84 PostgreSQL checks; migration029 persisted form fields and scoped dictionary usage |
| updateDictionary | SC08 | TESTED | backend/src/modules; B2 TypeScript build; qa/backend/b6-organization-integration-final.log: 84/84 PostgreSQL checks; migration029 persisted form fields and scoped dictionary usage |
| createRollover | SC07 | TESTED | backend/src/modules; B2 TypeScript build; qa/backend/b2-integration.log; 21/21 real PostgreSQL checks; qa/backend/b6-rollover-integration.log: 89/89 PostgreSQL checks; bounded exact end-year preview, target counts/archive filtering and current workflow authorization |
| getRollover | SC07 | IMPLEMENTED | backend/src/modules; B2 TypeScript build |
| validateRollover | SC07 | TESTED | backend/src/modules; B2 TypeScript build; qa/backend/b2-integration.log; 21/21 real PostgreSQL checks; qa/backend/b6-rollover-integration.log: 89/89 PostgreSQL checks; bounded exact end-year preview, target counts/archive filtering and current workflow authorization |
| commitRollover | SC07 | TESTED | backend/src/modules; B2 TypeScript build; qa/backend/b2-integration.log; 21/21 real PostgreSQL checks; qa/backend/b6-rollover-integration.log: 89/89 PostgreSQL checks; bounded exact end-year preview, target counts/archive filtering and current workflow authorization |
| listMembers | SC10 | TESTED | backend/src/modules; B2 TypeScript build; qa/backend/b2-integration.log; 21/21 real PostgreSQL checks; qa/backend/support-read-integration.log; qa/backend/b6-form-pickers-integration-final.log: 88/88 PostgreSQL checks; purpose-bound redacted write-authority pickers, immediate revocation and onDate SQL boundaries |
| getMember | SC11 | TESTED | backend/src/modules; B2 TypeScript build; qa/backend/support-read-integration.log |
| updateMember | SC11 | IMPLEMENTED | backend/src/modules; B2 TypeScript build |
| suspendMember | SC10, SC11 | IMPLEMENTED | backend/src/modules; B2 TypeScript build |
| reactivateMember | SC10, SC11 | IMPLEMENTED | backend/src/modules; B2 TypeScript build |
| listInvitations | SC10 | IMPLEMENTED | backend/src/modules; B2 TypeScript build |
| inviteStaff | SC10 | TESTED | backend/src/modules; B2 TypeScript build; qa/backend/b2-integration.log; 21/21 real PostgreSQL checks |
| revokeInvitation | SC10 | IMPLEMENTED | backend/src/modules; B2 TypeScript build |
| listRoles | SC13 | TESTED | backend/src/modules; B2 TypeScript build; qa/backend/support-read-integration.log |
| getRole | SC14 | TESTED | backend/src/modules; B2 TypeScript build; qa/backend/support-read-integration.log |
| createRole | SC13 | TESTED | backend/src/modules; B2 TypeScript build; qa/backend/b2-integration.log; 21/21 real PostgreSQL checks |
| updateRole | SC14 | IMPLEMENTED | backend/src/modules; B2 TypeScript build |
| previewGrant | SC12, SC14 | TESTED | backend/src/modules; B2 TypeScript build; qa/backend/b2-integration.log; 21/21 real PostgreSQL checks |
| createGrant | SC12, SC14 | TESTED | backend/src/modules; B2 TypeScript build; qa/backend/b2-integration.log; 21/21 real PostgreSQL checks |
| revokeGrant | SC11, SC14 | TESTED | backend/src/modules; B2 TypeScript build; qa/backend/b2-integration.log; 21/21 real PostgreSQL checks |
| listAssignments | SC11, SC12 | TESTED | backend/src/modules; B2 TypeScript build; qa/backend/support-read-integration.log |
| createAssignment | SC12 | TESTED | backend/src/modules; B2 TypeScript build; qa/backend/b2-integration.log; 21/21 real PostgreSQL checks |
| revokeAssignment | SC11, SC12 | TESTED | backend/src/modules; B2 TypeScript build; qa/backend/b2-integration.log; 21/21 real PostgreSQL checks |
| listHandovers | SC15 | IMPLEMENTED | backend/src/modules; B2 TypeScript build |
| createHandover | SC15 | TESTED | backend/src/modules; B2 TypeScript build; qa/backend/b2-integration.log; 21/21 real PostgreSQL checks |
| approveHandover | SC15 | TESTED | backend/src/modules; B2 TypeScript build; qa/backend/b2-integration.log; 21/21 real PostgreSQL checks |
| listStudents | SC16 | IMPLEMENTED | backend/src/modules; B2 TypeScript build |
| createStudent | SC17 | TESTED | backend/src/modules; B2 TypeScript build; qa/backend/b2-integration.log; 21/21 real PostgreSQL checks |
| getStudent | SC18, SC19 | IMPLEMENTED | backend/src/modules; B2 TypeScript build |
| updateStudent | SC19 | IMPLEMENTED | backend/src/modules; B2 TypeScript build |
| listStudentEnrollments | SC18 | TESTED | backend/src/modules; B2 TypeScript build; qa/backend/b2-integration.log; 21/21 real PostgreSQL checks |
| createEnrollment | SC17, SC20 | IMPLEMENTED | backend/src/modules; B2 TypeScript build |
| listTransfers | SC20 | IMPLEMENTED | backend/src/modules; B2 TypeScript build |
| createTransfer | SC20, CL03 | TESTED | backend/src/modules; B2 TypeScript build; qa/backend/b2-integration.log; 21/21 real PostgreSQL checks |
| approveTransfer | SC20 | TESTED | backend/src/modules; B2 TypeScript build; qa/backend/b2-integration.log; 21/21 real PostgreSQL checks |
| rejectTransfer | SC20 | TESTED | backend/src/modules; B2 TypeScript build; qa/backend/b2-integration.log; 21/21 real PostgreSQL checks |
| listGuardians | SC21 | TESTED | backend/src/modules; B2 TypeScript build; qa/backend/b2-integration.log; 21/21 real PostgreSQL checks |
| createGuardian | SC21, SC18 | TESTED | backend/src/modules; B2 TypeScript build; qa/backend/b2-integration.log; 21/21 real PostgreSQL checks |
| getGuardian | SC22 | IMPLEMENTED | backend/src/modules; B2 TypeScript build |
| updateGuardian | SC22 | IMPLEMENTED | backend/src/modules; B2 TypeScript build |
| listRelationships | SC18, SC22 | IMPLEMENTED | backend/src/modules; B2 TypeScript build |
| createRelationship | SC18, SC22 | TESTED | backend/src/modules; B2 TypeScript build; qa/backend/b2-integration.log; 21/21 real PostgreSQL checks |
| verifyRelationship | SC22 | TESTED | backend/src/modules; B2 TypeScript build; qa/backend/b2-integration.log; 21/21 real PostgreSQL checks |
| revokeRelationship | SC22 | IMPLEMENTED | backend/src/modules; B2 TypeScript build |
| listParentAccess | SC23 | TESTED | qa/backend/parent-integration.log |
| issueParentAccess | SC18, SC23 | TESTED | qa/backend/parent-integration.log |
| getParentAccess | SC24 | TESTED | qa/backend/parent-integration.log |
| revokeParentAccess | SC24 | TESTED | qa/backend/parent-integration.log |
| reissueParentAccess | SC24 | TESTED | qa/backend/parent-integration.log |
| listParentAccessEvents | SC24 | TESTED | qa/backend/parent-integration.log |
| previewParent | SC25 | TESTED | qa/backend/parent-integration.log |
| getTeacherOverview | TE01 | TESTED | qa/backend/dashboards-integration.log |
| listMyClasses | TE02 | TESTED | qa/backend/dashboards-integration.log |
| listMySchedule | TE03 | TESTED | qa/backend/dashboards-integration.log |
| listMyTasks | TE04 | TESTED | qa/backend/dashboards-integration.log |
| listTeacherAnnouncements | TE05 | TESTED | qa/backend/dashboards-integration.log |
| getClassOverview | CL01 | TESTED | qa/backend/dashboards-integration.log |
| listClassStudents | CL02 | TESTED | backend/src/modules; B2 TypeScript build; qa/backend/b2-integration.log; 21/21 real PostgreSQL checks |
| getClassStudent | CL03 | TESTED | backend/src/modules; B2 TypeScript build; qa/backend/b2-integration.log; 21/21 real PostgreSQL checks |
| listGroups | CL13 | TESTED | qa/backend/classroom-integration.log: 44/44 executed, exit0; source/date/history/race and negative scope checks |
| createGroup | CL13 | TESTED | qa/backend/classroom-integration.log: 44/44 executed, exit0; source/date/history/race and negative scope checks |
| listPositions | CL13 | TESTED | qa/backend/classroom-integration.log: 44/44 executed, exit0; source/date/history/race and negative scope checks |
| createPosition | CL13 | TESTED | qa/backend/classroom-integration.log: 44/44 executed, exit0; source/date/history/race and negative scope checks |
| listSeatingPlans | CL14 | TESTED | qa/backend/classroom-integration.log: 44/44 executed, exit0; source/date/history/race and negative scope checks |
| createSeatingPlan | CL14 | TESTED | qa/backend/classroom-integration.log: 44/44 executed, exit0; source/date/history/race and negative scope checks |
| updateGroup | CL13 | TESTED | qa/backend/classroom-integration.log: 44/44 executed, exit0; source/date/history/race and negative scope checks |
| updatePosition | CL13 | TESTED | qa/backend/classroom-integration.log: 44/44 executed, exit0; source/date/history/race and negative scope checks |
| listPositionAssignments | CL13 | TESTED | qa/backend/classroom-integration.log: 44/44 executed, exit0; source/date/history/race and negative scope checks |
| endPositionAssignment | CL13 | TESTED | qa/backend/classroom-integration.log: 44/44 executed, exit0; source/date/history/race and negative scope checks |
| assignGroup | CL13 | TESTED | qa/backend/classroom-integration.log: 44/44 executed, exit0; source/date/history/race and negative scope checks |
| assignPosition | CL13 | TESTED | qa/backend/classroom-integration.log: 44/44 executed, exit0; source/date/history/race and negative scope checks |
| getSeatingPlan | CL14 | TESTED | qa/backend/classroom-integration.log: 44/44 executed, exit0; source/date/history/race and negative scope checks |
| updateSeatingPlan | CL14 | TESTED | qa/backend/classroom-integration.log: 44/44 executed, exit0; source/date/history/race and negative scope checks |
| activateSeatingPlan | CL14 | TESTED | qa/backend/classroom-integration.log: 44/44 executed, exit0; source/date/history/race and negative scope checks |
| listAttendanceSessions | CL04, CL05 | TESTED | qa/backend/attendance-integration.log |
| createAttendanceSession | CL04 | TESTED | qa/backend/attendance-integration.log |
| getAttendanceSession | CL04 | TESTED | qa/backend/attendance-integration.log |
| saveAttendanceRecords | CL04 | TESTED | qa/backend/attendance-integration.log |
| getAttendanceSummary | CL05 | TESTED | qa/backend/attendance-integration.log |
| publishAttendance | CL04 | TESTED | qa/backend/attendance-integration.log |
| reopenAttendance | CL04 | TESTED | qa/backend/attendance-integration.log |
| listRuleSets | SC29 | TESTED | qa/backend/rules-integration.log |
| createRuleSet | SC29, SC30 | TESTED | qa/backend/rules-integration.log |
| getRuleSet | SC30 | TESTED | qa/backend/rules-integration.log |
| updateRuleSet | SC30 | TESTED | qa/backend/rules-integration.log |
| issueRuleSet | SC30 | TESTED | qa/backend/rules-integration.log |
| simulateRules | SC30 | TESTED | qa/backend/rules-integration.log |
| getClassRules | CL12 | TESTED | qa/backend/rules-integration.log |
| applyClassRules | CL12 | TESTED | qa/backend/rules-integration.log |
| listConductPeriods | CL07 | TESTED | qa/backend/conduct-sync-integration.log |
| createConductPeriod | CL06, CL07 | TESTED | qa/backend/conduct-sync-integration.log |
| getConductSummary | CL07 | TESTED | qa/backend/conduct-sync-integration.log |
| listConductRecords | CL06 | TESTED | qa/backend/conduct-sync-integration.log |
| createConductRecord | CL06 | TESTED | qa/backend/conduct-sync-integration.log |
| updateConductRecord | CL06 | TESTED | qa/backend/conduct-sync-integration.log |
| approveConductRecord | CL08 | TESTED | qa/backend/conduct-sync-integration.log |
| excludeConductRecord | CL08 | TESTED | qa/backend/conduct-sync-integration.log |
| reviewConductPeriod | CL08 | TESTED | qa/backend/conduct-sync-integration.log |
| lockConductPeriod | CL08 | TESTED | qa/backend/conduct-sync-integration.log |
| publishConductPeriod | CL08 | TESTED | qa/backend/conduct-sync-integration.log |
| lockAndPublishConduct | CL08 | TESTED | qa/backend/conduct-sync-integration.log |
| listAdjustments | CL11 | TESTED | qa/backend/conduct-sync-integration.log |
| createAdjustment | CL11 | TESTED | qa/backend/conduct-sync-integration.log |
| approveAdjustment | CL11 | TESTED | qa/backend/conduct-sync-integration.log |
| rejectAdjustment | CL11 | TESTED | qa/backend/conduct-sync-integration.log |
| applyAdjustment | CL11 | TESTED | qa/backend/conduct-sync-integration.log |
| listSchoolPublications | SC36 | TESTED | qa/backend/attendance-integration.log |
| listClassPublications | CL09 | TESTED | qa/backend/attendance-integration.log |
| getClassPublication | CL10 | TESTED | qa/backend/attendance-integration.log |
| withdrawPublication | SC36, CL10 | TESTED | qa/backend/attendance-integration.log |
| listSchoolLessons | SC32 | TESTED | qa/backend/schedule-integration.log: 48/48 executed, exit0; populated parent projections, source versions, assignments/holiday/collisions and withdraw |
| listClassTimetables | CL15 | TESTED | qa/backend/schedule-integration.log: 48/48 executed, exit0; populated parent projections, source versions, assignments/holiday/collisions and withdraw |
| createTimetable | CL15, SC32 | TESTED | qa/backend/schedule-integration.log: 48/48 executed, exit0; populated parent projections, source versions, assignments/holiday/collisions and withdraw |
| getTimetable | CL15 | TESTED | qa/backend/schedule-integration.log: 48/48 executed, exit0; populated parent projections, source versions, assignments/holiday/collisions and withdraw |
| updateTimetable | CL15 | TESTED | qa/backend/schedule-integration.log: 48/48 executed, exit0; populated parent projections, source versions, assignments/holiday/collisions and withdraw |
| validateTimetable | CL15, SC32 | TESTED | qa/backend/schedule-integration.log: 48/48 executed, exit0; populated parent projections, source versions, assignments/holiday/collisions and withdraw |
| publishTimetable | CL15, SC32 | TESTED | qa/backend/schedule-integration.log: 48/48 executed, exit0; populated parent projections, source versions, assignments/holiday/collisions and withdraw |
| listDuties | CL16 | TESTED | qa/backend/schedule-integration.log: 48/48 executed, exit0; populated parent projections, source versions, assignments/holiday/collisions and withdraw; qa/backend/group-duty-integration.log: 49/49 executed, exit0; group plan expansion preserves frozen individual targets |
| createDuty | CL16 | TESTED | qa/backend/schedule-integration.log: 48/48 executed, exit0; populated parent projections, source versions, assignments/holiday/collisions and withdraw; qa/backend/group-duty-integration.log: 49/49 executed, exit0; group plan expansion preserves frozen individual targets |
| updateDuty | CL16 | TESTED | qa/backend/schedule-integration.log: 48/48 executed, exit0; populated parent projections, source versions, assignments/holiday/collisions and withdraw; qa/backend/group-duty-integration.log: 49/49 executed, exit0; group plan expansion preserves frozen individual targets |
| publishDuty | CL16 | TESTED | qa/backend/schedule-integration.log: 48/48 executed, exit0; populated parent projections, source versions, assignments/holiday/collisions and withdraw; qa/backend/group-duty-integration.log: 49/49 executed, exit0; group plan expansion preserves frozen individual targets |
| listActivities | CL17 | TESTED | qa/backend/activities-integration.log: 52/52 executed, exit0; draft/review/publish isolation, evidence sharing and locked source checks |
| createActivity | CL18 | TESTED | qa/backend/activities-integration.log: 52/52 executed, exit0; draft/review/publish isolation, evidence sharing and locked source checks |
| getActivity | CL19 | TESTED | qa/backend/activities-integration.log: 52/52 executed, exit0; draft/review/publish isolation, evidence sharing and locked source checks |
| updateActivity | CL19 | TESTED | qa/backend/activities-integration.log: 52/52 executed, exit0; draft/review/publish isolation, evidence sharing and locked source checks |
| setParticipantStatus | CL19 | TESTED | qa/backend/activities-integration.log: 52/52 executed, exit0; draft/review/publish isolation, evidence sharing and locked source checks |
| listParticipants | CL19 | TESTED | qa/backend/activities-integration.log: 52/52 executed, exit0; draft/review/publish isolation, evidence sharing and locked source checks |
| assignActivity | CL18, CL19 | TESTED | qa/backend/activities-integration.log: 52/52 executed, exit0; draft/review/publish isolation, evidence sharing and locked source checks |
| publishActivity | CL19 | TESTED | qa/backend/activities-integration.log: 52/52 executed, exit0; draft/review/publish isolation, evidence sharing and locked source checks |
| listEvidence | CL20, CL19 | TESTED | qa/backend/activities-integration.log: 52/52 executed, exit0; draft/review/publish isolation, evidence sharing and locked source checks |
| createEvidence | CL20, CL19 | TESTED | qa/backend/activities-integration.log: 52/52 executed, exit0; draft/review/publish isolation, evidence sharing and locked source checks |
| reviewEvidence | CL20, CL19 | TESTED | qa/backend/activities-integration.log: 52/52 executed, exit0; draft/review/publish isolation, evidence sharing and locked source checks |
| listClassFiles | CL24 | TESTED | qa/backend/files-integration.log; 22/22; private file and worker cases |
| uploadFile | SC02, CL20, CL24, SC27 | TESTED | qa/backend/files-integration.log; 22/22; private file and worker cases |
| getFile | CL24 | TESTED | qa/backend/files-integration.log; 22/22; private file and worker cases |
| downloadFile | CL24, CL20 | TESTED | qa/backend/files-integration.log; 22/22; private file and worker cases |
| archiveFile | CL24 | TESTED | qa/backend/files-integration.log; 22/22; private file and worker cases |
| createFileLink | CL24 | TESTED | qa/backend/files-integration.log; 22/22; private file and worker cases |
| listSchoolAnnouncements | SC33, SC34, SC35 | TESTED | qa/backend/announcements-integration.log: 57/57 exit0; qa/backend/announcements-unit-contract.log: 12/12 exit0; migration020 applied/replayed; connected UI pending |
| createSchoolAnnouncement | SC33, SC34, SC35 | TESTED | qa/backend/announcements-integration.log: 57/57 exit0; qa/backend/announcements-unit-contract.log: 12/12 exit0; migration020 applied/replayed; connected UI pending |
| getSchoolAnnouncement | SC33, SC34, SC35 | TESTED | qa/backend/announcements-integration.log: 57/57 exit0; qa/backend/announcements-unit-contract.log: 12/12 exit0; migration020 applied/replayed; connected UI pending |
| updateSchoolAnnouncement | SC33, SC34, SC35 | TESTED | qa/backend/announcements-integration.log: 57/57 exit0; qa/backend/announcements-unit-contract.log: 12/12 exit0; migration020 applied/replayed; connected UI pending |
| publishSchoolAnnouncement | SC33, SC34, SC35 | TESTED | qa/backend/announcements-integration.log: 57/57 exit0; qa/backend/announcements-unit-contract.log: 12/12 exit0; migration020 applied/replayed; connected UI pending |
| scheduleSchoolAnnouncement | SC33, SC34, SC35 | TESTED | qa/backend/announcements-integration.log: 57/57 exit0; qa/backend/announcements-unit-contract.log: 12/12 exit0; migration020 applied/replayed; connected UI pending |
| withdrawSchoolAnnouncement | SC33, SC34, SC35 | TESTED | qa/backend/announcements-integration.log: 57/57 exit0; qa/backend/announcements-unit-contract.log: 12/12 exit0; migration020 applied/replayed; connected UI pending |
| listClassAnnouncements | CL21, CL22, CL23 | TESTED | qa/backend/announcements-integration.log: 57/57 exit0; qa/backend/announcements-unit-contract.log: 12/12 exit0; migration020 applied/replayed; connected UI pending |
| createClassAnnouncement | CL21, CL22, CL23 | TESTED | qa/backend/announcements-integration.log: 57/57 exit0; qa/backend/announcements-unit-contract.log: 12/12 exit0; migration020 applied/replayed; connected UI pending |
| getClassAnnouncement | CL21, CL22, CL23 | TESTED | qa/backend/announcements-integration.log: 57/57 exit0; qa/backend/announcements-unit-contract.log: 12/12 exit0; migration020 applied/replayed; connected UI pending |
| updateClassAnnouncement | CL21, CL22, CL23 | TESTED | qa/backend/announcements-integration.log: 57/57 exit0; qa/backend/announcements-unit-contract.log: 12/12 exit0; migration020 applied/replayed; connected UI pending |
| publishClassAnnouncement | CL21, CL22, CL23 | TESTED | qa/backend/announcements-integration.log: 57/57 exit0; qa/backend/announcements-unit-contract.log: 12/12 exit0; migration020 applied/replayed; connected UI pending |
| scheduleClassAnnouncement | CL21, CL22, CL23 | TESTED | qa/backend/announcements-integration.log: 57/57 exit0; qa/backend/announcements-unit-contract.log: 12/12 exit0; migration020 applied/replayed; connected UI pending |
| withdrawClassAnnouncement | CL21, CL22, CL23 | TESTED | qa/backend/announcements-integration.log: 57/57 exit0; qa/backend/announcements-unit-contract.log: 12/12 exit0; migration020 applied/replayed; connected UI pending |
| listImports | SC26 | TESTED | qa/backend/imports-integration.log; qa/backend/support-read-integration.log |
| createImport | SC27 | TESTED | qa/backend/imports-integration.log |
| getImport | SC28 | TESTED | qa/backend/imports-integration.log; qa/backend/support-read-integration.log |
| validateImport | SC27 | TESTED | qa/backend/imports-integration.log |
| listImportRows | SC27, SC28 | TESTED | qa/backend/imports-integration.log |
| commitImport | SC27 | TESTED | qa/backend/imports-integration.log |
| cancelImport | SC28 | TESTED | qa/backend/imports-integration.log |
| downloadImportErrors | SC28 | TESTED | qa/backend/imports-integration.log |
| getSchoolReport | SC37, SC38, TE06 | TESTED | qa/backend/reports-integration.log |
| getClassReport | CL25, CL26 | TESTED | qa/backend/reports-integration.log |
| listExports | SC39 | TESTED | qa/backend/reports-integration.log |
| createExport | SC38, SC39, CL26 | TESTED | qa/backend/reports-integration.log |
| getExport | SC39 | TESTED | qa/backend/reports-integration.log |
| downloadExport | SC39, CL26 | TESTED | qa/backend/reports-integration.log |
| cancelExport | SC39 | TESTED | qa/backend/reports-integration.log |
| listSchoolAudit | SC40 | TESTED | qa/backend/settings-integration.log: 60/60 exit0; qa/backend/settings-unit-contract.log: 12/12 exit0; migration021 applied/replayed; UI pending; 97/97 actual PostgreSQL integration, 31 migrations/checksums/replay; qa/backend/b6-school-operations-integration-final.log; backend 15/15 unit-contract; frontend 69/69 unit; UI activation/E2E still pending. |
| getSchoolSettings | SC31, SC41 | TESTED | qa/backend/settings-integration.log: 60/60 exit0; qa/backend/settings-unit-contract.log: 12/12 exit0; migration021 applied/replayed; UI pending; qa/backend/support-read-integration.log |
| updateSchoolSettings | SC31, SC41 | TESTED | qa/backend/settings-integration.log: 60/60 exit0; qa/backend/settings-unit-contract.log: 12/12 exit0; migration021 applied/replayed; UI pending |
| listSchoolTickets | SC42 | TESTED | qa/backend/support-integration.log; 97/97 actual PostgreSQL integration, 31 migrations/checksums/replay; qa/backend/b6-school-operations-integration-final.log; backend 15/15 unit-contract; frontend 69/69 unit; UI activation/E2E still pending. |
| createTicket | SC42 | TESTED | qa/backend/support-integration.log; 97/97 actual PostgreSQL integration, 31 migrations/checksums/replay; qa/backend/b6-school-operations-integration-final.log; backend 15/15 unit-contract; frontend 69/69 unit; UI activation/E2E still pending. |
| getSchoolTicket | SC43 | TESTED | qa/backend/support-integration.log; 97/97 actual PostgreSQL integration, 31 migrations/checksums/replay; qa/backend/b6-school-operations-integration-final.log; backend 15/15 unit-contract; frontend 69/69 unit; UI activation/E2E still pending. |
| listSchoolMessages | SC43 | TESTED | qa/backend/support-integration.log; 97/97 actual PostgreSQL integration, 31 migrations/checksums/replay; qa/backend/b6-school-operations-integration-final.log; backend 15/15 unit-contract; frontend 69/69 unit; UI activation/E2E still pending. |
| postSchoolMessage | SC43 | TESTED | qa/backend/support-integration.log; 97/97 actual PostgreSQL integration, 31 migrations/checksums/replay; qa/backend/b6-school-operations-integration-final.log; backend 15/15 unit-contract; frontend 69/69 unit; UI activation/E2E still pending. |
| listSchoolSupportAccess | SC42, SC43 | TESTED | qa/backend/support-integration.log; qa/backend/b6-support-ui-integration-final.log: 94/94 PostgreSQL, 30 migrations, SQL support choices/states/counts, atomic message/status save, same-school own-operator consent request/relinquish, current replay revocation and actor/local-date keysets; 97/97 actual PostgreSQL integration, 31 migrations/checksums/replay; qa/backend/b6-school-operations-integration-final.log; backend 15/15 unit-contract; frontend 69/69 unit; UI activation/E2E still pending. |
| createSupportAccess | SC42, SC43 | TESTED | qa/backend/support-integration.log; qa/backend/support-read-integration.log |
| approveSupportAccess | SC43 | TESTED | qa/backend/support-integration.log; qa/backend/support-read-integration.log; 97/97 actual PostgreSQL integration, 31 migrations/checksums/replay; qa/backend/b6-school-operations-integration-final.log; backend 15/15 unit-contract; frontend 69/69 unit; UI activation/E2E still pending. |
| revokeSupportAccess | SC43 | TESTED | qa/backend/support-integration.log; qa/backend/support-read-integration.log; 97/97 actual PostgreSQL integration, 31 migrations/checksums/replay; qa/backend/b6-school-operations-integration-final.log; backend 15/15 unit-contract; frontend 69/69 unit; UI activation/E2E still pending. |
| exchangeParentLink | PA01 | TESTED | qa/backend/parent-integration.log |
| getParentContext | PA01, PA14 | TESTED | qa/backend/parent-integration.log |
| endParentSession | PA14 | TESTED | qa/backend/parent-integration.log |
| getParentOverview | PA02 | TESTED | qa/backend/parent-integration.log |
| getParentAttendance | PA03 | TESTED | qa/backend/parent-integration.log |
| listParentConduct | PA04 | TESTED | qa/backend/parent-integration.log |
| getParentConduct | PA05 | TESTED | qa/backend/parent-integration.log |
| getParentTimetable | PA06 | TESTED | qa/backend/parent-integration.log |
| getParentDuties | PA07 | TESTED | qa/backend/parent-integration.log |
| listParentActivities | PA08 | TESTED | qa/backend/parent-integration.log |
| getParentActivity | PA09 | TESTED | qa/backend/parent-integration.log |
| listParentAnnouncements | PA10 | TESTED | qa/backend/parent-integration.log |
| getParentAnnouncement | PA11 | TESTED | qa/backend/parent-integration.log |
| getParentTeachers | PA12 | TESTED | qa/backend/parent-integration.log |
| listParentDocuments | PA13 | TESTED | qa/backend/parent-integration.log |
| downloadParentDocument | PA13 | TESTED | qa/backend/parent-integration.log |
| getPublicSchool | SY01 | TESTED | qa/backend/announcements-integration.log: 57/57 exit0; qa/backend/announcements-unit-contract.log: 12/12 exit0; migration020 applied/replayed; connected UI pending |
| getPublicAnnouncement | SY02 | TESTED | qa/backend/announcements-integration.log: 57/57 exit0; qa/backend/announcements-unit-contract.log: 12/12 exit0; migration020 applied/replayed; connected UI pending |
| getRolloverPreview | SC07 | TESTED | qa/backend/b6-rollover-integration.log: 89/89 PostgreSQL checks; bounded exact end-year preview, target counts/archive filtering and current workflow authorization |
| getPlatformSchoolOptions | PL02, PL03 | TESTED | qa/backend/b6-platform-wizard-integration-final.log: 92/92 PostgreSQL, 30 migration checksums/replay, atomic optional first admin, current delegation/replay authority and redacted purpose-bound platform metadata |
| checkPlatformSchoolIdentity | PL03 | TESTED | qa/backend/b6-platform-wizard-integration-final.log: 92/92 PostgreSQL, 30 migration checksums/replay, atomic optional first admin, current delegation/replay authority and redacted purpose-bound platform metadata |
| listSchoolAdminInvitations | PL04, PL05 | TESTED | qa/backend/b6-platform-wizard-integration-final.log: 92/92 PostgreSQL, 30 migration checksums/replay, atomic optional first admin, current delegation/replay authority and redacted purpose-bound platform metadata |
| revokePlatformAdminInvitation | PL05 | TESTED | qa/backend/b6-platform-wizard-integration-final.log: 92/92 PostgreSQL, 30 migration checksums/replay, atomic optional first admin, current delegation/replay authority and redacted purpose-bound platform metadata |
| getPlatformSupportOptions | PL04, PL06, PL07, PL08 | TESTED | qa/backend/b6-support-ui-integration-final.log: 94/94 PostgreSQL, 30 migrations, SQL support choices/states/counts, atomic message/status save, same-school own-operator consent request/relinquish, current replay revocation and actor/local-date keysets |
| requestPlatformSupportAccess | PL07, PL08 | TESTED | qa/backend/b6-support-ui-integration-final.log: 94/94 PostgreSQL, 30 migrations, SQL support choices/states/counts, atomic message/status save, same-school own-operator consent request/relinquish, current replay revocation and actor/local-date keysets |
| relinquishPlatformSupportAccess | PL08 | TESTED | qa/backend/b6-support-ui-integration-final.log: 94/94 PostgreSQL, 30 migrations, SQL support choices/states/counts, atomic message/status save, same-school own-operator consent request/relinquish, current replay revocation and actor/local-date keysets |
| getPlatformAuditOptions | PL09 | TESTED | qa/backend/b6-support-ui-integration-final.log: 94/94 PostgreSQL, 30 migrations, SQL support choices/states/counts, atomic message/status save, same-school own-operator consent request/relinquish, current replay revocation and actor/local-date keysets |
| getSchoolSupportSummary | O33, O34 | TESTED | 97/97 actual PostgreSQL integration, 31 migrations/checksums/replay; qa/backend/b6-school-operations-integration-final.log; backend 15/15 unit-contract; frontend 69/69 unit; UI activation/E2E still pending. |
| getSchoolAuditOptions | O35 | TESTED | 97/97 actual PostgreSQL integration, 31 migrations/checksums/replay; qa/backend/b6-school-operations-integration-final.log; backend 15/15 unit-contract; frontend 69/69 unit; UI activation/E2E still pending. |
| getPlatformOperationsOverview | PL10 | TESTED | 97/97 actual PostgreSQL integration, 31 migrations/checksums/replay; qa/backend/b6-school-operations-integration-final.log; backend 15/15 unit-contract; frontend 69/69 unit; UI activation/E2E still pending. |

| screenId | Scope | API status | UI status | Static mapping |
|---|---|---|---|---|
| AU01 | core | TESTED | NOT_STARTED |  |
| AU02 | core | TESTED | NOT_STARTED |  |
| AU03 | core | TESTED | NOT_STARTED |  |
| AU04 | core | TESTED | NOT_STARTED |  |
| AU05 | core | TESTED | NOT_STARTED |  |
| AU06 | core | TESTED | NOT_STARTED |  |
| AU07 | core | TESTED | NOT_STARTED |  |
| AU08 | core | TESTED | NOT_STARTED |  |
| AU09 | core | TESTED | NOT_STARTED |  |
| AU10 | core | NOT_REQUIRED | STATIC_UNVERIFIED | Nội dung hướng dẫn được version cùng frontend, không cần backend CRUD. |
| PL01 | core | TESTED | NOT_STARTED |  |
| PL02 | core | TESTED | NOT_STARTED |  |
| PL03 | core | TESTED | NOT_STARTED |  |
| PL04 | core | TESTED | NOT_STARTED |  |
| PL05 | core | TESTED | NOT_STARTED |  |
| PL06 | core | TESTED | NOT_STARTED |  |
| PL07 | core | TESTED | NOT_STARTED |  |
| PL08 | core | TESTED | NOT_STARTED |  |
| PL09 | core | TESTED | NOT_STARTED |  |
| PL10 | core | TESTED | NOT_STARTED |  |
| PL11 | core | TESTED | NOT_STARTED |  |
| SC01 | core | TESTED | NOT_STARTED |  |
| SC02 | core | TESTED | NOT_STARTED |  |
| SC03 | core | IMPLEMENTED | NOT_STARTED |  |
| SC04 | core | IMPLEMENTED | NOT_STARTED |  |
| SC05 | core | IMPLEMENTED | NOT_STARTED |  |
| SC06 | core | IMPLEMENTED | NOT_STARTED |  |
| SC07 | core | IMPLEMENTED | NOT_STARTED |  |
| SC08 | core | TESTED | NOT_STARTED |  |
| SC09 | core | IMPLEMENTED | NOT_STARTED |  |
| SC10 | core | IMPLEMENTED | NOT_STARTED |  |
| SC11 | core | IMPLEMENTED | NOT_STARTED |  |
| SC12 | core | TESTED | NOT_STARTED |  |
| SC13 | core | TESTED | NOT_STARTED |  |
| SC14 | core | IMPLEMENTED | NOT_STARTED |  |
| SC15 | core | IMPLEMENTED | NOT_STARTED |  |
| SC16 | core | IMPLEMENTED | NOT_STARTED |  |
| SC17 | core | IMPLEMENTED | NOT_STARTED |  |
| SC18 | core | IMPLEMENTED | NOT_STARTED |  |
| SC19 | core | IMPLEMENTED | NOT_STARTED |  |
| SC20 | core | IMPLEMENTED | NOT_STARTED |  |
| SC21 | core | TESTED | NOT_STARTED |  |
| SC22 | core | IMPLEMENTED | NOT_STARTED |  |
| SC23 | core | TESTED | NOT_STARTED |  |
| SC24 | core | TESTED | NOT_STARTED |  |
| SC25 | core | TESTED | NOT_STARTED |  |
| SC26 | core | TESTED | NOT_STARTED |  |
| SC27 | core | TESTED | NOT_STARTED |  |
| SC28 | core | TESTED | NOT_STARTED |  |
| SC29 | core | TESTED | NOT_STARTED |  |
| SC30 | core | TESTED | NOT_STARTED |  |
| SC31 | core | TESTED | NOT_STARTED |  |
| SC32 | core | TESTED | NOT_STARTED |  |
| SC33 | core | TESTED | NOT_STARTED |  |
| SC34 | core | TESTED | NOT_STARTED |  |
| SC35 | core | TESTED | NOT_STARTED |  |
| SC36 | core | TESTED | NOT_STARTED |  |
| SC37 | core | TESTED | NOT_STARTED |  |
| SC38 | core | TESTED | NOT_STARTED |  |
| SC39 | core | TESTED | NOT_STARTED |  |
| SC40 | core | TESTED | NOT_STARTED |  |
| SC41 | core | TESTED | NOT_STARTED |  |
| SC42 | core | TESTED | NOT_STARTED |  |
| SC43 | core | TESTED | NOT_STARTED |  |
| TE01 | core | TESTED | NOT_STARTED |  |
| TE02 | core | TESTED | NOT_STARTED |  |
| TE03 | core | TESTED | NOT_STARTED |  |
| TE04 | core | TESTED | NOT_STARTED |  |
| TE05 | core | TESTED | NOT_STARTED |  |
| TE06 | core | TESTED | NOT_STARTED |  |
| CL01 | core | TESTED | NOT_STARTED |  |
| CL02 | core | TESTED | NOT_STARTED |  |
| CL03 | core | TESTED | NOT_STARTED |  |
| CL04 | core | TESTED | NOT_STARTED |  |
| CL05 | core | TESTED | NOT_STARTED |  |
| CL06 | core | TESTED | NOT_STARTED |  |
| CL07 | core | TESTED | NOT_STARTED |  |
| CL08 | core | TESTED | NOT_STARTED |  |
| CL09 | core | TESTED | NOT_STARTED |  |
| CL10 | core | TESTED | NOT_STARTED |  |
| CL11 | core | TESTED | NOT_STARTED |  |
| CL12 | core | TESTED | NOT_STARTED |  |
| CL13 | core | TESTED | NOT_STARTED |  |
| CL14 | core | TESTED | NOT_STARTED |  |
| CL15 | core | TESTED | NOT_STARTED |  |
| CL16 | core | TESTED | NOT_STARTED |  |
| CL17 | core | TESTED | NOT_STARTED |  |
| CL18 | core | TESTED | NOT_STARTED |  |
| CL19 | core | TESTED | NOT_STARTED |  |
| CL20 | core | TESTED | NOT_STARTED |  |
| CL21 | core | TESTED | NOT_STARTED |  |
| CL22 | core | TESTED | NOT_STARTED |  |
| CL23 | core | TESTED | NOT_STARTED |  |
| CL24 | core | TESTED | NOT_STARTED |  |
| CL25 | core | TESTED | NOT_STARTED |  |
| CL26 | core | TESTED | NOT_STARTED |  |
| PA01 | core | TESTED | NOT_STARTED |  |
| PA02 | core | TESTED | NOT_STARTED |  |
| PA03 | core | TESTED | NOT_STARTED |  |
| PA04 | core | TESTED | NOT_STARTED |  |
| PA05 | core | TESTED | NOT_STARTED |  |
| PA06 | core | TESTED | NOT_STARTED |  |
| PA07 | core | TESTED | NOT_STARTED |  |
| PA08 | core | TESTED | NOT_STARTED |  |
| PA09 | core | TESTED | NOT_STARTED |  |
| PA10 | core | TESTED | NOT_STARTED |  |
| PA11 | core | TESTED | NOT_STARTED |  |
| PA12 | core | TESTED | NOT_STARTED |  |
| PA13 | core | TESTED | NOT_STARTED |  |
| PA14 | core | TESTED | NOT_STARTED |  |
| SY01 | core | TESTED | NOT_STARTED |  |
| SY02 | core | TESTED | NOT_STARTED |  |
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
