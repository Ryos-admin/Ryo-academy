# Fee Structure & Admission Fee — M1 Audit Consolidation

## 1. Executive Summary

M1.1–M1.8 establish that the current code has working source-level building blocks for fee masters/components, automatic admission fee snapshots, concessions, confirmation, payment collection, schedules, and reversals. The approved V0 workflow is not integrated end to end. The highest blockers are: (1) admission creation does not let the user select/configure components; (2) discount inputs are percentage/fixed values instead of payable amounts, and zero-net fees cannot confirm; (3) master total and component sum are not reconciled; (4) no frontend schedule or reversal integration exists; and (5) cancellation route permits transitions from any persisted admission status.

Cancellation contradiction is resolved: the CANCELLED branch of `AdmissionService.updateStatusById` does not check current status. M1.4's concern is correct; M1.8's claim of cancellation-state enforcement was inaccurate (it appears to have generalized confirmation checks to cancellation). Exact duplicate component names are prevented by an exact composite database unique constraint and the service translates Prisma P2002, but there is no case-folding or whitespace normalization.

**Completion:** M1.9 criteria are satisfied for source-level consolidation. No material contradiction remains unresolved. Runtime behavior and test outcomes remain unverified because execution was prohibited.

## 2. Audit Scope and Restrictions

Consolidated the supplied M1.1–M1.8 findings and inspected only source points needed to reconcile cancellation and duplicate-name evidence, plus narrowly related totals/schema dependencies. No implementation, tests, builds, servers, database, migrations, seeds, or fixtures were run. Existing workspace changes were present before this task; they were preserved. Only this report was created.

## 3. Source Evidence Reliability and Limitations

**Verified source facts** below are based on checked-in controller, DTO, service, Prisma model/migration, frontend adapter/form, and test source. **Approved requirements** are copied from this task's V0 requirements. **Recommendations** are sequencing/design proposals, not approved implementation contracts. **Unknown/runtime-unverified** items are identified explicitly. Source inspection cannot prove deployed schema state, actual HTTP serialization, active validation-pipe configuration, guard runtime behavior, or that tests pass.

Main evidence paths are relative to repository root; line numbers refer to the inspected current workspace snapshot:

- `ryo-academy-be/src/admission/admission-fee-log/admission.controller.ts`
- `ryo-academy-be/src/admission/admission-fee-log/admission.service.ts`
- `ryo-academy-be/src/admission/admission-fee-log/admission.service.spec.ts`
- `ryo-academy-be/src/admission/fee-component/fee-component.service.ts`
- `ryo-academy-be/prisma/models/admission_fees/fee-component.prisma`
- `ryo-academy-be/prisma/migrations/20260823112133_admission_fee_mgmt/migration.sql`
- `ryo-academy-be/src/admission/fee-structure/fee-structure.service.ts`
- `ryo-academy-be/src/admission/admission-fee-log/admission.repository.ts`
- `ryo-academy-be/src/admission/fee-concession/discount-calculator.ts`
- `ryo-academy-be/src/admission/installment/admission-installment-schedule.service.ts`
- `ryo-academy-fe/src/pages/fee-pages.tsx`
- `ryo-academy-fe/src/pages/admissions-students-pages.tsx`
- `ryo-academy-fe/src/lib/fees-api.ts`, `admissions-api.ts`, `concessions-api.ts`, `student-fees-api.ts`

## 4. Reconciliation of Earlier Audit Contradictions

### 4.1 Admission cancellation

- **Route:** `POST /admission/:id/cancelled`, controller `AdmissionController.admissionCancelled`, JWT and `PermissionsGuard`, `ADMISSION_UPDATE` (`admission.controller.ts:102–112`).
- **Invoked service:** `AdmissionService.updateStatusById(id, user, "CANCELLED")`.
- **Actual branch behavior:** service transaction locks and loads admission (`admission.service.ts:251–265`). It has a previous-status check only inside `if (status === "CONFIRMED")` (`:267–270`). For CANCELLED, it proceeds to update `admissionStatus: CANCELLED` and cancellation actor/time (`:430–437`) without checking current status.
- **Transitions by source:** DRAFT → CANCELLED is allowed. CONFIRMED → CANCELLED is also allowed by this route. CANCELLED → CANCELLED is allowed and overwrites cancellation metadata. No other persisted state exists in the Prisma enum (`admission.prisma:1–5`); unsupported requested target statuses are rejected (`service.ts:251–254`). Missing ID produces not found.
- **Tests:** searched admission service specs; they cover confirmation and confirmation rejection, but contain no cancellation tests. No cancellation behavior is established by tests. These are test-source observations, not test results.
- **Requirement comparison:** DRAFT cancellation conforms. Confirmed-admission ordinary cancellation and repeated cancellation violate approved V0. No separate confirmed-student withdrawal route was established in the scoped controller.
- **Earlier statement:** M1.4's report of no previous-status guard was accurate. M1.8's statement that cancellation state rules are enforced was inaccurate for the cancellation branch; its statement that confirmation is DRAFT-only was accurate.

### 4.2 Duplicate fee-component names

- Prisma model has `@@unique([feeStructureId, name])` (`fee-component.prisma:19`); initial fee-management migration creates unique index `FeeComponent_feeStructureId_name_key` on the same columns (`20260823112133_admission_fee_mgmt/migration.sql:146`).
- Create service performs an exact `(name, feeStructureId)` lookup and translates P2002 to conflict (`fee-component.service.ts:21–47`). Update catches P2002 as well (`:51–83`).
- This establishes exact-value uniqueness per master at the database level and a service-level error translation in source. The database constraint is case-sensitive under the shown standard PostgreSQL index and neither service nor schema normalizes case or whitespace. Thus `Tuition` vs `tuition`, or names differing by leading/trailing/duplicate whitespace, are not shown to be equivalent.
- Approved V0 says duplicate names are disallowed but does not define case/whitespace equivalence. Exact duplicates are **satisfied**; normalized duplicate semantics are an **unresolved M2 clarification**, not a proven defect. The earlier M1.8 statement that duplicate prevention was “not established” was incomplete because it missed the schema unique constraint and P2002 handling.

## 5. Approved V0 Requirements Matrix

| Requirement | Source status | Gap reference |
|---|---|---|
| Master includes name, year, program, shift, class, total, description | UI has name/year/program(class label includes “shift”)/class/total/description; no shift ID field in contracts | G-01 |
| Inline multiple components, at least one, required name/positive amount/explicit booleans, optional description | Backend nested DTO allows omitted component array/flags; form sends empty array; separate component form requires description | G-01, G-02 |
| Master total calculated from components; atomic master+components | Current master service transaction creates both if supplied, but stores caller total; frontend sends empty components and user-entered total | G-02 |
| Exact duplicate component names disallowed | Composite unique index and P2002 translation exist | Satisfied for exact strings; G-03 decision on normalized semantics |
| Admission requires fee config; all initially selected; optional may deselect/re-add; mandatory cannot deselect; deselect does not delete master | Backend requires one active matching master with active components and snapshots all active components. No assignment selection API/UI | G-04 |
| Payable input, backend derives D and percentage with decimal ROUND_HALF_UP; 0 ≤ P ≤ O; zero allowed | Current DTO/UI use percentage/fixed discount value; decimal HALF_UP is applied to percentage-derived discount amount. Zero discount value is rejected; header zero fails schedule confirmation | G-05, G-06 |
| Add-only behavior after year start | Master/component create and update/delete routes exist; no academic-year-start rule seen in scoped service paths | G-07; exact affected scope is M2 design decision |
| Confirmation requires complete valid fee configuration and confirmed config immutable | Confirmation finalizes headers/details and freezes schedules; confirmed fee-header changes blocked in admission update. Auto snapshot rather than chosen selection; zero net fails schedule confirmation | G-04, G-06 |
| DRAFT can cancel; CONFIRMED cannot ordinary-cancel; CANCELLED cannot repeat-cancel | DRAFT allowed; service does not guard other prior states in cancellation branch | G-08 |
| Totals align across master, details, header, schedule | Header creation uses master total; detail rows use component amounts. Confirmation recalculates gross/net from detail rows. Schedules reconcile to header net | G-02, G-09 |
| Payment does not exceed outstanding; records/reversals preserve history | Backend source contains payment balance checks and reversal workflow; frontend payment omits header selector and has no reversal adapter/UI | G-10 |

## 6. Comprehensive Gap Register

Severity counts: **Critical 4, High 5, Medium 1, Low 0, Unresolved decision 2.** IDs G-01–G-10 are gaps; U-01–U-02 are unresolved design decisions.

| ID / title | Requirement and verified current behavior | Evidence | Class / impact | Affected modules and dependency | Suggested milestone |
|---|---|---|---|---|---|
| **G-01 Master contract omits Shift** | V0 retains Shift; backend DTO/master model and frontend requests expose program/class but no shift identifier. UI labels program selector “Programme / shift,” but submits `programId`. | `ryo-academy-be/src/admission/fee-structure/dto/fee-structure.dto.ts:60–76`; `ryo-academy-fe/src/lib/fees-api.ts:18–33,60–68`; `ryo-academy-fe/src/pages/fee-pages.tsx:105` | **High** — required master dimension cannot be represented distinctly. | Fee master UI/API/schema and admission matching key. | M2 design, M3 schema/API/UI |
| **G-02 Master creation does not meet component/total contract** | UI submits user-entered total and `feeComponents: []`. Backend DTO makes list optional, does not require minimum size or explicit booleans; service can create master without components and does not calculate total. Service does wrap nested creation in transaction when rows are supplied. | `fee-pages.tsx:16,79–99`; `fee-structure.dto.ts:21–29,78–101`; `fee-structure.service.ts:17–44` | **Critical** — core workflow permits empty masters and total/component divergence. | Master, component DTO/service, transaction and response types. | M2 design, M3 |
| **G-03 Component creation contract mismatches optional description/flags** | V0 description optional and flags explicit. Separate form requires description length ≥5; backend DTO does not require description nonempty but permits missing flags and service defaults `discountApplicable=false`, `isMandatory=true`. | `fee-pages.tsx:109–147`; `create-fee-component.dto.ts:15–57`; `fee-component.service.ts:32–40` | **Medium** — UI rejects valid blank descriptions; API silently defaults omitted required policy fields. | Component UI/API/DTO/service. | M2, M3 |
| **G-04 Admission assignment is automatic, not user-configured** | UI sends empty `feePaymentHeaders`; backend ignores it for initial selection, looks up by year/program/class, requires one active master with active components, then snapshots every active component. No select/deselect/re-add assignment API. Mandatory flags are snapshotted but no selection validation path exists. | `admissions-students-pages.tsx:624–642`; `admission.repository.ts:12–27`; `admission.service.ts:82–149`; `admissions-api.ts:38–60` | **Critical** — user cannot establish approved admission obligations; master matching is implicit. | Admission forms, selection DTO/API, master lookup, snapshots, confirmation. | M2, M3–M4 |
| **G-05 Discount input/API is not payable-based** | UI and DTO use percentage/fixed discount amount; payable input and backend-derived percentage are absent. Frontend preview uses floating-point `Math.round`; backend decimal HALF_UP applies to percentage-derived discount amount, not derived percentage from payable. Current discount rules require value >0 and cap percentage/fixed amount. | `admissions-students-pages.tsx:1173–1203,1510–1575`; `create-admission-concession.dto.ts:5–29`; `discount-calculator.ts:24–87` | **Critical** — V0 discount business input and formulas are not implemented; source-of-truth differs. | Concession DTO/service/calculator, admission UI, totals/schedule/payment. | M2, M3–M4 |
| **G-06 Zero payable cannot pass confirmation/schedule** | A 100% discount can produce zero detail payable, but schedule confirmation rejects header `netAmount <= 0`; admission confirmation calls that schedule confirmation service. | `discount-calculator.ts:47–78`; `admission.service.ts:392–403`; `admission-installment-schedule.service.ts:840–849` | **Critical** — expressly approved zero-payable case cannot complete confirmation. | Discount, header, installment confirmation, admission lifecycle. | M2, M3–M4 |
| **G-07 Academic-year-start add-only restriction absent** | Master/component create, update, deactivate routes exist; scoped services show no academic-year-start restriction. Exact scope (master components, admission assignment, or both) is intentionally unresolved by approved brief. | `fee-structure.controller.ts:35–62`; `fee-component.controller.ts:18–46`; `fee-component.service.ts:51–83`; `fee-structure.service.ts:17–44` | **High** — existing fee configuration can be altered through paths where V0 says no edits after year start. | Academic year lifecycle, master/component APIs, admission assignment. | M2 settle scope, M3–M4 |
| **G-08 Cancellation accepts confirmed/repeated cancellation** | Controller calls common status method. CANCELLED branch updates status with no previous-status test. No cancellation tests found. | `admission.controller.ts:102–112`; `admission.service.ts:251–270,430–437`; `admission.service.spec.ts:286–295` (confirmation-only case); `admission.prisma:1–5` | **High** — violates explicit lifecycle rule and permits repeated status/metadata overwrite. | Admission lifecycle, UI controls, withdrawal boundary. | M2, M3 |
| **G-09 Financial totals can diverge across sources** | Header starts from master `totalAmount`; details snapshot component amounts. Confirmation later recomputes gross/net from details. No equality guard is shown at master create. Schedules enforce equality to header net, so can inherit the details-derived amount after confirmation. | `admission.service.ts:118–149,364–388`; `fee-structure.service.ts:17–44`; `admission-installment-schedule.service.ts:217–219,463–466` | **High** — displayed master total, initial header and finalized obligations can disagree. | Master total, assignment snapshot, confirmation, summary, schedules, payments. | M2, M3–M4 |
| **G-10 Frontend lacks complete financial APIs** | Payment request type/form omits optional `feePaymentHeaderId`, which backend requires when multiple active headers exist. No installment adapter/caller or reversal adapter/UI found, although backend routes exist. | `student-fees-api.ts:55–71`; `student.controller.ts:66–100`; `admission-installment-schedule.controller.ts:30–114`; no relevant adapter in `ryo-academy-fe/src/lib` | **High** — multi-header collection cannot target a header; installment and reversal backend capabilities cannot be used through inspected UI. | Student fees, installments, reversal, API contracts. | M2, M4–M5 |
| **U-01 Add-only restriction scope** | Approved rule states add-only after year starts but expressly leaves whether it applies to master components, admission assignments, or both unsettled. Existing update paths are broad; evidence does not resolve intended object scope. | Approved task §5.4; routes/services in G-07 | **Unresolved decision** — implementation could freeze the wrong records or permit forbidden edits. | Academic year, fee master, admission assignment. | M2 |
| **U-02 Duplicate name normalization semantics** | Unique key prevents exact strings. V0 does not define whether case or whitespace variants count as duplicate; source has no normalization. | `fee-component.prisma:19`; migration SQL line 146; `fee-component.service.ts:21–47,66–83` | **Unresolved decision** — exact duplicate requirement is met, but normalized equivalence cannot be inferred. | Component validation/schema and data migration if semantics change. | M2 |

## 7. Cross-Module Dependency and Conflict Analysis

1. **Master total vs component sum:** master creation stores caller total and components independently; admission header starts at master total while details come from components. Confirmation recomputes gross/net from details. Design must choose one canonical total source and define validation/reconciliation for old records.
2. **Admission snapshot vs selected components:** current admission creation resolves a matching master by year/program/class and snapshots every active component. No frontend selection payload is honored. Selection contract must precede confirmation and payment design.
3. **Mandatory/optional behavior:** `isMandatory` is stored on master and copied into details, but there is no assignment selection operation to enforce mandatory retention or optional re-addition. Component removal from master is soft deletion and guarded when payment detail references exist; this does not implement admission-level deselection.
4. **Discount vs payment/schedule calculations:** concession service calculates component final/payable, then recalculates header; confirmation finalizes details/header; schedules require exact sum equal to net header. M2 must specify payable as canonical input, derived discount/percentage precision, and when schedule becomes invalid after draft edits.
5. **Zero-payable details/header:** calculator can create a zero-payable component, but schedule confirmation rejects net header ≤0. M2 must define the zero-net representation (including whether no schedule is created) consistently with approved zero-payable rule.
6. **Confirmation vs configuration completeness:** current create requires a matching active master and components, and confirmation processes active headers/details. It cannot prove the user selected/confirmed the intended configuration because assignment is automatic. Confirmation must validate finalized selections and totals.
7. **Academic-year start vs edit paths:** master PATCH and component PUT/DELETE exist; no year-start guard appears in inspected paths. M2 must decide target objects and how year-start state is determined, then ensure all write paths share the rule.
8. **Draft schedules vs draft fee edits:** concession update changes header totals. Existing schedule source checks/reconciles against header net and draft edits have schedule-specific handling. M2 must define whether fee/discount changes are blocked when a schedule exists or atomically recalculate/replace it. Do not assume current source handles every path.
9. **Soft deletion vs snapshots/history:** component delete is soft deletion and refuses deletion when fee details reference it (`fee-component.service.ts:86–112`). Admission snapshots preserve names/amounts in details. Full historical/payment preservation must be confirmed against approved fixtures/runtime; source alone is not proof of operational history behavior.
10. **Frontend payload vs backend DTO/service:** fee master UI sends empty component list; admission UI sends empty generic header details; backend derives admission snapshot rather than using those details. DTO types are looser/different from actual behavior. M2 must publish a single explicit request/response contract per workflow.
11. **Multiple active payment headers:** backend payment DTO allows header ID and says it is required when multiple active headers exist; frontend omits it. Admission assignment currently creates one header from the matched master, but backend payment service supports multi-header scenarios. Define supported V0 cardinality and wire explicit selection if more than one can occur.
12. **Reversal coverage:** backend exposes full reversal with reason/idempotency and history records; inspected frontend has no helper/UI. Payment/reversal UX, refresh semantics, and schedule allocation restoration need a coordinated API contract. Runtime/history behavior unverified.

## 8. Unresolved Business and Technical Decisions

Settled approved requirements are not reopened. Remaining items:

- **U-01 (business scope clarification):** exactly which objects are frozen by add-only-after-year-start: master component definitions, admission-specific selections, or both. Clarify before M3 design is finalized.
- **U-02 (business semantics):** whether duplicate names are compared byte-for-byte/case-sensitive or after case/whitespace normalization. Current exact unique constraint meets only exact-string interpretation.
- **Technical design inputs (not product ambiguities):** canonical source for master total; zero-net schedule representation; schedule behavior after draft fee changes; and supported active-header cardinality. M2 should decide these based on approved V0 and current data compatibility.

No unresolved contradiction remains in the targeted cancellation or duplicate-name evidence.

## 9. M2 Design Agenda

- **Fee Structure Master and component design:** explicit shift representation; nested component DTO; minimum one row; explicit booleans; optional description; positive amount; duplicate semantics; total derivation; transaction and response shape; treatment of existing masters where total differs from components.
- **Admission fee configuration design:** identify/select applicable master; initial all-selected defaults; optional deselect/re-add without master deletion; mandatory enforcement; snapshot payload and lifecycle; validation before create/confirm.
- **Discount and financial calculation design:** payable input; decimal formula `D=O-P`, HALF_UP percentage rounding; validation range; zero payable; persistence fields and recalculation timing; compatibility for existing percentage/fixed concessions.
- **Admission lifecycle and cancellation design:** exact state transition table, including confirmed withdrawal separation; reject CONFIRMED→CANCELLED and CANCELLED→CANCELLED atomically; test matrix.
- **Academic-year restriction design:** resolve U-01; establish authoritative year-start signal and apply consistently across master/component/assignment endpoints.
- **Payment and installment integration design:** zero-net behavior; draft schedule reaction to changed payable; header cardinality and explicit selection; payment cap, idempotency, full reversal and allocation-history contract.
- **Frontend/backend API contract design:** typed nested request/response DTOs, methods/permissions, validation/error shape; remove stale admission-delete helper; include installment and reversal adapters if in V0 scope.
- **Data migration/backward compatibility:** preserve existing snapshots/payments; handle totals not matching detail sums; migrate old concession values without losing audit history; evaluate uniqueness normalization only after U-02 decision; avoid destructive rewrites.

## 10. Recommended M3–M6 Implementation Sequence

Recommendation only; no work is started.

1. **M3 — Contract and schema foundation:** settle M2 choices, migrations/backfill plan, DTOs/validation, transaction boundaries, master total and component contracts, admission selection payload, lifecycle transition rules. Add focused unit/contract tests alongside implementation.
2. **M4 — Core fee workflow:** implement atomic master+components with calculated total; admission component selection/snapshot; payable-based discount engine; confirmation validation; zero-payable-safe totals/schedule handling; academic-year restriction. Keep financial invariants in backend services.
3. **M5 — Frontend integration:** migrate fee-master and admission configuration forms, discount payable UI, confirmation/cancel controls and precise error handling to the approved API contracts; add explicit header selection and schedule management UI where required.
4. **M6 — Financial integration and controlled verification:** payment/reversal UI contract, idempotency/reversal flows, schedule-change and historical compatibility checks; execute only against approved disposable local QA database with authorized fixtures and guaranteed cleanup. Validate migration and end-to-end workflows without using shared/remote data.

Dependencies: M3 contract/schema decisions precede API/UI work; M4 backend invariants precede M5 callers; M6 financial verification depends on stable migration, fee snapshot, discount, and schedule contracts.

## 11. M1 Completion Assessment

**M1.1–M1.9 consolidation complete.** Cancellation contradiction is reconciled from the exact controller/service branch and absence of cancellation tests. Duplicate-name contradiction is reconciled from Prisma model, migration, service create/update handling. Approved V0 requirements are mapped to source behavior, gaps are classified, dependencies are documented, and the remaining decisions are explicit. M2 can begin technical design.

Limitations: no tests or runtime checks were executed; test-source presence does not mean passing. Existing migrations/schema were inspected as repository artifacts only; no database state was checked. Earlier M1 audit claims outside the targeted contradictions are consolidated from their supplied reports and were not all re-audited.

## 12. Explicit Out-of-Scope Items

- Implementation, refactoring, tests, builds, server execution, HTTP/browser QA.
- Database access, migration/seed/fixture execution, production/shared database access.
- M2 design approval or implementation; no task creation.
- General UI redesign or unrelated modules (including timetable).
- Claims of runtime authorization, tenant isolation, rollback, idempotency, payment-history preservation, or test success.
