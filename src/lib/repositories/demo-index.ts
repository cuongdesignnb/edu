/**
 * MockRepository facade. Screens call these async functions through the hooks in
 * src/lib/query. When a backend exists, replace the implementations behind the same
 * signatures (see docs/frontend-data-contract.md).
 */
export { sessionRepo } from "./session";
export { platformRepo } from "./platform";
export { schoolRepo } from "./school";
export { staffRepo } from "./staff";
export { studentsRepo, accessStatus } from "./students";
export { classroomRepo } from "./classroom";
export { attendanceRepo } from "./attendance";
export { conductRepo } from "./conduct";
export { activitiesRepo, UPLOAD_LIMITS } from "./activities";
export { announcementsRepo } from "./announcements";
export { reportsRepo, SCHOOL_REPORTS, CLASS_REPORTS, type ReportData } from "./reports";
export { supportRepo, SUPPORT_SCOPE_LABEL } from "./support";
export { parentRepo, type ParentKey } from "./parent";
export { searchRepo, type SearchHit } from "./search";
export { RepoError, isRepoError, errorMessage, type RepoErrorCode } from "./errors";
export { makeCtx, type Ctx, type ListQuery, type Page } from "./core";
export { initStore, resetStore, subscribe, getBlob } from "./store";
