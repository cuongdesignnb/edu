# Backend implementation evidence

## B6 native staff command checkpoint

- Actual PostgreSQL suite: **103/103**, exit0, zero skipped, in `qa/backend/b6-staff-integration-complete.log`; duration 103105.373731 ms. All **32 migrations**, checksums and replay were verified. Final image: `sha256:ee2be151e993991678f3a0394ec5b2fdcc775602835831c179e97d26271d62f7`. Backend contract/unit **17/17** in `qa/backend/b6-staff-unit-contract-final.log`; frontend **88/88** in `qa/backend/b6-staff-frontend-unit-complete.log`; TypeScript and scoped lint exit0. The first **99/102** run is retained: two fixtures assumed a single membership despite retained synthetic schools, and an operational test hardcoded schema 031. Assertions now verify all own memberships, deny foreign identities, retain class/subject checks and compare the actual installed revision. A subsequent **102/102** run is retained before adding the expired-invitation case. No volume/history was deleted.
- School-role replacement is one displayed-version command with current role authority, delegation/expiry checks, no self edit, last-admin protection and transaction rollback. Selected grant IDs/expiry remain exact; class/subject grants stay separate. Its reply excludes contact/directory data. Independent school-grant changes advance the member version in PostgreSQL, so a stale role form cannot silently erase them; revoked command authority also denies cached replay.
- Ending a membership revokes every current/future grant and assignment atomically, retains dated history and other-school identity/membership, and returns the final version after triggers. Reactivation does not restore ended grants. Multi-role and zero-role school invitations retain the existing 1–30 day form, profile and descriptive duty, create one mail job, and recheck current inviter authority on acceptance/delivery. Zero-role acceptance has zero grants; loss of inviter authority rolls back even a new identity. Expired invitation revocation/delivery is denied without changing its historical row. Local encrypted-mail inspection in these tests verifies invitation processing, **not SMTP transport**.
- Runtime: **279 operations / 337 schemas**. Candidates: **74**, including five staff methods; **activation remains zero**. Staff directory/member/role projections and assignment/handover adapters, other remaining repositories, native facade/hooks and **118 core browser acceptance** are still required. Root deploy/scripts merge, final local stack at `http://127.0.0.1:18763`, E2E/responsive/visual checks, restart persistence, actual backup/restore, SMTP/process-kill/disk-fault and release load tests remain pending. The local final URL is not claimed available. Production is not deployed.

## B6 retained form owner and keyset helper checkpoint

- Actual frontend checks: **79/79**, zero skipped, in `qa/backend/b6-context-keysets-frontend-unit-final.log`; frontend TypeScript/scoped lint exit0. Native UI context captures actual session/server time with an owner retained by callbacks. Old login/scope callbacks fail before submitting; notification batches stop between steps after a scope change. Late bootstrap CSRF cannot install an obsolete token or send an old waiting command.
- Opaque cursor reuse is bounded in memory and keyed by native scope/filter/params/size/support grant. No rows are cached; every display fetches actual API data. Confirmed staff saves and identity/permission changes invalidate cursors. First deep jumps, bulk selected IDs and release performance remain pending. Parent/public pagination is independent of staff changes and still needs portal-specific ownership when connected.
- Backend code is unchanged from **97/97**, 31 verified migrations, **15/15** contract/unit and runtime **276/333**. There was no new backend run for this frontend-only checkpoint. Adapter count remains **69**, unactivated. Native hooks/facade, remaining repositories, 118 core browser tests and all outstanding B7 deployment/drill/load gates are still required. Production is not deployed.

## B6 school support and operational evidence checkpoint

- Actual PostgreSQL execution is **97/97**, exit0, zero skipped, in `qa/backend/b6-school-operations-integration-final.log`. All **31 migrations** and checksums/replay were verified. Image: `sha256:74aa8f590780b7e8da7a863744bc6c447d317ff6b568ab8bbbe7c81781856bb1`. Frontend unit **69/69**, backend contract/unit **15/15**, TypeScript and scoped lint exit0. The first **94/97** run is retained; failures were an outdated actor-ID assertion, a fixture reaching the explicit history-choice limit, and an attempted fixture timezone change correctly denied after years existed. Fresh retained synthetic schools fixed fixture setup; no history or volume was deleted.
- School support pages filter in SQL and retain actual whole-result totals. `support.manage` cannot list or decide grants without `support.approve`; unavailable grant panels/counts are null. Approval rechecks delegation and expiry; decline/revoke use the displayed version and a human reason. Current revocation denies cached command replay. School audit uses exact actor/target/date filters and the persisted school timezone before pagination; options expose no directory contacts. Multi-page staff reads cannot combine different staff owners/scopes.
- Operations show actual schema/role/storage probes, minimal worker-only cycle evidence and real operation rows. Stale heartbeat is degraded; API and parent roles cannot manufacture heartbeat. A failed dependency does not renew it. An operations-only operator can obtain the guarded coarse totals without acquiring school/admin/support directory permissions. Backup records keep actual status and validated metadata; secret-like values and artifact paths are omitted. **Synthetic FAILED backup rows in integration verify projection only, not a backup/restore drill.** No backup success or schedule is invented; local file mail is not SMTP delivery evidence.
- Runtime: **276 operations / 333 schemas**; adapter candidates: **69**, including 6 school-support and all 7 platform-extra methods. Facade activation, remaining adapters and **118 core browser acceptance** are outstanding. Root deploy/scripts merge, local final stack at 18763, restart, real backup/restore, SMTP/process-kill, disk/fault checks and load acceptance remain pending. Production is not deployed.
- Automatic approval briefly failed because a refresh token was revoked; the Docker build was not executed on that failed attempt. A later approved build/run completed normally. No sandbox approval was bypassed.

## B6 support and platform metadata checkpoint

- Actual PostgreSQL suite is **94/94**, exit0, zero skipped, in `qa/backend/b6-support-ui-integration-final.log`. All 30 migration checksums/replay verified. Final image `sha256:47698fe4e97405ea0395a0c173c4fcc6a9cba37a0f6f707a28797c66870dcb62`; backend contract/unit **14/14**, frontend unit **62/62**, TypeScript/scoped lint/build exit0. The preceding **93/94** failure is retained: the synthetic audit-boundary insert omitted mandatory request_id; no PASS is assigned to it.
- Current platform.support supplies bounded minimal choices and SQL queue/grant totals. Requesting access requires a ticket of the same non-archived school, uses the authenticated operator and server duration, and cannot include pupil actions or impersonate another operator. Relinquishing is versioned and restricted to the grant owner; it immediately disables selected reads. Current operator revocation also denies cached command replay. Canonical consent status is retained alongside a server-derived display state, including inactive approvals.
- Ticket message/status changes save atomically with the displayed version. Validation rolls back both, replay produces one message and completed tickets reject new messages. Queue rows return actual message counts, requester and school status; they do not claim an unloaded message array is empty. Audit filtering applies actor and inclusive Asia/Ho_Chi_Minh date bounds in SQL before pagination; changed-filter cursors and school-only staff are denied.
- Runtime is **273 operations / 326 schemas**, with four explicit support/audit extensions. Candidate coverage is **62 methods**, including all 17 platform and 6 of 7 platform-extra methods. Operations overview, school-side support and remaining domain adapters still await connection. All **231 legacy methods / 118 core UI acceptance remain pending activation**. Browser E2E, final Docker URL, restart, backup/restore, SMTP/process-kill and load acceptance are outstanding. Production is not deployed.

## B6 platform school wizard checkpoint

- Actual PostgreSQL execution is **92/92**, exit0, zero skipped, in `qa/backend/b6-platform-wizard-integration-final.log`. All 30 migration checksums/replay were verified. Current image is `sha256:5e02a12150dd46f9e21862656279ab63406977aba8512d9ae0b18ed77c8ae2f0`. Backend contract/unit **14/14**, frontend unit **58/58**, TypeScript/scoped lint/build exit0. The earlier 92/92 run predates server-time and ordinary-invitation isolation assertions and is retained separately.
- Optional first-admin invitation is part of the create-school transaction. Current `platform.admins.manage` and delegation expiry are required even on command replay. Failure leaves no school, roles or invitation. Pending invitation does not count as an active administrator. Invitation expiry defaults to 48 hours and can explicitly be 1–14 days; grant expiry is a separate authority boundary. The server supplies the default start time, keeping uncertain browser retries byte-identical.
- Four explicit operations provide province facets, exact identity availability and list/revoke of only single default SCHOOL_ADMIN proposals. Ordinary staff invitations are excluded in SQL and cannot be revoked through the platform endpoint. A create-only operator cannot read province/admin metadata or attach an administrator; current revocation immediately denies subsequent reads/replays. School count sorts/search remain in SQL before pagination.
- Runtime is **269 operations / 321 schemas**, with the supplied handoff preserved. Candidate coverage is **49 methods**: 25 school, 9 platform, 1 platform-extra plus existing identity extensions. All **231 legacy methods and 118 core screen acceptance remain pending activation**. Browser E2E, root deploy merge, final local URL, restart, backup/restore and performance are still outstanding. Production is not deployed.
- A frontend test invocation with a literal wildcard ran no tests and exited1; its log is retained as `b6-platform-wizard-frontend-unit-no-files.log`. The successful 58/58 run passed explicitly discovered file paths. No PASS is attributed to the failed invocation.

## B6 staff scope ownership checkpoint

- Frontend TypeScript and scoped lint exit0. Actual frontend checks are **51/51**, zero skipped, in `qa/backend/b6-scope-owner-frontend-unit.log`. They cover late 401 responses, changed permission scope during body decoding, composite reads/errors, current context changes and reauthorized rollover retries. These are unit checks, not browser acceptance.
- Staff identity and scope revisions are separate. Actual role/action/assignment/date/school changes purge private reads; equivalent context refreshes do not. A late response cannot reset a replacement login. Uncertain mutation keys and CSRF remain available for the same identity after a scope refresh.
- All 25 school candidates bind their composite result to one identity/scope. Rollover clears private previews on scope changes and retains only opaque acknowledgement receipts and stage keys in memory. A completed retry asks the API for current authorization instead of returning a cached success. Reload recovery still remains pending.
- Backend code and migration state are unchanged: latest PostgreSQL evidence remains **90/90**, 30 migrations, 265 operations and 316 schemas. There are 39 candidate methods; 231 legacy methods and 118 core screens still await activation. Root deployment merge, final local URL, restart, backup/restore, SMTP/process-kill and load acceptance remain outstanding. Production is not deployed.

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
| B0 | VERIFIED_FOUNDATION | Validator 264 operations/303 schemas; production backend build; HTTP health integration |
| B1 | PARTIAL | 30 migrations applied; identity/invitations, idempotency, scoped authorization, expiry ceilings and immediate revocation tested; selected support reads, independent consent and SQL read-only mode tested; broader release acceptance pending |
| B2 | PARTIAL | Organization, staff, assignments, students, guardians, transfers, handovers, rollover and file/import pipeline implemented; connected screens and broader acceptance coverage remain pending |
| B3 | PARTIAL | Attendance linkage, rules/scoring, conduct/review/lock, position/activity sources, immutable publication and approved adjustment workflows tested; connected browser acceptance pending |
| B4 | PARTIAL | Private links, parent cookie/view binding, published child projections, revoke/reissue, files and work contacts tested; remaining B5 publication producers and connected browser acceptance pending |
| B5 | PARTIAL | All 264 supplied API operations registered; reports/export/domain workflows tested; remaining UI-specific gaps and broader acceptance pending |
| B6 | PARTIAL | Generated client, transport, memory-only cookie session, permission hints, keyset helpers and session/auth/school adapter candidates implemented; repository facade and screens still use the previous adapter, browser acceptance pending |
| B7 | NOT_STARTED | Local final stack, restore drill and load testing pending |

No runtime test is PASS unless its command has actually completed successfully.
No real student data used. Production not deployed.

## B6 school overview checkpoint

- Latest PostgreSQL run: **90/90**, exit0, zero skipped, qa/backend/b6-school-overview-integration-isolated.log. All 30 migrations were checksum/replay verified. Backend/frontend TypeScript, scoped lint and runner build exit0; **13 backend unit/contract and 41 frontend unit checks** exit0. Runtime has **265 operations / 316 schemas**.
- School overview fields now preserve the existing KPI/setup/class/action/announcement layout with actual scoped SQL data. School-wide totals require separate SCHOOL authority. A school.read plus one CLASS student.read grant receives null totals, panels and completion statuses; foreign-school access and immediate revocation are tested. Opened-link counts exclude staff preview. Announcements expose only publication/schedule metadata.
- The initial **88/90** run hit a real list bound on more than 2,000 retained synthetic classes. The repair computes full counts/setup in SQL and returns a six-row preview with its separate full total. No volume/history was removed. The **89/90** follow-up used a fixture already granted school-B administration by BE07; the final 90/90 run uses a new school-A-only identity. Both failed logs remain retained.
- There are **39 candidate methods**, including **all 25 school methods**. The **231 legacy methods and 118 core screens remain unactivated/unaccepted**. Null display, full-total labels, versioned commands and reason inputs still need UI wiring. Authentication/scope cache changes, other repositories, final Docker URL, restart, backup/restore and load acceptance remain outstanding. No production deployment.

## B6 rollover acknowledgement checkpoint

- The latest PostgreSQL suite is **89/89**, exit0, zero skipped, in qa/backend/b6-rollover-integration.log. All 30 migrations were checksum/replay verified. Runner build, backend/frontend TypeScript and scoped lint exit0; 12 backend unit/contract and **38 frontend unit checks** completed with exit0.
- The runtime contract preserves the supplied 264 operations and adds one explicit SC07 GET: getRolloverPreview, now **265 operations / 310 schemas**. Current SCHOOL year.manage reads a minimal, bounded end-year projection without obtaining ordinary student/class/member directory rights. Exact year-end enrollment after transfer, eligible target counts/archive exclusions, redaction, foreign school/subject denial and immediate revocation are tested on PostgreSQL.
- The browser candidate retains each acknowledged create/validate/commit stage and its key through uncertain responses, verifies the returned plan and reports success only after APPLIED. Stale preview stops first; manual retry revalidates the known version. Authentication change blocks later stages and clears private memory. Unit evidence does not certify page-reload recovery, real network fault injection or browser E2E.
- There are **38 candidate methods**, including **24 of 25 school methods**; the school overview remains to be connected. All **231 legacy methods and 118 core screens remain unactivated/unaccepted**. Root deploy merge, final URL, restart, backup/restore and performance acceptance remain NOT_RUN. No production deployment.

## B6 purpose-bound form pickers checkpoint

- The latest actual PostgreSQL run is **88/88**, exit0, zero skipped, in qa/backend/b6-form-pickers-integration-final.log. All 30 migration checksums/replay were verified. The earlier 88/88 log predates the additional onDate boundary assertions; the final run includes them. Docker runner build, backend TypeScript/lint, 12 backend unit/contract and 31 frontend unit checks completed with exit0.
- Minimal year/class/dictionary/member form pickers use the corresponding current class.manage or assignment.manage authority. Ordinary read endpoints still deny a write-only role. Picker queries filter in SQL before pagination, redact contacts/grants/private counts, exclude inactive or archived choices and immediately deny revoked authority. The week selector queries a strictly validated day in SQL using the half-open interval.
- The connected list helper rejects missing or inconsistent PageInfo rather than treating an incomplete response as an empty or finished list. School adapter candidates now include formOptions and weekOf: **36 candidate methods**, 22 school methods. All **231 legacy methods and 118 core screen acceptance remain pending activation**. Dashboard and rollover composition, final Docker URL, restart, backup/restore, SMTP/process-kill and load acceptance remain outstanding. Production is not deployed.

## B6 atomic organization workflows and parent denial checkpoint

- The latest actual PostgreSQL suite is **87/87**, exit0, zero skipped, in qa/backend/b6-organization-rls-integration.log. Migration 030 applied and checksum replay verified; all 30 migrations are applied. Backend build/typecheck/lint and 12 unit/contract checks exit0. Frontend TypeScript, scoped lint and 27 unit checks exit0; ten school adapter checks use synthetic fetch responses and do not certify browser workflows.
- The year wizard now creates the year, bounded terms, continuous partial/full weeks, published holidays and an optional independent draft copy of the currently applied issued rules in one idempotent school transaction. Invalid term overlap/opening date or holiday range rolls everything back. Copying rules requires both rules.read and rules.manage; a year-only grant is denied and never obtains those privileges indirectly. New/edited year ranges cannot overlap another year. Existing retained synthetic test history was not rewritten or deleted.
- Class forms can create homeroom assignments in the same transaction through the existing delegation ceiling/time validation. A foreign member or unexplained backdating rolls back the class. A different current homeroom requires the existing handover workflow. Activation checks a current active membership/role/grant. Draft transitions preserve records; year archive also archives its classes, and archived classes reject later edits.
- Calendar creation can explicitly publish a holiday in one acknowledgement. Removal is a versioned withdrawal with reason, retaining history. Deadline-day commands convert to 23:59:59.999 in the school's configured timezone. Read projections provide real year terms/counts and class work metadata; unauthorized student/class aggregates remain null. Subject staff never receive a school student total or full-class student count from these additions. Query filters, sorts and keysets remain in SQL.
- Earlier attempts are retained: 85/86 missed the required archive reason; 86/87 exposed a repeated synthetic teacher already holding a homeroom assignment; a build found one misplaced brace. A later 86/87 run exposed a real no-context parent RLS query timeout as retained snapshots grew. Migration 030 keeps all session/link/guardian/publication checks and adds an early context denial plus tenant predicates, without raising timeouts or changing RLS roles.
- The executed no-context diagnostic was 5.527 ms for the pool query and 0.022 ms plan execution, zero rows. Raw student SELECT still denies 42501; populated child/section/revoke/multitab checks all passed in the full suite. This is one SQL denial diagnostic, **not the B7 concurrency/load benchmark**.
- Adapter candidates now total 34 methods, including 20 school methods. All 231 legacy methods and 118 core screen acceptance still await facade activation; form pickers, dashboards and rollover composition remain outstanding. Root deploy merge, final URL, restart, restore, SMTP/process-kill and performance acceptance remain NOT_RUN. Production is not deployed.

## B6 organization forms checkpoint

- Migration 029 applied and checksum replay verified. The latest real PostgreSQL suite is **84/84**, exit0, zero skipped, in qa/backend/b6-organization-integration-final.log. The retained earlier 84/84 log predates the dictionary usage flag assertion; the final run includes that assertion.
- School public website/display/contact fields, subject color and editable code, grade level, room capacity, class room/motto and term opening date now persist instead of being silently ignored. Invalid website schemes and out-of-term opening dates return 422. A foreign school's room returns 404 without changing the class version; room clearing is also verified.
- Dictionary GET computes a tenant-scoped historical usage boolean in SQL. It returns no names, counts or family data. Adapter candidates reject missing usage metadata or missing required profile/settings fields. They require the form's read version before edits and never fetch a new version to overwrite another writer.
- Backend build/typecheck/lint and 12 backend unit/contract checks exit0. Frontend TypeScript, scoped lint and 22 unit checks across transport/session/keysets/fragments/school adapter exit0. The five added school checks use explicit synthetic fetch responses and are **not browser E2E**.
- Candidate coverage is 21 methods including extensions. All 231 legacy methods and 118 core screen acceptance remain pending facade activation. Creating a year with its terms/weeks/holidays and optional draft rule copy is still being aligned atomically; local final Docker, restart, restore and load drills remain NOT_RUN.

## B6 transport and identity-context checkpoint

- Migration 028 applied/replayed/checksum-verified. The latest actual PostgreSQL suite is 83/83, exit0 in qa/backend/b6-auth-integration.log. It exercises expired own assignments in context, self-profile separation, invitation recipient/login metadata, two real cookie sessions, invalid current-password rejection without session revocation, session revocation, password change revoking all sessions, and declined invitation rejection.
- Backend build/typecheck/lint exit0. The earlier 78/82 attempt in b6-context-integration-final.log is retained: requiring roleCode exposed missing fields in grant creation/preview DTOs. Both branches were fixed and the complete 82/82 suite rerun before adding the final identity test.
- Generated browser types cover all 264 operations and correctly distinguish list items from arrays. The relative same-origin transport uses credentials include/no-store, memory-only CSRF, stable logical mutation keys until a complete acknowledgement, version/field errors, explicit parent view headers and authorization-preserving binary downloads. Responses completing after authentication changes are rejected, including during body streaming.
- qa/backend/frontend-api-tests.log: 17/17 actual transport/session/keyset/fragment unit checks, exit0. Frontend TypeScript and scoped lint exit0. These are transport unit checks with synthetic fetch responses, not connected browser E2E or proof that all screens work.
- Session/auth adapter candidates preserve existing business interfaces where possible; invitation/reset credentials are read only from the corresponding URL fragment, removed from history and held in memory. The password-reset form must describe a present link until the server validates it. New-user invitation acceptance requires a password; existing-user acceptance requires the matching cookie identity. Screen wiring is still pending.
- All 231 legacy repository methods and all 118 core screens remain pending activation/acceptance. Candidate implementation is recorded separately in frontend-adapter-inventory.json. No fallback is implemented in the new transport, but the deployed frontend has not yet switched to it. Final Docker URL, restart, backup/restore, SMTP/process-kill, load testing and production deployment remain NOT_RUN.

## Reports/export checkpoint

- API implementation coverage is 264/264 supplied operation IDs. All routes are registered in the actual Fastify app. This is implementation coverage, not certification of 264 independent end-to-end workflows or 118 connected core screens.
- Migration 027 applied/replayed/checksum-verified. qa/backend/reports-integration.log: 81/81 actual PostgreSQL integration checks, exit0; reports-unit-contract.log: 12/12, exit0; build/typecheck/lint exit0. Earlier failures are retained in attempt1–4 logs. They include invalid fixture paths, an unmarked publication fixture, school/detail aggregation, an incorrect new file-purpose value and a missing worker audit request_id; each was repaired and the full suite rerun.
- Actual report cases cover attendance denominators/unmarked, pinned CSV after live edits, published replacement/withdraw, decimal locked scores and actual classification labels, explicit activity targets, class progress and link-open counts without identifying the opener. Subject reports deny school/family/class-conduct/export access. Unknown filters and foreign references fail closed.
- Jobs are immutable source snapshots with hash, scoped current authorization, requester-only metadata/download, literal streamed CSV/XLSX, private generated PDF, cancellation, expiry, revocation through both export and generic file URLs, and completed-job replay with one retained file. The replay simulates acknowledgement loss; process-kill testing remains NOT_RUN.
- PDFKit 0.20.2 / @types/pdfkit 0.17.6 are pinned; installation audit returned zero vulnerabilities. Noto Sans is pinned to official source revision/checksum with OFL 1.1 included. The first visual review found footer-only pages; the repaired latest PDF has three populated A4 pages, correct Vietnamese text, embedded fonts and footers, and all three PNGs were inspected. Evidence: qa/backend/report-output/pdf-layout-check.json. Poppler pdffonts was unavailable; embedded font checks used pypdf instead.
- Frontend adapter inventory finds 231 methods across 22 repository objects; these still use browser demo implementations. B6 is PARTIAL with unactivated candidates. Physical expiry/orphan cleanup, broader browser acceptance, final local stack, restart, backup/restore, SMTP/process-kill and load drills remain unfinished. Port 18763 is not yet serving the completed application; production remains undeployed.

## Selected support read checks

- Migration 026 applied and checksum replay verified. Actual suite: 74/74 PostgreSQL integration tests, exit0 in qa/backend/support-read-integration.log; 12/12 unit/contract tests, typecheck and lint exit0. The first attempt is retained: 71/72, with the failing fixture using a nonexistent import error-download URL.
- An explicit X-Support-Access UUID selects only the approved metadata GET allowlist and that grant's school/class/action/time. It does not combine ordinary school roles or global operator privileges. Real read transactions use REPEATABLE READ READ ONLY; an attempted SQL write returns 25006. Tenant and support settings clear after each transaction.
- Class-restricted queries, foreign school/class, student/guardian/parent routes, import rows/downloads and all mutations are denied. Suspended-school consent permits only approved metadata. Current operator revocation, consent revocation and elapsed expiry deny the next request in the same session.
- Every selected read is audited before returning data with actual SUPPORT operator, typed consent ID, request ID and status. Audit failure prevents delivery. A user holding both platform support and school-admin rights cannot self-approve in HTTP or SQL, and cannot extend an explicitly selected class grant with ordinary admin rights.
- Native keyset pagination was also exercised across non-null to null and null-to-null sort boundaries with three persisted platform schools. API coverage remains 257/264; reports/exports, B6 and B7 remain incomplete.

## Support queue and consent workflow checks

- Fifteen supplied support operations implemented and exercised; API implementation coverage is now 257/264. The seven report/export operations remain. This API count does not certify all B1–B7 requirements or connected screens.
- Actual suite: 70/70 integration tests, exit0 in qa/backend/support-integration.log; 12/12 unit/contract tests, exit0 in support-unit-contract.log; build/typecheck/lint exit0. Migration 025 applied/replayed/checksum-verified.
- Tickets/messages are persisted, with per-school denial, platform routing, LOW priority, WAITING_SCHOOL → IN_PROGRESS on an actual school reply, stale-version rejection, closed-ticket write denial and idempotent append commands.
- Support scope/action/time/ticket/class validation, current school consent, delegation expiry ceilings, immutable requested scope, explicit reject and revoke transitions, and retained audit were exercised. Actual selected-grant reads, operator-plus-admin self-approval and read-mode expiry/audit tests remain pending.
- Generic signed keyset cursors now retain PostgreSQL timestamp microseconds/exact native values and explicitly paginate nulls last. Actual two-message ascending pagination was exercised; broader nullable-boundary coverage remains pending.
- Connected frontend, reports/exports, final local deployment, restart/backup/restore, process-kill/SMTP and load drills remain incomplete.

## Platform metadata and administrator bootstrap checks

- Thirteen supplied platform operations implemented and tested; API implementation coverage is now 242/264. Six platform support operations, nine school support operations and seven reports/export operations remain.
- Actual suite: 68/68 integration tests, exit0 in qa/backend/platform-integration.log; 12/12 unit/contract tests, exit0 in platform-unit-contract.log; build/typecheck/lint exit0.
- Real create/replay/conflict, default-role bootstrap, encrypted invitation queue and acceptance, existing identity/password preservation, activation preconditions, suspended-school denial, last-admin protection, target-school admin revocation, operator expiry ceilings, rollback after inviter expiry, global pagination, public configuration and artifact redaction were exercised.
- Migrations 023 and 024 applied/replayed/checksum-verified. The first attempt 65/67 exposed an aggregate query using the wrong rule-set table. Applied 023 was preserved; 024 repairs the function. The next 66/67 attempt expected 403 instead of the specified out-of-scope 404; fixed and the full expanded 68-test suite rerun.
- Platform aggregates expose counts/onboarding and active admin work labels only, with a guarded RLS-constrained function. Platform rights still do not authorize school student routes. Unconfigured level/contact fields are nullable rather than invented.
- Connected UI, consented support reads, reports/exports, final local deployment and operational drills remain incomplete.

## Dashboard and teacher route checks

- Seven supplied dashboard/teacher operations implemented and exercised against retained PostgreSQL test data; implemented API coverage is now 229/264.
- Actual suite: 65/65 integration tests, exit0 in qa/backend/dashboards-integration.log; 12/12 unit/contract tests, exit0 in dashboards-unit-contract.log; build/typecheck/lint exit0.
- Tested current role/assignment revocation, mixed homeroom/subject scopes, real counts, signed pagination and filter binding, own dated lesson schedules, published announcement revisions across draft edits, and attendance publication tasks after publish/withdraw/settings changes.
- Twenty-two migrations remain applied and checksum-verified; these are read projections and require no new migration. Connected UI, platform/support, reports/exports, final local deployment and operational drills remain incomplete.

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

## Attendance/publication checkpoint — actual execution

- Migration 009 adds attendance data_version and database guards for locked
  records, enrollment dates, slots and late-minute consistency. New sessions
  create UNMARKED records for the enrollment roster effective on that date.
- Morning/afternoon and LESSON summaries remain separate. Subject teachers can
  read/record only their assigned lesson; a homeroom grant in another class does
  not authorize daily attendance or publishing in their subject class.
- Publication creates immutable staff snapshots and a schema-checked projection
  per student, excludes internal notes, checks the exact effective roster, and
  atomically switches the current PUBLISHED revision. Reopening requires a reason
  and preserves the old published content while a correction is drafted.
- `qa/backend/attendance-integration.log`: 29/29 integration checks executed,
  including source-version rejection, locked SQL write denial, immutable snapshot
  SQL denial, supersede/withdraw and simultaneous edit/publish with one winner.
  `qa/backend/attendance-unit-contract.log`: 8/8 executed. These remain backend
  integration checks, not connected browser E2E or the parent HTTP portal.
- 116/264 API operations implemented. Rules, scoring, conduct approval/locking
  and adjustment publication remain pending in B3. Parent HTTP, all frontend
  adapters, final deploy and B7 operational acceptance remain NOT_RUN.

## Rules/scoring checkpoint — actual execution

- Eight rules APIs implemented: create/edit draft, issue, simulation, scoped
  catalog/detail, current class rules and dated application at a week boundary.
  Issued rules and thresholds are protected by database immutability triggers.
- Base points are explicit input; no universal 100-point fallback. Decimal.js
  computes positive bonuses, negative penalties, clamps and threshold boundaries.
  Fixed rules reject manual overrides. Manual rules require issued bounds.
- Applying a new rules version preserves old dated periods and rejects periods
  whose conduct rule version is already pinned. Teachers' catalog reads include
  only rules currently applied to their authorized classes, while school roles
  can author drafts.
- `qa/backend/rules-integration.log`: 30/30 actual integration tests, exit0.
  `qa/backend/rules-unit-contract.log`: 10/10 actual tests, including fractional
  arithmetic and threshold boundaries. TypeScript build and backend lint exit0.
- 124/264 API operations implemented. The scoring helper is not yet wired to
  conduct record approval, weekly locking or adjustment publication. Those B3
  workflows remain pending; parent HTTP, frontend connection and B7 remain pending.
# Conduct/adjustment/linkage checkpoint — actual execution

- Migrations 010–012 applied and replayed with checksum validation against the retained private test database. They add conduct source guards, attributed immutable adjustment history and one active conduct fact per attendance record.
- Twelve conduct and five adjustment operations implemented. Drafts are reviewed before lock; locking creates a complete READY projection. Publication verifies source version, count and projection hash. Adjustment proposals expose server-computed before/after scores without mutating facts; approval and apply are separate commands. Apply preserves excluded facts, appends replacements and supersedes the old current publication atomically.
- Subject teachers can create/read/edit only their own lesson facts and cannot read whole-class scores or lock/publish. Current assignments are checked for the event date. Source changes block approval/review. Commands authorize after taking the school lock so revocation cannot be bypassed by waiting commands.
- Attendance optionally creates linked drafts, deduplicates retries and excludes corrected drafts. A locked score returns an explicit warning and remains unchanged while attendance saves.
- `qa/backend/conduct-sync-integration.log`: 35/35 executed, exit0, including corrections, stale baselines, direct SQL immutability checks and simultaneous conduct create/lock/publish with one source winner. `qa/backend/adjustments-unit-contract.log`: 10/10 executed before the final linkage extension; final contract/lint checks recorded separately.
- 141/264 API operations implemented. Browser E2E, parent HTTP portal, all frontend adapters, final local Docker deployment, restart/backup-restore and performance remain NOT_RUN. Activity/position source integration awaits the B5 domains. This checkpoint does not mark all B0–B7 accepted.
## Parent access checkpoint — actual execution

- Seven staff access-link operations and sixteen parent operations are implemented. No parent account is created. Tokens are fragment-only, hash-only in storage and returned once. Parent sessions use a separate HttpOnly cookie, bootstrap/session CSRF, 30-minute idle/8-hour absolute expiry and per-tab view binding.
- Migrations 013–014 provide scoped publication-time and available-document metadata functions; the parent runtime role still cannot SELECT raw students, families, attendance, conduct, files or staff snapshots. Projection pagination counts individual items; document counts filter current file availability.
- `qa/backend/parent-integration.log`: 39/39 actual tests, exit0. Coverage includes unpublished/READY invisibility, one-child score and attendance notes, old-tab 409 after changing child, unchanged staff cookie, same-serializer staff preview, section/download denial, private PNG streaming, available-file pagination, hidden work contacts, withdraw/reissue/revoke, relationship revoke, expiry, suspended school, CSRF, throttling and no new identity row from exchange.
- Timetable, duty, activity and announcement list endpoints were exercised against real empty projections; unknown detail IDs deny. Their populated publication producers belong to the unfinished B5 domains and have not been certified by these empty-state checks.
- 164/264 API operations implemented. Frontend is still the original mock implementation and remains unconnected. Browser E2E, final local stack at port 18763, restart/data persistence, backup/restore and load measurements are NOT_RUN. These are required remaining work; no production deployment has occurred.

## Temporal authorization checkpoint — actual execution

- Grant/preview, invitation creation/acceptance and staff-import proposals enforce the current delegating permission expiry as well as role-action expiry. Tests reject unbounded/later-ending delegation and reject acceptance after the issuer's ceiling is shortened, without creating an identity.
- Direct and imported teaching assignments starting in the past require a stored reason; import acceptance audits retain that reason. A new integration check exposed malformed PostgreSQL offset formatting in import invitations, fixed by canonical ISO serialization.
- Parent absolute session expiry is eight hours per handoff 03. Class capacity edits use the yearly peak and reject shrinking below two already-planned future enrollments.
- qa/backend/temporal-integration.log: 41/41 actual PostgreSQL HTTP/integration tests, exit0. qa/backend/temporal-unit-contract.log: 11/11 executed, exit0. TypeScript build and ESLint completed exit0. Fourteen migrations are still applied; this checkpoint adds no migration.
- API implementation remains 164/264. Support access, remaining B5 domains, all frontend adapters, browser E2E, final Docker stack, restart/backup-restore and load acceptance are unfinished. No production deployment.

## Classroom organization checkpoint — actual execution

- Migration 015 applied and checksum replay verified. Fifteen new APIs cover dated groups, positions, assignment history/end commands and seating create/edit/activate/history.
- Group commands check class version, effective enrollment and backdated authority/reason. Same-day move/unassign retains cancelled history. Moving out of a group ends its leader assignment. PostgreSQL interval exclusions serialize single-holder races; position source scoring/publication is now exercised and locked approved sources cannot be shortened through API or direct SQL.
- Seating checks duplicate student/key/coordinate and effective enrollment; drafts have version and optional latest-revision guards. Future activation bounds the old plan without replacing its payload. Activated content and seats deny direct SQL modification. Subject-only teachers can read class metadata but cannot read whole-class seating/groups.
- qa/backend/classroom-integration.log: 44/44 actual integration tests, exit0. qa/backend/classroom-unit-contract.log: 11/11 executed, exit0. Build/typecheck and lint exit0. Initial 42/44 run found an invalid Ack DTO and a test missing a required nullable clientEventId; both corrected before the successful full rerun.
- 179/264 API operations implemented. Ending enrollments must still close class organization intervals. Timetable/duty publication, activities, announcements, reports/support/platform, frontend adapters and B7 acceptance remain unfinished. No local final deployment or production deployment.

## Enrollment organization boundary — actual execution

- Migration 016 applied and replay verified. Ending/transfer of enrollment closes dated group and position assignments atomically, retains cancelled future assignments, and preserves locked conduct source protection.
- qa/backend/enrollment-org-integration.log: 45/45 executed, exit0. Docker/backend build, host typecheck and lint exit0. This adds one transfer-domain integration scenario; no new API operation.
- 179/264 API operations remain implemented. Timetable/duty publication and the remaining B5/B6/B7 work are pending; final local URL is not serving the completed stack yet.

## Timetable and individual duty checkpoint — actual execution

- Migration 017 applied and checksum replay verified. Eleven schedule APIs create/update/read drafts, validate/materialize bounded future occurrences and publish immutable timetable/duty projections. Sources expose dataVersion. Future replacement cannot alter past lessons or lessons referenced by attendance/conduct. Published holidays are skipped; revoked/missing dated teaching assignments and teacher/room conflicts block publication.
- Current class/year/kind publications supersede the previous projection atomically. Parent role reads now have populated timetable and duty evidence, including child-only fields, no other child's task, private work labels and withdraw invisibility. Parent absolute session TTL was actually asserted at eight hours in this run.
- qa/backend/schedule-integration.log: 48/48 executed, exit0. qa/backend/schedule-unit-contract.log: 11/11 executed, exit0. Build/typecheck/lint exit0. Initial runs exposed a test incorrectly trying to create future attendance (the API correctly rejected it) and a fixture parameter cast error. The replacement-source protection check now explicitly seeds an unexpected future source via the test database and does not claim future attendance API support.
- 190/264 API operations implemented. Group duty expansion and existing single-lesson change/discard UI workflows remain pending. Activities/evidence, announcements, reports/support/platform, notifications/dashboard, all frontend adapters, browser E2E and B7 acceptance remain unfinished. Final local stack is not running at port 18763 yet; no production deployment.

## Group duty checkpoint — actual execution

- Migration 018 applied and checksum replay verified. Group plans are normalized, scoped and immutable after publication. Effective group membership is resolved on the assigned date when publishing, with bounded individual expansion and a final source-version guard.
- qa/backend/group-duty-integration.log: 49/49 executed, exit0. qa/backend/group-duty-unit-contract.log: 11/11 executed, exit0. Build/typecheck/lint exit0. The added scenario moves members before publication and verifies only the new member receives the task; a move after publication leaves that frozen task visible. Empty groups reject publication without replacing the current snapshot.
- An initial migration attempt referenced the wrong RLS helper and rolled back atomically. Database metadata confirmed migration 017 remained current before the unapplied migration was corrected and rerun. No applied migration was changed.
- API coverage remains 190/264; this extends existing duty operations. Single-lesson change/discard UI workflows, activities/evidence, announcements, reports/support/platform, notifications/dashboard, all frontend adapters, browser E2E and B7 acceptance remain unfinished. The final local URL is not serving the completed stack; production is not deployed.

## Activities and evidence checkpoint — actual execution

- Migration 019 applied and checksum replay verified. Eleven activity/evidence operations are implemented, including explicit targets, assigned-only progress, draft/assign/receive/review, close/reopen, current dataVersion publication and child-bound approved evidence documents. The schemas preserve existing illustration, roster-edit and review-sharing inputs.
- Activity completion never creates conduct automatically. Explicit approved activity sources now have time/status validation and locked-period source protection through both HTTP and PostgreSQL.
- qa/backend/activities-integration.log: 52/52 executed, exit0. qa/backend/activities-unit-contract.log: 11/11 executed, exit0. Typecheck/lint and Docker build exit0. The initial run was 50/52 because two parent-link fixtures omitted expiresAt; those fixtures were repaired and the full suite rerun. No applied migration was edited.
- Parent populated activity/evidence tests cover unpublished invisibility, retained public state until republish, another child's denial, both download permissions, embedded document filtering when a file is archived, stale sources and withdraw. This is backend HTTP/PG evidence; browser E2E remains NOT_RUN.
- 201/264 API operations implemented. Announcements, reports/support/platform, notifications/dashboard, frontend connection and B7 acceptance remain unfinished. Final local stack at port 18763 is not serving yet; no production deployment.

## Announcement checkpoint — actual PostgreSQL execution

- Migration 020 applied and replayed without changing any applied migration.
- Implemented API coverage is now 217/264; frontend screen connection is still NO.
- qa/backend/announcements-integration.log: 57/57, exit0. Checks include immutable
  published revisions, private child targeting, public/private replacement,
  sanitizer output, current publication conflicts, scheduled due-time processing,
  authority revoked before execution, acknowledgement-loss replay and private files.
- Parent file tests exercise download/section flags, foreign-child denial, archive
  exclusion, withdrawal and an old tab returning 409 after a new exchange.
- qa/backend/announcements-unit-contract.log: 12/12, exit0; typecheck/lint exit0.
  These are executed schema/policy/unit checks, not 264 API acceptance claims.
- Earlier failures and corrected fixture checks remain in attempt1–5 logs.
  A multi-student announcement with a student-specific file now rejects with 422.
- Backend sanitizer dependencies are pinned: sanitize-html 2.17.7 and types 2.16.2.
  Install audit reported zero vulnerabilities at this checkpoint.
- Public announcement attachment download is unavailable in the supplied contract;
  public metadata explicitly returns downloadAllowed=false. Browser workflows,
  notification/report/support modules and deployment acceptance are still pending.

## School settings/audit checkpoint — actual PostgreSQL execution

- Migration 021 applied/replayed; API coverage now 220/264; UI still unconnected.
- qa/backend/settings-integration.log: 60/60 exit0; settings-unit-contract.log:
  12/12 exit0. Build/typecheck/lint exit0. First attempt 59/60 retained separately;
  its failure was a fixture URL using /apply instead of /apply-and-publish.
- Real concurrent setting writes produce one success and one version conflict.
  A seven-day cap affects new parent links while old expiry/sections stay unchanged.
  School display flags suppress work contacts; an archived role no longer projects
  a teacher. Grant publication flags take effect in an existing teacher session.
- Optional second-person approval rejects self approval in API and PostgreSQL;
  a different scoped approver permits a checked, atomic replacement publication.
- School audit returns scoped, sanitized real events, rejects cross-school reads
  and changed-filter cursors, and denies a subject teacher's school-wide access.
- Reports/exports, dashboard, notifications, platform/support and B6/B7 remain pending.

## Personal notification checkpoint — actual PostgreSQL execution

- Migration 022 applied/replayed; implemented API coverage now 222/264.
- qa/backend/notifications-integration.log: 62/62 exit0; unit-contract: 12/12 exit0;
  typecheck/lint exit0. The first 61/62 attempt and its credential fixture failure
  are retained. Password-reset credentials are random runtime values, not fixed.
- Accepted invitations, published staff announcements and received evidence create
  notification rows atomically. A publication retry produces one receipt per user.
- One real identity reads two schools through signed global keyset pagination.
  A changed filter/user invalidates its cursor. A foreign receipt cannot be read.
  Revocation masks private titles, target UUIDs and query counts immediately;
  withdrawal and school suspension also apply on the next request.
- All source queries still use tenant RLS and currently granted action/scope/time.
  Frontend connection, dashboards, reports/exports, platform/support and B7 pending.
