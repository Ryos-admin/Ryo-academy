# Ryo Academy Module Integration Tracker

This document tracks backend readiness and frontend real-API migration progress. It is documentation only; it does not change application behavior.

## Overall Status

| Module               | Backend status                                        | Frontend status                                                                                                                                              | Mock usage                                              | Next action                                  |
| -------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- | -------------------------------------------- |
| Authentication       | Implemented                                           | Integrated                                                                                                                                                   | Demo auth removed from login flow                       | Improve roles/permissions contract           |
| Academic Years       | Implemented                                           | Real API-backed                                                                                                                                              | Unrelated consumers may still use mocks                 | Verify permissions and edge cases            |
| Programs             | Implemented                                           | Real API-backed                                                                                                                                              | Unrelated consumers may still use mocks                 | Verify live integration                      |
| Classes              | Implemented                                           | Real API-backed                                                                                                                                              | Unrelated consumers may still use mocks                 | Verify live integration                      |
| Sections             | Implemented                                           | Real API-backed                                                                                                                                              | Attendance and other unmigrated consumers remain mocked | Verify live integration                      |
| Subjects             | Implemented                                           | Real API-backed                                                                                                                                              | Teaching Assignments and Timetable remain mocked        | Add dedicated frontend permissions           |
| Staff                | Implemented/semi-finished                             | Mock or partial                                                                                                                                              | Yes                                                     | Frontend migration and contract verification |
| Teaching Assignments | Implemented                                           | Mock-backed                                                                                                                                                  | Yes                                                     | Frontend migration                           |
| Admissions           | Implemented (BE-ND1/ND2 & Fee Concession V1 Complete) | API-integrated (Create, edit fee selection & concessions, confirm, cancel, fee preview, admission payments real; Details read-only; Dashboard status-sorted) | Timetable remains mocked                                | V0 browser QA                                |
| Students             | Partial backend capability                            | Partially API-integrated (Fee views & payments real; student profile partial)                                                                                | Yes                                                     | Confirm full student profile scope           |
| Academic Calendar    | Implemented                                           | Not migrated                                                                                                                                                 | Yes                                                     | Frontend migration                           |
| Attendance           | Implemented                                           | Mock-backed                                                                                                                                                  | Yes                                                     | Frontend migration and live validation       |
| Fees                 | Implemented (V1 & BE-ND2 Complete)                    | Real API-backed (Fee structures, components, payments, reversals, concessions, schedules)                                                                    | Timetable remains mocked                                | Ready for V0 browser QA                      |
| Timetable            | Not fully available                                   | Mock-backed                                                                                                                                                  | Yes                                                     | Keep mock until V0 browser QA sign-off       |
| Dashboard            | Aggregated frontend view                              | Mock-backed                                                                                                                                                  | Yes                                                     | Migrate only after source modules are real   |

## Completed Frontend Milestones

### Milestone 1 — API Foundation

- Centralized fetch-based API client
- Configurable `VITE_API_BASE_URL`
- Bearer-token support
- Normalized `ApiError`
- React Query compatibility

### Milestone 2 — Authentication

- Real login/session integration
- Access-token storage and reuse
- Current-user integration

Known limitation: `/auth/me` currently exposes only the user ID, so frontend roles and permissions are not authoritative.

### Milestone 3 — Academic Years

- List, detail, create, and update use the backend API
- Academic-year validation and error handling integrated

### Milestone 4 — Programs

- List, detail, create, and update use the backend API
- Academic-year relationship resolved through real Academic Years data
- Backend weekday and `isPrimary` fields mapped to frontend values
- Academic year remains immutable during editing

### Milestone 5 — Classes

- List, detail, create, and update use the backend API
- Program relationship resolved through real Programs data
- Program remains immutable during editing
- No delete behavior added

### Milestone 6 — Sections

- List, detail, create, and update use the backend API
- Class relationship resolved through real Classes data
- Class section counts/details use real Section reads
- Class remains immutable during editing
- No delete behavior added

### Milestone 7 — Subjects

- Class-scoped list through `GET /classes/:classId/subjects`
- Detail through `GET /subjects/:id`
- Create, update, and soft-delete integrated
- Class resolved through real Classes data
- Class remains immutable during editing
- Delete confirmation warns about permanent Teaching Assignment removal

## Module Tracking Template

Use this template for each future module:

### `<Module Name>`

- Status:
- Current backend files:
- Current frontend files:
- Backend endpoints:
- Required permissions:
- Request DTOs:
- Response shape:
- Validation/business rules:
- Frontend routes/screens:
- React Query keys:
- Mock data source:
- Mock consumers that must remain unchanged:
- Backend work remaining:
- Frontend work remaining:
- Migration risks:
- Verification commands/results:
- Next task:

## Backend Readiness Checklist

- [ ] Controller routes verified
- [ ] Authentication guard verified
- [ ] Permission identifiers verified
- [ ] DTO validation verified
- [ ] Service business rules verified
- [ ] Response shape verified
- [ ] Error statuses/messages verified
- [ ] Relations and immutable fields verified
- [ ] Soft-delete behavior verified
- [ ] Migration/schema status verified
- [ ] Tests or build completed

## Frontend Integration Checklist

- [ ] Existing routes and screens audited
- [ ] Dedicated API module added
- [ ] Existing API client reused
- [ ] Existing session/token mechanism reused
- [ ] Request types added
- [ ] Response mapping added
- [ ] React Query keys isolated
- [ ] Loading state handled
- [ ] Empty state handled
- [ ] Not-found state handled
- [ ] API errors handled
- [ ] Permissions mapped without replacing backend authorization
- [ ] Mock consumers intentionally preserved
- [ ] Create/update/delete behavior verified
- [ ] Build and typecheck run
- [ ] No unrelated files changed

## Current Priority Queue

1. Resolve the frontend permission contract so backend permissions such as `subject:read` can be represented accurately.
2. Migrate Staff and verify current-user/staff response relationships.
3. Migrate Teaching Assignments after Staff, Subjects, Classes, and Sections are available in real frontend queries.
4. Migrate Academic Calendar.
5. Migrate Admissions and confirm its placement relationships.
6. Migrate Student workflows after the backend Student API is confirmed.
7. Migrate Attendance after all placement and authorization dependencies are real.
8. Verify and migrate Fees.
9. Keep Timetable mocked until its backend contract exists.
10. Rebuild Dashboard data only after its source modules are integrated.

## Important Boundaries

- Do not modify `src/lib/mock-erp.ts` during individual feature migrations.
- Do not migrate unrelated consumers merely because they reference a migrated domain type.
- Do not create real/mock synchronization layers.
- Backend authorization remains authoritative.
- Do not assume an endpoint exists from a filename; verify the controller and service.
- Keep each migration focused, reviewable, and independently verifiable.

## Need to exec later in Prod

```
-- Failed query:
BEGIN;

-- 1. Ensure the permission exists.
INSERT INTO "Permission" (
    "id",
    "name",
    "description",
    "createdAt",
    "updatedAt",
    "isActive"
)
VALUES (
    gen_random_uuid(),
    'school:update',
    'Update school configuration',
    NOW(),
    NOW(),
    TRUE
)
ON CONFLICT ("name") DO NOTHING;


-- SELECT r.*
-- FROM "Role" r
-- WHERE r."name" = 'COLLEGE_ADMIN';
--
-- -- 2. Create the mapping for COLLEGE_ADMIN.
INSERT INTO "RolePermission" (
    "roleId",
    "permissionId"
)
SELECT
    r."id",
    p."id"
FROM "Role" r
CROSS JOIN "Permission" p
WHERE r."name" = 'COLLEGE_ADMIN'
  AND p."name" = 'school:update'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

COMMIT;
-- Text to SQL original prompt:
-- fix this query
--
-- SELECT r.*
-- FROM "Role" r
-- WHERE r."name" = 'COLLEGE_ADMIN';
-- SELECT r.*
-- FROM "Role" r
-- WHERE r."name" = 'COLLEGE_ADMIN';
-- The query looks syntactically correct as-is.
-- If it returns no results, the role name may differ in the database.
-- Checking all available roles to help identify the correct name:
-- SELECT r.*
-- FROM "Role" r
-- WHERE r."name" ILIKE '%admin%';
```
