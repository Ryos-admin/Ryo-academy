# QA Environment Prerequisites

Status: **ISOLATED LOCAL QA DATABASE VERIFIED / MIGRATION APPLIED LOCALLY**

This document records the verified requirements for resuming authenticated, tenant-isolation, CRUD, and browser QA. It does not contain credentials or connection strings.

## Current environment finding

The checked-in development environment points to a remote Neon PostgreSQL service. It is not identified as disposable QA infrastructure. No migrations, seeds, writes, resets, or cleanup operations may be run against it for audit testing.

Docker is installed, but the Docker daemon is unavailable in the current workspace. No Compose file was found. Local PostgreSQL server tools are available.

On 2026-10-10, a disposable PostgreSQL instance was initialized under `/tmp`, listened on local port `55432`, accepted local identity and schema checks, received the Prisma migration set, and was stopped cleanly. The temporary data directory is not part of the repository and was not used for Neon or any remote database.

## Required environment owner input

Provide one of the following through the approved secret/environment mechanism:

1. An explicitly isolated, disposable PostgreSQL QA database; or
2. An approved isolated PostgreSQL provisioning method with no production/shared-data access.

The owner must confirm that test writes, migrations, seed upserts, and cleanup are safe for that database. Do not send credentials in chat.

## Verified configuration names

Backend `.env` names currently used by the application include:

- `NODE_ENV`
- `PORT`
- `API_PREFIX`
- `API_VERSION`
- `CORS_ORIGINS`
- `DATABASE_URL`
- `DIRECT_DATABASE_URL`
- `JWT_ACCESS_SECRET`
- `JWT_ACCESS_EXPIRES_IN`
- `JWT_ISSUER`
- `JWT_AUDIENCE`

The Prisma datasource uses `DATABASE_URL`. The RBAC seed prefers `DIRECT_DATABASE_URL` and falls back to `DATABASE_URL`.

## Database setup commands

These commands are verified from the repository documentation/scripts but are **DATA-MODIFYING** and must only be run after the isolated QA database is confirmed:

```text
npx prisma generate
npx prisma migrate deploy
npm run db:seed
```

`npx prisma migrate dev` is documented for local schema development and must not be run against the existing remote database.

No safe reset or purge command is established in the repository. Do not use `prisma migrate reset`, `TRUNCATE`, arbitrary SQL writes, or destructive cleanup for this audit.

### Disposable local PostgreSQL option

The following pattern was verified without contacting Neon. Use a fresh temporary directory for each session and keep the directory path private:

```text
qa_dir=$(mktemp -d /tmp/ryo-qa-pg-XXXXXX)
initdb -D "$qa_dir" -U ryo_qa_owner --auth=trust
pg_ctl -D "$qa_dir" -o "-p 55432 -k $qa_dir" -l "$qa_dir/server.log" start
pg_isready -h "$qa_dir" -p 55432 -U ryo_qa_owner
psql "postgresql://ryo_qa_owner@127.0.0.1:55432/postgres"
pg_ctl -D "$qa_dir" -m fast stop
```

Configure a separate shell-only QA environment with `DATABASE_URL` and `DIRECT_DATABASE_URL` pointing to this local instance before any Prisma command. Do not overwrite `.env`; do not commit local credentials/configuration. Migration application and catalog verification were completed against the disposable local instance; seeds remain a separate, owner-approved step.

The local database was also used for the scoped soft-delete integration harness. The harness created two clearly named QA schools and dependent records, verified service behavior, and removed only its test-owned records before PostgreSQL was stopped. It did not load the normal `.env`.

## Backend startup and health check

Verified scripts:

```text
npm run start:dev
npm run build
npm run start:prod
```

Current checked-in environment values are `PORT=8001`, `API_PREFIX=api/`, and `API_VERSION=v0`, producing the health/example route:

```text
GET /api/v0
```

The application listens on the value of `PORT`; a temporary override such as `PORT=7676` is supported by the code. Backend readiness also requires a successful PostgreSQL connection during module initialization.

## Frontend startup

Verified scripts:

```text
pnpm run dev
pnpm run build
pnpm run serve
```

The Vite script defaults to the project configuration/environment. Do not assume port 5173, 4173, or 8001; inspect the startup output and `vite.config.ts` for the effective port. `VITE_API_BASE_URL` must target the running backend API prefix.

## Authentication and fixture prerequisites

`POST /auth/login` is public. Protected requests use JWT authentication and server-side role/permission data. The checked-in RBAC seed defines:

- `COLLEGE_ADMIN`
- `OFFICE_ADMIN`
- `STAFF`

Before runtime QA, the environment owner must provide or approve a repeatable fixture flow that creates/identifies users for these roles without exposing passwords. If the schema supports multiple schools, the fixture flow must also establish two distinct test schools and users without changing existing ownership.

The fixture flow must be idempotent, clearly label test data, and include owner-approved cleanup instructions. No such safe flow is currently established in this checkout.

## QA execution plan after prerequisites are met

The following tests are prepared conceptually but remain **PREPARED / NOT EXECUTED**:

- Missing/invalid JWT and public login checks.
- Role permission matrix for the three seeded roles.
- Mismatched `X-User-Id` and `X-School-Id` checks.
- Same-school and cross-school reads, updates, deletes, and references.
- CRUD persistence and relationship checks for implemented modules.
- Academic calendar generation and date-update checks where supported.
- Attendance persistence checks.
- Non-financial fee fixture consistency checks.
- Browser login, navigation, permissions, validation, mutation, refresh, and logout journeys.

## Resume condition

Runtime QA may resume only after all of the following are true:

1. A PostgreSQL database is explicitly confirmed isolated and disposable/test-only.
2. Its connection is configured directly by the environment owner without sharing secrets in chat.
3. Migrations and RBAC/domain fixtures are approved for that target.
4. Test-user and two-school fixture setup/cleanup are defined.
5. Backend and frontend startup outputs show stable, non-conflicting ports.

Until then, role runtime tests, tenant isolation, CRUD persistence, and browser QA remain blocked.

## 2026-10-11 consolidated verification attempt

- The reporting harness was verified to target only `127.0.0.1:55432/ryo_qa` before connecting.
- `npx tsx test/financial-log.integration.ts` was blocked by sandbox IPC `EPERM` on `/tmp/tsx-1000/...pipe`.
- `node --import tsx/esm test/financial-log.integration.ts` was also blocked because PostgreSQL could not start on the local QA port in this execution context; no fixture write occurred.
- No normal `.env` was loaded, no reset/truncate was run, and Neon was not contacted.

## 2026-10-11 HTTP/JWT authorization QA

- Static route inspection completed for `DELETE /academic-years/:id`, `PATCH /staff/:id/status`, `DELETE /subjects/:id`, `POST /students/:id/fees/payments`, `POST /expenses`, `DELETE /expenses/:id`, and `GET /financial-logs`.
- Each inspected route is protected by `JwtAuthGuard` and `PermissionsGuard`; destructive handlers use the authenticated JWT `userId`.
- Real HTTP execution remains BLOCKED because the isolated PostgreSQL runtime could not be started on port `55432`; application startup requires a database connection.

## 2026-10-11 HTTP/JWT runtime unblocked

- Root cause reproduced: sandboxed PostgreSQL startup could not create IPv4/IPv6 localhost sockets and logged `Operation not permitted`; this was not a port collision. Elevated local runtime permission allowed the documented disposable instance to start on `127.0.0.1:55432`.
- A first real HTTP run also reproduced a production DI defect: malformed-token requests reached `JwtAuthGuard` with an undefined `ConfigService` and returned HTTP 500 instead of HTTP 401.
- The smallest fix registered the guard through the shared token module and affected modules, and supplied safe constructor defaults for direct route-metadata construction. The compiled application path was then used for verification.
- `test/http-jwt-qa.integration.ts` ran against a separate `DATABASE_URL` targeting only `127.0.0.1:55432/ryo_qa`, created scoped two-school fixtures, and cleaned them in `finally`. The backend server and PostgreSQL instance were stopped cleanly.
