# Financial Log Master V0 — Schema and Integration Audit

Date: 2026-10-10

Status: **SCHEMA IMPLEMENTED / LOCAL MIGRATION VERIFIED**

The original audit was documentation-only. The follow-up schema milestone implemented the proposed Prisma models and applied the migration only to the disposable local QA database. Fee-payment, expense, and frontend workflows remain deferred.

## 1. Verified current fee-payment flow

The current payment path is:

```text
POST /students/:id/fees/payments
  -> StudentController
  -> StudentService.recordStudentFeePayment()
  -> DatabaseService.$transaction()
  -> FeePaymentDetails updates + FeePaymentHeader totals
```

`StudentController` protects the endpoint with `JwtAuthGuard` and `PermissionsGuard`, requiring `fees:create`. The controller currently passes only the student ID and DTO to the service; it does not pass the authenticated user ID into the business operation.

Inside one Prisma transaction, `StudentService`:

1. Loads the student, admission, fee-payment header, and component details.
2. Rejects missing students, missing admissions, cancelled admissions, missing fee snapshots, zero/non-positive payments, fully paid balances, and overpayments.
3. Allocates the payment in fee-component order by increasing each detail's `amountPaid` and updating its `paymentDate`.
4. Updates `FeePaymentHeader.totalPaidAmount` and `totalDueAmount`.
5. Returns the refreshed fee snapshot.

The existing transaction does not create a ledger row and does not carry a trusted actor or school context into the service.

## 2. Current authoritative sources

| Business fact | Current source of truth | Audit finding |
|---|---|---|
| Amount charged | `FeePaymentHeader.totalFeeAmount`, backed by `FeeStructure.totalAmount` and component snapshots | Header is the payment snapshot; component details preserve the allocation basis. |
| Amount paid | `FeePaymentHeader.totalPaidAmount` plus `FeePaymentDetails.amountPaid` | Both are updated in the same payment transaction. |
| Outstanding balance | `FeePaymentHeader.totalDueAmount` and calculated `totalFeeAmount - totalPaidAmount` | The payment service calculates and validates against the calculated outstanding amount. |
| Payment allocation | `FeePaymentDetails.amountPaid` by component order | No separate allocation endpoint exists or is needed for V0. |
| Cash received | No separate ledger/cash record exists | Must be represented by the new income log created with the payment. |
| School ownership | Admission `schoolId`; academic structures also link through academic year/school | Current payment service does not verify the authenticated actor's school. |
| Responsible user | Admission `createdById` records admission creation, not payment actor | Payment actor attribution is currently missing. |

## 3. Existing financial schema and gaps

Verified models:

- `FeeStructure`: academic year/program/class scope, total amount, active flag, fee components.
- `FeeComponent`: component amount and fee-structure relationship.
- `FeePaymentHeader`: admission, academic year, fee structure, total amounts, active flag.
- `FeePaymentDetails`: component snapshot, amount paid, payment date, allocation relationship.
- `Admission`: school and academic relationships plus fee-payment headers.

There is no `FinancialLog`, `Expense`, payment receipt, cashbook, expense category, or financial-report model in the current Prisma schema. Existing dashboard/fee pages are fee-structure and student-fee views; no Financial Log route or API adapter exists.

## 4. Proposed V0 schema

The following was the approved schema proposal and is now implemented in `prisma/models/finance/financial-log.prisma` and `prisma/models/finance/expense.prisma`:

```prisma
enum FinancialLogType {
  FEE_PAYMENT
  EXPENSE
  EXPENSE_REVERSAL
}

enum FinancialFlowType {
  INCOME
  EXPENSE
}

enum FinancialSourceType {
  FEE_PAYMENT
  EXPENSE
}

enum ExpenseCategory {
  SALARY
  UTILITIES
  SUPPLIES
  MAINTENANCE
  TRANSPORT
  RENT
  OTHER
}

model FinancialLog {
  id          String             @id @default(uuid())
  schoolId    String
  userId      String
  type        FinancialLogType
  flowType    FinancialFlowType
  amount      Decimal
  occurredAt  DateTime
  description String?
  sourceType  FinancialSourceType
  sourceId    String
  createdAt   DateTime           @default(now())
  updatedAt   DateTime           @updatedAt

  school      School             @relation(fields: [schoolId], references: [id])
  user        User               @relation(fields: [userId], references: [id])

  @@unique([sourceType, sourceId, type])
  @@index([schoolId, occurredAt])
  @@index([schoolId, flowType, occurredAt])
  @@index([sourceType, sourceId])
}

model Expense {
  id          String          @id @default(uuid())
  schoolId    String
  userId      String
  category    ExpenseCategory
  amount      Decimal
  occurredAt  DateTime
  description String?
  isActive    Boolean         @default(true)
  deletedAt   DateTime?
  deletedById  String?
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt

  school      School          @relation(fields: [schoolId], references: [id])
  user        User            @relation("ExpenseCreatedBy", fields: [userId], references: [id])
  deletedBy   User?           @relation("ExpenseDeletedBy", fields: [deletedById], references: [id], onDelete: SetNull)

  @@index([schoolId, occurredAt])
  @@index([schoolId, isActive, deletedAt])
  @@index([deletedById])
}
```

Recommended relation additions are explicit named relations on `School` and `User`, matching the existing deletion-actor convention. `sourceType` plus `sourceId` cannot be a conventional Prisma foreign key to multiple source tables. The unique constraint prevents duplicate entries for the same source/type, while service-level existence and school checks enforce the polymorphic reference.

For expense deletion, retain the original `Expense` row and create one `FinancialLog` with `type = EXPENSE_REVERSAL`, `flowType = INCOME`, and the same amount. The reversal should use `sourceType = EXPENSE` and `sourceId = expense.id`; the unique constraint therefore needs either a reversal-specific type, or a second explicit reversal key. Recommended implementation: make the uniqueness constraint `[sourceType, sourceId, type]` and use `type = EXPENSE_REVERSAL` for the reversal.

## 5. Transaction and idempotency strategy

Fee payment:

- Extend `recordStudentFeePayment` to receive `actorUserId` from the JWT request.
- Resolve the actor's school and require the admission/student to belong to that school.
- Keep allocation and FinancialLog creation inside the existing Prisma transaction.
- Use a payment-attempt/source identifier for retries. The current DTO has no idempotency key and the current schema has no payment-event ID. Before implementation, add a stable payment event ID to the request/record, or define the fee-payment detail update event as the source transaction. A request retry cannot safely be deduplicated from amount/date alone.
- Do not create the log until allocation succeeds. The unique source constraint makes duplicate posting fail closed, but a stable source ID is required to identify the same retry.

Expense creation:

- Derive `schoolId` and `userId` from the authenticated user and database context.
- Create the expense and its income/expense log in one transaction.
- Use the expense ID as the source ID; the log cannot exist before its source row.

Expense soft deletion:

- Resolve the target through the actor's school.
- In one transaction, mark the expense inactive and set `deletedAt`/`deletedById`, then create the one-time reversal log.
- If the expense is already inactive, return a harmless no-op or not-found according to the established lifecycle convention; never create a second reversal.
- The reversal amount must equal the original expense amount and must be linked to the same expense source ID.

## 6. Authorization and tenant scope

Existing permission conventions use string permissions and `PermissionsGuard`; existing roles are `COLLEGE_ADMIN`, `OFFICE_ADMIN`, and `STAFF`.

Proposed minimum permissions:

- Reuse `FEES_CREATE` for recording fee payments through the existing endpoint.
- Add `FINANCIAL_LOG_READ` for the read-only ledger/report endpoint; grant it to `COLLEGE_ADMIN` and `OFFICE_ADMIN`.
- Add `EXPENSE_CREATE` and `EXPENSE_DELETE`; grant them to `COLLEGE_ADMIN` and `OFFICE_ADMIN`.
- Do not expose create/update/delete permissions for FinancialLog itself.

All finance controllers should use `JwtAuthGuard` plus `PermissionsGuard`. Services must resolve `request.user.userId` from the JWT, load its `schoolId`, and scope source records and reports to that school. Client-provided `schoolId` and `userId` must be ignored for authority, following the existing trusted-context hardening pattern.

## 7. Minimal backend implementation sequence

1. Add enums/models and explicit School/User relations; review the migration SQL without applying it.
2. Add permission constants and RBAC seed entries; update API documentation.
3. Add a payment event/idempotency representation and pass authenticated actor context into the fee-payment service.
4. Add FinancialLog creation to the existing fee-payment transaction, with source and school checks.
5. Add Expense DTOs, service, controller, module, and transactional creation/reversal behavior.
6. Add read-only FinancialLog list/filter/monthly-summary service and controller.
7. Add focused unit tests for overpayment, duplicate retries, cross-school references, actor attribution, and transaction rollback.
8. Apply the migration only to the isolated QA database, then run database-backed fixtures.

## 8. Minimal frontend implementation sequence

1. Add typed `expenses-api.ts` and `financial-log-api.ts` adapters using the existing `api-client` and query conventions.
2. Add an Office Admin/College Admin read-only Financial Log route and navigation item gated by `FINANCIAL_LOG_READ`.
3. Add expense creation UI with category, amount, occurred date, description, validation, and common loader/error handling.
4. Add a delete icon/action with a warning that deletion creates a reversal entry and does not erase history.
5. Add read-only filters for date range, flow type, category/source type, and a monthly income/expense/net summary.
6. Do not add manual ledger-entry controls, payment-allocation controls, refund controls, or restoration controls.

## 9. Risks and unresolved design questions

- The approved field list says `type` and `flowType`, but the exact enum values for `type` are not separately specified. The proposed values above are implementation-ready defaults and need confirmation before schema work.
- Duplicate payment retries cannot be identified safely with the current payment DTO. A stable idempotency/payment-event identifier is required to guarantee the approved retry behavior.
- The current payment endpoint does not pass actor context and does not verify school ownership from the authenticated user. This must be corrected before ledger posting.
- Existing fee-structure and admission controllers are guarded, but older service methods accept client-provided school/creator fields. Finance integration must not reuse those fields as trusted actor authority.
- Attendance and fee-history preservation was not part of the prior soft-delete fixture run; no financial-log behavior was runtime-tested in this audit.
- No migration was generated or applied, and no database writes were made.

## 10. Files inspected

Backend:

- `prisma/models/admission_fees/fee-structure.prisma`
- `prisma/models/admission_fees/fee-component.prisma`
- `prisma/models/admission_fees/fee-payment-header.prisma`
- `prisma/models/admission_fees/fee-payment-detials.prisma`
- `prisma/models/admission_fees/admission.prisma`
- `prisma/models/academic/academic-year.prisma`
- `prisma/models/academic/school.prisma`
- `prisma/models/identity/user.prisma`
- `src/student/student.controller.ts`
- `src/student/student.service.ts`
- `src/admission/admission-fee-log/admission.service.ts`
- `src/admission/admission-fee-log/admission.controller.ts`
- `src/admission/fee-structure/fee-structure.service.ts`
- `src/admission/fee-structure/fee-structure.controller.ts`
- `src/auth/permissions/permission.constants.ts`
- `src/auth/permissions.guard.ts`
- `src/database/seed/rbac.seed.ts`
- fee/payment DTOs, repositories, tests, migrations, and API documentation.

Frontend:

- `src/lib/api-client.ts`
- `src/lib/fees-api.ts`
- `src/lib/student-fees-api.ts`
- `src/pages/fee-pages.tsx`
- `src/pages/admissions-students-pages.tsx`
- `src/pages/dashboard-page.tsx`
- `src/pages/app-pages.tsx`
- frontend permission and fee/payment tests.

## Fee-payment integration milestone result

- `POST /students/:id/fees/payments` now passes the trusted JWT user ID into `StudentService` and requires the actor's school to match the student's admission school.
- Each accepted request creates one `FeePayment` source event and one `FinancialLog` income entry inside the existing allocation transaction. The log source is the `FeePayment.id`, not the aggregate header or individual allocation details.
- `idempotencyKey` is an optional UUID request field. When supplied, it is unique in the database; same-key/same-student/same-amount retries return the current snapshot without reapplying allocation, while a changed intent returns `409 Conflict`. Requests without a key receive a server-generated event key and are not retry-deduplicated.
- The additional migration `20261009194616_add_fee_payment_idempotency` was generated, reviewed, and applied only to local `127.0.0.1:55432/ryo_qa`.
- Real PostgreSQL integration verified ledger posting, source uniqueness, repeated-key behavior, changed-intent rejection, cross-school rejection, and rejected overpayment with no extra payment/log.
- Real PostgreSQL integration also verified concurrent same-key requests produce one `FeePayment` event and one corresponding ledger entry.
- `FinancialLogFailureStudentService` in `test/financial-payment.integration.ts` deterministically throws from the test-overridden `createFinancialLog()` method after the payment event, allocation updates, and header update are attempted. Independent PostgreSQL queries confirmed the event, new log, balance/allocation changes, and payment counts were rolled back; a subsequent valid payment succeeded.
- Expense workflows, reversal entries, reporting endpoints, refunds, and frontend changes remain deferred.

## Cash-expense lifecycle milestone result

- Added `POST /expenses` with `expense:create` and `DELETE /expenses/:id` with `expense:delete`.
- Expense creation derives the actor and school from the JWT/database context and posts the expense plus one `EXPENSE` ledger row transactionally.
- Expense deletion preserves the original expense and log, sets `deletedAt`/`deletedById`, and creates one `EXPENSE_REVERSAL` ledger row with `flowType = INCOME` and the original expense source ID.
- Cross-school access, repeated deletion, creation rollback, reversal rollback, and source uniqueness were verified against local PostgreSQL by `test/expense.integration.ts`.
- Financial Log reporting and frontend expense UI remain deferred.

## Schema milestone result

- Migration `20261009192643_add_financial_log_master_v0` was generated, reviewed, and applied only to local `127.0.0.1:55432/ryo_qa`.
- Prisma validation, client generation, migration status, catalog checks, backend build, and `git diff --check` passed.
- No expense service/controller, reversal behavior, Financial Log reporting endpoint, or frontend implementation was added.

## Read-only Financial Log reporting milestone result

Implemented and verified a read-only `GET /financial-logs` endpoint. It requires the existing `fees:read` permission, derives school scope from the authenticated user record, supports date, flow, source, and pagination filters, and applies stable ordering by `occurredAt`, `createdAt`, and `id`. Summary totals use `occurredAt`-scoped rows and return decimal strings for income, expenses, and net position. Reversal rows remain income entries and are not double-counted.

The backend integration test created records for two schools and verified school isolation, pagination, date filtering, flow-filtered summaries, zero-result periods, and rejection of an actor without a school. The Office Admin frontend now has a read-only `/financial-log` page with filters, summary cards, pagination, loading, empty, and error states. No mutation endpoint was added and no migration was required.

Limitations: the reporting test exercised the service against the isolated local PostgreSQL database, but a live HTTP role-matrix test and browser journey were not run in this milestone. The frontend typecheck remains affected by pre-existing unrelated errors documented in the final report.

## Conclusion

FinancialLog remains system-posted and read-only by design. The fee-payment transaction now supplies actor context, school scoping, and optional retry identity. Expenses still require the deferred service/controller and transactional reversal implementation described above.

## 2026-10-11 consolidated verification status

- Previously verified fee-payment, idempotency, concurrency, rollback, expense lifecycle, and reporting service results remain historical results from isolated local PostgreSQL harnesses.
- No fresh finance database run is claimed. The rerun was blocked before connection: `tsx` could not create its IPC pipe, and the alternate Node loader could not start PostgreSQL on port `55432` under the sandbox.
- Live HTTP/JWT role-matrix and browser verification remain outstanding.

## HTTP/JWT authorization QA — 2026-10-11

- Static inspection confirmed `GET /financial-logs` and the expense and fee-payment routes use JWT plus permission guards.
- `OFFICE_ADMIN` and `COLLEGE_ADMIN` are the seeded roles with the relevant finance permissions; `STAFF` does not receive those finance permissions.
- No live HTTP result is claimed because application startup could not be established without the isolated PostgreSQL service.

## HTTP/JWT runtime result — 2026-10-11

- `GET /api/v0/financial-logs` passed real HTTP authentication and authorization checks: no token and malformed token returned 401, Office Admin received only its school’s row, and Staff received 403.
- `POST /api/v0/expenses` and `DELETE /api/v0/expenses/:id` passed real HTTP checks for authorized creation, cross-school deletion rejection, independent preservation of the target expense, authorized deletion, and repeated deletion returning 409.
- The test used the compiled backend and disposable local PostgreSQL; no remote database was contacted.
