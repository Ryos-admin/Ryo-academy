# V0 Soft-Deletion Cascade Matrix

Status: **ISOLATED LOCAL DATABASE-BACKED VERIFICATION PASSED / REMOTE VERIFICATION NOT APPLICABLE**

This inventory is based on the current Prisma models and services. Existing conventions are mixed: most business models have `isActive`, while attendance and academic-calendar records additionally have `deletedAt`. There is no consistent `deletedById` audit field.

| Entity | Primary key | Current deletion fields | Ownership/dependencies | V0 decision | Current operation / authorization |
|---|---|---|---|---|---|
| `AcademicYear` | `id` | `isActive`, `deletedAt` | School-scoped; owns programs, calendars and academic-year references | Soft-delete parent; block when active confirmed enrollment exists; cascade owned academic structures transactionally | `academic-year.service`; existing `SHIFT_UPDATE` |
| `Program` | `id` | `isActive`, `deletedAt` | Exclusively belongs to academic year; owns classes | Soft-delete with academic-year cascade; active queries exclude it | `program.service`; existing program update permission |
| `Class` | `id` | `isActive`, `deletedAt` | Belongs to program; owns sections and class relationships | Soft-delete with parent cascade | `class.service`; existing class update permission |
| `Section` | `id` | `isActive`, `deletedAt` | Belongs to class; referenced by admissions/assignments/attendance | Soft-delete with parent cascade; preserve historical references | `section.service`; existing section update permission |
| `AcademicCalendar` | `id` | `isActive`, `deletedAt` | Exclusively belongs to academic year | Soft-delete with parent cascade | `academic-calendar.service`; existing calendar permission |
| `TeachingAssignment` | `id` | `isActive`, `deletedAt`; nullable `staffId` | Links staff, subject, class, section; year derived through class → program → academic year | Preserve/unassign on staff deactivation; cascade through owned class IDs during academic-year deletion | `staff.service`; existing `STAFF_UPDATE` |
| `Subjects` | `id` | `isActive`, `deletedAt` | Belongs to class in current schema; assignments reference it | Do not delete as an academic-year side effect; subject deletion soft-deletes assignments | `subject.service`; existing subject update permission |
| `Student` | `id` | `isActive`, `deletedAt` | Linked to admission and attendance history | Soft-delete only; never cascade historical records | Student lifecycle not currently exposed as a confirmed delete operation |
| `Staff` | `id` | `status`, `isActive`, `deletedAt` | Linked one-to-one to `User`; assignments and attendance reference it | Deactivate both staff and linked user; preserve history; unassign active assignments | `staff.service`; existing `STAFF_UPDATE` |
| `User` | `id` | `isActive`, `deletedAt` | Staff user account may be linked to staff | Disable linked staff user during staff deactivation; no independent staff-user delete endpoint | `auth`/staff lifecycle |
| `Admission` | `id` | `isActive` | References academic year/program/class/section and may create student/fees | Preserve history; do not cascade-delete from academic-year operation | admission status service; existing admission permissions |
| `AttendanceLogMaster` | `id` | `isActive`, `deletedAt` | References academic year/class/section/staff and children | Preserve historical records; only existing draft delete path | `attendance.service`; attendance update permission |
| `AttendanceLogChild` | `id` | `isActive` | Child of attendance master; references student | Preserve with attendance history; no academic-year cascade delete | attendance transaction service |
| `FeeStructure` / `FeeComponent` | `id` | `isActive` | Financial configuration may reference academic year/program/class | Preserve financial history; do not cascade-delete without a specific supported rule | fee services; existing fee permissions |
| `FeePaymentHeader` / details | `id` | `isActive` | Financial history references admissions/academic years | Never cascade-delete as academic-year side effect | fee/payment services |
| `School` | `id` | `isActive` | Tenant root for users and admissions | Not deleted by child operations | super-admin/school lifecycle |
| `Role` / `Permission` | `id` | `isActive` | Shared RBAC metadata | Not part of business cascades | RBAC seed/authorization |

## Resolved and remaining schema findings

1. Resolved in schema source: `TeachingAssignment.staffId` is nullable.
2. Resolved for V0-owned lifecycle entities by adding nullable `deletedAt` fields.
3. Resolved without a new direct relation: assignments are selected through their class IDs, whose program points to the academic year.
4. The current subject relation remains `Subjects -> Class`; no subject-year join was introduced.
5. No deletion-actor field was added because the current controller/service contract does not pass an authenticated actor into these operations.

## Safe implementation boundary

The schema and service changes were validated and the migration was applied to a disposable local database. Focused lifecycle unit tests now cover academic-year, staff, and subject paths. Runtime verification against remote/shared data remains blocked and was not attempted.

## Security regression review

- Confirmed handled: normal operational reads added `deletedAt: null` filters for staff, assignments, students, admissions, subjects, academic structures, and academic-year lookup paths.
- Confirmed handled: deleted staff cannot be used for new assignments; deleted subjects/classes/sections cannot be used for new subject operations.
- Confirmed handled: staff deactivation updates only the linked user and unassigns that staff member's active assignments inside the same transaction.
- Potential risk: these services still receive only resource IDs, not trusted school context, so runtime cross-school isolation is not proven by unit tests.
- Implemented in this milestone: destructive controllers now pass the trusted JWT `userId` into academic-year, staff-status, and subject-delete services; each service resolves the actor's database `schoolId` and scopes its target before mutation.
- Unit coverage added for trusted context and school-mismatch rejection at the service boundary.
- Implemented: `deletedById` actor attribution is supplied only from the trusted JWT user ID.

## Deletion actor attribution

| Operation | Soft-deleted entities | `deletedById` |
|---|---|---|
| Academic-year deletion | Academic year, programs, classes, sections, calendar records, teaching assignments | Authenticated actor |
| Staff deactivation | Staff and linked user | Authenticated actor |
| Staff assignment handling | Teaching assignments are unassigned, not deleted | Not applicable |
| Subject deletion | Subject and dependent teaching assignments | Authenticated actor |

Repeated deletion exits before mutation, preserving original timestamps and actor metadata.

## Closure verification

- Local PostgreSQL migration status: verified up to date.
- Local catalog: 21 deletion columns and 9 deletion-actor foreign keys verified; nullable assignment staff reference and deletion indexes verified.
- Database-backed service scenarios passed on disposable local PostgreSQL: enrollment blocking, approved cascade attribution, history preservation, staff/user lifecycle, subject dependency behavior, repeated-delete metadata, cross-school rejection, and transaction rollback.
- The harness preserved a student and admission. Attendance and fee-history fixtures were not created, so those matrix rows remain runtime-unverified.
- The reusable fixture harness is `test/soft-delete.integration.ts`; it validates the local target before connecting and cleans up only its test-owned IDs.
- The harness exercises actual services with a real Prisma connection. Controller/JWT transport behavior remains covered separately; this harness does not claim a full HTTP authorization matrix.

## 2026-10-11 consolidated verification status

- Previously verified local service-level cascade scenarios remain recorded above; they were not duplicated in this pass.
- Attendance-history and fee-payment-history preservation remain unverified by the existing soft-delete fixture.
- No fresh database-backed preservation or HTTP/JWT role-matrix result is claimed: the local PostgreSQL/TypeScript runner was blocked before fixture execution.

## HTTP/JWT authorization QA — 2026-10-11

- Static inspection confirmed JWT and permission guards on the academic-year, staff, subject, fee-payment, expense, and FinancialLog routes.
- Static inspection confirmed destructive handlers receive actor identity from `request.user.userId`, not from request body school/actor fields.
- Full HTTP status and cross-school state assertions remain BLOCKED pending a runnable isolated PostgreSQL-backed application.

## HTTP/JWT runtime result — 2026-10-11

- The compiled backend runtime was started on temporary port `7676` against disposable local PostgreSQL.
- Real HTTP checks passed for missing and invalid tokens across the requested route set, Office Admin access to FinancialLog, Staff denial of FinancialLog, and cross-school expense deletion rejection with independent database state checks.
- Academic-year, staff, subject, and fee-payment requests were covered for missing/invalid-token guard behavior; full valid-domain mutation coverage for those routes requires additional domain fixtures and remains outside this harness.
