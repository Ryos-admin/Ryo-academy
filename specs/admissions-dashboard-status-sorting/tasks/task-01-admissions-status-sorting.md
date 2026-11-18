# Task 01: Admissions Dashboard Status Sorting

## Status
complete

## Batch
1

## Covers
R1, R2, R3, R4, R5, R6, R7

## Complexity
**Tier:** light  
**Signals:** Pure frontend sorting logic touching 2 existing UI/API files and extending existing test suites. Zero backend or schema changes.

## Description
Implement frontend sorting for admission records in `AdmissionList` (`ryo-academy-fe/src/pages/admissions-students-pages.tsx`). Export an explicit comparator in `ryo-academy-fe/src/lib/admissions-api.ts` that sorts admissions by approved status priority (Confirmed $\rightarrow$ Pending $\rightarrow$ Cancelled) and chronologically newest-first (`createdAt DESC`). Valid timestamps always precede invalid/missing timestamps within each status group. Tie-break identical or missing timestamps deterministically via primary key `id` ascending. Integrate the comparator downstream of search and status filters, preserving cache immutability and existing row actions. Add unit and component tests.

## Dependencies
**Depends on:** None (Batch 1)  
**Blocks:** None  
**Context from dependencies:** None

## Risk
None

## Project Context
- Package directory: `ryo-academy-fe/`
- Zero Em Dashes in UI text or labels per Rule R-02 and `anti-slop-changes.md`.
- Preserve React Query cache immutability: do not mutate `query.data` in-place.
- Verify with `npm run test` and `npx tsc --noEmit` from `ryo-academy-fe/`.

## Files to Create
None

## Files to Modify
- `ryo-academy-fe/src/lib/admissions-api.ts` — export `compareAdmissions`, `parseDateTimestamp`, and `ADMISSION_STATUS_RANK`.
- `ryo-academy-fe/src/pages/admissions-students-pages.tsx` — apply `compareAdmissions` to filtered rows in `AdmissionList`.
- `ryo-academy-fe/src/lib/__tests__/admissions-api.test.tsx` — unit tests for status ranking, date ordering, valid preceding invalid, and deterministic `id` fallback.
- `ryo-academy-fe/src/pages/__tests__/admission-fee-preview.test.tsx` — component test verifying rendered row sequence.

## Technical Details

### Implementation Steps
1. In `ryo-academy-fe/src/lib/admissions-api.ts`:
   - Define and export `ADMISSION_STATUS_RANK: Record<string, number>`:
     ```typescript
     export const ADMISSION_STATUS_RANK: Record<string, number> = {
       CONFIRMED: 1,
       DRAFT: 2,
       CANCELLED: 3,
     };
     ```
   - Define and export `parseDateTimestamp(value?: string | null): number | null`:
     ```typescript
     export function parseDateTimestamp(value?: string | null): number | null {
       if (!value) return null;
       const parsed = new Date(value).getTime();
       return Number.isNaN(parsed) ? null : parsed;
     }
     ```
   - Define and export `compareAdmissions(a: AdmissionResponse, b: AdmissionResponse): number`:
     ```typescript
     export function compareAdmissions(a: AdmissionResponse, b: AdmissionResponse): number {
       // 1. Primary sort: Status priority rank
       const rankA = ADMISSION_STATUS_RANK[a.admissionStatus] ?? 99;
       const rankB = ADMISSION_STATUS_RANK[b.admissionStatus] ?? 99;
       if (rankA !== rankB) return rankA - rankB;

       // 2. Secondary sort: createdAt timestamp (descending: newest first)
       const timeA = parseDateTimestamp(a.createdAt);
       const timeB = parseDateTimestamp(b.createdAt);

       const hasValidTimeA = timeA !== null;
       const hasValidTimeB = timeB !== null;

       if (hasValidTimeA && !hasValidTimeB) return -1;
       if (!hasValidTimeA && hasValidTimeB) return 1;

       if (hasValidTimeA && hasValidTimeB && timeA !== timeB) {
         return timeB! - timeA!;
       }

       // 3. Engineering fallback for deterministic stability
       return (a.id ?? "").localeCompare(b.id ?? "");
     }
     ```
2. In `ryo-academy-fe/src/pages/admissions-students-pages.tsx`:
   - Import `compareAdmissions` from `@/lib/admissions-api`.
   - In `AdmissionList`, apply `.sort(compareAdmissions)` to the filtered rows:
     ```typescript
     const rows = (query.data || [])
       .filter((item) => {
         const text = `${item.admissionNumber} ${item.studentName}`.toLowerCase();
         return (
           text.includes(search.toLowerCase()) &&
           (filter === "All" ||
             admissionStatusLabel(item.admissionStatus) === filter)
         );
       })
       .sort(compareAdmissions);
     ```
3. In `ryo-academy-fe/src/lib/__tests__/admissions-api.test.tsx`:
   - Add test suite `compareAdmissions`:
     - Ranks CONFIRMED before DRAFT before CANCELLED.
     - Sorts newer `createdAt` before older `createdAt` within same status.
     - Valid timestamps precede invalid or missing timestamps within the same status.
     - Status priority strictly dominates over timestamp validity (Confirmed with invalid date precedes Draft with valid date).
     - Identical timestamps or missing timestamps resolve deterministically by `id` ascending.
     - Never throws runtime exceptions on malformed dates.
     - Places unknown statuses at the end.
4. In `ryo-academy-fe/src/pages/__tests__/admission-fee-preview.test.tsx`:
   - Add component test asserting `AdmissionList` renders rows in the expected sorted order.

## Tests
- `ryo-academy-fe/src/lib/__tests__/admissions-api.test.tsx` — unit tests for `compareAdmissions` comparator.
- `ryo-academy-fe/src/pages/__tests__/admission-fee-preview.test.tsx` — component test verifying table row sequence.

## Acceptance Criteria
- [ ] Confirmed admissions precede Pending admissions, which precede Cancelled admissions.
- [ ] Within each status group, valid records are ordered from newest to oldest by `createdAt`.
- [ ] Valid timestamps always precede invalid or missing timestamps within each status group.
- [ ] Status priority strictly dominates over date validity.
- [ ] Missing or invalid dates do not throw errors and resolve deterministically via `id`.
- [ ] Search and filter operations preserve the status-rank and chronological ordering.
- [ ] `query.data` in React Query cache is not mutated.
- [ ] All existing tests in `admissions-api.test.tsx` and `admission-fee-preview.test.tsx` pass.
- [ ] `npm run typecheck` passes with zero new errors.
