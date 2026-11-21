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
| Fees                 | Implemented (V1, BE-ND2 & Incremental Fee Sync Complete) | Real API-backed (Fee structures, components, payments, reversals, concessions, schedules, manual sync & drift alerts) | Timetable remains mocked                                | Ready for V0 browser QA                      |
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

### Milestone 8 — Incremental Fee Synchronization (Tasks 1–4.4)

Status: Complete

#### Scope
Full-stack implementation of incremental fee synchronization: master structure upward-only mutation restrictions, shared pre-payment eligibility validation gates, atomic administrator synchronization pipeline, and frontend synchronization & payment drift handling.

#### Tasks Completed
- **Task 1: Master Mutation Restrictions:** Upward-only price adjustments on consumed fee structures (`COMPONENT_AMOUNT_DECREASE_PROHIBITED_ON_CONSUMED_STRUCTURE`, `DISCOUNT_APPLICABILITY_INCREASE_PROHIBITED`, `COMPONENT_DEACTIVATION_REDUCES_ADMISSION_OBLIGATION`). Master mutations decoupled from admission snapshots.
- **Task 2: Shared Pre-Payment Validation Gate:** `assertAdmissionFeeDetailsCurrent` in `AdmissionPaymentService` and `StudentService`. Rejects stale snapshots with HTTP 409 `ADMISSION_FEE_DETAILS_OUTDATED` under Level 2 serializing transaction locks before payment writes.
- **Task 3: Synchronization Execution & Admin API:** `POST /fee-structure/:id/sync` endpoint in `FeeStructureSyncController` and pipeline in `FeeStructureSyncService`. Reconciles applicable `DRAFT` and `CONFIRMED` admissions (`CANCELLED` excluded). Updates in-place details, recomputes concessions (`recomputeV0`), checks negative due (`NEGATIVE_DUE_PROHIBITED`), increments un-split pending roots (Case A), or generates supplementary root installments and `InstallmentLineageEvent` records (`LineageEventType.FEE_REVISION`). 5-level lock hierarchy guarantees single-writer concurrency.
- **Task 4.1: Frontend API Client & Hook:** `feesApi.syncStructure()` and `useSyncFeeStructure()` mutation hook in `ryo-academy-fe/src/lib/fees-api.ts`.
- **Task 4.2: Fee Structure Master Synchronization UI:** `FeeStructureSyncDialog` in `ryo-academy-fe/src/pages/fee-structure-sync-dialog.tsx` and "Synchronize Admissions" action in `RealFeeDetail` (`fee-pages.tsx`), restricted to `FEES_UPDATE`.
- **Task 4.3: Admission Payment Drift Gate Integration:** `CollectAdmissionPaymentDialog` in `admission-payment-components.tsx` intercepts `ADMISSION_FEE_DETAILS_OUTDATED`, disables submission, preserves allocation inputs, and exposes "Refresh Fee Data" refetch recovery.
- **Task 4.4: Student Inline Payment Drift Gate Integration:** `RealStudentDetail` in `admissions-students-pages.tsx` intercepts `ADMISSION_FEE_DETAILS_OUTDATED`, displays amber alert banner with administrator guidance, preserves payment amount and date, disables payment recording, and provides refetch recovery.

#### Backend Endpoints
- `POST /fee-structure/:id/sync`:
  - Request DTO: `SyncFeeStructureDto` (`supplementaryDueDate?: string`)
  - Response DTO: `FeeStructureSyncExecutionResult` (`feeStructureId`, `synchronizedAt`, `eligibleAdmissionCount`, `synchronizedAdmissionCount`, `admissionsWithScheduleCount`, `admissionsWithoutScheduleCount`, `caseAIncreasesCount`, `supplementaryRootsCreatedCount`, `detailsInsertedCount`, `detailsUpdatedCount`)
  - Authorization: `FEES_UPDATE` (`PermissionsGuard`) and tenant school matching.

#### Error Codes & Invariants
- `ADMISSION_FEE_DETAILS_OUTDATED`: Stale fee snapshot detected prior to payment.
- `NEGATIVE_DUE_PROHIBITED`: Thrown if total fee net amount is less than total paid amount. Clamping or synthetic credit prohibited.
- `ACADEMIC_YEAR_ENDED_SUPPLEMENTARY_DATE_REQUIRED`: Supplementary due date required if academic year has ended.
- `COMPONENT_AMOUNT_DECREASE_PROHIBITED_ON_CONSUMED_STRUCTURE`: Component decreases prohibited.
- `DISCOUNT_APPLICABILITY_INCREASE_PROHIBITED`: Expansion of discount applicability on consumed structures prohibited.
- `COMPONENT_DEACTIVATION_REDUCES_ADMISSION_OBLIGATION`: Deactivation of components with attributable unpaid admission balances prohibited.

#### Known Outstanding QA Fixture Findings
1. `test/fee-structure-sync-stage3.integration.ts`: References obsolete `createComponentWithSyncPlan` draft API; scheduled for authorized QA maintenance to use decoupled `executeSynchronization`.
2. `test/fifo-payment-allocation.integration.ts`: Historical test fixture seeds inconsistent `discountApplicable: false` on detail snapshot while master is `true`. The pre-payment gate functions correctly and rejects; fixture data will be aligned in a future authorized QA task.
3. `src/pages/__tests__/admission-fee-preview.test.tsx`: Pre-existing test failure associated with uncommitted edit in `admissions-students-pages.tsx:2132` and missing `QueryClientProvider` wrapper in legacy test harness.

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
