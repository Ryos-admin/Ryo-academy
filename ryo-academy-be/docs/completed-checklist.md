# Completed Audit Checklist

## 2026-10-09 — Initial audit pass

- [x] Repository structure and current Git state inspected.
- [x] Frontend routes and backend controllers inventoried.
- [x] Authentication and permission guard wiring inspected.
- [x] `POST /auth/login` confirmed publicly reachable by controller source inspection.
- [x] Prisma schema validated.
- [x] Backend Jest configuration repaired for native ESM.
- [x] Backend unit suite passes: 11 suites, 65 tests.
- [x] Frontend production build passes.
- [x] Frontend suite passes: 10 files, 115 tests.
- [x] Debug user-profile logging removed.
- [x] Remaining academic-year debug logging removed.
- [x] Stale authentication documentation corrected.
- [x] Backend started on port 7676 and health endpoint responded successfully.
- [x] Public login validation, invalid credentials, missing-token, and invalid-token HTTP checks completed.
- [x] Part 2 audit re-read historical logs and preserved prior failures/limitations.
- [x] `.git/index.lock` checked and confirmed absent; no active Git process found.
- [x] Backend Jest retest passed: 11 suites, 65 tests.
- [x] Prisma validation retest passed.

## Pending

- [ ] End-to-end authentication and role/permission matrix verification.
- [ ] Cross-school data-isolation verification.
- [ ] Full route-by-route manual UI QA.
- [ ] Product decisions for intentionally mock-backed workflows.
- [ ] Database-backed CRUD verification with clearly named temporary fixtures (not run to avoid mutating existing data).

## Part 2 verification matrix

| Area | Evidence | Status |
|---|---|---|
| Authentication boundary | Controller/guard source review plus live HTTP checks | PASS for public/missing/invalid-token cases |
| Role and permission matrix | No authenticated role fixtures exercised | NOT RUN |
| Identity headers | Guard source review; no spoofing HTTP matrix with real tokens | PARTIAL |
| Cross-school isolation | One-context code review only; no second school fixture | NOT RUN |
| CRUD persistence | No database-mutating fixture workflow run | NOT RUN |
| Browser journeys | No browser journey executed in this continuation | NOT RUN |
| Mock/real inventory | Frontend changelog and route/adapter source review | PASS at inventory level |
| Git commit | `.git` is read-only; index lock absent | BLOCKED |

## Final QA continuation matrix

| Test ID | Category | Scope | Result | Evidence / limitation |
|---|---|---|---|---|
| FQA-001 | RBAC discovery | `COLLEGE_ADMIN`, `OFFICE_ADMIN`, `STAFF` | PASS | Seed definitions and permission guards reviewed |
| FQA-002 | Authentication context | JWT plus database user lookup | PARTIAL | Static guard review; no authorized role token available for runtime matrix |
| FQA-003 | Tenant isolation | School-scoped services and headers | NOT RUN | No safe second-school fixture/runtime account |
| FQA-004 | CRUD persistence | Implemented API modules | NOT RUN | Avoided database writes and destructive cleanup |
| FQA-005 | Browser QA | Frontend routes and journeys | BLOCKED | No frontend server on 5173/4173; no browser journey claimed |
| FQA-006 | Git closeout | Index/lock/permissions | BLOCKED | Lock absent, but `.git` is read-only |

### Final QA release readiness

Status remains **PARTIAL / BLOCKED**. The verified authentication baseline is healthy, but security role runtime tests, tenant isolation, CRUD persistence, and browser QA are still release blockers.

## Environment unblock attempt

| Check | Result | Evidence |
|---|---|---|
| Database safety classification | BLOCKED | Configured database host is remote Neon; no isolated test designation |
| Authorized RBAC fixtures | BLOCKED | No safe checked-in provisioning flow/account set for runtime testing |
| Two-school fixtures | BLOCKED | No safe isolated database confirmed; no writes attempted |
| Frontend startup | BLOCKED | Existing configuration inherited port 8001; temporary command did not leave a running server |
| Backend startup | BLOCKED in this attempt | Port 7676 reported address-in-use during combined check; no process left running |
| Browser QA | NOT RUN | No stable frontend/backend pair available |

## Isolated QA environment setup

| Check | Result | Evidence |
|---|---|---|
| Remote database protection | PASS | Remote Neon target identified; no writes performed |
| Local QA database | BLOCKED | No local PostgreSQL target or compose setup found |
| Docker provisioning | BLOCKED | Docker client exists, daemon unavailable |
| Fixture setup | BLOCKED | Cannot safely create RBAC/two-school fixtures |
| Port ownership | BLOCKED | No persistent listener found; prior 7676 conflict owner not established |
| Migrations/seeding | NOT RUN | Correctly skipped because database safety was not established |

## QA handoff

- [x] Verified Prisma datasource and seed configuration.
- [x] Documented environment variable names without secrets.
- [x] Documented supported migration, seed, startup, and health-check commands.
- [x] Documented data-modifying commands that must not target the current remote database.
- [x] Documented minimum environment-owner prerequisites and resume conditions.
- [x] Prepared the runtime QA scope as NOT EXECUTED until an isolated database is confirmed.

## Soft-deletion V0 inventory

- [x] Inspected current soft-delete fields and lifecycle conventions.
- [x] Mapped academic-year, academic-structure, staff, user, subject, student, attendance, admission, and financial dependencies.
- [x] Documented shared versus owned relationships and preserved-history rules.
- [x] Identified schema blockers before editing Prisma models.
- [x] Implement schema-compatible cascade behavior in Prisma models and backend services without applying a migration.
- [x] Add academic-year cascade regression coverage.
- [x] Add full staff/subject/cross-school regression coverage — verified by the isolated local integration harness.
- [x] Add focused staff lifecycle regression tests.
- [x] Add focused subject lifecycle regression tests.
- [x] Audit and fix confirmed active-record query gaps.
- [x] Add trusted tenant context to destructive service contracts.
- [x] Add `deletedById` attribution.

## Deletion actor attribution

- [x] Add explicit `deletedById` relations only to actually soft-deleted cascade entities.
- [x] Store the authenticated actor on academic-year cascades.
- [x] Store the authenticated actor on staff and linked-user deactivation.
- [x] Store the authenticated actor on subject and dependent-assignment deletion.
- [x] Preserve actor/timestamp on repeated deletion through existing early exits.
- [x] Generate and review soft-delete/deletion-actor migration locally.
- [x] Apply all migrations to disposable local QA database only.
- [x] Verify local migration status, columns, foreign keys, and indexes.
- [x] Create scoped two-school fixtures and run database-backed integration tests; cleanup completed in the harness.

## Final soft-delete closure audit

- [x] Reverify isolated local migration status.
- [x] Reverify local deletion columns, actor foreign keys, nullable assignment reference, and indexes.
- [x] Run fresh unit, Prisma validation, generation, and diff checks.
- [x] Run database-backed cascade/rollback/cross-school tests against disposable local PostgreSQL.
- [x] Fresh backend build closure result — `npm run build` exited 0.
- [x] Database-backed cascade/rollback/cross-school execution — passed via `test/soft-delete.integration.ts`.

## Trusted school-context enforcement

- [x] Trace JWT user identity and confirm client-supplied school identity is not trusted.
- [x] Pass trusted JWT user ID into destructive academic-year, staff-status, and subject-delete services.
- [x] Resolve actor school from the database before destructive mutations.
- [x] Add mocked same-school service coverage and preserve transaction boundaries.
- [x] Runtime service-level cross-school verification — passed with two isolated school fixtures; full HTTP role matrix remains outside this harness.

## Consolidated soft-delete and Finance V0 verification — 2026-10-11

- [x] Inspected the reporting harness and confirmed its pre-connection target guard is restricted to `127.0.0.1:55432/ryo_qa`.
- [x] Backend unit suite — 14 suites / 71 tests passed after sequential Prisma generation.
- [x] Backend build — exited 0.
- [x] Frontend tests — 10 files / 115 tests passed.
- [x] Frontend production build — exited 0; chunk-size warning only.
- [x] Prisma validation, client generation, and backend/frontend `git diff --check` passed.
- [ ] Fresh reporting/soft-delete database rerun — BLOCKED before fixture access by sandbox `tsx` IPC `EPERM` and inability to start PostgreSQL on port 55432 in this execution context.
- [ ] Attendance and fee-history preservation fixtures — remain unverified.
- [ ] Full HTTP/JWT role matrix and browser journeys — remain unverified.

## HTTP/JWT authorization QA — 2026-10-11

- [x] Inspect actual JWT guard, permission guard, seeded roles, permissions, and route decorators.
- [x] Confirm destructive controller methods use trusted `request.user.userId`.
- [ ] Missing/invalid-token HTTP requests — BLOCKED; application runtime requires unavailable isolated PostgreSQL.
- [ ] Authorized/unauthorized role HTTP requests — BLOCKED for the same reason.
- [ ] Cross-school HTTP mutation and independent database assertions — BLOCKED; no fixture writes were attempted.
- [ ] Browser journeys — NOT RUN by task scope and unavailable runtime.

## HTTP/JWT runtime unblock — 2026-10-11

- [x] Diagnose PostgreSQL startup failure as sandbox localhost socket permission, not port collision.
- [x] Start isolated PostgreSQL with approved elevated local runtime permission.
- [x] Reproduce and fix JWT guard dependency defect causing malformed-token HTTP 500.
- [x] Run compiled-backend HTTP/JWT harness with two-school fixtures and scoped cleanup — `HTTP_JWT_QA_PASS`.
- [x] Verify backend unit suite, build, and diff check after the fix.
- [ ] Full valid-domain HTTP mutation matrix for academic-year, staff, subject, and fee payment — remaining fixture-dependent coverage.
