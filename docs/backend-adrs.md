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
