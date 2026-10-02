EDUMANAGE_RUN_TO_GOAL_RESULT
GOAL=PASS — authorized local core Definition of Done verified on the running build
BRANCH=codex/new-machine-audit-20261002
SOURCE_HEAD=b98481f6b108d38ccc8b43e99a47227070f2e578 — base SHA of the tested dirty build, not the later handoff commit
WORKTREE=Tested dirty snapshot packaged for handoff; private local evidence excluded; no reset/stash/clean
RUNNING_BUILD=run-20261002-ec5c93d153a5; build-input hash recorded in .secrets/local/run-source-build.json
CORE_INTEGRATION=Native UI/API/PostgreSQL paths verified for the scoped core; final static live-call-site trace has zero unresolved core calls; inventory records demonstrated behavior separately
CORE_GAPS_REMAINING=NONE in the authorized core integration scope; this is not an exhaustive browser matrix for every optional action
TYPECHECK_LINT_BUILD=Frontend/backend typecheck PASS; lint zero errors (one pre-existing frontend warning); API and web Docker production builds PASS
UNIT_CONTRACT_INTEGRATION=Frontend 454/454 PASS; backend unit 30/30, contract 46/46, integration 254/254 PASS on final backend snapshot 11
BROWSER_CORE_FLOWS=Final real browser 18/18 PASS on run-20261002-ec5c93d153a5, no HTTP interception or demo session; organization/pupil/import/published attendance/transfer reuse retained real fixtures; activity/evidence/private file/export/announcement/parent/schedule/ADD adjustment/policy/future rules execute real writes; 18 pages at 390/768/1440 PASS; real API-stop/error/retry PASS
SCOPE_REVOKE_PARENT_SNAPSHOT=Focused real PostgreSQL groups PASS including schools, class/subject, revocation, immutable publications, ADD adjustment, approvals, schedule, file sharing, import and transfer; final integration 254/254 PASS
DOCKER_LOCAL_URL=http://127.0.0.1:18763
DOCKER_HEALTH=api/worker/web/gateway/postgres healthy; migrate/storage-init exit 0; API/worker/migrate share build tag
PERSISTENCE_RESTORE=Application services force-recreated without volume deletion: all business/auth tables, sequences and RLS/policy metadata matched; only expected service heartbeat timestamps changed; 11 pre-existing private files matched byte hashes. Final existing-script maintenance backup backups/local-20261002T082622Z restored to edumanage_restore_test_20261002152640, network none/no host ports: all 85 table/sequence/security fingerprints matched the quiescent source, 55 migrations, all 16 final private files/2306 bytes SHA256 matched. Source services healthy afterward; test targets stopped with volumes retained
LOCAL_LOAD=Final build: 100 actual authorized local reads at concurrency 5, zero errors, p50 33.67ms, p95 63.15ms, max 108.59ms, 137.99 req/s; two-student QA class and five read paths. Single workload resource sample: API 113.6MiB/512 and 50.80% CPU, worker 61.37MiB/512 and 0.32%, web 93.7MiB/512 and 0%, PostgreSQL 117.3MiB/768 and 114.85% multi-core CPU. This is a small local measurement, not peak-resource evidence or a production SLA/capacity claim
GIT_COMMIT_PUSH=Commit/push authorized to cuongdesignnb/edu branch codex/new-machine-audit-20261002; approved repository-local identity cuongdesign <dinhcuongdesign@gmail.com>; final commit/remote SHA verified and reported after publication; runtime retains its run build ID
BLOCKERS=NONE for local core acceptance or source packaging
PRODUCTION_DEPLOYED=NO
NEXT_ACTION=Publish the verified selected source to the authorized branch; completion is recorded in Git and the final handoff response

Evidence paths are local and ignored where they contain private runtime data. No password, parent token, dump or secret is included in this report.

Source packaging verification (before commit): working build-input SHA256 ec5c93d153a5da2621949782001caf326e3cb17e6acb7ff7699f16c7adf79c3b matches the tested build manifest exactly. Git's canonical build-input SHA256 is 5c362d849a8fe1984d8889e776fc03f75f9f0abf368f2e338fd448ddb19d7033; remaining text differences are CRLF-to-LF normalization required by the repository. SQL migration bytes are preserved explicitly in .gitattributes: all 55 index/checkout checksums match the existing database, verified read-only. Runtime retains its original run build ID; a future Git commit ID is not its BUILD_SHA. Private logs/screenshots/backups/secrets remain local.

Final evidence:
- .secrets/local/browser-core-final-23.log (18/18; initial creation/transfer write receipts also retained in browser-core-final-6.log and browser-extended-final-3.log)
- .secrets/local/frontend-unit-final-11.log; backend-unit-contract-final-11.log; backend-integration-final-11.log (454/30/46/254, integration zero failures/skips)
- .secrets/local/frontend-types-final-23.log; frontend-lint-final-23.log; backend-build-final-11.log; backend-lint-final-11.log; docker-api-final-11.log; docker-web-final-11.log; crlf-final-24.log
- .secrets/local/core-adapter-audit-summary-final-24.log; run-source-build.json; final-docker-images.txt; final-runtime-status.json
- .secrets/local/recreate-persistence-result.json; backup-capture-final-24.log; isolated-restore-final-24.log; restore-comparison-result-final-24.json; local-load-result.json
