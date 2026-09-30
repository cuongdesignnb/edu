# Backend implementation decisions

## ADR-001 — Invalid OpenAPI empty required arrays

Official `@apidevtools/swagger-parser` validation of the supplied 3.0.3 design
failed on empty `required: []` in OperationRun.summary and report/import row
maps (including repeated inline copies). OpenAPI 3.0 requires a nonempty array
when `required` is present. Build generation removes only empty arrays, preserving
the meaning “no mandatory properties”. The original handoff is untouched;
`backend/api/openapi.yaml` is the validated implementation contract.

## ADR-002 — Publication action registry gaps

Operations listSchoolPublications, listClassPublications, getClassPublication
and withdrawPublication reference actions absent from the handoff allowlist.
The implementation explicitly adds `publication.read` and `publication.withdraw`.
Read is granted to the school roles/HOMEROOM/SUBJECT_TEACHER already granted
conduct.read, constrained to each grant's scope and field policy. Withdrawal
belongs to SCHOOL_ADMIN and SCHOOL_LEADERSHIP. Subject grants cannot read class
snapshots; those routes require a CLASS/SCHOOL grant. This does not authorize
new business modules or permit direct modification of published content.

HOMEROOM/SUBJECT_TEACHER also receive `class.read` on their existing CLASS/SUBJECT
scopes: the design otherwise allows teacher classes yet denies their class header
and overview APIs. SUBJECT reads stay minimal and do not acquire class management.

## ADR-003 — File READY enum

Narrative documents call a processed file AVAILABLE, but the canonical DDL and
OpenAPI use READY. Code/DTOs keep READY and expose “Sẵn sàng” in the existing UI.
No file can download while QUARANTINED or without current resource permission.

## ADR-004 — Assignment integrity and lifecycle metadata

The handoff enforces one homeroom teacher per class but not the inverse
teacher/year constraint or exclusive subject teacher. Migration 006 adds a
derived year_id, a composite class/year FK and two GiST exclusions. A trigger
derives year_id from the referenced class; callers cannot set a different year.
Assignment/GrantView DTOs add optional `revokedAt` so the existing UI can show
revocation and assignment history without inventing status or rewriting dates.

## ADR-005 — Custom scoped role versus teacher assignment

The default HOMEROOM/SUBJECT_TEACHER grants require a matching current teaching
assignment, including on reads and historical-date commands. A custom delegated
CLASS role uses its own scope and grant validity; creating a non-teaching reviewer
does not require fabricating a teaching assignment. It still needs an active
membership/school, a current unrevoked grant, and the action and object scope in
that same grant. SUBJECT routes retain their explicit subject policy and minimal
DTOs. System templates are immutable; a school can create a bounded custom role
instead, and nobody can edit a role currently held by themselves.

## ADR-006 — Guardian creation within a class scope

`createGuardian` adds optional query `classId`. A homeroom/class manager supplies
their authorized class; omission requires SCHOOL scope. A newly created contact
is not visible to another class until a relationship is explicitly created.
Relationship creation may use a contact already visible in the manager's scope,
or an unassociated contact created by that same staff identity. Knowing an
unrelated guardian UUID cannot expand family access by attaching it to a student.

## ADR-007 — Transfer and handover commands

The contract has create/approve/reject for transfers and create/approve for
handovers, with no submit or apply endpoint. Creation submits the request;
approval applies its changes atomically and returns APPLIED. Transfer replaces
only the enrollment interval, retaining older class records and student identity.
Handover ends the old assignment/grant on its effective date and creates the new
pair in the same transaction, retaining original record authors. Future dated
handovers preserve the old teacher's access until the effective date. Open-work
counts are stored in the handover checklist and audit. No implicit parent links
or teacher assignments are carried into a rollover.

## ADR-008 — File scope and scan metadata

Migration 007 stores the upload purpose, optional class context, scan state and
sanitized rejection code. File DTOs add optional `scanStatus`/`rejectionCode`.
Uploader ownership alone never authorizes a read: their current action and scope
are checked. Other staff need a current school grant or an authorized typed link.
Upload names never form storage paths. Processing re-encodes raster images,
rejects active XLSX content and bounds ZIP expansion. Local processed files are
explicitly NOT_SCANNED. Production presently permits only re-encoded raster
images; PDF/XLSX acceptance needs an approved scanner integration.

The worker runs as edu_worker and consumes leased jobs with SKIP LOCKED, bounded
concurrency, ownership checks, lease renewal and retries. Invalid content becomes
FAILED with no automatic acknowledgement as DONE. Local identity mail writes
private LOCAL_FILE messages and clears encrypted token payloads after delivery;
used, expired or revoked tokens are cancelled before delivery. SMTP driver code
exists but SMTP fault/delivery testing remains pending and no Internet mail has
been sent by these local tests.
## ADR-009 — Import previews and resumable application

The handoff ImportJob DTO omitted year/class and parsed column metadata needed
by its mapping workflow. The implementation contract adds optional yearId,
classId and columns, plus optional decision/matchedId on ImportRow. Original
handoff files remain unchanged. Source and normalized rows are stored separately.

Preview hashes bind file/mapping/context and table versions. The current policy
conservatively invalidates previews on any change to the relevant tenant tables.
Worker writes are recorded in result_metadata so resuming a chunk recognizes its
own changes while detecting intervening edits. Small batches are atomic; batches
over 500 use 100-row transactions, retain applied rows and expose processed counts
when FAILED/CANCELLED. Exact file/mapping/canonical source keys prevent duplicates.

Staff imports create invitations with a school work profile, then apply that
profile on accepting a new membership; they never reset existing identity
credentials. Student updates require a stable existing code in the selected
class/year, while family changes stay in the verified relationship workflow.
Imported timetable versions remain DRAFT until B5 validation/publication.

## ADR-010 — Attendance slots and source versions

The existing UI offers morning/afternoon attendance alongside lessons. DAILY
keeps those explicit slots through optional MORNING/AFTERNOON fields, with MORNING
as the default. Summary queries select one slot and one DAILY/LESSON granularity;
they never combine lessons or both daily slots into a day denominator. Ranges
use an exclusive end, match enrollment intervals and are limited to 92 days for
the detailed summary endpoint. Wider exports belong to reporting.

AttendanceSession adds dataVersion independently from its optimistic version.
Every child record mutation locks its session and increments dataVersion in a
database trigger. Locked records cannot change directly. Publication checks
expectedSourceVersion in the same transaction as source locking and projection
creation, preserves previous snapshots, and atomically supersedes the previous
publication. Repeating publication of an unchanged source returns its current
publication. Parent payloads contain only the individual public attendance
fields; internal notes remain in the authorized staff snapshot.

## ADR-011 — Decimal points and explicit rule configuration

Base points are required input. Rule calculations use Decimal.js and serialize
two decimal places within the contract's eight-digit integer range. Bonuses are
nonnegative, penalties are negative, clamping happens after summation and the
highest satisfied threshold determines classification. Fixed rules reject a
manualDelta. Manual rules require explicit bounds; simulation validates those
bounds but does not create a conduct record.

School roles can author drafts. Class/subject catalog reads resolve current
authorized classes before selecting applied rule-set IDs. Issued configuration
is immutable in PostgreSQL; a new dated class rule period preserves its predecessor
and cannot replace a rule version already pinned to a conduct period. Revisions
are allocated under the school lock.
# ADR-012 — Conduct sources, reviewed corrections and complete READY projections

Conduct sources use stable attendance-record, activity-participant and position-assignment IDs. Subject teachers must anchor facts to their own assigned lesson and receive a minimal DTO without internal notes. Attendance mappings are explicit issued FIXED rules; one active conduct fact per attendance record is enforced in PostgreSQL. Source changes are checked again at approval and review.

LOCKED periods accept corrections only through an approved adjustment bound to the current baseline publication. The proposal and before/after score preview remain immutable; applying excludes retained old facts, appends attributed replacements and publishes a new revision in one transaction. READY publications store projection count/hash and verify both before publishing. A parent's displayed publication time must come from lifecycle metadata when READY was staged earlier.

# ADR-013 — Optional attendance linkage and authorization serialization

The existing attendance checkbox is represented by optional `AttendanceBulk.linkConduct`. Save returns optional `conductSync` counters and per-enrollment warnings. Corrected drafts may be excluded; an approved fact requires review authority. A locked/deadline-limited period remains unchanged while attendance saves and reports a warning. Published scores never change silently. Commands take the tenant lock before reading permission so a queued command cannot retain authorization read before a revocation.
## ADR-014 — Parent sessions and bounded published projections

Parents remain guardian relationships and private access links; exchange never creates an identity account. Tokens contain 32 random bytes and only hashes are persisted. Issuing/reissuing returns the fragment link once; idempotent replay returns 409. The default link lifetime is capped at 90 days and the selected active year's end. Reissue renews that cap while revoking the old link/session atomically.

The parent cookie is independent of the staff cookie. Session expiry is 30 idle minutes/8 absolute hours bounded by link expiry, matching handoff 03. `X-Parent-View` must match the cookie's current session, so changing children returns 409 in an old tab. Permissions and verified relationships are rechecked on each request. Staff preview uses a short-lived, revoked-after-read session through the same parent role and serializer without setting a cookie.

Parent queries use the `edu_parent` pool. SECURITY DEFINER helpers with fixed search paths expose only publication time or available document metadata after the same parent visibility checks. Individual items in a timetable/duty `items` projection are flattened inside the SQL predicate before counts/cursors, with stable derived internal IDs. Clients receive only the documented parent DTO. Actual publication time replaces a READY snapshot's creation timestamp in displayed payloads. Archived files are excluded from document counts and cannot stream. Only explicitly shared membership work contacts are shown.

## ADR-015 — delegation expiry, backdated assignments and capacity peaks

Grant creation and preview must cover the requested end date with currently valid authority for both the delegating action and every requested role action in the same permitted scope. A bounded authority cannot create an unbounded or later-ending grant. Invitation acceptance rechecks the current issuer ceiling; an expired or shortened issuer cannot leave a usable pending privilege. Platform bootstrap is limited to the default school-admin role and its own operator-grant ceiling.

Teaching assignment and scoped invitation requests add optional reason fields to the implementation OpenAPI. A start before the school's current date requires a reason, which is retained in the invitation and acceptance audit. Staff import supports the same reason column and guards. PostgreSQL timestamp formatting with OF emitted offsets such as +00, which JavaScript rejects; import proposals now use timestamptz Date values serialized to canonical ISO timestamps.

Class capacity updates check peak simultaneous non-cancelled enrollments across the entire academic year using the same interval helper as imports/transfers, rather than counting only today's roster. This prevents a capacity edit from invalidating already-planned future enrollment.

Evidence: qa/backend/temporal-integration.log, 41/41 executed; qa/backend/temporal-unit-contract.log, 11/11 executed. This does not certify support grants, connected browser UI or deployment operations.

## ADR-016 — dated class organization and immutable seating history

The existing group board supports moving a student to unassigned, so GroupAssign.groupId becomes nullable. Group/position writes accept an optional reason; past dates require a school-level authority and reason. Lists accept onDate to inspect the effective interval. Same-day replacements are retained as cancelled rows instead of deleted or invalid zero-length spans. Class version guards group commands, and a group move ends the dated group-leader assignment.

Class positions gain an optional groupId to represent one leader per group without inventing an account. PostgreSQL enforces one active interval per enrollment/position and single-holder interval exclusions. Definition changes cannot alter singleHolder while assignments remain. Cancelled assignments cannot create conduct sources. Shortening/cancelling a source used by approved locked conduct is denied in both service and SQL.

The original unique ACTIVE seating index could not represent a currently effective plan plus a future activated plan. Migration 015 replaces it with an interval exclusion and ends_on, while keeping activated content/seat rows immutable. Old and future ACTIVE revisions have non-overlapping effective intervals; callers choose by date. A same-date replacement archives the old revision with its contents preserved. Creating a new draft may supply expectedRevision to reject a stale editor. All seat keys, coordinates, students and effective enrollment are validated. Subject-only grants cannot open whole-class seating.

Evidence: qa/backend/classroom-integration.log, 44/44 executed; qa/backend/classroom-unit-contract.log, 11/11 executed. Migration 015 applied and replayed. Ending an enrollment still needs integration with group/position intervals; connected screens are pending.

### ADR-016 follow-up — enrollment boundary

Migration 016 closes group/position intervals in the same transaction when an enrollment ends or is cancelled. Future intervals starting at/after the cutoff are retained with cancelled_at and their original dates. Positions close before their supporting group membership. A locked approved conduct source still rejects a shortening/cancellation; no source history is silently rewritten. Extending an enrollment does not automatically extend old organization assignments.

Evidence: qa/backend/enrollment-org-integration.log, 45/45 executed, exit0, including actual transfer approval with current/future position intervals and retained enrollment history.

## ADR-017 — bounded schedule materialization and class-kind publication

Timetable/duty dataVersion tracks template or assignment edits independently of metadata status changes. Migration 017 protects published template/assignment rows, immutable lesson identity and past/source-linked lesson history. Timetable entries materialize only future occurrences, within 366 days and at most 5,000 occurrences per command. Published holidays are skipped. Current membership/identity/role, dated assignment and grant validity must cover every generated lesson; class/teacher/room conflicts are rechecked before publication. Used source lessons cannot be cancelled by a replacement, including unexpected preallocated future sources.

Timetable and duty publications are current per class/year/kind. PublishCommand.expectedPublicationId refers to that current class-kind publication, so a new schedule revision can reject a concurrent publication. Older published snapshots remain immutable and become SUPERSEDED atomically. A timetable projection combines effective lesson history for the child, excludes replaced cancelled periods, and contains public names/status only. Duty projections combine dated schedules; the latest published schedule covering a day wins, based on published_at rather than draft creation time.

Implementation schemas add dataVersion/publishedAt, lesson periodNumber/changeReason, parent lesson status, private ParentLessonBatch/ParentDutyBatch storage envelopes and duty/lesson fields in staff PublicationDetail. Parent endpoints still flatten and validate individual items through the read-only parent role. No whole-class roster or staff IDs are included in parent payloads.

Evidence: qa/backend/schedule-integration.log, 48/48 executed; qa/backend/schedule-unit-contract.log, 11/11 executed. Group-to-duty expansion at publication, the existing UI's single-lesson change/discard workflows and broader schedule races remain pending follow-up; no connected UI acceptance is implied.

## ADR-018 — group duty targets resolved at publication

Duty drafts may contain explicit individual assignments and dated group plans. Migration 018 stores group plans with typed class/schedule/group foreign keys, FORCE RLS and the same draft-only source guard. A plan contributes to dataVersion; publication resolves the group's effective, non-cancelled membership on its task date and materializes individual assignments with group_plan_id provenance. Empty active groups and duplicate individual/group tasks block publication. Expansion is bounded to 5,000 targets, and the publication binds the source version after expansion.

A later group move never rewrites a published child's task. The parent projection contains only that child's individual tasks. Group draft edits and generated assignment edits are rejected after publication by PostgreSQL.

Evidence: qa/backend/group-duty-integration.log, 49/49 executed, exit0; qa/backend/group-duty-unit-contract.log, 11/11 executed, exit0. Typecheck and lint exit0. The first unapplied migration attempt referenced an incorrect RLS function name and rolled back; after checking database metadata, the corrected migration applied and replayed successfully. No applied migration was edited. Connected frontend and operational acceptance remain pending.

## ADR-019 — explicit activity participants, reviewed evidence and publication

Activities retain explicit enrollment targets and separate metadata/data versions. Participant and evidence edits increment the activity source version. The implementation schemas include the existing illustration, roster edit, close/reopen and receive-state workflows; review explicitly selects guardian sharing. Cancelling an unreceived participant retains its row. Received participants and evidence history cannot be deleted. Due dates use the school timezone and remain within the academic year.

Assigning, reviewing and receiving evidence do not publish or create conduct points. Activity publication stores one immutable child projection per active participant. Shared documents require APPROVED evidence and an explicit sharing choice, receive new publication-bound document IDs, and remain scoped by the parent SQL role. Parent activity reads filter embedded documents through the same availability/section/download checks as document APIs. Archived files disappear from both embedded and standalone document lists.

An activity conduct source is an approved, non-cancelled participant from an assigned/closed activity at an event time after assignment/participant creation. Locked approved conduct prevents downgrading or cancelling that participant. Private evidence files are bound to one participant and cannot use the generic file-link flow to expose another child's evidence.

Evidence: qa/backend/activities-integration.log, 52/52 executed, exit0; qa/backend/activities-unit-contract.log, 11/11 executed, exit0; typecheck/lint exit0. Migration 019 applied and replay verified. The first integration attempt had two fixtures missing the required expiresAt for parent links (50/52); corrected and all 52 rerun. Browser UI, SMTP faults and B7 operations are still pending.

## ADR-020 — immutable announcement revisions and scheduled authority

Announcement edits after publication create a new DRAFT source with a stable rootId. Current parent/public readers retain the old immutable revision until its replacement is published. Migration 020 binds each publication to its root and permits only one current publication per root. Draft discard retains its rows. Scheduled edits cancel the old queue, return to draft and require explicit scheduling/publication again.

The implementation schemas add summary, audience, internalNote, rootId, dataVersion and actual schedule queue status/error. Targets are validated against the year, active class and current enrollment. PUBLIC is limited to whole-school announcements without student/staff targets. Public and parent projections contain sanitized paragraph/list markup and public sender labels, without recipient IDs or internal notes. HTML uses pinned sanitize-html 2.17.7 with an explicit tag allowlist and no attributes, URLs, remote resources or executable markup. Primary documentation: https://github.com/apostrophecms/apostrophe/blob/main/packages/sanitize-html/README.md and its CHANGELOG.md.

Attachments require available class documents; evidence cannot be repurposed through this flow. A file associated with a student may target only that one student. Parent document IDs are new, publication-bound IDs and require the link's documents section and download permission. Archive/withdraw/supersede checks apply again on reads. Public document metadata currently has downloadAllowed=false; there is no anonymous file-download operation in the supplied contract.

Scheduled jobs retain their requester and exact source version. At execution the worker rechecks identity, grant, class, targets and files inside the school transaction. Revoked authority yields an actual FAILED queue state without a snapshot. Side effects are idempotent across simulated acknowledgement loss; this test does not claim a real process-kill drill. The HTTP and worker application services share a minimal ActorContext, without fabricated HTTP requests.

Evidence: qa/backend/announcements-integration.log, 57/57 executed, exit0; qa/backend/announcements-unit-contract.log, 12/12 executed, exit0; typecheck/lint exit0. Migration 020 applied and replay verified. Earlier attempts retained in attempt1–5 logs exposed fixture activation/role/session/view issues, which were corrected through the real invite/accept/activate workflow. The additional multi-recipient private-file negative test led to a tighter attachment guard. Browser UI and operational drills remain pending.

## ADR-021 — persisted school settings with current policy effects

School settings use platform.schools.settings and the school's version guard. The implementation DTO also preserves the existing form's reportHeader, shareTeacherPhone, shareTeacherEmail and contactHours. No past publication or issued link is rewritten by saving settings. Default values are server policy defaults for an unconfigured school, not frontend demo data. ParentLinkTtlDays is bounded to the contract's 1–180 days and the active year's end; its default is 90 days. The frontend's older 366-day suggestion must be aligned during B6.

HomeroomMayPublish=false removes publish actions from effective default homeroom grants on every authorization read. Explicit school/custom delegation remains governed by its own grant. Teacher contacts require an active identity, membership, role, grant and dated assignment, the member's sharing choice and the school's display flag. Changing school flags does not overwrite member consent or link sections.

RequireSecondApprovalForAdjustment=true denies an approver equal to the requester, and denies applying an older self-approved proposal while this setting is enabled. Migration 021 independently guards the approval/apply transition in PostgreSQL. A different currently authorized approver can approve; apply still performs the existing baseline/source and atomic publication checks. Default false preserves the single-admin workflow while still requiring explicit approval.

School audit is read-only and requires school-level audit.read. Counts, search and cursors use the same authorized SQL source. Only an explicit allowlist of redacted change fields is serialized; identity email, raw before/after JSON and secrets are omitted. Timezone changes are rejected once academic years exist, preserving dated history. Migration 021 adds the corresponding SQL guard.

Evidence: qa/backend/settings-integration.log, 60/60 executed, exit0; qa/backend/settings-unit-contract.log, 12/12 executed, exit0; build/typecheck/lint exit0. Migration 021 applied/replayed. The first 59/60 attempt used /apply instead of the supplied /apply-and-publish route; corrected and all 60 rerun. Browser UI connection remains pending.

## ADR-022 — personal notifications with current target visibility

Migration 022 adds typed class/subject context, required_action, body and a per-recipient source key. Accepted invitations, staff-targeted announcement publications and received evidence create real notification rows in their business transaction. Batched publication delivery is bounded and source-deduplicated; replay does not multiply notifications. FAMILIES-only publications do not create staff recipient notifications.

The personal feed enumerates only the authenticated user's current active memberships and active schools, then sets one tenant per transaction. SQL first masks inaccessible title/body/target/class identifiers using current role actions and the same grant's scope. Announcement targets additionally require a still-current publication. Search, count and pagination operate on this masked projection, so a private original title cannot be inferred through its search count after revocation. A retained personal receipt may be marked read after its target becomes inaccessible; another recipient's receipt cannot be read or changed.

Global keyset pagination merges at most limit+1 already-scoped rows per membership, bounded to 100 memberships. Signed cursors bind the user and all feed filters, preserve PostgreSQL microsecond timestamps and recheck current rights on every page. There is no all-tenant browser filtering or bypass role. The implementation DTO adds body, schoolName, classId and accessible; unavailable targets are deliberately redacted, not replaced with demo data.

Evidence: qa/backend/notifications-integration.log, 62/62 executed, exit0; notifications-unit-contract.log, 12/12 executed, exit0; typecheck/lint exit0. Migration 022 applied/replayed. Actual two-school identity reads, cross-user cursor/recipient denial, live grant revocation, suspended-school exclusion, withdrawn-source masking, publication deduplication and an evidence task producer were exercised. The first attempt 61/62 used the pre-reset fixture password for school B; the test now retains its generated reset password in memory and signs in through the real API. Browser connection and operational load/fault tests remain pending.

## ADR-023 — dashboards, teacher classes, tasks and own schedule

The seven supplied overview/teacher routes now read PostgreSQL. Dashboard metrics, task previews and list counts run in a read-only repeatable-read transaction, with one school and a shared reference date. An explicitly selected historical year clamps its reference date into the year; historical/non-current years do not generate today's tasks. Counts use the same effective-grant predicate as their underlying rows. Subject grants permit roster metadata and the teacher's actual lessons, while full attendance, family, conduct review and publication tasks require a matching CLASS/SCHOOL action. Combining homeroom in A with subject teaching in B never grants full-class metrics or tasks in B.

The implementation DTO adds referenceDate/yearId to Dashboard; yearId/className/detail/status/tone/lessonId to Task; studentCount and minimal current own assignments to Class; and work display labels to Lesson. No identity email, family data or invented metrics are supplied. Teacher classes and task cursors bind the current authorization and selected year; a changed scope invalidates old cursors. Personal schedules additionally require an active paired assignment both today and on the lesson date, the authenticated member, exact subject scope, and schedule.read. An arbitrary memberId cannot turn the personal route into another teacher's schedule.

The teacher announcement feed requires teacher.self plus announcement.read, filters only current published revisions and relevant recipients, and omits internal notes. A newer draft remains invisible while the previous publication stays readable until replacement/withdrawal. No new operation or database migration is required for these read projections.

Evidence: qa/backend/dashboards-integration.log, 65/65 executed, exit0; dashboards-unit-contract.log, 12/12 executed, exit0; build/typecheck/lint exit0. Live mark/publish/withdraw and homeroom publication-setting effects were exercised. The first 63/64 attempt used the wrong test field cursor rather than nextCursor; corrected and the full 65-test suite rerun. Frontend connection and operational performance tests remain pending.

## ADR-024 — platform metadata, administrator bootstrap and operational state

Thirteen supplied platform routes manage operational metadata, the default school-admin role and real persisted settings/operation rows. Migration 023 retains the existing school form's shortName/province/level/accentColor/motto/publicIntro, lifecycle reason/time and a separate platform idempotency store. New schools are DRAFT and receive all five school role templates atomically. Activation requires a current active identity/member/default admin grant. Revocation removes only the target school's admin grants and refuses to remove its last active admin; other memberships, roles and passwords remain intact.

Platform mutations require current action authority inside the transaction, including an idempotent replay. Administrator invitations accept only the target school's active default SCHOOL_ADMIN role and SCHOOL scope. They enqueue the existing encrypted, one-time 48-hour invitation flow, without returning the raw token. Grant validity must fit the operator's current authority. Acceptance independently rechecks this ceiling and rolls back identity/member creation when that authority has expired. Existing identities authenticate and retain their passwords.

Global metadata lists have signed user/filter-bound pagination. A guarded SECURITY DEFINER aggregate returns only counts, onboarding flags and active admin work labels. It verifies a current active operator, sets one tenant, remains FORCE-RLS constrained, and restores the caller's tenant even after failure; it never returns student/family rows. Platform API authorization still cannot open ordinary school data routes. Audit uses explicit primitive metadata and omits invite email/token. Operation views show persisted state and an allowlisted summary, excluding storage locations, connection strings and arbitrary nested JSON. There are no fabricated backups or service status rows.

PlatformSettings adds footerNote; its support contacts, and a school's undeclared level, may be null. Persisted initial brandName is the product name EduManage, with unconfigured contacts left empty. No false support address or inferred school level is used. The original handoff source remains unchanged and operation/schema counts remain 264/303.

Migration 023's first executed aggregate referenced app.conduct_rule_sets; the actual table is app.rule_sets. Applied 023 was not edited. Migration 024 replaces this function through a forward-only repair. The nullable level enum was also corrected in the implementation contract. Evidence: qa/backend/platform-integration.log, 68/68 executed, exit0; platform-unit-contract.log, 12/12 executed, exit0; build/typecheck/lint exit0. Attempt1 65/67 and attempt2 66/67 are retained. Consent-based support access, connected UI and operational drills remain pending.

## ADR-025 — support conversations and explicit school consent

Migration 025 persists the existing support queue's LOW priority and WAITING_SCHOOL state. Messages retain their actual SCHOOL/PLATFORM side; older messages, if present, are UNKNOWN instead of assigning a guessed author role. A real school reply advances a waiting ticket to IN_PROGRESS. Message appends and platform ticket updates are idempotent and state/version checked; resolved/closed tickets reject new messages. Current school support administrators can access this metadata and consent during setup/suspension, without extending that exception to pupil data. Platform operators access only shared ticket metadata under platform.support.

Requests bind the ticket to the same school, a current operator, optional same-school class, explicit read actions, reason, actual requester and a maximum 14-day interval. CLASS requests allow only class.read/assignment.read. School consent requires a current school-level support.approve grant, scope/action authority and expiry ceilings; an operator cannot approve their own access. PostgreSQL also guards the independent approver and immutable requester/scope/time. A declined request uses the existing revoke URL with a dedicated SupportAccessRevoke request schema and decision=REJECT; normal revocation remains immediate. There are still 264 operations, now 304 implementation schemas. No new business route is invented.

The import_logs scope has a distinct import.read permission for metadata-only support views; it never grants import writes or raw row/download access. Selected-grant request integration is a separate remaining B1 step and is not claimed tested here. Metadata effective flags recheck the current operator identity/action and the grant's own time/state.

Generic resource cursors now sign PostgreSQL native text rather than JavaScript-rounded timestamps/decimals and explicitly place nullable sort values last. The comparator traverses null boundaries and preserves signed user/filter/source binding. Cursor version 2 invalidates older cursors for reload. Evidence: qa/backend/support-integration.log, 70/70 executed, exit0; support-unit-contract.log, 12/12 executed, exit0; build/typecheck/lint exit0. Actual ascending two-message pagination and support protocol transitions passed. Selected-grant reads, mixed operator/admin self-approval, broader null-boundary and expiry/read-audit checks remain pending.
## ADR-026 — selected support access: explicit metadata-only read context

The approved platform.support_access record is selected by the optional UUID header X-Support-Access on the metadata GET allowlist. Its school, class, actions and validity form an isolated read context; neither ordinary membership nor other operator grants expand it. Validation rechecks current operator authority and consent for each transaction. The context forces SQL read-only transactions and records a SUPPORT audit against the exact grant before delivery. Requests outside the allowlist fail closed. Migration 026 adds the typed, school-bound audit reference; no applied migration is changed. This implements the supplied support consent model without impersonating a school member or exposing student data.

## ADR-027 — scoped SQL reports and immutable private export jobs

All seven supplied report/export routes have real handlers. The existing individual
report is represented by the additional `student` report type, requiring a class
and one enrolled student. Its conduct section uses published projections only;
attendance and activities are explicitly internal. The existing UI `links` route
maps to canonical `parent-access` in the HTTP adapter. Grade/week filters and
export scope SCHOOL/CLASS preserve the current report viewer; all references,
date intervals (exclusive end), scopes and unknown filters are checked. The
Report DTO adds real display context, columns, notes and pinned publication IDs.

School summaries aggregate scoped facts in SQL before bounded result rows. Default
subject grants read only their own dated lesson attendance and authorized activity
projections; they cannot acquire daily attendance, class conduct, family/link data
or export rights by borrowing homeroom privileges in another class. Open conduct
periods have no invented score; locked summaries read immutable READY/PUBLISHED
snapshots with exact numeric strings and actual configured classification labels.

Export creation commits a bounded report snapshot and hash with a 202 job and
outbox event. Source/filter/requester fields are immutable through migration 027.
Worker execution and every download recheck current requester, scopes and grants.
A changed grant context requires a new export instead of delivering old broader
content. Revisions are pinned across later edits/publication replacements; retained
staff exports may describe an older publication, labeled with source/asOf and
revision, while current published reports omit withdrawn rows. Parent cookies
never authorize staff exports, and generic file URLs cannot bypass these guards.

Artifacts use the already-defined GENERATED purpose and scan status, private
atomic storage, a 25 MiB file cap, school quota and 24-hour download expiry.
CSV/XLSX stream literal cells with formula-injection protection and source context.
PDFKit 0.20.2 renders A4 with unmodified Noto Sans OFL 1.1 fonts, wide-table panels,
continuations and page footers. There is no runtime font or remote HTML fetch.
Expiry prevents access now; physical expiry/orphan maintenance remains a B7 task.

Executed evidence: 81/81 PostgreSQL integration checks, 12/12 unit/contract checks,
build/typecheck/lint exit0. All 264 supplied operation IDs are registered; this
route-coverage check is not a claim of 264 independent acceptance flows. The
three-page Vietnamese PDF was rendered with Poppler and every latest page visually
inspected; embedded fonts, Unicode text, A4 and footer/page counts were checked.

## ADR-028 — connected transport and minimal self context

The existing login/profile/workspace forms need server-owned school names/slugs,
status, department and current own duties. Context now returns these metadata and
server time, excludes ended default teacher assignments and keeps every grant's
role code and paired assignment date bounds. Hints do not authorize a request;
the API still evaluates school/class/subject/time on every read and mutation.
No student/family dataset or another person's profile is loaded for context.

Migration 028 adds self-profile work phone and biography to identity.users.
Only self User DTOs expose them. Editing them never modifies a membership's
published work contacts, and parent teacher projections continue to use the
per-school sharing policy. Valid invitation-token inspection gives only recipient
work name, intended role labels, inviter label and school metadata, plus whether
the existing identity must log in and whether the current cookie matches. It
does not expose existing identity IDs, global contacts or credentials. Authorized
notification targets include their year ID for the existing classroom URL; denied
targets redact this identifier together with class and target IDs.

Browser transport uses relative URLs, HttpOnly cookies, memory-only CSRF/context,
one logical idempotency key through uncertain acknowledgement, no automatic write
retry and no mock/data fallback. Authentication changes invalidate in-flight JSON
and binary bodies. An invalid current password is a form error and preserves the
otherwise valid cookie. Link fragments are removed from history, kept in page
memory, and consumed after acknowledgement; reset-token presence is not described
as server validation. Candidate adapters and their unit checks remain separate
from facade activation and actual browser acceptance.
