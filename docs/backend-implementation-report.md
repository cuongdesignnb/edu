# Backend implementation evidence

Started 2026-09-30 (Asia/Saigon). Baseline frontend commit: `14dfad5`.
Branch: `codex/backend-postgresql`. Initial working tree contained only supplied,
untracked `docs/backend-handoff/` and `docs/EduManage-Backend-PostgreSQL-Handoff.zip`.
These inputs are preserved. No remote push or production deployment authorized.

Frontend: Next.js 16.3.6, React 19.3.0, TypeScript, npm package-lock.json.
Existing QA reports refer to the browser mock adapter, not PostgreSQL security.
Host Node 20.15.1 is not the selected backend runtime. Bundled Node 24.19.0 is
available; Docker images will use a pinned Node 24 LTS patch and recorded digests.

Docker Desktop CLI 29.5.3, Linux context `desktop-linux` is available with elevated
CLI access. Default context points to an unavailable pipe. Other running `hc-*`
containers are outside this project's scope and must not be changed.
Port 18763 had no listener in initial inspection; repeat immediately before up.

## Milestones

| Milestone | State | Evidence |
|---|---|---|
| B0 | VERIFIED_FOUNDATION | Validator 264 operations/300 schemas; production backend build; HTTP health integration |
| B1 | PARTIAL | 8 migrations applied; identity/invitations, idempotency, scoped authorization and immediate grant/assignment revocation tested; temporal delegation review and support access integration remain pending |
| B2 | PARTIAL | Organization, staff, assignments, students, guardians, transfers, handovers, rollover and file/import pipeline implemented; connected screens and broader acceptance coverage remain pending |
| B3 | NOT_STARTED | Attendance/conduct/publication workflows pending |
| B4 | NOT_STARTED | Parent session/projection workflows pending |
| B5 | PARTIAL | Private file processing, mail/outbox worker and timetable import drafts tested; remaining domain services, publication and exports pending |
| B6 | NOT_STARTED | Connected frontend adapter pending |
| B7 | NOT_STARTED | Local final stack, restore drill and load testing pending |

No runtime test is PASS unless its command has actually completed successfully.
No real student data used. Production not deployed.

## Actual foundation checks — 2026-09-30

- Node image: `node:24.21.0-bookworm-slim`, digest
  `sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6`.
- PostgreSQL `17.11-bookworm`, digest
  `sha256:639ab7ceb90e13123085b741fb31ef493fba25463002f6da665352e7b534b652`.
- Disposable test project: `edumanage_backend_test`, database
  `edumanage_test_local`, no published ports. Volume retained.
- Backend TypeScript build/typecheck and ESLint completed exit 0 on bundled
  Node 24.19.0. Unit/contract tests: 6/6 completed, not full API acceptance.
- Docker build completed. Final B1 foundation integration run: 10/10, exit 0.
  Commands and output: `qa/backend/b1-build.log`, `qa/backend/b1-integration.log`.
  Includes migration replay/checksum failure, FORCE RLS, cross-school FK,
  connection reuse, self-membership bootstrap, grant scope/time, revocation,
  CSRF/cookies/rotation, profile version conflict and parent SQL denial.
- Initial integration run had a test header parsing failure (9/10); repaired
  the assertion to accept a single Set-Cookie string and reran all ten checks.
- Parent portal, publication lifecycle, connected frontend, end-to-end browser,
  backup/restore, restart drill and performance: NOT_RUN at this checkpoint.

Pinned backend dependencies are in `backend/package-lock.json`. Original
frontend dependencies/lockfile/design are untouched at this checkpoint.

## B2 checkpoint — actual PostgreSQL execution

- Migration 006 successfully applied; subsequent replay was a no-op. Default
  teacher grants require a current assignment. Custom class delegation has an
  explicit ADR and current authorization checks on every request/replay.
- 21/21 integration checks completed at the transition checkpoint. Evidence:
  `qa/backend/b2-build.log` and `qa/backend/b2-integration.log`. This includes
  concurrent idempotent creates, signed cursor isolation, minimal subject DTOs,
  guardian verification, existing/new identity invitation acceptance, encrypted
  single-use reset, last-admin protection, concurrent assignment exclusion and
  immediate revocation within existing independent sessions.
- Transfer approval with two concurrent requests and one remaining target seat:
  one succeeds, one rejects with capacity error and preserves its old enrollment.
  Handover retains two dated assignments and denies the old teacher on the next
  read. Rollover rejects a changed preview and creates one new enrollment on
  idempotent replay, leaving old-year intervals and parent links unchanged.
- Scoped guardian creation also passes a negative test: a class teacher cannot
  attach an unrelated family's known guardian ID to acquire its contact data.
- Unit/contract checks: 7/7 executed. This is schema validation plus policy unit
  coverage, not a claim that all 264 API contracts or 118 core screens passed.
- Frontend connected: NO. Import/export processing, parent portal,
  publications, browser E2E, operational drills and performance: NOT_RUN.
- Final root deploy/scripts merge and local URL service have not been started.

## Private files and worker checkpoint

- Migration 007 applied successfully. Upload metadata includes class/purpose,
  scan state, and a rejection code; storage uses server UUID paths. API upload
  stays QUARANTINED until a real worker validates/processes it.
- `qa/backend/files-integration.log`: 22/22 actual PostgreSQL integration checks
  completed. Includes streaming multipart idempotency, quarantine download denial,
  EXIF stripping, fake image rejection, XLSX formula rejection, scoped class
  document reads, archive/download denial and a worker using edu_worker.
- Two worker instances claim different jobs; the wrong lease owner cannot update
  a job. Local invitation mail becomes SENT/FILE, writes a mode-0600 LOCAL_FILE
  message, and clears encrypted token payloads. SMTP delivery/fault tests: NOT_RUN.
- Test file/mail volumes are private and retained between test runs. This does
  not certify the final deployment's restart/backup/restore requirements.
- Local files explicitly report NOT_SCANNED. Production PDF/XLSX acceptance is
  gated pending an approved scanner. PDF parsing/sanitization coverage remains
  incomplete; only raster/CSV/XLSX branches have integration evidence so far.
- Backend lint now uses supported pinned ESLint 10.11.0/typescript-eslint 8.71.0.
  ExcelJS's UUID v4 dependency is overridden to patched CommonJS UUID 11.1.1;
  production dependency audit is recorded in `qa/backend/dependency-audit.json`.
- Updated unit/contract run: 8/8, including sparse XLSX dimension limits and the
  ExcelJS extension-formatting path using patched UUID. Audit: zero reported
  production dependency vulnerabilities at this checkpoint (not a security audit
  of the application or a guarantee of virus scanning).

## Import checkpoint — actual execution

- Migration 008 applied; replay/checksum checks pass. Private CSV/XLSX files are
  parsed on the server into source rows, then mapped and validated before an
  explicit ADD_ONLY or UPSERT_VERIFIED_CODE commit. Import DTOs expose columns,
  year/class context and per-row ADD/UPDATE/SKIP decisions for the existing UI.
- Preview hash includes file hash, mapping, year/class, normalized row decisions
  and existing table versions. A changed class produces HTTP409 STALE_PREVIEW.
  Every worker transaction checks current school/user permissions and lease.
- Students with matching names remain separate; same guardian phone creates
  separate UNVERIFIED contacts with can_receive_info=false. Updates require an
  existing stable student code in the selected class/year. Imports do not move
  students or replace family relationships. Invalid dates/rows are retained;
  downloadable CSV errors protect formula prefixes.
- Class import creates DRAFT classes. Staff import queues encrypted invitations
  and stores the school work profile; identity is created only after invitation
  acceptance. Timetable import validates assignments/slots and creates DRAFT
  versions; materialization and publication are still pending B5 work.
- <=500 rows commit in one transaction. Larger imports use 100-row transactions.
  A 501-row fault-injection test commits 100, reports FAILED with processed=100,
  then resumes to 501 distinct results without duplicates. This is a transaction
  interruption test; process-kill/restart operational testing is NOT_RUN.
- `qa/backend/imports-integration.log`: 26/26 integration tests executed, exit0.
  `qa/backend/imports-unit-contract.log`: 8/8 executed. TypeScript build and
  backend ESLint10 completed exit0. The first import run exposed a missing audit
  request_id, repaired and rerun. Retained test data also exposed assumptions
  about queue order and a single admin; tests now isolate those conditions.
- 105/264 API operations are implemented. Frontend connected: NO. Parent HTTP
  portal, attendance/conduct publications, browser E2E, final local deployment,
  restart/backup-restore and performance measurements remain NOT_RUN.
