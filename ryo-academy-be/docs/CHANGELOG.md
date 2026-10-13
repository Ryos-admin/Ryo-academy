# Backend Changelog

## 2026-10-09 — Product audit baseline and test stabilization

- Audited the NestJS/Prisma backend modules, controllers, guards, DTOs, seeds, and tests.
- Confirmed `POST /auth/login` is public in `src/auth/auth.controller.ts`; corrected the stale API documentation that claimed the auth controller was guarded at class level.
- Fixed the backend Jest ESM configuration so the existing TypeScript ESM tests execute under Jest.
- Added the ESM Jest setup bridge required by existing tests that use the global `jest` helper.
- Removed debug logs that emitted the authenticated user profile and an academic-year lookup value.
- Corrected the root response to match its existing test and documented API expectation: `Hello World!`.
- Updated one admission test assertion to accommodate the verified `isActive` query filter.
- Added missing dependency mocks to isolated `ProtectedService` and `DatabaseService` tests.

Verification:

- Backend unit tests: 11 suites passed, 65 tests passed.
- Prisma schema validation: passed.
- Frontend production build: passed.
- Frontend tests: 10 files passed, 115 tests passed.

Known limitations:

- Database-backed live CRUD verification was not performed because it would require creating or mutating test records; the audit leaves production data unchanged.
- School-level data isolation and remaining intentionally mock-backed frontend workflows require separate verification and, where behavior is unclear, product decisions.
- `development-docs.md` and `completed-checklist.md` were referenced by the audit request but are not present in this checkout.

Live HTTP verification on port 7676:

- Backend started cleanly and health response returned `Hello World!`.
- `POST /auth/login` accepted public requests and returned validation errors without a token.
- Protected endpoints returned 401 with no token and with an invalid token.
- Invalid login credentials returned 401 without exposing secrets.

## 2026-10-09 — Continuation audit, Part 2

Execution log:

- PASS — Checked for `.git/index.lock`; it was absent. No active Git process was found. The repository `.git` directory is not writable in this environment, so commit remains BLOCKED; no lock was removed and no metadata workaround was attempted.
- PASS — Re-read the frontend migration changelog and backend audit records; historical failures and limitations were preserved.
- PASS — Re-ran backend Jest: 11 suites and 65 tests passed.
- PASS — Revalidated Prisma schema with `npx prisma validate`.
- PASS — Source review reconfirmed public login, guard wiring, identity-header validation, and intentionally mock-backed frontend boundaries.
- PASS — Live HTTP evidence from the running backend was retained: health 200, public login validation 400, invalid credentials 401, missing token 401, invalid token 401.
- NOT RUN — Role matrix with real seeded accounts, two-school isolation, database CRUD fixtures, and browser journeys. These require authenticated fixture selection and/or database mutation; no unsupported or destructive test data was created.

No new product behavior or schema change was introduced during Part 2.

## 2026-10-09 — Final QA continuation

- PASS — Environment review found no active Git process and no `.git/index.lock`; `.git` remains read-only.
- PASS — Available RBAC roles were confirmed from the seed and guard code: `COLLEGE_ADMIN`, `OFFICE_ADMIN`, and `STAFF`.
- PASS — Source review confirmed permission decorators are applied to domain controllers and that JWT context is loaded from the database before requests proceed.
- PARTIAL — Authentication-context and tenant behavior were reviewed in code, but no authenticated runtime matrix was executed because no authorized test credentials/fixture set was safely available without printing or mutating sensitive data.
- BLOCKED — Browser QA: no frontend dev/preview server was running on ports 5173 or 4173, and no browser journey was claimed.
- NOT RUN — Two-school runtime isolation and CRUD persistence fixtures. No database writes, resets, or destructive cleanup were performed.
- PASS — `git diff --check` remained clean after documentation updates.

## 2026-10-09 — QA environment unblock attempt

- BLOCKED — Configured database URLs point to a remote Neon host while `NODE_ENV=development`; the repository does not identify this database as isolated test infrastructure. No database writes or fixture provisioning were attempted.
- BLOCKED — No authorized RBAC account set or safe second-school fixture set was available in the checked-in setup.
- BLOCKED — The frontend command inherited configured port `8001`; the temporary availability check did not leave a running frontend. A backend attempt on `7676` encountered address-in-use during the combined check. No long-running process was left behind.
- BLOCKED — Git metadata remains read-only; `.git/index.lock` was absent and no active Git process was found.

## 2026-10-09 — Isolated QA environment setup attempt

- PASS — Confirmed the configured database target is remote Neon; no local PostgreSQL or isolated QA database configuration was found.
- BLOCKED — Docker is installed but the Docker daemon is unavailable to this workspace, and no compose/provisioning procedure exists in the checked-in repositories. No cloud resource or database infrastructure was provisioned.
- BLOCKED — Repeatable role/two-school fixtures cannot be created safely without an isolated database. No seed, migration, reset, or destructive command was run.
- BLOCKED — Port diagnostics found no persistent application listener. The earlier combined startup attempt reported `EADDRINUSE` on 7676, but no process was killed because the owner could not be safely established.
- BLOCKED — Browser and authenticated runtime verification remain dependent on a safe database, authorized fixtures, and stable application startup.

## 2026-10-09 — QA handoff prerequisites

- Added `docs/qa/environment-prerequisites.md` with verified configuration names, safe startup commands, data-modifying command warnings, fixture requirements, and the exact conditions for resuming runtime QA.
- No application behavior, schema, migration, seed, or database data was changed.

## 2026-10-09 — Soft-deletion dependency inventory

- Added `docs/qa/soft-deletion-cascade-matrix.md` from the current Prisma models and service boundaries.
- Confirmed existing deletion conventions are mixed: most business entities use `isActive`, while academic-calendar and attendance-master records also use `deletedAt`.
- Confirmed complete V0 cascade behavior is blocked by schema gaps: required `TeachingAssignment.staffId`, no academic-year ownership on teaching assignments, missing consistent deletion metadata, and no explicit subject-to-year join.
- No schema edits, migrations, seeds, database writes, or frontend behavior changes were made.

## 2026-10-09 — V0 soft-deletion implementation prepared

- Added nullable `deletedAt` lifecycle fields and active-record indexes to academic-year-owned structures, subjects, staff, users, students, admissions, and teaching assignments.
- Made `TeachingAssignment.staffId` nullable so staff deactivation can preserve and unassign assignments.
- Implemented transactional academic-year soft deletion with active confirmed-enrollment blocking and cascades to programs, classes, sections, calendars, and assignments selected through owned class IDs.
- Implemented transactional staff deactivation that disables the linked user and clears active assignment staff references without deleting assignments.
- Updated subject deletion to soft-delete dependent teaching assignments and itself without affecting classes or students.
- Updated relevant active queries and creation/assignment validation to exclude soft-deleted records.
- Added academic-year cascade unit coverage.
- Schema validation, Prisma client generation, and backend tests passed: 12 suites, 67 tests.
- No migration was applied and no database-backed test was run because the configured Neon database is not an approved isolated QA database.

## 2026-10-09 — Soft-delete security regression hardening

- Audited active-record filters, assignment paths, linked-user handling, and authentication lifecycle behavior.
- Fixed confirmed query gaps by excluding soft-deleted students, admissions, assignments, staff, subjects, classes, sections, and academic structures from operational paths.
- Added focused staff lifecycle tests for linked-user disabling, assignment unassignment, idempotent repeated deactivation, and missing targets.
- Added focused subject lifecycle tests for transactional dependent-assignment soft deletion.
- Verified existing authentication rejects inactive users through the existing `isActive` check.
- Source review found tenant context is not passed into these destructive service contracts; runtime cross-school isolation remains unverified and no broad contract redesign was made.
- `deletedById` remains deferred because trusted actor context is not currently part of the delete endpoint/service contract.
- Verification: 14 backend suites and 71 tests passed; Prisma validation and backend build passed; no database connection or migration was used.

## 2026-10-10 — Trusted school-context enforcement

- Traced JWT authentication: the guard trusts only the JWT `sub` as `request.user.userId`; no client school header/body is used as authority.
- Updated academic-year deletion, staff deactivation, and subject deletion controllers to pass that trusted user ID into their services.
- Services now resolve the actor's `schoolId` from the database and reject schoolless actors; academic years, staff records, and subjects are scoped through verified school relationships before destructive work.
- Existing cascade transactions remain intact; out-of-scope targets are treated as not found where applicable.
- Added/updated mocked unit coverage for trusted context and same-school destructive operations. Unit tests do not prove runtime database isolation.
- Verification: backend Jest 14 suites / 71 tests passed; Prisma validation passed; no Neon connection or database write was performed. A fresh build/typecheck was started but the workspace execution window did not return its completion output; prior build result remains historical, not re-claimed as this milestone's fresh pass.

## 2026-10-10 — Deletion actor attribution

- Added nullable `deletedById` relations with explicit Prisma relation names and `SetNull` behavior for records actually soft-deleted by the supported cascades.
- Academic-year cascades attribute the academic year, programs, classes, sections, calendar records, and assignments to the authenticated actor.
- Staff deactivation attributes the staff and linked user; unassigned teaching assignments are intentionally not marked deleted.
- Subject deletion attributes the subject and dependent assignments.
- Repeated deletion behavior preserves original metadata through existing early exits.
- Actor-attribution expectations were added to the academic-year, staff, and subject unit tests.
- Prisma validation, client generation, and backend Jest passed: 14 suites, 71 tests.
- No migration was generated or applied and no database was contacted. Fresh build completion was not claimed because the long-running command did not return in the execution window.

## 2026-10-10 — Isolated local QA database preparation

- Read-only environment inventory confirmed Docker client availability but no usable Docker daemon or Compose setup.
- Local PostgreSQL server tools (`postgres`, `initdb`, `pg_ctl`, `pg_isready`, `psql`) are available.
- Prepared and verified a disposable local PostgreSQL instance under `/tmp` on port `55432`, then stopped it cleanly.
- Verified the local database identity as `postgres` using `ryo_qa_owner`; Neon was not contacted.
- No Prisma migration, seed, reset, or schema write was run.
- Added the repeatable local setup/stop pattern to `docs/qa/environment-prerequisites.md`.

## 2026-10-10 — Soft-delete migration applied to isolated QA database

- Generated `prisma/migrations/20261009190125_add_soft_delete_actor_metadata/migration.sql` using Prisma against the local QA workflow; historical migrations were not edited.
- Reviewed the SQL for nullable deletion fields, nullable `TeachingAssignment.staffId`, explicit User foreign keys with `ON DELETE SET NULL`, and deletion-actor indexes.
- Applied all 16 migrations to disposable database `ryo_qa` at `127.0.0.1:55432`.
- Verified migration status was up to date and checked columns, foreign keys, nullable assignment staff references, and indexes with read-only `psql` queries.
- Ran Prisma validation and backend Jest: 14 suites, 71 tests passed.
- PostgreSQL was stopped cleanly. No seed or domain fixture was created.
- Neon was not contacted and no remote data was modified.

## 2026-10-10 — Final soft-delete completion audit

- Reverified disposable local QA target `127.0.0.1:55432/ryo_qa`; migration status reported up to date.
- Reverified the local catalog: 21 deletion columns and 9 deletion-actor foreign keys, including nullable `TeachingAssignment.staffId`.
- No domain fixtures were created, and no database-backed cascade, rollback, or cross-school scenario was executed.
- Fresh safe checks: backend Jest 14 suites / 71 tests passed; Prisma validation passed; Prisma client generation passed; `git diff --check` passed.
- A detached backend build attempt did not return a reliable exit result in the workspace shell; build is therefore not claimed as a fresh closure pass.
- Local PostgreSQL was stopped cleanly. Neon was not contacted and no remote data was modified.

## 2026-10-10 — Final database verification attempt

- PASS — Local migration status and schema catalog were reverified on `127.0.0.1:55432/ryo_qa`; PostgreSQL stopped cleanly afterward.
- PASS — Fresh unit, Prisma validation, client-generation, and diff checks completed as recorded in the checklist.
- BLOCKED — The controlled fixture harness did not execute because the inline `tsx -e` CommonJS runner rejected top-level `await` before opening its Prisma connection. Its cleanup trap stopped PostgreSQL; no fixture writes occurred.
- NOT RUN — Database-backed cascade, rollback, attribution, and cross-school scenarios. No claim is made for these behaviors.

## 2026-10-10 — Soft-delete integration harness fixed and verified

- Replaced the failed inline `tsx -e` fixture attempt with `test/soft-delete.integration.ts`, using an async `main()` and strict target checks for `127.0.0.1:55432/ryo_qa`.
- PASS — The harness created two test schools and scoped fixtures, verified enrollment blocking, approved cascade attribution, history preservation, staff/user lifecycle, subject dependency behavior, repeated-delete metadata, cross-school rejection, and real transaction rollback.
- PASS — Test-owned records were removed in the harness `finally` cleanup; PostgreSQL was stopped cleanly.
- PASS — Backend Jest: 14 suites / 71 tests; Prisma validation; Prisma generation; backend build; and `git diff --check`.
- Limitation — The harness verified student/admission preservation, but did not create attendance or fee-history fixtures; those preservation paths remain unverified by this run. It also did not execute a full HTTP/JWT role matrix.
- Neon was not contacted and no remote data was modified.

## 2026-10-10 — Financial Log Master V0 audit

- Added `docs/finance-log-master-v0-audit.md` as a documentation-only implementation plan.
- Verified the current fee-payment transaction, allocation and overpayment rules, schema relationships, permission conventions, and frontend fee/payment boundaries.
- Confirmed that FinancialLog, Expense, payment receipts, expense posting, reversals, and financial reporting endpoints are not currently implemented.
- Proposed, without generating or applying a migration, the minimal FinancialLog/Expense schema, source uniqueness strategy, transaction/idempotency requirements, authorization scope, and implementation sequence.
- No database was contacted and no runtime behavior changed.

## 2026-10-10 — Financial Log Master V0 schema and local migration

- Added `FinancialLog`, `Expense`, `ExpenseCategory`, `FinancialLogType`, `FinancialFlowType`, and `FinancialSourceType` to the Prisma schema with explicit School/User relations.
- Added source/type uniqueness for duplicate prevention, expense soft-delete actor metadata, and the approved reporting indexes.
- Generated and reviewed migration `20261009192643_add_financial_log_master_v0`; it contained only the new enums, tables, indexes, and foreign keys.
- Applied all 17 migrations only to disposable local PostgreSQL at `127.0.0.1:55432/ryo_qa`; migration status and read-only catalog checks passed.
- Prisma validation, client generation, backend build, and `git diff --check` passed.
- Fee-payment integration, idempotency, expense services/reversal behavior, reporting endpoints, and frontend work remain deferred to later milestones. Neon was not contacted.

## 2026-10-10 — Financial Log fee-payment integration

- Updated `POST /students/:id/fees/payments` to pass trusted JWT actor context and reject cross-school payment attempts before mutation.
- Added `FeePayment` source events with optional UUID `idempotencyKey`; repeated same-intent keys do not reapply allocation or create duplicate logs, while changed intent returns `409 Conflict`.
- Added `FinancialLog` income creation inside the existing fee allocation transaction, using the `FeePayment` event as `sourceId`.
- Added migration `20261009194616_add_fee_payment_idempotency`; applied all 18 migrations only to local `127.0.0.1:55432/ryo_qa`.
- Focused real-PostgreSQL integration passed for posting, source uniqueness, retry behavior, cross-school rejection, and overpayment rejection. Backend Jest (14 suites / 71 tests), Prisma validation, generation, build, and `git diff --check` passed.
- Real-PostgreSQL concurrency verification passed: two simultaneous requests with the same key produced one payment event and one ledger row.
- PASS — `test/financial-payment.integration.ts` used a test-only `FinancialLogFailureStudentService` override to throw from `createFinancialLog()` after earlier payment mutations were attempted. Independent PostgreSQL assertions confirmed no attempted `FeePayment`, no new FinancialLog, unchanged header/detail balances, and successful subsequent payment posting.
- Expense workflows, reversal/reporting endpoints, and frontend idempotency UI remain deferred. Neon was not contacted.

## 2026-10-10 — Financial Log cash expense lifecycle

- Added `POST /expenses` and `DELETE /expenses/:id`, protected by new `expense:create` and `expense:delete` permissions and the existing JWT/permissions guards.
- Expense creation posts one `EXPENSE` ledger row in the same transaction as the cash expense.
- Expense soft deletion preserves the original expense/log and posts one exact-amount `EXPENSE_REVERSAL` with `flowType = INCOME`; repeated deletion is rejected without changing original metadata.
- Added `test/expense.integration.ts`; real PostgreSQL verification passed for creation, creation rollback, cross-school rejection, reversal, repeated deletion, reversal rollback, and duplicate-source prevention.
- Backend Jest: 14 suites / 71 tests; Prisma generation; backend build; and `git diff --check` passed. No schema migration was needed. Reporting and frontend work remain deferred. Neon was not contacted.
## 2026-10-10 — Financial Log reporting V0

- Added read-only `GET /financial-logs`, guarded by JWT and the existing `fees:read` permission.
- Enforced school scope from the authenticated user record; query input cannot select another school.
- Added date, flow, source, and bounded pagination filters with stable ordering and income/expense/net summaries.
- Added PostgreSQL-backed reporting integration coverage for two-school isolation, pagination, date and flow filters, zero periods, reversal arithmetic, and missing-school actors. Result: `FINANCIAL_LOG_INTEGRATION_PASS`.
- Added the Office Admin `/financial-log` read-only page and frontend API adapter with filters, summaries, pagination, and request states.
- Backend build, unit suite, frontend test suite, frontend build, and `git diff --check` passed. No Prisma migration was needed.
- Not run: live HTTP role-matrix verification and browser journey. Frontend typecheck still reports pre-existing unrelated errors.

## 2026-10-11 — Consolidated soft-delete and Finance V0 verification attempt

- Inspected the existing soft-delete matrix, finance audit, QA prerequisites, backend checklist, and reporting harness.
- Fresh database execution was BLOCKED before fixture access: `npx tsx` failed with sandbox IPC `EPERM`, and `node --import tsx/esm` could not start PostgreSQL on the QA port in this execution context.
- No fresh preservation, finance, or HTTP/JWT result is claimed. Historical passing integration results remain distinguished from this blocked rerun.
- No remote or unverified database was contacted.

## 2026-10-11 — HTTP/JWT authorization QA attempt

- Audited actual guards, route decorators, permission constants, seeded role assignments, JWT identity propagation, and finance/soft-delete controllers.
- Confirmed statically that the requested routes use JWT and permission guards and that destructive handlers use the authenticated `userId`.
- Live HTTP requests, two-school mutation assertions, invalid-token checks, and role-matrix results are BLOCKED because the isolated PostgreSQL-backed application could not be started on port `55432`.
- No production security defect was reproduced and no production code was changed. Neon was not contacted.

## 2026-10-11 — HTTP/JWT runtime unblocked and verified

- Diagnosed the startup blocker as sandbox denial of localhost socket creation, not an occupied port or database URL mismatch. Elevated local execution started the disposable PostgreSQL instance safely.
- Reproduced and fixed a narrow authorization defect: malformed-token requests returned 500 because `JwtAuthGuard` could be constructed without `ConfigService`. Registered the guard in the shared/affected modules and added safe constructor defaults for route-metadata construction.
- Added `test/http-jwt-qa.integration.ts`. Against compiled backend runtime on port `7676`, it verified 401 for missing/invalid tokens on the requested routes, Office Admin FinancialLog access, Staff 403 denial, two-school report isolation, cross-school expense deletion rejection with independent DB checks, authorized deletion, and repeated deletion 409.
- Result: `HTTP_JWT_QA_PASS`. Test-owned records were cleaned up; PostgreSQL and backend server were stopped cleanly.
- Backend unit suite: 14 suites / 71 tests passed; backend build and `git diff --check` passed. Full valid-domain HTTP coverage for academic-year/staff/subject/fee-payment mutations remains limited by fixture scope.
