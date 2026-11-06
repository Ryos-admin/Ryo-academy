# M2.4 — Zero Payable, Confirmation, and Installments

## 1. Title and milestone

Ryo Academy ERP fee configuration revamp — M2.4 design record.

## 2. Status

**Owner-approved design; implementation not started.** This record preserves the M2.4 decisions supplied in the project conversation. It does not claim that these rules are implemented or runtime-verified.

## 3. Purpose and scope

Define financial equations, confirmation requirements, installment behavior, and schedule retrieval/reconciliation for zero and positive payable admissions. Detailed payment attribution and reversal behavior belongs to M2.6.

## 4. Business rules

- Financial applicability is `isActive AND isIncluded`. Excluded details remain snapshots but do not affect current obligations.
- Confirmation requires at least one active, included detail. A configured fee obligation discounted to zero may be confirmed; absence of included fee details is not equivalent to zero payable.
- Gross is the sum of `originalAmount` over applicable details. Discount is the sum of detail `discountAmount` over applicable details. Net is the sum of payable amounts over applicable details.
- Paid derives from successful payment transactions, adjusted for full reversals. Due is net minus paid.
- Payment activity blocks DRAFT fee or schedule changes. Evidence includes payment transactions, installment allocations, reversal events, nonzero detail `amountPaid`, and nonzero header `totalPaidAmount`. Detailed payment/reversal mutation behavior is owned by M2.6.
- Positive-net admissions require an installment schedule reconciled to net before payment. Manual schedules contain positive-value rows. Under existing behavior, the final installment absorbs the rounding remainder.
- Zero-net confirmation creates no schedule and no installment rows. A zero-value installment row is not used to represent a configured obligation fully discounted to zero.
- Schedule status is derived, not persisted. Values are `NOT_CONFIGURED`, `MISSING_REQUIRED`, `NOT_REQUIRED_ZERO_NET`, `CONFIGURED`, `CONFIRMED`, and `INCONSISTENT`.
- GET keeps a missing schedule inspectable; absence alone does not turn retrieval into a conflict.

## 5. Data and persistence decisions

- `FeePaymentDetails.totalAmountToBePaid` is canonical payable; `finalAmount` is its compatibility mirror.
- Header gross, discount, net, paid, and due are projections that must reconcile with applicable detail values and successful payment transactions/reversals.
- Schedule status is computed from admission/header net, schedule existence, schedule confirmation state, and reconciliation. Exact precedence when multiple status conditions apply is **Not specified in the accepted design**.
- The equations and sources for financial totals are specified above. Exact header persistence timing for each DRAFT edit is **Not specified in the accepted design**.

## 6. API contracts

- Existing confirmation route remains `POST /admission/:id/confirmed`.
- Schedule GET must report a missing schedule as inspectable state. Exact response field names and the status-field name are **Not specified in the accepted design**; use the six status values listed above without persisting the derived status.
- Payment requests with zero outstanding balance return `NO_OUTSTANDING_BALANCE`; zero-value payment transactions are never created.
- Exact schedule response schema and schedule error payloads are **Not specified in the accepted design**.

## 7. Validation and error behavior

- Reject confirmation when there are no active, included details, when a preserved concession requires review, or when included financial snapshot values are inconsistent.
- Permit a valid included detail with payable zero, including when all included payable values sum to zero.
- Positive-net schedule must reconcile to header net; inconsistent schedule state is represented by derived status `INCONSISTENT`.
- Stable confirmation error codes are:
  - `NO_INCLUDED_FEE_DETAILS` when confirmation has no active, included fee details.
  - `DISCOUNT_REVIEW_REQUIRED` when an included detail has a preserved concession awaiting explicit review.
  - `FINANCIAL_SNAPSHOT_INCONSISTENT` when the financial snapshot fails accepted consistency checks.
- Exact response payload fields and schedule-status precedence are **Not specified in the accepted design**. No schedule-specific error code is established here.

## 8. Backward compatibility

- Preserve existing confirmed obligations and historical financial values; do not automatically rewrite historical financial values.
- Existing admissions without a schedule remain retrievable. A positive-net admission with no schedule is represented as `MISSING_REQUIRED`; a zero-net admission without a schedule is `NOT_REQUIRED_ZERO_NET`.
- Existing clients that assume every admission has a schedule require compatibility handling. Exact rollout sequence and response fallback are **Not specified in the accepted design**.

## 9. Acceptance criteria

- Applicable-detail equations reconcile gross, discount, net, paid, and due.
- Confirmation distinguishes zero-net configured obligations from no included details.
- Zero-net confirmation creates no schedule or installment rows.
- Positive-net schedule totals reconcile; manual rows are positive and the final row absorbs the rounding remainder under existing behavior.
- Schedule GET exposes missing or not-required state without converting missing schedule into a retrieval conflict.
- DRAFT fee/schedule edits are blocked when any specified payment-activity evidence exists.

## 10. Explicit exclusions and unresolved items

- Payment allocation, attribution, reversal mechanics, and their API details are M2.6 scope.
- Exact API response payload fields, schedule-status precedence, and the DRAFT schedule regeneration algorithm are **Not specified in the accepted design**.
- No implementation, migration, test, build, API, server, or database work is recorded here.
