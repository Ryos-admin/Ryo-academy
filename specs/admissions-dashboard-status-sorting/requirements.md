# Requirements: Admissions Dashboard Status Sorting

## Summary
Provide a deterministic, operational order of admission records on the Admissions Dashboard (`AdmissionList` at `/admissions`). Records are grouped by lifecycle status according to approved school operational priorities (Confirmed first, Pending second, Cancelled third), and ordered within each status group chronologically by creation timestamp (`createdAt DESC`). Valid timestamps always precede invalid or missing timestamps. This is a frontend-only improvement that preserves all existing backend contracts, permissions, and financial logic.

## Goals
- Order admissions by approved status priority: Confirmed (`CONFIRMED`) $\rightarrow$ Pending (`DRAFT`) $\rightarrow$ Cancelled (`CANCELLED`).
- Sort chronologically within each status group: newest first based on `createdAt DESC`.
- Ensure valid timestamps always precede invalid or missing timestamps within each status group.
- Provide a simple, deterministic engineering fallback on primary key `id` for identical or missing timestamps.
- Ensure date validity never overrides status priority.
- Preserve existing search text and status dropdown filtering behavior.
- Preserve all existing row actions (navigation to details, edit, cancel).
- Ensure array immutability so React Query cache data is never mutated.

## Non-Goals
- Backend API or database changes (no query parameters or schema changes).
- New admission statuses.
- Modifications to financial models, fee calculations, payment flows, or historical data.
- Server-side sorting, pagination, or multi-column interactive table sorting.
- Secondary product sorting dimensions (`admissionSequence` and `admissionNumber` are not product sorting rules).
- Timetable or Academic Year lifecycle changes.

## Acceptance Criteria
- [ ] **R1 (Status Priority):** Admissions are ordered in exact approved priority: Confirmed (`CONFIRMED`) $\rightarrow$ Pending (`DRAFT`) $\rightarrow$ Cancelled (`CANCELLED`). Status priority strictly dominates timestamp comparison.
- [ ] **R2 (Chronological Ordering):** Within each status group, records with valid timestamps are ordered newest first based on `createdAt DESC`.
- [ ] **R3 (Invalid Date Robustness):** Within each status group, records with valid timestamps always precede records with missing or invalid timestamps. Missing or malformed dates never throw runtime exceptions.
- [ ] **R4 (Deterministic Engineering Fallback):** Admissions with identical status and indistinguishable timestamps (identical or both invalid) are ordered deterministically by primary key `id` ascending.
- [ ] **R5 (Search & Filter Integrity):** Filtering by search text or status dropdown preserves the status-rank and chronological ordering across all matching records.
- [ ] **R6 (Immutability Guard):** Sorting operates on a cloned array without mutating React Query cache data.
- [ ] **R7 (Action Preservation):** Existing navigation to `/admissions/:id` and action buttons (Edit, Cancel) remain intact and gated by existing permissions.

## Coverage

| Requirement | Tasks |
|---|---|
| R1 | task-01-admissions-status-sorting.md |
| R2 | task-01-admissions-status-sorting.md |
| R3 | task-01-admissions-status-sorting.md |
| R4 | task-01-admissions-status-sorting.md |
| R5 | task-01-admissions-status-sorting.md |
| R6 | task-01-admissions-status-sorting.md |
| R7 | task-01-admissions-status-sorting.md |

## Assumptions
- `AdmissionResponse.createdAt` is provided as an ISO 8601 string by the backend.
- The admissions list size fits in client memory without requiring pagination.

## Technical Constraints
- Frontend-only implementation in `ryo-academy-fe`.
- Zero changes to backend `AdmissionService`, `AdmissionController`, or Prisma schema.
- Adhere to Ryo Academy anti-slop guidelines (no em dashes in UI, 44px tap targets).
