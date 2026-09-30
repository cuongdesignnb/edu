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
| B1 | PARTIAL | 5 migrations applied; 10 foundation integration checks passed; invitations/idempotency/domain permission tests still pending |
| B2 | NOT_STARTED | Organization and student services pending |
| B3 | NOT_STARTED | Attendance/conduct/publication workflows pending |
| B4 | NOT_STARTED | Parent session/projection workflows pending |
| B5 | NOT_STARTED | Remaining domain services/jobs/files pending |
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
