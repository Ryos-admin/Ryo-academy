# M2.5 — Academic-Year Restrictions and Cancellation

## 1. Title and milestone

Ryo Academy ERP fee configuration revamp — M2.5 design record.

## 2. Status

**Owner-approved design; implementation not started.** This record preserves the M2.5 decisions supplied in the project conversation. It does not claim that these rules are implemented or runtime-verified.

## 3. Purpose and scope

Define academic-year fee-master mutation boundaries, admission snapshot behavior, and DRAFT cancellation rules. Confirmed-student withdrawal remains a separate business process.

## 4. Business rules

- All date boundaries use `Asia/Kolkata`.
- The academic-year start boundary is midnight on `startDate`. The add-only period runs from that boundary through `endDate` inclusive.
- Once the year starts, existing master metadata and existing component definitions are frozen. New components may be added during the academic-year period.
- After the year ends, all master and component changes are blocked.
- A fee structure is considered used if any `FeePaymentHeader` references its `feeStructureId`, regardless of admission status or active flags.
- A component added to a master later never appears automatically in an existing admission snapshot. Existing DRAFT admissions preserve their original snapshot and inclusion lifecycle.
- Ordinary academic-year updates cannot change `startDate` after that year has started.
- Cancellation is DRAFT-to-CANCELLED only. Repeated cancellation and CONFIRMED-to-CANCELLED are rejected. Confirmed withdrawal uses a separate flow.
- Financial activity or financial anomalies block DRAFT cancellation. Accepted financial-activity evidence includes payment transactions, installment allocations, reversal events, nonzero detail `amountPaid`, and nonzero header `totalPaidAmount`. Fee snapshots remain on a cancelled admission.
- Existing master rules remain: program is the existing `programId` dimension (no `shiftId`); uniqueness is `(academicYearId, programId, classId)`; master total is the sum of components; master creation requires at least one component; component amount is positive; duplicate component names are exact-string unique without case/whitespace normalization; standalone component addition updates master total atomically.

## 5. Data and persistence decisions

- Master component definitions and admission fee details are separate layers. Admission details are snapshots; master changes do not rewrite them.
- A later master component addition does not create a new obligation in existing admissions. Ordinary admission selection may only operate on that admission's original snapshot, consistent with the accepted M2.2 lifecycle.
- Used-master detection is based on existence of any referencing `FeePaymentHeader`, without filtering by admission status or active flags.
- Academic-year boundaries are interpreted in `Asia/Kolkata`; exact storage representation or conversion mechanism is **Not specified in the accepted design**.
- Cancellation retains fee snapshot rows; no financial snapshot is erased by cancellation.

## 6. API contracts

- Existing master/component APIs remain subject to the academic-year mutation guards; new route names are not introduced by this design.
- Ordinary academic-year update after year start must not change `startDate`.
- Ordinary cancellation supports only DRAFT-to-CANCELLED. CONFIRMED withdrawal is not routed through the cancellation operation.
- Exact route names, DTO field names for cancellation, and response bodies are **Not specified in the accepted design**.

## 7. Validation and error behavior

- Apply the academic-year start/end checks using the stated Asia/Kolkata boundaries.
- Reject edits to existing component definitions and master metadata after start; permit adding a new component only during the add-only period; reject all master/component changes after end.
- Reject changes to `startDate` through ordinary update once the year has started.
- Reject repeated cancellation and CONFIRMED-to-CANCELLED transitions.
- Block DRAFT cancellation when any accepted financial-activity evidence exists or when financial anomalies exist. The accepted activity indicators are payment transactions, installment allocations, reversal events, nonzero detail `amountPaid`, and nonzero header `totalPaidAmount`.
- Any additional anomaly classification beyond those indicators, stable error codes, and response semantics are **Not specified in the accepted design**.

## 8. Backward compatibility

- Existing admission snapshots remain unchanged when a master is edited or a component is added.
- Existing DRAFT admission inclusion remains attached to its original snapshot; later master additions do not expand it.
- Existing confirmed admissions cannot be ordinarily cancelled. Withdrawal remains a separate flow.
- No historical snapshot rewrite or financial cleanup is specified.

## 9. Acceptance criteria

- Academic-year boundaries consistently use `Asia/Kolkata`, including the inclusive end date.
- Existing component definitions and master metadata are immutable after year start, with only component addition permitted through year end.
- All changes are blocked after year end.
- Any referencing fee header makes the master used, regardless of status/active flags.
- Existing admissions never receive later master components.
- Cancellation is DRAFT-to-CANCELLED only and preserves fee snapshots; financial activity/anomalies block it.

## 10. Explicit exclusions and unresolved items

- Confirmed-student withdrawal implementation and contract are separate and are not defined here.
- Exact timezone conversion implementation, cancellation error codes, anomaly taxonomy, and API response contracts are **Not specified in the accepted design**.
- No implementation, migration, test, build, API, server, or database work is recorded here.
