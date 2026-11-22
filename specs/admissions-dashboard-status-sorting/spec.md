# Feature Specification: Admissions Dashboard Status Sorting

**Document type:** Feature Specification  
**Status:** Ready for Review (Refined after Human Review)  
**Initiative / Area:** Feature 2 — Admissions Dashboard Status Sorting  
**Authoritative Reference:** [ryo-academy-be/docs/development-direction-scope-guard.md](file:///home/qwerty/Qwerty_WorkSpace/ProjWorks/Poo%20anna/Ryo%20Academy/Backend/ryo-academy-be/docs/development-direction-scope-guard.md)  
**Baseline Date:** November 18, 2026  
**Implementation Mode:** Frontend-only; zero backend or database changes  

---

## 1. Feature Objective and User-Visible Outcome

### 1.1 Objective
Provide a clear, operational, and deterministic ordering of admission records on the Admissions Dashboard (`AdmissionList` at `/admissions`). Admissions must be grouped by lifecycle status according to approved school operational priorities, and ordered within each status group chronologically by admission creation date (newest first).

### 1.2 User-Visible Outcome
When school administrators (College Admin or Office Admin) navigate to the Admissions Dashboard:
1. Confirmed admissions (`CONFIRMED` / `"Confirmed"`) always appear at the top of the table.
2. Pending admissions (`DRAFT` / `"Pending"`) appear immediately after confirmed admissions.
3. Cancelled admissions (`CANCELLED` / `"Cancelled"`) appear at the bottom of the table.
4. Within each status group, admissions appear chronologically newest-first based on `createdAt`.
5. Valid timestamps always precede invalid or missing timestamps within each status group.
6. Searching or status-filtering preserves this exact ordering across all displayed matching records.
7. No manual sort-header clicking or configuration is required; the view defaults automatically and deterministically to this approved operational order.

---

## 2. Current-State Findings & Source References

### 2.1 Display Component and Page Routing
- **Page Component:** `AdmissionList` in [ryo-academy-fe/src/pages/admissions-students-pages.tsx#L1897-L2064](file:///home/qwerty/Qwerty_WorkSpace/ProjWorks/Poo%20anna/Ryo%20Academy/Backend/ryo-academy-fe/src/pages/admissions-students-pages.tsx#L1897-L2064).
- **Route Wrapper:** `ParamAdmissionList` in [ryo-academy-fe/src/pages/app-pages.tsx#L662-L664](file:///home/qwerty/Qwerty_WorkSpace/ProjWorks/Poo%20anna/Ryo%20Academy/Backend/ryo-academy-fe/src/pages/app-pages.tsx#L662-L664).
- **Route Mounting:** Mounted under `/admissions` guarded by `ADMISSION_READ` permission in [ryo-academy-fe/src/pages/app-pages.tsx#L913-L917](file:///home/qwerty/Qwerty_WorkSpace/ProjWorks/Poo%20anna/Ryo%20Academy/Backend/ryo-academy-fe/src/pages/app-pages.tsx#L913-L917).

### 2.2 Data Fetching & State Management
- **Query Hook:** `useAdmissions()` in [ryo-academy-fe/src/lib/admissions-api.ts#L123-L125](file:///home/qwerty/Qwerty_WorkSpace/ProjWorks/Poo%20anna/Ryo%20Academy/Backend/ryo-academy-fe/src/lib/admissions-api.ts#L123-L125).
- **Query Key:** `admissionsQueryKey = ["admissions"] as const` ([admissions-api.ts#L104](file:///home/qwerty/Qwerty_WorkSpace/ProjWorks/Poo%20anna/Ryo%20Academy/Backend/ryo-academy-fe/src/lib/admissions-api.ts#L104)).
- **Backend Endpoint:** `GET /admission` in [ryo-academy-be/src/admission/admission-fee-log/admission.controller.ts#L42-L48](file:///home/qwerty/Qwerty_WorkSpace/ProjWorks/Poo%20anna/Ryo%20Academy/Backend/ryo-academy-be/src/admission/admission-fee-log/admission.controller.ts#L42-L48), backed by `AdmissionService.findAll()` ([admission.service.ts#L46-L48](file:///home/qwerty/Qwerty_WorkSpace/ProjWorks/Poo%20anna/Ryo%20Academy/Backend/ryo-academy-be/src/admission/admission-fee-log/admission.service.ts#L46-L48)).
- **Backend Query Capabilities:** Takes zero query parameters and specifies no `orderBy` clause, returning active records in default PostgreSQL physical storage order.

### 2.3 Existing Search and Filtering Implementation
In [ryo-academy-fe/src/pages/admissions-students-pages.tsx#L1945-L1954](file:///home/qwerty/Qwerty_WorkSpace/ProjWorks/Poo%20anna/Ryo%20Academy/Backend/ryo-academy-fe/src/pages/admissions-students-pages.tsx#L1945-L1954):
```typescript
const rows = (query.data || []).filter((item) => {
  const text = `${item.admissionNumber} ${item.studentName}`.toLowerCase();
  return (
    text.includes(search.toLowerCase()) &&
    (filter === "All" ||
      admissionStatusLabel(item.admissionStatus) === filter)
  );
});
```
- **Filter State:**
  - `search: string` — text match against `admissionNumber` and `studentName`.
  - `filter: string` — select box with values `["Pending", "Confirmed", "Cancelled"]` (mapped from `DRAFT`, `CONFIRMED`, `CANCELLED` via `admissionStatusLabel`). Default is `"All"`.
- **Existing Sorting:** **None.** Records are currently displayed in whatever order `query.data` arrived from the network.
- **Pagination:** **None.** All records are displayed in a single scrollable table with counter `Showing {rows.length} of {rows.length} records`.

### 2.4 Data Model & Field Availability Analysis
Inspection of the backend Prisma model `Admission` ([admission.prisma](file:///home/qwerty/Qwerty_WorkSpace/ProjWorks/Poo%20anna/Ryo%20Academy/Backend/ryo-academy-be/prisma/models/admission_fees/admission.prisma)), the backend service ([admission.service.ts](file:///home/qwerty/Qwerty_WorkSpace/ProjWorks/Poo%20anna/Ryo%20Academy/Backend/ryo-academy-be/src/admission/admission-fee-log/admission.service.ts)), and the frontend interface `AdmissionResponse` ([admissions-api.ts](file:///home/qwerty/Qwerty_WorkSpace/ProjWorks/Poo%20anna/Ryo%20Academy/Backend/ryo-academy-fe/src/lib/admissions-api.ts)) established the following baseline:

1. **`id` (UUID):**
   - **Prisma:** `id String @id @default(uuid())`
   - **Type:** Required non-empty string on `AdmissionResponse` (`id: string`).
   - **Reliability:** 100% present, non-null, and globally unique on every admission in every environment.
2. **`createdAt` (Timestamp):**
   - **Prisma:** `createdAt DateTime @default(now())`
   - **Type:** `createdAt?: string;` on `AdmissionResponse`.
   - **Reliability:** Populated automatically by PostgreSQL/Prisma on creation. In API responses, it serializes as an ISO 8601 string (e.g. `"2026-11-18T15:30:00.000Z"`). Marked optional in TypeScript DTO to accommodate partial mock objects.
3. **`admissionSequence` (Class-scoped Integer):**
   - **Prisma:** `admissionSequence Int`
   - **Type:** `admissionSequence: number;` on `AdmissionResponse`.
   - **Semantics:** Generated via `generateSequenceNumber()` based on `classCount` within a specific class/program placement. It is **not** a globally monotonic creation sequence across the school (two admissions in different classes often share `admissionSequence: 1`).
   - **Conclusion:** It must **not** be elevated to a product sorting rule.
4. **`admissionNumber` (Formatted Code):**
   - **Prisma:** `admissionNumber String @unique`
   - **Type:** `admissionNumber: string;` on `AdmissionResponse`.
   - **Semantics:** Business placement code (e.g. `"RYO-2026-ADM-0001"`). Not an approved sorting dimension.

---

## 3. Approved Product Decisions vs. Engineering Details

### 3.1 Approved Product Decisions (Constraints)
The following decisions are approved product requirements and must not be altered:
1. **Status Priority Order:**
   - Rank 1: **Confirmed** (`CONFIRMED`)
   - Rank 2: **Pending** (`DRAFT`)
   - Rank 3: **Cancelled** (`CANCELLED`)
2. **Chronological Ordering Within Status:**
   - Within each status group, records are sorted newest first using `createdAt DESC`.
3. **Execution Scope:**
   - **Frontend-only sorting.**
   - Zero changes to backend APIs, controllers, or database queries.
   - Applied downstream of existing search and status filters.
   - Immutability preserved: never mutate the React Query cache in-place.

### 3.2 Engineering Implementation Details (Tie-Breaking & Robustness)
The following behaviors are technical implementation details to ensure sorting determinism and runtime stability, rather than new product features:
1. **Simple Deterministic Fallback:**
   - When two records share the exact same status rank and identical `createdAt` timestamps, or when both lack valid timestamps, the comparator resolves their relative order deterministically using their unique primary key `id` ascending (`(a.id ?? "").localeCompare(b.id ?? "")`).
   - This prevents browser-dependent non-deterministic sorting when `Array.prototype.sort()` encounters equal comparator values.
2. **Invalid / Missing Date Handling:**
   - Valid timestamps always precede invalid or missing timestamps within the same status group.
   - Records with invalid or missing timestamps fall back to the deterministic `id` comparison.
   - Date parsing errors never throw unhandled runtime exceptions.
   - Date validity never overrides status priority (a Pending record with a valid date will never precede a Confirmed record with an invalid date).

---

## 4. Functional Requirements

### 4.1 Status Priority Mapping (R1)
The application must maintain an explicit ranking map for `AdmissionStatus`:
```typescript
export const ADMISSION_STATUS_RANK: Record<AdmissionStatus, number> = {
  CONFIRMED: 1,
  DRAFT: 2,
  CANCELLED: 3,
};
```
If an admission possesses an unmapped, null, or unrecognized status string, it must be assigned a fallback rank of `99` (sorted after Cancelled records).

### 4.2 Chronological Ordering & Date Parsing (R2)
Within any status group where admissions have identical status ranks:
1. Valid timestamps are converted to UTC millisecond epoch numbers (`number`).
2. Records with valid timestamps are sorted from newest to oldest ($\text{timeB} - \text{timeA}$).
3. Parsing must be defensive: `Date.parse()` or `new Date(...).getTime()` returning `NaN` must be treated as invalid.

### 4.3 Invalid and Missing Timestamp Rules (R3)
Within the same status group:
1. **Valid precedes Invalid:** Any record with a valid, parseable `createdAt` timestamp must appear before any record with an invalid, missing (`undefined`), null, or empty string timestamp.
2. **Both Invalid:** If both records have invalid or missing timestamps, neither has chronological precedence; their relative ordering is resolved deterministically via the fallback tie-breaker.
3. **No Cross-Status Spillover:** Invalid date handling applies strictly *within* status groups. Status priority strictly dominates:
   $$\forall c \in \text{CONFIRMED}, \forall d \in \text{DRAFT}: \quad c \text{ precedes } d$$
   even if $c$ lacks a timestamp and $d$ possesses a valid timestamp.

### 4.4 Deterministic Engineering Fallback (R4)
If two records within the same status group cannot be distinguished chronologically (because their valid timestamps are identical down to the millisecond, or both lack valid timestamps), their relative ordering is broken deterministically by their primary key `id` ascending:
$$\text{idDiff} = (a.id \mathbin{??} "").\text{localeCompare}(b.id \mathbin{??} "")$$
This guarantees stable, identical ordering across all browsers, re-renders, and test runs.

### 4.5 Search and Filter Pipeline Integration (R5)
Sorting must occur downstream of search and status filtering:
$$\text{Query Data} \xrightarrow{\text{Search Filter}} \text{Status Filter} \xrightarrow{\text{Status + Date Sort}} \text{Rendered Rows}$$
- When a user selects `"Confirmed"`, `"Pending"`, or `"Cancelled"`:
  - Only matching records are retained.
  - The retained records remain sorted newest-first by `createdAt DESC`.
- When a user clears the filter back to `"All"`:
  - All matching records are displayed, grouped by status (Confirmed $\rightarrow$ Pending $\rightarrow$ Cancelled) and sub-sorted newest-first.

### 4.6 Immutability Guard (R6)
The React Query cache (`query.data`) must not be mutated in-place. Sorting must be performed on a cloned or newly allocated array instance (e.g. `[...filteredRows].sort(comparator)`).

### 4.7 Preservation of Row Actions (R7)
Sorting must not alter row rendering, attributes, keys, or interactive actions:
- Table row `key={item.id}` remains stable.
- Direct link to Admission Details (`/admissions/${item.id}`) remains functional.
- Inline edit button (`/admissions/${item.id}`) remains functional.
- Inline cancel button for `DRAFT` admissions with `ADMISSION_UPDATE` permission remains functional.

---

## 5. Sorting Algorithm & Comparator Definition

### 5.1 Comparator Definition
The comparator function must be exported and tested as a pure utility in `ryo-academy-fe/src/lib/admissions-api.ts`:

```typescript
import type { AdmissionResponse, AdmissionStatus } from "@/lib/admissions-api";

export const ADMISSION_STATUS_RANK: Record<string, number> = {
  CONFIRMED: 1,
  DRAFT: 2,
  CANCELLED: 3,
};

/**
 * Safely parses an ISO date string into a millisecond timestamp.
 * Returns null if the value is missing, empty, or unparseable.
 * Never throws runtime exceptions.
 */
export function parseDateTimestamp(value?: string | null): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Pure comparator for admissions dashboard display.
 * 
 * Rules:
 * 1. Product Decision: Status priority CONFIRMED (1) -> DRAFT (2) -> CANCELLED (3).
 * 2. Product Decision: Within same status, newest first (createdAt DESC).
 * 3. Robustness Rule: Valid timestamps always precede invalid/missing timestamps.
 * 4. Implementation Detail: Deterministic fallback on primary key `id` ascending.
 */
export function compareAdmissions(a: AdmissionResponse, b: AdmissionResponse): number {
  // 1. Primary sort: Status priority rank
  const rankA = ADMISSION_STATUS_RANK[a.admissionStatus] ?? 99;
  const rankB = ADMISSION_STATUS_RANK[b.admissionStatus] ?? 99;
  if (rankA !== rankB) {
    return rankA - rankB;
  }

  // 2. Secondary sort: createdAt timestamp (descending: newest first)
  const timeA = parseDateTimestamp(a.createdAt);
  const timeB = parseDateTimestamp(b.createdAt);

  const hasValidTimeA = timeA !== null;
  const hasValidTimeB = timeB !== null;

  // Valid timestamps always precede invalid/missing timestamps
  if (hasValidTimeA && !hasValidTimeB) return -1;
  if (!hasValidTimeA && hasValidTimeB) return 1;

  // Both timestamps valid: newest first
  if (hasValidTimeA && hasValidTimeB && timeA !== timeB) {
    return timeB! - timeA!;
  }

  // 3. Deterministic engineering fallback for stability (primary key id)
  return (a.id ?? "").localeCompare(b.id ?? "");
}
```

### 5.2 Mathematical Invariants
For any list of admissions:
1. **Reflexivity:** $\text{compareAdmissions}(x, x) = 0$
2. **Anti-symmetry:** $\text{compareAdmissions}(x, y) = -\text{compareAdmissions}(y, x)$
3. **Transitivity:** $\text{compareAdmissions}(x, y) \le 0 \land \text{compareAdmissions}(y, z) \le 0 \implies \text{compareAdmissions}(x, z) \le 0$
4. **Dominance:** Status priority strictly dominates timestamp comparison.
5. **Validity Partition:** For any two records $x, y$ in the same status group where $x$ has a valid date and $y$ has an invalid date:
   $$\text{position}(x) < \text{position}(y)$$

---

## 6. Search and Filter Interaction Matrix

| User Interaction | Filter State | Search State | Expected Display Ordering |
| :--- | :--- | :--- | :--- |
| **Initial Load** | `"All"` | `""` | All records: Confirmed (newest $\rightarrow$ oldest) $\rightarrow$ Pending (newest $\rightarrow$ oldest) $\rightarrow$ Cancelled (newest $\rightarrow$ oldest) |
| **Search Query** | `"All"` | `"Sharma"` | Matching records: Confirmed (newest $\rightarrow$ oldest) $\rightarrow$ Pending (newest $\rightarrow$ oldest) $\rightarrow$ Cancelled (newest $\rightarrow$ oldest) |
| **Filter Pending** | `"Pending"` | `""` | Only DRAFT records, sorted strictly newest $\rightarrow$ oldest by `createdAt DESC` |
| **Filter Confirmed** | `"Confirmed"` | `""` | Only CONFIRMED records, sorted strictly newest $\rightarrow$ oldest by `createdAt DESC` |
| **Filter Cancelled** | `"Cancelled"` | `""` | Only CANCELLED records, sorted strictly newest $\rightarrow$ oldest by `createdAt DESC` |
| **Zero Matches** | `"Confirmed"` | `"nonexistent"` | Standard empty state rendered (`"No admissions found"`); zero sorting errors |

---

## 7. Edge Cases & Expected Behavior

| Edge Case | Condition | Expected Behavior |
| :--- | :--- | :--- |
| **Missing `createdAt`** | `createdAt: undefined` or `null` or `""` | `parseDateTimestamp` returns `null`. Placed after all valid timestamps within its status group. Relative order with other invalid records resolved via `id` fallback. |
| **Malformed `createdAt`** | `createdAt: "not-a-date"` | `new Date(...).getTime()` returns `NaN`. `parseDateTimestamp` returns `null`. Treated identically to missing date; does not throw. |
| **Missing Timestamp in Higher Status** | Confirmed record has `createdAt: null`; Pending record has valid timestamp | Confirmed record appears **before** Pending record because status priority strictly dominates. |
| **Unknown Status Value** | `admissionStatus: "SUSPENDED"` or `null` | Assigned fallback rank `99`. Record renders below Cancelled records. `admissionStatusLabel` renders `"Unknown"`. |
| **Identical Milliseconds** | Two records have the exact same valid timestamp | Broken deterministically by `id` ascending (`(a.id ?? "").localeCompare(b.id ?? "")`). Stable across renders. |
| **Empty Admission List** | `query.data = []` or `undefined` | Renders `<Empty title="No admissions found" ... />`. Sorting function is bypassed or operates on `[]` without error. |
| **All Records Same Status** | All records are `CONFIRMED` | Displayed as a single contiguous list ordered newest to oldest by `createdAt`. |

---

## 8. Explicit Non-Goals

The following items are strictly outside the scope of this feature:

1. **No Backend or API Modifications:**
   - No changes to `AdmissionController`, `AdmissionService`, or `AdmissionRepository`.
   - No addition of query parameters (`sort`, `direction`, `page`, `limit`) to `GET /admission`.
2. **No Database Schema or Migration Changes:**
   - No Prisma schema alterations; no new indexes; no migrations.
3. **No Financial or Payment Changes:**
   - No modifications to `FeePaymentHeader`, `FeePayment`, `FeeStructure`, or concession calculations.
4. **No New Admission Statuses:**
   - No additions to the `AdmissionStatus` enum (`DRAFT`, `CONFIRMED`, `CANCELLED` remain exclusive).
5. **No Interactive Column Sorting:**
   - No clickable table headers for student name, admission number, or placement.
6. **No Secondary Product Sorting Dimensions:**
   - `admissionSequence` and `admissionNumber` are not used as sorting criteria.
7. **No Pagination or Redesign:**
   - Pagination, table structure changes, and visual redesign remain out of scope.

---

## 9. Acceptance Criteria (Verifiable Statements)

- [ ] **AC-1:** On initial load with filter set to `"All"`, all displayed admissions are ordered strictly by status priority: Confirmed (`CONFIRMED`) first, Pending (`DRAFT`) second, and Cancelled (`CANCELLED`) third.
- [ ] **AC-2:** Within the Confirmed group, admissions with valid timestamps are ordered chronologically from newest to oldest based on `createdAt`.
- [ ] **AC-3:** Within the Pending group, admissions with valid timestamps are ordered chronologically from newest to oldest based on `createdAt`.
- [ ] **AC-4:** Within the Cancelled group, admissions with valid timestamps are ordered chronologically from newest to oldest based on `createdAt`.
- [ ] **AC-5:** Within any status group, admissions with valid timestamps always precede admissions with invalid or missing timestamps.
- [ ] **AC-6:** Admissions with missing (`undefined`/`null`) or malformed timestamps do not cause runtime errors and are ordered deterministically among themselves using their `id`.
- [ ] **AC-7:** A Confirmed admission with a missing or invalid timestamp still appears before any Pending or Cancelled admission.
- [ ] **AC-8:** When two admissions have the same status and identical valid `createdAt` values, their relative ordering is resolved deterministically by `id`.
- [ ] **AC-9:** When a status filter (`"Confirmed"`, `"Pending"`, or `"Cancelled"`) is applied, the filtered subset remains ordered from newest to oldest by `createdAt`.
- [ ] **AC-10:** When search text is entered, the filtered search results maintain status-priority grouping and newest-first chronological ordering.
- [ ] **AC-11:** The original React Query cache array (`query.data`) is not mutated by the sorting operation.
- [ ] **AC-12:** Admissions with unrecognized status values are sorted below Cancelled admissions without throwing runtime errors.
- [ ] **AC-13:** When zero admissions match the search/filter criteria, the existing empty state (`"No admissions found"`) renders properly without errors.
- [ ] **AC-14:** Navigation links (`/admissions/${item.id}`) and action buttons (Edit, Cancel) on table rows remain fully functional and retain their permissions gating.

---

## 10. Test Scenarios

### 10.1 Pure Comparator Unit Tests (`src/lib/__tests__/admissions-api.test.tsx`)
1. **Status Priority Ordering:**
   - Input: Array with mixed statuses in random order: `[{status: 'CANCELLED'}, {status: 'CONFIRMED'}, {status: 'DRAFT'}]`.
   - Expected Output: `[CONFIRMED, DRAFT, CANCELLED]`.
2. **Newest-First Chronological Ordering:**
   - Input: Three `DRAFT` admissions with valid timestamps:
     - $A$: `"2026-11-10T10:00:00.000Z"`
     - $B$: `"2026-11-18T10:00:00.000Z"`
     - $C$: `"2026-11-14T10:00:00.000Z"`
   - Expected Output: `[B, C, A]`.
3. **Valid Precedes Invalid/Missing Timestamps:**
   - Input: Three `CONFIRMED` admissions:
     - $A$: `createdAt: undefined`
     - $B$: `createdAt: "2026-11-18T10:00:00.000Z"`
     - $C$: `createdAt: "not-a-valid-date"`
   - Expected Output: $B$ (valid) appears first; $A$ and $C$ appear after $B$, ordered deterministically by `id`.
4. **Status Dominates Over Date Validity:**
   - Input: Record $A$ (`CONFIRMED`, `createdAt: null`), Record $B$ (`DRAFT`, `createdAt: "2026-11-18T10:00:00.000Z"`).
   - Expected Output: Record $A$ precedes Record $B$.
5. **Equal Timestamp Deterministic Tie-Breaking:**
   - Input: Two `CONFIRMED` admissions with identical `createdAt: "2026-11-18T12:00:00.000Z"`, with `id: "adm-a"` and `id: "adm-b"`.
   - Expected Output: `adm-a` precedes `adm-b` deterministically via `id` comparison.
6. **Unknown Status Handling:**
   - Input: Admissions with statuses `CONFIRMED`, `DRAFT`, `CANCELLED`, and `"UNKNOWN_STATUS"`.
   - Expected Output: `CONFIRMED` $\rightarrow$ `DRAFT` $\rightarrow$ `CANCELLED` $\rightarrow$ `"UNKNOWN_STATUS"`.

### 10.2 Component & Integration Tests (`src/pages/__tests__/admission-fee-preview.test.tsx`)
1. **Default Render Order Verification:**
   - Mock `useAdmissions()` returning admissions in arbitrary order.
   - Render `<AdmissionList session={session} />`.
   - Assert table rows match the expected `[Confirmed (new), Confirmed (old), Draft (new), Cancelled]` sequence.
2. **Search Interaction:**
   - Type query in search box.
   - Assert matching filtered rows retain status priority and chronological sort order.
3. **Filter Interaction:**
   - Select `"Pending"` from status dropdown.
   - Assert only `DRAFT` records appear, ordered strictly from newest to oldest.
4. **Empty State Integrity:**
   - Mock `useAdmissions()` returning `[]`.
   - Assert `"No admissions found"` renders without throwing.

---

## 11. Files and Components Expected to Change (Provisional)

> [!NOTE]
> The following file modifications are provisional and represent the minimal future implementation footprint. No source files have been modified as part of this specification task.

1. **Utility & DTO Exports:**
   - `ryo-academy-fe/src/lib/admissions-api.ts`
     - Export `ADMISSION_STATUS_RANK` mapping constant.
     - Export `parseDateTimestamp(value?: string | null): number | null` safe timestamp helper.
     - Export `compareAdmissions(a: AdmissionResponse, b: AdmissionResponse): number` comparator utility.
2. **Dashboard Component:**
   - `ryo-academy-fe/src/pages/admissions-students-pages.tsx`
     - In `AdmissionList`: Apply `sort(compareAdmissions)` to the filtered rows array before rendering:
       ```typescript
       const rows = (query.data || [])
         .filter((item) => { ... })
         .sort(compareAdmissions);
       ```
3. **Automated Unit & Component Tests:**
   - `ryo-academy-fe/src/lib/__tests__/admissions-api.test.tsx`
     - Add test suite covering `compareAdmissions` (status ranking, date ordering, valid precedes invalid, tie-breaking by `id`, unknown statuses).
   - `ryo-academy-fe/src/pages/__tests__/admission-fee-preview.test.tsx`
     - Add component test cases asserting rendered table row sequence in `AdmissionList`.

---

## 12. Risks, Assumptions, and Unresolved Questions

### 12.1 Assumptions
1. `AdmissionResponse.createdAt` is populated as an ISO 8601 string by the NestJS backend and serialized accurately by the browser runtime.
2. The maximum number of admissions returned by `GET /admission` fits comfortably in client memory without requiring virtualized windowing or server-side pagination.
3. Client-side sorting has zero impact on financial transactions, fee snapshots, payment collection, or database records.

### 12.2 Risks & Mitigation
- **Risk:** Timezone offset discrepancies between server and client could misorder records created within milliseconds.
  - *Mitigation:* `Date.parse()` or `new Date(...).getTime()` converts all valid ISO 8601 strings to UTC millisecond epoch timestamps, ensuring absolute chronological comparability regardless of local browser timezone.
- **Risk:** Missing `createdAt` in older test fixtures or legacy records could cause sorting instability.
  - *Mitigation:* Safe timestamp helper treats invalid/missing dates consistently as `null`, ensuring valid dates always precede them, and uses unique `id` as the deterministic fallback.

### 12.3 Unresolved Questions
- **None.** All product requirements and engineering robustness specifications have been finalized.
