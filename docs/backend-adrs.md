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
