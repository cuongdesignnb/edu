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

## ADR-029 — persist existing organization display fields

Existing school/class/dictionary/calendar forms contain website, subject color,
grade level, room capacity, class room and motto, and term opening date. Migration
029 adds these fields with tenant composite references and bounded values. Only
numeric legacy grade codes are backfilled; an opaque code keeps an unknown level.
The subject color default is an existing product display default, not fixture data.
School websites accept HTTP/HTTPS only, without embedded credentials.

Profile reads use an explicit field allowlist. Both school and platform profile
commands persist supplied display fields with the original optimistic version.
Room references must belong to the current school and be active. Clearing a room
is explicit null. Term opening dates must fall in the half-open term interval.
Dictionary GET calculates historical in-use metadata inside the tenant SQL scope;
it does not expose private source records. Dictionary kind-inapplicable fields
return 422 rather than disappearing silently.

Connected adapter candidates preserve the corresponding form names, expose
unconfigured values honestly, reject absent required response metadata and require
the version displayed by the form for dictionary edits. No latest-version fetch
or mock fallback is used. Executed evidence: 84/84 PostgreSQL checks, 12 backend
unit/contract checks, 22 frontend unit checks, typecheck/lint exit0. Browser
activation and full workflow acceptance remain separate outstanding work.

## ADR-030 — atomic organization commands and authorized read metadata

The existing year wizard collects terms, holidays and optional rule copying in
one submit. YearCreate accepts bounded nested terms/holidays and copyRules. The
school command validates every range, creates partial weeks at term boundaries,
copies only an actually applied issued rule set into independent draft records,
and audits/idempotently acknowledges the whole transaction. Copying requires
rules.read and rules.manage even on replay. Half-open dates are canonical in the
API; the browser adapter converts its inclusive last day once. A maximum 730-day
wizard range bounds week generation. New/edited ranges are serialized by the
school lock and reject overlaps; earlier retained synthetic history is preserved.

ClassCreate/Patch can request a homeroom membership/date/reason. The existing
StaffService assignment validator enforces school membership, paired role/grant,
delegation expiry ceilings, teacher uniqueness and dated reason requirements.
Failures roll back the class change. Replacing a current homeroom returns
HANDOVER_REQUIRED. Class activation checks active membership/role/grant; a draft
transition retains facts. Archiving a year archives its classes and blocks edits.

CalendarCreate supports explicit DRAFT/PUBLISHED; CalendarPatch supports reasoned
WITHDRAWN. This preserves the existing holiday form without sequential partial
publishing or physical deletion. WeekPatch can accept inputDeadlineDay, converted
by PostgreSQL with the actual school timezone; both date and timestamp together
are rejected. The date represents the last millisecond of that school day.

Read-only year/term/week/class projections add the metadata used by existing
screens. School-wide counts require the corresponding live school grant; a
subject grant does not receive a full-class student count. Missing authority is
null, never a fabricated zero. Week lock metadata is only available to a school
year manager. Selected support grants do not inherit student aggregates.
Filters/counts/keysets remain inside tenant SQL; cursor signatures include their
authorization bindings. Mutation acknowledgements remain minimal, avoiding
replay of private aggregate data after permission changes. Candidate adapters
require the displayed version and explicit withdrawal/archive reason. Their
activation and browser acceptance are still outstanding.

## ADR-031 — deny missing parent context before private joins

An executed retained-database run timed out at five seconds for an edu_parent
SELECT on parent_publication_items with no transaction context. Raw student
SELECT was correctly denied; the expensive projection policy caused the failure.
Migration 030 replaces the two permission helpers with explicit early return for
null/mismatched tenant or missing parent session, followed by the unchanged
session/link/guardian/school/section/publication conditions. Policies also include
an uncorrelated tenant predicate. SECURITY DEFINER ownership/search path and
restricted execution grants are retained; RLS remains enabled/forced and no role
receives BYPASSRLS. No applied migration, history, volume or timeout was changed.

The full 87/87 suite passes with populated parent, expiry/revoke and multitab
checks. The no-context query measured 5.527 ms, EXPLAIN execution 0.022 ms and zero
rows. This diagnostic is not a concurrency or p95 acceptance result. Migration
checksums/replay and the raw-row 42501 denial were also actually tested.

## ADR-032 — purpose-bound organization pickers and explicit list completion

Class and assignment forms need minimal reference data under their current write
authority. Optional purpose queries authorize class-picker through class.manage,
and assignment-picker through assignment.manage. Ordinary directory endpoints
retain their existing read permission. Picker SQL excludes archived years/classes
and inactive dictionaries/members before pagination/counting. Assignment subjects
exclude the product's reserved non-teaching codes. Member pickers allow only work
labels and current homeroom labels; they never return login/work email, telephone,
roles, grants or student counts. Class-scoped authority stays class-scoped.

listWeeks accepts a validated onDate and applies the half-open week interval in
SQL. The frontend uses actual school time and never chooses a synthetic current
week. Every connected list requires valid PageInfo; an absent pagination envelope
is a read error, not a fabricated empty/complete list.

Executed evidence: qa/backend/b6-form-pickers-integration-final.log contains
88/88 PostgreSQL checks, exit0, zero skipped, including unknown purpose, foreign
school, immediate revocation and onDate boundary/invalid-date checks. Backend
unit/contract checks are 12/12. Frontend unit checks are 31/31, with typecheck/lint
exit0. The 36 candidate methods remain unactivated and are not browser acceptance.

## ADR-033 — bounded rollover preview and acknowledged command stages

The supplied 264 operations contain create/validate/commit rollover commands but
no end-year workflow reader. getRolloverPreview is an explicit additional GET at
/schools/{schoolId}/academic-years/{yearId}/rollover-preview, under current SCHOOL
year.manage, matching the write contract. This does not grant directory reads.
One repeatable-read transaction selects the exact non-cancelled source enrollment
ending with the source year, minimal student ID/code/name/status and class/grade
labels. It excludes birth dates, preferred names, family/contact fields and private
notes. Eligible target years/classes exclude archives. Their enrollment counts
use each target's actual first day. Unknown grade level is null. All source class
statuses are included, matching the native plan validator, rather than silently
omitting students enrolled in draft classes. Bounds return PREVIEW_TOO_LARGE;
they never truncate a roster and present it as complete.

The supplied handoff remains unchanged. Runtime OpenAPI explicitly contains 265
operations and 310 schemas; progress tracks the new SC07 operation separately.
No production rollout or permissions bypass accompanies the extension.

The browser candidate retains the acknowledged batch ID/version and independent
create/validate/commit keys in memory. An uncertain response retries only that
stage when the user retries. STALE_PREVIEW is returned first; a later user retry
revalidates the acknowledged version without fetching/overwriting a new version.
Success requires APPLIED and a matching returned plan. Counts are derived from
that committed plan. Authentication changes clear private preview/flow memory
and stop subsequent stages. This is not durable recovery across page reloads or
completed browser acceptance; those remain separate work.

Executed evidence: qa/backend/b6-rollover-integration.log contains 89/89 checks,
exit0 and zero skipped, including exact end-year membership after transfer,
target counts/archive exclusions, write-only role redaction, cross-school denial,
subject denial and immediate revocation. Backend unit/contract is 12/12; frontend
unit is 38/38 including seven rollover checks for uncertain acknowledgements,
stale preview, changed authentication and substituted plans. Typecheck/lint and
Docker runner build completed with exit0.

## ADR-034 — school overview fields with independent aggregate authority

getSchoolOverview keeps its school.read entry permission and adds an explicit
schoolOverview projection for the existing SC01 layout. School-wide class,
student, member and parent-link totals require their respective current SCHOOL
actions. A CLASS/SUBJECT action never supplies a school total. Unavailable counts,
panels and setup completion are null. The generic class metric also applies its
class.read predicate instead of counting every school class under school.read.

One repeatable-read transaction computes active/draft classes, selected-year
enrollment, current active staff, valid verified family links and actually opened
links. Only EXCHANGED/READ events count as opening; STAFF_PREVIEW is excluded.
Prior-year enrollment uses the last included day. Setup reads actual terms/weeks,
valid homeroom metadata, activated-class roster/timetable, an issued rule set
actually applied in the selected year and an existing family publication. Zero
classes does not produce a completed setup step. Each unavailable step says that
its status cannot be viewed, without turning that status into false or zero.

An initial 88/90 run exposed a retained fixture year with more than 2,000 classes.
The repair computes full counts/setup inside SQL and returns six class preview
DTOs plus classesNeedingActionTotal from a window count before LIMIT. No data or
volume was deleted and no partial list is described as the total. Announcement
cards contain only selected-year school publication/schedule metadata, without
HTML, private notes or recipients. Action cards use current school authority.

The later 89/90 run used teacher-b for a cross-school denial assertion, even
though BE07 legitimately grants that identity SCHOOL_ADMIN in school B. The
isolated repair invites a new identity only into school A and gives it school.read
plus student.read for one class. All school totals/setup/panels remain null;
school B is denied and revoking its SCHOOL grant immediately denies the overview.

Executed evidence: qa/backend/b6-school-overview-integration-isolated.log is
90/90, exit0, zero skipped; all 30 migration checksums/replay are verified. Backend
unit/contract is 13/13, frontend unit is 41/41, typecheck/scoped lint/build exit0.
Runtime remains 265 operations and now 316 schemas. These checks do not certify
browser activation or B7 performance; retained-fixture timings are not p95 load
measurements. All 25 school methods now have candidates, still unactivated.

## ADR-035 — separate staff identity and permission revisions

The HttpOnly session remains the authentication authority. Memory-only context
now compares actual school/action/grant/assignment/date boundaries, excluding
display fields, CSRF and server clock refreshes. A changed scope increments the
private-read revision after installing the new context; changed identity also
clears CSRF and uncertain command keys. HTTP guards run before sending, after
headers/body decoding and on failure. An old 401 cannot clear a newer login.

Composite school methods also bind their complete result/error to the starting
identity and scope. This prevents assembling old private data with new context
after individual requests have completed. Multi-stage commands still explicitly
check between stages; a wrapper is not a substitute for those checks.

Rollover previews are evicted on any scope change. Same-identity retries retain
only batch ID/version/status/hash, acknowledgement body and independent stage
keys, with no cached student plan or names. Even APPLIED retries call the native
commit with the original key/body so current authorization precedes replay.
Nothing is persisted to browser storage. Durable reload recovery, query-provider
activation and real browser revocation checks remain separate pending work.

Executed frontend evidence is 51/51 in
qa/backend/b6-scope-owner-frontend-unit.log; TypeScript/scoped lint exit0. Backend
source is unchanged from the executed 90/90 PostgreSQL and 13/13 contract/unit
checkpoint. No browser, restart, restore or performance PASS is inferred.

## ADR-036 — native platform school wizard and bounded operational form metadata

PL03 creates a draft school with an optional default administrator invitation in
one transaction. Supplying firstAdmin requires current platform.admins.manage in
addition to platform.schools.manage, before cached acknowledgement replay and
inside the transaction. Default roles exist before invitation creation; grant
delegation bounds still apply. A failed invitation rolls back the whole school.
The invitation is queued to the existing encrypted mail outbox, without returning
its token. It does not activate the school or satisfy the active-admin guard.

PlatformAdminInviteRequest allows the server to supply validFrom. This preserves
the same request body/idempotency key when a browser retries an uncertain command.
Explicit grant dates remain supported. Invitation acceptance expiry is separately
configurable as 1–14 days with the existing proposed 48-hour default. It never
extends the operator's grant ceiling or a school grant's validUntil.

Four explicit additions fill existing UI contract gaps: getPlatformSchoolOptions
under platform.schools.read; checkPlatformSchoolIdentity under
platform.schools.manage; listSchoolAdminInvitations and
revokePlatformAdminInvitation under platform.admins.manage. The latter SQL reader
and versioned command select only one system SCHOOL_ADMIN proposal for the same
school. They exclude ordinary staff proposals and never return tokens, proposed
permissions or school pupil data. Province facets are bounded complete metadata;
exceeding the bound is an error. Exact code/slug checks remain advisory; database
uniqueness decides creation. School class/staff count sorts and admin-label search
are applied in SQL rather than sorting or filtering a browser tenant dataset.

Executed evidence: b6-platform-wizard-integration-final.log is 92/92, zero skipped,
30 migrations verified; backend contract/unit 14/14 and frontend unit 58/58.
Runtime is 269 operations/321 schemas. Ten added adapter candidates are unactivated.
The literal-wildcard test attempt ran no files, exited1 and is separately retained.
These results do not certify browser workflows, mail SMTP delivery or B7 drills.

## ADR-037 — support projections and commands preserve current independent authority

getPlatformSupportOptions uses current platform.support for minimal non-archived
school labels, open ticket IDs/titles and active support-operator IDs/names. SQL
computes full queue/grant totals before preview bounds; excessive choices fail
explicitly. No pupil, family or directory contacts are returned. An optional
school filter applies to every school/ticket/count query. Consent canonical
status is unchanged; viewStatus is an explicit server projection of current
expiry, effective operator/school authority and approval/revocation state.
List filters use that SQL state before keysets, rather than a browser tenant list.

requestPlatformSupportAccess binds a same-school open ticket to the authenticated
operator, an existing read-only action allowlist and 1–14 server-computed days.
The request has no operator ID or browser-generated timestamps. This supports
byte-identical uncertain retries and never approves access. School consent and
all selected-read checks remain independent. Non-archived setup/suspended schools
can request metadata support, matching the existing consent/handover exception.
relinquishPlatformSupportAccess changes only an owned, unexpired requested/approved
grant with a displayed version and reason. It cannot revoke another operator's
grant, approve it or extend it. Replay still requires current platform.support.

SupportTicketPatch.message joins status/assignee changes in one transaction and
idempotent acknowledgement. Invalid text/assignee rolls back both; a closed source
rejects messages. Native message counts, requester IDs, school state and message
author IDs let UI retain actual metadata without fabricated empty histories or
actors. Unknown historical message side remains UNKNOWN. Operational reasons
validated against personal-number disclosure are available only in authorized
audit projections; request console logs still omit bodies and secrets.

getPlatformAuditOptions returns bounded actual historical actor choices under
platform.audit. Actor and date filters execute before pagination; date endpoints
are whole inclusive days in Asia/Ho_Chi_Minh. Response diffs omit unknown/private
fields and do not invent previous values. None of these additions grants access
to ordinary school pupil data. Supplied handoff files are unchanged.

Executed evidence: b6-support-ui-integration-final.log is 94/94, zero skipped,
30 migration checksums/replay verified; contract/unit 14/14 and frontend unit 62/62.
The earlier 93/94 fixture failure is retained. Runtime is 273 operations/326 schemas;
62 adapter candidates remain unactivated. Browser, final deployment and B7 drills
are not certified by these checks.

## ADR-038 — School support and audit UI use independent native permissions

The existing school support overview mixes tickets and temporary access decisions.
`support.manage` authorizes ticket metadata and conversation only; the supplied
`support.approve` permission still controls listing and deciding access grants.
getSchoolSupportSummary returns exact SQL ticket totals and explicit null grant
totals when consent authority is unavailable. Native adapter pages execute status,
priority and grant-display filters in SQL. Ticket details request grants only when
the server confirms the current consent permission. Approval still independently
checks delegation ceilings, source version, expiry and prohibition of self consent.
Decline/revoke require the displayed version and a validated human reason, which
is recorded in both authorized audit projections. Appending a message remains an
idempotent append, with the existing atomic WAITING_SCHOOL → IN_PROGRESS transition.

getSchoolAuditOptions returns actual historical school actor IDs/names and target
types under audit.read, bounded to 1,000 each with a visible limit error. These
IDs enable the existing exact actor filter; they are not directory/contact DTOs.
listSchoolAudit applies actor, target type and inclusive whole-date filters before
keyset pagination, using the school's persisted timezone. Current permission and
tenant context remain mandatory; private/unknown diff fields are omitted and
unknown historical prior values are not fabricated. Cursor identity includes the
filters. School suspension continues to allow support metadata/consent as already
specified, while ordinary audit reads remain suspended.

apiList/apiPage now bind the complete multi-page read to one staff identity and
access revision, checking between requests. A login/scope change cannot combine
rows from successive owners. This also covers session notification pagination.

## ADR-039 — PL10 displays operational evidence and actual backup records

getPlatformOperationsOverview is purpose-bound to current platform.operations.
It reports schema/checksum/runtime-role/FORCE-RLS checks, a parent DB connection
probe and an actual private-storage write/remove/free-space probe. Unknown or
failed probes are explicit states. SMTP configuration alone is not successful
delivery: only recent SMTP acknowledgements qualify, failed jobs remain visible,
and local file mail is identified separately. No secret, raw payload or connection
string is returned.

Migration 031 adds minimal worker-cycle evidence. Only edu_worker can insert or
update it; edu_app can read and edu_parent has no access. WorkerRunner records its
cycle after actual queue/mail/DB work completes; a failed dependency cannot renew
the evidence. Worker state requires at least one healthy cycle within 60 seconds,
otherwise it is degraded or unknown. This is process-cycle evidence, not a claim
that every queued business job succeeded or every worker replica is healthy.
The existing container heartbeat remains after the same successful cycle.

A guarded SECURITY DEFINER aggregate returns only counts for current school
administrators and pending/expiring single default-admin invitations. It verifies
the authenticated operator's current platform.operations grant, retains FORCE RLS,
selects each explicit school and restores the prior tenant context. It returns no
names, membership IDs, invitation emails or pupil data. Remaining operational
counts execute directly in SQL and do not borrow directory/support permissions.

Backups are the ten most recent actual BACKUP operation records with full total,
including queued/running/failed states. No daily/weekly success or retention is
invented. Artifact paths and unknown metadata are omitted; checksum/error/revision
values are validated before projection. This GET does not initiate backup/restore.
The final requested drills and their verified CLI records remain B7 work.

Executed evidence is 97/97 PostgreSQL integration, zero skipped, with 31 migration
checksums/replay verified; 69/69 frontend and 15/15 backend contract/unit, with
TypeScript and scoped lint exit0. First PostgreSQL run was 94/97 and its log is
retained. Fresh retained synthetic-school fixtures preserve the existing timezone
lock and avoid unrelated historical choice limits. Native runtime is 276
operations/333 schemas. These adapter
candidates remain unactivated; browser and final Docker acceptance are pending.

## ADR-040 — Retained form owners and bounded opaque keyset reuse

makeStaffCtx captures the current memory-only cookie-session actor, server time,
school date and staff access owner. The future native hooks must capture it during
render/query setup and retain that same context for callbacks. withStaffAccess
checks the originating owner before invoking a method, so an old form cannot
submit through the new login/current permission scope. Session profile, session
and notification methods enforce the same initial context, and notification
multi-command batches check between acknowledged steps. Intentional auth/public
flows remain separate; no actor/role from this context becomes server authority.

Late bootstrap CSRF completion is identity-bound. Authentication clears the old
pending bootstrap, an obsolete response cannot install its token or send the
waiting write, and its finalizer cannot clear a replacement bootstrap promise.

Numbered UI keyset walks cache only opaque server cursors, scoped to access
revision, operation, params, filters, page size and selected support grant. The
memory cache is bounded to 32 queries × 64 cursors, contains no row payload, and
is cleared on identity/permission change or validated staff mutation ACK. Reads
always fetch actual rows again. Changed totals can rebase once to page one; bad
responses/cursors remain visible errors. Parent/public pagination is excluded
from staff ownership/cache, pending its independent portal context binding.

This improves repeat navigation; the first deep jump still walks keysets. It is
not evidence of B7 performance or a solution for bulk filtered IDs. Native hooks
and facade activation must install captured contexts and cache/query purging;
the legacy hooks are not certified by this helper checkpoint.

Actual frontend unit evidence is 79/79, zero skipped, in
qa/backend/b6-context-keysets-frontend-unit-final.log; TypeScript and scoped lint
exit0. Backend is unchanged from the prior 97/97 integration and 31-migration
checkpoint. No additional backend or browser run is claimed.

## ADR-041 — Atomic school-role replacement and membership ending

The existing member form replaces a whole school-role selection. Sequential
create/revoke calls could leave partial authority or overwrite another editor.
`replaceMemberSchoolRoles` is one versioned, idempotent transaction under the
school lock and current `role.manage`. Its purpose-bound `MemberSchoolRoles`
reply carries only member ID/version/status and school grants; it does not lend
`member.read`, work contacts, identity metadata or class-assignment visibility.
Self edits, inactive/foreign roles and removal of the final current administrator
are denied. A suspended member can have roles prepared without acquiring access;
ended or unaccepted memberships require their lifecycle workflow first.

Selected current/future school grants retain their IDs and exact expiry; this
command never renews them. Removed school grants are revoked as history, while
class/subject grants and assignments stay separate. New grants start at server
time, with optional explicit `validUntil`; every added action and the command
authority must cover that interval. The default unbounded interval is rejected
when the editor's authority expires. Invalid additions roll back the entire set.

Migration 032 adds the last membership lifecycle reason and an invoker trigger
that advances the member version on school-grant inserts/updates/deletes. Thus
independent grant commands also invalidate an already-open school-role form.
Class/subject grant changes do not replace the school-role selection. Existing
generic update triggers continue to own actual version increments.

`endMember` requires current `member.manage`, a displayed version and a reason.
It protects self/final-admin membership and revokes all current/future grants
and teaching assignments atomically, retaining original dates/history and the
shared identity at other schools. The reply reloads the member after grant
triggers, so it contains the actual final version. Reactivation does not restore
grants revoked by ending. Native frontend candidates retain nullable metadata,
require the displayed version, and never fetch a newer version to force a save.

## ADR-042 — Preserve the school invitation form without synthetic authority

The existing school form permits several school roles or none, descriptive
proposed duties, and a 1–30 day invitation lifetime. `inviteSchoolStaff` keeps
that workflow as a dedicated atomic command with unique explicit role IDs.
The single scoped-grant invitation and platform-admin invitation contracts keep
their own bounds, including the platform 14-day maximum and 48-hour default.
The supplied handoff source is preserved; generated runtime contracts document
these extensions. A proposed duty is text, never an inferred teaching assignment
or base permission.

All selected roles/profile data and one encrypted mail job are committed
together. A repeated confirmed request returns one receipt/mail job; invalid
roles and duplicate current membership/pending invitations fail visibly.
New grant starts come from server time and optional delegation ends are checked
against each current action and inviter command authority. Accepting multiple
roles creates the membership/grants in one transaction. Accepting no roles
creates an active membership with zero grants; both acceptance and mail delivery
still require the inviter's current authority. Losing that authority rolls back
even creation of a new identity. Existing identity credentials remain governed
by the prior invitation authentication workflow.

Staff invitation list/ACK DTOs return actual display name, role IDs, descriptive
duty and, for authorized lists, the actual inviter label. No raw invitation token
is returned to the staff form. Expired invitations remain historical source rows
and cannot be revoked as currently pending or delivered. The frontend derives
the expired display from server-aligned time and preserves native policy errors,
with human messages for final-admin, self-edit and delegation-expiry guards.

These five staff adapters remain candidates. Legacy facade/hooks, member and
combined directory projections, role screens, assignment/handover workflows and
browser acceptance still need connection before B6 can be certified.

Actual evidence for ADR-041/042: 32 verified migrations and 103/103 PostgreSQL
integration, zero skipped, in `qa/backend/b6-staff-integration-complete.log`;
17/17 backend contract/unit and 88/88 frontend unit in the corresponding staff
final/complete logs. TypeScript/scoped lint exit0. Runtime is 279 operations and
337 schemas, with 74 adapter candidates and zero facade activation. This is not
browser, final deployment, backup/restore, SMTP or performance acceptance.

## ADR-043 — SQL staff directory with native scope and Vietnamese ordering

SC10's combined table uses `listStaffDirectory` and `getStaffDirectorySummary`
under current school-wide `member.read`. PostgreSQL combines member rows and
currently pending/unexpired invitations before filtering, counting and keysets.
Invitations are included only with independent `member.manage`; their KPI is
null without that authority, and requesting an invitation-only filter is denied.
Losing invitation authority invalidates an earlier directory cursor through its
scope fingerprint. Directory authority does not lend invitation history, role
catalog permissions, assignments or exports.

Member email is actual work email, never a login-email fallback or search over
hidden identity contacts. Nullable work fields remain explicit. Invitation rows
have no fabricated member/user ID or ACTIVE membership status. Labels show real
current role/duty metadata, without role permissions or other private profiles.
Departments and role-filter names are bounded purpose choices, with an explicit
overflow error. KPI counts cover the actual whole school, independently of the
current table filters/page. Locked identities retain their source lifecycle
status but have `accessActive=false` and do not count as active work access.
`Permissions.grants()` also excludes locked/inactive identities, so their member
profile never advertises effective grants that cannot be used.

Migration 033 installs the Vietnamese primary-strength ICU collation and the
existing NFD/combining-mark/đ search folding in SQL. Directory names sort by final
word, then full name, then ID; departments use Vietnamese ordering. Generic
keysets support trusted non-null composite text keys with their own collations;
signed cursors preserve every component instead of concatenating boundaries.
Single-key nulls remain last in either direction. Installation verification
checks the collation provider/determinism and its actual runtime version.
Search matches each displayed name/work email/department/duty independently;
it does not match across concatenated fields or treat `%`/`_` as wildcards.

The existing export-size call reads all actual filtered rows with explicit
`purpose=export`, requiring both `member.read` and `report.export` on the server.
It retains all opaque-page filters, checks captured staff ownership between
stages/pages and fails rather than truncating above 10,000 rows. These are live
directory rows for the existing browser CSV/XLSX formatting, not publication
snapshots or proof that the browser download flow has passed acceptance. Actual
academic report exports retain their prior pinned worker/file workflow.

The teachers adapter is a candidate, not facade activation. Native screen
connection must retain nullable/unavailable panels, invitation-specific status,
actual versions and native role-filter options, and check ownership before
download side effects. Member details/role and assignment adapters, remaining
repositories, browser acceptance and B7 deployment/drills/load remain required.

Actual ADR-043 evidence: 33 verified migrations/checksums/replay and 107/107
PostgreSQL integration, zero skipped, in the final directory integration log;
18/18 backend contract/unit and 94/94 frontend API unit. TypeScript/scoped lint
exit0. Runtime is 281 operations/341 schemas and 75 unactivated candidates.
No browser download, E2E, final Docker deployment, drill or load PASS is claimed.

## ADR-044 — Member details retain real counts and separate read authority

SC11's other-school indicator is a coarse count in the agreed business UI. A
missing native read model must not substitute zero or expose another school's
details. Migration 034 introduces a purpose-bound SQL function accepting the
current-school member UUID. It checks an active caller identity, membership and
school, a current School-scoped `member.read` grant and role permission, and
rejects parent/selected-support contexts. Only `edu_app` has runtime EXECUTE;
parent and worker execution are denied. It resolves the target within the source
school, counts all membership states in other schools under their explicit FORCE
RLS contexts, restores the caller's context on success/error and returns only an
integer. It never impersonates the target identity or returns foreign metadata.

`getMemberDetails` runs under current `member.read`. Its read-only repeatable-read
snapshot keeps grants, school-local dates, source state and aggregate authority
consistent within the request. Work contact nulls remain unknown; global login
email is not a fallback. Effective grants retain every native action and scope;
default teacher actions must also pass the assignment's date window. Held school
grants remain distinct from effective access, including future grants. Assignment
history is available only with `assignment.read`, otherwise null, with exact
assignment/grant intervals, revocation, real creator and server-derived activity.
More than 2,000 assignments fails explicitly rather than silently truncating.

School role choices require `role.manage`. They contain only ID/version/label,
code/system metadata and current delegation eligibility/expiry, without lending
the role permission catalog. An action's greatest current grant end is its
ceiling; the earliest ceiling across all role actions and `role.manage` bounds
the proposal. Missing authority disables that choice. More than 1,000 choices
fails explicitly. Actual write commands still recheck all delegation rules.

`listMemberHistory` requires both `member.read` and `audit.read`. Member,
assignment and grant target predicates apply in SQL before total/keyset queries;
cursors bind the subject and caller. Only declared paging/sort parameters are
accepted. It uses the same sanitized audit projection as the school audit.
The member adapter keeps unavailable history/assignment/choice panels null,
retains actual count/date/version/contact/grant metadata, checks staff ownership
between profile/history stages and fails explicitly beyond 2,000 history events.
It remains unactivated until the native UI accepts these DTOs and unavailable
states, submits displayed versions/reasons and uses native effective permissions.

## ADR-045 — Personal notification feeds page own memberships

Retained test schools exposed an implementation cap of 100 active memberships:
an ordinary global notification query failed before checking actual receipts.
That cap was not a business restriction. Membership discovery now reads only the
authenticated user's active memberships in active schools through UUID keysets,
100 at a time. A supplied school filter applies before paging; an unknown or
invalid school still fails. Mark-as-read can traverse subsequent batches and
stops at its owned receipt. No RLS policy or parent authority was widened.

Each source-school transaction still rechecks current membership and grants,
redacts revoked/withdrawn private targets before search/count, and counts all
matching receipts. For each school the feed queries at most `limit+1` rows and
keeps only the globally newest `limit+1` candidates after merging. This bounds
candidate memory without truncating total counts or imposing a school-count
limit. Existing microsecond/UUID signed cursor and query/caller binding remain.
Multi-school discovery is a current feed, not an immutable publication snapshot.

Actual ADR-044/045 evidence: 34 verified migrations/checksums/replay, **113/113**
PostgreSQL integration with zero skipped, **19/19** backend contract/unit and
**99/99** frontend API unit; TypeScript/scoped lint exit0. Failed iterations and
their repaired causes are retained in the implementation report. Runtime is
283 operations/345 schemas and 76 unactivated candidates. These checks do not
certify frontend activation, E2E, final Docker, restart, backup/restore or load.

## ADR-046 — Dated assignment previews and purpose-bound matrix metadata

SC12/SC14 now have explicit native read models. `getStaffAssignmentMatrix`
requires current School-scoped `assignment.read`; it does not lend `member.read`,
year/dictionary reads or a role catalog. SQL limits the projection to the selected
school/year before ordering and reads actual subject colors, class versions and
nullable assignment cells. Cells keep source assignment/grant date windows,
membership/identity/role state and server-derived current access. A missing year
stays null. Archived display retains the agreed inclusive year-end-minus-62-days
reference; authorization always uses the current grant. More than 200 subjects or
2,000 classes fails explicitly rather than silently truncating. Member profile
navigation requires its independent `canViewMembers` authority.

`previewStaffAssignment` is a CSRF-protected POST marked `x-read-only`. It uses a
read-only repeatable-read transaction, current `assignment.manage`, the same
dated proposal validation and delegation expiry ceilings as assignment creation,
and real SQL overlap checks. It returns exact native action codes for the proposed
class/subject; held subject-A actions do not imply subject-B rights. The request
does not persist grants, assignments, audit or idempotent command acknowledgements.
Repeated previews always reauthorize, including when supplied the same retry key.
The generated client retains this semantic read flag, sends CSRF and treats
transport failure as a read error without issuing a mutation acknowledgement.

The preview returns the member/class versions actually reviewed. AssignmentCreate
accepts optional source versions for existing server-managed class/handover
workflows; when supplied, the server rejects changed sources before writes. The
connected staff save requires both reviewed versions and sends them without a
fresh GET that would overwrite the user's review. Revocation uses the displayed
assignment version and preserves original dates. Native exclusive ends become
inclusive display dates only in the adapter; browser time never truncates history.

These four adapter methods remain candidates until native UI date/version/action
handling and the shared connected provider/facade are activated and browser-tested.

## ADR-047 — Exact role scopes, independent panels and live edit ceilings

The existing native Role DTO now carries real status, its distinct allowed scopes,
held School member count and current teaching assignment count. SQL computes
these counts against the role's actual grants; a custom Class grant does not
fabricate a teaching assignment. List filtering/counting/keysets stay in SQL.
The connected adapter retains every native action and each action's exact scopes,
including mixed School/Class/Subject roles. Missing counts fail rather than
substituting zero. No persisted role description exists; it remains null.

`getRoleDetails` requires current `role.read` in a read-only repeatable-read
transaction. Minimal holder names/grant scopes/times require independent
`member.read`; role-target audit requires independent `audit.read`. Denied panels
stay null. Each panel fails explicitly above 2,000 rows; role list composition
fails above 1,000 templates. Contact/identity email, roster and foreign metadata
are not borrowed. Native action choices contain only registered school actions
and current School-scoped grant eligibility. Labels are static Vietnamese
vocabulary; they never replace the action code or its scope.

Editing preserves ADR-005: system templates are immutable and a held role cannot
be edited by its holder. Held includes unrevoked future grants, closing the former
gap where a future recipient could change their own template before activation.
RolePatch now requires the existing UI's reason, validated again after trimming.
The command sends the displayed version and explicit permission/scope objects;
an ambiguous legacy string-only action list is rejected before HTTP. Audit stores
native added/removed actions and changed scopes through the shared sanitized view.

Custom role edits affect their live grants. Adding an action or widening its
allowed scopes now checks the aggregate maximum expiry of matching retained
recipient grants, including future recipients and unbounded grants. The editor's
current School action grant must cover that exposure. A finite authority cannot
create newly effective unbounded access through a role edit. SQL aggregation
avoids loading all recipient grants. Rejected edits roll back before permission,
version, audit or idempotency acknowledgement writes.

Actual checks: 122/122 PostgreSQL integration, zero skipped, 22/22 backend
contract/unit and 112/112 frontend API unit; TypeScript/scoped lint exit0.
Runtime is 286 operations/355 schemas and 83 unactivated adapter candidates.
These checks do not certify native screen activation, browser E2E or B7 drills.
