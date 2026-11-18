# Admission Fee Selection and Snapshot Lifecycle — M2.2 Design

## 1. Executive Summary

Current admission creation resolves an active master by academic year, program, and class, then snapshots every active component. The UI submits an empty fee header object; it offers no component selection. Master total initializes the fee header even though detail rows are built from component amounts.

Recommended V0 design: keep automatic resolution of the unique applicable master from admission dimensions; do not trust a client-provided master ID. Return the active master/components as a preview, default all active components selected in the UI, and submit only selected component IDs with the admission. In the create transaction, re-resolve the master and source components, validate the IDs and mandatory rules, then create the admission, one header linked to the master, and an independent detail snapshot for every source component. Store an `isIncluded` state on each snapshot detail so draft deselection/re-addition changes inclusion without deleting the snapshot or duplicating a row. Calculate header gross from included detail original amounts, never from master total.

Source component IDs and master ID provide traceability; copied name, original amount, policy flags and financial values remain the admission snapshot. Master edits/deactivation must not rewrite existing snapshots. DRAFT selection edits update `isIncluded` only and recompute gross transactionally. Confirmation validates a nonempty, valid selection and freezes ordinary fee edits. Discount-specific behavior remains M2.3.

No business decision needs to be reopened under the approved M2.1 baseline. One technical detail for M2.3 is whether a deselected component's draft concession remains attached while excluded and is restored on re-add; this design keeps snapshot/concession rows and requires excluded rows be ignored in financial totals until the discount design defines that behavior.

## 2. Scope and Approved Requirements

This is design only for applicable master resolution, component selection, admission fee snapshots, lifecycle boundaries, related contracts, and existing-data compatibility. It uses M2.1 decisions: Program and Shift are the same concept; no `shiftId`; uniqueness remains `(academicYearId, programId, classId)`; master total is Decimal-derived; public component policy field is `isDiscountApplicable`; financial values use decimal strings; exact component uniqueness remains; existing snapshots are independent of future master changes.

Approved behavior: admission requires fee configuration; all active components initially selected; mandatory components locked; optional components deselectable/re-addable; deselection never deletes master data; snapshot is independent; configuration complete before confirmation; confirmed obligations immutable through ordinary editing.

Out of scope: redesigning discounts, academic-year-start restrictions, payment/schedules, cancellation implementation, or migrations execution.

## 3. Existing Architecture and Evidence

Repository-root-relative source evidence:

- `ryo-academy-be/src/admission/admission-fee-log/admission.controller.ts:49–79,90–100`: admission create `POST /admission` (`ADMISSION_CREATE`), update `PATCH /admission/:id` (`ADMISSION_UPDATE`), confirmation `POST /admission/:id/confirmed` (`ADMISSION_UPDATE`); JWT and permission guards are controller-level.
- `ryo-academy-be/src/admission/admission-fee-log/dto/create-admission.dto.ts:224–427`: create DTO has academicYear/program/class and generic optional `feePaymentHeaders`; current nested fee DTO exposes client-controlled totals and detail fields.
- `ryo-academy-be/src/admission/admission-fee-log/admission.repository.ts:12–27`: active master lookup by year/program/class, then all active components ordered by name; no client master ID or selection filtering.
- `ryo-academy-be/src/admission/admission-fee-log/admission.service.ts:66–154`: validates section; resolves master before transaction; requires an active master with at least one active component; transaction creates admission, header seeded with master total, and detail rows for every active component. Details copy component ID, name, original amount, discount flag, mandatory flag, and initialize discount/final/payable/paid fields.
- `ryo-academy-be/src/admission/admission-fee-log/admission.service.ts:156–239`: update supports admission fields and generic fee header DTO; confirmed fee-header update is blocked, but draft fee updates are delegated to repository.
- `ryo-academy-be/src/admission/admission-fee-log/admission.repository.ts:123–190`: update helper can update/create header/detail values from DTO; it accepts client-provided financial fields and does not implement selected-component validation as designed here.
- `ryo-academy-be/src/admission/admission-fee-log/admission.service.ts:267–403`: confirmation is DRAFT-only; processes active header/details, recalculates current concession obligations, updates header, confirms schedules, then confirms admission and creates student in a transaction.
- `ryo-academy-be/prisma/models/admission_fees/fee-payment-header.prisma:1–30`: header links admission, academic year, and source fee structure; tracks financial totals and has a uniqueness constraint per academic year/admission/master.
- `ryo-academy-be/prisma/models/admission_fees/fee-payment-detials.prisma:1–25`: detail links source component; stores name/amount/policy snapshots and payment/discount fields; unique `(feePaymentHeaderId, feeComponentId)` prevents duplicate detail rows per source component/header. It has `isActive`, but no separate selected/included field.
- `ryo-academy-be/prisma/models/admission_fees/fee-structure.prisma:1–23` and `fee-component.prisma:1–20`: master/component source data and exact uniqueness constraints.
- `ryo-academy-be/src/admission/fee-concession/admission-concession.service.ts:99–145,221–250`: concession reads active detail rows and recalculates header from active details; it will need to respect `isIncluded` once introduced.
- `ryo-academy-fe/src/pages/admissions-students-pages.tsx:624–643,763–810`: create payload attaches empty fee details/zero totals; form has no fee selection surface.
- `ryo-academy-fe/src/lib/admissions-api.ts:38–87`: fee payload is `Record<string, unknown>` rather than a typed selection contract.

These are source observations; HTTP, database, transaction rollback, and test behavior were not executed.

## 4. Applicable Fee Structure Master Resolution

**Recommendation:** backend automatically resolves the unique active master using the admission's `academicYearId`, `programId`, and `classId`. The matching unique constraint is established by the approved M2.1 baseline. The browser does not submit a trusted `feeStructureId`; the backend derives it. The response includes the resolved master ID so the client can show context and the server persists it on `FeePaymentHeader.feeStructureId`.

Validation must check all dimensions against the newly created/admission record, master active state, and that active source components exist. If no active match exists, return a conflict/validation error and do not create the admission. If more than one match is somehow observed despite the unique constraint, fail closed with a data-integrity conflict; do not choose an arbitrary row. Inactive master is not applicable for a new admission. Existing snapshots remain readable even if their source master is later inactive.

For frontend preview, propose a read endpoint using the chosen academic year/program/class. The server filters active master and components. On submit, it repeats the lookup and validation inside the create transaction to avoid relying on stale client data. Preview selection state is advisory; server data at submit is authoritative.

Trade-off: this preserves one source of applicability and avoids arbitrary IDs. The UI cannot choose a different master for the same tuple; current schema disallows that alternative. The unique-key assumption comes from approved M2.1.

## 5. Component Selection and Validation

### Selection model

Compare the options:

1. **Persist selected only:** simple create state, but loses admission-time snapshot of deselected options and makes re-add depend on a mutable/deactivated master.
2. **Persist all with inclusion status:** preserves the full admission-time source snapshot, supports toggling without duplicate rows, and provides both original selection context and final selected obligations.
3. Separate assignment entity: adds another lifecycle layer without a demonstrated V0 need.

**Recommend option 2:** add `isIncluded Boolean @default(true)` to fee detail as an admission snapshot property, distinct from `isActive` (record soft deletion/lifecycle). At admission creation, create a snapshot row for every active master component; set included according to client selection. The client can select/deselect optional IDs; all active source rows are still snapshotted for faithful history and safe re-addition. Existing detail unique key prevents duplicates. Re-adding an optional component toggles the same DRAFT row back to included; it does not create a second row. Deselecting does not mutate the source component.

### Request semantics

Create and update payloads submit `selectedFeeComponentIds: string[]` (or equivalent inclusion booleans keyed by ID). A single selected-ID array is the smallest representation. Backend derives all values. Empty selection is rejected. IDs must be unique and each must identify an active component belonging to the resolved master. Every mandatory component must be present. Components omitted from selected IDs are included=false only if optional. On create, unknown, inactive, cross-master, or duplicated IDs are rejected. On DRAFT update, selected IDs must match retained snapshot rows for this header; a source component deactivated after admission creation may be re-included from its preserved snapshot. Amount/name/policy values in a body are rejected or ignored by a strict DTO policy; never used as authoritative values.

### Validation placement

- DTO: array shape, string IDs, nonempty array; reject additional financial snapshot fields when whitelist/forbid policy is available.
- Service: re-fetch master/components, enforce ownership/active state, at least one selection, mandatory inclusion, duplicate IDs, admission status, and transaction-time consistency.
- Database: retain foreign keys and `(headerId, componentId)` unique constraint; add included boolean. Database cannot alone establish source master membership or mandatory selection.

## 6. Admission Fee Snapshot Model

### Existing fields and proposed interpretation

Header already stores `feeStructureId` as source-master reference plus `admissionId` and financial totals. Keep it as the master traceability key. Detail already stores `feeComponentId` as source reference and snapshot `nameSnapshot`, `originalAmount`, `discountApplicable`, `isMandatory`, `discountAmount`, `finalAmount`, `totalAmountToBePaid`, `amountPaid`, and `paymentDate`.

Add `isIncluded` (public response name may be `included`) to distinguish admission-level selection from `isActive`. The detail row is the immutable-at-source snapshot; source references do not mean the row should be recomputed from current master data.

| Value | At create | DRAFT change | At confirmation |
|---|---|---|---|
| Header source master ID | Copy resolved master ID | Immutable for this admission | Frozen |
| Detail source component ID | Copy component ID for all active components | Immutable | Frozen |
| Name, original amount, discount applicability, mandatory flag | Copy current source values | Do not refresh from master; only included state changes | Frozen |
| Included state | Set from initial selected IDs | Optional only may toggle; mandatory remains true | Frozen |
| Discount amount/final/payable | Initialize to zero discount and original payable; M2.3 owns exact representation | M2.3 owns recalculation; selection change must exclude not-included row | Finalize under M2.3 rules |
| Amount paid | Initialize zero | Must remain zero for ordinary DRAFT selection changes; reject if payment exists | Financially tracked, not rewritten |
| Outstanding | Derive from payable minus paid; currently no dedicated detail field, summary is computed | Recompute according to M2.3/M2.4 | Preserve financial lifecycle |

### Source changes and deactivation

Later changes or deactivation to master/component must not rewrite this snapshot. A component deactivated after admission creation remains in the admission's snapshot; its current inclusion state and copied data govern that admission. New admissions exclude inactive source components. A previously deselected component can be re-added from its retained snapshot while admission is DRAFT, even if the source has since become inactive; that restores the originally applicable terms and does not revive the master record.

Do not permit changing the source master or source component reference through ordinary DRAFT selection updates. Exceptional correction is out of scope.

### Concessions and duplicate protection

Toggle the existing detail's `isIncluded`; never delete/reinsert. Preserve an attached draft concession record when toggling so no source snapshot/history row is destroyed. M2.3 must define whether a concession on an excluded row is retained for re-addition, and must ensure excluded rows are omitted from all financial totals and confirmation calculations. If that cannot be guaranteed, selection update should reject deselection until the concession is removed through its supported workflow. This is a design dependency, not a discount redesign.

## 7. Admission Lifecycle Integration

### Create

Add selection IDs to the existing admission create request. Resolve applicable master and components, validate selection, create admission, header, and all snapshot details in one transaction. Compute gross from included detail `originalAmount` values with Decimal. If no master, empty selection, missing mandatory component, invalid source component, duplicate ID, or any write failure occurs, roll back admission/header/details together. This is a proposed stronger transaction boundary; current lookup happens before current transaction and currently assigns all components.

### Draft editing

Use a dedicated fee-configuration update contract, only for DRAFT admissions. In a transaction: lock/re-read admission; reject non-DRAFT or any recorded payment; load header/details; validate selected IDs against retained snapshot rows and mandatory flags; toggle `isIncluded`; recompute header gross from included rows; retain unselected rows and IDs. Do not run ordinary admission metadata update logic for financial fields. Source master/components are unchanged.

### Confirmation

Existing confirmation is DRAFT-only and transactional. Add a validation step before concession/schedule finalization: exactly one expected active admission header for this workflow; at least one included row; every mandatory snapshot row included; every included row valid; included totals reconcile. Confirmed fee edits are prohibited. Payment/schedule records are not rewritten by selection updates; any existing payment blocks selection mutation.

### Cancelled

Use approved M1 cancellation rules; no cancellation implementation change is designed here.

## 8. Proposed Backend API Contracts

All routes below are **proposed**, not existing contracts. Permission names follow existing patterns. Monetary values are decimal strings.

### 8.1 Applicable master preview

`GET /admission/fee-configuration/applicable?academicYearId=...&programId=...&classId=...`

Permission: `ADMISSION_CREATE` (JWT + permissions guard), because this preview supports the create workflow and should not rely on broad fee read permission.

Response:

```json
{
  "feeStructure": {
    "id": "master-1",
    "name": "Standard Fees",
    "totalAmount": "52500.00"
  },
  "components": [
    {"id":"tuition-1","name":"Tuition","originalAmount":"50000.00","isDiscountApplicable":true,"isMandatory":true,"description":null,"initiallySelected":true,"locked":true},
    {"id":"library-1","name":"Library","originalAmount":"2500.00","isDiscountApplicable":false,"isMandatory":false,"description":null,"initiallySelected":true,"locked":false}
  ]
}
```

Errors: 400 invalid or inconsistent dimensions; 404/409 no active matching master or no active components. Service responsibility: exact unique lookup; active filtering; return source facts only. Read-only; no transaction required, but create revalidates.

### 8.2 Create admission with selection

`POST /admission`, existing route; proposed request extends `CreateAdmissionDto`. Permission remains `ADMISSION_CREATE`.

```json
{
  "academicYearId":"year-1","programId":"program-1","classId":"class-1","sectionId":"section-1",
  "studentName":"A Student","gender":"FEMALE","dateOfBirth":"2015-04-20",
  "parentName":"Parent","parentRelation":"FATHER","parentPhone":"0000000000",
  "parentAlternatePhone":"","parentEmail":"parent@example.test","addressLine1":"Address",
  "addressLine2":"","city":"City","state":"State","country":"India","postalCode":"000000",
  "selectedFeeComponentIds":["tuition-1","library-1"]
}
```

No master ID, component names/amounts/flags, header totals, or detail values are trusted from client. Backend resolves and validates master; transaction includes admission/header/details and returns saved admission with snapshot.

Response excerpt:

```json
{
  "id":"admission-1","admissionStatus":"DRAFT",
  "feeConfiguration":{
    "feePaymentHeaderId":"header-1","feeStructureId":"master-1",
    "grossAmount":"52500.00","components":[
      {"feePaymentDetailsId":"detail-1","feeComponentId":"tuition-1","nameSnapshot":"Tuition","originalAmount":"50000.00","isDiscountApplicable":true,"isMandatory":true,"included":true,"discountAmount":"0.00","payableAmount":"50000.00","amountPaid":"0.00"},
      {"feePaymentDetailsId":"detail-2","feeComponentId":"library-1","nameSnapshot":"Library","originalAmount":"2500.00","isDiscountApplicable":false,"isMandatory":false,"included":true,"discountAmount":"0.00","payableAmount":"2500.00","amountPaid":"0.00"}
    ]
  }
}
```

Errors: 400 invalid IDs/selection/section; 404 missing master/source; 409 uniqueness or inconsistent matching state. One DB transaction covers admission, header, snapshot, and response read.

### 8.3 Update DRAFT selection

`PATCH /admission/:id/fee-configuration` (proposed subresource); permission `ADMISSION_UPDATE`.

```json
{"selectedFeeComponentIds":["tuition-1"]}
```

Returns the full updated fee snapshot and gross. Errors: 404 admission/snapshot; 409 non-DRAFT or payment exists; 400 empty list, duplicate/foreign/inactive ID, or omitted mandatory ID. Service transaction locks/rechecks admission and updates included flags/totals atomically. No new detail rows are created for re-add.

### 8.4 Retrieve admission snapshot

`GET /admission/:id/fee-configuration` (proposed); permission `ADMISSION_READ`.

Returns source master ID, header gross and all snapshot rows (included and excluded), monetary values as decimal strings, and status. It reads persisted snapshot, never current master data. No write transaction required; use a consistent read if supported by surrounding repository pattern.

### 8.5 Confirm admission

Existing `POST /admission/:id/confirmed`, permission `ADMISSION_UPDATE`; no request body. Extend service checks as in Section 7. Response should include admission and finalized fee snapshot, or document that caller separately retrieves snapshot. Errors: 409 wrong status; 400 incomplete/invalid selection or inconsistent totals; transaction includes fee validation/finalization, schedule integration, admission status, and student creation.

## 9. Proposed Frontend Workflow

1. User selects academic year, program, class, and section as today.
2. Once year/program/class are valid, query applicable master preview. Cancel/ignore stale responses when dimensions change; clear prior selection immediately.
3. Show loading state; block submit until matching master and component list are resolved.
4. On success, initialize all returned active components selected. Mandatory rows are checked and disabled; optional rows are toggleable. Display selected original-amount total.
5. If no matching active master/components, show a clear blocking state with retry/navigation guidance; do not allow admission submission.
6. If request errors, preserve non-fee form fields but clear fee selection tied to stale dimensions; show backend error and retry.
7. On submit, send selected IDs with admission fields. Backend revalidates; render field/component errors and retain current form state on validation failure.
8. On success, use server-returned snapshot and total; do not recompute authoritative amounts in frontend.
9. DRAFT edit loads persisted snapshot, not current master. Toggle optional rows and PATCH selected IDs. Confirmation view shows included rows and finalized amounts; remove ordinary fee selection controls after confirmation.

No UI mockup or frontend change is included.

## 10. Financial Total Consistency

This design covers pre-discount original amounts:

- `Master.totalAmount = sum(all active master component amounts)` per M2.1.
- `Admission header grossAmount = sum(originalAmount for included admission snapshot rows)`.
- Each snapshot `originalAmount` is copied from source component at admission creation.
- `grossAmount` may be lower than master total when optional components are deselected.
- Header total must never be initialized from master total when selected components differ.
- Deselect/re-add recomputes gross from snapshot rows using Decimal; no source master recalculation.

M2.3 defines discounts, payable/net, and excluded-row concession interaction. M2.4 defines cross-module total invariants. M2.6 defines schedules/payments and effects of fee changes. None is solved here.

## 11. Existing-Data Compatibility

Risks and safe handling:

- **All-active auto-assignment:** Existing records represent currently assigned active details; do not infer that optional components were explicitly selected. For migration, default existing `isIncluded=true` to preserve the existing payable obligations, then reconcile exceptions explicitly.
- **Header/detail mismatch:** Do not bulk overwrite. Inventory header totals against active detail sums and payment/schedule records; preserve confirmed financial history. Any repair is separate approved migration work.
- **Inactive source components:** Keep admission snapshot usable regardless source active state. Do not delete or refresh snapshot from source.
- **Snapshot differs from current master:** Expected historical independence; preserve snapshot values.
- **Draft concessions:** Keep existing concession association during selection rollout; migration should not recalculate it. M2.3 must define excluded-row treatment before enabling selection changes on rows with concessions.
- **Confirmed admissions with payments/schedules:** Do not alter included status or financial rows; no backfill that changes obligation values.
- **No explicit selection status:** Additive `isIncluded` migration should default existing rows to true. This preserves existing behavior but cannot recover prior user intent for formerly optional rows.
- **Re-added row:** Existing unique `(feePaymentHeaderId, feeComponentId)` supports one row; toggle included state rather than create a new row.

No database inventory was run; counts and edge-case prevalence are unknown. No historical snapshots or financial records should be rewritten as part of ordinary deployment.

## 12. Design Decisions and Approval Required

| Topic | Existing behavior | Proposed design | Reason | Status |
|---|---|---|---|---|
| Applicable master | Auto lookup by year/program/class; unique key | Keep backend auto-resolution; no client master ID | Unique approved matching key; avoids arbitrary parent | Recommended — ready for review |
| Initial selection | All active master components assigned | Default all selected; client submits selected IDs; backend revalidates | Meets approved optional/mandatory workflow | Recommended — ready for review |
| Snapshot row strategy | Only component rows, no inclusion field | Snapshot all active components with `isIncluded`; toggle state | Preserves deselected options and enables safe re-add | Recommended — ready for review |
| Mandatory validation | Flag copied; no selection check | Require every mandatory ID in request and lock in UI | Enforce at trust boundary and service | Recommended — ready for review |
| Deselect/re-add | No selection workflow | Toggle same unique detail row; never delete or duplicate | Preserves snapshot and honors unique key | Recommended — ready for review |
| Source edits/deactivation | Snapshots have copied values | Keep snapshot unchanged; source active status only affects new admissions | Historical independence | Existing constraint — retain |
| Header gross | Starts from master total | Decimal sum of included snapshot original amounts | Correct when optional items omitted | Recommended — ready for review |
| Draft selection with concession | Concession attached to detail; calculations currently read active details | Keep association; M2.3 must exclude nonincluded rows and define re-add behavior | Avoid deleting draft financial record; prevent wrong totals | Requires M2.3 design |
| Update endpoint shape | Generic PATCH admission body supports fee header DTO | Add typed fee-configuration subresource | Separates admission metadata from financial selection | Recommended — ready for review |
| Legacy inclusion backfill | No inclusion field; all active components were assigned | Default existing rows included=true; no amount rewrites | Preserves current obligation interpretation | Recommended — migration approval required |

No new business requirement requires approval. The technical route shape and inclusion column are recommendations for review; they do not contradict the approved workflow.

## 13. Dependencies on M2.3–M2.7

- **M2.3 Discounts:** ensure excluded rows do not participate in concession totals/confirmation; decide whether a concession remains attached and returns on re-add. Preserve decimal-string API convention.
- **M2.4 Financial totals:** define header/detail equations, treatment of included rows, and consistency rules across confirmation/payment summary.
- **M2.5 Academic-year restrictions:** selection update must not bypass add-only/freeze constraints; exact scope is separate.
- **M2.6 Payments/installments:** block edits after any payment; define whether draft schedules exist and how inclusion changes reconcile or invalidate them.
- **M2.7 API integration/verification:** finalize route names, error DTOs, generated types, permissions, cache invalidation and approved disposable QA fixtures.

## 14. Risks and Open Questions

1. Draft concessions on deselected rows need M2.3 treatment before enabling those toggles in production.
2. Draft installment schedules, if allowed before confirmation in the deployed configuration, need an explicit update/reconciliation rule in M2.6.
3. Existing data may contain headers/details inconsistent with current source master; inventory is required before any backfill or cleanup.
4. Frontend preview is stale-able; backend must always repeat all master/component validation in the create/update transaction.
5. Fee detail `isActive` must not be overloaded for optional selection; use a distinct inclusion field to preserve lifecycle semantics.
6. Controller validation-pipe behavior, transaction rollback, and permissions are source-derived only; runtime remains unverified.

No unresolved business decision is identified under the supplied approved decisions. The listed items are cross-subtask technical dependencies.

## 15. Explicit Out-of-Scope Items

- Discount formulas, payable input, discount approval/category behavior (M2.3).
- Broader financial reconciliation and payment totals (M2.4).
- Academic-year-start add-only rules (M2.5).
- Schedule/payment/reversal behavior and detailed integration (M2.6).
- Full frontend implementation, migrations, tests, builds, server/HTTP/browser QA, or database access.
- Cancellation implementation, Shift model changes, master/component redesign, unrelated modules.

## M2.2 Review Addendum — Inclusion Propagation and Compatibility

This addendum reconciles the proposed `isIncluded` snapshot field with all current source consumers of fee detail rows. `isIncluded` is proposed only; no current consumer or persisted schema field implements it. Existing filters by `isActive` do not satisfy the inclusion rule by themselves.

### 1. Consumer inventory

| Consumer | Current filtering/aggregation | Required inclusion behavior | Owning milestone |
|---|---|---|---|
| Admission create — `AdmissionService.create` and `AdmissionRepository.findFeeStructurebyId` (`ryo-academy-be/src/admission/admission-fee-log/admission.service.ts:82–149`; `admission.repository.ts:12–27`) | Resolves active master and active source components; creates a detail for every active component. Header gross starts at master `totalAmount`. No selection state. | Snapshot all eligible source rows once; set `isIncluded` from validated selected IDs; compute initial header gross from rows where `isActive AND isIncluded`, using snapshot original amounts. | M2.2; header equations M2.4 |
| Generic admission update — `AdmissionService.updateById`, `AdmissionRepository.updateFeePaymentDet` (`admission.service.ts:156–239`; `admission.repository.ts:123–193`) | Accepts generic fee-header/detail DTO values and updates or creates details; does not apply a component-selection policy. | Replace this path for selection changes with typed DRAFT-only selection operation; never accept client-supplied financial snapshot values; update inclusion and header totals transactionally. | M2.2 |
| Confirmation — `AdmissionService.updateStatusById` (`admission.service.ts:285–403`) | Fetches details with `isActive: true`, loops over all returned details for discounts/final values, then sums all active details for gross/discount/net. | All confirmation calculations and validation must use `isActive AND isIncluded`. Excluded rows and their concessions remain stored but cannot affect finalized header totals or confirmation eligibility. | M2.2; discount math M2.3; totals M2.4; schedule gate M2.6 |
| Concession read/summary — `AdmissionConcessionService.getConcessionsForAdmission` (`admission/fee-concession/admission-concession.service.ts:18–80`) | Includes only active headers and active details; totals gross and discounts over every active detail, returns every such detail. No inclusion state. | Current gross/discount/net totals use active+included rows. Historical/UI breakdown may also return excluded rows with `included:false`, clearly separated from current totals. | M2.3/M2.4; frontend contract M2.7 |
| Concession assignment/create — `assignConcession` (`admission-concession.service.ts:95–255`) | Loads active details, targets any active detail ID, creates concession and updates detail, then recomputes header from all active details. | Reject or otherwise disallow applying a new concession to an excluded row. Recompute all concession/header totals only over active+included rows. Existing concession on a row that becomes excluded is preserved but ignored; re-add effect is explicitly M2.3-owned. | M2.3; total propagation M2.4 |
| Concession removal/recalculation — `removeConcession` (`admission-concession.service.ts:268–365`) | Loads all details for header, resets the target, then sums active details; target may be inactive because lookup is by concession ID. | Removal may reset the stored excluded row snapshot, but resulting header sums only active+included rows. Define whether removing a concession from an excluded row is allowed; it must not make that row financially applicable. | M2.3/M2.4 |
| Header gross/discount/net/due recalculation — concession service and confirmation (above) | Existing `findMany` filters use `isActive:true` only; sums use each returned detail. | One shared financial predicate: `isActive AND isIncluded`. Compute gross from original amount; discounts/net/due follow M2.3/M2.4 formulas over that same set. Do not use `isIncluded` to erase history. | M2.3/M2.4 |
| Installment template/manual creation and preview — `AdmissionInstallmentScheduleService` (`ryo-academy-be/src/admission/installment/admission-installment-schedule.service.ts:145–220,270–340,415–466`) | Reads header `netAmount`; schedule amounts must equal that header value. It does not read detail rows directly. | Selection updates must first recompute header values from active+included details. Any existing DRAFT schedule must be reconciled/replaced atomically or block the selection edit; do not leave schedule tied to old header net. | M2.4/M2.6 |
| Installment confirmation/reconciliation — `confirmAdmissionSchedules` (`admission-installment-schedule.service.ts:836–938`) | Confirms schedules against header net, creates default one-installment schedule when absent; rejects net ≤0. No detail filtering. | Validate the header was computed from active+included details before schedule confirmation. Excluded rows never become schedule obligations. Zero-net policy remains separately approved and is not changed here. | M2.4/M2.6 |
| Payment collection — `StudentService.recordStudentFeePayment` (`ryo-academy-be/src/student/student.service.ts:268–356,384–420`) | Selects active header; checks header fee/paid/due; loads all details ordered by creation and attributes payment FIFO across detail payable-minus-paid values without active/inclusion filtering. Installment allocator uses header totals. | Only active+included detail balances receive component attribution. Header due and schedules must already exclude nonincluded rows. Reject inconsistent state if payment/allocation exists on a deselected detail; selection edits after payments must be blocked. | M2.4/M2.6 |
| Payment reversal — `PaymentReversalService` (`ryo-academy-be/src/student/payment-reversal.service.ts:229–290,496–628`) | Loads all header details; reconciles detail paid sum to header paid; reverse-FIFO decrements component counters; verifies all detail balances, including rows regardless of active state. | Reversal must restore the exact original payment/component allocations and preserve audit history. It is a historical correction, not a new obligation calculation; do not skip allocation lineage solely because a row is now excluded. Enforce that confirmed/paid rows cannot be toggled out of inclusion, and treat any legacy excluded-but-paid state as an integrity exception. Reconciliation must distinguish current obligations (active+included) from historical paid/allocation totals. | M2.4/M2.6 |
| Student fee summary — `StudentService.getStudentFees` (`student.service.ts:62–142`) | Reads latest header with all details; maps every detail and computes outstanding from payable minus paid. It does not filter inactive details or mark inclusion. Header summary uses stored header values. | Current component totals/outstanding include only active+included rows. For history, optionally return excluded/inactive rows separately with state flags and their payment history; they must not inflate current total/outstanding. | M2.4/M2.7 |
| Fee master/component deactivation guards — `FeeStructureService.delete` (`ryo-academy-be/src/admission/fee-structure/fee-structure.service.ts:113–119`) and `FeeComponentService.delete` (`fee-component.service.ts:86–113`) | Check for any header/detail reference, not just active or included rows, before source soft deletion. | Keep reference guards independent of inclusion: excluded snapshots still reference the source and remain historical. Do not weaken these guards based on `isIncluded`. | M2.2/M2.5 |
| Other direct detail consumers | Search of `ryo-academy-be/src` found the above admission, concession, student payment/summary/reversal and source-deletion paths; installment calculations use header totals rather than detail rows directly. Seed/test files also construct details but are not production calculation consumers. | Audit any future detail `findMany`/aggregate added for inclusion predicate; historical diagnostics may read all rows but must label whether totals are obligation or history totals. | M2.4/M2.6/M2.7 |

### 2. Global inclusion invariant

**Design invariant:** a fee detail participates in current admission financial obligations only when it is both active and included.

```text
financially applicable = isActive AND isIncluded
```

This predicate must be applied consistently to gross, discount, payable/net, due/outstanding, installment obligation, payment component attribution, and current-obligation displays. An `isActive:true` query alone is insufficient once `isIncluded` exists.

Keep these concepts distinct:

- **Snapshot existence:** the copied admission-time row and its source references/values remain available for traceability and history.
- **Record lifecycle:** `isActive` continues to mean the detail record has not been soft-deactivated.
- **Admission selection:** `isIncluded` means the snapshot is currently part of the admission's selected obligation.

Deselecting changes only `isIncluded`; it does not delete the row, set `isActive=false`, or mutate the source master/component. Historical reports may show inactive or excluded rows, concessions, and payments with explicit state labels, but current obligation totals must exclude them. Reversal and audit reports are historical record operations: they use actual payment/reversal allocation lineage and must reconcile history even if the referenced snapshot is excluded; they must not treat that historical inclusion as a new payable obligation.

### 3. Draft concession behavior

When an optional component is deselected during DRAFT:

- Exclude its detail from current gross, discount, payable, due, schedule, and allocation calculations.
- Preserve its detail snapshot and existing concession record; do not delete either as a side effect of deselection.
- Re-adding toggles the same snapshot row to included. It uses the original copied name, amount, flags, and source IDs; it does not refresh from the master.
- Confirmation must skip excluded rows entirely for concession application, discount recomputation, and header totals. A concession attached to an excluded row cannot reduce another included row or the header.
- **M2.3 must decide** whether the preserved concession becomes effective again on re-add using its prior parameters or must be reviewed/recalculated. This addendum defines no formula or discount policy.

New concession assignment to an already excluded row should be rejected. Removing a preserved concession while excluded may update that row's stored draft snapshot but cannot include it in totals.

### 4. API missing-selection behavior and rollout

For the proposed `selectedFeeComponentIds` field on create and DRAFT selection update:

| Input | Required behavior |
|---|---|
| Missing | Reject with 400 validation error. Never default to all active components. |
| `null` | Reject with 400; null is not an empty selection nor a request to use defaults. |
| Empty array | Reject with 400: at least one component must be selected. |
| Duplicate IDs | Reject with 400 before writes. |
| Unknown ID | Reject with 400/404 validation response; create no admission/update nothing. |
| ID from another master | Reject with 400; validate ownership against backend-resolved master/header snapshot. |
| Omits a mandatory component | Reject with 400 and identify missing mandatory selection without exposing unrelated records. |

The service must distinguish create-time IDs (must be active children of the currently resolved master) from DRAFT-edit IDs (must already exist in that admission's original detail snapshot; source may since be inactive). In all cases, values such as amount/name/flags/total remain server-derived.

This is an incompatible create contract change for existing frontend clients that currently send `feePaymentHeaders` with empty details and no selection field (`ryo-academy-fe/src/pages/admissions-students-pages.tsx:624–643`; `src/lib/admissions-api.ts:38–60`). Safe rollout options are a coordinated backend+frontend release that rejects old payloads after deployment, or a separately versioned/new create contract during transition. Do not silently preserve the old “all active selected” fallback on the new contract. If a temporary legacy route is retained, it must be explicitly versioned/deprecated, observable, and time-bounded; it must not masquerade as the new selection workflow. The simplest preferred V0 rollout is coordinated deployment with clear 400 errors for stale clients.

### 5. Snapshot eligibility on DRAFT edits

- Only component IDs captured as rows in the original admission snapshot can be selected again through ordinary DRAFT editing.
- Components added to the master after admission creation are not injected into that admission. Adding one requires a separate explicitly designed correction workflow; it is not part of this selection toggle.
- Source component deactivation after creation does not erase or deactivate the copied admission snapshot.
- Re-adding a deselected row restores its original snapshot values and inclusion state; it never reloads current source values.
- Existing detail uniqueness `(feePaymentHeaderId, feeComponentId)` supports toggling one row rather than creating duplicates.
- Selection editing must not change the source master or component. If the academic-year add-only rule conflicts with editing an existing admission's DRAFT selection, M2.5 must define the boundary and whether the rule freezes master definitions, admission assignments, or both. M2.2 does not override that rule.

### 6. Remaining M2.3–M2.6 dependencies

- **M2.3:** preserve/re-activate/recalculate a stored concession on re-add; block new concessions on excluded rows; ensure confirmation ignores excluded concessions.
- **M2.4:** centralize or consistently apply the active+included predicate for all totals, header invariants, current summaries, and due calculations; keep historical reconciliation separate.
- **M2.5:** determine whether add-only-after-year-start restricts edits to admission selections as well as source master/component definitions.
- **M2.6:** reconcile or block DRAFT selection changes when a schedule exists; ensure payment allocation only targets active+included details; prevent inclusion edits after payments/confirmation; preserve reversal lineage and handle legacy excluded-but-paid inconsistencies.

### 7. Newly discovered source gaps

1. Current concession summary, assignment, removal, and confirmation calculations filter detail rows by `isActive` (or no filter) and aggregate all such rows. They will overstate current obligations if `isIncluded` is added without updating every query and reducer.
2. Payment component attribution loops through every header detail and does not check active state. It must explicitly skip rows that are not active+included; header outstanding alone is not enough to protect component attribution.
3. Student fee summary returns/maps all detail rows and calculates their individual outstanding amounts, including inactive rows; it has no current-versus-historical distinction.
4. Payment reversal reconciliation sums all detail paid counters and rolls them back reverse-FIFO. These are historical reconciliation paths and cannot simply apply the current-obligation predicate; enforce that a paid row could not have been deselected and preserve allocation-based reversal behavior.
5. Installment schedule services do not inspect details directly; they trust header net/due. Inclusion propagation must therefore update header totals before schedule reconciliation and must guard existing DRAFT schedules during selection edits.
6. Existing admission create/update DTO and repository accept generic client fee header/detail values, while frontend currently sends an empty generic header. The selection API rollout must explicitly reject missing selection and remove this generic write path from the new contract; keeping both semantics on the same unversioned route risks silently accepting legacy behavior.

No existing consumer currently honors `isIncluded`; the field and all behaviors above are proposals only.
