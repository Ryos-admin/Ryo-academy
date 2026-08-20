## M1.3.7 – Authenticated User Context

**Status:** Completed  
**Objective:** Provide a strongly‑typed way to access the authenticated user after JwtAuthGuard verification.

**Implementation Summary**
- Added `AuthenticatedUser` interface (`userId: string`).
- Created `@CurrentUser()` parameter decorator to return `request.user`.
- Augmented Express `Request` type with optional `user?: AuthenticatedUser`.
- Updated `AuthController` with `GET /auth/me` protected by `JwtAuthGuard` returning the `AuthenticatedUser`.
- Fixed `ProtectedModule` imports to provide `JwtService` and `AccessTokenModule` for guard dependency resolution.
- Adjusted imports to use `import type` where required.

**Files Created**
- `src/common/types/authenticated-user.type.ts`
- `src/common/decorators/current-user.decorator.ts`
- `src/common/types/express.d.ts`

**Files Modified**
- `src/auth/auth.controller.ts`
- `src/protected/protected.module.ts`

**Important Architectural Decisions**
- Separation of concerns: guard only validates token, decorator only retrieves already‑validated payload.
- Global request augmentation for compile‑time safety.
- Minimal exposure of user data (`userId` only) to keep downstream services explicit about data fetching.

**Security Considerations**
- No secrets or password hashes are exposed.
- Guard ensures only verified JWTs populate `request.user`; decorator does not perform any verification.
- Generic error messages prevent leaking JWT internals.

**Validation Commands Executed**
- `npm run build` → succeeded.
- `npx prisma validate` → succeeded.
- `git diff --check` → no issues.

**Runtime Verification Performed**
- Started Nest dev server (`npm run start:dev`).
- Performed `POST /auth/register` and `POST /auth/login` to obtain a JWT.
- Accessed `GET /auth/me` with a valid token – returned `{ "userId": "<id>" }`.
- Requests without token or with invalid/expired tokens returned `401 Unauthorized`.

**Database/Schema/Migration Impact**
- None. No changes to Prisma schema, migrations, or seed data.

**Known Issues / Limitations**
- Any module that uses `JwtAuthGuard` must import `JwtModule.register({})` and `AccessTokenModule` (as done for `ProtectedModule`). Future modules need to follow this pattern.
- The `AuthenticatedUser` interface currently contains only `userId`; extending it requires updating the guard payload and decorator return type.

**Out‑of‑Scope Changes Confirmed Not Made**
- No database schema modifications.
- No RBAC or role/permission logic added.
- No additional protected endpoints beyond `/auth/me` and the test `/protected/me`.
- No changes to registration, login, password handling, or JWT issuance.

**Recommended Next Milestone**
- **M1.3.8 – Authorization / RBAC Integration** – Define roles, permissions, and guard mechanisms to enforce access control based on user identity.

## M1.3.8 — RBAC Authorization Foundation

**Status:** Completed
**Objective:** Establish a reusable permission‑based authorization infrastructure leveraging existing RBAC data.

**Implementation Summary**
- Added `RequirePermissions` decorator to attach required permission metadata.
- Implemented `PermissionsGuard` that validates JWT‑authenticated user against required permissions using server‑side RBAC.
- Created `AuthorizationService` to query a user's granted permission names via role‑permission relationships, selecting only permission names.
- Provided `AuthorizationService` and `PermissionsGuard` in `ProtectedModule`.
- Added a demonstration endpoint `GET /protected/students` protected by `JwtAuthGuard` and `PermissionsGuard` requiring `student:read` permission.
- No changes to JWT authentication, database schema, or seed data.

**Files Created**
- `src/auth/authorization.service.ts`
- `src/auth/require-permissions.decorator.ts`
- `src/auth/permissions.guard.ts`

**Files Modified**
- `src/protected/protected.controller.ts`
- `src/protected/protected.module.ts`
- `docs/agent-log.md` (appended entry)

**Authorization Architecture**
- JWT token → `JwtAuthGuard` validates and sets `request.user = { userId }`.
- `PermissionsGuard` reads `request.user.userId`, retrieves permission names via `AuthorizationService` (query: user → roles → rolePermissions → permission.name).
- Guard enforces that all permissions declared via `@RequirePermissions` are present; otherwise throws generic `ForbiddenException` (403).
- Absence of permission metadata results in allow‑all (no authorization check).

**Permission Semantics**
- `@RequirePermissions(...perms)` declares required permission strings.
- Guard requires **ALL** listed permissions to be granted to the user.
- If no metadata, guard permits the request (no authorization required).

**Security Considerations**
- Authentication and authorization are separate; guard does not perform JWT verification.
- Fail‑closed: missing `request.user` yields 401; missing permissions yields generic 403 without revealing details.
- No client‑supplied role/permission data is trusted; all checks rely on server‑side RBAC tables.
- Queries limited to permission names; no sensitive fields (passwordHash, timestamps) are fetched.

**Validation Commands Executed**
- `npm run build` → succeeded.
- `npx prisma validate` → succeeded.
- `git diff --check` → no whitespace or diff issues.

**Runtime Verification**
- Verified `GET /protected/me` returns userId with valid JWT (401 otherwise).
- Verified `GET /protected/students` with a JWT belonging to a user seeded with `student:read` permission returns 200 and static response.
- Verified same endpoint with a user lacking `student:read` returns 403.
- Verified endpoint without JWT returns 401.

**Database Impact**
- Schema unchanged.
- No migrations created.
- Seed data unchanged.
- No records modified.

**Known Issues / Limitations**
- Permissions are hard‑coded strings; a dedicated constant export could be added for compile‑time safety.
- Guard currently throws generic `ForbiddenException` without custom message; can be refined later.
- Demonstration endpoint is minimal; real controllers should import the guard and decorator similarly.

**Out‑of‑Scope Changes Confirmed**
- No alterations to authentication flow, user registration, password handling, or JWT issuance.
- No business‑logic CRUD implementations added.
- No changes to existing modules beyond providing the new guard and service.

**Recommended Next Milestone**
- Implement controller‑level RBAC matrix for actual domain resources (students, admissions, etc.) and write comprehensive integration tests for permission scenarios.

**M1.3.9 — Authorization Integration & RBAC Matrix**

Prisma 7.9.1 → @prisma/config 7.9.1 → deepmerge-ts 7.1.5

npm audit reports a high-severity advisory against deepmerge-ts.
npm's suggested --force remediation would downgrade Prisma to 6.12.0.
No forced remediation applied.
Prisma remains pinned at 7.9.1.

- student:read → 3/3 passed
- student:create → 3/3 passed
- student:update → 3/3 passed
- student:read + student:update → 3/3 passed
- missing JWT → 401
- invalid JWT → 401
- npm run build → passed
- npx prisma validate → passed
- git diff --check → passed
- Prisma deepmerge-ts audit warning remains unresolved because the suggested --force fix would downgrade Prisma 7.9.1 to 6.12.0
- no schema/migration changes

🟢 *COMPLETE*

**M1.3.10 — Authentication & Authorization Hardening**

M1.3.10
│
├── 1. Configuration hardening
│   ├── JWT secret validation
│   ├── JWT expiry validation
│   └── issuer/audience validation
│
├── 2. Authentication consistency
│   ├── generic credential failures
│   └── consistent 401 handling
│
├── 3. Authorization consistency
│   ├── consistent 401 vs 403
│   └── fail closed
│
├── 4. Request/security hygiene
│   └── review sensitive data exposure
│
├── 5. Logging
│   └── don't log passwords/tokens
│
└── 6. Agent log
    └── document decisions + verification

*Status*: Complete

- Hardened JWT configuration validation in JwtAuthGuard.
- Rejects verified JWTs without a valid string sub.
- Typed JwtAuthGuard request as Express Request.
- Reviewed authentication/token/password logging.
- No sensitive credential logging found.
- Preserved generic authentication failures.
- No database/schema/migration changes.
- No new authentication features introduced.

*Validation:*
- npm run build → passed
- npx prisma validate → passed
- git diff --check → passed

*Known issue:*
- npm audit reports deepmerge-ts 7.1.5 through Prisma 7.9.1.
- npm's forced remediation would downgrade Prisma to 6.12.0.
- No forced downgrade or dependency override applied.

M1.4
 │
 ├── 1. Student domain requirements
 ├── 2. Identify entities & relationships
 ├── 3. Define invariants/business rules
 ├── 4. Decide User ↔ Student relationship
 ├── 5. Design persistence model
 ├── 6. Prisma schema
 ├── 7. Migration
 ├── 8. Repository
 ├── 9. Service
 ├── 10. DTOs
 ├── 11. Controller
 ├── 12. RBAC integration
 └── 13. Integration verification

## M1.4.2 status

Prisma schema: ✅
Relationships: ✅
Indexes/uniques: ✅
Migration: ✅
Prisma validation: already confirmed earlier ✅

So I'd call M1.4.2 complete.



