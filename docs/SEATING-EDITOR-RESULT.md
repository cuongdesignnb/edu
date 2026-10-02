# Classroom seating editor — 2026-10-02

The classroom seating page now exposes row and seat counts above the grid and a visible Save changes action. Teachers with seating-management permission can drag pupils onto seats on desktop, or select a pupil and tap a seat on mobile. Moving an already seated pupil onto another occupied seat swaps their positions. The list editor remains available.

The existing 1–10 row/column limits, effective date, revision checks and version history are preserved. Shrinking the grid returns affected pupils to the unseated list; Undo restores their previous positions. Discard clears the layout, selection, note and date changes. An empty revision with null dimensions opens a usable default grid. Controls are disabled while saving. No permissions, backend, migrations or database contents were changed by this feature.

## Verification

- TypeScript check and ESLint on changed source/tests: PASS.
- Focused unit tests for seating operations and API/scope adapters: 24/24 PASS.
- Real Edge browser against local Docker: 2/2 PASS, covering actual desktop drag/swap, resizing, undo/redo and mobile placement/discard. These tests made no business-data writes and verified the seating workspace was unchanged afterward.
- Browser tests with controlled API responses: 6/6 PASS, including save/reload coordinates, empty-plan resizing, revision conflicts, failures, responsive layout and seating-only permissions. This save/reload evidence uses controlled responses, not local production-like database writes.
- Existing backend atomic seating integration test against a separate test PostgreSQL database: 1/1 PASS, covering activation, stale revisions and preservation after invalid future writes.
- Docker web build and local container health: PASS.

## Local runtime and source correspondence

- URL: `http://127.0.0.1:18763`
- Web image: `edumanage-web:seating-20261002-5e6f24ba0bb8`
- Raw build-input SHA-256: `5e6f24ba0bb8b5ae986d0a8d6af50233e8160e7e4d4164b35d92ef1096872179`
- API and worker image unchanged: `edumanage-api:tour-20261002-5d5e8f927976`
- Branch: `codex/new-machine-audit-20261002`

The web image was built from the working source before commit. Handoff verification compares every manifest input against staged and committed content, permitting only Git text newline normalization; applied SQL remains byte-exact. The existing API runtime is not attributed to the new frontend commit. Secrets, local environment files, private QA logs/screenshots and database volumes are excluded from the commit. Production deployment: NO.
