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
