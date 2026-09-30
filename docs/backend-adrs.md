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
