# Ryo Academy — Domain Business Rules

> **Context Document**  
> **Status:** Authoritative  
> **Audience:** Human Engineers and AI Agents  
> **Canonical Path:** `docs/agent-context/domain-business-rules.md`

---

## 1. Domain Overview & Taxonomy

Ryo Academy manages the complete academic lifecycle from institution configuration down to daily student attendance and financial reconciliation. The business domain is partitioned into four major rule groups:
1. **Academic Hierarchy & Immutability**
2. **Admissions Lifecycle & State Machine**
3. **Attendance & Academic Calendar**
4. **Identity & Role-Based Access Control (RBAC)**

---

## 2. Academic Hierarchy & Immutability Rules

### Hierarchy Structure
$$\text{Academic Year} \longrightarrow \text{Program} \longrightarrow \text{Class} \longrightarrow \text{Section} \longrightarrow \text{Subject}$$

### Invariants & Business Rules
1. **Parent Immutability on Edit:**
   - When editing an existing entity (Program, Class, Section, Subject), its parent reference is **strictly immutable**. For example, a Class cannot be reassigned to a different Program, and a Subject cannot be reassigned to a different Class.
2. **Soft Deletion & Cascade Blocking:**
   - Active academic structures containing dependent active enrollments or sub-entities cannot be hard-deleted.
   - Deleting an Academic Year requires checking for active programs and enrollments.
   - Subject deletion requires explicit confirmation regarding the permanent removal of associated Teaching Assignments.
3. **Primary Academic Year Rule:**
   - Exactly one Academic Year can be flagged as `isPrimary = true` per school at any given time. Setting a new primary academic year must atomically unset the previous one.

---

## 3. Admissions Lifecycle & State Machine

### Verified States (From Source Model)
The `Admission` model defines the following lifecycle states:
- `DRAFT`: Initial record created, components may be customized.
- `APPLIED`: Application submitted by candidate or parent.
- `DOCUMENTS_VERIFIED`: Supporting records validated by administrative staff.
- `PROVISIONALLY_ACCEPTED`: Candidate approved pending fee structure confirmation.
- `FEE_PAID`: Mandatory admission fee/deposit successfully collected.
- `CONFIRMED`: Enrollment formalized; student record created or activated.
- `CANCELLED`: Admission application terminated.

### Confirmation Business Rules
1. **Confirmation Preconditions:**
   - An admission can transition to `CONFIRMED` only when its current status is valid (`PROVISIONALLY_ACCEPTED` or `FEE_PAID`).
   - A valid `FeePaymentHeader` snapshot must exist.
   - If mandatory admission fees exist, payment must be satisfied or explicitly zero-net concessions approved.
2. **Deterministic Fee Snapshot:**
   - Upon admission creation/confirmation, fee structures are snapshotted into `FeePaymentHeader` and `FeePaymentDetails`. Subsequent changes to master fee structures do not retroactively alter an existing admission snapshot.

### Admission Cancellation Rules (Resolved — BE-ND2 Stage 5)

1. **State Machine Preconditions:**
   - Only admissions in `DRAFT` status can be cancelled.
   - Attempting to cancel a `CONFIRMED` admission is strictly rejected with HTTP 409 Conflict and message:
     `Confirmed admissions cannot be cancelled.`
   - Attempting to cancel an already `CANCELLED` admission is rejected with HTTP 409 Conflict and message:
     `Admission is already cancelled.`
   - Attempting to cancel from any other status rejects with HTTP 409 Conflict.

2. **Concurrency & Transaction Boundaries:**
   - Cancellation executes inside an interactive database transaction (`$transaction`).
   - Serializes under an Admission row lock: `SELECT id, "admissionStatus", "schoolId" FROM "Admission" WHERE id = ${admissionId} FOR UPDATE`.

3. **Financial Safety & Fail-Closed Guard:**
   - Cancellation fails closed with HTTP 409 Conflict and code `CANCELLATION_UNRESOLVED_PAYMENTS` when:
     - Any `FeePayment` lacks a completed `reversalEvent`.
     - Any `FeePaymentInstallmentAllocation` has unreversed balances (`allocatedAmount !== reversedAmount`).
     - Any active `FeePaymentHeader` has `totalPaidAmount > 0`.
     - Any `FeePaymentDetail` has `amountPaid > 0`.
   - Fully reversed historical payments may remain in the database while cancellation succeeds, provided the financial safety checks pass.
   - Financial history is permanently preserved; cancellation does not create reversals or delete financial records.

4. **Defensive Student Deactivation:**
   - Students are standardly created only upon admission confirmation. If an active `Student` record is linked to a cancelled `DRAFT` admission, the cancellation transaction defensively deactivates it using `isActive = false`.
   - The cancellation operation does not modify `Student.deletedAt` (remains `null`; deactivated, not soft-deleted).

---

## 4. Attendance & Academic Calendar Rules

1. **Session & Marking Boundaries:**
   - Attendance is marked per Section per academic calendar day.
   - A session cannot be marked for dates outside the active Academic Year date range.
2. **Calendar Holidays:**
   - Days declared as school holidays or non-instructional days in the `AcademicCalendar` block standard attendance session generation unless explicitly marked with special event status.
3. **Attendance History Preservation:**
   - Historical attendance records are immutable. Changing a student's section or class mid-year does not purge or overwrite prior attendance history in previous sections.

---

## 5. Role-Based Access Control (RBAC) & Context Guards

### Identified Roles
- `SUPER_ADMIN`: Cross-school system administration (support/platform).
- `SCHOOL_ADMIN`: Full administrative control within a single tenant `schoolId`.
- `TEACHER`: Section-scoped attendance marking, subject management, and grading.
- `ACCOUNTANT`: Fee structure management, payment collection, concessions, and reversals.
- `STUDENT`: Read-only access to personal academic records, attendance, and fee receipts.
- `PARENT`: Read-only access to ward records and fee payment portals.

### Current Implementation Constraints
- **`/auth/me` Endpoint Limitation:** The current `/auth/me` endpoint returns only `{ id: string }`. Roles and explicit permission arrays are not yet fully serialized over the HTTP session endpoint.
- **Frontend Permission Strategy:** Until the `/auth/me` backend contract is expanded, frontend permission checks rely on hybrid role tokens and must avoid asserting authoritative permissions without backend guard validation.
