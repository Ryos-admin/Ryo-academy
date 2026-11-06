# Fee Structure Master and Fee Components — M2.1 Technical Design

## 1. Executive Summary

The current model has `FeeStructure` related to academic year, program, class, components, and payment headers. It has no `Shift` field or Shift relation. The `Program` model has schedule fields (`daysOfWeek`, `startTime`, `endTime`) but the inspected source does not define those fields as a shift identity. Admission creation also has no shift identifier. A canonical Shift relationship therefore cannot safely be inferred; this is the main approval blocker for finalizing the master identity and admission lookup contract.

Recommended design: retain `FeeStructure` and `FeeComponent`; add initial components through the master create request, assign their parent ID on the backend, compute and persist master total with decimal arithmetic inside one transaction, require at least one valid component, and return the master with all components. Keep standalone component creation only as a separately authorized add-component operation that validates the active master and updates its total atomically. It must not accept a client-supplied master association for nested rows or a trusted total.

Current uniqueness is `(academicYearId, programId, classId)`. If Shift is confirmed as a distinct master dimension, proposed key is `(academicYearId, programId, shiftId, classId)`. Existing master rows would need a reviewed backfill before applying that constraint. Do not create a Shift model or map Shift to Program until the domain owner confirms the relationship.

## 2. Scope and Restrictions

Design only: Fee Structure Master and Fee Components, shift/uniqueness, total calculation, atomic create, existing-data compatibility, and backend/frontend contracts. Admission fee assignment, discount behavior, academic-year-start enforcement, schedules, payment, and reversal are dependencies for later M2 subtasks, not designed here.

No source, schema, migration, tests, database, build, or server were modified or run. This document is the only created file. Existing workspace modifications were preserved.

## 3. Existing Architecture and Source Evidence

Repository-root-relative evidence:

- `ryo-academy-be/prisma/models/admission_fees/fee-structure.prisma:1–23`: master fields and relations; unique key is academic year/program/class; no shift field.
- `ryo-academy-be/prisma/models/admission_fees/fee-component.prisma:1–20`: component fields, defaults (`discountApplicable=false`, `isMandatory=true`), parent relation, exact unique `(feeStructureId,name)`. The persisted/API name is `discountApplicable`; approved V0 spells the required boolean `isDiscountApplicable`, so the public field mapping needs an explicit decision.
- `ryo-academy-be/prisma/models/academic/program.prisma:11–39`: Program belongs to AcademicYear, has classes, `daysOfWeek`, `startTime`, and `endTime`; no explicit Shift model/relation in inspected academic model set.
- `ryo-academy-be/prisma/models/academic/class.prisma:1–28`: Class belongs to Program; uniqueness by program/name.
- `ryo-academy-be/prisma/models/academic/academic-year.prisma:1–29`: AcademicYear owns programs and fee structures.
- `ryo-academy-be/src/admission/fee-structure/fee-structure.service.ts:12–52`: create is transactional and conditionally creates nested components; persists caller total; defaults missing component flags; returns master with components.
- `ryo-academy-be/src/admission/fee-structure/dto/fee-structure.dto.ts:5–101`: nested component array is optional; booleans optional; total required positive; no minimum component count.
- `ryo-academy-be/src/admission/fee-component/fee-component.service.ts:10–49,51–84`: standalone create checks active parent and exact duplicate, then creates a child; update modifies amount/metadata independently and does not recalculate master total.
- `ryo-academy-be/src/admission/fee-component/dto/create-fee-component.dto.ts:4–58`: standalone request accepts caller master ID; booleans are not marked optional with `@IsOptional`, but TypeScript declarations are optional and service defaults missing values.
- `ryo-academy-be/src/admission/fee-structure/fee-structure.controller.ts:12–63`; `fee-component.controller.ts:11–61`: current endpoints and permissions.
- `ryo-academy-be/src/admission/admission-fee-log/admission.repository.ts:12–27,65–78`: admission fee lookup uses year/program/class; no shift is supplied.
- `ryo-academy-fe/src/pages/fee-pages.tsx:16,57–105`: form has program selector labeled “Programme / shift”, separate total input, no inline components.
- `ryo-academy-fe/src/lib/fees-api.ts:5–96`: frontend types currently require total on create and allow optional nested flags; API methods match current routes.
- `ryo-academy-be/prisma/migrations/20260823112133_admission_fee_mgmt/migration.sql:146`: exact unique component index exists in migration history.
- `fee-structure-admission-fee-m1-audit-consolidation.md`: accepted M1 baseline; this design uses it rather than repeating the audit.

Source findings are not deployed database verification. Database precision, existing record distributions, and constraints in a live environment remain unverified.

## 4. Proposed Fee Structure Master Model

Retain the existing aggregate and relations. Conceptual model:

```text
AcademicYear ─┐
Program ───────┼── FeeStructure ──< FeeComponent
Shift ────────┤        │
Class ────────┘        └── FeePaymentHeader (historical financial association)
```

`Shift` is conditional on resolving the existing-domain question in Section 5. If approved as a distinct entity, master stores a required `shiftId` relation for new masters; existing records need a deliberate backfill/legacy representation before making it non-null. Do not change existing payment-header/component snapshots as part of this design.

Master create request should not contain `totalAmount`; backend derives it. Master read/create responses include authoritative `totalAmount` as a decimal-safe serialized value and components. Update metadata excludes total and component collection; use the add-component operation to add rows. Whether other master metadata remains editable is subject to M2.5's academic-year restriction design.

## 5. Shift Relationship and Uniqueness Design

### Findings

No standalone Shift model or relation was found in the inspected academic Prisma model set. Program has time/day fields, but no source evidence says these fields define a shift. Frontend academic pages label Program as “Program / Shift” and use `programId` for that selector (`ryo-academy-fe/src/pages/academic-pages.tsx:139,215,1589–1604`); that is the current UI representation, not evidence of a distinct Shift relation. Admission contains year/program/class/section only, and its form/API payload lacks shift. Section is scoped to class, not a shift. The current unique key prevents a second master for the same year/program/class, so distinct shifts for that same tuple cannot be represented as separate masters. Do not equate program with shift without domain approval.

### Recommendation and approval

**Unresolved — requires domain-owner approval:** identify whether Shift is an existing concept outside these inspected models, a property of Program, or a separate entity. If distinct, identify its ownership/cardinality (for example, academic-year/program/class scope) and add it consistently to admission placement and fee lookup. Until resolved, do not finalize schema or uniqueness migration.

### Uniqueness

- Existing key: `(academicYearId, programId, classId)` (`fee-structure.prisma:21`).
- Proposed key if Shift is independently represented: `(academicYearId, programId, shiftId, classId)`.
- Example: same year/program/class may have “Morning” and “Evening” masters with different components/totals; these remain unique because `shiftId` differs.
- Duplicate prevention: database composite unique constraint is authoritative; service translates Prisma P2002 to a conflict response. Request pre-check may improve messaging but cannot replace database protection against concurrent creates.
- Admission lookup must include the same shift key, and admission must carry/resolve a shift before a matching master can be chosen. This is a dependency on M2.2, not admission assignment design here.
- Backward compatibility: old masters have no shift. Do not assign a guessed shift. Backfill only from authoritative source data; otherwise obtain a reviewed “legacy/unspecified” mapping strategy. Existing uniqueness can collide with the new key only if records are expanded/split; before adding the new key, inventory duplicate tuples and classify each. Preserve historical payment associations.

## 6. Fee Component Model and Validation

### Nested master creation

Request component entries contain `name`, `amount`, explicit `isDiscountApplicable`, explicit `isMandatory`, and optional `description`. They do not contain `feeStructureId`; backend assigns the new parent ID. Master create requires an array with at least one entry.

Validation:

- Missing array, empty array, or non-array: DTO rejects.
- Missing/blank name: DTO rejects non-string and trimmed-empty name. Whether to trim for storage or duplicate checks requires the case/whitespace policy decision; reject all-whitespace without silently normalizing otherwise.
- Amount: decimal string or JSON numeric representation bounded to the database-supported precision; must parse as finite decimal and be `> 0`. Reject zero, negative, NaN/infinity, malformed, and excess precision instead of rounding silently.
- Flags: both required and must be actual booleans; no defaults for V0 create. Reject omitted/null/string values.
- Description: optional; if supplied, string only. Empty string may be treated as equivalent to absent at API boundary; no minimum length is required by V0.
- Duplicate names: database composite key remains exact-string enforcement. Add an in-request duplicate check so conflicts return a controlled validation error; keep database unique constraint for concurrency. Case/whitespace normalization remains unresolved and must not be added silently.

DTO validation provides clear trust-boundary errors, but service must repeat business invariants before persistence where omission/defaulting or internal callers could bypass DTO pipes. Database constraints enforce referential integrity and exact uniqueness. A database check for positive amount/nonempty name may be considered if consistent with existing migration conventions, but is not required to redesign here; application validation remains required.

### Standalone add-component operation

Keep the existing standalone endpoint for adding a component to an existing master, subject to a service-level active-parent check, explicit flags, positive amount, exact uniqueness, and an atomic total update. Client supplies the parent master ID for this operation because it is an explicit child addition; nested master creation does not. It must not be usable to edit a component already referenced by historical admissions if that would mutate an existing snapshot; snapshot immutability and post-year-start restrictions are handled in M2.2/M2.5.

Update component behavior must not silently leave total stale. Until M2.5 defines edit policy, safest M2.1 contract is not to expose an amount-changing update as part of master creation design. If an existing update route is retained, it must be coordinated with total recomputation and future restriction policy before implementation.

## 7. Master Total Calculation and Consistency

- Calculate on the backend from submitted component decimal amounts before persistence: `SUM(amount)`.
- Persist `FeeStructure.totalAmount` as a derived snapshot for efficient reads and compatibility with existing consumers; never accept it as trusted create input.
- Use Prisma Decimal (or the repository's existing decimal type) for parse, sum, and persistence. Avoid JS `number` arithmetic as authority.
- Align amount precision/scale with the existing `Decimal` columns after inspecting generated database type and migration convention during implementation. Reject values that cannot be represented exactly; do not silently round component input.
- Return the persisted derived total in create/read responses. Frontend may preview the sum, but backend response is authoritative.
- Every permitted add operation must transactionally add component and update total to the sum of active components. Do not permit independent amount edits that leave total inconsistent. Component deactivation/removal semantics and the academic-year rule must be finalized with M2.5; if deactivation is later allowed, total must follow an explicit active-component policy.
- For existing masters, compare stored total to active component sum. Do not overwrite automatically until classified; payment headers and admission snapshots may rely on previous values.

## 8. Atomic Creation and Transaction Design

Recommended transaction boundary is one database transaction containing:

1. Validate parent references and any applicable academic-year/program/class/shift relationship either before the transaction for static reads plus recheck within it, or within it for a consistent snapshot.
2. Validate request-level component values and duplicate names before writes.
3. Create the master with computed total.
4. Create all components with generated master ID and explicit flags.
5. Retrieve the saved master with components and return it.

Any failure at steps 3–5 rolls back both master and components. The composite database unique constraint handles cross-request races; catch P2002 and translate to a conflict with safe public detail. Keep all writes and final response retrieval in the same transaction. Pure DTO parsing and request-local duplicate checks may run before it, but relationship/active-state assumptions that can race must be protected by transaction isolation/constraints or rechecked.

The existing service already wraps master and optional component creation in `$transaction` (`fee-structure.service.ts:17–44`); proposed change tightens the request contract and moves total derivation into that aggregate operation. No claim about runtime rollback is made here.

## 9. Proposed Backend API Contracts

Examples use JSON numeric amounts only illustratively; implementation should accept/serialize according to the chosen decimal transport convention. If JSON numbers are retained, backend must parse to Decimal without binary floating-point summation. A decimal string transport is safer for exactness; requires approval because current FE types use number/string amounts.

### 9.1 Create master with multiple components

`POST /fee-structure-master`

```json
{
  "name": "Standard Fees",
  "description": "Annual fees",
  "academicYearId": "year-id",
  "programId": "program-id",
  "shiftId": "shift-id",
  "classId": "class-id",
  "feeComponents": [
    {
      "name": "Tuition",
      "amount": "50000.00",
      "isDiscountApplicable": true,
      "isMandatory": true
    },
    {
      "name": "Library",
      "description": "Books and access",
      "amount": "2500.00",
      "isDiscountApplicable": false,
      "isMandatory": false
    }
  ]
}
```

No `totalAmount` or nested `feeStructureId` is accepted. `shiftId` is conditional on approval of a Shift model/relationship; it is shown to expose the unresolved contract dependency.

Example response:

```json
{
  "id": "master-id",
  "name": "Standard Fees",
  "description": "Annual fees",
  "academicYearId": "year-id",
  "programId": "program-id",
  "shiftId": "shift-id",
  "classId": "class-id",
  "totalAmount": "52500.00",
  "feeComponents": [
    {
      "id": "component-id-1",
      "name": "Tuition",
      "description": null,
      "amount": "50000.00",
      "isDiscountApplicable": true,
      "isMandatory": true,
      "feeStructureId": "master-id"
    },
    {
      "id": "component-id-2",
      "name": "Library",
      "description": "Books and access",
      "amount": "2500.00",
      "isDiscountApplicable": false,
      "isMandatory": false,
      "feeStructureId": "master-id"
    }
  ]
}
```

### 9.2 Retrieve master with components

`GET /fee-structure-master/:id` returns the same authoritative master fields, total, and active components. Include Shift relation once its meaning is approved. Decide whether inactive component history is exposed separately; ordinary master detail should not imply inactive entries are currently applicable.

### 9.3 Update permitted master metadata

`PATCH /fee-structure-master/:id`

```json
{ "name": "Standard Fees 2027", "description": "Updated label" }
```

No total, academic scope, shift, or component list in this contract. Actual permitted fields must obey M2.5 restriction design. Response returns recalculated/persisted total and components; metadata update cannot alter total.

### 9.4 Add component to existing master

Keep `POST /fee-structure-child` as an explicit add operation unless later API review chooses a nested route:

```json
{
  "feeStructureId": "master-id",
  "name": "Transport",
  "amount": "4000.00",
  "isDiscountApplicable": false,
  "isMandatory": false,
  "description": "Optional bus service"
}
```

Backend checks the parent is active, assigns the relation, and in one transaction creates the component and updates master total. Response should include the created component and authoritative updated total, either as a compound response or by returning the updated master; choose one stable shape before frontend implementation. Do not trust a total in the request.

## 10. Proposed Frontend Workflow

1. User enters master identity fields (year, program, approved Shift representation, class, name, description).
2. Fee Components section starts with one row; user can add/remove rows but cannot submit zero rows.
3. Each row requires name, positive amount, explicit discount-applicable and mandatory selections; description can be blank.
4. Client displays a preview sum using decimal-safe representation if available, but omits total from request.
5. Submit one master create request with nested components. Show validation/conflict response at relevant rows; on success use server-returned total/components and navigate to detail.
6. Existing master detail may expose “Add component” as a separate operation. It uses the standalone endpoint, updates server total atomically, and refreshes master/detail queries.
7. Do not let master edit form alter total. Keep academic-year edit gating unresolved for M2.5.

The program/class selectors remain dependent on current academic APIs; adding Shift requires a corresponding source/lookup and must not be represented by relabeling Program.

## 11. Existing Data Compatibility and Migration Strategy

No data inventory was performed. Proposed staged approach, no execution:

1. **Preflight inventory:** report masters with no active components; compare stored total to active component sum; identify inactive/deleted components, exact duplicate conflicts if key changes, and missing/ambiguous Shift attribution. Record counts and stable IDs in a controlled migration plan without exporting sensitive data.
2. **Shift decision/backfill:** do not guess. Populate only from an authoritative mapping. If some historical rows cannot be mapped, obtain approval for a nullable legacy state or explicit legacy Shift record; do not invent a model/value without approval. Apply non-null requirement only after complete backfill.
3. **Legacy empty masters:** preserve records. Determine whether to keep as inactive legacy rows, repair components from authoritative source, or block them from new admissions. Never synthesize financial components or delete masters automatically.
4. **Mismatched totals:** preserve prior total and snapshots. Establish a reconciliation report and determine whether new total applies only to new masters or a reviewed update to masters without financial references. Do not rewrite headers, admission details, payments, or financial logs.
5. **Existing defaulted booleans:** database values are present due defaults, but provenance of omitted values is unknowable. Keep values; do not reinterpret them during migration. New API requires explicit flags.
6. **Duplicate semantics:** exact duplicates already constrained. No case/whitespace normalization migration unless approved. If later approved, identify colliding groups and require a human resolution before adding a normalized unique index.
7. **Deploy compatibility:** stage additive schema/API support first, backfill and verify on approved disposable local QA data, then tighten nullability/constraints and switch frontend. Use expand/backfill/contract sequencing; preserve rollback path and historical financial relations. Actual migrations require separate approval and QA scope.

## 12. Design Decisions and Approval Required

| Topic | Existing behavior | Proposed design | Reason | Decision status |
|---|---|---|---|---|
| Aggregate ownership | FeeStructure stores total; components are children | Keep FeeStructure aggregate; nested create owns initial children | Fits current model and transaction | Recommended — ready for review |
| Shift relationship | No Shift model/relation found; Program has schedule fields; admission has no shift ID | Do not map Shift to Program; establish canonical relationship before schema/API changes | Prevents wrong uniqueness and fee assignment | **Requires user approval** |
| Master uniqueness | `(academicYearId, programId, classId)` | If Shift is independent: `(academicYearId, programId, shiftId, classId)` | Separates valid shift-specific masters | **Requires user approval** pending Shift decision |
| Component exact duplicates | DB unique `(feeStructureId,name)` and P2002 handling | Retain exact constraint and in-request duplicate validation | Database remains concurrency authority | Existing constraint — retain |
| Case/whitespace duplicates | No normalization | Do not normalize until semantics approved | Requirement leaves semantics unresolved | Unresolved — insufficient domain evidence |
| Required initial components | DTO/service allow zero; UI sends empty list | Require ≥1 nested component | Approved V0 | Recommended — ready for review |
| Component policy flags | DB defaults; request flags optional | Require explicit booleans for new API; retain stored values | Avoid silent policy defaults | Recommended — ready for review |
| Description | nullable in schema, UI currently requires text | Optional string | Matches approved V0 | Recommended — ready for review |
| Master total | Caller supplies and update may independently change | Server derives Decimal sum and persists; no client total | Prevent mismatch | Recommended — ready for review |
| Decimal transport/precision | Decimal DB; FE accepts number/string; current create DTO number | Prefer decimal string at boundary, exact Decimal summation; establish DB scale during implementation | Avoid JS floating point as source of truth | **Requires user approval** for wire format/scale |
| Standalone add component | Existing POST; creates row but does not update master total | Keep endpoint, make add+total update atomic; return updated total/master | Supports add use case without duplicated APIs | Recommended — ready for review |
| Component editing | PUT can change amount/flags without updating total | Do not finalize edit semantics here; coordinate with M2.5 and snapshot policy | Academic-year restriction pending | Requires M2.5 design |
| Historical master backfill | Not inspected in database | Inventory and classify; preserve financial snapshots; no guessed Shift or automatic total rewrite | Avoid history damage | Recommended — requires migration plan approval |

## 13. Dependencies on M2.2–M2.7

- **M2.2 admission fee assignment:** needs approved Shift identity and uniqueness key because admission lookup currently lacks shift; consumes the new master/component contract.
- **M2.3 discount design:** consumes component `isDiscountApplicable` and must use the same decimal amount precision; does not change master gross total.
- **M2.4 financial totals:** must consume authoritative master/component amounts and define how admission snapshots are frozen.
- **M2.5 academic-year restriction:** decides whether metadata, component edits/additions, and admission assignments are add-only or frozen after start; gates standalone update route.
- **M2.6 schedules/payments:** use admission header totals derived downstream; must not use master total as substitute for selected admission obligation.
- **M2.7 API integration/verification:** needs final response decimal encoding, permissions, error responses, migration sequencing, and frontend cache invalidation contracts.

## 14. Risks and Open Questions

1. **Shift domain is not established:** blocking approval for `shiftId`, uniqueness key, and admission master lookup. Which existing product concept represents Shift, and can it be attached to Program/Class/AcademicYear?
2. **Decimal API convention:** confirm whether amount fields become decimal strings or retain JSON numbers with strict server-side conversion; inspect actual DB scale during implementation planning.
3. **Legacy rows:** no DB inventory; unknown counts of empty masters, mismatched totals, and missing Shift attribution.
4. **Standalone component operation:** should it be retained as `POST /fee-structure-child` or replaced by `POST /fee-structure-master/:id/components`? Both can implement same semantics; current route can remain with less caller churn.
5. **Exact-name policy:** case/whitespace normalization remains unresolved and is deliberately not chosen here.
6. **Component update/delete and totals:** M2.5 and snapshot rules must determine if amount/flags can change; any allowed change needs atomic total maintenance and protection for historical obligations.

## 15. Explicit Out-of-Scope Items

- Admission fee assignment selection, default selection, optional deselection/re-addition (M2.2).
- Discount formulas and payable input (M2.3).
- Cross-module financial totals and payment invariants beyond master total (M2.4/M2.6).
- Academic-year-start restriction scope or implementation (M2.5).
- Payment, reversal, installment, and withdrawal design.
- Any source/schema/migration implementation, data backfill execution, test/build/server/database work.
- Timetable and unrelated product modules.
