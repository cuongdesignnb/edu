# EduManage — optional SMTP release v1.0.1

Base source: `02ceb3ca24d0b8fee27617ef5461db3136974d5e`. Branch: `codex/new-machine-audit-20261002`. Release source is the immutable commit peeled from `v1.0.1`; the GitHub Actions run builds both images from that exact SHA and includes OCI revision/version/source labels. Final SHA, run URL and registry digests are reported after publication. No production SSH or deployment was performed.

SMTP is now configured in `/platform/settings` using the native platform contract. Only `platform.mail.manage` is allowed; the action belongs to PLATFORM_OPERATOR, and migration grants it only to existing active operators holding all platform authorities. School admin, teacher, support context, partial platform support/settings and parent are denied. Fresh production bootstrap uses the same updated role template.

Migration `057-platform-mail-settings.sql` adds a disabled singleton with FORCE RLS. Existing migrations are unchanged. SMTP password uses AES-256-GCM with random IV and HKDF domain separation from the existing mail_key. The API only returns passwordConfigured; blank/omitted input preserves the stored credential, explicit clear requires disabled SMTP. Audit records booleans only; idempotency stores the safe response and request hash, never the request password. Only the worker invokes credential decryption; normalized SMTP errors omit raw provider/auth text, credentials, mail body and private URLs.

With disabled or unconfigured SMTP, the worker returns before claiming mail. Attempts and FAILED state do not increase; heartbeat and other jobs continue. It reads DB configuration each pass; a version check before claiming and sending returns mail to PENDING with its attempt restored when configuration changes. An in-flight SMTP transaction already accepted by a provider cannot be recalled. Existing invitation/reset expiry and authority checks remain; expired links are cancelled. SMTP tests are real encrypted outbox messages, rate limited to two per operator/minute and five globally/minute, and stale tests cannot overwrite a newer configuration/receipt.

SMTP settings and operations status display UNCONFIGURED, DISABLED, ENABLED_UNVERIFIED, WORKING or ERROR. A queued test is shown as waiting until the worker confirms SENT/FAILED. SMTP disabled is not a system degradation. Email-dependent invitation/password-reset delivery remains pending until SMTP is enabled; forgot-password responses remain generic and expose no token.

## Focused validation

| Check | Result / evidence scope |
| --- | --- |
| Backend typecheck/build | PASS |
| Backend unit | 33/33 PASS, including production without SMTP, HTTPS/cookie/keys/connected guards, encryption and native contract |
| Native API contract | 47/47 PASS; 427 operations / 654 schemas |
| PostgreSQL + controlled SMTP TLS | 12/12 PASS: startup/heartbeat, permissions/RLS, optimistic version/CSRF, encrypted DB, blank preserve/clear, forgot/invitation pending, concurrent workers, SMTP SENT/failure normalization, dynamic config, expired token, rate limit, legacy operator grant, disable race and lost lease receipt |
| Frontend typecheck + ESLint changed files | PASS |
| Native authentication/scope unit | 23/23 PASS |
| Edge form browser | 3/3 PASS with controlled HTTP fixtures: disabled blank save, enable validation, password UX, queued/sent test UX, 320/390/768/1440 layouts, permission denial; no page errors |
| Production Docker builds | API/worker shared image and Web PASS, pinned Node 24 base; local check images use an explicit uncommitted check label |
| Production script gates on Linux | 13/13 PASS including no-SMTP first-release orchestration and existing backup/lock/migration/rollback/log safety gates |
| Real Compose static config | PASS with legacy SMTP blank, HTTPS chunhiemso.com, exactly seven base secrets, no smtp_password; only gateway loopback binding |
| Isolated production runtime | API/worker/Web/gateway/PostgreSQL healthy, migrate 057 + verify-installation PASS, no seed or public host ports; stopped afterwards, volumes retained |
| Owner command blocks + workflow | Bash syntax and actionlint PASS |

The SMTP fixture is a synthetic loopback TLS server used only in tests. It is never configured as a production sender. Native integration uses a separate synthetic test PostgreSQL project. The production runtime lab uses a separate project, database and volumes, keeps keys intact and does not touch existing local application containers. Production host preflight, real domain smoke and provider delivery are for the owner to execute; local lab PASS does not assert production deployment.

## Compatibility and handoff

Production Compose removes all SMTP env and smtp_password mounts. Secrets generation requires exactly seven base secrets and refuses overwrites. Existing `.env.production` SMTP fields may remain blank, including an empty SMTP_PASSWORD; nonempty secret literals remain forbidden. No env migration, secret regeneration or app_key/mail_key rotation is required. HTTPS, secure cookies, connected mode, keys, RLS, image/source, port/volume, backup/migration and health gates remain mandatory.

`v1.0.0` stays at `90103a33e83c2802090236ba8a92a2fe9cc7ce78`; no tag is moved or force pushed. `v1.0.1` is created only if absent and is released only after focused checks pass. Workflow runs native optional SMTP integration before publishing. Private QA, local logs, env/secrets, dumps/backups and uploads are excluded from commits.

Exact commands for the owner's prepared server: [OWNER-SSH-FIRST-DEPLOY.md](OWNER-SSH-FIRST-DEPLOY.md), **FIRST DEPLOY WITHOUT SMTP — v1.0.1**. After release succeeds, bootstrap a real admin on the server, then optionally save a real SMTP provider and send a test in `/platform/settings`. Do not use test/demo credentials in production.
