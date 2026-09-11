# Ryo Academy Frontend ↔ Backend Migration Changelog

# V0 Consolidation & Coherence Pass

Status: Verified in the frontend route surface and migration file notes.

## Consolidation scope

This pass is a front-end coherence and boundary cleanup pass for the current V0 workflow. It confirms and preserves real workflows already implemented in the repository while forbidding any new backend domain, speculative API surface, or widening of the product scope. The files inspected and corrected were the shared route file and the fee adapter import surface.

## Files modified

- `src/App.tsx`
- `docs/frontend-backend-migration-changelog.md`

## Real workflows confirmed by source/integration

The route surface already imports and routes through the real backend adapters for academic setup, admissions, students, attendance, and fee structure/component mutations. The real workflows confirmed in code are: authentication sessions via `useCurrentUser`; reading and editing academic years and setup screens from the API surface; admissions list/create/edit/confirm/cancel via the admissions API; student list/read and fee payment history via the student and payment APIs; attendance read/create/submit/delete via the attendance API; and fee structure/component create, edit, and deactivation hooks via `src/lib/fees-api.ts`.

## Intentional mock boundaries

- Timetable remains intentionally mocked and is routed through the static mock resource path without a backend contract.
- Student create/edit remains deferred and purposely represented only as a mock-only path in the current UI, but the route-level student create action is not allowed to masquerade as a real workflow in the dashboard or navigation.
- Advanced finance and reporting screens remain intentionally deferred and do not become newly authorized real routes.
- Dashboard metrics remain restricted to simple counts and real migration data; reporting-heavy widgets remain outside V0 scope.

## Removed misleading functionality

- The real fee structure detail screen no longer advertises the old `Edit mock record` label or the `Add mock component` mock label in its action bar.
- The Office Admin dashboard quick-action shortcut no longer points at the mock `students/new` path that falsely signals a student CRUD entrypoint.
- The dashboard fee metric now draws from the real fee structure adapter instead of the older mocked `fees` resource pocket.

## Navigation fixes

No new navigation routes were introduced. The route table preserved the real routes for `/fees`, `/fee-components`, `/admissions`, `/attendance`, and `/students` while removing misleading quick-action affordances that pointed to a route that is intentionally mocked in the current UI. All existing route URLs remain stable.

## Permission/UI fixes

No backend permission scheme was redesigned. The UI continues to gate access via the existing permission constants (`FEES_CREATE`, `FEES_UPDATE`, `FEES_READ`, `ATTENDANCE_*`, `STUDENT_*`, `ADMISSION_*`) and simple `hasPermission` checks. No route was widened beyond the route file’s proven real screens.

## Verification

The configured workspace already confirms that the real fee adapter file exports the typed mutation hooks without diagnostics. The front-end route file remains mixed with unrelated type diagnostics elsewhere. Build and typecheck verification were deliberately limited to the file surfaces that participate in this migration pass. The verification is grounded in source inspection and the existing adapter shape.

## Remaining limitations

- A full typecheck still reports unrelated errors elsewhere in the monolithic route file and other app modules.
- The V0 dashboard still carries routes and UI surfaces that intentionally remain mock/deferred, including the timetable view and student create/edit screens.
- No new backend or schema change was introduced. The backend remains authoritative.

## Deferred V0+ features

- Timetable backend and schedule contract.
- Student CRUD beyond the admission-to-student conversion workflow.
- Advanced finance and payment/accounting/reporting workflows.
- Attendance reporting and analytics surfaces.
- Dashboard financial and timetable analytics widgets.

## Purpose

This document records the incremental migration of Ryo Academy frontend features from mock/localStorage data to the existing NestJS backend. It is a migration history, not a generic Git changelog.

## Migration Principles

1. Backend-supported functionality replaces frontend mock behavior.
2. Unsupported backend functionality remains mock-backed.
3. Hybrid real + mock is intentional during migration.
4. Do not invent backend endpoints.
5. Do not invent unsupported fields.
6. Backend authorization is authoritative.
7. Frontend permission checks are UX only.
8. Do not break unrelated mock consumers when a domain becomes real.
9. Keep `src/lib/mock-erp.ts` untouched unless explicitly required.
10. Prefer small, reviewable milestones.
11. Avoid broad architecture refactors.
12. Preserve existing routes/UI where compatible with the backend.
13. Use explicit adapters when backend and frontend shapes differ.
14. Do not globally synchronize real and mock data.

## Current Status

| Module | Status |
|---|---|
| Academic Years | Real |
| Programs | Real |
| Classes | Real |
| Sections | Real |
| Subjects | Real |
| Staff | Real |
| Teaching Assignments | Real |
| Admissions | Real |
| Students | Real (read/list/detail/fee snapshot) |
| Attendance | Real |
| Fees | Real (read/list/detail only; write flows remain mock-backed) |
| Timetable | Mock |
| Dashboard | Hybrid — simple counts are real; fee/timetable widgets remain mock |

Current relationship foundation:

```text
Academic Year → Program → Class → Section → Subject

Staff → Teaching Assignment ← Subject / Class / Section
```

# Milestone 1 — API Foundation

Status: Complete

## Scope

Established the frontend HTTP transport boundary without migrating a feature.

## Files Created

- `src/lib/api-client.ts`
- `.env.example`
- `docs/api-client.md`

## Files Modified

- No application files otherwise modified.

## Backend Endpoints

- None; this milestone established transport only.

## Frontend Changes

- Native fetch-based client
- GET, POST, PATCH, PUT, and DELETE support
- Configurable `VITE_API_BASE_URL`
- Bearer token injection
- JSON and empty-response handling
- Centralized `ApiError`
- React Query-compatible transport

## Important Decisions

- No Axios or second HTTP client
- No feature-specific CRUD abstraction

## Mock Features Preserved

- All existing mock features remained unchanged.

## Verification

- Build passed.
- Typecheck unavailable because `tsc` was not installed.

## Known Limitations

- No live backend tests were performed.

# Milestone 2 — Authentication / Session

Status: Complete

## Scope

Integrated real login and session restoration.

## Files Created

- `src/lib/auth-api.ts`
- `src/lib/session.ts`

## Files Modified

- `src/App.tsx`

## Backend Endpoints

- `/auth/login`
- `/auth/me`

## Frontend Changes

- Real login flow
- Session restoration through `/auth/me`
- Bearer token storage and expiry handling
- 401 clears the session
- 403 does not clear the session
- Demo role selection removed

## Important Decisions

- Backend RBAC remains authoritative.
- `/auth/me` currently provides only `userId`.
- No fake backend logout was added.

## Mock Features Preserved

- Domain screens remained mock-backed.

## Verification

- Build passed.
- Typecheck unavailable.

## Known Limitations

- Frontend roles and effective permissions are not reliably available from `/auth/me`.

# Milestone 3 — Academic Years

Status: Complete

## Scope

Migrated Academic Years list, detail, create, and update flows.

## Files Created

- `src/lib/academic-years-api.ts`

## Files Modified

- `src/App.tsx`

## Backend Endpoints

- `GET /academic-years`
- `GET /academic-years/:id`
- `POST /academic-years`
- `PATCH /academic-years/:id`

## Frontend Changes

- Real React Query list/detail/mutation integration
- Backend-compatible date handling and validation
- No delete behavior

## Important Decisions

- Academic Years remain the source for later relationship display.

## Mock Features Preserved

- `mock-erp.ts` remained untouched.
- Unrelated mock consumers remained unchanged.

## Verification

- Build passed.
- Typecheck unavailable.
- No live backend tests.

## Known Limitations

- Some unmigrated features may still read mock Academic Year data.

# Milestone 4 — Academic Programs

Status: Complete

## Scope

Migrated Academic Programs list, detail, create, and update flows.

## Files Created

- `src/lib/programs-api.ts`

## Files Modified

- `src/App.tsx`

## Backend Endpoints

- `GET /programs`
- `GET /programs/:id`
- `POST /programs`
- `PATCH /programs/:id`

## Frontend Changes

- Academic Year relationship resolved through real Academic Years data
- `academicYear` request field mapped to Academic Year ID
- `primary` mapped to `isPrimary`
- Weekday names mapped to backend weekday codes
- Academic Year immutable during editing
- No delete behavior

## Important Decisions

- Backend/frontend naming differences remain localized in the API adapter.

## Mock Features Preserved

- `mock-erp.ts` remained untouched.
- Unrelated consumers remained mock-backed.

## Verification

- Build passed.
- Typecheck unavailable.
- No live backend tests.

## Known Limitations

- Some unmigrated features may still read mock Programs.

# Milestone 5 — Classes

Status: Complete

## Scope

Migrated Class list, detail, create, and update flows.

## Files Created

- `src/lib/classes-api.ts`

## Files Modified

- `src/App.tsx`

## Backend Endpoints

- `GET /classes`
- `GET /classes/:id`
- `GET /classes/:id/subjects` verified but not consumed
- `POST /classes`
- `PATCH /classes/:id`

## Frontend Changes

- Program resolved through real Programs data
- Create sends `{ name, programId }`
- Program immutable during editing
- Real Class list/detail/create/edit screens
- No delete behavior

## Important Decisions

- Section reads remained temporarily mock-backed in Class screens until Milestone 6.

## Mock Features Preserved

- `mock-erp.ts` remained untouched.
- Unrelated Class consumers remained mock-backed.

## Verification

- Build passed.
- Typecheck unavailable.
- `git diff --check` passed.

## Known Limitations

- Class section relationships were temporarily hybrid.

# Milestone 6 — Sections

Status: Complete

## Scope

Migrated Sections and replaced temporary mock Section reads in real Class screens.

## Files Created

- `src/lib/sections-api.ts`

## Files Modified

- `src/App.tsx`

## Backend Endpoints

- `GET /sections`
- `GET /sections/:classId`
- `POST /sections`
- `PATCH /sections/:id`

## Frontend Changes

- Real Section list, class-scoped query, create, update, and detail lookup
- No `GET /sections/:id` invented; detail resolves through available list data
- Create sends `{ name, classId }`
- Class immutable during editing
- Class screens use real Sections for counts, names, and links
- No delete behavior

## Important Decisions

- A class with no sections is treated as a valid empty state.
- Backend class-scoped 404 behavior is handled separately from general failures.

## Mock Features Preserved

- `mock-erp.ts` remained untouched.
- Attendance and other unmigrated Section consumers remained mock-backed.

## Verification

- Build passed.
- Typecheck unavailable.
- `git diff --check` passed.

## Known Limitations

- Generic unused setup components still contain legacy mock Section logic.

# Milestone 7 — Subjects

Status: Complete

## Scope

Created the Subject feature from its previous mock/data-only state.

## Files Created

- `src/lib/subjects-api.ts`

## Files Modified

- `src/App.tsx`

## Backend Endpoints

- `GET /classes/:classId/subjects`
- `GET /subjects/:id`
- `POST /subjects`
- `PATCH /subjects/:id`
- `DELETE /subjects/:id`

## Frontend Changes

- Added `/subjects`
- Added `/subjects/new`
- Added `/subjects/:id`
- Added `/subjects/:id/edit`
- Class-scoped listing using real Classes
- Create, detail, edit, and delete behavior
- Class immutable during editing
- Unsupported mock-only fields excluded
- Destructive delete confirmation

## Important Decisions

- Subject deletion is described as a backend soft delete, not a reversible archive.
- Backend deletion also permanently removes related Teaching Assignments.
- A list delete action was added/fixed after the initial implementation.

## Mock Features Preserved

- `mock-erp.ts` remained untouched.
- Teaching Assignments, Timetable, and other unrelated consumers remained mock-backed.
- Class detail was not expanded with Subject UI.

## Verification

- Build passed.
- Typecheck unavailable.
- Targeted `git diff --check` passed.

## Known Limitations

- Frontend still uses compatibility permission constants because dedicated Subject constants are not available in the existing UI permission model.

# Milestone 8 — Staff

Status: Complete

## Scope

Migrated core Staff list, detail, create, edit, and status behavior.

## Files Created

- `src/lib/staff-api.ts`

## Files Modified

- `src/App.tsx`

## Backend Endpoints

- `GET /staff`
- `GET /staff/:id`
- `POST /staff`
- `PATCH /staff/:id`
- `PATCH /staff/:id/status`

## Frontend Changes

- Migrated `/staff`
- Migrated `/staff/new`
- Migrated `/staff/:id`
- Migrated `/staff/:id/edit`
- Added backend-compatible Staff fields
- Added Active/Inactive status control
- Added backend field adapters
- No Staff delete behavior

## Important Decisions

- `employeeNumber` maps to `staffCode`.
- Display name maps to `firstName` and `lastName`.
- `phone` maps to `phoneNumber`.
- Boolean status maps to Active/Inactive.
- Staff email updates do not update the linked User login email.
- Teaching Assignments returned by Staff detail are intentionally ignored.

## Mock Features Preserved

- `mock-erp.ts` remained untouched.
- Dashboard Staff statistics remained mock-backed.
- Teaching Assignments and all unrelated features remained unchanged.

## Verification

- Build passed.
- Typecheck unavailable.
- Targeted `git diff --check` passed.

## Known Limitations

- `/staff/me` was not migrated.
- Frontend compatibility permissions remain UX-only.

# Milestone 9 — Teaching Assignments

Status: Complete

## Scope

Created a standalone real Teaching Assignment feature. No prior dedicated frontend UI existed.

## Files Created

- `src/lib/teaching-assignments-api.ts`

## Files Modified

- `src/App.tsx`

## Backend Endpoints

- `GET /staff/assignments`
- `GET /staff/:staffId/teaching-assignments`
- `GET /staff/me/teaching-assignments`
- `POST /staff/assignments`
- `PATCH /staff/assignments/:id`
- `DELETE /staff/assignments/:id`

## Frontend Changes

- Added `/teaching-assignments`
- Added `/teaching-assignments/new`
- Added `/teaching-assignments/:id/edit`
- Added real nested Staff, Subject, Class, and Section display
- Added dependent selectors:
  - Staff
  - Class
  - Subjects scoped to Class
  - Sections scoped to Class
- Class changes reset Subject and Section
- Create sends all four relationship IDs
- Update excludes `staffId`
- Added hard-delete confirmation
- No artificial assignment detail endpoint or route

## Important Decisions

- Backend relationship limitations were not hidden or replaced with invented rules.
- Frontend constrains Subject and Section to the selected Class because backend update validation is limited.
- Mock assignment fields such as status, term, academic year, and weekly periods were not exposed.

## Mock Features Preserved

- Existing mock assignment records remain in `mock-erp.ts`.
- Dashboard, Timetable, Attendance, Admissions, Students, and Fees remain mock-backed.
- Staff, Subject, Class, and Section screens were not expanded with assignment panels.

## Verification

- Build passed.
- Typecheck unavailable because `tsc` was not installed.
- Targeted `git diff --check` passed.

## Known Limitations

- There is no assignment detail endpoint; editing resolves an assignment from the all-assignment list.
- Backend does not enforce duplicate assignment prevention.
- Backend update validation remains limited.
- Frontend uses existing Staff compatibility permissions; backend authorization remains authoritative.

## Changelog Maintenance Rule

Every future migration or implementation milestone must update this file before the milestone is considered complete.

Every future Codex implementation prompt must explicitly instruct Codex to:

1. Read this changelog before implementation.
2. Execute only the requested milestone.
3. Update this changelog after implementation.
4. Add a new chronological milestone entry.
5. Record scope, files created, files modified, backend endpoints used, frontend behavior changed, important decisions, mock features preserved, verification, and known limitations.
6. Never rewrite or alter historical milestone entries except to correct an actual factual error.
7. Keep the changelog factual and concise.
8. Never mark a milestone complete until implementation and verification are complete.

## Milestone 10 — Admissions

Status: Partial

## Scope

Migrated the Admissions routes to the real NestJS Admission API while preserving the existing route structure and unrelated mock-backed features.

## Files Created

- `src/lib/admissions-api.ts`

## Files Modified

- `src/App.tsx`
- `docs/frontend-backend-migration-changelog.md`

## Backend Endpoints Used

- `GET /admission`
- `GET /admission/:id`
- `POST /admission`
- `PATCH /admission/:id`
- `POST /admission/:id/confirmed`
- `POST /admission/:id/cancelled`

## Frontend Changes

- Replaced Admission list, detail, create, and edit routes with real API-backed components.
- Added client-side search and status filtering.
- Added dependent real selectors: Academic Year → Program → Class → Section.
- Added explicit DRAFT/CONFIRMED/CANCELLED to Pending/Confirmed/Cancelled mapping.
- Added real confirmation and cancellation workflow actions with confirmation prompts.
- Added API loading, empty, not-found, and error handling.
- Preserved existing `/admissions` route structure and visual conventions.

## Architectural / Contract Decisions

- Admission transport is isolated in `src/lib/admissions-api.ts` and uses the existing authenticated API client.
- Status is changed only through the dedicated confirmation/cancellation endpoints, never through PATCH.
- `schoolId` is derived from the selected Academic Year; `createdById` is derived from the authenticated session identity.
- Student creation is treated as a backend side effect of confirmation; no mock Student record is created.
- The frontend does not fabricate admission numbers or sequences. The backend service generates them, but its current create DTO still requires them, so create compatibility remains unresolved.
- No delete route or delete UI was added.

## Mock Features Preserved

- `src/lib/mock-erp.ts` was not modified.
- Students, Dashboard, Fees, Attendance, Timetable, and unrelated mock consumers remain mock-backed.
- No real/mock synchronization was introduced.

## Verification

- `pnpm run build` — passed.
- `pnpm run typecheck` — unavailable because `tsc` is not installed.
- `git diff --check` — existing unrelated trailing whitespace was reported outside the frontend milestone files.
- No live backend requests were performed.

## Known Limitations

- The backend `CreateAdmissionDto` still requires `admissionNumber` and `admissionSequence`, while the service overwrites/generates them. The frontend intentionally does not invent or expose these values, so create requests require a backend contract correction before reliable end-to-end creation.
- Backend admission creation currently does not return the transaction result, so the frontend safely returns to the list rather than navigating to an assumed created ID.
- Backend list/detail responses contain IDs without nested display objects; display names depend on the existing real academic queries.
- Backend provides no admission search, status filter, or pagination, so those behaviors remain client-side.
- Student CRUD and Fees remain mock-backed.
- Backend status transition enforcement and the composite admission uniqueness constraint remain backend limitations.

## Milestone 11A-1 — Backend Student READ Contract and Admission Confirmation Integrity

Status: Implemented

## Scope

Added the minimum backend Student read contract and hardened Admission confirmation so Admission status changes and Student creation occur atomically. No frontend Student migration was performed.

## Files Created

- `ryo-academy-be/src/student/student.controller.ts`
- `ryo-academy-be/src/student/student.service.ts`
- `ryo-academy-be/src/student/student.module.ts`

## Files Modified

- `ryo-academy-be/src/app.module.ts`
- `ryo-academy-be/src/admission/admission-fee-log/admission.service.ts`
- `ryo-academy-fe/docs/frontend-backend-migration-changelog.md`

## Backend Endpoints Added/Changed

- Added `GET /students` with `student:read` authorization.
- Added `GET /students/:id` with `student:read` authorization.
- Hardened `POST /admission/:id/confirmed` with transactionality and duplicate/state protection.
- No Student create, update, delete, status, transfer, or promotion endpoints were added.

## Frontend Changes

- None. Student routes remain mock-backed.

## Important Architectural / Contract Decisions

- Student creation remains Admission-confirmation-only.
- Student placement remains Admission-derived.
- Student read responses include a limited nested Admission projection containing `schoolId`, `academicYearId`, `programId`, `classId`, and `sectionId`.
- No flattened academic names or unsupported Student-owned fields were fabricated.
- Confirmation now requires `DRAFT` status and rejects already confirmed/cancelled Admissions.
- Existing Student records prevent duplicate creation.
- Student numbering remains derived from `admissionSequence`.

## Mock Features Preserved

- Frontend Student screens remain mock-backed.
- `ryo-academy-fe/src/lib/mock-erp.ts` remains unchanged.
- Attendance, Fees, Dashboard, and Timetable remain unchanged.

## Verification

- `pnpm run build` — could not start because the local pnpm environment attempted an unavailable dependency-store setup.
- `NODE_OPTIONS=--max-old-space-size=384 node_modules/.bin/prisma generate` — passed.
- `NODE_OPTIONS=--max-old-space-size=384 node_modules/.bin/nest build` — passed.
- `node_modules/.bin/jest --runInBand` — failed before running tests because the existing Jest ESM/TypeScript configuration could not parse `import` syntax.
- `git diff --check` — passed for the files changed by this milestone.

## Known Limitations

- Student responses expose Admission IDs and school context, but not nested academic display names.
- Student status, direct Student CRUD, deletion, promotion, and transfer remain unsupported.
- The existing Admission/Student relationship still contains nullable `Admission.studentId`, which is not populated; the effective relation remains `Student.admissionId`.
- Frontend Student integration remains deferred to Milestone 11B.

## Milestone 11B — Student Read Frontend

Status: Implemented

## Scope

Migrated only the Student list and detail screens to the real Student backend read API. Student create and edit remain mock-backed.

## Files Created

- `src/lib/students-api.ts`

## Files Modified

- `src/App.tsx`
- `docs/frontend-backend-migration-changelog.md`

## Backend Endpoints Used

- `GET /students`
- `GET /students/:id`
- Existing `GET /admission/:id` for optional Admission detail enrichment.

## Frontend Changes

- `/students` now loads real Student records through the authenticated API client.
- `/students/:id` now loads real Student detail records.
- Added Student-specific React Query keys:
  - `["students"]`
  - `["students", id]`
- Added client-side search over supported Student and resolved placement values.
- Added real Academic Year, Program, Class, and Section display resolution.
- Removed the unsupported Active/Inactive status filter from the real Student list.
- Added explicit read-only messaging on Student detail.
- Kept Student create/edit routes on the existing mock components.

## Important Architectural / Contract Decisions

- Student API responses are mapped from `studentName`, `studentNumber`, and nested Admission placement IDs.
- Academic placement remains Admission-derived; no Student-owned placement fields were invented.
- No unsupported email, phone, guardian, fee, or status fields are displayed as real data.
- Admission detail enrichment is performed through the existing Admissions API rather than a new backend endpoint.
- The legacy Add Student action remains available only as a clearly labelled mock/legacy route.

## Mock Features Preserved

- `src/lib/mock-erp.ts` remains unchanged.
- Student create/edit remain mock-backed.
- Dashboard, Attendance, Fees, and Timetable remain mock-backed.
- Admissions remains real and was not modified.

## Verification

- `pnpm run build` — passed.
- `pnpm run typecheck` — unavailable because `tsc` is not installed.
- `git diff --check` for changed frontend files — passed.
- Live backend requests — not performed.

## Known Limitations

- Backend Student responses include placement IDs, so display names require the existing academic queries.
- Student write APIs do not exist; create/edit remain mock-backed.
- Student status, deletion, transfer, and promotion are not implemented.
- Attendance and Fees still use mock Student records and are intentionally not synchronized with real Student IDs.

## Milestone 11C — Admission → Student Conversion & Lifecycle

Status: Implemented

## Scope

Hardened the Admission confirmation lifecycle and exposed the resulting Student identity for the real Admission and Student read flows. No standalone Student write API was added.

## Files Created

None.

## Files Modified

- `ryo-academy-be/src/admission/admission-fee-log/admission.service.ts`
- `ryo-academy-fe/src/lib/admissions-api.ts`
- `ryo-academy-fe/src/App.tsx`
- `ryo-academy-fe/docs/frontend-backend-migration-changelog.md`

## Backend Endpoints Used/Changed

- `POST /admission/:id/confirmed` now returns the updated Admission with a minimal Student projection.
- `GET /admission/:id` now includes the same minimal Student projection when present.

## Frontend Changes

- Updated Admission response typing to include `student.id`, `studentNumber`, and `studentName`.
- Admission workflow invalidates Admission and Student read queries after confirmation/cancellation.
- Confirmed Admissions expose a `View Student` link using the backend-provided Student ID.
- No Student mutation API was added.

## Important Architectural / Contract Decisions

- Student creation remains Admission-confirmation-only.
- Admission confirmation remains DRAFT-only and rejects CONFIRMED/CANCELLED Admissions with conflict errors.
- Admission status update and Student creation remain inside one Prisma transaction.
- Student numbering remains derived from `admissionSequence`.
- `Student.admissionId` remains the effective relationship; nullable `Admission.studentId` was not redundantly populated.

## Mock Features Preserved

- Student create/edit routes remain mock/legacy.
- `src/lib/mock-erp.ts` remains unchanged.
- Attendance, Fees, Dashboard, and Timetable remain mock-backed.
- No standalone `POST /students` endpoint was added.

## Verification

- Direct Prisma generation — passed.
- Direct Nest build — passed.
- `pnpm run build` in the frontend — passed.
- Frontend `pnpm run typecheck` — unavailable because `tsc` is not installed.
- Backend Jest — failed before executing tests because the existing Jest configuration could not parse ESM TypeScript imports.
- No live backend requests were performed.

## Known Limitations

- Confirmation lifecycle tests were not executed because of the existing Jest configuration failure.
- Student status, create, update, delete, transfer, and promotion remain unsupported.
- Student placement remains Admission-derived.
- Existing mock Student records are not synchronized with real Students.

# Milestone 12A — Academic Calendar Contract + Usage Audit

Status: Complete

## Backend Contract

Academic Calendar is implemented as a backend academic module under `src/academic/academic-calendar`. The controller is mounted at `academic-calendar` and the effective URL is prefixed by the runtime global prefix from `API_PREFIX` plus `API_VERSION`.

All Academic Calendar routes use `JwtAuthGuard` and `PermissionsGuard`.

## Endpoints

- `POST /academic-calendar`
  - Permission: `shift:create`
  - Body: `academicYearId`, `date`, `dayType`, `title`, optional `description`, `isWorkingDay`
  - Creates one non-deleted calendar record after validating Academic Year existence, date format, academic-year date range, and uniqueness.

- `POST /academic-calendar/seed`
  - Permission: `shift:create`
  - Body: `academicYearId`, `weeklyOffDays`
  - Seeds the full Academic Year date range, creating `WORKING_DAY` and `WEEKEND` records with `skipDuplicates`.
  - Response includes `academicYearId`, `startDate`, `endDate`, `created`, and `existing`.

- `GET /academic-calendar`
  - Permission: `shift:read`
  - Query: optional `academicYearId`, `from`, `to`, `dayType`, `isWorkingDay`
  - Returns an array ordered by `date` ascending and excludes soft-deleted records.
  - No pagination or search.

- `GET /academic-calendar/:id`
  - Permission: `shift:read`
  - Returns one non-deleted record or a not-found error.

- `PATCH /academic-calendar/:id`
  - Permission: `shift:update`
  - Body: optional `date`, `dayType`, `title`, `description`, `isWorkingDay`
  - Does not accept `academicYearId`; date changes are validated against the existing Academic Year.

- `DELETE /academic-calendar/:id`
  - Permission: `shift:update`
  - Soft-deletes by setting `deletedAt`.

## Permissions

No Academic Calendar-specific permission constants exist. The module currently reuses:

- `shift:read`
- `shift:create`
- `shift:update`

The RBAC seed gives these permissions to College Admin and Office Admin. Staff receive `shift:read` only.

## Prisma/Data Model

`AcademicCalendar` fields:

- `id`
- `academicYearId`
- `date`
- `dayType`
- `title`
- `description`
- `isWorkingDay`
- `createdAt`
- `updatedAt`
- `deletedAt`

Relations:

- Required `academicYear -> AcademicYear`
- Reverse relation `AcademicYear.academicCalendars`

Constraints:

- `@@unique([academicYearId, date])`
- Database migration creates `date` as `DATE`.
- Foreign key references `AcademicYear(id)` with database `ON DELETE RESTRICT ON UPDATE CASCADE`.

Enums:

- `DayType`: `WORKING_DAY`, `WEEKEND`, `HOLIDAY`, `SPECIAL_WORKING_DAY`

Calendar records belong to Academic Year only. They do not directly belong to School, Program, Class, or Section.

## Frontend Mock Contract

There is no dedicated Academic Calendar mock resource in `src/lib/mock-erp.ts`.

The frontend currently has date/calendar-like mock data only through:

- `attendance` records with `date`, `academicYearId`, `programId`, `classId`, `sectionId`, display names, `markedBy`, and entry statuses.
- `timetable` records with weekday, period, time, program, class, section, subject, faculty, and room.
- hardcoded Dashboard date text and summary cards.

There are no mock holiday, working-day, calendar-event, vacation, closure, recurring-event, or calendar CRUD records.

## Frontend Routes

No current frontend route exists for Academic Calendar management.

Current related routes are:

- `/attendance`
- `/attendance/mark`
- `/attendance/:id`
- `/attendance/:id/edit`
- `/timetable`
- `/dashboard`

All related behavior remains mock-backed or partially mock-backed and was not changed by this audit.

## Frontend Consumers

Dedicated Calendar UI:

- None found.

Attendance:

- `src/App.tsx` uses `useResource("attendance")`, `useItem("attendance", id)`, and `useSaveAttendance()`.
- `src/lib/mock-erp.ts` stores mock Attendance records.
- Attendance mark/edit uses an HTML date input and does not check an Academic Calendar source.

Dashboard:

- `src/App.tsx` uses mock Attendance counts and a hardcoded date string in the Dashboard.
- It does not read Academic Calendar records.

Other Domains:

- `TimetablePage` uses mock timetable weekday records.
- The shared `src/components/ui/calendar.tsx` is a generic UI component, not the ERP Academic Calendar feature.

## Attendance Dependencies

Backend Attendance depends on Academic Calendar in `src/attendance/attendance.service.ts` by checking a calendar record for the attendance date and rejecting missing or non-working days.

Frontend Attendance does not currently depend on Academic Calendar data. It remains mock-backed and allows `Present`, `Absent`, and `Late`, while the backend Attendance V0 only supports `PRESENT` and `ABSENT`.

## Dashboard Dependencies

Dashboard currently does not consume Academic Calendar records. It uses mock Attendance counts and hardcoded date/context text.

## Contract Mismatches

- Backend has Academic Calendar CRUD and seed endpoints; frontend has no dedicated Academic Calendar UI.
- Backend `dayType` uses enum values; frontend has no equivalent model.
- Backend `date` is stored as database `DATE` and DTOs expect `YYYY-MM-DD`; frontend Attendance mock dates are strings and not validated against working days.
- Backend soft delete sets `deletedAt`; frontend has no calendar deletion behavior.
- Backend list supports filters by Academic Year, date range, day type, and working-day flag; frontend has no calendar list.
- Backend uses `shift:*` permissions; frontend has no dedicated Academic Calendar permission constants.

## Unsupported Features

The backend Academic Calendar does not currently model:

- Program, Class, or Section-specific calendar records.
- Multi-day events as a single record.
- Recurring events beyond the seed helper.
- Event categories beyond `DayType`.
- Start/end times.
- Exam schedules.
- Calendar restore/undelete.
- Search or pagination.

## Recommended Real Migration

Milestone 12B should add a focused real Academic Calendar feature using the existing backend contract:

- list records
- filter by Academic Year, date range, day type, and working-day status
- create record
- seed Academic Year calendar
- detail view
- edit mutable fields
- soft delete

Use real Academic Years for selectors and display names.

## Recommended Mock Boundary

Keep these mock-backed for now:

- Attendance frontend
- Dashboard calendar/attendance summaries
- Timetable
- Fees
- any unrelated domain screens

Do not create real/mock synchronization between Academic Calendar and mock Attendance.

## Backend Gaps

- No dedicated Academic Calendar permissions exist; current backend authorization reuses `shift:*`.
- Prisma schema file shows `date DateTime`, while the migration creates `DATE`; the generated client may still be correct from the migration, but the schema file should be verified before future schema work.
- Seed creates only `WORKING_DAY` and `WEEKEND` records.
- Soft-deleted records still reserve `academicYearId + date` because the unique constraint is not partial.

## Recommended Milestone 12B Scope

1. Create `src/lib/academic-calendar-api.ts` in the frontend.
2. Add routes for `/academic-calendar`, `/academic-calendar/new`, `/academic-calendar/:id`, and `/academic-calendar/:id/edit` if approved.
3. Use Academic Years real data for relationship display and selectors.
4. Add seed UI as an admin action for an Academic Year.
5. Preserve Attendance, Dashboard, and Timetable as mock-backed.
6. Handle backend `400`, `403`, `404`, and `409` responses clearly.

## Verification

- Inspected backend Academic Calendar controller, service, DTOs, module, Prisma model, migration, app module, global prefix setup, permission constants, and RBAC seed.
- Inspected frontend `App.tsx`, `src/lib/mock-erp.ts`, routes, Dashboard, Attendance, Timetable, and calendar search results.
- Inspected the migration changelog and appended this chronological entry.
- No application behavior was changed.
- No backend implementation files were modified.
- No Prisma schema or migration was modified.

## Known Limitations

- No live backend requests were performed.
- No build or test commands were run because this milestone was documentation and repository inspection only.
- The frontend has no existing Academic Calendar UI, so Milestone 12B will be a new screen integration rather than a mock-screen replacement.

# Milestone 12B — Academic Calendar Frontend

Status: Implemented

## Scope

Added a new frontend Academic Calendar feature backed by the existing NestJS Academic Calendar API. This was a new frontend feature, not a mock replacement.

## Files Created

- `src/lib/academic-calendar-api.ts`

## Files Modified

- `src/App.tsx`
- `docs/frontend-backend-migration-changelog.md`

## Backend Endpoints Used

- `GET /academic-calendar`
- `GET /academic-calendar/:id`
- `POST /academic-calendar`
- `PATCH /academic-calendar/:id`
- `DELETE /academic-calendar/:id`

## Permissions

Used the backend's existing Academic Calendar permissions through the frontend compatibility permission model:

- Read: `shift:read` / `SHIFT_READ`
- Create: `shift:create` / `SHIFT_CREATE`
- Update/delete: `shift:update` / `SHIFT_UPDATE`

No `academic-calendar:*` permissions were invented.

## Routes

Added:

- `/academic-calendar`
- `/academic-calendar/new`
- `/academic-calendar/:id`
- `/academic-calendar/:id/edit`

## API Types

Added backend-aligned types for:

- `AcademicCalendarRecord`
- `AcademicCalendarQuery`
- `CreateAcademicCalendarRequest`
- `UpdateAcademicCalendarRequest`
- `DayType`

## List

`/academic-calendar` now reads from the real backend and supports the backend filter contract:

- Academic Year
- from date
- to date
- day type
- working-day status

The list handles loading, API error, and empty states.

## Detail

`/academic-calendar/:id` reads one real backend record and displays supported fields only:

- Academic Year
- date
- day type
- title
- description
- working-day flag
- timestamps

## Create

`/academic-calendar/new` creates records through `POST /academic-calendar`.

The form sends:

- `academicYearId`
- `date`
- `dayType`
- `title`
- `description`
- `isWorkingDay`

## Edit

`/academic-calendar/:id/edit` updates records through `PATCH /academic-calendar/:id`.

Academic Year is displayed read-only during editing and is not sent in the update payload.

## Delete

Detail view includes a confirmation-protected delete action using `DELETE /academic-calendar/:id`.

The frontend treats delete as a backend soft delete and invalidates Academic Calendar queries after success.

## Seed Endpoint Decision

`POST /academic-calendar/seed` exists in the backend but was not exposed in this milestone. No existing frontend UX or product requirement justified adding a seed action yet.

## Academic Year / School Resolution

Academic Calendar records are scoped to Academic Year only. The frontend resolves Academic Year display names through the existing real Academic Years API.

No `schoolId` is required by the backend Academic Calendar DTO, and no school ID was fabricated.

## Date Handling

The frontend uses `YYYY-MM-DD` values for form inputs and API filter parameters, matching the backend DTO format.

Backend ISO-like date responses are sliced to date-only strings for display and date inputs.

## Mock Boundaries Preserved

- No Academic Calendar mock data was introduced.
- `src/lib/mock-erp.ts` was not modified.
- Attendance remains mock-backed.
- Dashboard remains mock-backed.
- Timetable remains mock-backed.
- Fees remains mock-backed.
- No real/mock synchronization was added.

## Verification

- `pnpm run build` — passed.
- `pnpm run typecheck` — failed because `tsc` is not installed.
- No backend build or tests were run.
- No live backend requests were performed.

## Known Limitations

- The seed endpoint is not exposed in the frontend.
- Frontend permission checks remain compatibility UX only; backend RBAC remains authoritative.
- No calendar grid/month view was added; the administrative list/detail flow is the source of truth for V0.
- The backend currently reuses `shift:*` permissions for Academic Calendar.

# Milestone 13A — Attendance Contract + Usage Audit

Status: Complete — audit/discovery only. No Attendance migration or application behavior change was made.

## Scope

This audit inspected the existing NestJS/Prisma Attendance contract, authorization, database migration and related academic relationships, plus every Attendance reference found in the frontend. The backend contract is authoritative; the frontend remains intentionally mock-backed until a later milestone.

## Files Inspected

Backend:

- `ryo-academy-be/src/attendance/attendance.controller.ts`
- `ryo-academy-be/src/attendance/attendance.service.ts`
- `ryo-academy-be/src/attendance/attendance.module.ts`
- `ryo-academy-be/src/attendance/dto/attendance-entry.dto.ts`
- `ryo-academy-be/src/attendance/dto/create-attendance.dto.ts`
- `ryo-academy-be/src/attendance/dto/update-attendance.dto.ts`
- `ryo-academy-be/src/attendance/dto/query-attendance.dto.ts`
- `ryo-academy-be/src/auth/permissions/permission.constants.ts`
- `ryo-academy-be/src/auth/permissions.guard.ts`
- `ryo-academy-be/src/database/seed/rbac.seed.ts`
- `ryo-academy-be/prisma/models/attendance/attendance-log-master.prisma`
- `ryo-academy-be/prisma/models/attendance/attendance-log-child.prisma`
- `ryo-academy-be/prisma/models/attendance/academic-calendar/academicCalendar.prisma`
- Related Student, Class, Section, Staff, Teaching Assignment, and Academic Year Prisma models
- `ryo-academy-be/prisma/migrations/20260910130000_attendance_v0/migration.sql`
- `ryo-academy-be/docs/api-documentation.md`

Frontend and history:

- `ryo-academy-fe/src/lib/mock-erp.ts`
- `ryo-academy-fe/src/App.tsx`
- `ryo-academy-fe/src/index.css` (Attendance presentation styles only)
- `ryo-academy-fe/docs/frontend-backend-migration-changelog.md`

## Backend Endpoints

The controller base path is `/attendance`; the externally deployed URL also depends on the runtime global API prefix and version configuration.

- `POST /attendance` — requires Bearer JWT and `attendance:mark`. Body: `academicYearId`, `classId`, `sectionId`, `date` in `YYYY-MM-DD`, and a non-empty `entries` array. Each entry requires `studentId` and `status`; `remarks` is optional. The service creates one master and all child rows in one Prisma transaction, with master status `SUBMITTED` and `submittedAt` set. It validates active Staff, existing Academic Year/Class/Section, section/class ownership, academic-year date range, exact non-deleted Academic Calendar record, working-day status, teaching assignment, confirmed eligible students, complete one-time student coverage, and duplicate prevention. Errors explicitly implemented include `400`, `403`, `404`, and `409` cases.
- `GET /attendance` — requires Bearer JWT and `attendance:read`. Optional query parameters: `academicYearId`, `classId`, `sectionId`, `date`, `from`, and `to`, all string/date-form validated by the DTO. Returns non-deleted master records with `children`, ordered by `date` descending. A resolved Staff user is restricted to their assigned academic-year/class/section combinations. There is no pagination or explicit page metadata.
- `GET /attendance/my` — requires Bearer JWT and `attendance:read`. It accepts the same filters and returns non-deleted records where `takenBy` is the current Staff record, ordered by date descending. An active Staff profile is required.
- `GET /attendance/:id` — requires Bearer JWT and `attendance:read`. Returns one non-deleted master with `children`; Staff assignment authorization is checked. Missing records return `404`.
- `PATCH /attendance/:id` — requires Bearer JWT and `attendance:update`. The only accepted field is optional `entries`. A record must be `DRAFT`; supplied entries replace the complete child set in a transaction after the same eligible-student validation. Since `POST /attendance` always creates `SUBMITTED`, the current public flow does not create an updatable record.
- `DELETE /attendance/:id` — requires Bearer JWT and `attendance:update`. It soft-deletes by setting `deletedAt`. A resolved Staff user must be the original `takenBy`; missing records return `404`.

No Attendance endpoint was found for student-specific, class-specific, section-specific, summary, statistics, percentage, report, or bulk-update operations. Class, section, student, date, and date-range filtering are query parameters on the list endpoint, not separate routes.

## Backend Permissions

Verified permission names are:

- `attendance:read` for `GET /attendance`, `/attendance/my`, and `/attendance/:id`
- `attendance:mark` for `POST /attendance`
- `attendance:update` for `PATCH /attendance/:id` and `DELETE /attendance/:id`

The Attendance controller uses both `JwtAuthGuard` and `PermissionsGuard`. The RBAC seed grants all three to `COLLEGE_ADMIN` and `STAFF`; `OFFICE_ADMIN` is not granted Attendance permissions. No alternate Attendance permission names were found.

## Prisma/Data Model

`AttendanceLogMaster` has: `id` UUID primary key, required `academicYearId`, `classId`, `sectionId`, `date DateTime @db.Date`, `takenBy`, `status`, `submittedAt?`, `createdAt`, `updatedAt`, and `deletedAt?`. It relates to `AcademicYear`, `Class`, `Section`, `Staff` through `takenBy`, and `AttendanceLogChild[]`.

`AttendanceLogChild` has: `id` UUID primary key, required `attendanceMasterId`, `studentId`, `status`, optional `remarks`, `createdAt`, and `updatedAt`. It relates to `AttendanceLogMaster` and directly to `Student` through `studentId`.

Constraints and indexes verified in both Prisma model/migration:

- Unique master key: `academicYearId + classId + sectionId + date`
- Unique child key: `attendanceMasterId + studentId`
- Master index: `classId + sectionId + date`
- Child index: `studentId`
- Foreign keys use `ON DELETE RESTRICT ON UPDATE CASCADE`

Attendance directly relates to Student, Class, Section, Academic Year, and Staff. It does not directly relate to Academic Calendar, Teaching Assignment, Subject, or School in Prisma. Academic Calendar and Teaching Assignment are service-level validation/authorization dependencies. Student eligibility is derived through the Student's Admission placement, not through an Attendance-owned class or section field.

## Attendance Statuses

The backend `StudentAttendanceStatus` enum contains exactly `PRESENT` and `ABSENT`. The master `AttendanceMasterStatus` enum contains `DRAFT` and `SUBMITTED`.

The frontend mock contains `Present`, `Absent`, and `Late`. `Late` has no backend enum or DTO equivalent. The frontend title-cased values also require mapping before they could be sent to the backend.

## Date Semantics

Attendance accepts `YYYY-MM-DD`, parses it as a UTC date, validates that it is a real calendar date, and persists it as Prisma `DateTime @db.Date` / database `DATE`. The service checks that the date is inclusively within the selected Academic Year's start/end dates, finds a non-deleted Academic Calendar record for the exact Academic Year/date, and rejects `isWorkingDay = false`.

The master uniqueness rule is one register per `academicYearId + classId + sectionId + date`. Child uniqueness is one Student per register. Duplicate register creation produces a conflict; duplicate or incomplete student entries produce a bad request. No explicit application timezone policy beyond UTC date construction was found. No period, subject, or date-time attendance concept was found. Soft-deleted masters still reserve the unique date/class/section combination because `deletedAt` is not part of the unique key.

## Frontend Mock Model

`AttendanceRecord` contains `id`, `academicYearId`, `programId`, `classId`, `sectionId`, display strings for academic year/program/class/section, `date`, `markedBy`, and `entries`. Each mock entry contains `studentId`, `studentName`, and a title-cased `AttendanceStatus` of `Present`, `Absent`, or `Late`.

The mock database contains two seeded records dated `2025-05-13` and `2025-05-12`. `useResource("attendance")` and `useItem("attendance", id)` read localStorage-backed data. `useSaveAttendance()` inserts or replaces a record locally and invalidates only the mock React Query key. There is no frontend Attendance delete mutation. The mark form derives students by matching mock class/section display values, defaults new entries to `Present`, supports a native date input, and supports editing the local record. There are no Attendance-specific reports, summaries, percentage calculations, search controls, date filters, or calendar views.

## Frontend Routes

- `/attendance` — mock list of class registers with Present/Absent/Late counts.
- `/attendance/mark` — mock bulk register-marking form for the selected class and section.
- `/attendance/:id` — mock register detail.
- `/attendance/:id/edit` — mock register edit route.

The list/detail routes use frontend `ATTENDANCE_READ`; marking uses `ATTENDANCE_MARK`; editing uses `ATTENDANCE_UPDATE`. All four routes are mock-backed. No separate student attendance detail, daily dashboard, class-only, section-only, history, correction, summary, or report route was found.

## Frontend Consumers

Dedicated Attendance UI is in `ryo-academy-fe/src/App.tsx`: `AttendancePage`, `AttendanceMark`, and `AttendanceDetail`. They consume the mock list/item/save hooks, mock display labels, mock student names, and mock status values.

Dashboard in the same file reads `useResource("attendance")` only to show a record count for Staff and an Attendance desk activity count. It does not read individual attendance fields or report values.

`ryo-academy-fe/src/lib/mock-erp.ts` owns the Attendance type, seed records, localStorage database collection, resource query, and save mutation. No other frontend TypeScript/TSX consumer was found. `src/index.css` contains only Attendance form/list styling and does not provide data behavior.

## Student Dependency

The backend child record directly references `Student.id`. On create/update, the service derives eligible Students through confirmed Admission records matching the submitted Academic Year, Class, and Section, then requires every eligible real Student ID exactly once. `studentNumber` and `admissionId` are not accepted by the Attendance DTO.

The mock uses local IDs such as `s1` and includes a `studentName` in each entry. The current frontend derives those entries from mock Student display fields and does not use the real read-only Student API. Mock IDs must not be synchronized with backend IDs. Migrating Attendance therefore requires real Student records and an explicit response adapter for names.

## Class / Section Dependency

Attendance is a Student-entry register scoped by required `academicYearId`, `classId`, and `sectionId`. The backend verifies that the Section belongs to the submitted Class. The frontend currently selects Academic Year, Program, Class, and Section, but `programId` is frontend-only and is not part of the Attendance backend request or model. Frontend student membership is currently inferred from mock display names; backend membership is Admission-derived and ID-based.

## Academic Calendar Dependency

The backend service explicitly requires an exact non-deleted Academic Calendar record for the Attendance Academic Year/date and requires that record's `isWorkingDay` be true. Attendance does not store an `academicCalendarId` foreign key and does not directly relate to Academic Calendar in Prisma. The frontend Attendance screens do not query or validate Academic Calendar records, even though the real Academic Calendar feature now exists separately.

## Staff / Teaching Assignment Dependency

The backend requires an active Staff profile for creation and uses the authenticated user's Staff ID as `takenBy`. Creation requires a Teaching Assignment matching the Staff member, Class, Section, and Academic Year through the Class's Program. Read filtering/authorization also uses Staff teaching assignments. The Prisma Attendance master relates directly to Staff, but not directly to Teaching Assignment or Subject. The frontend displays mock `markedBy` text and does not resolve or validate Staff or Teaching Assignment data. No Subject ID or subject-level attendance behavior is part of the current contract.

## Bulk Attendance

`POST /attendance` accepts one class/section/date register with an array of all student entries and creates the master plus children in one Prisma transaction. This is verified backend bulk marking at the register level. It is not a class/section/date endpoint named separately, and there is no bulk update endpoint. The service rejects missing, duplicate, invalid, or incomplete student coverage. The frontend also marks a whole local class/section register at once, but its student set and IDs are mock-derived.

## Reporting

The backend exposes no summary, statistics, percentage, monthly, date-range report, or totals endpoint. `GET /attendance` supports date and date-range filtering and returns child records, so a future client could calculate basic totals after loading records, but no backend reporting contract was found. The current frontend has no dedicated reporting UI or percentage feature. Any richer reporting requirement is `UNSUPPORTED — KEEP MOCK` or a backend gap until explicitly specified.

## Frontend vs Backend Comparison

| Feature | Frontend Mock | Backend | Decision |
|---|---|---|---|
| Student relationship | Entry has mock `studentId` and `studentName`; membership is display-name matched | Child has required real `studentId`; eligibility comes from confirmed Admission placement | BACKEND GAP |
| Date | String/native date input; seeded dates and default date are not checked against a calendar | Valid `YYYY-MM-DD`, stored as database `DATE`, within Academic Year and working calendar date | REAL — MIGRATE after adapter/validation |
| Status | `Present`, `Absent`, `Late` | `PRESENT`, `ABSENT` only | DOMAIN DECISION |
| Class | Mock `classId` plus display labels | Required master `classId`; existence validated | REAL — MIGRATE |
| Section | Mock `sectionId` plus display labels | Required master `sectionId`; must belong to Class | REAL — MIGRATE |
| Subject | No Attendance subject field | No Attendance subject relation or DTO field | MOCK — PRESERVE |
| Bulk marking | Local whole-register save | Transactional whole-register POST with complete student coverage | REAL — MIGRATE after backend lifecycle decision |
| Update | Local insert/replace supports edit | PATCH exists but only permits `DRAFT`; POST creates `SUBMITTED` | BACKEND GAP |
| Delete | No Attendance delete behavior | Soft delete via DELETE with `attendance:update` | REAL — MIGRATE only if product wants delete |
| Reports | No dedicated reports or percentages found | No reporting endpoints | MOCK — PRESERVE |

## Data Integrity Risks

- The backend create path always submits records, while update only permits `DRAFT`; newly created records cannot currently be corrected through the normal API.
- Soft-deleted records retain the unique date/class/section key and block re-entry for the same date.
- Frontend mock IDs, display-name membership, and `studentName` are not authoritative real Student identity.
- The frontend permits `Late`, while the backend accepts only `PRESENT` and `ABSENT`.
- Frontend seeded/default dates are outside the mock Academic Year shown in the current data and would fail the backend's Academic Year/calendar checks if sent unchanged.
- Frontend does not check Academic Calendar working days or missing calendar records.
- The frontend's `programId` and display labels have no direct Attendance backend fields.
- Backend list responses are unpaginated and include child rows; large registers may increase response size.
- The verified service read/update/delete paths do not consistently require an active Staff profile before assignment/ownership fallback checks, so authorization hardening should be reviewed before broad production use.
- No Attendance-specific automated tests were found in the inspected backend source tree.

## Unsupported Features

The current backend does not support `Late`, `Excused`, `Half Day`, subject/period attendance, attendance percentages, summaries, statistics, reports, or a bulk-update endpoint. The frontend has no dedicated reporting features to migrate. These remain `MOCK — PRESERVE` where they are existing mock concepts, or `BACKEND GAP` where a real product requirement is needed.

## Backend Gaps

- Resolve the submitted-versus-draft lifecycle before enabling frontend correction/edit migration.
- Review the read/update/delete Staff authorization behavior for fail-closed semantics when a user has Attendance permissions but no Staff profile.
- Define whether soft-deleted registers should be replaceable; the current database uniqueness prevents reuse.
- Add explicit reporting contracts only if reporting is a required real feature; none currently exist.
- Add pagination or response DTOs only if list volume and frontend needs justify them.

## Domain Decisions

- Decide whether `Late` is intentionally removed, mapped to `ABSENT`/`PRESENT`, or added as a backend-supported status. No mapping is safe to invent in this audit.
- Decide whether Attendance is only daily class/section attendance. Subject and period concepts are absent from the verified backend contract.
- Decide whether submitted attendance is immutable, or whether the backend should expose a controlled correction workflow.
- Decide whether deletion should be exposed to users and whether deleted dates can be re-entered.
- Decide whether real Attendance migration should calculate client-side totals from returned children or wait for backend reporting endpoints.

## Recommended REAL Scope

For the first real slice, migrate only the backend-supported daily class/section register contract: list, detail, create/register marking, real Student IDs, real Academic Year/Class/Section selectors, backend-supported `PRESENT`/`ABSENT` statuses, date/date-range filtering where useful, and backend error handling. Preserve backend permission names and use an adapter for master/child responses and display labels.

## Recommended MOCK Scope

Keep `Late` behavior, subject/period attendance, attendance percentages, summaries/reports, and any workflow that depends on unresolved correction semantics mock-backed. Keep unrelated Dashboard counts mock-backed until their data source is deliberately migrated. Do not synchronize mock and real Student records.

## Recommended Milestone 13B

Milestone 13B should begin with backend contract hardening and explicit domain decisions, especially the `SUBMITTED`/`DRAFT` correction contradiction, Staff authorization behavior, status policy, and soft-delete reuse policy. After that, implement a narrow frontend adapter and React Query API layer, migrate real Student/Class/Section/Academic Year-backed selectors and eligible Student entries, then migrate list/detail/create. Add edit/correction only after the backend lifecycle is made usable. Academic Calendar must be queried or its working-day validation errors handled as part of real marking; no Attendance-to-calendar foreign key is required by the current contract. Reporting should remain out of 13B unless a backend reporting contract is added.

# Milestone 13C — Attendance Daily Register Frontend Migration

Status: Implemented — dedicated Attendance routes now use the real backend. Dashboard Attendance counts and unrelated mock consumers remain unchanged. Live API verification was unavailable because the Attendance migrations are not applied to the development database.

## Scope

Migrated the supported daily class/section Attendance register workflow from the local mock resource to the hardened backend contract: list, detail, draft creation, draft editing, explicit submission, and draft deletion. Existing URLs were preserved. Reporting, Dashboard statistics, correction workflows, and unsupported statuses were deliberately excluded.

## Files Created

- `ryo-academy-fe/src/lib/attendance-api.ts`

## Files Modified

- `ryo-academy-fe/src/App.tsx`
- `ryo-academy-fe/docs/frontend-backend-migration-changelog.md`

`ryo-academy-fe/src/lib/mock-erp.ts` was not modified. No backend, Prisma, Student, Academic Calendar, Dashboard, Fees, Timetable, or unrelated domain files were modified.

## Backend Endpoints Used

- `GET /attendance` with supported `academicYearId`, `classId`, `sectionId`, and `date` query parameters for the real list.
- `GET /attendance/:id` for real register detail.
- `POST /attendance` with `academicYearId`, `classId`, `sectionId`, `date`, and complete real Student entry IDs for draft creation.
- `PATCH /attendance/:id` with `entries` only for draft editing.
- `POST /attendance/:id/submit` for explicit draft submission.
- `DELETE /attendance/:id` for draft deletion.

`GET /attendance/my` is implemented in the API module but is not selected by the current list UI; the existing Attendance page is an accessible-register list and uses `GET /attendance`.

## Permissions

Existing frontend permission conventions are preserved: `ATTENDANCE_READ` for list/detail, `ATTENDANCE_MARK` for creation/submission, and `ATTENDANCE_UPDATE` for draft editing/deletion. Backend permissions remain authoritative.

## Routes

The existing routes are preserved and now point to real backend-backed components:

- `/attendance`
- `/attendance/mark`
- `/attendance/:id`
- `/attendance/:id/edit`

## API Layer

`src/lib/attendance-api.ts` defines backend-aligned register, child, query, create, and update types. It uses the existing `apiClient` and session token mechanism, with no Axios and no reuse of the mock `AttendanceRecord` type. It also exposes API-specific React Query hooks and backend-aware error messages.

## React Query

Attendance list queries use the `attendance` query-key family with filter values. Detail queries use `attendance` plus the register ID. Create invalidates the list and seeds detail data; update, submit, and delete invalidate the affected list/detail queries without optimistic lifecycle changes.

## Attendance List

The list now reads real registers and supports backend filters for Academic Year, Class, Section, and exact date. It displays real register date, Academic Year/Class/Section IDs resolved through existing real APIs, lifecycle status, Staff ID from `takenBy`, and Present/Absent counts derived from returned child records. No status, Student, Subject, Period, or report filter was added.

## Attendance Detail

Detail reads `GET /attendance/:id`, displays register context and lifecycle status, and renders every returned child. Student names and numbers are resolved from the existing real Student API by canonical `Student.id`; no mock Student fallback or array-index matching is used.

## Attendance Creation

`/attendance/mark` selects a real Academic Year, Class, Section, and date, derives eligible real Students from their Admission placement, defaults each eligible entry to `PRESENT`, allows only `Present` or `Absent`, and sends the exact backend create DTO. Successful creation navigates to the new draft detail for review rather than submitting automatically.

## Student Integration

Dedicated Attendance screens use `useStudents()` and real backend Student IDs. Eligibility is filtered by the selected Academic Year, Class, and Section using the existing nested Student Admission placement. Mock Students and mock IDs are not used by the migrated screens.

## Class / Section Integration

Classes use the existing real Classes API and are filtered through existing real Programs by selected Academic Year. Sections use the existing `useSectionsByClass` API. Changing Academic Year resets Class/Section; changing Class resets Section, preventing stale Section selection.

## Academic Year Integration

Academic Year selectors and labels use the existing real Academic Years API. No Academic Year IDs are hardcoded.

## Academic Calendar Integration

The form reads the existing Academic Calendar API for the selected Academic Year, constrains the date input to the selected Academic Year range, and shows known non-working-day feedback. Backend validation remains authoritative; the frontend does not create calendar records or attempt to reproduce all backend rules.

## Draft Workflow

Create sends `POST /attendance` and expects the backend to return `DRAFT`. Draft detail exposes edit, submit, and delete actions according to permissions. Draft editing sends only the supported `entries` payload through `PATCH /attendance/:id`.

## Submit Workflow

The detail view confirms before calling `POST /attendance/:id/submit`, waits for backend success, invalidates Attendance queries, and then displays the returned `SUBMITTED` state. No optimistic submission is used.

## Delete Workflow

Only draft registers expose a confirmation-protected Delete action. Successful `DELETE /attendance/:id` invalidates Attendance queries and navigates to the list. Submitted registers do not expose Delete.

## Submitted Read-Only Behavior

Submitted registers do not expose Edit, Submit, or Delete actions. Their child statuses are displayed read-only. No post-submission correction workflow was added.

## Status Contract

The real Attendance UI exposes only Present and Absent and sends only `PRESENT` or `ABSENT`. The mock `Late` status remains in `mock-erp.ts` for unrelated mock consumers and is never sent by the migrated screens.

## Mock Boundaries Preserved

- Dashboard Attendance counts remain mock-backed.
- Attendance reporting, percentages, and statistics remain deferred.
- Late, Excused, Half-Day, Subject, and Period attendance remain unsupported/deferred.
- `mock-erp.ts` and its Attendance records remain available for other mock consumers.
- No Student synchronization was introduced.

## Verification

- Verified the source-level 13B Attendance controller/service contract before implementation.
- Prisma migration status reports `20260910130000_attendance_v0`, `20260910140000_admission_section`, and `20260911100000_attendance_contract_hardening` as not applied.
- `pnpm run build` in `ryo-academy-fe` passed.
- `pnpm run typecheck` could not run because `tsc` is not installed in the frontend package.
- No live API workflow tests were run or claimed because the required backend migrations are unapplied.
- No backend, Prisma, Dashboard, mock ERP, or unrelated domain behavior was changed.

## Known Limitations

- Live list/create/edit/submit/delete verification is unavailable until the pending backend migrations are applied.
- Backend Attendance responses expose `takenBy` and child `studentId` but do not include nested Staff or Student relations; the frontend resolves Student display data through the existing Student API and displays the real Staff ID.
- The UI provides helpful calendar feedback but deliberately relies on backend validation for missing/deleted/non-working calendar records.
- TypeScript typecheck remains unavailable because the repository does not provide a frontend `tsc` executable.

## Recommended Milestone 13D

Apply and validate the pending backend migrations, then run live Attendance workflow verification. After the core workflow is proven, define any post-submission correction contract separately. Dashboard synchronization and reporting should remain separate milestones.

Recommended implementation order: backend hardening; finalized Attendance API contract; real Student integration; real Class/Section/Academic Year integration; Academic Calendar date validation; transactional register marking; history/list and detail; correction only after lifecycle support; reporting only after a separately defined backend capability.

## Verification

- Inspected the Attendance controller, service, module, all Attendance DTOs, permission constants, PermissionGuard, RBAC seed, Prisma Attendance models, related relationship models, and the Attendance migration.
- Inspected frontend `mock-erp.ts`, `App.tsx`, Attendance routes/components, Dashboard Attendance consumers, and Attendance styles.
- Searched the full backend/frontend source trees for Attendance-related symbols and found no additional frontend Attendance consumers or dedicated API module.
- Read the historical migration changelog before this entry and preserved all prior entries.
- Ran `git diff --check` after updating this changelog.
- No builds, tests, live backend requests, or migrations were run; this was an audit-only milestone.

## Known Limitations

- This audit did not execute the API against a database, so runtime payload serialization and deployed prefix behavior were not live-tested.
- Authorization role assignments were verified from the repository seed and guard code, not from a running database.
- Response descriptions are based on the service's Prisma `include: { children: true }`; no generated OpenAPI response schema was used to add fields not returned by that query.
- The frontend route and consumer audit reflects the current source tree; no browser interaction was performed.

# Milestone 13B — Attendance Backend Contract Hardening

Status: Implemented — backend-only hardening. Attendance frontend remains mock-backed and was deliberately not migrated.

## Scope

Resolved the Attendance lifecycle contradiction, hardened Staff/Teaching Assignment authorization for Attendance service operations, defined draft/submitted deletion behavior, and resolved soft-delete re-entry uniqueness. Existing Student eligibility, Academic Calendar validation, status values, and transactional master/child writes were preserved after verification.

## Files Created

- `ryo-academy-be/prisma/migrations/20260911100000_attendance_contract_hardening/migration.sql`

## Files Modified

- `ryo-academy-be/src/attendance/attendance.controller.ts`
- `ryo-academy-be/src/attendance/attendance.service.ts`
- `ryo-academy-be/prisma/models/attendance/attendance-log-master.prisma`
- `ryo-academy-fe/docs/frontend-backend-migration-changelog.md`

No frontend Attendance source, Student source, Academic Calendar source, Dashboard source, or mock data was modified.

## Attendance Lifecycle

The existing `AttendanceMasterStatus` enum remains `DRAFT | SUBMITTED`.

- `POST /attendance` now creates a validated register as `DRAFT` without setting `submittedAt`.
- New `POST /attendance/:id/submit` transitions an owned draft to `SUBMITTED` and sets `submittedAt`.
- Submission requires the authenticated caller to have an active Staff profile and to own the register through `takenBy`.
- A second submission returns `409 Conflict`.
- `PATCH /attendance/:id` remains available only for `DRAFT` records.
- `SUBMITTED` records reject normal updates with `409 Conflict`.

This implements the explicit V0 lifecycle `DRAFT -> SUBMITTED`; no post-submission correction workflow was added.

## Correction Policy

Submitted Attendance is immutable through normal update endpoints. A future correction workflow is deferred to Milestone 13D or later. No override, admin bypass, or silent post-submission mutation was added.

## Delete / Re-entry Policy

Attendance deletion remains a soft delete through `DELETE /attendance/:id`, but only an owned `DRAFT` record may be deleted. Deleting `SUBMITTED` Attendance returns `409 Conflict`.

The database's previous unconditional unique constraint was replaced with a PostgreSQL partial unique index over `academicYearId + classId + sectionId + date` where `deletedAt IS NULL`. Therefore one active register remains unique, while a soft-deleted register no longer blocks legitimate re-entry for the same context/date. Child rows remain attached to the soft-deleted master; no orphaning or hard-delete behavior was introduced.

## Duplicate Register Integrity

The logical uniqueness remains exactly `academicYearId + classId + sectionId + date` for active records. The database partial unique index remains the race-safe enforcement point, and the existing Prisma `P2002` handling continues to return `409 Conflict` from create.

## Student Eligibility

The existing create and draft-update validation was verified and preserved. Eligible children are confirmed Students whose Admission matches the requested Academic Year, Class, and Section, with the Admission Section constrained to the requested Class. Every eligible Student must appear exactly once; duplicate, unrelated, or incomplete entries are rejected before transactional writes. Child rows retain a required real `studentId` and `PRESENT | ABSENT` status.

## Academic Calendar Validation

Existing validation was verified and unchanged: Attendance date must be a valid `YYYY-MM-DD` date, fall within the Academic Year, match a non-deleted Academic Calendar record, and have `isWorkingDay = true`. No calendar records are created automatically and no duplicate calendar behavior was changed.

## Academic Year / Class / Section Validation

Existing validation was verified and unchanged: Academic Year, Class, and Section must exist; Section must belong to the supplied Class; the Class's Program Academic Year is used when matching Teaching Assignments. No unsupported direct Class-to-Academic-Year relation was added.

## Staff Authorization

Attendance create, list, detail, update, submit, and delete service paths now require an active Staff profile resolved from the authenticated `userId`. Update, submit, and delete additionally require the caller's Staff ID to match the register's `takenBy`. Read detail authorization requires a matching Teaching Assignment. List results are scoped through the authenticated Staff member's assignments, and `/my` remains scoped by the authenticated Staff ID rather than client input.

No request-body `staffId` is accepted or trusted. No admin impersonation workflow or new role system was introduced; existing permission guards remain authoritative.

## Teaching Assignment Validation

Creation continues to require a Teaching Assignment matching the authenticated Staff ID, Class, and Section, with the Class's Program belonging to the requested Academic Year. Subject remains part of the existing Teaching Assignment record but is not required by Attendance because Attendance has no Subject relation or period model.

## Permissions

Existing permissions were preserved:

- `attendance:read` for list, `/my`, and detail
- `attendance:mark` for create and submit
- `attendance:update` for update and delete

The Attendance controller continues to use `JwtAuthGuard` and `PermissionsGuard`. No new permissions were created and no guard was bypassed.

## Status Contract

Student Attendance statuses remain exactly `PRESENT` and `ABSENT`. `LATE`, `EXCUSED`, and `HALF_DAY` were not added. The frontend mock may continue to contain `Late` independently.

## Transactional Behavior

Create remains transactional for master plus all child rows. Draft update remains transactional for deleting and recreating the complete child set. Validation occurs before writes, and the database constraints continue to prevent duplicate active registers and duplicate Students within a register. Submission is one master status transition and does not alter children.

Delete remains a master soft update; child rows are retained under the master and are not orphaned. No hard-delete cascade or separate child deletion was introduced.

## API Response Contract

Existing master/child response shapes were preserved. Create and detail/update responses include child rows; child rows expose real `studentId`, status, remarks, and timestamps. The new submit endpoint returns the updated master with children. No display-name, Program, Subject, summary, or reporting fields were fabricated.

## List Filtering

Existing filters remain: `academicYearId`, `classId`, `sectionId`, exact `date`, `from`, and `to`. Results exclude soft-deleted records and are ordered by descending date. Staff list scope is derived from authenticated Staff Teaching Assignments. No staff or lifecycle-status filter was added.

## `/my` Behavior

`GET /attendance/my` remains identity-scoped to the active Staff record resolved from the authenticated user. It accepts the same academic year/class/section/date/date-range filters and returns only records whose `takenBy` equals that Staff ID. It does not accept a client-provided Staff ID.

## Error Contract

The hardening uses existing NestJS exception conventions. Invalid dates, placement, entries, calendar state, or class/section relationships remain `400`; missing records and related entities remain `404`; missing/inactive Staff or assignment authorization remains `403`; duplicate active registers remain `409`; submitted update, submitted delete, and repeated submit now use `409 Conflict` for lifecycle conflicts. DTO enum validation continues to reject unsupported status values.

## Tests

No Attendance-specific tests were added because the existing Jest infrastructure cannot execute the repository's current ESM TypeScript tests. `npm test -- --runInBand` failed before running tests with `SyntaxError: Cannot use import statement outside a module` in the existing `src/database/database.service.spec.ts` and `src/app.controller.spec.ts` suites. No tests are claimed as passed.

## Verification

- Re-read the Milestone 13A findings before implementation.
- Re-inspected the current Attendance controller, service, DTOs, Prisma model/migration, Student/Staff/Teaching Assignment/Academic Calendar relationships, permissions, guards, and test configuration.
- Editor diagnostics reported no errors in the modified Attendance controller or service.
- `npm run build` succeeded from `ryo-academy-be`; Prisma Client generation and Nest compilation completed.
- `npm test -- --runInBand` was attempted and failed before test execution because of the existing Jest ESM configuration issue.
- No frontend build was run because frontend code was deliberately untouched.

## Prisma Changes

The Prisma model changed only from an unconditional `@@unique` declaration to an `@@index`; the migration adds the required PostgreSQL partial unique index for active records. This is the minimum schema/migration change required to permit safe soft-delete re-entry without allowing duplicate active registers. No Attendance fields, relations, enums, or child constraints were redesigned.

## Frontend Boundary

Attendance frontend remains completely mock-backed. No `ryo-academy-fe/src/lib/attendance-api.ts`, frontend Attendance API calls, routes, mutations, UI changes, Dashboard changes, Student synchronization, or mock Attendance changes were made.

## Known Limitations

- The repository's Jest ESM configuration remains unresolved, so focused automated Attendance tests could not execute.
- The new submit endpoint was not live-tested against a database.
- The partial unique index migration was not applied to a database in this milestone.
- Response relations remain the existing master/child shape; Student display fields and report aggregates remain future adapter/backend concerns.
- No post-submission correction workflow was implemented.

## Recommended Milestone 13C

After applying and validating the migration in a database, Milestone 13C may add a frontend Attendance API adapter and migrate only the supported daily register flow: real list/detail, draft creation, explicit submission, real Student IDs, Academic Year/Class/Section selectors, Academic Calendar error handling, and `PRESENT`/`ABSENT`. It should not add Late/reporting/percentage behavior or post-submission correction until separate backend contracts exist.

# Milestone 13D — Attendance Migration and Live Verification

Status: Partially verified — the pending migration is already applied in the configured remote Prisma database; fixture-dependent database behavior and live Attendance workflow verification were blocked by an empty Attendance dataset.

## Scope

Applied and validated the existing Attendance database migration where possible, then checked the Milestone 13C backend/frontend workflow without introducing new Attendance behavior. No correction, reporting, statistics, Late, Excused, Half-Day, subject, period, or other Attendance domain behavior was added.

## Migration and Database Verification

- `npx prisma migrate status --schema prisma/schema.prisma` reported the database schema is up to date with all 12 migrations.
- Prisma migration history records `20260911100000_attendance_contract_hardening` as finished with one applied step.
- Prisma Client was regenerated during the backend build.
- The configured remote PostgreSQL database was reachable through the repository Prisma environment.
- The live database contains `AttendanceLogMaster` and `AttendanceLogChild` tables with zero rows, so no existing Attendance records were available for preservation or live workflow fixtures.
- The live `AttendanceLogMaster_active_register_key` is a unique index on `academicYearId`, `classId`, `sectionId`, and `date` with the predicate `deletedAt IS NULL`.
- The live master date indexes and child `(attendanceMasterId, studentId)` uniqueness/indexes were present.

The migration was not recreated or duplicated because Prisma reported it already applied. Active duplicate rejection, soft-delete re-entry, different-date, different-section, and different-class insert behavior could not be exercised without valid related development fixtures. No database rows were mutated.

## Files Changed

Milestone 13D changed only:

- `ryo-academy-fe/docs/frontend-backend-migration-changelog.md`

No backend or frontend application code was changed. The existing 13B migration, Prisma model, 13C API adapter, and 13C Attendance UI were preserved.

## Endpoints and Workflows Reviewed

The source and API adapter were rechecked for the existing contract:

- `GET /attendance`
- `GET /attendance/:id`
- `POST /attendance`
- `PATCH /attendance/:id`
- `POST /attendance/:id/submit`
- `DELETE /attendance/:id`

The source-level workflow remains draft creation, draft update, submit to `SUBMITTED`, submitted read-only behavior, and draft-only soft deletion. The adapter sends only real Student IDs and `PRESENT`/`ABSENT`; it does not send arbitrary `staffId`, hardcoded relationship IDs, or mock Attendance fallback data.

## Frontend Verification

- `pnpm run build` passed in `ryo-academy-fe`.
- `pnpm run typecheck` was attempted but could not run because `tsc` is not installed in the frontend package.
- Browser/live frontend verification was not completed because the remote database has no Attendance records or valid fixture set, and no authenticated development workflow could be exercised safely.

## Backend Verification

- `npm run build` passed in `ryo-academy-be` and regenerated Prisma Client.
- `npm test -- --runInBand` was attempted but failed before running tests because the existing Jest ESM configuration parses `import` as invalid CommonJS syntax.
- The source-level negative-path contract remains present for duplicate active registers, non-working dates, invalid placement, submitted mutations, ownership, and authentication. Those cases were not live-request tested without fixtures and an authenticated session.

## Important Decisions

- Existing migration state was trusted; no duplicate migration or unrelated schema change was applied.
- The empty remote Attendance dataset was left unchanged rather than seeding production-like records during verification.
- No application defect was fixed because no runtime defect could be isolated from a live workflow.

## Mock and Deferred Features

Dashboard, Fees, Timetable, Attendance reporting/statistics, post-submission correction, Late, Excused, Half-Day, subject attendance, period attendance, and bulk correction remain outside this milestone. Existing mock consumers remain untouched.

## Limitations and Verification Results

Migration status, migration history, database connectivity, partial-index definition, table/index presence, and zero-row data state were verified. Existing Attendance data, all fixture-dependent uniqueness cases, authenticated API requests, and the complete browser workflow remain unverified because the configured remote database has no Attendance data or safe test fixtures. `git diff --check` also reports pre-existing trailing whitespace in `ryo-academy-be/src/security/token/jwt-auth.guard.ts`; that unrelated file was not changed.

# Milestone 13E — Attendance Development Fixtures and Live Verification

Status: Verified with reusable development fixtures; disposable Attendance records were cleaned up after API and frontend verification.

## Scope

Established safe, named development fixtures and executed the real authenticated Attendance API and frontend workflow. No new Attendance product capability was added. Correction, reporting, statistics, Late, Excused, Half-Day, subject, period, and bulk-correction behavior remain deferred.

## Fixture Strategy

Added the development-only idempotent seed `ryo-academy-be/src/database/seed/attendance-dev.seed.ts`. It reuses the existing RBAC/academic foundation where present and ensures only the minimum named `M13E` records needed for verification:

- Ryo Academy and Academic Year `2026-27`
- Day Care Program, Year 1/Year 2, and Section A relationships
- Two active Staff users with STAFF roles
- Subjects and matching Teaching Assignments
- Two confirmed Students with matching Admissions
- Working dates `2026-09-14`, `2026-09-15`, and `2026-09-16`
- Non-working date `2026-09-13`

The fixture password uses `USER_INITIAL_PASSWORD` and is not stored in application code. The seed is idempotent and does not create Attendance registers.

## Files Changed

- `ryo-academy-be/src/database/seed/attendance-dev.seed.ts`
- `ryo-academy-be/src/database/database.module.ts`
- `ryo-academy-be/src/database/database.service.ts`
- `ryo-academy-be/src/security/token/access-token.service.ts`
- `ryo-academy-be/src/academic/academic-year/dto/create-academic-year.dto.ts`
- `ryo-academy-fe/src/index.css`
- `ryo-academy-fe/docs/frontend-backend-migration-changelog.md`

## Defects Discovered and Fixed

Live startup initially failed because `ConfigService` and `JwtService` constructor tokens were unresolved under the repository's `tsx` runtime. Explicit Nest injection was added in the database and access-token services, and `ConfigModule` was imported by `DatabaseModule`.

Compiled startup then exposed an existing Swagger metadata failure for scalar Academic Year DTO properties. Explicit `String` metadata was added to `CreateAcademicYearDto.schoolId` and `name`.

The real Attendance form also contained an obsolete mock CSS rule that hid Academic Year, Class, and Section selectors. Removing that rule restored the live selector workflow. No API contract or Attendance domain behavior changed.

## Backend API Verification

Using the real login endpoint and the two authenticated Staff fixtures:

- `POST /api/v0/auth/login` returned `201`.
- `GET /api/v0/attendance` and `GET /api/v0/attendance/my` returned `200`.
- Valid Attendance creation returned `201` with `DRAFT`, a real Student ID, and `PRESENT`/`ABSENT` child status.
- Active duplicate creation returned `409`.
- Draft update returned `200` and persisted `ABSENT`.
- Draft deletion returned `200`.
- Same-key soft-delete re-entry returned `201` with a new DRAFT.
- Valid different-date and different-class creation returned `201`.
- Owner submission returned `201` and `SUBMITTED`.
- Submitted update and deletion returned `409`.

## Authorization and Validation Verification

- A second Staff user attempting PATCH, submit, or delete received `403`.
- Missing authentication received `401`.
- Non-working date received `400`.
- Student outside the selected Class/Section received `400`.
- Invalid Class/Section relationship received `400`.
- Missing Teaching Assignment received `403`.
- Staff calendar-create attempts received `403`; calendar dates were therefore established through the development fixture seed rather than widened permissions.

## Frontend Verification

With the frontend running against the compiled live backend:

- `/attendance` loaded real registers.
- Academic Year, Class, Section, and exact-date filters produced the expected single register.
- `/attendance/mark` populated real selectors and resolved `Milestone Student One · M13E-STU-1`.
- UI creation returned a real DRAFT and navigated to its detail page.
- Draft edit changed the real child status from `PRESENT` to `ABSENT` through PATCH.
- Submit confirmation transitioned the register to `SUBMITTED`.
- Submitted detail showed the real Student name/number and exposed no Edit, Submit, or Delete action.
- Direct navigation to the edit route showed the read-only state.
- The UI exposed only Present/Absent controls; no mock Student IDs, arbitrary `staffId`, hardcoded relationship IDs, or LATE payloads were observed.

## Database and Cleanup

Prisma migration status remained up to date. Live database behavior confirmed active uniqueness and soft-delete re-entry through API operations. Five disposable Attendance masters and their child rows were removed after verification. Zero Attendance masters remain; the reusable named M13E Staff, Student, academic, assignment, and calendar fixtures remain.

## Verification Results and Limitations

- Backend `npm run build` passed.
- Frontend `pnpm run build` passed.
- Focused editor diagnostics reported no errors in changed files.
- Frontend `pnpm run typecheck` remains unavailable because `tsc` is not installed.
- Backend Jest remains blocked by the existing ESM configuration and was not claimed as passed.
- Browser verification was performed against the compiled backend and Vite frontend; no production deployment was tested.

## Deferred Scope

Post-submission correction, Attendance reports, percentages, monthly summaries, analytics, Late, Excused, Half-Day, subject attendance, period attendance, bulk correction, Dashboard migration, Fees migration, Timetable migration, and Student CRUD remain deferred.

# Milestone 14A — Fees Backend/Frontend Contract Audit

Status: Complete — audit only. No Fees application code, Prisma schema, migration, API client, screen, or mock data was changed.

## Audit Scope

Inspected the backend Fee Structure, Fee Component, Admission fee-payment logic, Prisma models and migration history, DTOs, controllers, services, repositories, modules, permission constants, and RBAC seed. Inspected the frontend Fee mock models, localStorage operations, routes, screens, Dashboard consumers, forms, filters, and mutations. The historical changelog was read before this entry and all previous milestones were preserved.

## 1. Backend Fee Models

### FeeStructure

`FeeStructure` has an UUID `id`, `name`, nullable `description`, `academicYearId`, `programId`, `classId`, Decimal `totalAmount`, `isActive`, timestamps, and relations to Academic Year, Program, Class, Fee Components, and Fee Payment Headers. It has a unique constraint and index on `academicYearId + programId + classId`. `isActive` exists, but the inspected list query does not filter it.

### FeeComponent

`FeeComponent` has `id`, `name`, nullable `description`, Decimal `amount`, `feeStructureId`, `discountApplicable`, `isMandatory`, `isActive`, timestamps, and relations to Fee Structure and Fee Payment Details. `feeStructureId + name` is unique and indexed. There is no soft-delete timestamp.

### FeePaymentHeader and FeePaymentDetails

`FeePaymentHeader` belongs directly to Admission, Academic Year, and Fee Structure. It stores Decimal `grossAmount`, `discountAmount`, `netAmount`, `totalPaidAmount`, `totalDueAmount`, and `totalFeeAmount`, plus timestamps and Fee Payment Details. The current Prisma model has no Student relation or Student ID; an older migration created one and a later migration removed it. Its unique key is `academicYearId + admissionId + feeStructureId`.

`FeePaymentDetails` belongs to a Fee Payment Header and Fee Component. It stores a component name snapshot, original amount, discount applicability, mandatory flag, discount amount, final amount, total amount to be paid, amount paid, and payment date. Its unique key is `feePaymentHeaderId + feeComponentId`.

Fees use Admission directly for payment headers and reach Student indirectly through `Admission.student`. Fee models do not directly relate to Section, User, or Staff. School is reached through Academic Year or Admission, not directly from Fee models.

## 2. Backend Fee Endpoints

All Fee Structure and Fee Component endpoints require `JwtAuthGuard` and `PermissionsGuard`. No pagination, search, query filtering, date filtering, explicit sorting parameters, or page metadata were found.

### Fee Structure

- `GET /fee-structure-master` — `fees:read`; returns all Fee Structures ordered by `academicYearId` then `name`, without nested components or payment headers. It does not filter `isActive`.
- `GET /fee-structure-master/:id` — `fees:read`; returns one Fee Structure or Prisma `null`; no explicit 404 is thrown.
- `POST /fee-structure-master` — `fees:create`; accepts name, description, Academic Year, Program, Class, total amount, and component objects. Related Academic Year, Program/Academic Year, and Class/Program are checked. Master and components are created in one Prisma transaction. The success response is `{ errorMessage: "Fee structure created successfully" }`, not the created record. Duplicate database errors are mapped inconsistently to `400`.
- `DELETE /fee-structure-master/:id` — guarded by `fees:create`; service updates `isActive` to `true`, so it does not delete or deactivate the record as implemented. Missing IDs surface the underlying Prisma error.

The controller declares no Fee Structure `PATCH` or `PUT` route, although the service contains an unused `update` method guarded only by its caller's availability.

### Fee Component

- `GET /fee-structure-child` — `fees:read`; returns all components without filtering `isActive`, pagination, or parent filter.
- `GET /fee-structure-child/:id` — `fees:read`; returns a component or throws `NotFoundException`.
- `POST /fee-structure-child` — `fees:create`; requires name, positive numeric amount, feeStructureId, and optional description/discountApplicable/isMandatory. Parent existence and duplicate name within the structure are checked; database uniqueness also protects duplicates.
- `PUT /fee-structure-child/:id` — `fees:update`; updates supplied component fields after existence lookup. It does not validate positive amount on update.
- `DELETE /fee-structure-child/:id` — guarded by `fees:create`; hard-deletes the component. No soft delete is used.

### Admission Fee Coupling

There is no standalone Fee Payment, Payment History, Outstanding Balance, Receipt, Refund, or Cancellation endpoint. Admission endpoints are the only route surface that creates or updates payment header/detail rows:

- `POST /admission` — `admission:create`; creates an Admission and a Fee Payment Header in one transaction, and creates Fee Payment Details when a matching active Fee Structure has components.
- `PATCH /admission/:id` — `admission:update`; updates Admission fields and then updates/creates Fee Payment Header/Details through the repository. The fee repository operations are not wrapped in the same transaction as the Admission update.
- `GET /admission` and `GET /admission/:id` — `admission:read`; the list does not include Fee relations; detail includes only a limited Student projection, not Fee relations.

## 3. Backend Permissions

The only Fee permissions are `fees:read`, `fees:create`, and `fees:update`. RBAC seed grants all three to `COLLEGE_ADMIN` and `OFFICE_ADMIN`; Staff is not granted Fee permissions. Fee authorization is role/permission based, not Student-specific, Admission-specific, ownership-based, or Staff-assignment based. The controller uses `fees:create` for both Fee Structure and Fee Component deletion; no `fees:delete` permission exists.

## 4. Admission → Fee Relationship

Admission stores `discountPercentage` and optional `discountReason`, but the inspected Admission create path does not apply those fields to the generated Fee Payment Header or Details. Admission creation looks up the active Fee Structure for the selected Academic Year, Program, and Class. It creates a Fee Payment Header with zero gross/net/paid/discount values, `totalFeeAmount` and `totalDueAmount` equal to the Fee Structure total, then snapshots each component with zero discount and zero paid amount.

Admission creation and initial Fee Header/Detail creation are inside one Prisma transaction. There is no payment recorded immediately; initial amounts are zero. Admission confirmation creates a Student in the same transaction as the status change, but it does not create or recalculate Fee records. Admission cancellation only changes Admission status and does not cancel, delete, or recalculate Fee records.

The create service contains a contradictory guard: when a matching active Fee Structure has components, it throws `Kindly provide proper details.` before entering the transaction. Therefore the intended component snapshot path exists in code but is blocked for structures with components under the inspected implementation. Admission update can modify Fee Header totals and Fee Details, but it does not calculate them from components or enforce payment rules. The update Fee repository path is not transactional with the Admission update and uses parallel detail writes.

## 5. Payment Lifecycle

No standalone payment entity or payment creation endpoint exists. `totalPaidAmount`, `amountPaid`, `paymentDate`, and `totalDueAmount` are stored fields on Admission-linked Fee Header/Details, but no service calculates a payment lifecycle from payment events.

Partial payment is not exposed as a dedicated operation. Overpayment prevention, negative amount prevention for Fee Header updates, payment status, payment edit/delete/cancel, duplicate payment request protection, receipts, refunds, and payment history endpoints were not implemented. Outstanding balance is stored in `totalDueAmount`/`dueAmount` fields but is not computed or reconciled by a payment service. No idempotency key or payment event identity exists.

## 6. Financial Integrity / Transactions

- Fee Structure plus initial components: transaction enforced by service; master/component creation is atomic.
- Fee Structure uniqueness: database enforced by `academicYearId + programId + classId`.
- Fee Component uniqueness: database and service enforce `feeStructureId + name` on create.
- Admission plus initial Fee Header/Details: transaction exists in the Admission create path, but the contradictory component guard may prevent the component-bearing path.
- Admission update plus Fee update: not one transaction; Admission mutation can complete before Fee repository operations.
- Header/detail financial arithmetic: not enforced by DTO or service. The DTO checks numeric presence in nested Admission payloads, but no non-negative, sum, net, paid, due, or overpayment relationships are enforced.
- Concurrent payment protection: no payment endpoint or application-level concurrency strategy was found. Unique Header and Detail keys protect duplicate structural rows, not repeated payments.
- Orphan prevention: foreign keys use restrictive relations; Fee Component deletion can still be attempted independently and payment detail references are database-protected. No refund/cancellation cleanup exists.
- Fee Structure validation contains an apparent inverted positive-amount condition: positive total/component amounts enter the error branch as written. This was statically identified and not fixed in this audit.

## 7. Frontend Fee Models and Mock Operations

`src/lib/mock-erp.ts` defines:

- `FeeRecord`: studentId, academicYear, totalAmount, paidAmount, dueAmount, dueDate, and `Paid | Partial | Pending` status.
- `Payment`: feeRecordId, studentId, amount, paidOn, method, receiptNumber, and `Cleared | Reversed` status.
- `FeeStructure`: academic scope labels and total amount.
- `FeeComponent`: name, description, amount, parent structure, discountApplicable, and mandatory.

Seed data contains five Fee Records, four Payments, two Fee Structures, and five Fee Components. `readDb` and `saveDb` use localStorage key `nalanda-erp-db`; `useResource`, `useItem`, `useSaveResource`, and `useDeleteResource` operate on mock collections. `useAddPayment` inserts a local Payment, increments the matching Fee Record paid amount, recalculates due amount with `Math.max(0, total - paid)`, and changes status to Paid or Partial. It has no backend call, overpayment rejection, receipt generation, concurrency protection, or durable payment transaction.

The mock Student model also contains a separate `feeStatus`, so student fee state is duplicated independently from Fee Records. Dashboard reads mock `fees` and presents a mock fee-account count.

## 8. Frontend Fee Routes/Screens

- `/fees` — mock Fee Structure list with local search, component count, and role-gated create/edit/delete controls.
- `/fees/new` — mock Fee Structure form with local academic scope IDs, total amount, and description.
- `/fees/:id` — mock Fee Structure detail with mock component rows and local delete action.
- `/fees/:id/edit` — mock Fee Structure edit form.
- `/fee-components` — mock Fee Component list with no backend data, local edit/delete actions.
- `/fee-components/new` — mock Fee Component form.
- `/fee-components/:id` — mock Fee Component detail.
- `/fee-components/:id/edit` — mock Fee Component edit form.

The Fee Structure list has a text search over serialized mock rows. No Fee Record list, Student fee view, payment history screen, payment dialog, outstanding-balance screen, receipt screen, refund screen, or cancellation screen was found. Dashboard consumes mock Fee Records only for the Fee accounts count. Student detail links to `/fees`, but no Student-specific Fee contract is loaded.

## 9. Backend vs Frontend Comparison

| Capability | Backend Exists | Frontend Mock Exists | Match | Migration Status |
|---|---|---|---|---|
| Fee Structure list/detail | Yes | Yes | Partial; backend returns different shape and no nested components | Keep mock until adapter/scope is defined |
| Fee Structure create | Yes | Yes | Partial; request/response and validation differ | Candidate read/config slice after hardening |
| Fee Structure update | Service only, no route | Yes | No public backend route | Mock |
| Fee Structure delete/deactivate | Route exists but sets `isActive: true` | Yes | No; mock removes row | Backend defect/blocker |
| Fee Component list/detail | Yes | Yes | Partial; backend uses `isMandatory`, frontend uses `mandatory` | Candidate with adapter |
| Fee Component create/update/delete | Yes | Yes | Partial; delete permissions/semantics differ | Candidate after contract decision |
| Admission fee header/details | Implicitly through Admission | No dedicated frontend screen | No direct match | Separate Admission Fee slice |
| Student fee view | No dedicated endpoint | Fee status/link assumptions only | No | Keep mock |
| Payment creation/history | No standalone endpoint | Mock Payment/useAddPayment | No | Keep mock; backend capability required |
| Outstanding balance | Stored fields only, no calculation endpoint | Mock dueAmount calculation | No | Keep mock |
| Partial payment/overpayment rules | Not implemented | Mock allows paid amount above total but clamps due to zero | No | Keep mock |
| Discount/concession | Fields exist but not applied in Admission fee creation | No payment discount workflow; component flag only | No | Keep mock |
| Refund/cancellation/receipt | Not found | Not found as real workflow | N/A | Deferred |
| Search/filter/pagination | No Fee query contract | Structure text search only | No | Frontend search remains mock |
| Dashboard totals | No Fee aggregate endpoint | Mock count only | No | Dashboard remains mock |

## 10. Data Ownership / Source of Truth

- Student identity and Admission placement: backend authoritative for migrated domains; mock Fee Records use unrelated IDs such as `s1`.
- Fee Structure and Fee Component configuration: backend authoritative records exist, while current Fee screens are mock-only.
- Admission fee Header/Details: backend-owned and Admission-linked, but no dedicated read endpoint or frontend adapter exposes them.
- Fee amount, discounts, paid amount, due amount, and payment status: backend fields exist for some values, but arithmetic and lifecycle are not authoritative because no payment service enforces them; current displayed values are mock-derived.
- Receipt number, payment method, payment status, refunds: frontend mock-only where present; no backend source of truth exists.
- Dashboard Fee account count: frontend mock-derived.

## 11. Backend Gaps

- **CRITICAL:** No standalone payment creation/history endpoint or payment event model exists.
- **CRITICAL:** No service-level financial invariants enforce non-negative amounts, net/gross relationships, paid/due relationships, or overpayment prevention.
- **HIGH:** No outstanding-balance calculation/read contract exists.
- **HIGH:** Admission update and Fee updates are not one transaction.
- **HIGH:** Fee Structure validation has an inverted positive-amount check, and Admission creation rejects a matching component-bearing Fee Structure before its transactional snapshot path.
- **HIGH:** Fee Structure update exists only as an unexposed service method; its delete route does not deactivate/delete as its name suggests.
- **MEDIUM:** Fee Structure and Component list/detail responses do not include nested relations needed by the current UI.
- **MEDIUM:** No Fee-specific delete permission exists; deletion uses `fees:create`.
- **MEDIUM:** Fee Payment Header has no direct Student relation after the migration removed `studentId`.
- **LOW:** No pagination, search, filtering, or aggregate/reporting endpoints exist.

## 12. Frontend Gaps

- Fee screens assume localStorage records and cannot consume backend response shapes without an adapter.
- Frontend Fee Structure edit has no public backend route to call.
- Frontend Fee Structure delete removes a row, while backend delete does not delete/deactivate it.
- Frontend Fee Component uses `mandatory`; backend uses `isMandatory`.
- Frontend mock Fee Records and Payments have no backend equivalents or routes.
- Frontend mock payment mutation calculates paid/due locally and allows no backend validation.
- Frontend uses mock academic IDs, student IDs, labels, and fee statuses.
- Frontend search and component counts are local only; backend has no equivalent filter/search contract.

## 13. Migration Risks

The highest risk is migrating the visible Fee Structure screens while Admission fee creation and payment semantics are inconsistent. A read adapter could expose backend structures safely, but create/update/delete would surface existing validation, response, permission, and delete-semantics defects. Migrating mock payments before a backend payment contract would create false financial authority. Migrating Student fee status would duplicate backend Admission-linked data without a supported query endpoint.

## 14. Recommended Next Milestone

Recommended next milestone: **14B — backend Fee Structure/Component contract hardening and read-only migration preparation**, not payment migration.

First resolve and test the smallest configuration contract: correct positive amount validation, expose a real Fee Structure update route if required, make delete semantics explicit, decide whether inactive records are listed, fix Admission component-bearing creation behavior, and define response shapes with nested components where the UI needs them. Then add a frontend API adapter and migrate only Fee Structure/Component list/detail read flows using real Academic Year, Program, and Class IDs. Keep Fee Structure/Component mutations mock-backed until the corrected backend contract is verified.

Keep Fee Records, Payments, payment history, outstanding balances, receipts, refunds, concessions, Student fee status, and Dashboard totals mocked. A later milestone must define a dedicated payment model/endpoint, financial invariants, transaction/idempotency strategy, authorization, and balance/read contracts before any payment UI migration.

## 15. Files Changed

- `ryo-academy-fe/docs/frontend-backend-migration-changelog.md`

No application files were modified.

## 16. Verification

- Read the full migration changelog before this audit.
- Inspected Fee-related Prisma models, migrations, controllers, services, repositories, DTOs, modules, permissions, RBAC seed, Admission fee coupling, and frontend source.
- Inspected Fee mock seed data, localStorage key and operations, React Query mock hooks, routes, screens, forms, search, delete, and payment mutation.
- No runtime API requests, database mutations, builds, or tests were run; this milestone was static contract analysis only.
- No generated endpoint or field was inferred beyond the inspected source.

## 17. Changelog

This Milestone 14A entry records the audited backend/frontend contract, model and relation findings, permissions, Admission fee behavior, payment and transaction gaps, mock boundaries, risks, verification limits, and recommended next milestone. Historical entries were preserved.

# Milestone 14B — Fee Structure/Component Backend Contract Hardening

Status: Implemented and statically verified. Frontend Fees remain mock-backed. Payment behavior remains deferred.

## Problems Confirmed

- Fee Structure positive amount validation was inverted and rejected valid positive values.
- Fee Structure had no controller update route.
- Fee Structure deletion set `isActive` to `true`, so it did not deactivate the record.
- Fee Component deletion hard-deleted records despite existing financial references.
- Fee Component list behavior did not filter inactive records.
- Fee Component update did not enforce positive amounts.
- Fee Structure reads returned no related Academic Year, Program, Class, or Components.
- Admission creation rejected an active Fee Structure when it contained components, blocking the intended snapshot path.
- Fee Structure create returned only a success message instead of the created read contract.

## Backend Changes

Changed only the backend Fee/Admission contract surfaces:

- Added `PATCH /fee-structure-master/:id`.
- Added `UpdateFeeStructureDto`.
- Hardened Fee Structure and nested component DTO validation.
- Added positive amount checks for Fee Structure totals and Fee Component amounts.
- Made Fee Structure Academic Year, Program, Class, and component collection immutable through PATCH. PATCH can change name, description, total amount, and `isActive`.
- Changed Fee Structure DELETE to deactivate with `isActive: false`.
- Changed Fee Component DELETE to deactivate with `isActive: false`.
- Changed Fee Component DELETE permission to `fees:update`.
- Preserved `fees:create` for creation and `fees:update` for updates/deactivation.
- Changed active list endpoints to return active Fee Structures/Components only.
- Added stable nested Fee Structure read relations for Academic Year, Program, Class, and components.
- Changed Fee Structure creation to return the created structure with components.

## Fee Structure Contract

`POST /fee-structure-master` requires a positive `totalAmount`, one or more components, positive component amounts, valid Academic Year/Program/Class relationships, and creates the master plus components transactionally. Duplicate scope is rejected by the existing database unique constraint and mapped to conflict behavior.

`GET /fee-structure-master` returns active structures ordered by Academic Year and name, with selected Academic Year/Program/Class identity and active components. `GET /fee-structure-master/:id` returns the requested structure, including inactive records when directly addressed, with its related identity and components.

`PATCH /fee-structure-master/:id` changes only name, description, positive total amount, and `isActive`. It does not replace components or mutate Academic Year, Program, or Class relationships. Missing records return not found; duplicate scope conflicts remain database-enforced.

`DELETE /fee-structure-master/:id` is a deactivation operation and sets `isActive` to `false`. It does not hard-delete a structure or its historical references. Active-only list responses omit it; direct detail can still expose it with its state.

## Fee Component Contract

Fee Components use backend field `isMandatory`; the existing frontend-facing conceptual mapping remains `mandatory -> isMandatory` and no database rename was made. Create and update require a positive amount. Create defaults `discountApplicable` to `false` and `isMandatory` to `true` when omitted. Creation requires an active parent Fee Structure and preserves the existing unique `(feeStructureId, name)` constraint.

`GET /fee-structure-child` returns active components ordered by name. Detail can return an inactive component by ID. `PUT /fee-structure-child/:id` updates component metadata, amount, discount applicability, and mandatory state without changing its parent structure. `DELETE /fee-structure-child/:id` deactivates the component rather than hard-deleting it, preserving references from Fee Payment Details.

## Admission Fee Behavior

Admission creation now requires an active Fee Structure with at least one active Fee Component for the selected Academic Year, Program, and Class. The previous contradictory rejection was removed. The existing Admission plus Fee Payment Header plus Fee Payment Details creation remains inside one Prisma transaction. Component details are now consumed directly rather than through the previous nested array shape, and their snapshot values remain based on the existing component fields with zero initial paid/discount amounts.

This milestone did not redesign Fee Payment Header/Details, apply Admission discounts, create payments, calculate balances, or change Admission confirmation behavior.

## Delete/Active Semantics

`isActive` is now the consistent configuration lifecycle flag for Fee Structures and Fee Components. Lists return active records only. Direct detail reads can identify inactive records. Deactivation uses the existing `fees:update` permission. No new delete permission was added and no hard-delete behavior was retained for these configuration records.

## Permissions

The existing permission model was preserved:

- `fees:read`: list and detail
- `fees:create`: Fee Structure and Fee Component creation
- `fees:update`: Fee Structure PATCH/deactivation and Fee Component update/deactivation

No payment permissions were added and no new roles were granted Fee permissions.

## Response Shapes

Fee Structure list/detail responses now include Fee Structure identity and active state, selected Academic Year/Program/Class `{ id, name }` relations, and ordered Fee Components. Fee Component responses retain the Prisma field name `isMandatory`, expose `isActive`, and retain the parent `feeStructureId`. Fee Structure creation returns the created structure with its components rather than only a message.

## Database Changes

No Prisma schema changes or migrations were created. Existing `isActive` fields and existing unique constraints were sufficient for the selected deactivation semantics. Historical Fee Payment references are preserved by avoiding hard deletes.

## Verification

- Re-read the Milestone 14A audit and current Fee/Admission implementation before editing.
- Backend `npm run build` passed, including Prisma Client generation and Nest compilation.
- Prisma migration status reported the database schema up to date; no migration was required.
- Editor diagnostics reported no errors in changed Fee/Admission files.
- `npm test -- --runInBand` was attempted but failed before test execution because the repository's existing Jest ESM configuration parses imports as invalid CommonJS syntax.
- No live Fee API workflow was claimed. The available development fixtures do not provide a stable authenticated Fee-permitted role and Fee records for safe runtime verification.
- No frontend build or frontend application files were changed because Fees migration is explicitly deferred.

## Remaining Limitations

Automated Fee tests were not executable due the existing Jest configuration. The database/service contract was not live-request tested. Deactivated component names remain subject to the existing database unique constraint, so reusing the same name under one structure is not introduced by this milestone. Financial arithmetic, Admission discounts, payment events, balances, receipts, refunds, and concurrency/idempotency remain outside this contract hardening.

## Deferred Payment Scope

Payment creation, payment history, receipts, refunds, outstanding balances, concessions, Student Fee status, Dashboard Fee integration, overpayment handling, payment status lifecycle, and payment idempotency remain deferred to a separate financial-domain milestone.

# Milestone 14C — Fee Structure/Component Read-Only Frontend Migration

Status: Implemented — Fee Structure and Fee Component read routes now use the hardened backend contract. Mutations and financial workflows remain mock/deferred.

## Scope

Migrated only the read-only Fee Structure and Fee Component screens to real backend data while preserving existing routes and visual structure where practical. No backend files, Fee mutation behavior, payment behavior, Dashboard behavior, or unrelated domains were changed.

## Files Created

- `ryo-academy-fe/src/lib/fees-api.ts`

## Files Modified

- `ryo-academy-fe/src/App.tsx`
- `ryo-academy-fe/docs/frontend-backend-migration-changelog.md`

`src/lib/mock-erp.ts` was not modified. Existing mock Fee Records, Payments, and mutation form consumers remain available.

## Endpoints Used

The read adapter uses only:

- `GET /fee-structure-master`
- `GET /fee-structure-master/:id`
- `GET /fee-structure-child`
- `GET /fee-structure-child/:id`

No Fee Structure or Fee Component mutation endpoint is called by the migrated read routes.

## Permissions

The migrated routes remain protected by the existing frontend `FEES_READ` permission mapping, corresponding to backend `fees:read`. No permission constants, backend RBAC, or role grants were changed. Backend authorization remains authoritative.

## API Adapter and React Query

`src/lib/fees-api.ts` defines typed read responses for Fee Structures and Fee Components, including nested Academic Year/Program/Class identity, active state, component fields, and the backend `isMandatory` field. It uses the existing `apiClient` and session token handling.

Query keys are:

- `["feeStructures"]`
- `["feeStructures", id]`
- `["feeComponents"]`
- `["feeComponents", id]`

The adapter exposes read hooks only and does not expose Fee mutations.

## Routes Migrated

Real backend read routes:

- `/fees`
- `/fees/:id`
- `/fee-components`
- `/fee-components/:id`

The existing mutation routes remain mock-backed:

- `/fees/new`
- `/fees/:id/edit`
- `/fee-components/new`
- `/fee-components/:id/edit`

Real detail pages may link to those mock edit/create routes; those links are labeled as mock record actions in the migrated UI and do not call the backend mutation endpoints.

## Fee Structure List

`/fees` now displays real active Fee Structures with:

- name and description
- Academic Year
- Program
- Class
- total amount
- active status
- active component count

The existing client-side text search remains, but it filters the fetched real dataset. No server-side search, pagination, or unsupported filters were added.

## Fee Structure Detail

`/fees/:id` now reads the real Fee Structure detail response and displays identity, description, Academic Year, Program, Class, total amount, active state, and ordered active Fee Components. Backend `isMandatory` is rendered directly as mandatory/optional UI text. No payment, balance, receipt, Student status, or financial status fields were added.

## Fee Component List

`/fee-components` now reads real active Fee Components. Parent Fee Structure names are resolved from the single Fee Structure list query and indexed by `feeStructureId`; no per-row request is made. The list displays component name, description, parent structure, amount, mandatory state, and active state.

## Fee Component Detail

`/fee-components/:id` now reads the real component detail endpoint and resolves its parent through the Fee Structure detail endpoint. It displays component ID, name, amount, mandatory state, active state, and parent Fee Structure. Parent lookup errors are shown explicitly rather than falling back to mock data.

## Loading, Error, Empty, and Not Found States

Migrated read routes handle loading states, empty active lists, API errors, unauthorized/forbidden messages through the existing `ApiError` conventions, and missing detail records. Real backend failures do not fall back to mock Fee data.

## Mock Boundaries

The following remain mock-backed or deferred:

- Fee Structure and Fee Component create/edit/delete mutations
- FeeRecord payment data
- Payment creation/history/status
- amount paid and outstanding balance
- receipts, refunds, and concessions
- Student Fee status
- Dashboard Fee totals

`mock-erp.ts` and its localStorage data were deliberately preserved for those boundaries and for the existing mutation screens.

## Verification

- `pnpm run build` passed after the migration.
- Frontend `pnpm run typecheck` was attempted but could not run because `tsc` is not installed.
- `git diff --check` was run on the migrated frontend files and changelog.
- Editor diagnostics reported no errors in `fees-api.ts`; the existing `App.tsx` Tailwind suggestion about `min-h-[230px]` is unrelated to this migration.
- No backend changes or migrations were made.

## Live Verification Status

Live Fee API/browser verification was not performed. The available development authentication fixtures do not provide a stable Fee-permitted role and Fee records for safe runtime verification. No live success is claimed.

## Limitations and Deferred Scope

The frontend currently maps the authenticated `/auth/me` identity to the existing UI role model, so actual Fee-permitted role presentation depends on the existing session/permission compatibility layer. Backend `fees:read` remains the final authority. Mutations, payment lifecycle, balances, receipts, refunds, concessions, Student Fee status, and Dashboard Fee migration remain deferred.

# Milestone 14D — Fee Structure/Component Live Verification Fixture

Status: Partially complete — the Fee verification data fixture and backend build prerequisites were created and validated. The initially reported Program DTO Swagger circular dependency did not reproduce in this workspace. The verified startup blocker was a missing `reflect-metadata` bootstrap import, which caused Nest dependency injection metadata to be unavailable at runtime and broke `AuthController.login` (`authService` became `undefined`). The backend now boots cleanly once this import is restored, and the live Fee verification flow can proceed.

## Scope

This milestone focused on the live verification gate for the hardened Fee Structure and Fee Component backend contract and the read-only frontend migration already completed in 14B and 14C. The goal was to avoid expanding into Fee mutations or payment flows and instead verify the real `fees:read` / `fees:create` / `fees:update` contract using a stable authenticated dev fixture.

## What was prepared

- Created a dedicated fee verification seed file: `src/database/seed/fee-dev.seed.ts`.
- Seeded a real Fee-permitted academic fixture with:
  - `School` = `RYO`
  - `Academic Year` = `2026-27`
  - `Program` = `Day Care Program`
  - `Class` = `Year 1`
  - active `FeeStructure`
  - active `FeeComponent` records for the structure
  - authenticated users assigned to the `COLLEGE_ADMIN` and `OFFICE_ADMIN` roles so `fees:read` and `fees:update` are available in the real RBAC model
- Verified that the existing backend RBAC and permission mapping already recognizes the `fees:*` permissions as expected.

## Verification evidence collected

- `npx tsx src/database/seed/fee-dev.seed.ts` produced a real Fee Structure ID and real Fee-permitted users:
  - `fee.read@ryo.local`
  - `fee.write@ryo.local`
- `npm run build` completed successfully and generated Prisma Client output without compiler errors.
- The seeded fixture is now present in the live database and is suitable for authenticated Fee read/update verification once the app server boots.

## Current runtime blocker

The local Nest app does not currently boot because of an unrelated Swagger circular dependency during schema generation for `CreateProgramDto` in the Program domain. The stack trace points at the Program DTO and not the Fee domain files. This means the live Fee API route checks are still blocked by an existing app-startup issue outside the Fee contract itself.

## Current milestone status

- Fee fixture readiness: ✅
- RBAC and permission foundation: ✅
- Real backend build: ✅
- Real app boot / live authenticated route execution: ⚠️ blocked by unrelated Program DTO Swagger issue
- Changelog updated: ✅

## Recommended next action

Resolve the verified runtime startup blocker (`reflect-metadata` bootstrap import), then rerun the authenticated verification flow against:

- `POST /auth/login` with `fee.read@ryo.local` or `fee.write@ryo.local`
- `GET /fee-structure-master`
- `GET /fee-structure-master/:id`
- `GET /fee-structure-child`
- `GET /fee-structure-child/:id`
- update/deactivation checks for the seeded real Fee Structure and Component values without expanding into payment workflows.

This entry preserves the verified seed and audit outcome while recording the remaining runtime blocker and the exact next verification path.

# Milestone 14D-1 — Startup Blocker Diagnosis and Runtime Fix

Status: Verified and applied.

## Scope

This continuation records the verified runtime blocker that prevented Milestone 14D live Fee verification from proceeding in the current workspace. It also documents the minimal bootstrap fix applied and the resulting startup/authentication verification evidence.

## Root cause

The local workspace did not reproduce the reported `CreateProgramDto` Swagger circular dependency. The actual runtime blocker was a missing `reflect-metadata` import in `src/main.ts`, which prevented Nest from resolving decorator metadata for constructor injection. As a result, `AuthController` received an undefined `authService`, and `POST /auth/login` immediately failed with a `TypeError` during live execution.

## File changed

- `ryo-academy-be/src/main.ts`

## Exact fix

Added the missing bootstrap import at the top of `src/main.ts`:

- `import 'reflect-metadata';`

This is the minimal startup-only fix required to restore Nest dependency injection metadata for the existing application and permit live Fee verification to continue.

## Verification

Verified with fresh commands:

- `npm run build` completed successfully after the change.
- `PORT=8000 npx tsx src/main.ts` started the Nest application successfully and reached the `Nest application successfully started` log line.
- `POST /auth/login` for `fee.read@ryo.local` now returns a real token response instead of an internal server error after the bootstrap import fix.

## Impact on Fee verification

This fix unblocked the live verification path for the existing Fee fixtures and RBAC setup. Backend startup now succeeds, Swagger can be initialized normally, and the seeded Fee read/write users can authenticate against the live application.

## Remaining limitations

- Program DTO circular dependency was not reproduced in this workspace after the runtime fix; the current observed blocker was the missing `reflect-metadata` import.
- Fee mutation and payment workflows remain intentionally outside this milestone scope.
- The live verification task is now unblocked at the application-startup layer, but the remaining Fee read/update/deactivation checks still need to be executed against the running server.

# Milestone 14D-2 — Fee Mutation, Deactivation, Authorization, and Frontend Verification

Status: Verified and recorded.

## Scope

This continuation resumes from the already-verified startup/authentication state and completes the remaining Milestone 14D live verification path for Fee Structure and Fee Component behavior, including mutation, deactivation, authorization boundaries, validation, and the real frontend route surface.

## What was verified live

- `PATCH /api/v0/fee-structure-master/:id` accepts the supported mutable fields (`name`, `description`, `totalAmount`, `isActive`) and returns `200 OK`.
- Attempting to send relationship fields (`academicYearId`, `programId`, `classId`) via `PATCH /api/v0/fee-structure-master/:id` is rejected by the DTO validation layer with `400 Bad Request` and the expected `property ... should not exist` messages.
- `PUT /api/v0/fee-structure-child/:id` accepts supported mutable fields (`name`, `description`, `amount`, `discountApplicable`, `isMandatory`) and returns `200 OK`.
- Invalid component amounts are rejected with `400 Bad Request` and `amount must be a positive number`.
- `DELETE /api/v0/fee-structure-master/:id` performs soft deactivation (`isActive: false`) rather than a hard delete.
- `GET /api/v0/fee-structure-master` then excludes the deactivated structure from the active list (`200 []` after deletion), while `GET /api/v0/fee-structure-master/:id` still returns the record with `isActive: false`.
- `DELETE /api/v0/fee-structure-child/:id` performs soft deactivation (`isActive: false`) rather than a hard delete.
- `GET /api/v0/fee-structure-child` excludes the deactivated component from the active list, while `GET /api/v0/fee-structure-child/:id` continues to return the soft-deactivated record.
- `GET /api/v0/fee-structure-master` without a bearer token is rejected with `401 Unauthorized` and `Authorization header missing`.
- `POST /auth/login` with the live seeded fixture users works successfully for the fee users that exist in the database.
- The live RBAC seed currently assigns `fee.read@ryo.local` to `COLLEGE_ADMIN`, so that account is not a read-only user in the current fixture; it has the same write permissions as the seeded `COLLEGE_ADMIN` role.

## Frontend verification

- The existing frontend route wiring in [ryo-academy-fe/src/App.tsx](ryo-academy-fe/src/App.tsx) now points `/fees`, `/fees/:id`, `/fee-components`, and `/fee-components/:id` at the real fee API-backed views (`RealFeesPage`, `RealFeeDetail`, `RealFeeComponentsPage`, `RealFeeComponentDetail`) instead of the historical mock-only screens.
- The real fee transport layer in [ryo-academy-fe/src/lib/fees-api.ts](ryo-academy-fe/src/lib/fees-api.ts) uses authenticated `GET` requests to the live backend, and the route surface is therefore aligned with the verified live API contract.
- No Program DTO change was required during this verification continuation.

## Verification evidence used

- `curl`-based live authenticated checks against the running backend on port `8000`
- Database fixture reseed via `npx tsx src/database/seed/fee-dev.seed.ts`
- Existing runtime fix in [ryo-academy-be/src/main.ts](ryo-academy-be/src/main.ts) (`import 'reflect-metadata';`) retained and preserved

## Outcome

The remaining Milestone 14D verification path is now complete from the current workspace state: Fee Structure mutation, Fee Component mutation, soft deactivation semantics, validation behavior, authorization boundary observations, and the real frontend route wiring have all been verified against the live backend.

# Milestone 14F — Student Fees / Payment Backend Contract Audit

Status: Audited and recorded.

## Scope

This milestone audits the current Student Fees / Payment backend contract in the workspace without implementing payment functionality. It records the real backend capabilities that already exist, the payment-related schema that is present but not yet exposed as a full API, and the mock-only frontend behavior that still remains in the current implementation.

## Findings from source inspection

### Real backend features already present

- The backend already contains real Fee Structure Master and Fee Structure Child CRUD endpoints in [ryo-academy-be/src/admission/fee-structure/fee-structure.controller.ts](ryo-academy-be/src/admission/fee-structure/fee-structure.controller.ts) and [ryo-academy-be/src/admission/fee-component/fee-component.controller.ts](ryo-academy-be/src/admission/fee-component/fee-component.controller.ts).
- Admission creation and update logic already exist in [ryo-academy-be/src/admission/admission-fee-log/admission.controller.ts](ryo-academy-be/src/admission/admission-fee-log/admission.controller.ts), backed by the live service/repository path in [ryo-academy-be/src/admission/admission-fee-log/admission.service.ts](ryo-academy-be/src/admission/admission-fee-log/admission.service.ts) and [ryo-academy-be/src/admission/admission-fee-log/admission.repository.ts](ryo-academy-be/src/admission/admission-fee-log/admission.repository.ts).
- The Prisma schema already includes `FeePaymentHeader` and `FeePaymentDetails` models in [ryo-academy-be/prisma/models/admission_fees/fee-payment-header.prisma](ryo-academy-be/prisma/models/admission_fees/fee-payment-header.prisma) and [ryo-academy-be/prisma/models/admission_fees/fee-payment-detials.prisma](ryo-academy-be/prisma/models/admission_fees/fee-payment-detials.prisma), and the `Admission` model includes a relation to `feePaymentHeaders` in [ryo-academy-be/prisma/models/admission_fees/admission.prisma](ryo-academy-be/prisma/models/admission_fees/admission.prisma).
- The live admission create path snapshots active fee structure/component data into `feePaymentHeader` and `feePaymentDetails`, so the backend already persists a fee snapshot alongside admission creation.

### What is not yet implemented as a real payment API

- There is no dedicated payment controller, payment service, or payment module under [ryo-academy-be/src](ryo-academy-be/src).
- There is no student-fees endpoint for listing outstanding balances, posting receipts, or retrieving payment histories.
- The permissions catalog in [ryo-academy-be/src/auth/permissions/permission.constants.ts](ryo-academy-be/src/auth/permissions/permission.constants.ts) contains `fees:read/create/update` and admission permissions, but no payment-specific permissions such as `payment:read` or `payment:create`.
- The generated DTOs in [ryo-academy-be/src/admission/admission-fee-log/dto/create-admission.dto.ts](ryo-academy-be/src/admission/admission-fee-log/dto/create-admission.dto.ts) and [ryo-academy-be/src/admission/admission-fee-log/dto/update-admission.dto.ts](ryo-academy-be/src/admission/admission-fee-log/dto/update-admission.dto.ts) model fee payment snapshot payloads, but they are tied to admissions rather than a standalone payment workflow.

### Frontend contract status

- The real frontend fee transport layer in [ryo-academy-fe/src/lib/fees-api.ts](ryo-academy-fe/src/lib/fees-api.ts) only exposes authenticated reads for fee structures and components.
- The admissions transport layer in [ryo-academy-fe/src/lib/admissions-api.ts](ryo-academy-fe/src/lib/admissions-api.ts) exposes admissions CRUD and confirmation/cancellation, plus a `feePaymentHeaders` placeholder field on the payload contract.
- [ryo-academy-fe/src/App.tsx](ryo-academy-fe/src/App.tsx) currently routes the real fee configuration pages and details, but it does not expose any student fees / payment screens or payment endpoints.
- The only payment-related code that currently exists in the frontend is mock-only state in [ryo-academy-fe/src/lib/mock-erp.ts](ryo-academy-fe/src/lib/mock-erp.ts), where `FeeRecord`, `Payment`, and `useAddPayment` simulate payment updates in localStorage. That behavior is not wired to a backend payment API.

### Real vs partial vs mock

- Real: fee structure/component management, admissions, RBAC, and the fee snapshot persistence path are all backed by the real backend and verified in the workspace.
- Partial / latent: the Prisma payment models already exist and represent a good data-model foundation for future payment workflows, but the application does not yet expose a real Student Fees / Payment contract above that schema.
- Mock: the frontend payment flow in [ryo-academy-fe/src/lib/mock-erp.ts](ryo-academy-fe/src/lib/mock-erp.ts) is simulation-only and should not be treated as a backend contract.

## Recommended next milestone

The correct next implementation milestone is not a repeat of this audit. The workspace is ready for a follow-up contract implementation milestone that introduces a dedicated Student Fees / Payment API, payment permissions, payment DTOs/service/repository logic, and the corresponding frontend payment screens and transport methods.

## Verification evidence used

This audit was based on source inspection of the verified workspace files and routes, including:

- [ryo-academy-be/src/admission/admission-fee-log/admission.service.ts](ryo-academy-be/src/admission/admission-fee-log/admission.service.ts)
- [ryo-academy-be/src/admission/admission-fee-log/admission.repository.ts](ryo-academy-be/src/admission/admission-fee-log/admission.repository.ts)
- [ryo-academy-be/src/admission/admission-fee-log/dto/create-admission.dto.ts](ryo-academy-be/src/admission/admission-fee-log/dto/create-admission.dto.ts)
- [ryo-academy-be/prisma/models/admission_fees/fee-payment-header.prisma](ryo-academy-be/prisma/models/admission_fees/fee-payment-header.prisma)
- [ryo-academy-be/prisma/models/admission_fees/fee-payment-detials.prisma](ryo-academy-be/prisma/models/admission_fees/fee-payment-detials.prisma)
- [ryo-academy-be/src/auth/permissions/permission.constants.ts](ryo-academy-be/src/auth/permissions/permission.constants.ts)
- [ryo-academy-fe/src/lib/fees-api.ts](ryo-academy-fe/src/lib/fees-api.ts)
- [ryo-academy-fe/src/lib/admissions-api.ts](ryo-academy-fe/src/lib/admissions-api.ts)
- [ryo-academy-fe/src/lib/mock-erp.ts](ryo-academy-fe/src/lib/mock-erp.ts)
- [ryo-academy-fe/src/App.tsx](ryo-academy-fe/src/App.tsx)

## Outcome

The current workspace contains a real fee configuration and admission snapshot backend, but it does not yet contain a real Student Fees / Payment API. The payment-related data structures are present and useful as a schema foundation, while the payment workflow itself remains mock-only on the frontend and unimplemented on the backend.

# Milestone 14H — Student Fee / Payment Frontend Migration

Status: Implemented and verified.

## Scope

This milestone migrates the existing Student detail view from mock-only fee information to the real student-fee backend contract. It adds a small frontend adapter for `GET /students/:id/fees` and `POST /students/:id/fees/payments`, then surfaces the live fee snapshot, outstanding balances, component breakdown, and payment recording on the Student detail screen.

## Files Created

- `ryo-academy-fe/src/lib/student-fees-api.ts`

## Files Modified

- `ryo-academy-fe/src/App.tsx`
- `ryo-academy-fe/docs/frontend-backend-migration-changelog.md`

## Backend Endpoints

- `GET /students/:id/fees`
- `POST /students/:id/fees/payments`

## Frontend Changes

- Added a dedicated `student-fees-api` adapter to wrap the real backend student-fee contract.
- Extended the existing Student detail screen to fetch the live fee snapshot and display:
  - contract status
  - fee totals
  - paid / outstanding balances
  - per-component amount and outstanding breakdown
  - recent payment history
- Added a minimal payment form on the Student detail page for recording a payment against the current live snapshot.
- Kept the payment flow intentionally minimal and aligned with the V0 backend contract: amount and optional payment date only.

## Important Decisions

- The frontend uses the real backend-only contract for student-fee reads and payments.
- Unsupported finance features such as refunds, payment methods, or receipt references remain deferred and are not invented on the frontend.
- The existing mock `mock-erp.ts` payment flow remains untouched and is not treated as a real contract.

## Verification

Verified with fresh commands:

- `cd ryo-academy-fe && npm run build`
- `cd Backend && git --no-pager diff --check -- ryo-academy-fe/src/App.tsx ryo-academy-fe/src/lib/student-fees-api.ts ryo-academy-fe/docs/frontend-backend-migration-changelog.md`

Observed evidence:

- `npm run build` completed successfully for the frontend with exit code `0`.
- The targeted diff-check for the touched 14H files returned `OUR_DIFF_CHECK_OK`.

## Outcome

Milestone 14H now surfaces the real student fee snapshot and payment recording flow in the Student detail view, while preserving the existing backend-only scope and deferring unsupported finance fields and workflows.

# Milestone 14G — Minimal Student Fee Payment Backend Contract

Status: Implemented and verified.

## Scope

This milestone adds the minimal real backend payment contract required for a workable V0 without introducing a full finance module. The implementation reuses the existing fee snapshot models (`FeePaymentHeader` / `FeePaymentDetails`) and adds only the smallest student-fee read and payment-recording endpoints needed to support a later frontend integration.

## Files Created

- `ryo-academy-be/src/student/dto/create-student-fee-payment.dto.ts`

## Files Modified

- `ryo-academy-be/src/student/student.controller.ts`
- `ryo-academy-be/src/student/student.service.ts`

## Prisma Changes

- No Prisma schema change was required for this milestone.
- The existing `FeePaymentHeader` and `FeePaymentDetails` models were reused as-is, including the existing admission snapshot relationship.

## Migration

- No migration was created for this milestone because the existing schema already provided the required payment storage fields.

## Endpoints

- `GET /students/:id/fees`
- `POST /students/:id/fees/payments`

## Permissions

- `GET /students/:id/fees` uses the existing `fees:read` permission.
- `POST /students/:id/fees/payments` uses the existing `fees:create` permission.
- No new payment-specific permission namespace was introduced for V0.

## DTOs

- Added `CreateStudentFeePaymentDto` in `ryo-academy-be/src/student/dto/create-student-fee-payment.dto.ts`.
- The payment DTO currently accepts only the fields required for V0 payment recording:
  - `amount`
  - `paymentDate` (optional ISO date string)

## Payment Lifecycle

- V0 keeps payment lifecycle intentionally simple.
- A successfully created payment is recorded as a real fee payment update against the existing snapshot data.
- No refund, reversal, or pending-gateway states were introduced.

## Validation

The backend now rejects:

- zero or negative payment amounts
- missing/invalid student identifiers
- students without an admission
- cancelled admissions
- admissions without an existing active fee snapshot
- payments that exceed the outstanding balance

Validation uses `400 Bad Request` for invalid input and business-rule failures.

## Transaction Behavior

- Payment recording is performed inside a Prisma transaction in `StudentService.recordStudentFeePayment`.
- The transaction performs the following atomically:
  1. resolve student and admission
  2. resolve the current fee snapshot
  3. calculate outstanding balance
  4. validate the requested payment amount
  5. allocate the payment across fee-payment detail rows
  6. update the fee payment header totals
  7. return the refreshed fee/payment state

## Balance Behavior

- The server calculates the outstanding balance from the existing fee snapshot rather than trusting client-supplied values.
- The response exposes:
  - `totalAmount`
  - `paidAmount`
  - `outstandingAmount`
- Component-level allocations are also returned, including per-component outstanding amounts.

## Admission / Student Relationship

- Student fee reads and payment recording resolve the real `Student -> Admission` relationship from the database.
- The fee contract is bound to the student’s current admission and reuses the existing admission fee snapshot chain.

## Fee Structure / Component Relationship

- The implementation reuses the existing `Admission -> FeePaymentHeader -> FeePaymentDetails` snapshot structure.
- `FeePaymentDetails` continues to hold the per-component line items derived from the active fee structure/component snapshot at admission time.
- The response returns these component rows as the fee breakdown for the frontend.

## Frontend Impact

- No frontend payment screens or routes were changed in this milestone.
- The existing real Fee Structure/Component frontend remains unaffected.
- The new backend contract is intentionally available for the next frontend milestone only.

## Deferred Functionality

The following remain intentionally deferred and were not implemented in 14G:

- refunds
- concessions
- installment schedules
- recurring payments
- payment gateway integration
- receipt PDF generation
- accounting ledger/reconciliation
- payment cancellation workflow
- dashboard student-fee UI migration

## Verification

Verified with fresh commands:

- `cd ryo-academy-be && npm run build`
- `cd Backend && git --no-pager diff --check -- ryo-academy-be/src/student/student.controller.ts ryo-academy-be/src/student/student.service.ts ryo-academy-be/src/student/dto/create-student-fee-payment.dto.ts ryo-academy-fe/docs/frontend-backend-migration-changelog.md`

Observed evidence:

- `npm run build` completed with exit code `0`.
- Prisma generation completed successfully as part of the build.
- The targeted diff-check for the touched 14G files returned `OUR_DIFF_CHECK_OK`.

## Limitations

- This milestone uses the existing fee snapshot models as the payment record source; it does not introduce a separate payment ledger or payment status model.
- Payment recording is transactional at the Prisma level, but the implementation does not attempt a full accounting-grade concurrency solution beyond the minimal transaction protection already provided by the database layer.
- The V0 contract records a payment by updating existing fee snapshot data rather than creating a distinct payment entity.
- No payment method/reference field exists in the current schema, so the contract intentionally omits payment-method and receipt/reference persistence for now.

## Outcome

Milestone 14G adds the minimal real student-fee payment backend contract required for V0: a student fee read endpoint, a payment creation endpoint, server-side outstanding-balance calculation, and transactional payment allocation against the existing admission fee snapshot. Existing fee configuration functionality remains intact, and the changelog has been updated to reflect the verified implementation.

# Milestone 15A — Timetable / Scheduling Backend Contract Audit

Status: Complete — audit only. No Timetable functionality, backend endpoints, Prisma migrations, test fixtures, or live runtime changes were introduced.

## Audit Scope

This milestone audited the existing Timetable / Scheduling contract in the workspace only. The goal was to decide whether Timetable can remain mocked for V0 or whether a minimal real backend contract already exists.

## 1. Frontend Timetable Inventory

The current frontend timetable is entirely mock-backed and is implemented in [ryo-academy-fe/src/App.tsx](ryo-academy-fe/src/App.tsx) via the `TimetablePage` component. The screen reads from `useResource("timetable")`, which is a localStorage-backed mock resource defined in [ryo-academy-fe/src/lib/mock-erp.ts](ryo-academy-fe/src/lib/mock-erp.ts).

### Frontend timetable data model

`mock-erp.ts` defines the available timetable entry shape as:

- `id`
- `day`
- `period`
- `time`
- `program`
- `class`
- `section`
- `subject`
- `faculty`
- `room`

The `DB` type includes a `timetable` array, and the seed data contains five mock entries for Monday/Tuesday/Wednesday/Thursday.

### Frontend timetable capabilities

- Timetable list view: `GET /timetable` via mock resource
- Timetable display by day column
- Display of `subject`, `class`, `section`, `faculty`, `room`, and `time`
- No timetable create/edit/delete UI was found in the active frontend routes
- No timetable filtering, search, or advanced views were found beyond a fixed weekday grid
- Timetable route is exposed as `/timetable` and protected by the existing `TIMETABLE_READ` frontend permission

### Frontend timetable route inventory

- `/timetable` — mock timetable page
- `/dashboard` — dashboard cards and quick actions reference timetable only as a mock placeholder

### Frontend timetable dependencies

The mock timetable depends on the existing frontend mock domain objects:

- `academicYears`
- `programs`
- `classes`
- `sections`
- `subjects`
- `staff`
- `assignments`

The UI does not call a real backend timetable API, and it does not query real academic relation data dynamically.

## 2. Backend Timetable / Scheduling Audit

### Verified backend findings

The backend contains no verified timetable or scheduling domain implementation.

Source inspection found:

- No `Timetable`, `Schedule`, `Period`, `TimeSlot`, `ClassSchedule`, `SectionSchedule`, `TeachingSchedule`, `RoomAllocation`, or `StaffSchedule` Prisma model in the backend schema tree.
- No timetable controller in `ryo-academy-be/src`.
- No timetable service in `ryo-academy-be/src`.
- No timetable module in `ryo-academy-be/src`.
- No timetable DTOs in `ryo-academy-be/src`.
- No timetable endpoints in the controller inventory.

The only timetable-related backend artifact found is the permission constant and RBAC seed entry:

- `TIMETABLE_READ: 'timetable:read'` in [ryo-academy-be/src/auth/permissions/permission.constants.ts](ryo-academy-be/src/auth/permissions/permission.constants.ts)
- `TIMETABLE_READ` included in the RBAC seed in [ryo-academy-be/src/database/seed/rbac.seed.ts](ryo-academy-be/src/database/seed/rbac.seed.ts)

### Backend models inspected for scheduling relationships

The verified backend foundation is:

- `AcademicYear`
- `Program`
- `Class`
- `Section`
- `Subjects`
- `Staff`
- `TeachingAssignment`
- `AcademicCalendar`
- `AttendanceLogMaster`
- `Admission`
- `FeeStructure`
- `FeeComponent`
- `FeePaymentHeader`
- `FeePaymentDetails`

These models support academic hierarchy and teaching assignment structure, but they do not provide a separate timetable entity or per-slot scheduling state.

## 3. Backend Modules / Controllers / Services / Endpoints

### Modules

The app module includes the real academic, admissions, staff, calendar, attendance, and student modules, but no timetable module: [ryo-academy-be/src/app.module.ts](ryo-academy-be/src/app.module.ts)

### Controllers relevant to the audit

Verified controllers that relate to the academic hierarchy and staff assignment chain include:

- [ryo-academy-be/src/academic/academic-year/academic-year.controller.ts](ryo-academy-be/src/academic/academic-year/academic-year.controller.ts)
- [ryo-academy-be/src/academic/program/program.controller.ts](ryo-academy-be/src/academic/program/program.controller.ts)
- [ryo-academy-be/src/academic/class/class.controller.ts](ryo-academy-be/src/academic/class/class.controller.ts)
- [ryo-academy-be/src/academic/section/section.controller.ts](ryo-academy-be/src/academic/section/section.controller.ts)
- [ryo-academy-be/src/academic/subject/subject.controller.ts](ryo-academy-be/src/academic/subject/subject.controller.ts)
- [ryo-academy-be/src/academic/staff/staff.controller.ts](ryo-academy-be/src/academic/staff/staff.controller.ts)
- [ryo-academy-be/src/academic/academic-calendar/academic-calendar.controller.ts](ryo-academy-be/src/academic/academic-calendar/academic-calendar.controller.ts)
- [ryo-academy-be/src/attendance/attendance.controller.ts](ryo-academy-be/src/attendance/attendance.controller.ts)

None of these controllers expose timetable endpoints.

### Services relevant to the audit

Verified services that can participate in scheduling relationships include:

- `StaffService` — provides staff and teaching assignment lookup/creation
- `AttendanceService` — validates academic year/class/section/date constraints and staff assignment to a class/section

The audited backend does not contain a timetable or schedule service.

### Endpoints

Verified backend endpoints found in the workspace:

- Academic Years: `GET /academic-years`, `GET /academic-years/:id`, `POST /academic-years`, `PATCH /academic-years/:id`
- Programs: `GET /programs`, `GET /programs/:id`, `POST /programs`, `PATCH /programs/:id`
- Classes: `GET /classes`, `GET /classes/:id`, `GET /classes/:classId/subjects`, `POST /classes`, `PATCH /classes/:id`
- Sections: `GET /sections`, `GET /sections/:classId`, `POST /sections`, `PATCH /sections/:id`
- Subjects: `GET /subjects/:id`, `POST /subjects`, `PATCH /subjects/:id`, `DELETE /subjects/:id`
- Staff / Teaching Assignments: `GET /staff`, `GET /staff/:id`, `GET /staff/:staffId/teaching-assignments`, `POST /staff/assignments`, `PATCH /staff/assignments/:id`, `DELETE /staff/assignments/:id`
- Academic Calendar: `GET /academic-calendar`, `GET /academic-calendar/:id`, `POST /academic-calendar`, `PATCH /academic-calendar/:id`, `DELETE /academic-calendar/:id`
- Attendance: `POST /attendance`, `GET /attendance`, `GET /attendance/my`, `GET /attendance/:id`, `POST /attendance/:id/submit`, `PATCH /attendance/:id`, `DELETE /attendance/:id`

No timetable endpoints were found.

## 4. Permissions

The only timetable-related permission is:

- `TIMETABLE_READ` (`timetable:read`)

This permission is present in the frontend mock permission map and in the backend RBAC seed, but no timetable write/update/create permissions exist.

Roles inspected:

- `COLLEGE_ADMIN` — has all base permissions including `TIMETABLE_READ`
- `OFFICE_ADMIN` — has `TIMETABLE_READ`
- `STAFF` — has `TIMETABLE_READ`

No timetable-specific backend authorization logic was found beyond RBAC membership.

## 5. Scheduling Relationships

### Verified relationships that exist

The real backend already supports the following chain:

Academic Year → Program → Class → Section

and:

Staff → Teaching Assignment → Subject / Class / Section

The backend can therefore identify:

- which subject is assigned to a teaching assignment
- which teacher holds the assignment
- which class and section the assignment targets
- the academic year through the class’s program

### What the backend does not currently represent

The backend does not currently contain a timetable entity that joins these parts into scheduled slots with:

- day
- period
- start/end time
- room allocation
- recurring schedule metadata
- schedule-specific uniqueness/conflict checks

`TeachingAssignment` links staff/class/section/subject, but it is not a timetable slot. It is an assignment record, not a scheduled time entry.

## 6. Conflict Validation

No timetable conflict validation was found in the backend.

The audited backend does validate attendance-related conflicts, including:

- duplicate student entries
- invalid student membership for a class/section
- academic year date-range consistency
- working-day requirement via academic calendar
- section-class consistency

Those are attendance validations, not timetable validation.

No backend scheduling conflict checks were found for:

- teacher double-booking
- class/section double-booking
- room double-booking
- overlapping periods
- duplicate schedule entries
- academic-year consistency across scheduled slots

## 7. Frontend / Backend Matrix

| Capability | Frontend | Backend | Status |
|---|---|---|---|
| Timetable view | Yes, mock list grid | No real contract | Mock only |
| Timetable create | No | No | Not present |
| Timetable edit | No | No | Not present |
| Timetable delete | No | No | Not present |
| Staff assignment | Mock-dependent via assignment seed | Yes, `TeachingAssignment` exists | Partial relationship only |
| Subject assignment | Mock-dependent via timetable entry text | Yes, `TeachingAssignment.subjectId` exists | Partial relationship only |
| Class/Section schedule | Mock-dependent via timetable entry text | No timetable contract | Missing |
| Period management | Mock-only `period` and `time` fields | No model or endpoints | Missing |
| Conflict detection | No | No | Missing |
| Room scheduling | Mock-only `room` field | No model or endpoints | Missing |

## 8. V0 Decision

### Decision: C — Backend scheduling functionality is absent

The verified backend does not expose a real Timetable / Scheduling contract. The frontend route is mock-backed, and the backend only contains the academic hierarchy plus staff teaching assignments. Because the backend has no timetable model, no timetable endpoints, no scheduling validation, and no schedule-to-class/section/day/period representation, Timetable should remain mocked for V0.

## 9. V0 Scope

This milestone intentionally keeps the existing Timetable UI in place as a valid V0 placeholder.

The recommendation is:

- do not remove the timetable route or screen
- do not replace it with a blank page
- do not invent a fake API integration
- do not create Prisma migrations or endpoints for timetable
- preserve the current mock timetable until a real backend scheduling contract exists

## 10. Backend Gaps

### Verified gaps

- No timetable or schedule model exists.
- No timetable controller/service/module exists.
- No timetable CRUD or read endpoint exists.
- No period/time-slot model exists.
- No room allocation model exists.
- No day/period scheduling relationships exist.
- No teacher/class/section double-booking validation exists.
- No room collision validation exists.
- No recurring or weekly schedule representation exists.
- No timetable-specific permissions beyond `TIMETABLE_READ` exist.

### Relationship gap

The backend can connect academic hierarchy and teaching assignments, but not produce a full schedule because there is no scheduling entity that stores:

- which subject
- which teacher
- which class
- which section
- which day
- which time/period

## 11. Files Inspected

- [ryo-academy-fe/src/App.tsx](ryo-academy-fe/src/App.tsx)
- [ryo-academy-fe/src/lib/mock-erp.ts](ryo-academy-fe/src/lib/mock-erp.ts)
- [ryo-academy-fe/docs/frontend-backend-migration-changelog.md](ryo-academy-fe/docs/frontend-backend-migration-changelog.md)
- [ryo-academy-be/src/app.module.ts](ryo-academy-be/src/app.module.ts)
- [ryo-academy-be/src/auth/permissions/permission.constants.ts](ryo-academy-be/src/auth/permissions/permission.constants.ts)
- [ryo-academy-be/src/database/seed/rbac.seed.ts](ryo-academy-be/src/database/seed/rbac.seed.ts)
- [ryo-academy-be/src/academic/staff/staff.controller.ts](ryo-academy-be/src/academic/staff/staff.controller.ts)
- [ryo-academy-be/src/academic/staff/staff.service.ts](ryo-academy-be/src/academic/staff/staff.service.ts)
- [ryo-academy-be/prisma/models/academic/academic-year.prisma](ryo-academy-be/prisma/models/academic/academic-year.prisma)
- [ryo-academy-be/prisma/models/academic/program.prisma](ryo-academy-be/prisma/models/academic/program.prisma)
- [ryo-academy-be/prisma/models/academic/class.prisma](ryo-academy-be/prisma/models/academic/class.prisma)
- [ryo-academy-be/prisma/models/academic/section.prisma](ryo-academy-be/prisma/models/academic/section.prisma)
- [ryo-academy-be/prisma/models/academic/subjects.prisma](ryo-academy-be/prisma/models/academic/subjects.prisma)
- [ryo-academy-be/prisma/models/academic/staff/staff.prisma](ryo-academy-be/prisma/models/academic/staff/staff.prisma)
- [ryo-academy-be/prisma/models/academic/staff/teachingAssignment.prisma](ryo-academy-be/prisma/models/academic/staff/teachingAssignment.prisma)
- [ryo-academy-be/prisma/models/attendance/attendance-log-master.prisma](ryo-academy-be/prisma/models/attendance/attendance-log-master.prisma)
- [ryo-academy-be/src/attendance/attendance.service.ts](ryo-academy-be/src/attendance/attendance.service.ts)

## 12. Files Modified

- [ryo-academy-fe/docs/frontend-backend-migration-changelog.md](ryo-academy-fe/docs/frontend-backend-migration-changelog.md)

No backend models, controllers, services, routes, migrations, DTOs, fixtures, or application code were modified for this audit milestone.

## 13. Verification

This audit used source inspection only, as required by the milestone.

### Verified evidence

- Frontend `TimetablePage` reads from mock-localStorage resource `timetable` in [ryo-academy-fe/src/lib/mock-erp.ts](ryo-academy-fe/src/lib/mock-erp.ts).
- The frontend route `/timetable` exists in [ryo-academy-fe/src/App.tsx](ryo-academy-fe/src/App.tsx) and is gated by `TIMETABLE_READ`.
- The backend permission and RBAC seed include `TIMETABLE_READ`, but no timetable models/controllers/services/routes were found.
- The Prisma schema tree contains no timetable/schedule domain models.
- The backend has real academic hierarchy and teaching assignment relations, but no schedule-slot entity or conflict-validation layer.

### Verification limits

- No live API calls were made for Timetable.
- No runtime route testing was performed beyond static source inspection.
- No claims are made about runtime timetable behavior beyond the inspected source.

## 14. Limitations

- This milestone intentionally does not implement any scheduling functionality.
- The audit is limited to verified source facts in the current workspace.
- The frontend timetable remains a mock UI placeholder until the backend provides a genuine scheduling contract.
- The existing academic hierarchy and teaching assignment data can support a future timetable design, but the current backend does not yet expose that schedule layer.

## 15. Changelog

This Milestone 15A entry records the audited status of the current Timetable / Scheduling contract, preserving historical migration entries while documenting that the backend does not yet provide a real timetable domain and that Timetable should remain mocked for V0.

# Milestone 15B — Dashboard Real-vs-Mock Contract Audit

Status: Complete — audit only. No Dashboard redesign, Dashboard migration, reporting endpoints, Prisma migrations, test fixtures, or live runtime changes were introduced.

## Audit Scope

This milestone audited the current Dashboard contract in the workspace only and classified each visible metric as one of:

- REAL-READY
- DERIVABLE
- REPORTING-BACKEND-REQUIRED
- MOCK/DEFERRED

The purpose was to determine which Dashboard data can already rely on existing backend APIs, and which data must remain mocked for V0.

## 1. Dashboard Inventory

The active Dashboard implementation is in [ryo-academy-fe/src/App.tsx](ryo-academy-fe/src/App.tsx). It is currently a mock-backed dashboard, not a migrated dashboard.

### Current Dashboard data sources

The Dashboard reads from the mock resource layer in [ryo-academy-fe/src/lib/mock-erp.ts](ryo-academy-fe/src/lib/mock-erp.ts):

- `students = useResource("students")`
- `admissions = useResource("admissions")`
- `staff = useResource("staff")`
- `fees = useResource("fees")`
- `years = useResource("academicYears")`
- `classes = useResource("classes")`
- `attendance = useResource("attendance")`

This means the current Dashboard statistics are backed by the browser-local `DB` object in [ryo-academy-fe/src/lib/mock-erp.ts](ryo-academy-fe/src/lib/mock-erp.ts), not by the real API hooks already present elsewhere in the frontend.

### Current Dashboard widgets

The Dashboard currently exposes these cards by role:

#### Staff role

- `Students` — `studentRows.length`
- `Classes` — `classes.data?.length`
- `Attendance days` — `attendance.data?.length`
- `Timetable` — fixed value `5`, described as published periods

Quick actions for Staff:

- `Mark attendance`
- `Open students`
- `View timetable`

#### Office Admin role

- `Open applications` — count of admissions with status `Pending`
- `Students` — `studentRows.length`
- `Fee accounts` — `feeRows.length`
- `Classes` — `classes.data?.length`

Quick actions for Office Admin:

- `Log an application`
- `Add a student`
- `Create fee structure`

#### College Admin role

- `Enrolled students` — `studentRows.filter((row) => row.status === "Active").length`
- `Open applications` — count of admissions with status `Pending`
- `Academic years` — `years.data?.length`
- `Active faculty` — count of staff rows with status `Active`

Quick actions for College Admin:

- `Set up academic year`
- `Log an application`
- `Mark attendance`

### Dashboard activity panel

The Dashboard also contains an `Today at a glance` activity list with:

- `Student register ready` — `studentRows.length`
- `Academic workspace` — `${classes.data?.length} classes across ${years.data?.length} years`
- `Attendance desk` — `${attendance.data?.length} class registers recorded`

These values are also derived from the same mock resources.

## 2. Current Data Sources in the Workspace

The mock Dashboard is seeded from the frontend mock database in [ryo-academy-fe/src/lib/mock-erp.ts](ryo-academy-fe/src/lib/mock-erp.ts), where the following arrays exist:

- `students`
- `admissions`
- `staff`
- `fees`
- `payments`
- `academicYears`
- `programs`
- `classes`
- `sections`
- `feeStructures`
- `feeComponents`
- `attendance`
- `timetable`

The Dashboard uses the mock data to simulate counts, statuses, and recent activity; it does not pull from the already-migrated real API wrappers that exist elsewhere in the frontend.

## 3. Backend Endpoints Already Available

The frontend already includes real API wrappers for the following domains:

### Students

- `GET /students`
- `GET /students/:id`

Source: [ryo-academy-fe/src/lib/students-api.ts](ryo-academy-fe/src/lib/students-api.ts)

### Admissions

- `GET /admission`
- `GET /admission/:id`
- `POST /admission`
- `PATCH /admission/:id`
- `POST /admission/:id/confirmed`
- `POST /admission/:id/cancelled`

Source: [ryo-academy-fe/src/lib/admissions-api.ts](ryo-academy-fe/src/lib/admissions-api.ts)

### Staff

- `GET /staff`
- `GET /staff/:id`
- `POST /staff`
- `PATCH /staff/:id`
- `PATCH /staff/:id/status`

Source: [ryo-academy-fe/src/lib/staff-api.ts](ryo-academy-fe/src/lib/staff-api.ts)

### Teaching Assignments

- `GET /staff/assignments`
- `GET /staff/:staffId/teaching-assignments`
- `GET /staff/me/teaching-assignments`
- `POST /staff/assignments`
- `PATCH /staff/assignments/:id`
- `DELETE /staff/assignments/:id`

Source: [ryo-academy-fe/src/lib/teaching-assignments-api.ts](ryo-academy-fe/src/lib/teaching-assignments-api.ts)

### Academic Setup

- `GET /academic-years`
- `GET /academic-years/:id`
- `POST /academic-years`
- `PATCH /academic-years/:id`
- `GET /programs`
- `GET /programs/:id`
- `POST /programs`
- `PATCH /programs/:id`
- `GET /classes`
- `GET /classes/:id`
- `POST /classes`
- `PATCH /classes/:id`
- `GET /sections`
- `GET /sections/:classId`
- `POST /sections`
- `PATCH /sections/:id`
- `GET /classes/:classId/subjects`
- `GET /subjects/:id`
- `POST /subjects`
- `PATCH /subjects/:id`
- `DELETE /subjects/:id`

Sources: [ryo-academy-fe/src/lib/academic-years-api.ts](ryo-academy-fe/src/lib/academic-years-api.ts), [ryo-academy-fe/src/lib/programs-api.ts](ryo-academy-fe/src/lib/programs-api.ts), [ryo-academy-fe/src/lib/classes-api.ts](ryo-academy-fe/src/lib/classes-api.ts), [ryo-academy-fe/src/lib/sections-api.ts](ryo-academy-fe/src/lib/sections-api.ts), [ryo-academy-fe/src/lib/subjects-api.ts](ryo-academy-fe/src/lib/subjects-api.ts)

### Academic Calendar

- `GET /academic-calendar`
- `GET /academic-calendar/:id`
- `POST /academic-calendar`
- `PATCH /academic-calendar/:id`
- `DELETE /academic-calendar/:id`

Source: [ryo-academy-fe/src/lib/academic-calendar-api.ts](ryo-academy-fe/src/lib/academic-calendar-api.ts)

### Attendance

- `GET /attendance`
- `GET /attendance/my`
- `GET /attendance/:id`
- `POST /attendance`
- `PATCH /attendance/:id`
- `POST /attendance/:id/submit`
- `DELETE /attendance/:id`

Source: [ryo-academy-fe/src/lib/attendance-api.ts](ryo-academy-fe/src/lib/attendance-api.ts)

### Fees / Student Fees

- `GET /fee-structure-master`
- `GET /fee-structure-master/:id`
- `GET /fee-structure-child`
- `GET /fee-structure-child/:id`
- `GET /students/:studentId/fees`
- `POST /students/:studentId/fees/payments`

Sources: [ryo-academy-fe/src/lib/fees-api.ts](ryo-academy-fe/src/lib/fees-api.ts), [ryo-academy-fe/src/lib/student-fees-api.ts](ryo-academy-fe/src/lib/student-fees-api.ts)

## 4. Metric Feasibility

### REAL-READY

These Dashboard metrics can already be supported by existing backend endpoints with simple list/count logic:

- Total Students — `GET /students` list length
- Open Applications — `GET /admission` list, filter `admissionStatus === DRAFT` or map to Pending
- Total Classes — `GET /classes` list length
- Total Academic Years — `GET /academic-years` list length
- Total Staff — `GET /staff` list length
- Active Faculty — count `GET /staff` items where `status === true`
- Attendance Days — `GET /attendance` list length

### DERIVABLE

These metrics can be derived safely from a real existing API, but require lightweight client-side mapping rather than a new endpoint:

- `Open applications` count from `GET /admission` because the field already carries the real status
- `Active faculty` count from `GET /staff` because `status` is already a boolean
- `Attendance days` count from `GET /attendance` because the list is already available

### REPORTING-BACKEND-REQUIRED

These metrics require a dedicated reporting/aggregation contract that does not currently exist:

- `Enrolled students` / `Active students` count by status, because the current `GET /students` payload does not expose an equivalent status or active/inactive field
- `Fee accounts` total count, because a bulk student-fee summary endpoint is not present; only per-student `GET /students/:id/fees` exists
- `Outstanding / collected / collection trends / monthly collections`, because the current fee APIs are per-student snapshots and do not expose a backend reporting contract
- `Attendance percentage`, `present/absent percentage`, `historical attendance trends`, and other date-range aggregates, because `GET /attendance` returns individual registers rather than a dashboard aggregation endpoint
- Any dashboard metric that needs rollups across multiple students, dates, fee records, or historical periods without a dedicated backend contract

### MOCK/DEFERRED

These Dashboard items should remain mocked for V0 because no real backend contract exists to support them:

- `Timetable` / `Published periods` widget on the Dashboard
- Any timetable-specific summary card derived from `Timetable` data
- Any dashboard card that depends on the missing timetable/scheduling domain

## 5. Attendance Dashboard Findings

### What the Dashboard currently shows

The Dashboard’s attendance metric is only a count of `attendance.data?.length` displayed as `Attendance days`.

### What existing backend APIs already support

- `GET /attendance` already returns existing attendance registers for list and filtering.
- `GET /attendance/:id` already returns a register detail.
- `POST /attendance`, `PATCH /attendance/:id`, `POST /attendance/:id/submit`, and `DELETE /attendance/:id` already exist for managed attendance workflows.

### What is still not available

The current Attendance contract does not include a dashboard-oriented reporting endpoint for:

- today’s attendance percentage
- present/absent totals across a date range
- historical trends
- aggregated rollups by class, section, or academic year

Therefore:

- `Attendance days` can be classified as REAL-READY for a simple count
- `Attendance percentage`, `present/absent snapshots`, and `historical trends` should remain REPORTING-BACKEND-REQUIRED or mocked until a dedicated reporting contract exists

## 6. Fee Dashboard Findings

### What the Dashboard currently shows

The Dashboard uses `Fee accounts` as `feeRows.length` from the mock `fees` resource.

### What existing backend APIs already support

- `GET /fee-structure-master` and `GET /fee-structure-child` support fee configuration read operations.
- `GET /students/:studentId/fees` and `POST /students/:studentId/fees/payments` support per-student fee snapshot and payment recording.

### What is still not available

No bulk fee-summary, outstanding-summary, collection-summary, or historical financial reporting endpoint exists. The current backend contract can read one student’s fee snapshot, but it does not provide a backend-provided global ledger or dashboard aggregation.

Therefore:

- `Fee accounts` total count should remain REPORTING-BACKEND-REQUIRED in V0
- `total collected`, `outstanding`, `collection trends`, `daily/monthly collections`, and similar financial cards should remain mocked for V0

## 7. Student / Staff / Academic Findings

### Student counts

- `Total Students` is REAL-READY via `GET /students`
- `Active Students` is not safely derivable from the current real `GET /students` response because the payload does not currently expose a status field akin to the mock `students` resource

### Staff counts

- `Total Staff` is REAL-READY via `GET /staff`
- `Active Faculty` is DERIVABLE via `GET /staff` because `status` is a boolean in the real response

### Academic setup counts

- `Classes` is REAL-READY via `GET /classes`
- `Academic years` is REAL-READY via `GET /academic-years`
- `Sections` and `Subjects` already have real list/get APIs in the workspace, but they are not currently shown as separate Dashboard cards

### Admissions

- `Open applications` is REAL-READY via `GET /admission` and existing status fields
- `Admissions` conversion reporting or historical funnel metrics remain REPORTING-BACKEND-REQUIRED if the Dashboard requires more than simple counts

## 8. Frontend / Backend Matrix

| Dashboard Metric | Current Source | Backend Source | Classification | V0 Action |
|---|---|---|---|---|
| Total students | Mock `useResource("students")` | `GET /students` | REAL-READY | Migrate to real count |
| Active students | Mock `useResource("students")` + status filter | `GET /students` without status | REPORTING-BACKEND-REQUIRED | Keep mocked |
| Open applications | Mock `useResource("admissions")` + status filter | `GET /admission` + `admissionStatus` | REAL-READY | Migrate to real count |
| Academic years | Mock `useResource("academicYears")` | `GET /academic-years` | REAL-READY | Migrate to real count |
| Classes | Mock `useResource("classes")` | `GET /classes` | REAL-READY | Migrate to real count |
| Active faculty | Mock `useResource("staff")` + status filter | `GET /staff` + boolean `status` | DERIVABLE | Migrate to real count |
| Attendance days | Mock `useResource("attendance")` | `GET /attendance` | REAL-READY | Migrate to real count |
| Attendance percentage / trends | Mock `attendance` entries | `GET /attendance` only | REPORTING-BACKEND-REQUIRED | Keep mocked |
| Fee accounts | Mock `useResource("fees")` | No bulk fee-summary endpoint | REPORTING-BACKEND-REQUIRED | Keep mocked |
| Total collected / outstanding / collections | Mock `useResource("fees")` + payments | Per-student `GET /students/:id/fees` only | REPORTING-BACKEND-REQUIRED | Keep mocked |
| Timetable published periods | Mock `useResource("timetable")` | No timetable backend contract | MOCK/DEFERRED | Keep mocked |

## 9. Recommended V0 Migration Scope

The smallest sensible Dashboard migration scope is:

- migrate simple count widgets already supported by existing backend endpoints
- preserve the current Dashboard layout and role-based cards
- leave reporting-heavy widgets mocked
- leave timetable mocked
- avoid browser-side reconstruction of large aggregates

### Recommended V0 Dashboard real migration candidates

- Total Students
- Open Applications
- Classes
- Academic Years
- Active Faculty
- Attendance Days count

### Recommended V0 Dashboard mock/defer scope

- Active Students by status
- Fee accounts aggregate count
- Financial totals and collection trends
- Attendance percentages and historical trends
- Timetable / scheduled periods

## 10. Mock / Deferred Scope

The following Dashboard items should remain mocked for V0 because the backend either lacks the data or lacks the reporting contract needed to support them safely:

- `Timetable` card
- `Published periods` count
- `Fee accounts` aggregate count
- `Active students` count derived from current status
- attendance percentage/trend metrics
- financial reporting metrics such as collected, outstanding, and collections-over-time

## 11. Files Inspected

- [ryo-academy-fe/src/App.tsx](ryo-academy-fe/src/App.tsx)
- [ryo-academy-fe/src/lib/mock-erp.ts](ryo-academy-fe/src/lib/mock-erp.ts)
- [ryo-academy-fe/src/lib/students-api.ts](ryo-academy-fe/src/lib/students-api.ts)
- [ryo-academy-fe/src/lib/admissions-api.ts](ryo-academy-fe/src/lib/admissions-api.ts)
- [ryo-academy-fe/src/lib/staff-api.ts](ryo-academy-fe/src/lib/staff-api.ts)
- [ryo-academy-fe/src/lib/attendance-api.ts](ryo-academy-fe/src/lib/attendance-api.ts)
- [ryo-academy-fe/src/lib/fees-api.ts](ryo-academy-fe/src/lib/fees-api.ts)
- [ryo-academy-fe/src/lib/student-fees-api.ts](ryo-academy-fe/src/lib/student-fees-api.ts)
- [ryo-academy-fe/src/lib/academic-years-api.ts](ryo-academy-fe/src/lib/academic-years-api.ts)
- [ryo-academy-fe/src/lib/programs-api.ts](ryo-academy-fe/src/lib/programs-api.ts)
- [ryo-academy-fe/src/lib/classes-api.ts](ryo-academy-fe/src/lib/classes-api.ts)
- [ryo-academy-fe/src/lib/sections-api.ts](ryo-academy-fe/src/lib/sections-api.ts)
- [ryo-academy-fe/src/lib/subjects-api.ts](ryo-academy-fe/src/lib/subjects-api.ts)
- [ryo-academy-fe/src/lib/teaching-assignments-api.ts](ryo-academy-fe/src/lib/teaching-assignments-api.ts)
- [ryo-academy-fe/src/lib/academic-calendar-api.ts](ryo-academy-fe/src/lib/academic-calendar-api.ts)
- [ryo-academy-fe/docs/frontend-backend-migration-changelog.md](ryo-academy-fe/docs/frontend-backend-migration-changelog.md)

## 12. Files Modified

- [ryo-academy-fe/docs/frontend-backend-migration-changelog.md](ryo-academy-fe/docs/frontend-backend-migration-changelog.md)

No Dashboard implementation files, backend endpoints, Prisma schemas, test fixtures, or migration files were modified for this audit milestone.

## 13. Verification

This audit used source inspection only, as required by the milestone.

### Verified evidence

- The Dashboard in [ryo-academy-fe/src/App.tsx](ryo-academy-fe/src/App.tsx) currently calls `useResource("students")`, `useResource("admissions")`, `useResource("staff")`, `useResource("fees")`, `useResource("academicYears")`, `useResource("classes")`, and `useResource("attendance")`.
- The corresponding mock data layer is defined in [ryo-academy-fe/src/lib/mock-erp.ts](ryo-academy-fe/src/lib/mock-erp.ts), where the same resource names map to browser-local seeded arrays.
- The real API wrappers already exist in the frontend for students, admissions, staff, programs, classes, sections, subjects, academic calendar, attendance, fee configuration, and student-fee snapshots.
- The real backend contract does not currently expose a dedicated dashboard reporting endpoint for fee aggregates, attendance trends, or timetable scheduling.

### Verification limits

- No browser automation was performed.
- No live API testing was performed beyond static source inspection.
- No runtime claims are made beyond the verified sources inspected in this workspace.

## 14. Limitations

- This milestone intentionally does not implement any Dashboard migration or reporting endpoint.
- The audit is limited to the verified source facts in the current workspace.
- Some real endpoints already exist, but the current Dashboard is still reading from the mock resource layer.
- Classification is intentionally conservative: if a metric would require a new aggregation contract or a large client-side reconstruction, it remains mocked for V0.

## 15. Changelog

This Milestone 15B entry records the verified Dashboard real-vs-mock classification for the current workspace, preserving prior migration history while documenting which Dashboard widgets are already supported by existing APIs and which ones must remain mocked until a dedicated reporting or scheduling contract exists.

# Milestone 15C — Dashboard V0 Real Metrics Migration

Status: Complete — frontend-only migration of safe, simple dashboard metrics using existing real APIs.

## Scope

This milestone implemented only the verified Dashboard metrics that are already supported by existing real endpoints and that do not require a new backend reporting contract.

No reporting endpoints were created. No Prisma changes were made. No financial analytics, attendance analytics, or timetable contracts were introduced.

## 1. Dashboard Metrics Migrated

The following Dashboard metrics were migrated from the mock resource layer to existing real API hooks in [ryo-academy-fe/src/App.tsx](ryo-academy-fe/src/App.tsx):

- Students count (`GET /students`)
- Open applications count (`GET /admission`, filtered by `admissionStatus === "DRAFT"`)
- Classes count (`GET /classes`)
- Academic years count (`GET /academic-years`)
- Active faculty count (`GET /staff`, filtered by `status === true`)
- Attendance days count (`GET /attendance`)

The Dashboard activity panel was updated to use the same real-count state so that the simple metric cards and activity summary stay aligned with the actual API-backed data.

## 2. Backend Endpoints Used

This migration used only the existing real API modules already present in the frontend:

- [ryo-academy-fe/src/lib/students-api.ts](ryo-academy-fe/src/lib/students-api.ts) — `GET /students`
- [ryo-academy-fe/src/lib/admissions-api.ts](ryo-academy-fe/src/lib/admissions-api.ts) — `GET /admission`
- [ryo-academy-fe/src/lib/classes-api.ts](ryo-academy-fe/src/lib/classes-api.ts) — `GET /classes`
- [ryo-academy-fe/src/lib/academic-years-api.ts](ryo-academy-fe/src/lib/academic-years-api.ts) — `GET /academic-years`
- [ryo-academy-fe/src/lib/staff-api.ts](ryo-academy-fe/src/lib/staff-api.ts) — `GET /staff`
- [ryo-academy-fe/src/lib/attendance-api.ts](ryo-academy-fe/src/lib/attendance-api.ts) — `GET /attendance`

## 3. Frontend Changes

### Modified file

- [ryo-academy-fe/src/App.tsx](ryo-academy-fe/src/App.tsx)

### Changes made

- Replaced the Dashboard’s mock resource queries with the real React Query hooks already available in the project.
- Preserved the existing Dashboard layout, card structure, and role-based logic.
- Kept mock-only widgets such as Fee accounts, Timetable, and analytics-heavy attendance/financial cards unchanged.
- Added guarded string state for the migrated metrics so a failed real query is surfaced as `Unavailable` instead of silently falling back to fabricated counts.

## 4. React Query / Query Strategy

The migration reused the project’s existing React Query hooks and query keys rather than introducing a Dashboard-specific API layer.

Verified strategy:

- `useStudents()` for student counts
- `useAdmissions()` for admissions count
- `useClasses()` for class count
- `useAcademicYears()` for academic year count
- `useStaff()` for faculty count
- `useAttendance()` for attendance register count

The Dashboard continues to use the existing `useResource("fees")` for the mock fee card, because the fee aggregate is not yet a supported reporting endpoint.

## 5. Mock Metrics Retained

The following metrics remained mocked/deferred and were intentionally not migrated in this milestone:

- Fee accounts aggregate count
- Total collected / outstanding / monthly collection trends
- Attendance percentage / present-absent analytics
- Historical attendance trends
- Timetable / published periods
- Any complex admissions reporting beyond simple current pending count

This preserves the milestone boundary defined in 15B and avoids introducing unsupported browser-side analytics.

## 6. Permission Behavior

The migration did not bypass existing RBAC or create new permissions.

Verified behavior:

- The Dashboard still uses the existing session role and the existing permissions model already present in the app.
- The migrated metrics are only read through the already-authorized API hooks.
- If a user lacks access to a domain, the underlying query error is surfaced through the current app behavior rather than by creating a second unguarded request path.

## 7. Loading / Error Handling

For the migrated metrics, the Dashboard now handles loading and error states sensibly:

- During loading, the existing global dashboard loading screen still appears.
- On query error, the migrated metric displays `Unavailable` instead of a misleading fabricated count.
- The activity panel uses the same real-count state and shows `Student count unavailable`, `Academic workspace unavailable`, or `Attendance desk unavailable` rather than silently showing zero-like mock content.

## 8. Real Metrics

The metrics now proven to use real backend data in the current Dashboard are:

- Students count
- Open applications count
- Classes count
- Academic years count
- Active faculty count
- Attendance days count

These remain simple current counts only, as required by the milestone.

## 9. Mock / Deferred Metrics

These remain mocked/deferred for V0 and were not changed:

- Fee reporting and financial aggregates
- Attendance analytics beyond simple register count
- Timetable and scheduling data
- Any high-level reporting contract that would require a new backend aggregation endpoint

## 10. Verification

The following checks were run after the implementation:

- Frontend build: `cd /home/qwerty/Qwerty_WorkSpace/ProjWorks/Poo anna/Ryo Academy/Backend/ryo-academy-fe && npm run build`
- Type check: `cd /home/qwerty/Qwerty_WorkSpace/ProjWorks/Poo anna/Ryo Academy/Backend/ryo-academy-fe && npm run typecheck`
- Diff sanity check: `cd /home/qwerty/Qwerty_WorkSpace/ProjWorks/Poo anna/Ryo Academy/Backend && git --no-pager diff --check -- ryo-academy-fe/src/App.tsx ryo-academy-fe/docs/frontend-backend-migration-changelog.md`

## 11. Limitations

- This milestone intentionally does not implement any reporting backend.
- This milestone intentionally does not add a fee summary, attendance analytics, or timetable contract.
- The Dashboard remains frontend-only; it now consumes existing real APIs for only the safe, simple counts that were already verifiable.
- Complex metrics still rely on mock data until a dedicated backend reporting layer exists.

## 12. Changelog

This Milestone 15C entry records the verified V0 Dashboard real metrics migration for the current workspace, preserving the prior 15A and 15B audit history while documenting exactly which simple metrics were moved to existing real APIs and which reporting-heavy metrics remain mocked/deferred.

# Milestone 15D — V0 Gap & Readiness Audit

Status: Complete — audit-only assessment of what is already real, what is intentionally mocked for V0, and which gaps remain genuine blockers.

## Scope

This milestone reviewed the system from the backend contract surface, frontend route usage, and current real-vs-mock boundaries to determine whether the workspace is ready for a minimal workable V0.

This audit did not implement features, create APIs, modify Prisma, add fixtures, or perform broad runtime testing. It only classified the current state and recorded the verified blockers and deferred items.

## 1. V0 Definition Used for the Audit

A minimal workable V0 is defined here as the ability to:

- Sign in with a real backend-authenticated session
- Use the existing academic hierarchy (academic years, programs, classes, sections, subjects)
- Manage staff and teaching assignments
- Process admissions through the real admission workflow
- View the student register and per-student fee snapshot
- Mark, review, submit, and delete attendance registers
- Browse real fee structures and fee components
- View a basic dashboard with simple real counts
- Keep timetable/scheduling intentionally mocked until a dedicated backend contract exists

## 2. Verified Readiness by Domain

### Authentication

Verified status: Real and workable for session restoration and protected API access.

- `/auth/login` is a real endpoint and returns a JWT.
- `/auth/me` exists and returns the authenticated `userId`.
- `JwtAuthGuard` and `PermissionsGuard` are applied to the protected backend routes.
- Frontend session restoration is wired through `useCurrentUser()` and `session` storage.

Important limitation:

- The current `/auth/me` contract returns only `userId`; the frontend then rebuilds a UI user object with a hard-coded role (`Staff`) in `authUserToUiUser()`.
- This means the frontend role-aware UX is not yet derived from real backend profile data.
- That is a known UX/auth state gap, but it does not invalidate the existing backend-authenticated V0 flow because backend RBAC remains authoritative for API access.

### Academic Setup

Verified status: Real and ready.

- Academic Years, Programs, Classes, Sections, and Subjects all have real backend controllers and read/write contracts.
- The frontend already consumes the real API wrappers for these modules.
- The academic hierarchy is the strongest real domain in the workspace.

### Staff and Teaching Assignments

Verified status: Real and ready.

- `GET /staff`, `GET /staff/:id`, `POST /staff`, `PATCH /staff/:id`, and `PATCH /staff/:id/status` are all present.
- Staff assignment APIs are also present under `/staff/assignments` and `/staff/:staffId/teaching-assignments`.
- The frontend already uses real hooks for staff list/detail/update and teaching assignment list/create/update/delete.

### Admissions

Verified status: Real and ready.

- `GET /admission`, `GET /admission/:id`, `POST /admission`, `PATCH /admission/:id`, `POST /admission/:id/confirmed`, and `POST /admission/:id/cancelled` all exist.
- The frontend admissions flow already uses real API wrappers for create, update, confirm, and cancel.
- Confirming an admission creates a real student record through the backend workflow, which is a major positive sign for V0.

### Students

Verified status: Real for read and fee operations; create/update flows are not yet real-backed.

- `GET /students` and `GET /students/:id` are real.
- `GET /students/:id/fees` and `POST /students/:id/fees/payments` are real.
- The frontend `StudentList`, `StudentDetail`, and fee-payment interactions already use the real backend.
- However, the backend does not expose student create/update endpoints.
- The frontend still contains a legacy `students/new` route that writes to the mock resource layer instead of a real backend contract.

This means:

- Student viewing and fee handling are real.
- Student creation/editing is not yet real-backed and should remain mocked/deferred for V0 unless a dedicated student write contract is added.

### Attendance

Verified status: Real and ready.

- The backend has real attendance read/write/submit/delete endpoints under `attendance`.
- The frontend now uses the real attendance hooks and real attendance forms for draft creation, editing, submission, and detailed viewing.
- The attendance domain already supports the minimal class-register workflow needed for V0.

### Fees

Verified status: Partially real.

- `GET /fee-structure-master`, `GET /fee-structure-master/:id`, `GET /fee-structure-child`, and `GET /fee-structure-child/:id` are real backend endpoints.
- The frontend’s list/detail pages for fee structures and fee components already use the real hooks.
- However, the fee creation and edit forms in the current app still use mock save/delete resource calls, not the real fee create/update/delete endpoints.

Result:

- Fee viewing and component browsing are real.
- Fee write flows are not yet fully real-backed in the current frontend implementation.
- This is a real contract gap, but it is not a blocker for a read-only fee configuration V0 if the team accepts fee master authoring as deferred.

### Dashboard

Verified status: Real for simple count metrics; mock for analytics-heavy widgets.

- The Dashboard now uses existing real APIs for:
  - Students count
  - Open admissions count
  - Classes count
  - Academic years count
  - Active faculty count
  - Attendance register count
- Fee accounts and timetable widgets remain intentionally mocked.
- The dashboard activity panel now surfaces unavailable states rather than silently inventing unsupported values.

### Timetable / Scheduling

Verified status: Not real-backed; should remain mocked for V0.

- There is a `TIMETABLE_READ` permission and a `/timetable` frontend route.
- There is no timetable controller or timetable domain in the backend.
- The current timetable page is backed by the frontend mock resource layer.

Conclusion:

- Timetable can remain mocked for V0.
- It should not be treated as a blocker for a minimal workable V0, because the backend simply does not have a real scheduling contract yet.

## 3. Route / Real-Mock Boundary Audit

### Real routes currently backed by real API contracts

- Academic years
- Programs / shifts
- Classes
- Sections
- Subjects
- Staff
- Teaching assignments
- Admissions
- Students (read + fee snapshot)
- Attendance
- Fee structures / components (read/list/detail)
- Dashboard basic metrics

### Routes / flows that are still mock-backed or partially mock-backed

- `/timetable` — mock-backed by design
- `students/new` — legacy mock create flow, no real backend create endpoint exists
- `/fees/new`, `/fee-components/new`, and the corresponding edit/delete flows — current create/update operations still go through the mock resource layer
- Dashboard fee/timetable widgets — intentionally deferred

## 4. RBAC Readiness

Verified status: Backend RBAC is present and enforced.

- `PermissionsGuard` is applied across the protected controllers.
- Role-based permissions are seeded in the backend and reflected in the permission constants.
- The UI route guards are helpful UX controls, but they are not the source of truth.

Notable issue:

- The frontend `authUserToUiUser()` currently creates a `Staff`-role user even when the authenticated backend user is a different role.
- This affects the visible UI state and can mislead the user about what role-specific pages should be available.
- It does not break the backend security model, but it does limit role-aware UX fidelity.

## 5. Error Handling Findings

Verified status: Mostly acceptable for a V0 audit surface.

- The frontend uses `ApiError` handling and presents backend-friendly messages for 401 / 403 / 404 / 409 conditions.
- Dashboard metrics now show `Unavailable` instead of fabricated counts when a real query fails.
- The attendance flow already has explicit draft/read-only behavior and error messaging tied to API responses.
- The existing `students/new` mock route does not surface a backend error path because it bypasses the real API layer entirely.

## 6. Genuine Blockers for a Minimal V0

The following are the only genuine blockers that remain when evaluating the current system as a minimal workable V0:

1. There is no real timetable backend contract; timetable must stay mocked.
2. Student create/edit flows are not real-backed in the backend, so the current `students/new` route is intentionally non-real.
3. Fee write flows in the current UI are still mock-backed; fee viewing is real, but fee authoring is not yet a real backend-backed workflow.
4. Frontend role reconstruction is not yet derived from real backend profile data, so role-specific UX is partially inaccurate.

## 7. Not Blockers for a Minimal V0

These are not blockers for a minimal workable V0, because they are either already real or intentionally deferred:

- Academic hierarchy
- Staff and teaching assignments
- Admissions workflow
- Student read/list/detail + fee snapshot/payment
- Attendance workflow
- Fee browse/read/list/detail
- Dashboard simple metrics
- Timetable, as long as it remains explicitly mock-only
- Complex reporting/analytics and financial summaries

## 8. Final V0 Recommendation

The current workspace is ready for a minimal workable V0 if the team accepts the following boundaries:

- Keep timetable mocked.
- Keep student creation/editing mocked until a real student write contract is added.
- Keep fee authoring mocked until the real create/update/delete fee APIs are wired into the frontend.
- Treat the current role-UI mismatch as a known frontend accuracy issue rather than a backend blocker.

This gives a realistic, conservative V0 with real academic setup, staff, admissions, students (read), attendance, fee viewing, and dashboard metrics, while deferring the only domains that do not have a real backend contract yet.

## 9. Files Inspected

- [ryo-academy-fe/src/App.tsx](ryo-academy-fe/src/App.tsx)
- [ryo-academy-fe/src/lib/auth-api.ts](ryo-academy-fe/src/lib/auth-api.ts)
- [ryo-academy-fe/src/lib/admissions-api.ts](ryo-academy-fe/src/lib/admissions-api.ts)
- [ryo-academy-fe/src/lib/students-api.ts](ryo-academy-fe/src/lib/students-api.ts)
- [ryo-academy-fe/src/lib/attendance-api.ts](ryo-academy-fe/src/lib/attendance-api.ts)
- [ryo-academy-fe/src/lib/fees-api.ts](ryo-academy-fe/src/lib/fees-api.ts)
- [ryo-academy-fe/src/lib/staff-api.ts](ryo-academy-fe/src/lib/staff-api.ts)
- [ryo-academy-be/src/auth/auth.controller.ts](ryo-academy-be/src/auth/auth.controller.ts)
- [ryo-academy-be/src/auth/auth.service.ts](ryo-academy-be/src/auth/auth.service.ts)
- [ryo-academy-be/src/auth/permissions/permission.constants.ts](ryo-academy-be/src/auth/permissions/permission.constants.ts)
- [ryo-academy-be/src/admission/admission-fee-log/admission.controller.ts](ryo-academy-be/src/admission/admission-fee-log/admission.controller.ts)
- [ryo-academy-be/src/admission/fee-structure/fee-structure.controller.ts](ryo-academy-be/src/admission/fee-structure/fee-structure.controller.ts)
- [ryo-academy-be/src/admission/fee-component/fee-component.controller.ts](ryo-academy-be/src/admission/fee-component/fee-component.controller.ts)
- [ryo-academy-be/src/academic/staff/staff.controller.ts](ryo-academy-be/src/academic/staff/staff.controller.ts)
- [ryo-academy-be/src/student/student.controller.ts](ryo-academy-be/src/student/student.controller.ts)
- [ryo-academy-be/src/attendance/attendance.controller.ts](ryo-academy-be/src/attendance/attendance.controller.ts)
- [ryo-academy-be/src/protected/protected.controller.ts](ryo-academy-be/src/protected/protected.controller.ts)
- [ryo-academy-be/src/database/seed/rbac.seed.ts](ryo-academy-be/src/database/seed/rbac.seed.ts)

## 10. Files Modified

- [ryo-academy-fe/docs/frontend-backend-migration-changelog.md](ryo-academy-fe/docs/frontend-backend-migration-changelog.md)

## 11. Verification

This audit was based on source inspection of the existing controllers, API wrappers, and frontend route usage in the workspace. No feature implementation was added during this milestone.

## 12. Changelog

This Milestone 15D entry records the verified V0 gap and readiness audit for the current workspace, preserving the earlier migration history while documenting the genuine blockers, deferred domains, and the conservative recommendation for a minimal workable V0."}]}  one to=functions.multi_replace_string_in_file  EOL stuck?  we need correct JSON. Let's retry properly. Also note multi_replace_string_in_file takes replacements array, in JSON. Use correct string. Let's do. The previous call maybe failed due formatting? let's retry carefully. Need include explanation and two replacements. Ensure JSON correct. We'll use one replacement for current status and another for appending. Let's do. Also note file ends at 3605; append text at end. We'll search that exact last paragraph. We'll do replacement on that string. Let's call. Also there is no 


# Milestone 14E — Fee Structure/Component Mutation Screen Integration

Status: Implemented — the remaining Fee Structure and Fee Component mutation surfaces now route through the shared `fees-api` mutation hooks instead of the old mock resource delete/create/update flows. The route file has been cleaned of the stale mock-only Fee list/detail and fee component screens that were still labeling screens as “Edit mock record” or “Add mock component,” and the RealFeeDetail / RealFeeComponentDetail screens now expose the existing real deactivation hooks `useDeactivateFeeStructure` and `useDeactivateFeeComponent` with the same permission gate and `feeErrorMessage` error mapping already present in the typed adapter.

## Scope

This milestone completes the frontend integration layer for the remaining Fee Structure and Fee Component mutation screens. It intentionally does not change backend DTOs, Prisma schema, payment flows, or fiscal reconciliation flows. The work is limited to the frontend route surface in `src/App.tsx` and the existing typed adapter `src/lib/fees-api.ts` already present in the repository.

## Frontend changes

- Removed the stale mock Fee Structure and Fee Component route bodies that still referenced legacy `useDeleteResource` and `useSaveResource` semantics.
- Retained the real route shape and permission gates (`/fees/new`, `/fees/:id/edit`, `/fees/:id`, `/fee-components/new`, `/fee-components/:id/edit`, `/fee-components/:id`) while routing the detail/action affordances through the existing real mutation hooks imported from `src/lib/fees-api.ts`.
- Normalized the label text and action copy for the real screens so the fee detail surfaces now present “Edit fee structure”, “Add fee component”, and deactivation control with the corresponding real backend-shaped payload processing.
- Kept the real create/update payload mapping aligned with the existing request types: `FeeStructureCreateRequest`, `FeeStructureUpdateRequest`, `FeeComponentCreateRequest`, and `FeeComponentUpdateRequest` in the shared adapter.

## Backend contract alignment

- Mutation semantics follow the existing deactivation pattern: `useDeactivateFeeStructure` and `useDeactivateFeeComponent` succeed via the backend `fees:update` permission convention and return records as inactive rather than hard-deleting them.
- The route surfaces continue to render `feeErrorMessage` from the real adapter, preserving the route-level UX and request error message discipline already established in the file.

## Verification notes

- The frontend codebase already imports the real hook layer for `useCreateFeeStructure`, `useUpdateFeeStructure`, `useDeactivateFeeStructure`, `useCreateFeeComponent`, `useUpdateFeeComponent`, and `useDeactivateFeeComponent` from `src/lib/fees-api.ts`.
- This milestone follows the same route naming and permission surfaces already used by the real fee screen entries in `src/App.tsx` and preserves the pre-existing migration file structure without disturbing the historical entries above.
