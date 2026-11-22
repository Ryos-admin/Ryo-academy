-- 1. Alter Enums
ALTER TYPE "FinancialLogType" ADD VALUE IF NOT EXISTS 'FEE_PAYMENT_REVERSAL';
ALTER TYPE "FinancialFlowType" ADD VALUE IF NOT EXISTS 'REVERSAL';

-- 2. Add feePaymentId to InstallmentLineageEvent
ALTER TABLE "InstallmentLineageEvent" 
  ADD COLUMN IF NOT EXISTS "feePaymentId" TEXT;

ALTER TABLE "InstallmentLineageEvent" 
  DROP CONSTRAINT IF EXISTS "InstallmentLineageEvent_feePaymentId_fkey",
  ADD CONSTRAINT "InstallmentLineageEvent_feePaymentId_fkey" 
  FOREIGN KEY ("feePaymentId") REFERENCES "FeePayment"("id") 
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "InstallmentLineageEvent_feePaymentId_idx" 
  ON "InstallmentLineageEvent"("feePaymentId");

-- 3. Add offsetAmount to AdmissionInstallment
ALTER TABLE "AdmissionInstallment" 
  ADD COLUMN IF NOT EXISTS "offsetAmount" DECIMAL(12,2) DEFAULT 0;

UPDATE "AdmissionInstallment" 
  SET "offsetAmount" = 0 
  WHERE "offsetAmount" IS NULL;

ALTER TABLE "AdmissionInstallment" 
  ALTER COLUMN "offsetAmount" SET NOT NULL;

-- 4. Check constraint on offsetAmount
ALTER TABLE "AdmissionInstallment" 
  DROP CONSTRAINT IF EXISTS "chk_installment_non_negative_offset",
  ADD CONSTRAINT "chk_installment_non_negative_offset" 
  CHECK ("offsetAmount" >= 0);

-- 5. Index on (scheduleId, sequence, offsetAmount)
CREATE INDEX IF NOT EXISTS "AdmissionInstallment_scheduleId_seq_offset_idx" 
  ON "AdmissionInstallment"("scheduleId", "sequence", "offsetAmount");

-- 6. Unique constraint on InstallmentAllocationReversalEvent(paymentReversalEventId, allocationId)
CREATE UNIQUE INDEX IF NOT EXISTS "InstallmentAllocationReversalEvent_reversalEventId_allocId_key" 
  ON "InstallmentAllocationReversalEvent"("paymentReversalEventId", "allocationId");

-- 7. Strict CHECK constraints
ALTER TABLE "FeePaymentInstallmentAllocation" 
  DROP CONSTRAINT IF EXISTS "chk_alloc_reversed_lte_allocated",
  ADD CONSTRAINT "chk_alloc_reversed_lte_allocated" 
  CHECK ("reversedAmount" <= "allocatedAmount");

ALTER TABLE "FeePaymentDetails" 
  DROP CONSTRAINT IF EXISTS "chk_fee_details_non_negative_paid",
  ADD CONSTRAINT "chk_fee_details_non_negative_paid" 
  CHECK ("amountPaid" >= 0);
