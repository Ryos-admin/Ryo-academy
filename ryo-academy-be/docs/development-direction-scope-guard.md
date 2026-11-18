Ryo Academy ERP --- Development Direction & Scope Guard
Document type: Product-development baseline and scope-control
reference
Status: Agreed planning baseline; not an implementation
specification
Last updated: November 18, 2026
Current engineering checkpoint: PostgreSQL QA Harness V1.8
Purpose: This document records the agreed direction for the next
product-development work. Every agent, developer, or reviewer working
on these items must read it before planning or implementation. If a
proposed change conflicts with this document, stop and report the
conflict instead of silently changing the plan.

1. How to use this document
1. Read this document before starting work related to the next
   development items.
2. Treat decisions marked Agreed as constraints.
3. Treat items marked Open as unresolved. Do not invent decisions
   or implement assumptions.
4. Do not expand scope, redesign adjacent modules, or modify financial
   behavior unless explicitly authorized.
5. If existing code or documentation conflicts with this document,
   report the exact conflicting file/behavior, relevant section,
   impact, and smallest proposed resolution.
6. Do not edit this document during ordinary feature implementation.
   Propose amendments separately and wait for approval.
7. This document does not replace AGENTS.md, architecture
   documentation, financial-module rules, or other repository
   instructions. Follow all of them. If a conflict exists, stop and
   surface it for human resolution.
2. Agreed development backlog
The next product-development work consists of three feature areas. The
third area has two dependent parts.
Feature 1 --- Academic Year-wide Fee Revision
Agreed product direction
- Support a fee revision at the academic-year level.
- Include admissions that are already confirmed.
- Require an explicit confirmation step before applying the revision.
- Preserve existing payment history. Do not rewrite, delete, reverse,
  or recreate historical payment records merely to apply a fee
  revision.
- Keep existing financial integrity rules and audit history intact.
Open --- must be defined before implementation
- How revised fee obligations are calculated.
- How already-paid amounts are treated against revised obligations.
- How outstanding balances are adjusted.
- How concessions, discounts, GST, installment schedules, and
  snapshots interact.
- Whether the operation is all-or-nothing across the academic year.
- Preview, validation, audit-log, failure/rollback behavior.
- Permissions and confirmation UX.
Do not infer these rules. Conduct requirements discovery and document
decisions first.
Feature 2 --- Admissions Dashboard Status Sorting
Status: Complete, verified, and human code review approved.
Agreed product direction (Fulfilled)
- Add status-based sorting to the existing Admissions Dashboard.
- Keep finance logic untouched.
- This is an admissions-list/dashboard behavior change, not a
  financial workflow change.
Resolved implementation decisions
- Status priority: CONFIRMED (1) -> DRAFT (2) -> CANCELLED (3).
- Direction within status: Newest first (createdAt DESC).
- Defensive date handling: Valid timestamps precede invalid or missing timestamps.
- Tie-breaking: Strict non-null primary key id ASC for equal valid timestamps and paired invalid timestamps.
- Unknown status handling: Placed after known statuses (rank 99).
- Integration: Client-side sorting applied to filtered array without mutating React Query cache data.
- Scope maintained: Frontend-only change; zero backend, schema, migration, or financial changes.
Verification results
- 22/22 unit tests passed (admissions-api.test.tsx).
- 63/63 component tests passed (admission-fee-preview.test.tsx).
- Full frontend test suite: 360/360 tests passed across 21 files.
- TypeScript typecheck: Clean (exit code 0).
- Production build: Clean (Vite built 1863 modules in 8.20s).
Feature 3 --- School-wide Fee Management Dashboard
A new dashboard experience for viewing confirmed admissions belonging to
the school's configured academic year.
3.1 College Admin academic-year configuration
Agreed decisions
- The College Admin will configure the academic year used by the Fee
  Management Dashboard.
- The selection is school-wide, not user-specific.
- There is currently one College Admin per school.
- The design must remain school-based and must not depend on the
  identity or profile record of the College Admin.
- The College Admin profile-page change described for this purpose has
  not started.
- The selected academic year is intended to be persisted on the School
  record, with activeAcademicYearId as the proposed field name.
- This field name is proposed, not yet schema-approved.
- Selecting the school's dashboard academic year must not
  activate, close, or otherwise change academic-year lifecycle status.
3.2 Fee Management Dashboard
Agreed decisions
- The dashboard lists confirmed admissions only.
- The list is scoped to the academic year selected for the school.
- The selection is the same for all users in that school.
- Clicking a student/admission row navigates to the existing Admission
  Details page.
- Do not create a new admission-details workflow as part of this
  feature.
- Do not change payment APIs, payment history, financial calculations,
  or payment behavior as part of the dashboard.
Important implementation boundary

The dashboard experience is a frontend feature, but persisting a
school-wide selection requires checking existing backend/database
capabilities. If a new School column or backend read/update capability
is needed, that is a supporting persistence change and must be
explicitly included in the reviewed specification. Do not describe the
entire implementation as frontend-only if persistence requires
backend/schema work.
3.3 Dependency order
1. Audit the existing College Admin profile page and role/permission
   behavior.
2. Audit the School data model and existing school configuration APIs.
3. Audit Academic Year APIs and the current school/academic-year
   relationship.
4. Specify and implement school-wide academic-year selection and
   persistence.
5. Build the Fee Management Dashboard using that persisted selection.
6. Link each row to the existing Admission Details page.
These are dependencies within Feature 3, not permission to redesign
profile, school, or academic-year modules broadly.
3. Architecture and financial-integrity guardrails
- activeAcademicYearId is a proposed School-level setting, not a
  User-level preference.
- The school-wide dashboard selection is separate from Academic Year
  lifecycle status.
- Do not implicitly activate or close an Academic Year when selecting
  it for dashboard display.
- Do not modify historical payment records to implement a fee
  revision.
- Do not bypass production financial services with direct database
  writes.
- Do not weaken payment, allocation, reversal, audit, locking, or
  snapshot invariants.
- Do not change financial logic while implementing Admissions
  Dashboard sorting.
- Do not add payment mutations or financial calculations to the Fee
  Management Dashboard unless separately specified and approved.
- Reuse existing Admission Details navigation and existing data
  contracts where suitable; do not invent API contracts.
- Preserve tenant/school isolation and existing authorization
  boundaries.
- Preserve all pre-existing worktree changes. No broad reset, restore,
  cleanup, staging, or commit unless separately authorized.
4. Current engineering save point
The latest reported engineering milestone is PostgreSQL QA Harness
V1.8.

According to the supplied V1.8 report:
- The five previously repaired integration suites pass.
- The two payment-fixture suites were updated to use
  AdmissionPaymentService.createAdmissionPayment().
- The full backend integration run reports 25 of 29 suites
  passing.
- Four BE-ND2 Academic Year lifecycle suites remain blocked because
  the actual lifecycle schema/service implementation is missing.
- The disposable PostgreSQL QA cluster was cleaned up.
- Repository HEAD was reported as
  df33a2a82796f25a6a76f212e1009ce87bdc384b.
- Branch was reported as development.
- 67 tracked modifications and 38 untracked items were reported
  preserved.
- No staged changes or commits were reported.
These are agent-reported results, not independent verification by this
document's author.
4.1 Outstanding BE-ND2 lifecycle work
The approved lifecycle vocabulary is:

DRAFT → ACTIVE → CLOSED

The lifecycle implementation remains a separate, not-yet-authorized
implementation milestone. The V1.7 audit reported that previous Stage
1--4 completion claims were premature: the AcademicYear status
enum/field and corresponding service implementation were absent, and a
migration directory contained a placeholder SELECT 123.

Do not introduce alternative enum values to satisfy tests. Do not mix
BE-ND2 lifecycle implementation into the three product features above
without explicit authorization.
5. Required workflow for every feature
Follow the repository's authoritative AGENTS.md, skills, architecture
docs, and established workflows. At minimum:
1. Read-only discovery: inspect relevant frontend
   routes/components, backend modules/APIs, Prisma models, permissions,
   tests, and documentation.
2. Current-state report: identify existing behavior and reuse
   opportunities. Cite exact files and relevant symbols.
3. Requirements clarification: ask focused questions for unresolved
   product decisions. Do not bundle assumptions into implementation.
4. Feature specification: write a persistent specification with
   scope, non-goals, user flows, business rules, API/data changes,
   permissions, edge cases, acceptance criteria, and test plan.
5. Drift review: compare the proposed specification with this
   document and report any conflict.
6. Human approval: do not implement before the specification and
   scope are approved.
7. Incremental implementation: work in small, reviewable tasks. Do
   not combine unrelated features.
8. Verification: run relevant tests and type/build checks. Use only
   the authorized disposable QA database for integration tests.
9. Integrity review: inspect financial invariants, tenant
   isolation, authorization, concurrency, and historical-data
   preservation where relevant.
10. Documentation: update canonical docs and trackers only after
    implementation is verified.
11. Final report: list exact changed files, behavior changes,
    tests/results, known limitations, database/process cleanup, and Git
    status. Do not claim independent verification when only
    agent-reported output exists.
6. Scope-drift protocol
Stop and report before proceeding if:
- The academic-year selection becomes user-specific.
- The College Admin's identity is used as owner of the school-wide
  setting.
- Selecting the dashboard year changes Academic Year lifecycle status.
- The Fee Management Dashboard includes DRAFT or CANCELLED admissions.
- Clicking a student creates a new details workflow instead of using
  the existing Admission Details page.
- Fee revision rewrites or deletes historical payment records.
- Dashboard sorting changes financial/payment behavior.
- An implementation invents unresolved fee-revision calculations or
  sorting priorities.
- An agent proposes schema/API/source changes outside the approved
  feature specification.
- A test is weakened, skipped, mocked, or removed merely to obtain a
  green result.
- An existing repository rule or canonical architecture document
  conflicts with this plan.
A drift report must include:
1. Observed proposal or change.
2. Conflicting agreed decision.
3. Files and behavior affected.
4. Risk or consequence.
5. Smallest corrective option.
6. Whether separate authorization is required.
Do not silently reinterpret the baseline.
7. Change-control record
This document records the agreed planning baseline as of November 18,
2026. Any change to an agreed decision requires explicit human approval
and a documented update to this file. Keep prior decisions traceable; do
not silently overwrite history.

Changelog:
- November 18, 2026: Baseline agreed planning direction established.
- November 18, 2026: Feature 2 (Admissions Dashboard Status Sorting) marked
  complete following human code review approval. Implementation verified
  frontend-only with 360/360 passing tests, clean typecheck, clean production
  build, and zero backend, schema, migration, or financial changes.
End of development direction and scope guard.
