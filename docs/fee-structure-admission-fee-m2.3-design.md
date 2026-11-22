# M2.3 — Payable-Based Discounts: Read-Only Audit and Technical Design

## 1. Executive Summary

**Existing source behavior:** the current UI asks for a percentage or fixed discount and previews the result with JavaScript floating-point arithmetic. The API requires a `DiscountType`, `discountValue`, concession category, and detail ID. Backend `DiscountCalculator` uses Prisma Decimal and HALF_UP to round the *discount amount* to two decimals, then stores the resulting discount on both the concession and fee detail. Confirmation recalculates from the stored percentage/fixed value. The detail already has `totalAmountToBePaid` and `finalAmount`, both used as payable-like fields. No discount percentage field exists on the current fee detail/concession model.

**Accepted V0:** user supplies payable `P`; backend uses snapshot original `O`, calculates `D=O-P`, derives `R=ROUND_HALF_UP((D/O)*100,2)`, and allows `0 <= P <= O`. Zero payable is valid. Only included, active, discount-applicable rows can receive a new discount. Excluded row snapshots/concessions remain stored but do not contribute to current financial obligations.

**Proposed design:** replace the existing percentage/fixed write contract on its current unversioned routes (do not run two competing contracts). The client sends only detail ID and decimal-string payable. Backend locks and reloads the DRAFT admission/detail, verifies `isActive AND isIncluded` and snapshotted discount applicability, computes D and R with Decimal, writes payable to `totalAmountToBePaid` (and the compatibility mirror `finalAmount`), writes D to detail and concession, then recomputes header values over only financially applicable details in one transaction. Keep old type/value/category fields nullable for historical compatibility; new payable records do not use those fields. Under the recommended re-add behavior, add `requiresReview` to distinguish a preserved but unreviewed discount from an effective payable-based concession. The derived percentage is computed on read and is not persisted.

**Approval needed:** for the M2.2 re-add ambiguity, recommend alternative C: preserve the prior draft concession as history but mark it ineffective while excluded; re-add at original payable and require explicit review/reapplication before the old discount can apply. This avoids silently restoring a discount. Add a persisted `requiresReview` state to the concession (default false for legacy rows): deselection makes the concession non-effective through `isIncluded=false`; re-add sets `requiresReview=true`; explicit payable reapplication clears it. Confirmation rejects an included eligible row while `requiresReview=true`. This avoids adding a second `isEffective` flag because inclusion already gates current obligations.

## 2. Scope and Fixed Business Decisions

This is a source-only audit and technical design. No implementation, database reads, tests, builds, servers, seeds, fixtures, API calls, or runtime checks were performed.

Fixed V0 rules, not reopened:

- Client enters payable amount, not percent/fixed discount.
- Backend Decimal source of truth: `D=O-P`; `R=ROUND_HALF_UP((D/O)*100,2)`.
- For eligible components, `0 <= P <= O`; zero is valid.
- Non-discountable component requires `P=O`, `D=0`, and `R=0`.
- No category, approval requirement, or additional discount cap/workflow for V0.
- `O` and policy are read from admission snapshot, not current Fee Structure Master.
- Current financial applicability is `isActive AND isIncluded`.
- Confirmation freezes obligations; excluded details/concessions remain stored but do not count.

## 3. Existing Architecture and Source Evidence

All paths are repository-relative; source evidence describes the current workspace, not runtime behavior.

- Fee detail schema: `ryo-academy-be/prisma/models/admission_fees/fee-payment-detials.prisma:1–25`. Fields include `originalAmount`, `discountApplicable`, `isMandatory`, `discountAmount`, `finalAmount`, `totalAmountToBePaid`, `amountPaid`, `isActive`; no `isIncluded` or discount percentage field is present yet.
- Header schema: `ryo-academy-be/prisma/models/admission_fees/fee-payment-header.prisma:1–30`; stores gross, discount, net, paid, due, total fee and links source master.
- Concession schema: `ryo-academy-be/prisma/models/admission_fees/admission-fee-concession.prisma:1–23`; stores required `discountType`, `discountValue`, `calculatedDiscountAmount`, required category relation, actor, justification, timestamps; one concession per detail via unique `feePaymentDetailsId`.
- SQL precision: `ryo-academy-be/prisma/migrations/20260823112133_admission_fee_mgmt/migration.sql:64–95` creates fee detail/header monetary columns as `DECIMAL(65,30)`. `ryo-academy-be/prisma/migrations/20261103164831_add_fee_concessions_v1/migration.sql:5–18` uses `DECIMAL(65,30)` for discount value and calculated amount. Prisma schema does not declare narrower native precision.
- Current API DTO: `ryo-academy-be/src/admission/fee-concession/dto/create-admission-concession.dto.ts:5–29`; requires fee detail ID, concession category UUID, enum type and positive numeric discount value; justification optional.
- Current controller: `ryo-academy-be/src/admission/admission-fee-log/admission.controller.ts:114–145`; GET breakdown requires `ADMISSION_READ`; POST assignment and DELETE removal require `ADMISSION_UPDATE`, under JWT/permission guards.
- Current calculator: `ryo-academy-be/src/admission/fee-concession/discount-calculator.ts:14–88` uses Decimal but rejects zero discount value; PERCENTAGE/FIXED have caps; rounds calculated discount amount to 2 places, not a payable-derived percentage.
- Current concession service: `ryo-academy-be/src/admission/fee-concession/admission-concession.service.ts:18–89,91–265,268–365` reads summaries, creates, updates detail/header, physically deletes concession and resets detail. It locks admission and uses a transaction for writes. It requires active same-school category and DRAFT status. Aggregations filter `isActive` only, not proposed `isIncluded`.
- Admission creation: `ryo-academy-be/src/admission/admission-fee-log/admission.service.ts:82–149` creates detail snapshots with D=0 and `finalAmount`/`totalAmountToBePaid` equal to original. It currently includes all active source components; M2.2 replaces this with selection and `isIncluded` semantics.
- Admission generic update: `ryo-academy-be/src/admission/admission-fee-log/admission.service.ts:156–239`; confirmed fee-header updates are blocked, but current DTO/repository can accept client-provided fee fields. `admission.repository.ts:123–193` writes generic detail/header values. New discount API must not reuse that trust model.
- Confirmation: `ryo-academy-be/src/admission/admission-fee-log/admission.service.ts:285–403` loads active details, recalculates concessions from `discountType`/`discountValue`, and sums details into header; it currently lacks `isIncluded` filtering and must stop recomputing from legacy discount inputs.
- Frontend types/API: `ryo-academy-fe/src/lib/concessions-api.ts:5–64,88–103`; create type requires category/type/value and response exposes those old fields.
- Frontend UI: `ryo-academy-fe/src/pages/admissions-students-pages.tsx:1154–1208,1510–1576`; asks type/category/value, validates the old caps and computes preview with JS `Number`, `parseFloat`, and `Math.round`. UI display shows deduction and final payable (`:1431–1447`).

## 4. Current Discount/Concession Data Model

### Existing fields and their suitability

| Current field | Use today | Payable-based role |
|---|---|---|
| `FeePaymentDetails.originalAmount` | Admission-time original snapshot | Authoritative `O`; never refresh from master |
| `FeePaymentDetails.discountAmount` | Calculated discount D on detail | Store derived `D=O-P` |
| `FeePaymentDetails.totalAmountToBePaid` | Payment service reads as per-component balance basis | Canonical persisted payable `P` for new contract |
| `FeePaymentDetails.finalAmount` | Mirrors payable in current calculator | Keep synchronized to P for compatibility; not a separate authority |
| `AdmissionFeeConcession.discountType/discountValue` | Original input contract | Preserve for legacy records; no longer new-write authority |
| `AdmissionFeeConcession.calculatedDiscountAmount` | Stored calculated D | Keep as concession audit copy of D; reconcile with detail D |
| `concessionCategoryId` | Required current classification | Not required by V0; nullable for new payable-only records, historical values retained |
| Discount percentage | Not stored on current fee detail/concession | Derive on read from O and D; do not persist a redundant rounded value |
| `isIncluded` | Not yet in current schema | M2.2 proposed selection state; gate discount applicability and totals with `isActive AND isIncluded` |

Current model can represent payable through detail `totalAmountToBePaid`, but the concession row does not record payable input explicitly and its required legacy type/value/category fields conflict with a category-free payable request. Recommended additive compatibility migration: make legacy category/type/value nullable for new records, retaining existing data unchanged. Do not add another payable column if detail `totalAmountToBePaid` remains canonical. An alternative of duplicating P on the concession row adds consistency risk without a requirement.

## 5. Existing Discount Lifecycle

### Create/applicable snapshot

Admission creation copies source `originalAmount`, `discountApplicable`, `isMandatory`; initializes discount to zero and final/payable to original. It returns admission (not a fully typed fee snapshot). M2.2 selection changes which detail rows are financially included and how initial gross is calculated.

### Current concession assignment

1. `POST /admission/:id/concessions`, permission `ADMISSION_UPDATE`.
2. Transaction locks admission and loads active header/details.
3. Requires DRAFT status, target active detail, `discountApplicable=true`, no existing concession.
4. Requires an active category for the same school.
5. Runs percentage/fixed calculator.
6. Creates `AdmissionFeeConcession` with category/type/value/calculated D and actor.
7. Updates detail `discountAmount`, `finalAmount`, `totalAmountToBePaid`.
8. Recomputes header gross/discount/net and sets total fee/due from net over active details.

### Current update/remove/confirmation

- No update endpoint exists for an existing concession; service rejects a second one until first is removed.
- `DELETE /admission/:id/concessions/:concessionId` deletes the concession record and resets detail discount to zero and payable to original; it recomputes header from active details.
- Confirmation recalculates detail values from legacy type/value and freezes header/schedule in one transaction. It does not use a client-entered payable because no such field exists.
- Reads return category/type/value/calculated D, detail original and final/payable fields.

Transaction and source behavior are inspected only; rollback/runtime guarantees are not claimed.

## 6. Payable-Based Discount Design

### Lifecycle for one component

| Stage | Authoritative input and reads | Writes/validation | Transaction and result |
|---|---|---|---|
| Initial snapshot | Resolved master component; copy source name, O, discount policy, mandatory flag; initial selected IDs per M2.2 | Detail D=0, P=O in both `totalAmountToBePaid` and `finalAmount`; no concession row | Admission/header/detail creation transaction from M2.2; header gross includes only active+included rows |
| Set payable | Client supplies detail ID and decimal string P only. Service locks/reloads admission/detail; reads snapshot O, eligibility, included state, status | Require DRAFT, active+included, discount-applicable; parse exact Decimal; require 0≤P≤O. Derive D=O-P and R via HALF_UP to 2 decimal places. Write P, D and synchronized final/payable fields; create/update one concession audit row | One transaction under existing admission lock; detail/concession/header update either all commit or rollback |
| Update payable | Same P-only request; existing concession/detail located by admission and detail identity | Replace P, recompute D/R from O/P; no percentage/fixed discount input. Reject a detail ID not in admission or excluded | Same transaction; no new row because unique concession per detail |
| Remove/reset | No payable required; target detail/concession ID | For included eligible row set P=O, D=0, final=O and remove current concession under existing explicit-delete semantics. For excluded row remove/reset stored current concession but do not change `isIncluded`; current header totals remain unchanged because row is excluded | One transaction. Header recomputation over active+included yields same current totals for excluded target |
| Confirm | Persisted snapshot P and D are authoritative; read only active+included detail rows and their current payable records | Validate equations and policy; do not recalculate from old `discountType/discountValue`, source master, or rounded R. Freeze P/D; excluded rows are skipped | Existing admission confirmation transaction includes header and schedule integration; schedule zero-net incompatibility remains downstream |
| Retrieve/display | Read snapshot O, P, D, inclusion and policy; derive R from O,D | Return decimal strings and explicit `included`/concession state; excluded rows may be shown as history but not current summary totals | Read only; frontend preview is informational and never authoritative |

If `discountApplicable=false`, a request to set P different from O is rejected; no concession row is created. No-discount state is P=O, D=0, R=0.

### Update implementation shape

Use the existing per-detail one-concession uniqueness. For new payable records, nullable legacy fields (`discountType`, `discountValue`, `concessionCategoryId`) remain null; detail P is the sole payable source. Existing legacy fields remain populated for old records. The current detail fields `finalAmount` and `totalAmountToBePaid` are both maintained as P to avoid breaking existing readers while M2.4 settles a single public summary equation.

## 7. Deselect/Re-add Concession Decision Analysis

The approved rules preserve an excluded row and its concession history but do not decide whether that concession becomes effective on re-add.

| Alternative | Consistency / authority | Risk | UX | Model / confirmation / legacy |
|---|---|---|---|---|
| **A. Restore prior payable and concession** | Prior payable remains authoritative; matches exact draft-state restoration | Re-add silently restores a discount, possibly without user noticing | Fast, but surprising financial change | No major new field; confirmation must include restored discount. Existing legacy concession reactivates as-is, which may preserve old semantics but violates explicit re-review expectation risk |
| **B. Re-add at original payable; require new entry** | Clear: P=O, D=0 on re-add | Previous concession can be lost or detached unless preserved separately | User must re-enter discount | Requires preserving old concession history separately or marking it superseded; legacy values cannot simply be overwritten |
| **C. Preserve prior record as historical/draft, require review/reapplication** | Old record is not current authority; re-add begins P=O, D=0 until explicit payable submission | Slightly more state and a user action; avoids surprise discount | Clear review prompt; user chooses whether to reapply a payable | Add effective/review state or equivalent. Existing legacy concession remains readable and is marked non-effective on re-add; confirmation rejects a pending review state or treats it as no discount only after explicit acknowledgement |

**Recommendation requiring user approval: Alternative C.** On deselect, mark existing concession ineffective/suspended without deleting it and exclude it from totals. On re-add, set the row's current payable to original and mark the preserved concession as requiring review; it does not affect totals. User explicitly reapplies by submitting a new P, which updates the same current concession record while preserving prior parameters in an audit/version history if full revision history is required. Confirmation is blocked while a re-added eligible row has unresolved review state, avoiding accidental restoration or silent erasure. This is the safest match for “preserve history” and payable-as-user-input. If immutable revision history is not required, retain the old row with status and overwrite its current payable only after explicit reapplication; M2.4 should decide event/history depth.

**Removing a concession while excluded:** explicit remove/reset deletes or clears the current draft concession according to the existing removal semantics, restores stored P=O and D=0, and leaves `isIncluded=false`. It does not toggle inclusion and does not change current header totals. It may not delete the admission detail snapshot. A historical audit log for explicit removal is not established in current source and is a technical decision for M2.4 if required.

## 8. Financial Invariants and Decimal/Rounding Strategy

### Invariants

For each current obligation row, define `F = isActive AND isIncluded`.

- **F and discount-applicable:** `0 <= P <= O`; `D=O-P`; `R=ROUND_HALF_UP((D/O)*100,2)`.
- **F and not discount-applicable:** `P=O`; `D=0`; `R=0`; reject any differing P.
- **Not F (excluded or inactive):** snapshot and concession may remain; no new discount; row contributes zero to current header/schedule/payment obligations. Historical report can show it, clearly labeled.
- **Header:** M2.3 can specify that detail D and P used in component totals come from F rows only. M2.4 owns final cross-header definitions for gross, discount, net/fee total, paid and due equations. M2.3 must not redefine paid/due equations.
- Payment/reversal history is not recomputed by toggling a discount; a row with payment must not be deselected, and confirmed rows cannot be edited.

### Precision and rounding

- Current SQL stores fee and concession amounts as `DECIMAL(65,30)`; use Prisma Decimal and reject values that exceed the representable 30 fractional-digit scale rather than relying on database coercion. No source rule requires rounding P or D to cents. Do not silently round them.
- API request/response monetary values are decimal strings, without exponent notation. Serialize exact values; UI may format for display.
- Compute `D=O-P` exactly. Compute percentage only once from exact D and O, then `toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)`. Use percentage only as derived display data; never use rounded R to reconstruct D or P.
- Persist P to `totalAmountToBePaid` and compatibility mirror `finalAmount`; persist D to detail and concession `calculatedDiscountAmount`. Derive R on read. This avoids a second stored rounded value drifting from P/D.
- If product later mandates two-decimal monetary input, that is a new amount-scale rule; current accepted V0 only specifies two decimal places for percentage. Current DB can store 30 fractional digits.

### Examples (O = 1,000.00)

| Payable P | Discount D | Derived R | Result |
|---:|---:|---:|---|
| 750.00 | 250.00 | 25.00% | Valid |
| 0.00 | 1,000.00 | 100.00% | Valid; zero payable remains an obligation state, even if downstream schedule rejects zero net today |
| 1,000.00 | 0.00 | 0.00% | Valid; no discount record is necessary |
| -1.00 | — | — | Invalid: below zero |
| 1,000.01 | — | — | Invalid: exceeds original |

## 9. Proposed API Contracts

These contracts replace the existing percentage/fixed body on the same unversioned concession endpoints. Do not accept legacy and payable bodies in parallel on one route. Monetary values are decimal strings. Permissions follow existing controller patterns.

### Set/create discount

`POST /admission/:admissionId/concessions` — existing route, new request contract. `ADMISSION_UPDATE`.

```json
{"feePaymentDetailsId":"detail-uuid","payableAmount":"750.00"}
```

Response:

```json
{
  "feePaymentDetailsId":"detail-uuid",
  "included":true,
  "originalAmount":"1000.00",
  "payableAmount":"750.00",
  "discountAmount":"250.00",
  "discountPercentage":"25.00",
  "isDiscountApplicable":true,
  "concession":{"id":"concession-uuid","appliedAt":"..."},
  "summary":{"grossAmount":"1000.00","discountAmount":"250.00","netAmount":"750.00"}
}
```

Errors: 400 malformed/non-decimal/out-of-range P, not DRAFT, excluded/inactive detail, non-discountable detail; 404 detail/admission not in scope; 409 if a create finds an existing current discount. Service reads O and flags from snapshot only.

### Update existing payable

`PATCH /admission/:admissionId/concessions/:concessionId` — proposed method on existing resource path. `ADMISSION_UPDATE`.

```json
{"payableAmount":"0.00"}
```

No detail ID or derived values needed: backend resolves concession → detail and validates admission ownership. It updates same current discount. Errors include 404 wrong concession/admission; 400 invalid P/status/inclusion/eligibility.

### Remove/reset discount

`DELETE /admission/:admissionId/concessions/:concessionId` — existing route, retained semantics. `ADMISSION_UPDATE`.

Response includes reset component O/P/D and updated summary for included rows. On excluded row, P resets to O and D to zero but inclusion remains false; current header summary is unchanged. Errors 404, confirmed/cancelled state, or payment-protected state.

### Retrieve fee configuration/discount breakdown

`GET /admission/:admissionId/concessions` — existing route, `ADMISSION_READ`, response contract becomes typed and decimal-string based. Include all snapshot rows with `isActive`, `included`, `isDiscountApplicable`, O, P, D, derived R, concession/review state. Return summary totals computed only over active+included rows. Excluded history rows are present but not summed.

### Confirmation

`POST /admission/:id/confirmed` — existing route, `ADMISSION_UPDATE`, no request body. No new discount fields required in request. Response may keep existing admission shape; frontend can read the updated snapshot endpoint. Confirmation validates stored O/P/D and review state for included rows, skips excluded rows and concessions, and freezes values. Zero-payable details are valid; if total admission net is zero, M2.4/M2.6 must make schedule confirmation compatible rather than rejecting the approved discount.

### Safe contract transition

Replace the old `discountType`/`discountValue`/category-required POST body; reject old fields and missing `payableAmount`. Update the FE adapter and backend together, or use a short-lived explicitly versioned legacy route if independent deployments require it. Do not silently translate percentage/fixed on the new route or accept both shapes without a version. Legacy persisted data remains readable via its old columns; no historical rewrite is needed for the new API response if P can be read from detail `totalAmountToBePaid`.

## 10. Frontend Interaction Requirements

- Show Original amount and a “Payable amount” input initialized to original for eligible included rows; zero is allowed. Do not show percentage/fixed as primary input. A percentage preview may be shown from the API-derived R.
- Non-discountable rows show payable equal to original and no editable discount input.
- Do not calculate authoritative D/R with JS floating point. Client may show only server-returned D/R or non-authoritative preview using decimal-safe arithmetic.
- On submit send only `feePaymentDetailsId` and `payableAmount` decimal string. Display backend validation (negative, greater than original, excluded/inactive, confirmed).
- On excluded row, no new discount action. If re-added with preserved concession under recommended C, show “Review discount” state; apply only after user submits a payable again.
- Removing a discount from an excluded row must not change inclusion or current totals.
- Read response displays included obligations separately from excluded historical snapshot rows; show original, payable, discount amount and derived percent.
- Legacy category/type fields should not be required or exposed in the V0 payable flow. Preserve existing historical displays where useful.

## 11. Cross-Consumer Propagation Matrix

All current consumers must adopt M2.2 predicate `isActive AND isIncluded`. No current source consumer honors `isIncluded`; it is proposed and unimplemented.

| Consumer | Required payable/inclusion behavior | Ownership |
|---|---|---|
| Concession assignment/update/removal | Snapshot O; set P only; derive D/R. Reject excluded/noneligible. Excluded removal cannot toggle inclusion or change current totals. | M2.3 |
| Concession summary | Return P/D/R per row; totals only over active+included; excluded may be history-only. | M2.3 response + M2.4 equations |
| Admission confirmation | Validate and freeze stored P/D for included rows; skip excluded row and concession; no recomputation from percentage/fixed legacy fields. | M2.3 rules, M2.4 totals |
| Header gross/discount/net/due | Included rows alone feed gross/discount/net; paid/due reconciliation is finalized in M2.4. | M2.4 |
| Installments | Consume finalized header net/due derived from included details. Existing schedule must be reconciled/block if draft P changes; zero net must be supported by approved behavior. | M2.4/M2.6 |
| Payment collection/component attribution | Pay against header balance and allocate only to active+included details; prevent selection/payable edits once confirmed or paid. | M2.4/M2.6 |
| Reversal | Reverse original allocation lineage and restore exact historical counters; do not treat excluded detail as new obligation. Flag legacy excluded-paid rows for reconciliation. | M2.6 |
| Student fee summary | Current totals/outstanding only active+included; preserve excluded history with explicit flags and separate presentation. | M2.4/M2.7 |
| Current financial reporting | Current obligations use active+included; historical/audit views may include excluded rows but label and segregate totals. | M2.4/M2.7 |

## 12. Existing-Data Compatibility

### What existing records contain

Current detail rows already hold O, D, and payable-like `totalAmountToBePaid`/`finalAmount`; old concession rows hold type/value and calculated D. In principle, P can be read from detail `totalAmountToBePaid`, and R can be derived from detail O and P. However current code can update these fields via generic DTOs and uses legacy type/value again at confirmation, so consistency is not guaranteed by schema alone.

### Compatibility strategy

- Additive migration only: make legacy `discountType`, `discountValue`, and category reference optional for new payable entries; preserve all populated legacy values. Keep `calculatedDiscountAmount` nullable or populated for new records as D (prefer non-null D=0 only if a concession row is retained for zero discount; simplest is no concession row for P=O).
- Do not add `discountPercentage` storage; derive it. Do not bulk rewrite historical detail or concession values.
- New payable API reads P from detail; when updating a legacy concession, write P/D into detail and clear legacy input fields only on that record if the nullable migration is applied. Preserve old values in audit/history if historical meaning must be retained; preferably do not clear them—use a version/contract marker or new nullable payable-contract marker instead. This is a design trade-off requiring schema design before M3.
- Confirmed admissions/payment records stay immutable. No historical discounts or payment allocations are recomputed during rollout.
- DRAFT records with legacy concessions: expose P from stored detail `totalAmountToBePaid`; do not re-run old percentage/fixed calculator on a new read. On explicit update, validate against snapshot O and migrate only the target draft row's current representation. Resolve mismatches before permitting update.
- Existing zero payable from 100% legacy discount is already representable in detail; current calculator test covers it, but current confirmation schedule path rejects a zero net header. Downstream fix belongs to M2.4/M2.6.
- Before deployment, run a read-only inventory (not run here): counts by admission status of concession rows where detail `discountAmount != concession.calculatedDiscountAmount`, where `totalAmountToBePaid != originalAmount - discountAmount`, and where `finalAmount != totalAmountToBePaid`; once M2.2 inclusion exists, also group by included/excluded. Review mismatches without rewriting records.
- Existing data has sufficient fields for most values but not a reliable explicit “legacy vs payable contract” marker. Add a nullable `payableAmount` or contract-version marker only if needed to distinguish new semantics without overwriting historical type/value/category. The detail already stores P, so avoid duplicated payable storage unless versioning demands it. Add the `requiresReview` state from Section 7 for alternative C; legacy rows default false and re-added rows become true until explicit payable reapplication.

## 13. Risks and Open Questions

1. **Re-add semantics:** resolved by recommendation C, but requires owner approval. It affects whether an old draft discount becomes effective and whether confirmation is blocked pending review.
2. **Legacy model evolution:** category/type/value are required today but V0 requires no categories. M3 must choose nullable legacy fields plus a payable-contract marker/version so new rows do not fabricate a fixed discount or destroy old meaning.
3. **Draft concession history:** current removal physically deletes the concession row. If explicit removal must retain an immutable audit trail, a separate event/history design is needed; not established by current model.
4. **Amount input scale:** storage permits 30 fractional digits; current approved rules do not define a narrower payable scale. Keep exact decimals and no hidden rounding unless product establishes a new scale rule.
5. **Header equations and zero net:** M2.4/M2.6 must support zero-net confirmed admissions without inventing a positive installment.
6. **Included propagation:** every current detail consumer must be updated; filtering only `isActive` is insufficient.
7. **Runtime/test status:** none was executed. API validation pipe, persisted precision behavior, rollback, and actual response serialization remain unverified.

## 14. Dependencies on M2.4–M2.7

- **M2.4 Financial totals:** final gross/discount/net/paid/due equations; shared active+included filtering; zero-net header behavior and summary reconciliation.
- **M2.5 Academic-year restrictions:** whether draft payable edits are allowed after year start and how this interacts with selection changes.
- **M2.6 Payment/installments/reversal:** zero-net schedule representation; block amount/inclusion changes after schedules/payments; allocation only to included rows; reverse exact allocation history and reconcile legacy excluded-paid rows.
- **M2.7 Frontend/integration:** new P-only DTO/types, stale client rejection, decimal-string UX, review state on re-add, response/cache updates, and safe end-to-end verification.

## 15. Explicit Out-of-Scope Items

- Implementation of DTOs, services, schema/migrations, frontend changes, or tests.
- Reopening fixed discount business rules or adding categories/approval workflow to V0.
- Payment/reversal or installment redesign; only required inputs/invariants are identified.
- Academic-year-start implementation.
- Database inventory execution, data updates, seeds, fixtures, tests, builds, servers, HTTP/browser QA.
- M2.4 or later design/implementation.

## 16. Approval Decisions Required

1. **Approve or reject recommended re-add alternative C:** preserve previous draft concession as non-effective/review-required; re-add at original payable; require explicit review/reapplication before the discount becomes effective.
2. **Confirm history depth for explicit draft removal:** existing behavior physically deletes the concession row; decide whether V0 may retain that behavior or requires an immutable removal event/history record.
3. **Choose legacy representation for new payable records during M3:** nullable legacy category/type/value plus a contract marker/version, versus another additive compatibility shape. Do not fabricate percentage/fixed values for payable-based entries.

No other fixed V0 discount rule requires approval.

## M2.3 Targeted Clarification Addendum — Re-add State and Legacy Lifecycle

This addendum records the owner’s fixed decisions: alternative C for re-add; physical DELETE for explicit DRAFT concession removal; legacy compatibility through nullable legacy fields plus an explicit calculation-mode marker. It resolves the state and persistence details without reopening those decisions.

### A. Source evidence and current constraints

- `ryo-academy-be/prisma/models/admission_fees/admission-fee-concession.prisma:1–23`: one `AdmissionFeeConcession` per detail (`feePaymentDetailsId @unique`); required legacy `discountType`, `discountValue`, `calculatedDiscountAmount`, and required category relation; no mode/review/payable-history state.
- `ryo-academy-be/prisma/models/admission_fees/fee-payment-detials.prisma:1–25`: detail contains snapshot `originalAmount`, `discountAmount`, `finalAmount`, `totalAmountToBePaid`, `amountPaid`, `isActive`; no `isIncluded` yet. The payable-like detail field is therefore the appropriate current obligation value.
- `ryo-academy-be/src/admission/fee-concession/admission-concession.service.ts:91–265`: assignment locks the admission and runs a transaction, creates one concession, writes detail amounts, and recomputes header from active details. It disallows a second concession until removal and requires category/type/value.
- `admission-concession.service.ts:268–365`: explicit removal physically deletes the concession and resets detail payable/discount; it does not change the source component. Current recalculation filters `isActive` only; M2.2 requires active+included.
- `ryo-academy-be/src/admission/admission-fee-log/admission.service.ts:285–388`: confirmation loads active details, recalculates every concession from legacy type/value, updates detail/header totals, and then finalizes schedules. It has no calculation-mode or inclusion branch.
- `ryo-academy-be/src/admission/fee-concession/dto/create-admission-concession.dto.ts:5–29`: current request requires detail UUID, category UUID, discount enum, and positive numeric discount value.
- `ryo-academy-be/src/admission/admission-fee-log/admission.controller.ts:114–145`: current GET/POST/DELETE concession routes and permissions; update method does not exist.
- `ryo-academy-be/prisma/migrations/20261103164831_add_fee_concessions_v1/migration.sql:5–18,40`: legacy concession columns are non-null and the one-to-one unique index is enforced in SQL.

The current one-to-one row can hold one current concession, but it cannot preserve an arbitrary sequence of old calculation states if its fields are overwritten on reapplication. Source inspection establishes no revision/history child today.

### B. Exact re-add state machine

Notation: `O` is immutable detail original amount; `P` is current detail payable (`totalAmountToBePaid`, mirrored to `finalAmount`); `D` is current detail discount amount. `C(mode, review, calc)` denotes the one current concession row, with `calc` its stored calculated amount. `F` means financially applicable (`isActive AND isIncluded`). “Current totals” count only F rows. A row with `requiresReview=true` is included but not yet confirmable; its current P is O and its effective D is zero.

To preserve the prior concession without overwriting it, the design below adds revision snapshot rows before replacing its current state. The active concession row remains unique per detail. Revisions are history of discount state replacement, not explicit-removal events; explicit DELETE removes the active concession and its revisions as approved.

| Transition | `isIncluded` | `requiresReview` | Calculation mode | Detail O | Detail D | Detail `finalAmount` | Detail `totalAmountToBePaid` (P) | Concession current row / calculated amount | Current totals? | Confirmation allowed? |
|---|---:|---:|---|---:|---:|---:|---:|---|---|---|
| 1. New component, no discount | true | false | No concession row | O | 0 | O | O | None | Yes; gross O, discount 0 | Yes, if all other confirmation checks pass |
| 2. Payable discount applied | true | false | `PAYABLE` | O | O−P | P | P | Exists, `PAYABLE`, `payableAmount=P`, calculated amount O−P | Yes; payable P / discount O−P | Yes, after consistency checks |
| 3. Component deselected | false | false | Preserve current mode | O | Preserve current detail D as historical row value | Preserve prior detail value | Preserve prior detail P | Keep concession unchanged; its values remain historical/current-last-applied; do not delete | No | Confirmation may proceed without this row; it is skipped |
| 4. Component re-added | true | true | Preserve prior mode on concession | O | 0 | O | O | Keep concession row unchanged and preserve old calculated amount; it is explicitly not effective | Yes, as no-discount P=O; review-pending is surfaced | No, until explicit review decision |
| 5. Re-added, awaiting review | true | true | Preserve old mode; no new mode selected yet | O | 0 | O | O | Old concession remains stored and ineffective; revision not yet required because no overwrite occurred | Yes, at original payable only | No |
| 6. User reapplies discounted payable P′ | true | false | `PAYABLE` | O | O−P′ | P′ | P′ | Current row `PAYABLE`, `payableAmount=P′`, calculated amount O−P′; previous concession snapshot is inserted into revision table first | Yes, using P′/O−P′ | Yes, if all rows consistent |
| 7. User explicitly chooses no discount after review (P=O) | true | false | `PAYABLE` | O | 0 | O | O | Current row may remain as a zero-discount reviewed state (`payableAmount=O`, calc=0); previous concession is first preserved as a revision | Yes, at O and zero discount | Yes |
| 8. Explicit DELETE while excluded | false | false | No current concession after deletion | O | Reset to 0 | O | O | Delete concession and its revisions; detail snapshot remains excluded | No; header recompute is unchanged | Yes, subject to other checks |
| 9. Explicit DELETE while included | true | false | No concession row | O | Reset to 0 | O | O | Delete concession and its revisions; detail/source component remain | Yes, at O and zero discount | Yes |
| 10. Confirmation | unchanged | must be false for included rows | Legacy or PAYABLE branch per row | O | unchanged after validation | P | P | Excluded concession/revisions remain; included current values frozen | Only F rows | Yes only if no included row awaits review and every included row validates |

**State separation:** revision snapshot is preserved history; `requiresReview` is whether user has acknowledged/reapplied the preserved concession; `calculationMode` states the current row’s interpretation; detail P/D are the current financial obligation. The historical concession amount must never be read as current D when `requiresReview=true` or `isIncluded=false`.

### C. One concession row per detail: feasibility and recommendation

A single row plus mode/review marker and detail P/D is enough only until a new payable overwrites the old `payableAmount`/calculated amount. The old legacy `discountType/value` fields can preserve an untouched legacy value, but they cannot preserve an earlier payable-based concession. Therefore, the approved “preserve previous concession” behavior cannot be guaranteed across an explicit reapplication using only the current row fields.

Smallest safe representation recommended:

1. Retain the current unique active row per detail; do not change the `feePaymentDetailsId` unique constraint.
2. Add `calculationMode` enum values `LEGACY_PERCENTAGE`, `LEGACY_FIXED`, `PAYABLE` to `AdmissionFeeConcession`.
3. Add `requiresReview Boolean @default(false)` to the active concession row.
4. Add nullable `payableAmount Decimal` to the active row for the current payable-based state. Detail `totalAmountToBePaid` remains the canonical value consumed by current payment code; service verifies both agree.
5. Make legacy `discountType`, `discountValue`, and `concessionCategoryId` nullable for new payable-only rows. Existing populated values remain untouched. Do not fabricate legacy values for payable rows.
6. Add a small `AdmissionFeeConcessionRevision` child snapshot only when replacing a preserved state: old calculation mode, legacy type/value/category if present, old payable if PAYABLE, calculated discount, actor/time, and source concession ID. It does not record explicit removals. Unique parent remains one-to-one with detail. Explicit DELETE cascades/deletes its revisions, consistent with approved physical-delete behavior.

This revision child is justified by preserving the prior discount across a user-approved replacement; it is not a general audit/event system. A single `previous*` field set would be a smaller migration but would lose earlier preserved states on a second deselect/re-add cycle. Do not weaken or remove the existing one-current-concession-per-detail uniqueness.

### D. Legacy calculation-mode lifecycle

Use the marker values exactly as follows:

- `LEGACY_PERCENTAGE`: existing `discountType=PERCENTAGE`; legacy `discountValue` is a percent.
- `LEGACY_FIXED`: existing `discountType=FIXED`; legacy `discountValue` is a fixed discount amount.
- `PAYABLE`: new user input is `payableAmount`; `discountType`, `discountValue`, and category are not authorities and may be null. D and P are stored on the row/detail; R is derived.

Backfill existing concessions’ marker from their current `discountType` only; this is a metadata migration, not a financial recalculation. Existing values are preserved.

#### Case 1 — Existing DRAFT legacy concession, untouched

It remains in `LEGACY_PERCENTAGE` or `LEGACY_FIXED`. Its legacy type/value remain authoritative for that legacy row. Before confirmation, compute the legacy expected D using the existing calculator and compare with concession `calculatedDiscountAmount`, detail `discountAmount`, `totalAmountToBePaid`, and `finalAmount`. If they reconcile, the legacy confirmation branch may continue using the legacy calculator and values, with active+included filtering. If they do not, block with 409 conflict and require an explicitly approved repair; do not silently rewrite.

#### Case 2 — Existing DRAFT legacy concession receives payable update

Inside one admission-locked transaction, first create a revision snapshot of the legacy mode/type/value/category/calculated amount and existing detail O/D/P. Then set current concession mode to `PAYABLE`, set current `payableAmount=P`, set `requiresReview=false`, calculate D from snapshot O−P, and update detail D, final=P, total payable=P. Keep old legacy columns populated on the current row if the database allows, but ignore them whenever mode is PAYABLE; revision is the authoritative preservation copy. Existing category is preserved for history but no longer required. Do not restore the old legacy discount on a later re-add; it returns only as non-effective review information, and a new payable must be explicitly submitted.

#### Case 3 — Existing legacy record is inconsistent

If concession D differs from detail D, detail P differs from O−D, or detail final differs from detail payable, do not auto-select one value and recalculate. Reads may return the stored values with a consistency state; payable update and confirmation return 409 `FINANCIAL_SNAPSHOT_INCONSISTENT`. Repair requires a separately authorized, reviewed operation/plan with source evidence. No bulk repair is included here.

#### Case 4 — Confirmed legacy admission

Preserve existing detail/concession/header values exactly. Do not backfill financial values or recalculate on read. The new payable write endpoints reject non-DRAFT admissions. Confirmation cannot be invoked again because existing status transition is DRAFT-only; no new mutator may touch a confirmed legacy record.

#### Case 5 — Legacy concession on deselect/re-add

On deselection, retain the legacy concession row and its legacy type/value/category; excluded means it contributes nothing. On re-add, set detail P=O/D=0, `requiresReview=true`, and retain the old legacy mode/value as preserved information. Confirmation is blocked until the user explicitly chooses no discount (P=O) or submits a new payable P. New payable application first snapshots the legacy state into the revision child, then changes current mode to PAYABLE. Confirmation never applies the old percentage/fixed discount after mode changes or while review is required.

### E. Explicit DRAFT removal behavior

Retain the current physical DELETE contract:

- **Included:** under DRAFT lock/transaction, delete active concession and its revision children, set detail D=0, `finalAmount=O`, `totalAmountToBePaid=O`; keep `isIncluded=true`; recompute header from active+included details. Fee detail row and source fee component are not deleted or changed.
- **Excluded:** delete active concession and revision children, reset stored detail D=0, final/payable=O; keep `isIncluded=false`; do not add this row to header totals. Recompute over active+included rows if the shared helper is used; result must exclude this row and leave current header totals unchanged.
- Both reject non-DRAFT state and any condition under which financial values are frozen. No removal event/history system is added.

### F. Confirmation behavior

Confirmation must partition detail rows by active+included and mode:

- **Included, no discount:** P=O/D=0, no concession row or a reviewed PAYABLE zero-discount row. Validate then freeze; no legacy calculator call.
- **Included, PAYABLE discount:** validate 0≤P≤O, D=O−P, detail/concession values agree, mode PAYABLE, and `requiresReview=false`; derive R for response only. Never call legacy discount calculation using old `discountType/value`.
- **Included, awaiting review:** return 400/409 with affected detail ID(s); no confirmation transaction commits and no old discount is restored.
- **Excluded with preserved concession:** skip it entirely for current gross/discount/net and payable confirmation. Preserve detail/concession/revisions.
- **Untouched legacy percentage/fixed:** retain a legacy-only branch using existing calculation semantics after checking the saved concession/detail values reconcile. Current status remains DRAFT until transaction completes. Do not run this branch for PAYABLE mode.
- **Inconsistent legacy record:** fail with conflict; no silent recalculation.
- **Already confirmed:** existing DRAFT-only guard rejects another confirmation; new payable APIs reject updates. Historical values remain unchanged.

Existing confirmation code branches needing change: detail include currently filters only `isActive` (`admission.service.ts:292–309`); processing loop currently recalculates every attached concession (`:327–362`); final totals currently sum active details only (`:364–388`). Change to active+included and branch on calculation mode/review state. Retain the legacy calculator only for untouched `LEGACY_PERCENTAGE`/`LEGACY_FIXED` DRAFT rows after consistency validation. The existing DRAFT status gate, payment guard, transaction boundary, and student creation remain.

Zero payable remains valid. Current schedule confirmation rejects header net≤0 (`ryo-academy-be/src/admission/installment/admission-installment-schedule.service.ts:840–849`); this is a downstream M2.4/M2.6 integration gap and must not cause the discount endpoint or confirmation validation to reject P=0.

### G. API and data-contract clarification

#### Calculation mode and review state

Backend-controlled fields:

```text
CalculationMode = LEGACY_PERCENTAGE | LEGACY_FIXED | PAYABLE
requiresReview: boolean
payableAmount: decimal string | null
```

`requiresReview=true` is set when an excluded concession is re-added. It is cleared only by an explicit payable request or explicit no-discount acknowledgement. Client cannot submit mode/review flags.

#### Set or update payable

Use current POST route for initial assignment and add PATCH route for update; both take P only:

```http
POST /admission/:admissionId/concessions
PATCH /admission/:admissionId/concessions/:concessionId
```

Permission: existing `ADMISSION_UPDATE`; service also requires DRAFT, target belongs to admission, target is active+included and snapshot `discountApplicable=true`.

Initial request:

```json
{"feePaymentDetailsId":"detail-id","payableAmount":"750.00"}
```
Update request:

```json
{"payableAmount":"750.00"}
```

Explicit no-discount acknowledgement after re-add uses the same update with `payableAmount` equal to snapshot `originalAmount`; it clears review and sets D=0. An omitted payable is not an acknowledgement.

Response includes O/P/D/R decimal strings, included state, calculation mode, `requiresReview`, current effective concession, and separately labeled preserved revisions. For review-required rows, return current payable O and effective discount 0; expose old saved concession only under `preservedConcession`/history, never as current D.

#### Remove and retrieve

`DELETE /admission/:admissionId/concessions/:concessionId` remains existing route, physical deletion as above. `GET /admission/:id/concessions` remains `ADMISSION_READ`, but response must distinguish current values from preserved revisions and report current header totals using active+included only.

#### Confirmation

Existing `POST /admission/:id/confirmed` remains. Review-pending error returns a stable code such as `DISCOUNT_REVIEW_REQUIRED` and affected detail IDs; inconsistency returns `FINANCIAL_SNAPSHOT_INCONSISTENT`. Do not echo client-provided monetary data as authoritative.

### H. Remaining risks and dependencies

- The minimal revision child is needed only if the old discount must remain preserved after a new payable is explicitly applied; explicit DELETE still removes the concession and its revisions. If the owner intended preservation only until the next explicit choice, this is still compatible and the stored revision provides that record.
- Existing M2.2 `isIncluded` field is not implemented in source; its migration/default must precede these transitions. Existing records should default included=true without changing financial values.
- M2.4 owns final header equations and consistency helper; all discount writes here must use that agreed calculation boundary.
- M2.6 owns schedule/payment/reversal propagation and zero-net schedule support; selection or payable mutation after schedule/payment remains blocked or reconciled under that design.
- No tests, build, API, transaction rollback, or database state were verified.

### I. Approval decisions required

The owner decisions in this prompt are accepted and not reopened. No further business approval is required for re-add, explicit deletion, or calculation mode. The technical recommendation is to retain the one-to-one current concession row and add a small revision child to preserve replaced concession values; implementation sequencing and exact schema/API field names remain for M3 design/implementation review. No M2.4 work or implementation was started.
