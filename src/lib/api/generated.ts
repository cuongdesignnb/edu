// Generated from the validated backend contract. Do not hand-edit.
export interface ApiSchemas {
  "Error": { "type": string; "title": string; "status": number; "code": string; "detail"?: string; "requestId": string; "fieldErrors"?: Array<{ "path": string; "code": string; "message": string; }>; "currentVersion"?: number; };
  "Ack": { "id": (string) | null; "status": string; "version"?: number; };
  "Health": { "status": "ok" | "degraded"; "buildSha"?: string; };
  "ReasonCommand": { "expectedVersion": number; "reason": string; };
  "VersionCommand": { "expectedVersion": number; };
  "PageInfo": { "nextCursor": (string) | null; "hasMore": boolean; "limit": number; "total"?: number; };
  "GrantView": { "id": (string) | null; "version": number; "roleId": (string) | null; "roleLabel": string; "roleCode": string; "assignmentStartsOn"?: (string) | null; "assignmentEndsOn"?: (string) | null; "actions": Array<string>; "scopeType": "SCHOOL" | "CLASS" | "SUBJECT"; "classId"?: string; "subjectId"?: string; "validFrom": string; "validUntil": (string) | null; "revokedAt"?: (string) | null; };
  "User": { "id": (string) | null; "version": number; "createdAt": string; "updatedAt": string; "displayName": string; "workPhone"?: (string) | null; "bio"?: (string) | null; "email": string; "status": "INVITED" | "ACTIVE" | "LOCKED"; };
  "Context": { "user": ApiSchemas["User"]; "memberships": Array<{ "schoolId": (string) | null; "schoolName": string; "schoolSlug": string; "schoolShortName": string; "schoolStatus": "DRAFT" | "ACTIVE" | "SUSPENDED" | "ARCHIVED"; "department": string; "timezone": string; "today": string; "schoolWorkspace": boolean; "teacherWorkspace": boolean; "duties": Array<{ "id": string; "classId": string; "className": string; "subjectId": (string) | null; "subjectName": (string) | null; "kind": "HOMEROOM" | "SUBJECT"; "startsOn": string; "endsOn": (string) | null; }>; "memberId": (string) | null; "status": string; "grants": Array<ApiSchemas["GrantView"]>; }>; "platformActions": Array<string>; "csrfToken": string; "mode": "connected"; "serverNow": string; };
  "LoginResult": { "user": ApiSchemas["User"]; "csrfToken": string; };
  "Csrf": { "csrfToken": string; };
  "LoginRequest": { "email": string; "password": string; };
  "ForgotPasswordRequest": { "email": string; };
  "ResetPasswordRequest": { "token": string; "password": string; };
  "ChangePasswordRequest": { "currentPassword": string; "newPassword": string; };
  "ProfilePatch": { "expectedVersion": number; "displayName"?: string; "workPhone"?: (string) | null; "bio"?: (string) | null; };
  "StaffSession": { "id": (string) | null; "deviceSummary": string; "current": boolean; "createdAt": string; "lastSeenAt": string; "expiresAt": string; };
  "School": { "website"?: (string) | null; "id": (string) | null; "version": number; "createdAt": string; "updatedAt": string; "code": string; "slug": string; "name": string; "status": "DRAFT" | "ACTIVE" | "SUSPENDED" | "ARCHIVED"; "timezone": string; "publicContactEmail"?: (string) | null; "publicContactPhone"?: (string) | null; "publicAddress"?: (string) | null; "shortName"?: string; "province"?: string; "level"?: ("THPT" | "THCS" | "Tiểu học" | null) | null; "accentColor"?: string; "motto"?: string; "publicIntro"?: string; "statusReason"?: (string) | null; "activatedAt"?: (string) | null; "classCount"?: number; "staffCount"?: number; "adminNames"?: Array<string>; "onboarding"?: { "profileDone"?: boolean; "adminAssigned"?: boolean; "yearCreated"?: boolean; "classesCreated"?: boolean; "teachersInvited"?: boolean; "studentsImported"?: boolean; "homeroomAssigned"?: boolean; "rulesPublished"?: boolean; }; };
  "SchoolCreate": { "website"?: (string) | null; "code": string; "slug": string; "name": string; "timezone"?: string; "publicContactEmail"?: (string) | null; "publicContactPhone"?: (string) | null; "publicAddress"?: (string) | null; "shortName"?: string; "province"?: string; "level"?: ("THPT" | "THCS" | "Tiểu học" | null) | null; "accentColor"?: string; "motto"?: string; "publicIntro"?: string; "firstAdmin"?: ApiSchemas["PlatformAdminInviteRequest"]; };
  "SchoolPatch": { "website"?: (string) | null; "expectedVersion": number; "name"?: string; "publicContactEmail"?: (string) | null; "publicContactPhone"?: (string) | null; "publicAddress"?: (string) | null; "shortName"?: string; "province"?: string; "level"?: ("THPT" | "THCS" | "Tiểu học" | null) | null; "accentColor"?: string; "motto"?: string; "publicIntro"?: string; };
  "SchoolStatusCommand": { "expectedVersion": number; "status": "ACTIVE" | "SUSPENDED" | "ARCHIVED"; "reason": string; };
  "Metric": { "key": string; "label": string; "value": number; "denominator": (number) | null; "unit": string; "asOf": string; };
  "Task": { "id": string; "kind": string; "title": string; "schoolId": (string) | null; "classId"?: (string) | null; "dueAt"?: (string) | null; "targetType": string; "targetId": (string) | null; "yearId"?: string; "className"?: string; "detail"?: string; "status"?: string; "tone"?: "danger" | "warning" | "info" | "neutral"; "lessonId"?: string; };
  "Dashboard": { "metrics": Array<ApiSchemas["Metric"]>; "tasks": Array<ApiSchemas["Task"]>; "asOf": string; "referenceDate"?: string; "yearId"?: string; "schoolOverview"?: ApiSchemas["SchoolOverviewDetails"]; };
  "Member": { "id": (string) | null; "version": number; "createdAt": string; "updatedAt": string; "userId": (string) | null; "staffCode"?: (string) | null; "workDisplayName": string; "workEmail"?: (string) | null; "workPhone"?: (string) | null; "shareWorkContact": boolean; "department"?: (string) | null; "status": "INVITED" | "ACTIVE" | "SUSPENDED" | "ENDED"; "grants"?: Array<ApiSchemas["GrantView"]>; "homeroomOf"?: Array<string>; "loginEmail"?: string; };
  "MemberPatch": { "expectedVersion": number; "workDisplayName"?: string; "workEmail"?: (string) | null; "workPhone"?: (string) | null; "shareWorkContact"?: boolean; "department"?: (string) | null; };
  "Invitation": { "schoolId"?: string; "schoolSlug"?: string; "schoolStatus"?: "DRAFT" | "ACTIVE" | "SUSPENDED" | "ARCHIVED"; "workDisplayName"?: string; "inviterName"?: string; "roleLabels"?: Array<string>; "roleCodes"?: Array<string>; "requiresLogin"?: boolean; "signedInAsInvited"?: boolean; "id": (string) | null; "version": number; "createdAt": string; "updatedAt": string; "email": string; "expiresAt": string; "status": "PENDING" | "ACCEPTED" | "DECLINED" | "REVOKED"; "deliveryState"?: "QUEUED" | "SENT" | "FAILED" | "LOCAL_FILE"; "schoolName"?: string; };
  "InviteRequest": { "email": string; "roleId": (string) | null; "classId"?: (string) | null; "subjectId"?: (string) | null; "validFrom": string; "validUntil"?: (string) | null; "workDisplayName"?: string; "reason"?: string; "expiresInDays"?: number; };
  "InviteTokenRequest": { "schoolSlug": string; "token": string; };
  "AcceptInviteRequest": { "schoolSlug": string; "token": string; "displayName"?: string; "newPassword"?: string; };
  "Role": { "id": (string) | null; "version": number; "createdAt": string; "updatedAt": string; "code": string; "label": string; "systemRole": boolean; "permissions": Array<{ "action": string; "scopes": Array<"SCHOOL" | "CLASS" | "SUBJECT">; }>; };
  "RoleCreate": { "code": string; "label": string; "permissions": Array<{ "action": string; "scopes": Array<"SCHOOL" | "CLASS" | "SUBJECT">; }>; };
  "RolePatch": { "expectedVersion": number; "label"?: string; "permissions"?: Array<{ "action": string; "scopes": Array<"SCHOOL" | "CLASS" | "SUBJECT">; }>; };
  "GrantRequest": { "memberId": (string) | null; "roleId": (string) | null; "scopeType": "SCHOOL" | "CLASS" | "SUBJECT"; "classId"?: (string) | null; "subjectId"?: (string) | null; "validFrom": string; "validUntil"?: (string) | null; };
  "PermissionPreview": { "allowed": boolean; "added": Array<ApiSchemas["GrantView"]>; "removed": Array<ApiSchemas["GrantView"]>; "warnings": Array<string>; };
  "Year": { "id": (string) | null; "version": number; "createdAt": string; "updatedAt": string; "code": string; "name": string; "startsOn": string; "endsOn": string; "status": "DRAFT" | "ACTIVE" | "ARCHIVED"; "setup"?: { "termCount": number; "weekCount": number; "holidayCount": number; "copiedRuleSetId"?: string; }; "classCount"?: (number) | null; "studentCount"?: (number) | null; "terms"?: Array<ApiSchemas["Term"]>; };
  "YearCreate": { "terms"?: Array<{ "code": string; "name": string; "startsOn": string; "endsOn": string; "openingDate"?: (string) | null; }>; "holidays"?: Array<{ "title": string; "startsOn": string; "endsOn": string; }>; "copyRules"?: boolean; "code": string; "name": string; "startsOn": string; "endsOn": string; };
  "YearPatch": { "expectedVersion": number; "name"?: string; "startsOn"?: string; "endsOn"?: string; };
  "Term": { "openingDate"?: (string) | null; "id": (string) | null; "version": number; "createdAt": string; "updatedAt": string; "yearId": (string) | null; "code": string; "name": string; "startsOn": string; "endsOn": string; "weekCount"?: number; };
  "TermCreate": { "openingDate"?: (string) | null; "yearId": string; "code": string; "name": string; "startsOn": string; "endsOn": string; };
  "TermPatch": { "openingDate"?: (string) | null; "expectedVersion": number; "name"?: string; "startsOn"?: string; "endsOn"?: string; };
  "Week": { "id": (string) | null; "version": number; "createdAt": string; "updatedAt": string; "yearId": (string) | null; "termId": (string) | null; "weekNumber": number; "startsOn": string; "endsOn": string; "inputDeadline": (string) | null; "inputDeadlineDay"?: (string) | null; "locked"?: (boolean) | null; };
  "WeekCreate": { "yearId": string; "termId": string; "weekNumber": number; "startsOn": string; "endsOn": string; "inputDeadline"?: (string) | null; };
  "WeekPatch": { "inputDeadlineDay"?: string; "expectedVersion": number; "startsOn"?: string; "endsOn"?: string; "inputDeadline"?: (string) | null; };
  "DictionaryItem": { "inUse"?: boolean; "gradeLevel"?: (number) | null; "color"?: string; "id": (string) | null; "version": number; "createdAt": string; "updatedAt": string; "code": string; "name": string; "status": "ACTIVE" | "ARCHIVED"; "sortOrder"?: number; "capacity"?: (number) | null; };
  "DictionaryCreate": { "gradeLevel"?: number; "color"?: string; "code": string; "name": string; "sortOrder"?: number; "capacity"?: number; };
  "DictionaryItemPatch": { "code"?: string; "gradeLevel"?: number; "color"?: string; "expectedVersion": number; "name"?: string; "status"?: "ACTIVE" | "ARCHIVED"; "sortOrder"?: number; "capacity"?: number; };
  "CalendarEvent": { "id": (string) | null; "version": number; "createdAt": string; "updatedAt": string; "yearId": (string) | null; "classId"?: (string) | null; "title": string; "kind": "HOLIDAY" | "EVENT" | "DEADLINE"; "startsOn": string; "endsOn": string; "status": "DRAFT" | "PUBLISHED" | "WITHDRAWN"; };
  "CalendarEventCreate": { "status"?: "DRAFT" | "PUBLISHED"; "yearId": string; "classId"?: string; "title": string; "kind": "HOLIDAY" | "EVENT" | "DEADLINE"; "startsOn": string; "endsOn": string; };
  "CalendarEventPatch": { "status"?: "WITHDRAWN"; "reason"?: string; "expectedVersion": number; "title"?: string; "startsOn"?: string; "endsOn"?: string; };
  "Class": { "roomId"?: string; "motto"?: (string) | null; "id": (string) | null; "version": number; "createdAt": string; "updatedAt": string; "yearId": (string) | null; "gradeLevelId": (string) | null; "code": string; "name": string; "capacity": number; "status": "DRAFT" | "ACTIVE" | "ARCHIVED"; "studentCount"?: (number) | null; "yearName"?: string; "gradeName"?: string; "roomCode"?: (string) | null; "homeroomName"?: (string) | null; "homeroomUserId"?: string; "homeroomMemberId"?: string; "subjectTeacherCount"?: number; "hasTimetable"?: boolean; "inactiveAssignmentCount"?: number; "referenceDate"?: string; "myAssignments"?: Array<{ "id": string; "kind": "HOMEROOM" | "SUBJECT"; "subjectId"?: string; "startsOn": string; "endsOn"?: string; }>; };
  "ClassCreate": { "homeroomMemberId"?: string; "homeroomStartsOn"?: string; "homeroomReason"?: string; "roomId"?: (string) | null; "motto"?: (string) | null; "yearId": string; "gradeLevelId": string; "code": string; "name": string; "capacity": number; };
  "ClassPatch": { "status"?: "DRAFT"; "homeroomMemberId"?: string; "homeroomStartsOn"?: string; "homeroomReason"?: string; "gradeLevelId"?: string; "roomId"?: (string) | null; "motto"?: (string) | null; "expectedVersion": number; "name"?: string; "capacity"?: number; };
  "Assignment": { "id": (string) | null; "version": number; "createdAt": string; "updatedAt": string; "classId": (string) | null; "memberId": (string) | null; "roleGrantId": (string) | null; "kind": "HOMEROOM" | "SUBJECT"; "subjectId"?: (string) | null; "startsOn": string; "endsOn": (string) | null; "revokedAt"?: (string) | null; };
  "AssignmentCreate": { "classId": string; "memberId": string; "kind": "HOMEROOM" | "SUBJECT"; "subjectId"?: string; "startsOn": string; "endsOn"?: (string) | null; "reason"?: string; };
  "Handover": { "id": (string) | null; "version": number; "createdAt": string; "updatedAt": string; "classId": (string) | null; "fromAssignmentId": (string) | null; "toMemberId": (string) | null; "effectiveOn": string; "reason": string; "status": "DRAFT" | "SUBMITTED" | "APPROVED" | "APPLIED" | "REJECTED"; };
  "HandoverCreate": { "classId": string; "fromAssignmentId": string; "toMemberId": string; "effectiveOn": string; "reason": string; };
  "RolloverItem": { "studentId": (string) | null; "fromClassId": (string) | null; "toClassId"?: (string) | null; "decision": "PROMOTED" | "REPEATED" | "LEFT" | "GRADUATED"; };
  "Rollover": { "id": (string) | null; "version": number; "createdAt": string; "updatedAt": string; "sourceYearId": (string) | null; "targetYearId": (string) | null; "plan": Array<ApiSchemas["RolloverItem"]>; "planHash"?: string; "status": "DRAFT" | "VALIDATED" | "APPLYING" | "APPLIED" | "FAILED"; "warnings"?: Array<string>; };
  "RolloverCreate": { "targetYearId": (string) | null; "plan": Array<ApiSchemas["RolloverItem"]>; };
  "PlanCommit": { "expectedVersion": number; "previewHash": string; };
  "Student": { "id": (string) | null; "version": number; "createdAt": string; "updatedAt": string; "studentCode": string; "fullName": string; "preferredName"?: (string) | null; "dateOfBirth"?: (string) | null; "status": "ACTIVE" | "LEFT" | "GRADUATED" | "ARCHIVED"; };
  "StudentCreate": { "studentCode": string; "fullName": string; "preferredName"?: (string) | null; "dateOfBirth"?: (string) | null; "initialClassId"?: (string) | null; "startsOn"?: string; };
  "StudentPatch": { "expectedVersion": number; "fullName"?: string; "preferredName"?: (string) | null; "dateOfBirth"?: (string) | null; };
  "Enrollment": { "id": (string) | null; "version": number; "createdAt": string; "updatedAt": string; "studentId": (string) | null; "classId": (string) | null; "yearId": (string) | null; "startsOn": string; "endsOn": (string) | null; "status": "ACTIVE" | "ENDED" | "CANCELLED"; };
  "EnrollmentCreate": { "studentId": (string) | null; "classId": (string) | null; "startsOn": string; };
  "Guardian": { "id": (string) | null; "version": number; "createdAt": string; "updatedAt": string; "fullName": string; "phone"?: (string) | null; "email"?: (string) | null; "status": "ACTIVE" | "ARCHIVED"; };
  "GuardianCreate": { "fullName": string; "phone"?: (string) | null; "email"?: (string) | null; };
  "GuardianPatch": { "expectedVersion": number; "fullName"?: string; "phone"?: (string) | null; "email"?: (string) | null; };
  "Relationship": { "id": (string) | null; "version": number; "createdAt": string; "updatedAt": string; "studentId": (string) | null; "guardianId": (string) | null; "relationshipLabel": string; "isPrimary": boolean; "canReceiveInfo": boolean; "status": "UNVERIFIED" | "VERIFIED" | "REVOKED"; "verifiedAt"?: (string) | null; };
  "RelationshipCreate": { "studentId": string; "guardianId": string; "relationshipLabel": string; "isPrimary"?: boolean; };
  "RelationshipPatch": { "expectedVersion": number; "relationshipLabel"?: string; "isPrimary"?: boolean; };
  "VerifyRelationship": { "expectedVersion": number; "canReceiveInfo": boolean; "verificationNote": string; };
  "StudentDetail": { "student": ApiSchemas["Student"]; "enrollments": Array<ApiSchemas["Enrollment"]>; "relationships"?: Array<ApiSchemas["Relationship"]>; "guardians"?: Array<ApiSchemas["Guardian"]>; "internalNote"?: string; };
  "Transfer": { "id": (string) | null; "version": number; "createdAt": string; "updatedAt": string; "studentId": (string) | null; "fromEnrollmentId": (string) | null; "toClassId"?: string; "effectiveOn": string; "reason": string; "status": "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "APPLIED" | "CANCELLED"; };
  "TransferCreate": { "studentId": string; "fromEnrollmentId": string; "toClassId"?: string; "effectiveOn": string; "reason": string; };
  "ParentAccess": { "id": (string) | null; "version": number; "createdAt": string; "updatedAt": string; "studentId": (string) | null; "yearId": (string) | null; "relationshipId": (string) | null; "allowedSections": Array<"overview" | "teachers" | "attendance" | "conduct" | "timetable" | "duties" | "activities" | "announcements" | "documents">; "allowDownload": boolean; "expiresAt": string; "revokedAt"?: (string) | null; "issuedToGuardianName"?: string; };
  "ParentAccessCreate": { "studentId": string; "yearId": string; "relationshipId": string; "allowedSections": Array<"overview" | "teachers" | "attendance" | "conduct" | "timetable" | "duties" | "activities" | "announcements" | "documents">; "allowDownload": boolean; "expiresAt": string; };
  "ParentAccessIssued": { "access": ApiSchemas["ParentAccess"]; "link": string; "displayOnce": boolean; };
  "AccessEvent": { "id": (string) | null; "accessLinkId": (string) | null; "eventKind": string; "occurredAt": string; "deviceSummary"?: string; "section"?: string; };
  "ParentExchange": { "token": string; };
  "ParentContext": { "viewId": (string) | null; "school": { "name": string; "slug": string; "publicContactPhone"?: (string) | null; }; "student": { "displayName": string; "classLabel": string; "schoolYearLabel": string; }; "allowedSections": Array<"overview" | "teachers" | "attendance" | "conduct" | "timetable" | "duties" | "activities" | "announcements" | "documents">; "allowDownload": boolean; "csrfToken": string; "expiresAt": string; };
  "ParentTeacher": { "displayName": string; "assignmentLabel": string; "subjectName"?: string; "workEmail"?: string; "workPhone"?: string; };
  "ParentAttendance": { "date": string; "slotLabel": string; "status": "UNMARKED" | "PRESENT" | "LATE" | "EXCUSED" | "UNEXCUSED"; "publicNote"?: string; "publishedAt": string; };
  "PointLine": { "label": string; "delta": string; "occurredAt": string; "reason": string; };
  "ParentConduct": { "periodId": (string) | null; "periodLabel": string; "revision": number; "basePoints": string; "bonusPoints": string; "penaltyPoints": string; "finalPoints": string; "classification": (string) | null; "lines": Array<ApiSchemas["PointLine"]>; "publishedAt": string; "adjusted": boolean; };
  "ParentLesson": { "date": string; "startsAt": string; "endsAt": string; "subjectName": string; "teacherName": string; "roomName"?: string; "changeNote"?: string; "status"?: "SCHEDULED" | "CANCELLED"; };
  "ParentDuty": { "date": string; "task": string; "status": string; "publishedAt": string; };
  "ParentActivity": { "id": (string) | null; "title": string; "description"?: string; "dueAt": string; "studentStatus": "ASSIGNED" | "SUBMITTED" | "NEEDS_REVISION" | "APPROVED" | "EXCUSED"; "publicReviewNote"?: string; "documents"?: Array<ApiSchemas["ParentDocument"]>; "publishedAt": string; };
  "ParentAnnouncement": { "id": (string) | null; "title": string; "sanitizedHtml": string; "publishedAt": string; "senderLabel": string; "documents": Array<ApiSchemas["ParentDocument"]>; };
  "ParentDocument": { "id": (string) | null; "title": string; "contentType": string; "byteSize": number; "downloadAllowed": boolean; "publishedAt": string; };
  "ParentOverview": { "context": ApiSchemas["ParentContext"]; "attendance": Array<ApiSchemas["ParentAttendance"]>; "latestConduct"?: ApiSchemas["ParentConduct"]; "teachers": Array<ApiSchemas["ParentTeacher"]>; "todayLessons": Array<ApiSchemas["ParentLesson"]>; "announcements": Array<ApiSchemas["ParentAnnouncement"]>; "asOf": string; };
  "Group": { "id": (string) | null; "version": number; "createdAt": string; "updatedAt": string; "classId": (string) | null; "name": string; "sortOrder": number; "enrollmentIds"?: Array<(string) | null>; };
  "GroupCreate": { "name": string; "sortOrder": number; };
  "GroupPatch": { "expectedVersion": number; "name"?: string; "sortOrder"?: number; };
  "GroupAssign": { "groupId": (string) | null; "enrollmentIds": Array<(string) | null>; "effectiveOn": string; "expectedClassVersion": number; "reason"?: string; };
  "Position": { "id": (string) | null; "version": number; "createdAt": string; "updatedAt": string; "classId": (string) | null; "code": string; "name": string; "singleHolder": boolean; "groupId"?: string; };
  "PositionCreate": { "code": string; "name": string; "singleHolder": boolean; "groupId"?: string; };
  "PositionPatch": { "expectedVersion": number; "name"?: string; "singleHolder"?: boolean; };
  "PositionAssignment": { "id": (string) | null; "version": number; "createdAt": string; "updatedAt": string; "positionId": (string) | null; "enrollmentId": (string) | null; "startsOn": string; "endsOn"?: (string) | null; "cancelledAt"?: (string) | null; };
  "EndPositionAssignment": { "expectedVersion": number; "endsOn": string; "reason": string; };
  "PositionAssign": { "positionId": (string) | null; "enrollmentId": (string) | null; "startsOn": string; "endsOn"?: (string) | null; "reason"?: string; };
  "Seat": { "key": string; "row": number; "column": number; "enrollmentId": (string) | null; };
  "SeatingPlan": { "id": (string) | null; "version": number; "createdAt": string; "updatedAt": string; "classId": (string) | null; "revision": number; "effectiveOn": string; "status": "DRAFT" | "ACTIVE" | "ARCHIVED"; "seats": Array<ApiSchemas["Seat"]>; "endsOn"?: (string) | null; };
  "SeatingSave": { "expectedVersion": number; "effectiveOn": string; "seats": Array<ApiSchemas["Seat"]>; };
  "SeatingCreate": { "effectiveOn": string; "seats": Array<ApiSchemas["Seat"]>; "expectedRevision"?: number; };
  "AttendanceRecord": { "id": (string) | null; "version": number; "createdAt": string; "updatedAt": string; "enrollmentId": (string) | null; "status": "UNMARKED" | "PRESENT" | "LATE" | "EXCUSED" | "UNEXCUSED"; "lateMinutes"?: number; "publicNote"?: string; "internalNote"?: string; };
  "AttendanceSession": { "id": (string) | null; "version": number; "createdAt": string; "updatedAt": string; "classId": (string) | null; "yearId": (string) | null; "date": string; "granularity": "DAILY" | "LESSON"; "lessonId"?: (string) | null; "status": "OPEN" | "LOCKED"; "records"?: Array<ApiSchemas["AttendanceRecord"]>; "dataVersion"?: number; "slot"?: "MORNING" | "AFTERNOON"; "conductSync"?: { "created": number; "excluded": number; "blocked": Array<{ "enrollmentId": string; "code": string; }>; }; };
  "AttendanceCreate": { "date": string; "granularity": "DAILY" | "LESSON"; "lessonId"?: (string) | null; "slot"?: "MORNING" | "AFTERNOON"; };
  "AttendanceBulk": { "expectedVersion": number; "records": Array<{ "enrollmentId": (string) | null; "expectedVersion": number; "status": "UNMARKED" | "PRESENT" | "LATE" | "EXCUSED" | "UNEXCUSED"; "lateMinutes"?: number; "publicNote"?: string; "internalNote"?: string; }>; "linkConduct"?: boolean; };
  "AttendanceSummary": { "granularity": "DAILY" | "LESSON"; "from": string; "to": string; "counts": { "unmarked": number; "present": number; "late": number; "excused": number; "unexcused": number; "expected": number; }; "records": Array<ApiSchemas["AttendanceRecord"]>; };
  "RuleSet": { "id": (string) | null; "version": number; "createdAt": string; "updatedAt": string; "name": string; "revision": number; "basePoints": string; "minimumPoints"?: (string) | null; "maximumPoints"?: (string) | null; "status": "DRAFT" | "ISSUED" | "RETIRED"; "rules"?: Array<ApiSchemas["ConductRule"]>; "thresholds"?: Array<{ "label": string; "minimumScore": string; }>; };
  "ConductRule": { "id": (string) | null; "code": string; "label": string; "groupName": string; "valueMode": "FIXED" | "MANUAL"; "defaultDelta": string; "minimumDelta"?: string; "maximumDelta"?: string; "reasonRequired": boolean; "maxOccurrencesPerDay"?: number; "attendanceStatus"?: "LATE" | "UNEXCUSED"; };
  "RuleSetCreate": { "name": string; "basePoints": string; "minimumPoints"?: string; "maximumPoints"?: string; };
  "RuleSetPatch": { "expectedVersion": number; "name"?: string; "basePoints"?: string; "minimumPoints"?: (string) | null; "maximumPoints"?: (string) | null; "rules"?: Array<ApiSchemas["ConductRule"]>; "thresholds"?: Array<{ "label": string; "minimumScore": string; }>; };
  "RuleSimulationResult": { "basePoints": string; "bonusPoints": string; "penaltyPoints": string; "finalPoints": string; "classification": (string) | null; "appliedRuleCount": number; };
  "RuleSimulation": { "ruleSetId": (string) | null; "events": Array<{ "ruleId": (string) | null; "manualDelta"?: string; }>; };
  "ClassRulesApply": { "ruleSetId": (string) | null; "startsOn": string; "endsOn"?: (string) | null; "expectedClassVersion": number; };
  "ConductPeriod": { "id": (string) | null; "version": number; "createdAt": string; "updatedAt": string; "classId": (string) | null; "weekId": (string) | null; "ruleSetId": (string) | null; "status": "OPEN" | "IN_REVIEW" | "LOCKED"; "dataVersion": number; "inputDeadline": (string) | null; };
  "ConductPeriodCreate": { "weekId": (string) | null; };
  "ConductRecord": { "id": (string) | null; "version": number; "createdAt": string; "updatedAt": string; "classId": (string) | null; "periodId": (string) | null; "enrollmentId": (string) | null; "ruleId": (string) | null; "deltaSnapshot": string; "ruleLabelSnapshot": string; "publicReason": string; "internalNote"?: string; "occurredAt": string; "status": "DRAFT" | "APPROVED" | "EXCLUDED"; "sourceKind": string; "sourceKey": string; "recordedBy": (string) | null; "lessonId"?: string; "subjectId"?: string; "sourceId"?: string; "exclusionReason"?: string; };
  "ConductRecordCreate": { "periodId": (string) | null; "enrollmentId": (string) | null; "ruleId": (string) | null; "manualDelta"?: string; "publicReason": string; "internalNote"?: string; "occurredAt": string; "sourceKind": "MANUAL" | "ATTENDANCE" | "ACTIVITY" | "POSITION"; "sourceId"?: (string) | null; "clientEventId": (string) | null; "lessonId"?: string; };
  "ConductRecordPatch": { "expectedVersion": number; "publicReason"?: string; "internalNote"?: string; "manualDelta"?: string; };
  "ConductSummary": { "period": ApiSchemas["ConductPeriod"]; "students": Array<{ "studentId": (string) | null; "enrollmentId": (string) | null; "fullName": string; "basePoints": string; "bonusPoints": string; "penaltyPoints": string; "finalPoints": string; "classification": (string) | null; "unreviewedCount": number; }>; "pendingCount": number; };
  "ReviewResult": { "period": ApiSchemas["ConductPeriod"]; "canLock": boolean; "blockers": Array<{ "code": string; "message": string; "recordId"?: (string) | null; }>; "summary": ApiSchemas["ConductSummary"]; };
  "PublishCommand": { "expectedSourceVersion": number; "expectedPublicationId"?: (string) | null; "reason"?: string; };
  "Publication": { "id": (string) | null; "version": number; "createdAt": string; "updatedAt": string; "kind": "CONDUCT" | "ATTENDANCE" | "TIMETABLE" | "DUTY" | "ACTIVITY" | "ANNOUNCEMENT"; "sourceId": (string) | null; "classId"?: (string) | null; "yearId": (string) | null; "revision": number; "sourceVersion": number; "status": "READY" | "PUBLISHED" | "SUPERSEDED" | "WITHDRAWN"; "publishedAt"?: (string) | null; "contentHash": string; };
  "PublicationDetail": { "publication": ApiSchemas["Publication"]; "conduct"?: ApiSchemas["ConductSummary"]; "attendance"?: ApiSchemas["AttendanceSession"]; "timetable"?: ApiSchemas["Timetable"]; "activity"?: ApiSchemas["Activity"]; "announcement"?: ApiSchemas["Announcement"]; "duty"?: ApiSchemas["DutySchedule"]; "lessons"?: Array<ApiSchemas["Lesson"]>; };
  "Adjustment": { "id": (string) | null; "version": number; "createdAt": string; "updatedAt": string; "periodId": (string) | null; "baselinePublicationId": (string) | null; "reason": string; "status": "SUBMITTED" | "APPROVED" | "REJECTED" | "APPLIED" | "CANCELLED"; "proposedChanges": Array<{ "recordId": (string) | null; "action": "EXCLUDE" | "REPLACE"; "replacement"?: ApiSchemas["ConductRecordCreate"]; }>; "preview"?: { "before": ApiSchemas["ConductSummary"]; "after": ApiSchemas["ConductSummary"]; }; "decisionReason"?: string; "resultPublicationId"?: string; };
  "AdjustmentCreate": { "periodId": string; "baselinePublicationId": string; "reason": string; "proposedChanges": Array<{ "recordId": string; "action": "EXCLUDE" | "REPLACE"; "replacement"?: ApiSchemas["ConductRecordCreate"]; }>; };
  "TimetableEntry": { "id"?: (string) | null; "weekday": number; "periodNumber": number; "subjectId": (string) | null; "memberId": (string) | null; "roomId"?: (string) | null; "startsAtLocal": string; "endsAtLocal": string; };
  "Timetable": { "id": (string) | null; "version": number; "createdAt": string; "updatedAt": string; "classId": (string) | null; "yearId": (string) | null; "revision": number; "startsOn": string; "endsOn": string; "status": "DRAFT" | "READY" | "PUBLISHED" | "ARCHIVED"; "entries": Array<ApiSchemas["TimetableEntry"]>; "dataVersion"?: number; "publishedAt"?: (string) | null; };
  "TimetableCreate": { "startsOn": string; "endsOn": string; "entries": Array<ApiSchemas["TimetableEntry"]>; };
  "TimetablePatch": { "expectedVersion": number; "startsOn"?: string; "endsOn"?: string; "entries"?: Array<ApiSchemas["TimetableEntry"]>; };
  "ScheduleConflicts": { "valid": boolean; "conflicts": Array<{ "kind": "CLASS" | "TEACHER" | "ROOM" | "ASSIGNMENT" | "HOLIDAY"; "startsAt": string; "endsAt": string; "message": string; }>; };
  "Lesson": { "id": (string) | null; "classId": (string) | null; "subjectId": (string) | null; "memberId": (string) | null; "roomId"?: (string) | null; "startsAt": string; "endsAt": string; "status": "SCHEDULED" | "CANCELLED"; "yearId"?: string; "className"?: string; "subjectName"?: string; "teacherName"?: string; "roomName"?: (string) | null; "periodNumber"?: (number) | null; "changeReason"?: (string) | null; };
  "DutySchedule": { "id": (string) | null; "version": number; "createdAt": string; "updatedAt": string; "classId": (string) | null; "yearId": (string) | null; "startsOn": string; "endsOn": string; "status": "DRAFT" | "PUBLISHED" | "ARCHIVED"; "assignments": Array<{ "id"?: (string) | null; "enrollmentId": (string) | null; "dutyDate": string; "task": string; "status"?: "ASSIGNED" | "DONE" | "CANCELLED"; }>; "dataVersion"?: number; "publishedAt"?: (string) | null; "groupAssignments"?: Array<ApiSchemas["GroupDutyAssignment"]>; };
  "DutyCreate": { "startsOn": string; "endsOn": string; "assignments": Array<{ "id"?: string; "enrollmentId": string; "dutyDate": string; "task": string; "status"?: "ASSIGNED" | "DONE" | "CANCELLED"; }>; "groupAssignments"?: Array<ApiSchemas["GroupDutyAssignment"]>; };
  "DutySchedulePatch": { "expectedVersion": number; "assignments"?: Array<{ "id"?: string; "enrollmentId": string; "dutyDate": string; "task": string; "status"?: "ASSIGNED" | "DONE" | "CANCELLED"; }>; "startsOn"?: string; "endsOn"?: string; "groupAssignments"?: Array<ApiSchemas["GroupDutyAssignment"]>; };
  "Activity": { "id": (string) | null; "version": number; "createdAt": string; "updatedAt": string; "classId": (string) | null; "yearId": (string) | null; "title": string; "description": string; "dueAt": string; "evidenceRequired": boolean; "status": "DRAFT" | "ASSIGNED" | "CLOSED" | "ARCHIVED"; "participantCount"?: number; "approvedCount"?: number; "dataVersion"?: number; "assignedAt"?: (string) | null; "illustration"?: "trophy" | "stem" | "clean" | "book" | "heart"; };
  "ActivityCreate": { "title": string; "description": string; "dueAt": string; "evidenceRequired": boolean; "enrollmentIds": Array<(string) | null>; "illustration"?: "trophy" | "stem" | "clean" | "book" | "heart"; };
  "ActivityPatch": { "expectedVersion": number; "title"?: string; "description"?: string; "dueAt"?: string; "evidenceRequired"?: boolean; "illustration"?: "trophy" | "stem" | "clean" | "book" | "heart"; "enrollmentIds"?: Array<(string) | null>; "status"?: "ASSIGNED" | "CLOSED" | "ARCHIVED"; };
  "ParticipantStatusCommand": { "expectedVersion": number; "status": "APPROVED" | "NEEDS_REVISION" | "EXCUSED" | "ASSIGNED" | "SUBMITTED"; "reason": string; };
  "Participant": { "id": (string) | null; "version": number; "createdAt": string; "updatedAt": string; "activityId": (string) | null; "enrollmentId": (string) | null; "status": "ASSIGNED" | "SUBMITTED" | "NEEDS_REVISION" | "APPROVED" | "EXCUSED"; "reviewNote"?: string; "cancelledAt"?: (string) | null; };
  "File": { "id": (string) | null; "version": number; "createdAt": string; "updatedAt": string; "originalName": string; "contentType": string; "byteSize": number; "sha256": string; "status": "UPLOADING" | "QUARANTINED" | "READY" | "REJECTED" | "ARCHIVED"; "uploadedBy": (string) | null; "scanStatus"?: "NOT_SCANNED" | "SCANNED" | "GENERATED"; "rejectionCode"?: (string) | null; };
  "UploadRequest": { "file": string; "purpose": "EVIDENCE" | "CLASS_DOCUMENT" | "IMPORT" | "SCHOOL_LOGO"; "classId"?: (string) | null; };
  "FileLinkCreate": { "fileId": (string) | null; "studentId"?: (string) | null; "classId"?: (string) | null; "activityId"?: (string) | null; "announcementId"?: (string) | null; "shareWithGuardian": boolean; };
  "Evidence": { "id": (string) | null; "version": number; "createdAt": string; "updatedAt": string; "participantId": (string) | null; "fileId": (string) | null; "submittedBy": (string) | null; "caption"?: string; "status": "SUBMITTED" | "APPROVED" | "NEEDS_REVISION" | "REJECTED"; "reviewReason"?: string; "shareWithGuardian": boolean; };
  "EvidenceCreate": { "participantId": (string) | null; "fileId": (string) | null; "caption"?: string; "shareWithGuardian": boolean; };
  "ReviewEvidence": { "expectedVersion": number; "decision": "APPROVED" | "NEEDS_REVISION" | "REJECTED"; "reason"?: string; "shareWithGuardian"?: boolean; };
  "Audience": { "kind": "PUBLIC" | "SCHOOL" | "GRADE" | "CLASS" | "STUDENT" | "STAFF"; "id"?: (string) | null; };
  "Announcement": { "id": (string) | null; "version": number; "createdAt": string; "updatedAt": string; "yearId": (string) | null; "classId"?: (string) | null; "title": string; "sanitizedHtml": string; "status": "DRAFT" | "SCHEDULED" | "PUBLISHED" | "WITHDRAWN"; "scheduledAt"?: (string) | null; "targets": Array<ApiSchemas["Audience"]>; "fileIds"?: Array<(string) | null>; "summary"?: string; "audience"?: "FAMILIES" | "STAFF" | "ALL"; "internalNote"?: string; "rootId"?: string; "dataVersion"?: number; "discardedAt"?: (string) | null; "scheduleState"?: "PENDING" | "LEASED" | "DONE" | "FAILED" | "CANCELLED"; "scheduleErrorCode"?: string; };
  "AnnouncementCreate": { "yearId": string; "classId"?: string; "title": string; "sanitizedHtml": string; "targets": Array<ApiSchemas["Audience"]>; "fileIds"?: Array<string>; "summary"?: string; "audience"?: "FAMILIES" | "STAFF" | "ALL"; "internalNote"?: string; };
  "AnnouncementPatch": { "expectedVersion": number; "title"?: string; "sanitizedHtml"?: string; "targets"?: Array<ApiSchemas["Audience"]>; "fileIds"?: Array<string>; "summary"?: string; "audience"?: "FAMILIES" | "STAFF" | "ALL"; "internalNote"?: string; "discard"?: boolean; };
  "SchedulePublish": { "expectedVersion": number; "scheduledAt": string; };
  "ImportJob": { "id": (string) | null; "version": number; "createdAt": string; "updatedAt": string; "kind": "STUDENTS" | "STAFF" | "CLASSES" | "TIMETABLE"; "fileId": (string) | null; "status": "UPLOADED" | "VALIDATING" | "READY" | "APPLYING" | "COMPLETED" | "FAILED" | "CANCELLED"; "previewHash"?: string; "summary"?: { "added": number; "updated": number; "skipped": number; "invalid": number; "processed": number; }; "yearId"?: string; "classId"?: string; "columns"?: Array<string>; };
  "ImportCreate": { "kind": "STUDENTS" | "STAFF" | "CLASSES" | "TIMETABLE"; "fileId": (string) | null; "yearId": (string) | null; "classId"?: (string) | null; };
  "ImportMapping": { "expectedVersion": number; "mapping": Array<{ "sourceColumn": string; "targetField": string; }>; "mode": "ADD_ONLY" | "UPSERT_VERIFIED_CODE"; };
  "ImportRow": { "rowNumber": number; "status": string; "errors": Array<{ "field": string; "code": string; "message": string; }>; "values": { [key: string]: unknown; }; "decision"?: "ADD" | "UPDATE" | "SKIP"; "matchedId"?: string; };
  "ExportJob": { "id": (string) | null; "version": number; "createdAt": string; "updatedAt": string; "reportType": "attendance" | "conduct" | "activities" | "class-progress" | "parent-access" | "student"; "format": "CSV" | "XLSX" | "PDF"; "status": "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED" | "EXPIRED"; "fileId"?: (string) | null; "expiresAt"?: string; "classId"?: string; "requestedBy"?: string; "asOf"?: string; "contentHash"?: string; "lastErrorCode"?: string; };
  "ExportCreate": { "reportType": "attendance" | "conduct" | "activities" | "class-progress" | "parent-access" | "student"; "format": "CSV" | "XLSX" | "PDF"; "yearId": (string) | null; "classId"?: (string) | null; "studentId"?: (string) | null; "from": string; "to": string; "gradeId"?: string; "weekId"?: string; "dataSource"?: "LIVE_INTERNAL" | "PUBLISHED_SNAPSHOT"; "scope"?: "SCHOOL" | "CLASS"; };
  "Report": { "reportType": string; "metrics": Array<ApiSchemas["Metric"]>; "asOf": string; "rows": Array<{ "studentId"?: (string) | null; "classId"?: (string) | null; "label": string; "values": { [key: string]: unknown; }; }>; "dataSource": "LIVE_INTERNAL" | "PUBLISHED_SNAPSHOT"; "title"?: string; "schoolName"?: string; "yearName"?: string; "scopeLabel"?: string; "from"?: string; "to"?: string; "columns"?: Array<{ "key": string; "label": string; }>; "publicationIds"?: Array<string>; "notes"?: Array<string>; };
  "Notification": { "yearId"?: string; "id": (string) | null; "version": number; "createdAt": string; "updatedAt": string; "title": string; "kind": string; "schoolId": (string) | null; "targetType": string; "targetId": (string) | null; "readAt"?: (string) | null; "body"?: string; "schoolName"?: string; "classId"?: string; "accessible"?: boolean; };
  "AuditEvent": { "id": (string) | null; "actorLabel": string; "action": string; "targetType": string; "targetId"?: (string) | null; "createdAt": string; "reason"?: string; "changes": Array<{ "field": string; "before": (string) | null; "after": (string) | null; }>; "actorId"?: (string) | null; };
  "Settings": { "version": number; "schoolName"?: string; "timezone": string; "parentLinkTtlDays": number; "parentSectionsDefault": Array<"overview" | "teachers" | "attendance" | "conduct" | "timetable" | "duties" | "activities" | "announcements" | "documents">; "homeroomMayPublish": boolean; "requireSecondApprovalForAdjustment": boolean; "attendanceGranularity": "DAILY" | "LESSON"; "academicResultsEnabled": "OFF"; "reportHeader"?: string; "shareTeacherPhone"?: boolean; "shareTeacherEmail"?: boolean; "contactHours"?: string; };
  "SettingsPatch": { "schoolName"?: string; "timezone"?: string; "parentLinkTtlDays"?: number; "parentSectionsDefault"?: Array<"overview" | "teachers" | "attendance" | "conduct" | "timetable" | "duties" | "activities" | "announcements" | "documents">; "homeroomMayPublish"?: boolean; "requireSecondApprovalForAdjustment"?: boolean; "attendanceGranularity"?: "DAILY" | "LESSON"; "expectedVersion": number; "reportHeader"?: string; "shareTeacherPhone"?: boolean; "shareTeacherEmail"?: boolean; "contactHours"?: string; };
  "PlatformSettings": { "version": number; "brandName": string; "supportEmail": (string) | null; "publicSupportPhone"?: (string) | null; "footerNote"?: string; };
  "PlatformSettingsPatch": { "expectedVersion": number; "brandName"?: string; "supportEmail"?: (string) | null; "publicSupportPhone"?: (string) | null; "footerNote"?: string; };
  "SupportTicket": { "id": (string) | null; "version": number; "createdAt": string; "updatedAt": string; "schoolId": (string) | null; "subject": string; "description": string; "status": "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED" | "WAITING_SCHOOL"; "priority": "NORMAL" | "HIGH" | "LOW"; "assigneeId"?: (string) | null; "schoolName"?: string; "requesterName"?: string; "assigneeName"?: (string) | null; "operatorChoices"?: Array<{ "id": string; "name": string; }>; "requesterId"?: string; "schoolStatus"?: "DRAFT" | "ACTIVE" | "SUSPENDED" | "ARCHIVED"; "messageCount"?: number; };
  "TicketCreate": { "subject": string; "description": string; "priority": "NORMAL" | "HIGH" | "LOW"; };
  "SupportTicketPatch": { "expectedVersion": number; "status"?: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED" | "WAITING_SCHOOL"; "assigneeId"?: (string) | null; "message"?: string; };
  "SupportMessage": { "id": (string) | null; "authorLabel": string; "body": string; "createdAt": string; "side"?: "SCHOOL" | "PLATFORM" | "UNKNOWN"; "authorId"?: (string) | null; };
  "MessageCreate": { "body": string; };
  "SupportAccess": { "id": (string) | null; "version": number; "createdAt": string; "updatedAt": string; "schoolId": (string) | null; "ticketId": (string) | null; "operatorId": (string) | null; "classId"?: (string) | null; "allowedActions": Array<string>; "reason": string; "status": "REQUESTED" | "APPROVED" | "REVOKED" | "REJECTED"; "validFrom": string; "validUntil": string; "requestedById"?: string; "approvedById"?: string; "operatorName"?: string; "approverName"?: (string) | null; "requesterName"?: (string) | null; "schoolName"?: string; "effective"?: boolean; "revokedAt"?: (string) | null; "viewStatus"?: "requested" | "active" | "expired" | "revoked" | "declined" | "inactive"; };
  "SupportAccessCreate": { "ticketId": string; "operatorId": string; "classId"?: string; "allowedActions": Array<string>; "reason": string; "validFrom": string; "validUntil": string; };
  "OperationRun": { "id": (string) | null; "kind": string; "status": "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED"; "startedAt"?: string; "finishedAt"?: string; "summary"?: { [key: string]: unknown; }; };
  "PublicSchool": { "name": string; "slug": string; "publicAddress"?: string; "publicContactEmail"?: string; "publicContactPhone"?: string; "announcements": Array<ApiSchemas["ParentAnnouncement"]>; };
  "HealthResponse": { "data": ApiSchemas["Health"]; "requestId": string; };
  "CsrfResponse": { "data": ApiSchemas["Csrf"]; "requestId": string; };
  "LoginResultResponse": { "data": ApiSchemas["LoginResult"]; "requestId": string; };
  "AckResponse": { "data": ApiSchemas["Ack"]; "requestId": string; };
  "ContextResponse": { "data": ApiSchemas["Context"]; "requestId": string; };
  "UserResponse": { "data": ApiSchemas["User"]; "requestId": string; };
  "StaffSessionPage": { "data": Array<ApiSchemas["StaffSession"]>; "page": ApiSchemas["PageInfo"]; "requestId": string; };
  "InvitationResponse": { "data": ApiSchemas["Invitation"]; "requestId": string; };
  "NotificationPage": { "data": Array<ApiSchemas["Notification"]>; "page": ApiSchemas["PageInfo"]; "requestId": string; };
  "DashboardResponse": { "data": ApiSchemas["Dashboard"]; "requestId": string; };
  "SchoolPage": { "data": Array<ApiSchemas["School"]>; "page": ApiSchemas["PageInfo"]; "requestId": string; };
  "SchoolResponse": { "data": ApiSchemas["School"]; "requestId": string; };
  "MemberPage": { "data": Array<ApiSchemas["Member"]>; "page": ApiSchemas["PageInfo"]; "requestId": string; };
  "SupportTicketPage": { "data": Array<ApiSchemas["SupportTicket"]>; "page": ApiSchemas["PageInfo"]; "requestId": string; };
  "SupportTicketResponse": { "data": ApiSchemas["SupportTicket"]; "requestId": string; };
  "SupportMessagePage": { "data": Array<ApiSchemas["SupportMessage"]>; "page": ApiSchemas["PageInfo"]; "requestId": string; };
  "SupportMessageResponse": { "data": ApiSchemas["SupportMessage"]; "requestId": string; };
  "SupportAccessPage": { "data": Array<ApiSchemas["SupportAccess"]>; "page": ApiSchemas["PageInfo"]; "requestId": string; };
  "AuditEventPage": { "data": Array<ApiSchemas["AuditEvent"]>; "page": ApiSchemas["PageInfo"]; "requestId": string; };
  "OperationRunPage": { "data": Array<ApiSchemas["OperationRun"]>; "page": ApiSchemas["PageInfo"]; "requestId": string; };
  "PlatformSettingsResponse": { "data": ApiSchemas["PlatformSettings"]; "requestId": string; };
  "YearPage": { "data": Array<ApiSchemas["Year"]>; "page": ApiSchemas["PageInfo"]; "requestId": string; };
  "YearResponse": { "data": ApiSchemas["Year"]; "requestId": string; };
  "TermPage": { "data": Array<ApiSchemas["Term"]>; "page": ApiSchemas["PageInfo"]; "requestId": string; };
  "TermResponse": { "data": ApiSchemas["Term"]; "requestId": string; };
  "WeekPage": { "data": Array<ApiSchemas["Week"]>; "page": ApiSchemas["PageInfo"]; "requestId": string; };
  "WeekResponse": { "data": ApiSchemas["Week"]; "requestId": string; };
  "CalendarEventPage": { "data": Array<ApiSchemas["CalendarEvent"]>; "page": ApiSchemas["PageInfo"]; "requestId": string; };
  "CalendarEventResponse": { "data": ApiSchemas["CalendarEvent"]; "requestId": string; };
  "ClassPage": { "data": Array<ApiSchemas["Class"]>; "page": ApiSchemas["PageInfo"]; "requestId": string; };
  "ClassResponse": { "data": ApiSchemas["Class"]; "requestId": string; };
  "DictionaryItemPage": { "data": Array<ApiSchemas["DictionaryItem"]>; "page": ApiSchemas["PageInfo"]; "requestId": string; };
  "DictionaryItemResponse": { "data": ApiSchemas["DictionaryItem"]; "requestId": string; };
  "RolloverResponse": { "data": ApiSchemas["Rollover"]; "requestId": string; };
  "MemberResponse": { "data": ApiSchemas["Member"]; "requestId": string; };
  "InvitationPage": { "data": Array<ApiSchemas["Invitation"]>; "page": ApiSchemas["PageInfo"]; "requestId": string; };
  "RolePage": { "data": Array<ApiSchemas["Role"]>; "page": ApiSchemas["PageInfo"]; "requestId": string; };
  "RoleResponse": { "data": ApiSchemas["Role"]; "requestId": string; };
  "PermissionPreviewResponse": { "data": ApiSchemas["PermissionPreview"]; "requestId": string; };
  "GrantViewResponse": { "data": ApiSchemas["GrantView"]; "requestId": string; };
  "AssignmentPage": { "data": Array<ApiSchemas["Assignment"]>; "page": ApiSchemas["PageInfo"]; "requestId": string; };
  "AssignmentResponse": { "data": ApiSchemas["Assignment"]; "requestId": string; };
  "HandoverPage": { "data": Array<ApiSchemas["Handover"]>; "page": ApiSchemas["PageInfo"]; "requestId": string; };
  "HandoverResponse": { "data": ApiSchemas["Handover"]; "requestId": string; };
  "StudentPage": { "data": Array<ApiSchemas["Student"]>; "page": ApiSchemas["PageInfo"]; "requestId": string; };
  "StudentResponse": { "data": ApiSchemas["Student"]; "requestId": string; };
  "StudentDetailResponse": { "data": ApiSchemas["StudentDetail"]; "requestId": string; };
  "EnrollmentPage": { "data": Array<ApiSchemas["Enrollment"]>; "page": ApiSchemas["PageInfo"]; "requestId": string; };
  "EnrollmentResponse": { "data": ApiSchemas["Enrollment"]; "requestId": string; };
  "TransferPage": { "data": Array<ApiSchemas["Transfer"]>; "page": ApiSchemas["PageInfo"]; "requestId": string; };
  "TransferResponse": { "data": ApiSchemas["Transfer"]; "requestId": string; };
  "GuardianPage": { "data": Array<ApiSchemas["Guardian"]>; "page": ApiSchemas["PageInfo"]; "requestId": string; };
  "GuardianResponse": { "data": ApiSchemas["Guardian"]; "requestId": string; };
  "RelationshipPage": { "data": Array<ApiSchemas["Relationship"]>; "page": ApiSchemas["PageInfo"]; "requestId": string; };
  "RelationshipResponse": { "data": ApiSchemas["Relationship"]; "requestId": string; };
  "ParentAccessPage": { "data": Array<ApiSchemas["ParentAccess"]>; "page": ApiSchemas["PageInfo"]; "requestId": string; };
  "ParentAccessIssuedResponse": { "data": ApiSchemas["ParentAccessIssued"]; "requestId": string; };
  "ParentAccessResponse": { "data": ApiSchemas["ParentAccess"]; "requestId": string; };
  "AccessEventPage": { "data": Array<ApiSchemas["AccessEvent"]>; "page": ApiSchemas["PageInfo"]; "requestId": string; };
  "ParentOverviewResponse": { "data": ApiSchemas["ParentOverview"]; "requestId": string; };
  "LessonPage": { "data": Array<ApiSchemas["Lesson"]>; "page": ApiSchemas["PageInfo"]; "requestId": string; };
  "TaskPage": { "data": Array<ApiSchemas["Task"]>; "page": ApiSchemas["PageInfo"]; "requestId": string; };
  "AnnouncementPage": { "data": Array<ApiSchemas["Announcement"]>; "page": ApiSchemas["PageInfo"]; "requestId": string; };
  "GroupPage": { "data": Array<ApiSchemas["Group"]>; "page": ApiSchemas["PageInfo"]; "requestId": string; };
  "GroupResponse": { "data": ApiSchemas["Group"]; "requestId": string; };
  "PositionPage": { "data": Array<ApiSchemas["Position"]>; "page": ApiSchemas["PageInfo"]; "requestId": string; };
  "PositionResponse": { "data": ApiSchemas["Position"]; "requestId": string; };
  "SeatingPlanPage": { "data": Array<ApiSchemas["SeatingPlan"]>; "page": ApiSchemas["PageInfo"]; "requestId": string; };
  "SeatingPlanResponse": { "data": ApiSchemas["SeatingPlan"]; "requestId": string; };
  "PositionAssignmentPage": { "data": Array<ApiSchemas["PositionAssignment"]>; "page": ApiSchemas["PageInfo"]; "requestId": string; };
  "PositionAssignmentResponse": { "data": ApiSchemas["PositionAssignment"]; "requestId": string; };
  "AttendanceSessionPage": { "data": Array<ApiSchemas["AttendanceSession"]>; "page": ApiSchemas["PageInfo"]; "requestId": string; };
  "AttendanceSessionResponse": { "data": ApiSchemas["AttendanceSession"]; "requestId": string; };
  "AttendanceSummaryResponse": { "data": ApiSchemas["AttendanceSummary"]; "requestId": string; };
  "PublicationResponse": { "data": ApiSchemas["Publication"]; "requestId": string; };
  "RuleSetPage": { "data": Array<ApiSchemas["RuleSet"]>; "page": ApiSchemas["PageInfo"]; "requestId": string; };
  "RuleSetResponse": { "data": ApiSchemas["RuleSet"]; "requestId": string; };
  "RuleSimulationResultResponse": { "data": ApiSchemas["RuleSimulationResult"]; "requestId": string; };
  "ConductPeriodPage": { "data": Array<ApiSchemas["ConductPeriod"]>; "page": ApiSchemas["PageInfo"]; "requestId": string; };
  "ConductPeriodResponse": { "data": ApiSchemas["ConductPeriod"]; "requestId": string; };
  "ConductSummaryResponse": { "data": ApiSchemas["ConductSummary"]; "requestId": string; };
  "ConductRecordPage": { "data": Array<ApiSchemas["ConductRecord"]>; "page": ApiSchemas["PageInfo"]; "requestId": string; };
  "ConductRecordResponse": { "data": ApiSchemas["ConductRecord"]; "requestId": string; };
  "ReviewResultResponse": { "data": ApiSchemas["ReviewResult"]; "requestId": string; };
  "AdjustmentPage": { "data": Array<ApiSchemas["Adjustment"]>; "page": ApiSchemas["PageInfo"]; "requestId": string; };
  "AdjustmentResponse": { "data": ApiSchemas["Adjustment"]; "requestId": string; };
  "PublicationPage": { "data": Array<ApiSchemas["Publication"]>; "page": ApiSchemas["PageInfo"]; "requestId": string; };
  "PublicationDetailResponse": { "data": ApiSchemas["PublicationDetail"]; "requestId": string; };
  "TimetablePage": { "data": Array<ApiSchemas["Timetable"]>; "page": ApiSchemas["PageInfo"]; "requestId": string; };
  "TimetableResponse": { "data": ApiSchemas["Timetable"]; "requestId": string; };
  "ScheduleConflictsResponse": { "data": ApiSchemas["ScheduleConflicts"]; "requestId": string; };
  "DutySchedulePage": { "data": Array<ApiSchemas["DutySchedule"]>; "page": ApiSchemas["PageInfo"]; "requestId": string; };
  "DutyScheduleResponse": { "data": ApiSchemas["DutySchedule"]; "requestId": string; };
  "ActivityPage": { "data": Array<ApiSchemas["Activity"]>; "page": ApiSchemas["PageInfo"]; "requestId": string; };
  "ActivityResponse": { "data": ApiSchemas["Activity"]; "requestId": string; };
  "ParticipantResponse": { "data": ApiSchemas["Participant"]; "requestId": string; };
  "ParticipantPage": { "data": Array<ApiSchemas["Participant"]>; "page": ApiSchemas["PageInfo"]; "requestId": string; };
  "EvidencePage": { "data": Array<ApiSchemas["Evidence"]>; "page": ApiSchemas["PageInfo"]; "requestId": string; };
  "EvidenceResponse": { "data": ApiSchemas["Evidence"]; "requestId": string; };
  "FilePage": { "data": Array<ApiSchemas["File"]>; "page": ApiSchemas["PageInfo"]; "requestId": string; };
  "FileResponse": { "data": ApiSchemas["File"]; "requestId": string; };
  "AnnouncementResponse": { "data": ApiSchemas["Announcement"]; "requestId": string; };
  "ImportJobPage": { "data": Array<ApiSchemas["ImportJob"]>; "page": ApiSchemas["PageInfo"]; "requestId": string; };
  "ImportJobResponse": { "data": ApiSchemas["ImportJob"]; "requestId": string; };
  "ImportRowPage": { "data": Array<ApiSchemas["ImportRow"]>; "page": ApiSchemas["PageInfo"]; "requestId": string; };
  "ReportResponse": { "data": ApiSchemas["Report"]; "requestId": string; };
  "ExportJobPage": { "data": Array<ApiSchemas["ExportJob"]>; "page": ApiSchemas["PageInfo"]; "requestId": string; };
  "ExportJobResponse": { "data": ApiSchemas["ExportJob"]; "requestId": string; };
  "SettingsResponse": { "data": ApiSchemas["Settings"]; "requestId": string; };
  "SupportAccessResponse": { "data": ApiSchemas["SupportAccess"]; "requestId": string; };
  "ParentContextResponse": { "data": ApiSchemas["ParentContext"]; "requestId": string; };
  "ParentAttendancePage": { "data": Array<ApiSchemas["ParentAttendance"]>; "page": ApiSchemas["PageInfo"]; "requestId": string; };
  "ParentConductPage": { "data": Array<ApiSchemas["ParentConduct"]>; "page": ApiSchemas["PageInfo"]; "requestId": string; };
  "ParentConductResponse": { "data": ApiSchemas["ParentConduct"]; "requestId": string; };
  "ParentLessonPage": { "data": Array<ApiSchemas["ParentLesson"]>; "page": ApiSchemas["PageInfo"]; "requestId": string; };
  "ParentDutyPage": { "data": Array<ApiSchemas["ParentDuty"]>; "page": ApiSchemas["PageInfo"]; "requestId": string; };
  "ParentActivityPage": { "data": Array<ApiSchemas["ParentActivity"]>; "page": ApiSchemas["PageInfo"]; "requestId": string; };
  "ParentActivityResponse": { "data": ApiSchemas["ParentActivity"]; "requestId": string; };
  "ParentAnnouncementPage": { "data": Array<ApiSchemas["ParentAnnouncement"]>; "page": ApiSchemas["PageInfo"]; "requestId": string; };
  "ParentAnnouncementResponse": { "data": ApiSchemas["ParentAnnouncement"]; "requestId": string; };
  "ParentTeacherPage": { "data": Array<ApiSchemas["ParentTeacher"]>; "page": ApiSchemas["PageInfo"]; "requestId": string; };
  "ParentDocumentPage": { "data": Array<ApiSchemas["ParentDocument"]>; "page": ApiSchemas["PageInfo"]; "requestId": string; };
  "PublicSchoolResponse": { "data": ApiSchemas["PublicSchool"]; "requestId": string; };
  "ParentLessonBatch": { "items": Array<ApiSchemas["ParentLesson"]>; };
  "ParentDutyBatch": { "items": Array<ApiSchemas["ParentDuty"]>; };
  "GroupDutyAssignment": { "id"?: string; "groupId": string; "dutyDate": string; "task": string; "status"?: "ASSIGNED" | "DONE" | "CANCELLED"; };
  "SupportAccessRevoke": { "expectedVersion": number; "reason": string; "decision"?: "REVOKE" | "REJECT"; };
  "RolloverPreviewStudent": { "id": string; "studentCode": string; "fullName": string; "status": "ACTIVE" | "LEFT" | "GRADUATED" | "ARCHIVED"; };
  "RolloverPreviewSourceClass": { "id": string; "name": string; "gradeLevel": (number) | null; "students": Array<ApiSchemas["RolloverPreviewStudent"]>; };
  "RolloverPreviewTargetClass": { "id": string; "name": string; "gradeLevelId": string; "studentCount": number; };
  "RolloverPreviewTarget": { "year": ApiSchemas["Year"]; "classes": Array<ApiSchemas["RolloverPreviewTargetClass"]>; };
  "RolloverPreview": { "source": ApiSchemas["Year"]; "referenceDate": string; "sourceClasses": Array<ApiSchemas["RolloverPreviewSourceClass"]>; "targets": Array<ApiSchemas["RolloverPreviewTarget"]>; "grades": Array<ApiSchemas["DictionaryItem"]>; };
  "RolloverPreviewResponse": { "data": ApiSchemas["RolloverPreview"]; "requestId": string; };
  "SchoolOverviewKpi": { "activeClasses": (number) | null; "draftClasses": (number) | null; "prevClasses": (number) | null; "staffActive": (number) | null; "students": (number) | null; "prevStudents": (number) | null; "linksActive": (number) | null; "linksOpened": (number) | null; };
  "SchoolOverviewStep": { "key": string; "label": string; "done": (boolean) | null; "detail": string; "href": string; };
  "SchoolOverviewClass": { "roomId"?: string; "motto"?: (string) | null; "id": (string) | null; "version": number; "createdAt": string; "updatedAt": string; "yearId": (string) | null; "gradeLevelId": (string) | null; "code": string; "name": string; "capacity": number; "status": "DRAFT" | "ACTIVE" | "ARCHIVED"; "studentCount"?: (number) | null; "yearName"?: string; "gradeName"?: string; "roomCode"?: (string) | null; "homeroomName"?: (string) | null; "homeroomUserId"?: string; "homeroomMemberId"?: string; "subjectTeacherCount"?: number; "hasTimetable"?: boolean; "inactiveAssignmentCount"?: number; "referenceDate"?: string; "myAssignments"?: Array<{ "id": string; "kind": "HOMEROOM" | "SUBJECT"; "subjectId"?: string; "startsOn": string; "endsOn"?: string; }>; "tasks": Array<string>; "severity": "blocked" | "attention"; };
  "SchoolOverviewTodayItem": { "key": string; "label": string; "detail": string; "href": string; "tone": "danger" | "warning" | "info"; };
  "SchoolOverviewAnnouncement": { "id": string; "title": string; "summary": string; "status": "PUBLISHED" | "SCHEDULED"; "createdAt": string; "publishedAt": (string) | null; "scheduledAt": (string) | null; };
  "SchoolOverviewDetails": { "year": (ApiSchemas["Year"] | (null) | null); "prevYear": (ApiSchemas["Year"] | (null) | null); "kpi": ApiSchemas["SchoolOverviewKpi"]; "setup": Array<ApiSchemas["SchoolOverviewStep"]>; "classesNeedingAction": (Array<ApiSchemas["SchoolOverviewClass"]>) | null; "todayItems": (Array<ApiSchemas["SchoolOverviewTodayItem"]>) | null; "announcements": (Array<ApiSchemas["SchoolOverviewAnnouncement"]>) | null; "classesNeedingActionTotal": (number) | null; };
  "PlatformAdminInviteRequest": { "email": string; "roleId": (string) | null; "classId"?: (string) | null; "subjectId"?: (string) | null; "validFrom"?: string; "validUntil"?: (string) | null; "workDisplayName"?: string; "reason"?: string; "expiresInDays"?: number; };
  "PlatformSchoolOptions": { "provinces": Array<string>; };
  "PlatformSchoolIdentity": { "codeTaken": boolean; "slugTaken": boolean; };
  "PlatformSchoolOptionsResponse": { "data": ApiSchemas["PlatformSchoolOptions"]; "requestId": string; };
  "PlatformSchoolIdentityResponse": { "data": ApiSchemas["PlatformSchoolIdentity"]; "requestId": string; };
  "PlatformSupportOptions": { "operators": Array<{ "id": string; "name": string; }>; "schools": Array<{ "id": string; "name": string; "status": "DRAFT" | "ACTIVE" | "SUSPENDED" | "ARCHIVED"; }>; "tickets": Array<{ "id": string; "schoolId": string; "title": string; }>; "queue": { "total": number; "open": number; "inProgress": number; "waitingSchool": number; "resolved": number; "high": number; }; "grants": { "total": number; "requested": number; "active": number; "expired": number; "revoked": number; "declined": number; "inactive": number; }; };
  "PlatformSupportAccessRequest": { "ticketId": string; "classId"?: string; "allowedActions": Array<string>; "reason": string; "durationDays": number; };
  "PlatformAuditOptions": { "actors": Array<{ "id": string; "name": string; }>; };
  "PlatformSupportOptionsResponse": { "data": ApiSchemas["PlatformSupportOptions"]; "requestId": string; };
  "PlatformAuditOptionsResponse": { "data": ApiSchemas["PlatformAuditOptions"]; "requestId": string; };
}

export const apiOperations = {
  "healthLive": {
    "method": "GET",
    "path": "/api/v1/health/live",
    "auth": "none",
    "request": null,
    "response": "Health",
    "list": false,
    "permission": "public"
  },
  "healthReady": {
    "method": "GET",
    "path": "/api/v1/health/ready",
    "auth": "none",
    "request": null,
    "response": "Health",
    "list": false,
    "permission": "public"
  },
  "getCsrf": {
    "method": "GET",
    "path": "/api/v1/auth/csrf",
    "auth": "none",
    "request": null,
    "response": "Csrf",
    "list": false,
    "permission": "public"
  },
  "login": {
    "method": "POST",
    "path": "/api/v1/auth/login",
    "auth": "none",
    "request": "LoginRequest",
    "response": "LoginResult",
    "list": false,
    "permission": "public"
  },
  "logout": {
    "method": "POST",
    "path": "/api/v1/auth/logout",
    "auth": "staff",
    "request": null,
    "response": "Ack",
    "list": false,
    "permission": "session"
  },
  "forgotPassword": {
    "method": "POST",
    "path": "/api/v1/auth/password/forgot",
    "auth": "none",
    "request": "ForgotPasswordRequest",
    "response": "Ack",
    "list": false,
    "permission": "public"
  },
  "resetPassword": {
    "method": "POST",
    "path": "/api/v1/auth/password/reset",
    "auth": "none",
    "request": "ResetPasswordRequest",
    "response": "Ack",
    "list": false,
    "permission": "public"
  },
  "changePassword": {
    "method": "POST",
    "path": "/api/v1/auth/password/change",
    "auth": "staff",
    "request": "ChangePasswordRequest",
    "response": "Ack",
    "list": false,
    "permission": "session"
  },
  "getMyContext": {
    "method": "GET",
    "path": "/api/v1/me/context",
    "auth": "staff",
    "request": null,
    "response": "Context",
    "list": false,
    "permission": "session"
  },
  "getMyProfile": {
    "method": "GET",
    "path": "/api/v1/me/profile",
    "auth": "staff",
    "request": null,
    "response": "User",
    "list": false,
    "permission": "session"
  },
  "updateMyProfile": {
    "method": "PATCH",
    "path": "/api/v1/me/profile",
    "auth": "staff",
    "request": "ProfilePatch",
    "response": "User",
    "list": false,
    "permission": "session"
  },
  "listMySessions": {
    "method": "GET",
    "path": "/api/v1/me/sessions",
    "auth": "staff",
    "request": null,
    "response": "StaffSession",
    "list": true,
    "permission": "session"
  },
  "revokeMySession": {
    "method": "POST",
    "path": "/api/v1/me/sessions/{sessionId}/revoke",
    "auth": "staff",
    "request": null,
    "response": "Ack",
    "list": false,
    "permission": "session"
  },
  "inspectInvitation": {
    "method": "POST",
    "path": "/api/v1/invitations/inspect",
    "auth": "none",
    "request": "InviteTokenRequest",
    "response": "Invitation",
    "list": false,
    "permission": "public"
  },
  "acceptInvitation": {
    "method": "POST",
    "path": "/api/v1/invitations/accept",
    "auth": "none",
    "request": "AcceptInviteRequest",
    "response": "Ack",
    "list": false,
    "permission": "invitation"
  },
  "declineInvitation": {
    "method": "POST",
    "path": "/api/v1/invitations/decline",
    "auth": "none",
    "request": "InviteTokenRequest",
    "response": "Ack",
    "list": false,
    "permission": "invitation"
  },
  "listMyNotifications": {
    "method": "GET",
    "path": "/api/v1/me/notifications",
    "auth": "staff",
    "request": null,
    "response": "Notification",
    "list": true,
    "permission": "session"
  },
  "readMyNotification": {
    "method": "POST",
    "path": "/api/v1/me/notifications/{notificationId}/read",
    "auth": "staff",
    "request": null,
    "response": "Ack",
    "list": false,
    "permission": "session"
  },
  "getPlatformOverview": {
    "method": "GET",
    "path": "/api/v1/platform/overview",
    "auth": "staff",
    "request": null,
    "response": "Dashboard",
    "list": false,
    "permission": "platform.read"
  },
  "listPlatformSchools": {
    "method": "GET",
    "path": "/api/v1/platform/schools",
    "auth": "staff",
    "request": null,
    "response": "School",
    "list": true,
    "permission": "platform.schools.read"
  },
  "createSchool": {
    "method": "POST",
    "path": "/api/v1/platform/schools",
    "auth": "staff",
    "request": "SchoolCreate",
    "response": "School",
    "list": false,
    "permission": "platform.schools.manage"
  },
  "getPlatformSchool": {
    "method": "GET",
    "path": "/api/v1/platform/schools/{schoolId}",
    "auth": "staff",
    "request": null,
    "response": "School",
    "list": false,
    "permission": "platform.schools.read"
  },
  "updatePlatformSchool": {
    "method": "PATCH",
    "path": "/api/v1/platform/schools/{schoolId}",
    "auth": "staff",
    "request": "SchoolPatch",
    "response": "School",
    "list": false,
    "permission": "platform.schools.manage"
  },
  "setSchoolStatus": {
    "method": "POST",
    "path": "/api/v1/platform/schools/{schoolId}/status",
    "auth": "staff",
    "request": "SchoolStatusCommand",
    "response": "School",
    "list": false,
    "permission": "platform.schools.manage"
  },
  "listSchoolAdmins": {
    "method": "GET",
    "path": "/api/v1/platform/schools/{schoolId}/admins",
    "auth": "staff",
    "request": null,
    "response": "Member",
    "list": true,
    "permission": "platform.admins.manage"
  },
  "inviteSchoolAdmin": {
    "method": "POST",
    "path": "/api/v1/platform/schools/{schoolId}/admin-invitations",
    "auth": "staff",
    "request": "PlatformAdminInviteRequest",
    "response": "Invitation",
    "list": false,
    "permission": "platform.admins.manage"
  },
  "revokeSchoolAdmin": {
    "method": "POST",
    "path": "/api/v1/platform/schools/{schoolId}/admins/{memberId}/revoke",
    "auth": "staff",
    "request": "ReasonCommand",
    "response": "Ack",
    "list": false,
    "permission": "platform.admins.manage"
  },
  "listPlatformTickets": {
    "method": "GET",
    "path": "/api/v1/platform/support",
    "auth": "staff",
    "request": null,
    "response": "SupportTicket",
    "list": true,
    "permission": "platform.support"
  },
  "getPlatformTicket": {
    "method": "GET",
    "path": "/api/v1/platform/support/{ticketId}",
    "auth": "staff",
    "request": null,
    "response": "SupportTicket",
    "list": false,
    "permission": "platform.support"
  },
  "updatePlatformTicket": {
    "method": "PATCH",
    "path": "/api/v1/platform/support/{ticketId}",
    "auth": "staff",
    "request": "SupportTicketPatch",
    "response": "SupportTicket",
    "list": false,
    "permission": "platform.support"
  },
  "listPlatformTicketMessages": {
    "method": "GET",
    "path": "/api/v1/platform/support/{ticketId}/messages",
    "auth": "staff",
    "request": null,
    "response": "SupportMessage",
    "list": true,
    "permission": "platform.support"
  },
  "postPlatformTicketMessage": {
    "method": "POST",
    "path": "/api/v1/platform/support/{ticketId}/messages",
    "auth": "staff",
    "request": "MessageCreate",
    "response": "SupportMessage",
    "list": false,
    "permission": "platform.support"
  },
  "listPlatformSupportAccess": {
    "method": "GET",
    "path": "/api/v1/platform/support-access",
    "auth": "staff",
    "request": null,
    "response": "SupportAccess",
    "list": true,
    "permission": "platform.support"
  },
  "listPlatformAudit": {
    "method": "GET",
    "path": "/api/v1/platform/audit",
    "auth": "staff",
    "request": null,
    "response": "AuditEvent",
    "list": true,
    "permission": "platform.audit"
  },
  "listOperations": {
    "method": "GET",
    "path": "/api/v1/platform/operations",
    "auth": "staff",
    "request": null,
    "response": "OperationRun",
    "list": true,
    "permission": "platform.operations"
  },
  "getPlatformSettings": {
    "method": "GET",
    "path": "/api/v1/platform/settings",
    "auth": "staff",
    "request": null,
    "response": "PlatformSettings",
    "list": false,
    "permission": "platform.settings"
  },
  "updatePlatformSettings": {
    "method": "PATCH",
    "path": "/api/v1/platform/settings",
    "auth": "staff",
    "request": "PlatformSettingsPatch",
    "response": "PlatformSettings",
    "list": false,
    "permission": "platform.settings"
  },
  "getSchoolOverview": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/overview",
    "auth": "staff",
    "request": null,
    "response": "Dashboard",
    "list": false,
    "permission": "school.read"
  },
  "getSchoolProfile": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/profile",
    "auth": "staff",
    "request": null,
    "response": "School",
    "list": false,
    "permission": "school.read"
  },
  "updateSchoolProfile": {
    "method": "PATCH",
    "path": "/api/v1/schools/{schoolId}/profile",
    "auth": "staff",
    "request": "SchoolPatch",
    "response": "School",
    "list": false,
    "permission": "school.settings"
  },
  "listYears": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/academic-years",
    "auth": "staff",
    "request": null,
    "response": "Year",
    "list": true,
    "permission": "year.read"
  },
  "createYear": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/academic-years",
    "auth": "staff",
    "request": "YearCreate",
    "response": "Year",
    "list": false,
    "permission": "year.manage"
  },
  "getYear": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/academic-years/{yearId}",
    "auth": "staff",
    "request": null,
    "response": "Year",
    "list": false,
    "permission": "year.read"
  },
  "updateYear": {
    "method": "PATCH",
    "path": "/api/v1/schools/{schoolId}/academic-years/{yearId}",
    "auth": "staff",
    "request": "YearPatch",
    "response": "Year",
    "list": false,
    "permission": "year.manage"
  },
  "listTerms": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/terms",
    "auth": "staff",
    "request": null,
    "response": "Term",
    "list": true,
    "permission": "year.read"
  },
  "createTerm": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/terms",
    "auth": "staff",
    "request": "TermCreate",
    "response": "Term",
    "list": false,
    "permission": "year.manage"
  },
  "getTerm": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/terms/{termId}",
    "auth": "staff",
    "request": null,
    "response": "Term",
    "list": false,
    "permission": "year.read"
  },
  "updateTerm": {
    "method": "PATCH",
    "path": "/api/v1/schools/{schoolId}/terms/{termId}",
    "auth": "staff",
    "request": "TermPatch",
    "response": "Term",
    "list": false,
    "permission": "year.manage"
  },
  "listWeeks": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/weeks",
    "auth": "staff",
    "request": null,
    "response": "Week",
    "list": true,
    "permission": "year.read"
  },
  "createWeek": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/weeks",
    "auth": "staff",
    "request": "WeekCreate",
    "response": "Week",
    "list": false,
    "permission": "year.manage"
  },
  "getWeek": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/weeks/{weekId}",
    "auth": "staff",
    "request": null,
    "response": "Week",
    "list": false,
    "permission": "year.read"
  },
  "updateWeek": {
    "method": "PATCH",
    "path": "/api/v1/schools/{schoolId}/weeks/{weekId}",
    "auth": "staff",
    "request": "WeekPatch",
    "response": "Week",
    "list": false,
    "permission": "year.manage"
  },
  "listCalendarEvents": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/calendar-events",
    "auth": "staff",
    "request": null,
    "response": "CalendarEvent",
    "list": true,
    "permission": "year.read"
  },
  "createCalendarEvent": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/calendar-events",
    "auth": "staff",
    "request": "CalendarEventCreate",
    "response": "CalendarEvent",
    "list": false,
    "permission": "year.manage"
  },
  "getCalendarEvent": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/calendar-events/{eventId}",
    "auth": "staff",
    "request": null,
    "response": "CalendarEvent",
    "list": false,
    "permission": "year.read"
  },
  "updateCalendarEvent": {
    "method": "PATCH",
    "path": "/api/v1/schools/{schoolId}/calendar-events/{eventId}",
    "auth": "staff",
    "request": "CalendarEventPatch",
    "response": "CalendarEvent",
    "list": false,
    "permission": "year.manage"
  },
  "listClasss": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/classes",
    "auth": "staff",
    "request": null,
    "response": "Class",
    "list": true,
    "permission": "class.read"
  },
  "createClass": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/classes",
    "auth": "staff",
    "request": "ClassCreate",
    "response": "Class",
    "list": false,
    "permission": "class.manage"
  },
  "getClass": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}",
    "auth": "staff",
    "request": null,
    "response": "Class",
    "list": false,
    "permission": "class.read"
  },
  "updateClass": {
    "method": "PATCH",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}",
    "auth": "staff",
    "request": "ClassPatch",
    "response": "Class",
    "list": false,
    "permission": "class.manage"
  },
  "activateYear": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/academic-years/{yearId}/activate",
    "auth": "staff",
    "request": "VersionCommand",
    "response": "Year",
    "list": false,
    "permission": "year.manage"
  },
  "archiveYear": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/academic-years/{yearId}/archive",
    "auth": "staff",
    "request": "ReasonCommand",
    "response": "Year",
    "list": false,
    "permission": "year.manage"
  },
  "activateClass": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/activate",
    "auth": "staff",
    "request": "VersionCommand",
    "response": "Class",
    "list": false,
    "permission": "class.manage"
  },
  "archiveClass": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/archive",
    "auth": "staff",
    "request": "ReasonCommand",
    "response": "Class",
    "list": false,
    "permission": "class.manage"
  },
  "publishCalendarEvent": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/calendar-events/{eventId}/publish",
    "auth": "staff",
    "request": "VersionCommand",
    "response": "CalendarEvent",
    "list": false,
    "permission": "calendar.publish"
  },
  "listDictionary": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/dictionaries/{dictionary}",
    "auth": "staff",
    "request": null,
    "response": "DictionaryItem",
    "list": true,
    "permission": "dictionary.read"
  },
  "createDictionary": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/dictionaries/{dictionary}",
    "auth": "staff",
    "request": "DictionaryCreate",
    "response": "DictionaryItem",
    "list": false,
    "permission": "dictionary.manage"
  },
  "updateDictionary": {
    "method": "PATCH",
    "path": "/api/v1/schools/{schoolId}/dictionaries/{dictionary}/{itemId}",
    "auth": "staff",
    "request": "DictionaryItemPatch",
    "response": "DictionaryItem",
    "list": false,
    "permission": "dictionary.manage"
  },
  "createRollover": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/academic-years/{yearId}/rollovers",
    "auth": "staff",
    "request": "RolloverCreate",
    "response": "Rollover",
    "list": false,
    "permission": "year.manage"
  },
  "getRollover": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/rollovers/{rolloverId}",
    "auth": "staff",
    "request": null,
    "response": "Rollover",
    "list": false,
    "permission": "year.manage"
  },
  "validateRollover": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/rollovers/{rolloverId}/validate",
    "auth": "staff",
    "request": "VersionCommand",
    "response": "Rollover",
    "list": false,
    "permission": "year.manage"
  },
  "commitRollover": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/rollovers/{rolloverId}/commit",
    "auth": "staff",
    "request": "PlanCommit",
    "response": "Rollover",
    "list": false,
    "permission": "year.manage"
  },
  "listMembers": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/members",
    "auth": "staff",
    "request": null,
    "response": "Member",
    "list": true,
    "permission": "member.read"
  },
  "getMember": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/members/{memberId}",
    "auth": "staff",
    "request": null,
    "response": "Member",
    "list": false,
    "permission": "member.read"
  },
  "updateMember": {
    "method": "PATCH",
    "path": "/api/v1/schools/{schoolId}/members/{memberId}",
    "auth": "staff",
    "request": "MemberPatch",
    "response": "Member",
    "list": false,
    "permission": "member.manage"
  },
  "suspendMember": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/members/{memberId}/suspend",
    "auth": "staff",
    "request": "ReasonCommand",
    "response": "Member",
    "list": false,
    "permission": "member.manage"
  },
  "reactivateMember": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/members/{memberId}/reactivate",
    "auth": "staff",
    "request": "ReasonCommand",
    "response": "Member",
    "list": false,
    "permission": "member.manage"
  },
  "listInvitations": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/invitations",
    "auth": "staff",
    "request": null,
    "response": "Invitation",
    "list": true,
    "permission": "member.manage"
  },
  "inviteStaff": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/invitations",
    "auth": "staff",
    "request": "InviteRequest",
    "response": "Invitation",
    "list": false,
    "permission": "member.manage"
  },
  "revokeInvitation": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/invitations/{invitationId}/revoke",
    "auth": "staff",
    "request": "ReasonCommand",
    "response": "Invitation",
    "list": false,
    "permission": "member.manage"
  },
  "listRoles": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/roles",
    "auth": "staff",
    "request": null,
    "response": "Role",
    "list": true,
    "permission": "role.read"
  },
  "getRole": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/roles/{roleId}",
    "auth": "staff",
    "request": null,
    "response": "Role",
    "list": false,
    "permission": "role.read"
  },
  "createRole": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/roles",
    "auth": "staff",
    "request": "RoleCreate",
    "response": "Role",
    "list": false,
    "permission": "role.manage"
  },
  "updateRole": {
    "method": "PATCH",
    "path": "/api/v1/schools/{schoolId}/roles/{roleId}",
    "auth": "staff",
    "request": "RolePatch",
    "response": "Role",
    "list": false,
    "permission": "role.manage"
  },
  "previewGrant": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/grants/preview",
    "auth": "staff",
    "request": "GrantRequest",
    "response": "PermissionPreview",
    "list": false,
    "permission": "grant.manage"
  },
  "createGrant": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/grants",
    "auth": "staff",
    "request": "GrantRequest",
    "response": "GrantView",
    "list": false,
    "permission": "grant.manage"
  },
  "revokeGrant": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/grants/{grantId}/revoke",
    "auth": "staff",
    "request": "ReasonCommand",
    "response": "Ack",
    "list": false,
    "permission": "grant.manage"
  },
  "listAssignments": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/assignments",
    "auth": "staff",
    "request": null,
    "response": "Assignment",
    "list": true,
    "permission": "assignment.read"
  },
  "createAssignment": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/assignments",
    "auth": "staff",
    "request": "AssignmentCreate",
    "response": "Assignment",
    "list": false,
    "permission": "assignment.manage"
  },
  "revokeAssignment": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/assignments/{assignmentId}/revoke",
    "auth": "staff",
    "request": "ReasonCommand",
    "response": "Assignment",
    "list": false,
    "permission": "assignment.manage"
  },
  "listHandovers": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/handovers",
    "auth": "staff",
    "request": null,
    "response": "Handover",
    "list": true,
    "permission": "assignment.manage"
  },
  "createHandover": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/handovers",
    "auth": "staff",
    "request": "HandoverCreate",
    "response": "Handover",
    "list": false,
    "permission": "assignment.manage"
  },
  "approveHandover": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/handovers/{handoverId}/approve",
    "auth": "staff",
    "request": "VersionCommand",
    "response": "Handover",
    "list": false,
    "permission": "assignment.manage"
  },
  "listStudents": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/students",
    "auth": "staff",
    "request": null,
    "response": "Student",
    "list": true,
    "permission": "student.read"
  },
  "createStudent": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/students",
    "auth": "staff",
    "request": "StudentCreate",
    "response": "Student",
    "list": false,
    "permission": "student.manage"
  },
  "getStudent": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/students/{studentId}",
    "auth": "staff",
    "request": null,
    "response": "StudentDetail",
    "list": false,
    "permission": "student.read"
  },
  "updateStudent": {
    "method": "PATCH",
    "path": "/api/v1/schools/{schoolId}/students/{studentId}",
    "auth": "staff",
    "request": "StudentPatch",
    "response": "Student",
    "list": false,
    "permission": "student.manage"
  },
  "listStudentEnrollments": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/students/{studentId}/enrollments",
    "auth": "staff",
    "request": null,
    "response": "Enrollment",
    "list": true,
    "permission": "student.read"
  },
  "createEnrollment": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/enrollments",
    "auth": "staff",
    "request": "EnrollmentCreate",
    "response": "Enrollment",
    "list": false,
    "permission": "student.manage"
  },
  "listTransfers": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/transfers",
    "auth": "staff",
    "request": null,
    "response": "Transfer",
    "list": true,
    "permission": "student.transfer"
  },
  "createTransfer": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/transfers",
    "auth": "staff",
    "request": "TransferCreate",
    "response": "Transfer",
    "list": false,
    "permission": "student.transfer.request"
  },
  "approveTransfer": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/transfers/{transferId}/approve",
    "auth": "staff",
    "request": "VersionCommand",
    "response": "Transfer",
    "list": false,
    "permission": "student.transfer"
  },
  "rejectTransfer": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/transfers/{transferId}/reject",
    "auth": "staff",
    "request": "ReasonCommand",
    "response": "Transfer",
    "list": false,
    "permission": "student.transfer"
  },
  "listGuardians": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/guardians",
    "auth": "staff",
    "request": null,
    "response": "Guardian",
    "list": true,
    "permission": "guardian.read"
  },
  "createGuardian": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/guardians",
    "auth": "staff",
    "request": "GuardianCreate",
    "response": "Guardian",
    "list": false,
    "permission": "guardian.manage"
  },
  "getGuardian": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/guardians/{guardianId}",
    "auth": "staff",
    "request": null,
    "response": "Guardian",
    "list": false,
    "permission": "guardian.read"
  },
  "updateGuardian": {
    "method": "PATCH",
    "path": "/api/v1/schools/{schoolId}/guardians/{guardianId}",
    "auth": "staff",
    "request": "GuardianPatch",
    "response": "Guardian",
    "list": false,
    "permission": "guardian.manage"
  },
  "listRelationships": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/relationships",
    "auth": "staff",
    "request": null,
    "response": "Relationship",
    "list": true,
    "permission": "guardian.read"
  },
  "createRelationship": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/relationships",
    "auth": "staff",
    "request": "RelationshipCreate",
    "response": "Relationship",
    "list": false,
    "permission": "guardian.manage"
  },
  "verifyRelationship": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/relationships/{relationshipId}/verify",
    "auth": "staff",
    "request": "VerifyRelationship",
    "response": "Relationship",
    "list": false,
    "permission": "guardian.verify"
  },
  "revokeRelationship": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/relationships/{relationshipId}/revoke",
    "auth": "staff",
    "request": "ReasonCommand",
    "response": "Relationship",
    "list": false,
    "permission": "guardian.verify"
  },
  "listParentAccess": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/parent-access",
    "auth": "staff",
    "request": null,
    "response": "ParentAccess",
    "list": true,
    "permission": "parent_access.manage"
  },
  "issueParentAccess": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/parent-access",
    "auth": "staff",
    "request": "ParentAccessCreate",
    "response": "ParentAccessIssued",
    "list": false,
    "permission": "parent_access.issue"
  },
  "getParentAccess": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/parent-access/{accessId}",
    "auth": "staff",
    "request": null,
    "response": "ParentAccess",
    "list": false,
    "permission": "parent_access.manage"
  },
  "revokeParentAccess": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/parent-access/{accessId}/revoke",
    "auth": "staff",
    "request": "ReasonCommand",
    "response": "ParentAccess",
    "list": false,
    "permission": "parent_access.revoke"
  },
  "reissueParentAccess": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/parent-access/{accessId}/reissue",
    "auth": "staff",
    "request": "ReasonCommand",
    "response": "ParentAccessIssued",
    "list": false,
    "permission": "parent_access.issue"
  },
  "listParentAccessEvents": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/parent-access/{accessId}/events",
    "auth": "staff",
    "request": null,
    "response": "AccessEvent",
    "list": true,
    "permission": "parent_access.manage"
  },
  "previewParent": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/parent-access/{accessId}/preview",
    "auth": "staff",
    "request": null,
    "response": "ParentOverview",
    "list": false,
    "permission": "parent_access.preview"
  },
  "getTeacherOverview": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/me/overview",
    "auth": "staff",
    "request": null,
    "response": "Dashboard",
    "list": false,
    "permission": "teacher.self"
  },
  "listMyClasses": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/me/classes",
    "auth": "staff",
    "request": null,
    "response": "Class",
    "list": true,
    "permission": "teacher.self"
  },
  "listMySchedule": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/me/schedule",
    "auth": "staff",
    "request": null,
    "response": "Lesson",
    "list": true,
    "permission": "teacher.self"
  },
  "listMyTasks": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/me/tasks",
    "auth": "staff",
    "request": null,
    "response": "Task",
    "list": true,
    "permission": "teacher.self"
  },
  "listTeacherAnnouncements": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/me/announcements",
    "auth": "staff",
    "request": null,
    "response": "Announcement",
    "list": true,
    "permission": "teacher.self"
  },
  "getClassOverview": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/overview",
    "auth": "staff",
    "request": null,
    "response": "Dashboard",
    "list": false,
    "permission": "class.read"
  },
  "listClassStudents": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/students",
    "auth": "staff",
    "request": null,
    "response": "Student",
    "list": true,
    "permission": "student.read"
  },
  "getClassStudent": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/students/{studentId}",
    "auth": "staff",
    "request": null,
    "response": "StudentDetail",
    "list": false,
    "permission": "student.read"
  },
  "listGroups": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/groups",
    "auth": "staff",
    "request": null,
    "response": "Group",
    "list": true,
    "permission": "group.manage"
  },
  "createGroup": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/groups",
    "auth": "staff",
    "request": "GroupCreate",
    "response": "Group",
    "list": false,
    "permission": "group.manage"
  },
  "listPositions": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/positions",
    "auth": "staff",
    "request": null,
    "response": "Position",
    "list": true,
    "permission": "group.manage"
  },
  "createPosition": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/positions",
    "auth": "staff",
    "request": "PositionCreate",
    "response": "Position",
    "list": false,
    "permission": "group.manage"
  },
  "listSeatingPlans": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/seating-plans",
    "auth": "staff",
    "request": null,
    "response": "SeatingPlan",
    "list": true,
    "permission": "seating.manage"
  },
  "createSeatingPlan": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/seating-plans",
    "auth": "staff",
    "request": "SeatingCreate",
    "response": "SeatingPlan",
    "list": false,
    "permission": "seating.manage"
  },
  "updateGroup": {
    "method": "PATCH",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/groups/{groupId}",
    "auth": "staff",
    "request": "GroupPatch",
    "response": "Group",
    "list": false,
    "permission": "group.manage"
  },
  "updatePosition": {
    "method": "PATCH",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/positions/{positionId}",
    "auth": "staff",
    "request": "PositionPatch",
    "response": "Position",
    "list": false,
    "permission": "group.manage"
  },
  "listPositionAssignments": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/position-assignments",
    "auth": "staff",
    "request": null,
    "response": "PositionAssignment",
    "list": true,
    "permission": "group.manage"
  },
  "endPositionAssignment": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/position-assignments/{assignmentId}/end",
    "auth": "staff",
    "request": "EndPositionAssignment",
    "response": "PositionAssignment",
    "list": false,
    "permission": "group.manage"
  },
  "assignGroup": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/groups/assign",
    "auth": "staff",
    "request": "GroupAssign",
    "response": "Ack",
    "list": false,
    "permission": "group.manage"
  },
  "assignPosition": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/positions/assign",
    "auth": "staff",
    "request": "PositionAssign",
    "response": "PositionAssignment",
    "list": false,
    "permission": "group.manage"
  },
  "getSeatingPlan": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/seating-plans/{planId}",
    "auth": "staff",
    "request": null,
    "response": "SeatingPlan",
    "list": false,
    "permission": "class.read"
  },
  "updateSeatingPlan": {
    "method": "PATCH",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/seating-plans/{planId}",
    "auth": "staff",
    "request": "SeatingSave",
    "response": "SeatingPlan",
    "list": false,
    "permission": "seating.manage"
  },
  "activateSeatingPlan": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/seating-plans/{planId}/activate",
    "auth": "staff",
    "request": "VersionCommand",
    "response": "SeatingPlan",
    "list": false,
    "permission": "seating.manage"
  },
  "listAttendanceSessions": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/attendance",
    "auth": "staff",
    "request": null,
    "response": "AttendanceSession",
    "list": true,
    "permission": "attendance.read"
  },
  "createAttendanceSession": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/attendance",
    "auth": "staff",
    "request": "AttendanceCreate",
    "response": "AttendanceSession",
    "list": false,
    "permission": "attendance.record"
  },
  "getAttendanceSession": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/attendance/{sessionId}",
    "auth": "staff",
    "request": null,
    "response": "AttendanceSession",
    "list": false,
    "permission": "attendance.read"
  },
  "saveAttendanceRecords": {
    "method": "PATCH",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/attendance/{sessionId}/records",
    "auth": "staff",
    "request": "AttendanceBulk",
    "response": "AttendanceSession",
    "list": false,
    "permission": "attendance.record"
  },
  "getAttendanceSummary": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/attendance-summary",
    "auth": "staff",
    "request": null,
    "response": "AttendanceSummary",
    "list": false,
    "permission": "attendance.read"
  },
  "publishAttendance": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/attendance/{sessionId}/publish",
    "auth": "staff",
    "request": "PublishCommand",
    "response": "Publication",
    "list": false,
    "permission": "attendance.publish"
  },
  "reopenAttendance": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/attendance/{sessionId}/reopen",
    "auth": "staff",
    "request": "ReasonCommand",
    "response": "AttendanceSession",
    "list": false,
    "permission": "attendance.reopen"
  },
  "listRuleSets": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/conduct-rule-sets",
    "auth": "staff",
    "request": null,
    "response": "RuleSet",
    "list": true,
    "permission": "rules.read"
  },
  "createRuleSet": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/conduct-rule-sets",
    "auth": "staff",
    "request": "RuleSetCreate",
    "response": "RuleSet",
    "list": false,
    "permission": "rules.manage"
  },
  "getRuleSet": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/conduct-rule-sets/{ruleSetId}",
    "auth": "staff",
    "request": null,
    "response": "RuleSet",
    "list": false,
    "permission": "rules.read"
  },
  "updateRuleSet": {
    "method": "PATCH",
    "path": "/api/v1/schools/{schoolId}/conduct-rule-sets/{ruleSetId}",
    "auth": "staff",
    "request": "RuleSetPatch",
    "response": "RuleSet",
    "list": false,
    "permission": "rules.manage"
  },
  "issueRuleSet": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/conduct-rule-sets/{ruleSetId}/issue",
    "auth": "staff",
    "request": "VersionCommand",
    "response": "RuleSet",
    "list": false,
    "permission": "rules.issue"
  },
  "simulateRules": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/conduct-rule-sets/simulate",
    "auth": "staff",
    "request": "RuleSimulation",
    "response": "RuleSimulationResult",
    "list": false,
    "permission": "rules.read"
  },
  "getClassRules": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/rules",
    "auth": "staff",
    "request": null,
    "response": "RuleSet",
    "list": false,
    "permission": "rules.read"
  },
  "applyClassRules": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/rules/apply",
    "auth": "staff",
    "request": "ClassRulesApply",
    "response": "Ack",
    "list": false,
    "permission": "rules.apply"
  },
  "listConductPeriods": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/conduct-periods",
    "auth": "staff",
    "request": null,
    "response": "ConductPeriod",
    "list": true,
    "permission": "conduct.read"
  },
  "createConductPeriod": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/conduct-periods",
    "auth": "staff",
    "request": "ConductPeriodCreate",
    "response": "ConductPeriod",
    "list": false,
    "permission": "conduct.record"
  },
  "getConductSummary": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/conduct-periods/{periodId}/summary",
    "auth": "staff",
    "request": null,
    "response": "ConductSummary",
    "list": false,
    "permission": "conduct.read"
  },
  "listConductRecords": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/conduct-records",
    "auth": "staff",
    "request": null,
    "response": "ConductRecord",
    "list": true,
    "permission": "conduct.read"
  },
  "createConductRecord": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/conduct-records",
    "auth": "staff",
    "request": "ConductRecordCreate",
    "response": "ConductRecord",
    "list": false,
    "permission": "conduct.record"
  },
  "updateConductRecord": {
    "method": "PATCH",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/conduct-records/{recordId}",
    "auth": "staff",
    "request": "ConductRecordPatch",
    "response": "ConductRecord",
    "list": false,
    "permission": "conduct.record"
  },
  "approveConductRecord": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/conduct-records/{recordId}/approve",
    "auth": "staff",
    "request": "VersionCommand",
    "response": "ConductRecord",
    "list": false,
    "permission": "conduct.review"
  },
  "excludeConductRecord": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/conduct-records/{recordId}/exclude",
    "auth": "staff",
    "request": "ReasonCommand",
    "response": "ConductRecord",
    "list": false,
    "permission": "conduct.review"
  },
  "reviewConductPeriod": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/conduct-periods/{periodId}/review",
    "auth": "staff",
    "request": null,
    "response": "ReviewResult",
    "list": false,
    "permission": "conduct.review"
  },
  "lockConductPeriod": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/conduct-periods/{periodId}/lock",
    "auth": "staff",
    "request": "VersionCommand",
    "response": "ConductPeriod",
    "list": false,
    "permission": "conduct.lock"
  },
  "publishConductPeriod": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/conduct-periods/{periodId}/publish",
    "auth": "staff",
    "request": "PublishCommand",
    "response": "Publication",
    "list": false,
    "permission": "conduct.publish"
  },
  "lockAndPublishConduct": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/conduct-periods/{periodId}/lock-and-publish",
    "auth": "staff",
    "request": "PublishCommand",
    "response": "Publication",
    "list": false,
    "permission": "conduct.lock+conduct.publish"
  },
  "listAdjustments": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/adjustments",
    "auth": "staff",
    "request": null,
    "response": "Adjustment",
    "list": true,
    "permission": "conduct.adjust.request"
  },
  "createAdjustment": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/adjustments",
    "auth": "staff",
    "request": "AdjustmentCreate",
    "response": "Adjustment",
    "list": false,
    "permission": "conduct.adjust.request"
  },
  "approveAdjustment": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/adjustments/{adjustmentId}/approve",
    "auth": "staff",
    "request": "VersionCommand",
    "response": "Adjustment",
    "list": false,
    "permission": "conduct.adjust.approve"
  },
  "rejectAdjustment": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/adjustments/{adjustmentId}/reject",
    "auth": "staff",
    "request": "ReasonCommand",
    "response": "Adjustment",
    "list": false,
    "permission": "conduct.adjust.approve"
  },
  "applyAdjustment": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/adjustments/{adjustmentId}/apply-and-publish",
    "auth": "staff",
    "request": "PublishCommand",
    "response": "Publication",
    "list": false,
    "permission": "conduct.adjust.approve+conduct.publish"
  },
  "listSchoolPublications": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/publications",
    "auth": "staff",
    "request": null,
    "response": "Publication",
    "list": true,
    "permission": "publication.read"
  },
  "listClassPublications": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/publications",
    "auth": "staff",
    "request": null,
    "response": "Publication",
    "list": true,
    "permission": "publication.read"
  },
  "getClassPublication": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/publications/{publicationId}",
    "auth": "staff",
    "request": null,
    "response": "PublicationDetail",
    "list": false,
    "permission": "publication.read"
  },
  "withdrawPublication": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/publications/{publicationId}/withdraw",
    "auth": "staff",
    "request": "ReasonCommand",
    "response": "Publication",
    "list": false,
    "permission": "publication.withdraw"
  },
  "listSchoolLessons": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/timetable",
    "auth": "staff",
    "request": null,
    "response": "Lesson",
    "list": true,
    "permission": "schedule.read"
  },
  "listClassTimetables": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/timetables",
    "auth": "staff",
    "request": null,
    "response": "Timetable",
    "list": true,
    "permission": "schedule.read"
  },
  "createTimetable": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/timetables",
    "auth": "staff",
    "request": "TimetableCreate",
    "response": "Timetable",
    "list": false,
    "permission": "schedule.manage"
  },
  "getTimetable": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/timetables/{timetableId}",
    "auth": "staff",
    "request": null,
    "response": "Timetable",
    "list": false,
    "permission": "schedule.read"
  },
  "updateTimetable": {
    "method": "PATCH",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/timetables/{timetableId}",
    "auth": "staff",
    "request": "TimetablePatch",
    "response": "Timetable",
    "list": false,
    "permission": "schedule.manage"
  },
  "validateTimetable": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/timetables/{timetableId}/validate",
    "auth": "staff",
    "request": "VersionCommand",
    "response": "ScheduleConflicts",
    "list": false,
    "permission": "schedule.manage"
  },
  "publishTimetable": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/timetables/{timetableId}/publish",
    "auth": "staff",
    "request": "PublishCommand",
    "response": "Publication",
    "list": false,
    "permission": "schedule.publish"
  },
  "listDuties": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/duties",
    "auth": "staff",
    "request": null,
    "response": "DutySchedule",
    "list": true,
    "permission": "duty.read"
  },
  "createDuty": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/duties",
    "auth": "staff",
    "request": "DutyCreate",
    "response": "DutySchedule",
    "list": false,
    "permission": "duty.manage"
  },
  "updateDuty": {
    "method": "PATCH",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/duties/{dutyId}",
    "auth": "staff",
    "request": "DutySchedulePatch",
    "response": "DutySchedule",
    "list": false,
    "permission": "duty.manage"
  },
  "publishDuty": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/duties/{dutyId}/publish",
    "auth": "staff",
    "request": "PublishCommand",
    "response": "Publication",
    "list": false,
    "permission": "duty.publish"
  },
  "listActivities": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/activities",
    "auth": "staff",
    "request": null,
    "response": "Activity",
    "list": true,
    "permission": "activity.read"
  },
  "createActivity": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/activities",
    "auth": "staff",
    "request": "ActivityCreate",
    "response": "Activity",
    "list": false,
    "permission": "activity.manage"
  },
  "getActivity": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/activities/{activityId}",
    "auth": "staff",
    "request": null,
    "response": "Activity",
    "list": false,
    "permission": "activity.read"
  },
  "updateActivity": {
    "method": "PATCH",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/activities/{activityId}",
    "auth": "staff",
    "request": "ActivityPatch",
    "response": "Activity",
    "list": false,
    "permission": "activity.manage"
  },
  "setParticipantStatus": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/activities/{activityId}/participants/{participantId}/status",
    "auth": "staff",
    "request": "ParticipantStatusCommand",
    "response": "Participant",
    "list": false,
    "permission": "activity.review"
  },
  "listParticipants": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/activities/{activityId}/participants",
    "auth": "staff",
    "request": null,
    "response": "Participant",
    "list": true,
    "permission": "activity.read"
  },
  "assignActivity": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/activities/{activityId}/assign",
    "auth": "staff",
    "request": "VersionCommand",
    "response": "Activity",
    "list": false,
    "permission": "activity.manage"
  },
  "publishActivity": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/activities/{activityId}/publish",
    "auth": "staff",
    "request": "PublishCommand",
    "response": "Publication",
    "list": false,
    "permission": "activity.publish"
  },
  "listEvidence": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/evidence",
    "auth": "staff",
    "request": null,
    "response": "Evidence",
    "list": true,
    "permission": "evidence.read"
  },
  "createEvidence": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/evidence",
    "auth": "staff",
    "request": "EvidenceCreate",
    "response": "Evidence",
    "list": false,
    "permission": "evidence.manage"
  },
  "reviewEvidence": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/evidence/{evidenceId}/review",
    "auth": "staff",
    "request": "ReviewEvidence",
    "response": "Evidence",
    "list": false,
    "permission": "evidence.review"
  },
  "listClassFiles": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/files",
    "auth": "staff",
    "request": null,
    "response": "File",
    "list": true,
    "permission": "file.read"
  },
  "uploadFile": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/files",
    "auth": "staff",
    "request": "UploadRequest",
    "response": "File",
    "list": false,
    "permission": "file.upload"
  },
  "getFile": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/files/{fileId}",
    "auth": "staff",
    "request": null,
    "response": "File",
    "list": false,
    "permission": "file.read"
  },
  "downloadFile": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/files/{fileId}/download",
    "auth": "staff",
    "request": null,
    "response": "File",
    "list": false,
    "permission": "file.download"
  },
  "archiveFile": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/files/{fileId}/archive",
    "auth": "staff",
    "request": "ReasonCommand",
    "response": "File",
    "list": false,
    "permission": "file.manage"
  },
  "createFileLink": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/file-links",
    "auth": "staff",
    "request": "FileLinkCreate",
    "response": "Ack",
    "list": false,
    "permission": "file.manage"
  },
  "listSchoolAnnouncements": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/announcements",
    "auth": "staff",
    "request": null,
    "response": "Announcement",
    "list": true,
    "permission": "announcement.read"
  },
  "createSchoolAnnouncement": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/announcements",
    "auth": "staff",
    "request": "AnnouncementCreate",
    "response": "Announcement",
    "list": false,
    "permission": "announcement.manage"
  },
  "getSchoolAnnouncement": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/announcements/{announcementId}",
    "auth": "staff",
    "request": null,
    "response": "Announcement",
    "list": false,
    "permission": "announcement.read"
  },
  "updateSchoolAnnouncement": {
    "method": "PATCH",
    "path": "/api/v1/schools/{schoolId}/announcements/{announcementId}",
    "auth": "staff",
    "request": "AnnouncementPatch",
    "response": "Announcement",
    "list": false,
    "permission": "announcement.manage"
  },
  "publishSchoolAnnouncement": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/announcements/{announcementId}/publish",
    "auth": "staff",
    "request": "PublishCommand",
    "response": "Publication",
    "list": false,
    "permission": "announcement.publish"
  },
  "scheduleSchoolAnnouncement": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/announcements/{announcementId}/schedule",
    "auth": "staff",
    "request": "SchedulePublish",
    "response": "Announcement",
    "list": false,
    "permission": "announcement.publish"
  },
  "withdrawSchoolAnnouncement": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/announcements/{announcementId}/withdraw",
    "auth": "staff",
    "request": "ReasonCommand",
    "response": "Announcement",
    "list": false,
    "permission": "announcement.publish"
  },
  "listClassAnnouncements": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/announcements",
    "auth": "staff",
    "request": null,
    "response": "Announcement",
    "list": true,
    "permission": "announcement.read"
  },
  "createClassAnnouncement": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/announcements",
    "auth": "staff",
    "request": "AnnouncementCreate",
    "response": "Announcement",
    "list": false,
    "permission": "announcement.manage"
  },
  "getClassAnnouncement": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/announcements/{announcementId}",
    "auth": "staff",
    "request": null,
    "response": "Announcement",
    "list": false,
    "permission": "announcement.read"
  },
  "updateClassAnnouncement": {
    "method": "PATCH",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/announcements/{announcementId}",
    "auth": "staff",
    "request": "AnnouncementPatch",
    "response": "Announcement",
    "list": false,
    "permission": "announcement.manage"
  },
  "publishClassAnnouncement": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/announcements/{announcementId}/publish",
    "auth": "staff",
    "request": "PublishCommand",
    "response": "Publication",
    "list": false,
    "permission": "announcement.publish"
  },
  "scheduleClassAnnouncement": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/announcements/{announcementId}/schedule",
    "auth": "staff",
    "request": "SchedulePublish",
    "response": "Announcement",
    "list": false,
    "permission": "announcement.publish"
  },
  "withdrawClassAnnouncement": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/announcements/{announcementId}/withdraw",
    "auth": "staff",
    "request": "ReasonCommand",
    "response": "Announcement",
    "list": false,
    "permission": "announcement.publish"
  },
  "listImports": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/imports",
    "auth": "staff",
    "request": null,
    "response": "ImportJob",
    "list": true,
    "permission": "import.manage"
  },
  "createImport": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/imports",
    "auth": "staff",
    "request": "ImportCreate",
    "response": "ImportJob",
    "list": false,
    "permission": "import.manage"
  },
  "getImport": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/imports/{importId}",
    "auth": "staff",
    "request": null,
    "response": "ImportJob",
    "list": false,
    "permission": "import.manage"
  },
  "validateImport": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/imports/{importId}/validate",
    "auth": "staff",
    "request": "ImportMapping",
    "response": "ImportJob",
    "list": false,
    "permission": "import.manage"
  },
  "listImportRows": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/imports/{importId}/rows",
    "auth": "staff",
    "request": null,
    "response": "ImportRow",
    "list": true,
    "permission": "import.manage"
  },
  "commitImport": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/imports/{importId}/commit",
    "auth": "staff",
    "request": "PlanCommit",
    "response": "ImportJob",
    "list": false,
    "permission": "import.manage"
  },
  "cancelImport": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/imports/{importId}/cancel",
    "auth": "staff",
    "request": "ReasonCommand",
    "response": "ImportJob",
    "list": false,
    "permission": "import.manage"
  },
  "downloadImportErrors": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/imports/{importId}/errors-file",
    "auth": "staff",
    "request": null,
    "response": "File",
    "list": false,
    "permission": "import.manage"
  },
  "getSchoolReport": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/reports/{reportType}",
    "auth": "staff",
    "request": null,
    "response": "Report",
    "list": false,
    "permission": "report.read"
  },
  "getClassReport": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/classes/{classId}/reports/{reportType}",
    "auth": "staff",
    "request": null,
    "response": "Report",
    "list": false,
    "permission": "report.read"
  },
  "listExports": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/exports",
    "auth": "staff",
    "request": null,
    "response": "ExportJob",
    "list": true,
    "permission": "report.export"
  },
  "createExport": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/exports",
    "auth": "staff",
    "request": "ExportCreate",
    "response": "ExportJob",
    "list": false,
    "permission": "report.export"
  },
  "getExport": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/exports/{exportId}",
    "auth": "staff",
    "request": null,
    "response": "ExportJob",
    "list": false,
    "permission": "report.export"
  },
  "downloadExport": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/exports/{exportId}/download",
    "auth": "staff",
    "request": null,
    "response": "File",
    "list": false,
    "permission": "report.export"
  },
  "cancelExport": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/exports/{exportId}/cancel",
    "auth": "staff",
    "request": "ReasonCommand",
    "response": "ExportJob",
    "list": false,
    "permission": "report.export"
  },
  "listSchoolAudit": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/audit",
    "auth": "staff",
    "request": null,
    "response": "AuditEvent",
    "list": true,
    "permission": "audit.read"
  },
  "getSchoolSettings": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/settings",
    "auth": "staff",
    "request": null,
    "response": "Settings",
    "list": false,
    "permission": "school.settings"
  },
  "updateSchoolSettings": {
    "method": "PATCH",
    "path": "/api/v1/schools/{schoolId}/settings",
    "auth": "staff",
    "request": "SettingsPatch",
    "response": "Settings",
    "list": false,
    "permission": "school.settings"
  },
  "listSchoolTickets": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/support",
    "auth": "staff",
    "request": null,
    "response": "SupportTicket",
    "list": true,
    "permission": "support.manage"
  },
  "createTicket": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/support",
    "auth": "staff",
    "request": "TicketCreate",
    "response": "SupportTicket",
    "list": false,
    "permission": "support.manage"
  },
  "getSchoolTicket": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/support/{ticketId}",
    "auth": "staff",
    "request": null,
    "response": "SupportTicket",
    "list": false,
    "permission": "support.manage"
  },
  "listSchoolMessages": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/support/{ticketId}/messages",
    "auth": "staff",
    "request": null,
    "response": "SupportMessage",
    "list": true,
    "permission": "support.manage"
  },
  "postSchoolMessage": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/support/{ticketId}/messages",
    "auth": "staff",
    "request": "MessageCreate",
    "response": "SupportMessage",
    "list": false,
    "permission": "support.manage"
  },
  "listSchoolSupportAccess": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/support-access",
    "auth": "staff",
    "request": null,
    "response": "SupportAccess",
    "list": true,
    "permission": "support.approve"
  },
  "createSupportAccess": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/support-access",
    "auth": "staff",
    "request": "SupportAccessCreate",
    "response": "SupportAccess",
    "list": false,
    "permission": "support.approve"
  },
  "approveSupportAccess": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/support-access/{supportAccessId}/approve",
    "auth": "staff",
    "request": "VersionCommand",
    "response": "SupportAccess",
    "list": false,
    "permission": "support.approve"
  },
  "revokeSupportAccess": {
    "method": "POST",
    "path": "/api/v1/schools/{schoolId}/support-access/{supportAccessId}/revoke",
    "auth": "staff",
    "request": "SupportAccessRevoke",
    "response": "SupportAccess",
    "list": false,
    "permission": "support.approve"
  },
  "exchangeParentLink": {
    "method": "POST",
    "path": "/api/v1/parent/{schoolSlug}/access/exchange",
    "auth": "none",
    "request": "ParentExchange",
    "response": "ParentContext",
    "list": false,
    "permission": "link.token"
  },
  "getParentContext": {
    "method": "GET",
    "path": "/api/v1/parent/{schoolSlug}/context",
    "auth": "parent",
    "request": null,
    "response": "ParentContext",
    "list": false,
    "permission": "parent.context"
  },
  "endParentSession": {
    "method": "POST",
    "path": "/api/v1/parent/{schoolSlug}/session/end",
    "auth": "parent",
    "request": null,
    "response": "Ack",
    "list": false,
    "permission": "parent.context"
  },
  "getParentOverview": {
    "method": "GET",
    "path": "/api/v1/parent/{schoolSlug}/overview",
    "auth": "parent",
    "request": null,
    "response": "ParentOverview",
    "list": false,
    "permission": "parent.overview"
  },
  "getParentAttendance": {
    "method": "GET",
    "path": "/api/v1/parent/{schoolSlug}/attendance",
    "auth": "parent",
    "request": null,
    "response": "ParentAttendance",
    "list": true,
    "permission": "parent.attendance"
  },
  "listParentConduct": {
    "method": "GET",
    "path": "/api/v1/parent/{schoolSlug}/conduct",
    "auth": "parent",
    "request": null,
    "response": "ParentConduct",
    "list": true,
    "permission": "parent.conduct"
  },
  "getParentConduct": {
    "method": "GET",
    "path": "/api/v1/parent/{schoolSlug}/conduct/{periodId}",
    "auth": "parent",
    "request": null,
    "response": "ParentConduct",
    "list": false,
    "permission": "parent.conduct"
  },
  "getParentTimetable": {
    "method": "GET",
    "path": "/api/v1/parent/{schoolSlug}/timetable",
    "auth": "parent",
    "request": null,
    "response": "ParentLesson",
    "list": true,
    "permission": "parent.timetable"
  },
  "getParentDuties": {
    "method": "GET",
    "path": "/api/v1/parent/{schoolSlug}/duties",
    "auth": "parent",
    "request": null,
    "response": "ParentDuty",
    "list": true,
    "permission": "parent.duties"
  },
  "listParentActivities": {
    "method": "GET",
    "path": "/api/v1/parent/{schoolSlug}/activities",
    "auth": "parent",
    "request": null,
    "response": "ParentActivity",
    "list": true,
    "permission": "parent.activities"
  },
  "getParentActivity": {
    "method": "GET",
    "path": "/api/v1/parent/{schoolSlug}/activities/{activityId}",
    "auth": "parent",
    "request": null,
    "response": "ParentActivity",
    "list": false,
    "permission": "parent.activities"
  },
  "listParentAnnouncements": {
    "method": "GET",
    "path": "/api/v1/parent/{schoolSlug}/announcements",
    "auth": "parent",
    "request": null,
    "response": "ParentAnnouncement",
    "list": true,
    "permission": "parent.announcements"
  },
  "getParentAnnouncement": {
    "method": "GET",
    "path": "/api/v1/parent/{schoolSlug}/announcements/{announcementId}",
    "auth": "parent",
    "request": null,
    "response": "ParentAnnouncement",
    "list": false,
    "permission": "parent.announcements"
  },
  "getParentTeachers": {
    "method": "GET",
    "path": "/api/v1/parent/{schoolSlug}/teachers",
    "auth": "parent",
    "request": null,
    "response": "ParentTeacher",
    "list": true,
    "permission": "parent.teachers"
  },
  "listParentDocuments": {
    "method": "GET",
    "path": "/api/v1/parent/{schoolSlug}/documents",
    "auth": "parent",
    "request": null,
    "response": "ParentDocument",
    "list": true,
    "permission": "parent.documents"
  },
  "downloadParentDocument": {
    "method": "GET",
    "path": "/api/v1/parent/{schoolSlug}/documents/{documentId}/download",
    "auth": "parent",
    "request": null,
    "response": "ParentDocument",
    "list": false,
    "permission": "parent.documents"
  },
  "getPublicSchool": {
    "method": "GET",
    "path": "/api/v1/public/schools/{schoolSlug}",
    "auth": "none",
    "request": null,
    "response": "PublicSchool",
    "list": false,
    "permission": "public"
  },
  "getPublicAnnouncement": {
    "method": "GET",
    "path": "/api/v1/public/schools/{schoolSlug}/announcements/{announcementId}",
    "auth": "none",
    "request": null,
    "response": "ParentAnnouncement",
    "list": false,
    "permission": "public"
  },
  "getRolloverPreview": {
    "method": "GET",
    "path": "/api/v1/schools/{schoolId}/academic-years/{yearId}/rollover-preview",
    "auth": "staff",
    "request": null,
    "response": "RolloverPreview",
    "list": false,
    "permission": "year.manage"
  },
  "getPlatformSchoolOptions": {
    "method": "GET",
    "path": "/api/v1/platform/school-options",
    "auth": "staff",
    "request": null,
    "response": "PlatformSchoolOptions",
    "list": false,
    "permission": "platform.schools.read"
  },
  "checkPlatformSchoolIdentity": {
    "method": "GET",
    "path": "/api/v1/platform/school-identity",
    "auth": "staff",
    "request": null,
    "response": "PlatformSchoolIdentity",
    "list": false,
    "permission": "platform.schools.manage"
  },
  "listSchoolAdminInvitations": {
    "method": "GET",
    "path": "/api/v1/platform/schools/{schoolId}/admin-invitations",
    "auth": "staff",
    "request": null,
    "response": "Invitation",
    "list": true,
    "permission": "platform.admins.manage"
  },
  "revokePlatformAdminInvitation": {
    "method": "POST",
    "path": "/api/v1/platform/schools/{schoolId}/admin-invitations/{invitationId}/revoke",
    "auth": "staff",
    "request": "ReasonCommand",
    "response": "Invitation",
    "list": false,
    "permission": "platform.admins.manage"
  },
  "getPlatformSupportOptions": {
    "method": "GET",
    "path": "/api/v1/platform/support-options",
    "auth": "staff",
    "request": null,
    "response": "PlatformSupportOptions",
    "list": false,
    "permission": "platform.support"
  },
  "requestPlatformSupportAccess": {
    "method": "POST",
    "path": "/api/v1/platform/schools/{schoolId}/support-access",
    "auth": "staff",
    "request": "PlatformSupportAccessRequest",
    "response": "SupportAccess",
    "list": false,
    "permission": "platform.support"
  },
  "relinquishPlatformSupportAccess": {
    "method": "POST",
    "path": "/api/v1/platform/support-access/{supportAccessId}/relinquish",
    "auth": "staff",
    "request": "ReasonCommand",
    "response": "SupportAccess",
    "list": false,
    "permission": "platform.support"
  },
  "getPlatformAuditOptions": {
    "method": "GET",
    "path": "/api/v1/platform/audit-options",
    "auth": "staff",
    "request": null,
    "response": "PlatformAuditOptions",
    "list": false,
    "permission": "platform.audit"
  }
} as const;
export type OperationId = keyof typeof apiOperations;
export type ApiRequest<K extends OperationId> = (typeof apiOperations)[K]['request'] extends keyof ApiSchemas ? ApiSchemas[(typeof apiOperations)[K]['request']] : never;
export type ApiItem<K extends OperationId> = (typeof apiOperations)[K]['response'] extends keyof ApiSchemas ? ApiSchemas[(typeof apiOperations)[K]['response']] : unknown;
export type ApiData<K extends OperationId> = (typeof apiOperations)[K]['list'] extends true ? Array<ApiItem<K>> : ApiItem<K>;
export type ApiListId = { [K in OperationId]: (typeof apiOperations)[K]['list'] extends true ? K : never }[OperationId];
