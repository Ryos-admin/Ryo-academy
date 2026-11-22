# Requirements Matrix: School-wide Academic Year Configuration & Fee Management Dashboard (V1.1)

## 1. Overview and Scope

This specification defines the functional, architectural, security, and interface requirements for **Feature 3**:
1. School-wide Academic Year configuration managed through the College Admin Profile and persisted on the `School` entity.
2. A dedicated Fee Management Dashboard (`/fee-management`) displaying confirmed admissions belonging to the school's configured academic year.

All requirements enforce strict tenant isolation (relying on server-authenticated JWT context), lifecycle independence (selection never mutates AcademicYear lifecycle state), and financial immutability (zero financial mutations or payment adjustments).

---

## 2. Requirements Matrix

| ID | Category | Requirement Statement | Priority | Verification Method |
|---|---|---|---|---|
| **R1** | Database Schema | Add `activeAcademicYearId String?` to `School` with an explicit bi-directional foreign key relationship to `AcademicYear`. Disambiguate existing relation using explicit relation names on both sides. | Critical | Schema Check / DB Test |
| **R2** | Database Schema | Set `onDelete: SetNull` for `activeAcademicYearId`. Preserve backward compatibility with existing schools having `NULL` configuration. | Critical | DB Integration Test |
| **R3** | RBAC Security | Introduce `PERMISSIONS.SCHOOL_UPDATE = 'school:update'` in backend constants and assign it to `COLLEGE_ADMIN` in RBAC seeds. Map to `SCHOOL_UPDATE` in frontend permission types. Ensure `OFFICE_ADMIN` and `STAFF` do NOT receive this permission. | Critical | Unit / RBAC Test |
| **R4** | Backend API | Implement `GET /schools/configuration` returning current school information, `activeAcademicYearId`, full academic year details (if configured), and `isConfigured: boolean`. Accessible to all authenticated users of the school. | High | Controller / HTTP QA |
| **R5** | Backend API | Implement `PATCH /schools/configuration` accepting `{ activeAcademicYearId: string }`. Guard with `SCHOOL_UPDATE` permission. | Critical | Controller / HTTP QA |
| **R6** | Tenant Isolation | Derive `schoolId` strictly from server-side JWT context (`req.user.userId -> user.schoolId`). Verify user is active and not deleted, and school is active. Reject client-supplied `schoolId` headers or payload overrides. | Critical | Security / Isolation Test |
| **R7** | Domain Validation | Validate that submitted `activeAcademicYearId` belongs to the actor's school, exists, is active (`isActive: true`), and is not soft-deleted (`deletedAt: null`). Reject cross-school references with `400 Bad Request`. | Critical | Service Unit Test |
| **R8** | Lifecycle Decoupling | Selecting or updating the school's configured academic year must **never** mutate `AcademicYear.isActive`, lifecycle status, dates, or other fields. | Critical | Regression / Audit Test |
| **R9** | Backend API | Implement `GET /fee-management/dashboard` scoped to the authenticated user's school and the configured academic year. | Critical | Controller / Integration Test |
| **R10** | Query Scoping | The Fee Management Dashboard must filter strictly in the database query `where` clause by `schoolId: actor.schoolId`, `academicYearId: school.activeAcademicYearId`, `admissionStatus: CONFIRMED`, `isActive: true`, and `deletedAt: null`. Zero cross-school rows in memory. | Critical | Service Query Test |
| **R11** | Pagination & Sorting | `GET /fee-management/dashboard` must enforce server-side pagination (`page`, `pageSize`, default 25, max 100) and deterministic sorting (`createdAt DESC, id ASC`). Response must include `data`, `page`, `pageSize`, `total`, and `totalPages`. | High | Controller Test |
| **R12** | Fallback Prevention | When `activeAcademicYearId` is `NULL`, return `configured: false` with empty data (`total: 0`, `data: []`). **Do not automatically select or fall back to the newest academic year.** | Critical | Functional Test |
| **R13** | Soft-Delete Resilience | If a previously configured academic year is soft-deleted (`deletedAt !== null`) or deactivated, return `configured: false, invalidConfiguration: true`. Display a configuration alert prompting reconfiguration. | High | Edge-Case Test |
| **R14** | Profile UI | In the Profile page (`/profile`), display a School Academic Year Configuration card visible only to users with `SCHOOL_UPDATE`. Allow selecting an academic year from an active school-scoped dropdown and saving via `PATCH /schools/configuration`. | High | Component Test |
| **R15** | Cache Invalidation | Saving a new academic year configuration must invalidate React Query cache keys `["schools", "configuration"]` and `["fee-management", "dashboard"]`, immediately synchronizing the UI across tabs/views. | High | UI Integration Test |
| **R16** | Dashboard UI | Create `/fee-management` route with dedicated sidebar link. Display the configured academic year badge, search/filter toolbar, admission table, and empty/unconfigured states. | High | Component Test |
| **R17** | Row Navigation | Clicking any admission row in the Fee Management Dashboard must navigate directly to the existing Admission Details page (`/admissions/:id`). No new details workflow. | High | DOM / Component Test |
| **R18** | Financial Boundary | The Fee Management Dashboard and School Configuration endpoints must be strictly read-only regarding ledger/payments. No payment creation, fee structure mutations, or concession adjustments. | Critical | Audit / Security Test |
| **R19** | Single UI Source | All frontend consumers (Sidebar chip, Profile card, Fee Dashboard context) must consume the single shared `useSchoolConfiguration()` hook. No hardcoded academic year strings anywhere. | High | Code Review / Test |

---

## 3. Acceptance Criteria & Verification Evidence

### Criterion 1: Schema Invariants (R1, R2)
- [ ] Prisma schema defines explicit relation names:
  ```prisma
  // School
  academicYears AcademicYear[] @relation("SchoolAcademicYears")
  activeAcademicYearId String?
  activeAcademicYear AcademicYear? @relation("SchoolActiveAcademicYear", fields: [activeAcademicYearId], references: [id], onDelete: SetNull)

  // AcademicYear
  school School? @relation("SchoolAcademicYears", fields: [schoolId], references: [id])
  configuredInSchools School[] @relation("SchoolActiveAcademicYear")
  ```
- [ ] Existing database records load without errors when `activeAcademicYearId` is `NULL`.
- [ ] Deleting an AcademicYear via hard delete sets `activeAcademicYearId` to `NULL` without throwing FK violations.

### Criterion 2: Security & Tenant Isolation (R3, R5, R6, R7)
- [ ] Calling `PATCH /schools/configuration` without a valid JWT returns `401 Unauthorized`.
- [ ] Calling `PATCH /schools/configuration` as a user without `SCHOOL_UPDATE` (e.g. `STAFF` or `OFFICE_ADMIN`) returns `403 Forbidden`.
- [ ] Calling `PATCH /schools/configuration` with an `academicYearId` from School B while authenticated as College Admin of School A returns `400 Bad Request` with message `Academic year does not belong to this school`.
- [ ] Calling `PATCH /schools/configuration` with a soft-deleted `academicYearId` returns `400 Bad Request`.
- [ ] Calling endpoints as a soft-deleted or inactive user returns `403 Forbidden` (`User is inactive or deleted`).
- [ ] Calling endpoints with an inactive school returns `403 Forbidden` (`School is inactive or not found`).
- [ ] Sending a payload containing `{ schoolId: "foreign-uuid" }` is rejected by class-validator (`forbidNonWhitelisted: true`).

### Criterion 3: Lifecycle Invariant (R8)
- [ ] Calling `PATCH /schools/configuration` updates `School.activeAcademicYearId` and `School.updatedAt`.
- [ ] The referenced `AcademicYear` row in the database is verified unchanged before and after the PATCH call (`isActive`, `startDate`, `endDate`, and lifecycle fields remain identical).

### Criterion 4: Unconfigured & Fallback Behavior (R12, R13, R19)
- [ ] When `School.activeAcademicYearId` is `NULL`, `GET /fee-management/dashboard` returns:
  ```json
  {
    "configured": false,
    "invalidConfiguration": false,
    "activeAcademicYear": null,
    "data": [],
    "page": 1,
    "pageSize": 25,
    "total": 0,
    "totalPages": 0
  }
  ```
- [ ] The dashboard does NOT fall back to any other academic year. The UI renders the "No Academic Year Configured" empty state with a call-to-action button for College Admins to configure one.
- [ ] The sidebar `.workspace-chip` displays "No AY Selected" instead of hardcoded text.

### Criterion 5: Scoping & Determinism (R9, R10, R11)
- [ ] Admissions with status `DRAFT` or `CANCELLED` are completely omitted from `GET /fee-management/dashboard`.
- [ ] Admissions belonging to a different academic year or different school are completely omitted.
- [ ] Soft-deleted (`deletedAt !== null`) admissions are omitted.
- [ ] Order of records matches `createdAt DESC, id ASC`.
- [ ] Pagination parameters `page=2&pageSize=10` return the second slice of results with correct total and totalPages counts.

### Criterion 6: UI & Navigation (R14, R15, R16, R17)
- [ ] In `/profile`, College Admin sees "School Academic Year Configuration" panel with the current selection pre-selected.
- [ ] Changing the dropdown and clicking "Save Configuration" sends `PATCH /schools/configuration`, updates UI, and invalidates queries.
- [ ] Sidebar link "Fee Management" navigates to `/fee-management`.
- [ ] Existing route `/fees` remains untouched as "Fee Structure Master".
- [ ] Clicking an admission row in the Fee Management Dashboard triggers navigation to `/admissions/:id`.
- [ ] The Admission Details page displays full details, fees, and payments without alterations.
