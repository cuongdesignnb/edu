# EDUMANAGE usability fix — v1.0.8

Base source: `53cde0464be3a92ea15857348d6515a3a6a162ad` (v1.0.7). Target branch: `codex/new-machine-audit-20261002`.

## Direct Staff

Reproduced the four real API cases on isolated PostgreSQL with SMTP disabled: new teacher, DRAFT class homeroom assignment, subject assignment, and explicit assignment of an existing identity. Valid API creation already worked. The reproduced UI failures were incomplete field-error handling, suppressed validation/duplicate Toasts, and clearing password fields after a failed request.

The dialog now normalizes nested assignment errors, labels and focuses the field from the error summary, reports missing dependencies, keeps entered values on failure, and refreshes the teacher list after acknowledgement. Existing-identity assignment retains its explicit confirmation and never overwrites the password. Creation uses the existing transactional backend implementation and sends no mail.

The two separate effective-date pairs have been merged into one pair: **Hiệu lực từ ngày / Hiệu lực đến ngày (loại trừ)**. These school-local dates supply both the account grant and any initial assignment. Account timestamps use the school's timezone. An assignment requires a start date and still enforces the academic-year interval; blank dates without an assignment preserve immediate/no-end defaults.

## Command feedback

The existing root Toast provider now reports VALIDATION, DUPLICATE, CONFLICT, FORBIDDEN and NETWORK failures, with curated messages and the first labeled field error. It does not serialize request bodies, error details, passwords or tokens. Inline form errors remain visible. Success appears after server acknowledgement. Initial/background reads remain quiet; explicit Retry failures report feedback.

All production `silentError` call sites were reviewed. Only the two Direct Staff commands retain it because that dialog emits its own normalized Toast. Demo-only hooks are outside the production facade.

## Paste students

One shared dialog serves the school student list and class roster. It accepts one name per line, Excel/Google Sheets TSV, and unambiguous CSV; ambiguous multi-column text requires mapping. Users can inspect, edit or remove rows before server validation. Limits are 500 students and 200 KB; previews paginate 25 rows.

The server accepts the PASTE source through a scoped endpoint and reuses the existing import job, row, queue, worker and history tables. No migration is needed. Missing codes are generated under the school lock and avoid explicit codes reserved in the same batch. Date of birth and gender are optional only for PASTE; file-import validation is preserved. Equal names create distinct records with warnings. Supplied duplicate codes cannot overwrite a student. Guardian records remain UNVERIFIED with information access disabled.

Users confirm the valid row count before import. Partial completion explicitly reports added/total and retains invalid rows. The completed command invalidates the school's private query cache to refresh the student list, roster and counts without F5. The class entry point preselects its year and class. Server authorization checks the exact student-manage class scope and protects each paste job's owner.

## Validation

- Native PostgreSQL integration: 3/3 PASS, including all Direct Staff cases, no SMTP dependency, unchanged passwords, no invitation/mail records, generated codes, duplicate names, partial TSV, guardian safety, preserved FILE validation and class-scope authorization.
- New frontend regression checks and query boundary checks: 28/28 PASS.
- Existing targeted staff, dependency and native-facade checks: 31/31 PASS.
- Backend unit tests: 37/37 PASS.
- Latest production-build browser checks: 8/8 PASS, including the single effective-date pair, failure field focus/value preservation, DRAFT homeroom creation, ten pasted names, partial TSV on mobile, class prefill and roster count increasing 12 to 13 without F5. No page errors.
- Frontend/backend typecheck and production builds: PASS.
- Production static configuration: PASS with SMTP disabled and synthetic local test secrets; no host deployment performed.
- Browser checks use only a private isolated local fixture. Credentials, screenshots and private evidence are excluded from the commit.

The immutable release workflow includes the new targeted frontend and native PostgreSQL regression gates before publishing either production image. Publication, remote SHA and OCI revision/version/digest must be verified after the tag is pushed; this document does not claim a production deployment.

## Owner update

Only after the release handoff confirms Actions PASS and both images:

```bash
cd /www/wwwroot/edu && bash scripts/update-production.sh v1.0.8 && bash scripts/prod-status.sh
```

Production deployed by this task: **NO**. No SSH, production SQL, volume deletion or movement of an existing release tag.
