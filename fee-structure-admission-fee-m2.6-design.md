# M2.6 — Payment Integration and API Contracts

## 1. Title and milestone

Ryo Academy ERP fee configuration revamp — M2.6 design record.

## 2. Status

**Owner-approved design; implementation not started.** This record preserves the M2.6 decisions supplied in the project conversation. It does not claim that these rules are implemented or runtime-verified.

## 3. Purpose and scope

Define payment-to-detail attribution, full reversal behavior, monetary precision, idempotency, API compatibility, and historical payment behavior for the V0 admission-fee lifecycle.

## 4. Business rules

### Payment attribution and reversals

- Persist exact payment-to-detail attribution. Keep installment allocation separate from detail attribution.
- Support full reversals in arbitrary payment order using saved attribution. Never reconstruct attribution from current detail payment counters.
- Historical payments without exact attribution remain visible but cannot be safely reversed. Block reversal with `PAYMENT_DETAIL_ATTRIBUTION_UNAVAILABLE`.
- Validate all relevant state before mutation. A failed validation must not leave partial reversal mutation.
- Reversal is full-payment only. Preserve accepted reversal idempotency scope and response behavior.

### Monetary precision

- New V0 monetary inputs and obligation values have at most two fractional digits. Reject excess precision before persistence; do not silently round inputs.
- Use Decimal arithmetic and decimal-string API values. Existing `DECIMAL(65,30)` fields remain unchanged; historical values are not rewritten.
- Widen the following nine payment-lifecycle fields from `DECIMAL(12,2)` to `DECIMAL(65,2)` in the future schema design:

| Model | Field |
|---|---|
| `AdmissionInstallmentSchedule` | `totalAmount` |
| `AdmissionInstallment` | `amount` |
| `AdmissionInstallment` | `offsetAmount` |
| `InstallmentTemplateItem` | `fixedAmount` |
| `FeePaymentInstallmentAllocation` | `allocatedAmount` |
| `FeePaymentInstallmentAllocation` | `reversedAmount` |
| `InstallmentLineageTransferEdge` | `amount` |
| `PaymentReversalEvent` | `reversalAmount` |
| `InstallmentAllocationReversalEvent` | `amount` |

- Proposed `FeePaymentDetailAttribution.amount` uses `DECIMAL(65,2)`.
- Expense fields are excluded from the widening scope.

### Idempotency and payment meaning

- Every new payment requires a client-generated stable idempotency key.
- A matching retry returns the original payment transaction result. Reusing a key for a different payment intent conflicts.
- A persisted `FeePayment` represents successfully received and recorded money only.
- V0 adds no gateway pending/failed states, payment method, or receipt/reference fields.

## 5. Data and persistence decisions

- Detail attribution records the exact amount of each payment applied to each fee detail; installment allocation records remain distinct and continue to represent schedule allocation.
- A payment may need multiple detail attribution rows; the exact uniqueness/index/FK declaration and same-header composite-key shape are **Not specified in the accepted design supplied here**. Do not infer or add them from this record.
- No automatic attribution backfill is performed. Existing payments without attribution remain visible and cannot be reversed safely.
- Preserve the nine-field widening inventory above and existing wide decimal columns. No unrelated expense field is included.

## 6. API contracts

- Preserve accepted M2.2 routes: `POST /admission` with selected component IDs; `PATCH /admission/:id/fee-configuration`; `GET /admission/:id/fee-configuration`; and `GET /admission/fee-configuration/applicable`.
- Preserve accepted M2.3 concession routes: `POST /admission/:admissionId/concessions`, `PATCH /admission/:admissionId/concessions/:concessionId`, `DELETE /admission/:admissionId/concessions/:concessionId`, `GET /admission/:id/concessions`, and existing `POST /admission/:id/confirmed`.
- Preserve the existing payment and fee-summary routes `POST /students/:id/fees/payments` and `GET /students/:id/fees`, and the existing reversal route `POST /students/:id/fees/payments/:paymentId/reverse`. Do not introduce replacements.
- New payment request includes the mandatory idempotency key. Exact field name, header-versus-body placement, and payment route request shape are **Not specified in the accepted design supplied here**.
- Historical reversal without attribution returns `PAYMENT_DETAIL_ATTRIBUTION_UNAVAILABLE`. Existing reversal idempotency response behavior is retained.

## 7. Validation and error behavior

- Validate decimal input scale at service/API trust boundaries before persistence; reject more than two fractional digits. Use Decimal parsing/calculation and decimal-string transport.
- Validate payment intent against the persisted idempotency key: same intent returns the original transaction; different intent conflicts.
- Validate payment, saved detail attribution, installment allocation, reversal, and resulting aggregate state before mutation. Do not silently repair inconsistent state.
- Historical payment reversal without exact saved detail attribution is blocked with `PAYMENT_DETAIL_ATTRIBUTION_UNAVAILABLE`.
- Exact error code for idempotency-key intent conflict and other reconciliation failures is **Not specified in the accepted design**.

## 8. Backward compatibility

- Existing `DECIMAL(65,30)` fields and historical values remain unchanged.
- Widening preserves the range of the existing `(12,2)` columns while retaining two-decimal storage for the new target columns; deployed state and migration lock/rewrite cost are not asserted here.
- No historical attribution is fabricated or backfilled. Historical payments remain visible; unsafe reversals are blocked.
- Existing installment allocation/reversal history is not rewritten.
- Existing clients omitting an idempotency key cannot use the new-payment contract once mandatory enforcement is enabled. Deployment sequencing and the exact compatibility window are **Not specified in the accepted design**.

## 9. Acceptance criteria

- Payment-to-detail attribution is persisted exactly and separately from installment allocation.
- Full reversals work in arbitrary payment order from saved attribution and never infer attribution from mutable counters.
- Historical un-attributed payment reversal is blocked with the accepted stable error.
- New monetary inputs reject excess scale and use Decimal/string handling.
- Existing wide decimal fields and historical values remain untouched; exactly nine narrow lifecycle fields are targeted for widening; expense is excluded.
- Payment idempotency behavior and successful-payment-only persistence semantics are enforced.
- Reversal validates complete state before mutation and preserves its accepted idempotency response behavior.

## 10. Explicit exclusions and unresolved items

- Gateway integration, pending/failed states, payment method, and receipt/reference fields are excluded from V0.
- Exact idempotency-key wire field and header/body placement, attribution schema constraints, idempotency-conflict code, migration sequencing, and deployment compatibility window are **Not specified in the accepted design supplied here**.
- No implementation, migration, test, build, API, server, or database work is recorded here.
