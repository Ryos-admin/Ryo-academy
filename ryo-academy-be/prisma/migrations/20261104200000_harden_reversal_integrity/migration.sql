-- 1. Create MigrationRunStatus Enum
DO $$ BEGIN
  CREATE TYPE "MigrationRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED', 'INTERRUPTED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Create OffsetBackfillRun table for durable migration run records
CREATE TABLE IF NOT EXISTS "OffsetBackfillRun" (
  "id" TEXT NOT NULL,
  "migrationRunId" TEXT NOT NULL,
  "status" "MigrationRunStatus" NOT NULL DEFAULT 'RUNNING',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "schedulesProcessed" INTEGER NOT NULL DEFAULT 0,
  "totalBackfilled" INTEGER NOT NULL DEFAULT 0,
  "failureDetails" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OffsetBackfillRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OffsetBackfillRun_migrationRunId_key" ON "OffsetBackfillRun"("migrationRunId");
CREATE INDEX IF NOT EXISTS "OffsetBackfillRun_status_idx" ON "OffsetBackfillRun"("status");
CREATE INDEX IF NOT EXISTS "OffsetBackfillRun_startedAt_idx" ON "OffsetBackfillRun"("startedAt");

-- 3. Composite Schedule-Header Unique Target
CREATE UNIQUE INDEX IF NOT EXISTS "AdmissionInstallmentSchedule_id_feePaymentHeaderId_key" 
  ON "AdmissionInstallmentSchedule"("id", "feePaymentHeaderId");

-- 4. Composite Foreign Key on AdmissionInstallment(scheduleId, feePaymentHeaderId)
ALTER TABLE "AdmissionInstallment"
  DROP CONSTRAINT IF EXISTS "fk_installment_schedule_header",
  ADD CONSTRAINT "fk_installment_schedule_header"
  FOREIGN KEY ("scheduleId", "feePaymentHeaderId")
  REFERENCES "AdmissionInstallmentSchedule"("id", "feePaymentHeaderId")
  ON UPDATE CASCADE ON DELETE RESTRICT;

-- 5. Drop Database DEFAULT on offsetAmount
-- Historical backfill has reconstructed all offsets; newly inserted rows must explicitly provide offsetAmount.
ALTER TABLE "AdmissionInstallment"
  ALTER COLUMN "offsetAmount" DROP DEFAULT;
