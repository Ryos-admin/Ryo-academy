# Ryo Academy Module Integration Tracker

This document tracks backend readiness and frontend real-API migration progress. It is documentation only; it does not change application behavior.

## Overall Status

| Module | Backend status | Frontend status | Mock usage | Next action |
|---|---|---|---|---|
| Authentication | Implemented | Integrated | Demo auth removed from login flow | Improve roles/permissions contract |
| Academic Years | Implemented | Real API-backed | Unrelated consumers may still use mocks | Verify permissions and edge cases |
| Programs | Implemented | Real API-backed | Unrelated consumers may still use mocks | Verify live integration |
| Classes | Implemented | Real API-backed | Unrelated consumers may still use mocks | Verify live integration |
| Sections | Implemented | Real API-backed | Attendance and other unmigrated consumers remain mocked | Verify live integration |
| Subjects | Implemented | Real API-backed | Teaching Assignments and Timetable remain mocked | Add dedicated frontend permissions |
| Staff | Implemented/semi-finished | Mock or partial | Yes | Frontend migration and contract verification |
| Teaching Assignments | Implemented | Mock-backed | Yes | Frontend migration |
| Admissions | Implemented | Mock-backed | Yes | Frontend migration |
| Students | Partial backend capability | Mock-backed | Yes | Confirm student API scope |
| Academic Calendar | Implemented | Not migrated | Yes | Frontend migration |
| Attendance | Implemented | Mock-backed | Yes | Frontend migration and live validation |
| Fees | Partial/implemented | Mock-backed | Yes | Verify backend contract, then migrate |
| Timetable | Not fully available | Mock-backed | Yes | Keep mock until backend is ready |
| Dashboard | Aggregated frontend view | Mock-backed | Yes | Migrate only after source modules are real |

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
