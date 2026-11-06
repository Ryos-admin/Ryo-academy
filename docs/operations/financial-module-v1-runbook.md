# Ryo Academy ERP — Financial Module V1 Operational Runbook

> **Operational Deployment, Migration & Incident Response Guide**  
> **Status:** Production Standard  
> **Target Audience:** DevOps Engineers, Database Administrators, Site Reliability Engineers, and Senior Backend Engineers.

---

## 1. Operational Overview & Prerequisites

### 1.1 System Architecture & Storage Boundaries
- **Runtime Environment:** Node.js v22+ / NestJS runtime.
- **Relational Database:** PostgreSQL 16+ with ACID transaction support.
- **Database Connection Rules:**
  - Standard application queries use connection pooling.
  - Durable failure logging in the backfill runner explicitly uses an independent, unpooled direct database connection to guarantee error persistence when the primary transaction aborts.
  - Remote/shared unverified databases (e.g., Neon development branches) must never be used for financial QA, migrations, or automated tests without explicit approval.
- **Global Financial Maintenance Lock:**
  - Key: `55432001` (PostgreSQL Advisory Lock).
  - Used by deployment runners to guarantee single-writer exclusivity across multi-instance clusters.

### 1.2 Environment Variables

| Variable | Description | Example / Required Value |
| :--- | :--- | :--- |
| `DATABASE_URL` | Pooled connection string for application and queries | `postgresql://ryo_owner:secret@db.internal:5432/ryo_prod?pgbouncer=true` |
| `DIRECT_DATABASE_URL` | Direct unpooled connection string for migrations & advisory locks | `postgresql://ryo_owner:secret@db.internal:5432/ryo_prod` |
| `NODE_ENV` | Environment identifier | `production` |

---

## 2. Controlled Financial-Write Maintenance Window & Staged Deployment Procedure

Applying financial migrations requires a scheduled, controlled maintenance window for financial write operations. While read-only financial queries remain highly available, all financial write operations must be frozen during migration and backfill execution.

> [!IMPORTANT]
> This procedure does **not** provide zero-downtime writes. It establishes high-availability read-only access while gating financial mutations to ensure deterministic lineage reconstruction without floating-point or concurrency corruption.

### 2.1 Availability Impact Matrix

| Operation Category | Endpoints / Workflows | Availability During Maintenance | Operational Rationale |
| :--- | :--- | :--- | :--- |
| **Financial Writes (Frozen)** | `POST /students/:id/fee-payments`<br/>`POST /students/:id/fee-payments/:id/reversals`<br/>`POST /admissions/:id/confirm`<br/>`POST /admissions/:id/installment-schedule`<br/>`PUT /admissions/:id/installment-schedule`<br/>`POST /admissions/:id/concessions` | **UNAVAILABLE (Gated / Blocked)** | Concurrent mutations during backfill would alter active leaf intervals mid-computation, causing `validateSequenceIntervalIntegrity` to fail. Legacy un-upgraded writers would omit `offsetAmount`, violating partition constraints. |
| **Financial Reads (Preserved)** | `GET /students/:id/fees`<br/>`GET /admissions/:id/installment-schedule`<br/>`GET /fee-structure-master`<br/>`GET /installment-templates`<br/>`GET /financial-logs` | **AVAILABLE (High Availability)** | Reads query snapshotted balances and committed tables without taking exclusive DDL locks. |
| **Non-Financial Modules** | Attendance, Classes, Sections, Staff, Calendar | **AVAILABLE (Unaffected)** | Completely decoupled from financial schedule and lineage tables. |

```mermaid
flowchart TD
    Step1["1. Acquire Advisory Lock 55432001"] --> Step2["2. Freeze Financial Writers<br/>(Payments, Reversals, Confirmations, Schedules)"]
    Step2 --> Step3["3. Drain In-Flight Transactions"]
    Step3 --> Step4["4. Deploy Schema Migration Prerequisites"]
    Step4 --> Step5["5. Run Historical Offset Backfill<br/>(npm run backfill:offsets)"]
    Step5 --> Step6["6. Verify Zero Unresolved NULLs"]
    Step6 --> Step7["7. Drop Column DEFAULT in PostgreSQL"]
    Step7 --> Step8["8. Verify Catalog Constraints & Indexes"]
    Step8 --> Step9["9. Deploy Compatible Application Writers"]
    Step9 --> Step10["10. Execute Post-Deployment Smoke Tests"]
    Step10 --> Step11["11. Release Advisory Lock 55432001 & Unfreeze Writers"]
```

### Step-by-Step Execution Sequence

#### Step 1: Acquire Maintenance Lock
Connect via `DIRECT_DATABASE_URL` and acquire the session-level financial advisory lock:
```sql
SELECT pg_advisory_lock(55432001);
```

#### Step 2: Freeze Financial Writers
Disable HTTP ingestion at the ingress/API gateway or application layer for all financial write endpoints:
- `POST /students/:studentId/fee-payments`
- `POST /students/:studentId/fee-payments/:paymentId/reversals`
- `POST /admissions/:admissionId/confirm`
- `POST /admissions/:admissionId/installment-schedules`
- `PUT /admissions/:admissionId/installment-schedules`
- `POST /admissions/:admissionId/concessions`

#### Step 3: Drain In-Flight Transactions
Verify no active long-running transactions exist on financial tables:
```sql
SELECT pid, now() - query_start AS duration, query 
FROM pg_stat_activity 
WHERE state = 'active' AND query ILIKE '%AdmissionInstallment%' AND pid <> pg_backend_pid();
```

#### Step 4: Deploy Schema Migration
Run forward schema migration via Prisma:
```bash
npx prisma migrate deploy
```

#### Step 5: Execute Historical Lineage Backfill
Run the standalone backfill runner:
```bash
npm run backfill:offsets
```
Verify the output reports `Exceptions encountered: 0` and the durable record in `OffsetBackfillRun` displays `status: COMPLETED`.

#### Step 6: Verify Zero Unresolved NULLs
Execute database check:
```sql
SELECT COUNT(*) FROM "AdmissionInstallment" WHERE "offsetAmount" IS NULL;
-- Expected output: 0
```

#### Step 7: Verify Column Default Dropped
Ensure the column has no default so any legacy writer attempting to omit `offsetAmount` fails fast:
```sql
SELECT column_name, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'AdmissionInstallment' AND column_name = 'offsetAmount';
```
- `is_nullable` must be `NO`.
- `column_default` must be `NULL` (empty).

#### Step 8: Deploy New Application Writers & Unfreeze
Deploy the application containers. Verify all writers (`AdmissionInstallmentScheduleService`, `InstallmentAllocationService`, `PaymentReversalService`) explicitly supply `offsetAmount`.

#### Step 9: Release Maintenance Lock
```sql
SELECT pg_advisory_unlock(55432001);
```

---

## 3. Standalone Backfill Runner Guide (`npm run backfill:offsets`)

The backfill runner inspects all historical schedules, validates their DAG graphs, reconstructs `offsetAmount` coordinates from lineage transfer edges, validates interval partitions, and backfills historical `feePaymentId` relationships.

### 3.1 Invocation
```bash
cd ryo-academy-be
DATABASE_URL="<DIRECT_DATABASE_URL>" npm run backfill:offsets
```

### 3.2 Durable Monitoring & Recovery Semantics
The runner tracks execution runs via the `OffsetBackfillRun` model:
- **`RUNNING`:** Active backfill execution.
- **`COMPLETED`:** Entire historical corpus processed and verified with zero errors.
- **`FAILED`:** An invariant or relational rule failed; entire transaction rolled back; details persisted in `failureDetails` and `BackfillExceptionLog`.
- **`INTERRUPTED`:** The process terminated unexpectedly prior to completion (e.g., node OOM or SIGKILL).

#### Interrupted Backfill Recovery Mechanics: Clean Restart vs. Checkpoint Resume
> [!IMPORTANT]
> The backfill runner does **NOT** resume from a partial checkpoint. The entire historical backfill and interval validation executes inside a single atomic PostgreSQL transaction (`$transaction`). If an interruption or crash occurs:
> 1. PostgreSQL automatically rolls back the entire transaction. Zero schedules remain partially committed.
> 2. On the subsequent runner restart, the runner detects all previous `RUNNING` records and transitions them to `INTERRUPTED` with detection metadata.
> 3. The runner initiates a **fresh, complete backfill run across all schedules from the beginning**.
> 4. Completed (`COMPLETED`) or previously failed (`FAILED`) records are preserved immutably and never modified on restart.

---

## 4. Error Code Catalog & Operator Resolution

When a backfill or reversal fails, the system logs a deterministic error code. Use this table for incident response:

| Error Code | Root Cause | Operator Action |
| :--- | :--- | :--- |
| `ERR_SEQUENCE_OUT_OF_BOUNDS` | An installment exists with `sequence < 1` or `sequence > schedule.installmentCount`. | Inspect `AdmissionInstallment` for the reported `entityId`. Verify if `schedule.installmentCount` was incorrectly updated or an invalid installment was provisioned. |
| `ERR_SCHEDULE_HEADER_OBLIGATION_MISMATCH` | `schedule.totalAmount` differs from `header.netAmount`. | Query `FeePaymentHeader` and `AdmissionInstallmentSchedule`. Check if an unconfirmed concession was applied without recalculating the custom schedule. Correct the schedule obligation before re-running. |
| `ERR_ROOT_SUM_SCHEDULE_MISMATCH` | Sum of root installment amounts ($subSequence = 0$) does not equal `schedule.totalAmount`. | Query root installments for the schedule: `SELECT * FROM "AdmissionInstallment" WHERE "scheduleId" = $1 AND "rootInstallmentId" IS NULL`. Reconcile sum to `schedule.totalAmount`. |
| `ERR_SPLIT_EDGE_CARDINALITY` | An auto-split lineage event has an edge count other than 2. | Inspect `InstallmentLineageTransferEdge` for the reported `eventId`. Every auto-split must have exactly two edges (one to settled child, one to remaining child). |
| `ERR_SPLIT_CONSERVATION_MISMATCH` | Outgoing transfer edge amounts do not equal source installment amount. | Check for floating-point truncation in manual data fixes. Sum of edge amounts must equal source installment amount down to 2 decimal paise. |
| `ERR_SETTLED_CHILD_AMBIGUITY` | Reconstructing a split event found multiple matching allocations or zero matching allocations for the target children. | Query `FeePaymentInstallmentAllocation` matching the `feePaymentId` and children IDs. Verify exactly one allocation identifies the settled child. |
| `ERR_PAYMENT_CONTEXT_MISMATCH` | Split event references a `feePaymentId` belonging to a different admission, header, or school. | Inspect relational context: `LineageEvent -> FeePayment -> FeePaymentHeader -> Admission -> School`. Rebind or isolate cross-tenant corruption. |
| `ERR_INTERVAL_GAP_OR_OVERLAP` | Active installment intervals $[offset_i, offset_i + amount_i)$ overlap or contain gaps. | Run interval diagnostic query (Section 5.3). Reconstruct offsets from validated lineage DAG. |
| `ERR_INTERVAL_BOUNDARY_MISMATCH` | Terminal active leaf upper bound does not equal root obligation $R$. | The sum of active leaves does not equal the sequence root amount. Check for unlinked orphaned active rows. |
| `ERR_ACTIVE_ROW_WITH_OUTGOING_LINEAGE` | An installment marked `PENDING` or `PAID` has outgoing transfer edges. | Invariant violation: any row with outgoing edges must have `status = 'SUPERSEDED'` and `supersededAt IS NOT NULL`. |
| `ERR_MUTUAL_STATUS_SUPERSEDED_INCONSISTENCY` | An installment has `status = 'SUPERSEDED'` but `supersededAt IS NULL`, or vice-versa. | Synchronize `status` and `supersededAt`. If superseded, assign historical timestamp. |
| `ERR_CYCLE_OR_UNREACHABLE_NODE` | Kahn's topological sort detected a cycle in transfer edges or an unreachable installment node. | Inspect transfer edges for circular references $(A \to B \to A)$. Remove invalid edges. |
| `ERR_MISSING_LINEAGE_DESCRIPTION` | Historical split event has no `feePaymentId` and no `description`. | Provenance cannot be reconstructed. Isolate corrupt event record. |
| `ERR_MALFORMED_LINEAGE_DESCRIPTION` | Split event description does not match regex `^Auto-split from payment <UUID>: allocated <amt>, remaining <amt>$`. | Correct description syntax to match canonical historical format. |

---

## 5. Audit & Verification SQL Playbook

Run these diagnostic queries to verify financial integrity.

### 5.1 Detect Unresolved NULL Offsets
```sql
SELECT count(*) AS unresolved_null_offsets
FROM "AdmissionInstallment"
WHERE "offsetAmount" IS NULL;
-- MUST RETURN 0
```

### 5.2 Header Aggregate vs Payment Reconciliations
```sql
SELECT 
    h.id AS header_id,
    h."totalFeeAmount",
    h."totalPaidAmount",
    h."totalDueAmount",
    COALESCE(SUM(p.amount), 0) AS sum_payments,
    COALESCE(SUM(d."amountPaid"), 0) AS sum_component_paid
FROM "FeePaymentHeader" h
LEFT JOIN "FeePayment" p ON p."feePaymentHeaderId" = h.id AND p.status = 'COMPLETED'
LEFT JOIN "FeePaymentDetails" d ON d."feePaymentHeaderId" = h.id
GROUP BY h.id
HAVING 
    h."totalPaidAmount" <> COALESCE(SUM(p.amount), 0)
    OR h."totalPaidAmount" <> COALESCE(SUM(d."amountPaid"), 0)
    OR h."totalDueAmount" <> (h."totalFeeAmount" - h."totalPaidAmount");
-- MUST RETURN 0 ROWS
```

### 5.3 Active Installment Leaves vs Header Obligation
```sql
SELECT 
    s.id AS schedule_id,
    s."totalAmount" AS schedule_total,
    h."netAmount" AS header_net,
    COALESCE(SUM(CASE WHEN i."status" = 'PENDING' THEN i.amount ELSE 0 END), 0) AS active_pending,
    COALESCE(SUM(CASE WHEN i."status" IN ('PAID', 'PAID_EARLY') THEN i.amount ELSE 0 END), 0) AS active_paid,
    h."totalDueAmount",
    h."totalPaidAmount"
FROM "AdmissionInstallmentSchedule" s
JOIN "FeePaymentHeader" h ON s."feePaymentHeaderId" = h.id
JOIN "AdmissionInstallment" i ON i."scheduleId" = s.id AND i."supersededAt" IS NULL
GROUP BY s.id, h.id
HAVING 
    active_pending <> h."totalDueAmount"
    OR active_paid <> h."totalPaidAmount"
    OR s."totalAmount" <> h."netAmount";
-- MUST RETURN 0 ROWS
```

### 5.4 Detect Overlapping Installment Intervals
```sql
SELECT 
    a."scheduleId",
    a.sequence,
    a.id AS inst_a_id,
    b.id AS inst_b_id,
    a."offsetAmount" AS a_start,
    (a."offsetAmount" + a.amount) AS a_end,
    b."offsetAmount" AS b_start,
    (b."offsetAmount" + b.amount) AS b_end
FROM "AdmissionInstallment" a
JOIN "AdmissionInstallment" b ON a."scheduleId" = b."scheduleId" 
    AND a.sequence = b.sequence 
    AND a.id <> b.id
    AND a."supersededAt" IS NULL 
    AND b."supersededAt" IS NULL
WHERE 
    a."offsetAmount" < (b."offsetAmount" + b.amount)
    AND (a."offsetAmount" + a.amount) > b."offsetAmount";
-- MUST RETURN 0 ROWS
```

---

## 6. Day-2 Incident Response Playbook

### Scenario A: Payment Fails with 409 ConflictException ('Idempotency key reused with conflicting parameters')
- **Symptom:** Client receives HTTP 409 on `POST /students/:studentId/fee-payments`.
- **Cause:** Client reused a UUID `idempotencyKey` that was previously used for a payment with a different `amount`, `studentId`, or `headerId`.
- **Resolution:**
  1. Inspect `FeePayment` matching `idempotencyKey`:
     ```sql
     SELECT id, "studentId", amount, "idempotencyKey", "createdAt" 
     FROM "FeePayment" WHERE "idempotencyKey" = '<KEY>';
     ```
  2. Advise the client software to generate a fresh UUID v4 for distinct financial transactions.

### Scenario B: Payment Reversal Fails with 409 ConflictException ('Payment has already been reversed')
- **Symptom:** College Admin receives HTTP 409 on reversal attempt.
- **Cause:** Payment already has an associated `PaymentReversalEvent`. Double reversals are strictly rejected.
- **Resolution:**
  1. Inspect the existing reversal record:
     ```sql
     SELECT * FROM "PaymentReversalEvent" WHERE "feePaymentId" = '<PAYMENT_ID>';
     ```
  2. Provide the existing reversal audit details (timestamp, actor, reason) to the administrator.

### Scenario C: PostgreSQL Advisory Lock Incident (Key 55432001)
- **Symptom:** The runner hangs at `Acquiring financial maintenance advisory lock...`.
- **Lock Semantics & Scope:**
  - Key `55432001` uses PostgreSQL's session-level advisory lock (`pg_advisory_lock`), **not** transaction-scoped locking.
  - Advisory locks reside in PostgreSQL shared memory (`pg_locks`), not in table rows. They cannot be queried with `SELECT * FROM ...` or deleted with `DELETE`.
  - When the holding database session disconnects normally or crashes, PostgreSQL's postmaster automatically releases all session-level advisory locks.
  - A lock hang occurs only if the holding client process remains alive or an unclosed TCP connection keeps the database session open in state `idle`.
- **Triage & Resolution Procedure:**
  1. **Identify the holding session:**
     ```sql
     SELECT 
         a.pid,
         a.usename,
         a.application_name,
         a.client_addr,
         a.state,
         a.query,
         now() - a.query_start AS query_age,
         now() - a.state_change AS state_change_age
     FROM pg_locks l
     JOIN pg_stat_activity a ON l.pid = a.pid
     WHERE l.locktype = 'advisory' 
       AND (l.classid::bigint << 32 | l.objid::bigint) = 55432001;
     ```
  2. **Establish whether the session is genuinely abandoned:**
     - **Active Migration Running:** If `state = 'active'` or `query` shows an ongoing transaction with active CPU/IO, a deployment runner or migration is **actively in progress**. **DO NOT TERMINATE.** Wait for it to finish.
     - **Abandoned / Stale Connection:** If `state = 'idle'`, `state_change_age > 15 minutes`, and the client process on the application host is dead, the session is abandoned.
  3. **Safe Release Procedure:**
     - *Preferred (from holding session):* If the holding Node.js process shell is accessible, allow it to complete or call:
       ```sql
       SELECT pg_advisory_unlock(55432001);
       ```
     - *Emergency Intervention (Orphaned session only):* If the client host is confirmed terminated:
       ```sql
       SELECT pg_terminate_backend(<PID>);
       ```
  4. **Operational Risk Warning:**
     - Terminating an active session (`pg_terminate_backend`) while a backfill or migration is actively running immediately aborts the active transaction, rolls back all in-flight changes, drops the connection, and logs an `ERR_BACKFILL_FAILED` exception. Never terminate without confirming the holding process is dead.
