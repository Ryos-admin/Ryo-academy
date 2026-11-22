-- CreateEnum
CREATE TYPE "InstallmentScheduleType" AS ENUM ('TEMPLATE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "InstallmentRowStatus" AS ENUM ('PENDING', 'PAID', 'PAID_EARLY', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "LineageEventType" AS ENUM ('INITIAL_SCHEDULE', 'MANUAL_RESCHEDULE', 'PAYMENT_AUTO_SPLIT', 'REVERSAL_RESTORE');

-- CreateEnum
CREATE TYPE "InstallmentCalculationType" AS ENUM ('CUSTOM_AMOUNT', 'PERCENTAGE', 'EQUAL_SPLIT');

-- CreateEnum
CREATE TYPE "AllocationReversalType" AS ENUM ('FULL_PAYMENT_REVERSAL');

-- CreateTable
CREATE TABLE "AdmissionInstallmentSchedule" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "admissionId" TEXT NOT NULL,
    "feePaymentHeaderId" TEXT NOT NULL,
    "templateId" TEXT,
    "scheduleType" "InstallmentScheduleType" NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "installmentCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdmissionInstallmentSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdmissionInstallment" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "feePaymentHeaderId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "subSequence" INTEGER NOT NULL DEFAULT 0,
    "rootInstallmentId" TEXT,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "InstallmentRowStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "supersededAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdmissionInstallment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackfillExceptionLog" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "admissionId" TEXT NOT NULL,
    "feePaymentHeaderId" TEXT NOT NULL,
    "errorCode" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "payloadSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BackfillExceptionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeePaymentInstallmentAllocation" (
    "id" TEXT NOT NULL,
    "feePaymentId" TEXT NOT NULL,
    "installmentId" TEXT NOT NULL,
    "feePaymentHeaderId" TEXT NOT NULL,
    "allocatedAmount" DECIMAL(12,2) NOT NULL,
    "reversedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "isReconstructed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeePaymentInstallmentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstallmentLineageEvent" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "eventType" "LineageEventType" NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstallmentLineageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstallmentLineageTransferEdge" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "sourceInstallmentId" TEXT,
    "resultInstallmentId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "InstallmentLineageTransferEdge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstallmentTemplate" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "calculationType" "InstallmentCalculationType" NOT NULL,
    "installmentCount" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstallmentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstallmentTemplateItem" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "percentage" DECIMAL(5,2),
    "fixedAmount" DECIMAL(12,2),
    "dueDaysAfterAdmission" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstallmentTemplateItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentReversalEvent" (
    "id" TEXT NOT NULL,
    "feePaymentId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "reversalAmount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "reversedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentReversalEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstallmentAllocationReversalEvent" (
    "id" TEXT NOT NULL,
    "paymentReversalEventId" TEXT NOT NULL,
    "allocationId" TEXT NOT NULL,
    "feePaymentId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstallmentAllocationReversalEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdmissionInstallmentSchedule_feePaymentHeaderId_key" ON "AdmissionInstallmentSchedule"("feePaymentHeaderId");

-- CreateIndex
CREATE INDEX "AdmissionInstallmentSchedule_schoolId_idx" ON "AdmissionInstallmentSchedule"("schoolId");

-- CreateIndex
CREATE INDEX "AdmissionInstallmentSchedule_admissionId_idx" ON "AdmissionInstallmentSchedule"("admissionId");

-- CreateIndex
CREATE INDEX "AdmissionInstallmentSchedule_feePaymentHeaderId_idx" ON "AdmissionInstallmentSchedule"("feePaymentHeaderId");

-- CreateIndex
CREATE INDEX "AdmissionInstallmentSchedule_templateId_idx" ON "AdmissionInstallmentSchedule"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "AdmissionInstallmentSchedule_feePaymentHeaderId_admissionId_key" ON "AdmissionInstallmentSchedule"("feePaymentHeaderId", "admissionId");

-- CreateIndex
CREATE INDEX "AdmissionInstallment_scheduleId_status_idx" ON "AdmissionInstallment"("scheduleId", "status");

-- CreateIndex
CREATE INDEX "AdmissionInstallment_feePaymentHeaderId_idx" ON "AdmissionInstallment"("feePaymentHeaderId");

-- CreateIndex
CREATE INDEX "AdmissionInstallment_rootInstallmentId_idx" ON "AdmissionInstallment"("rootInstallmentId");

-- CreateIndex
CREATE INDEX "AdmissionInstallment_dueDate_idx" ON "AdmissionInstallment"("dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "AdmissionInstallment_id_scheduleId_key" ON "AdmissionInstallment"("id", "scheduleId");

-- CreateIndex
CREATE UNIQUE INDEX "AdmissionInstallment_id_feePaymentHeaderId_key" ON "AdmissionInstallment"("id", "feePaymentHeaderId");

-- CreateIndex
CREATE UNIQUE INDEX "AdmissionInstallment_scheduleId_sequence_subSequence_key" ON "AdmissionInstallment"("scheduleId", "sequence", "subSequence");

-- CreateIndex
CREATE INDEX "BackfillExceptionLog_schoolId_idx" ON "BackfillExceptionLog"("schoolId");

-- CreateIndex
CREATE INDEX "BackfillExceptionLog_admissionId_idx" ON "BackfillExceptionLog"("admissionId");

-- CreateIndex
CREATE INDEX "BackfillExceptionLog_feePaymentHeaderId_idx" ON "BackfillExceptionLog"("feePaymentHeaderId");

-- CreateIndex
CREATE INDEX "BackfillExceptionLog_errorCode_idx" ON "BackfillExceptionLog"("errorCode");

-- CreateIndex
CREATE INDEX "FeePaymentInstallmentAllocation_feePaymentId_idx" ON "FeePaymentInstallmentAllocation"("feePaymentId");

-- CreateIndex
CREATE INDEX "FeePaymentInstallmentAllocation_installmentId_idx" ON "FeePaymentInstallmentAllocation"("installmentId");

-- CreateIndex
CREATE INDEX "FeePaymentInstallmentAllocation_feePaymentHeaderId_idx" ON "FeePaymentInstallmentAllocation"("feePaymentHeaderId");

-- CreateIndex
CREATE UNIQUE INDEX "FeePaymentInstallmentAllocation_id_feePaymentId_key" ON "FeePaymentInstallmentAllocation"("id", "feePaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "FeePaymentInstallmentAllocation_id_feePaymentHeaderId_key" ON "FeePaymentInstallmentAllocation"("id", "feePaymentHeaderId");

-- CreateIndex
CREATE INDEX "InstallmentLineageEvent_scheduleId_eventType_idx" ON "InstallmentLineageEvent"("scheduleId", "eventType");

-- CreateIndex
CREATE UNIQUE INDEX "InstallmentLineageEvent_id_scheduleId_key" ON "InstallmentLineageEvent"("id", "scheduleId");

-- CreateIndex
CREATE INDEX "InstallmentLineageTransferEdge_eventId_idx" ON "InstallmentLineageTransferEdge"("eventId");

-- CreateIndex
CREATE INDEX "InstallmentLineageTransferEdge_scheduleId_idx" ON "InstallmentLineageTransferEdge"("scheduleId");

-- CreateIndex
CREATE INDEX "InstallmentLineageTransferEdge_sourceInstallmentId_idx" ON "InstallmentLineageTransferEdge"("sourceInstallmentId");

-- CreateIndex
CREATE INDEX "InstallmentLineageTransferEdge_resultInstallmentId_idx" ON "InstallmentLineageTransferEdge"("resultInstallmentId");

-- CreateIndex
CREATE INDEX "InstallmentTemplate_schoolId_isActive_idx" ON "InstallmentTemplate"("schoolId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "InstallmentTemplate_schoolId_name_key" ON "InstallmentTemplate"("schoolId", "name");

-- CreateIndex
CREATE INDEX "InstallmentTemplateItem_templateId_idx" ON "InstallmentTemplateItem"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "InstallmentTemplateItem_templateId_sequence_key" ON "InstallmentTemplateItem"("templateId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentReversalEvent_feePaymentId_key" ON "PaymentReversalEvent"("feePaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentReversalEvent_idempotencyKey_key" ON "PaymentReversalEvent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "PaymentReversalEvent_feePaymentId_idx" ON "PaymentReversalEvent"("feePaymentId");

-- CreateIndex
CREATE INDEX "PaymentReversalEvent_schoolId_idx" ON "PaymentReversalEvent"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentReversalEvent_id_feePaymentId_key" ON "PaymentReversalEvent"("id", "feePaymentId");

-- CreateIndex
CREATE INDEX "InstallmentAllocationReversalEvent_paymentReversalEventId_idx" ON "InstallmentAllocationReversalEvent"("paymentReversalEventId");

-- CreateIndex
CREATE INDEX "InstallmentAllocationReversalEvent_allocationId_idx" ON "InstallmentAllocationReversalEvent"("allocationId");

-- CreateIndex
CREATE INDEX "InstallmentAllocationReversalEvent_feePaymentId_idx" ON "InstallmentAllocationReversalEvent"("feePaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "FeePayment_id_feePaymentHeaderId_key" ON "FeePayment"("id", "feePaymentHeaderId");

-- CreateIndex
CREATE UNIQUE INDEX "FeePaymentHeader_id_admissionId_key" ON "FeePaymentHeader"("id", "admissionId");

-- AddForeignKey
ALTER TABLE "AdmissionInstallmentSchedule" ADD CONSTRAINT "AdmissionInstallmentSchedule_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmissionInstallmentSchedule" ADD CONSTRAINT "AdmissionInstallmentSchedule_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "Admission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmissionInstallmentSchedule" ADD CONSTRAINT "AdmissionInstallmentSchedule_feePaymentHeaderId_fkey" FOREIGN KEY ("feePaymentHeaderId") REFERENCES "FeePaymentHeader"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmissionInstallmentSchedule" ADD CONSTRAINT "AdmissionInstallmentSchedule_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "InstallmentTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmissionInstallment" ADD CONSTRAINT "AdmissionInstallment_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "AdmissionInstallmentSchedule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmissionInstallment" ADD CONSTRAINT "AdmissionInstallment_feePaymentHeaderId_fkey" FOREIGN KEY ("feePaymentHeaderId") REFERENCES "FeePaymentHeader"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeePaymentInstallmentAllocation" ADD CONSTRAINT "FeePaymentInstallmentAllocation_feePaymentId_fkey" FOREIGN KEY ("feePaymentId") REFERENCES "FeePayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeePaymentInstallmentAllocation" ADD CONSTRAINT "FeePaymentInstallmentAllocation_installmentId_fkey" FOREIGN KEY ("installmentId") REFERENCES "AdmissionInstallment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeePaymentInstallmentAllocation" ADD CONSTRAINT "FeePaymentInstallmentAllocation_feePaymentHeaderId_fkey" FOREIGN KEY ("feePaymentHeaderId") REFERENCES "FeePaymentHeader"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallmentLineageEvent" ADD CONSTRAINT "InstallmentLineageEvent_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "AdmissionInstallmentSchedule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallmentLineageTransferEdge" ADD CONSTRAINT "InstallmentLineageTransferEdge_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "InstallmentLineageEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallmentLineageTransferEdge" ADD CONSTRAINT "InstallmentLineageTransferEdge_sourceInstallmentId_fkey" FOREIGN KEY ("sourceInstallmentId") REFERENCES "AdmissionInstallment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallmentLineageTransferEdge" ADD CONSTRAINT "InstallmentLineageTransferEdge_resultInstallmentId_fkey" FOREIGN KEY ("resultInstallmentId") REFERENCES "AdmissionInstallment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallmentTemplate" ADD CONSTRAINT "InstallmentTemplate_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallmentTemplateItem" ADD CONSTRAINT "InstallmentTemplateItem_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "InstallmentTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentReversalEvent" ADD CONSTRAINT "PaymentReversalEvent_feePaymentId_fkey" FOREIGN KEY ("feePaymentId") REFERENCES "FeePayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentReversalEvent" ADD CONSTRAINT "PaymentReversalEvent_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentReversalEvent" ADD CONSTRAINT "PaymentReversalEvent_reversedByUserId_fkey" FOREIGN KEY ("reversedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallmentAllocationReversalEvent" ADD CONSTRAINT "InstallmentAllocationReversalEvent_paymentReversalEventId_fkey" FOREIGN KEY ("paymentReversalEventId") REFERENCES "PaymentReversalEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallmentAllocationReversalEvent" ADD CONSTRAINT "InstallmentAllocationReversalEvent_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "FeePaymentInstallmentAllocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- ============================================================================
-- EXPLICIT COMPOSITE FOREIGN KEY CONSTRAINTS (Tasks 04A.7 - 04A.9)
-- ============================================================================

-- 1. Schedule Header & Admission Ownership:
-- Enforces that the schedule's admissionId matches the FeePaymentHeader's admissionId
ALTER TABLE "AdmissionInstallmentSchedule" 
  ADD CONSTRAINT "fk_schedule_header_admission" 
  FOREIGN KEY ("feePaymentHeaderId", "admissionId") 
  REFERENCES "FeePaymentHeader"("id", "admissionId") 
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- 2. Allocation Payment & Header Ownership:
-- Enforces that the payment belongs to the same FeePaymentHeader as the allocation
ALTER TABLE "FeePaymentInstallmentAllocation" 
  ADD CONSTRAINT "fk_alloc_payment_header" 
  FOREIGN KEY ("feePaymentId", "feePaymentHeaderId") 
  REFERENCES "FeePayment"("id", "feePaymentHeaderId") 
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- 3. Allocation Installment & Header Ownership:
-- Enforces that the installment belongs to the same FeePaymentHeader as the allocation
ALTER TABLE "FeePaymentInstallmentAllocation" 
  ADD CONSTRAINT "fk_alloc_installment_header" 
  FOREIGN KEY ("installmentId", "feePaymentHeaderId") 
  REFERENCES "AdmissionInstallment"("id", "feePaymentHeaderId") 
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- 4. Lineage Edge Event & Schedule Ownership:
-- Enforces that the transfer edge belongs to the exact same schedule as the lineage event
ALTER TABLE "InstallmentLineageTransferEdge" 
  ADD CONSTRAINT "fk_edge_event_schedule" 
  FOREIGN KEY ("eventId", "scheduleId") 
  REFERENCES "InstallmentLineageEvent"("id", "scheduleId") 
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- 5. Lineage Edge Source Installment & Schedule Ownership:
-- Enforces that non-null source installment belongs to the same schedule as the edge (PostgreSQL MATCH SIMPLE)
ALTER TABLE "InstallmentLineageTransferEdge" 
  ADD CONSTRAINT "fk_edge_source_installment_schedule" 
  FOREIGN KEY ("sourceInstallmentId", "scheduleId") 
  REFERENCES "AdmissionInstallment"("id", "scheduleId") 
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- 6. Lineage Edge Result Installment & Schedule Ownership:
-- Enforces that the result installment belongs to the same schedule as the edge
ALTER TABLE "InstallmentLineageTransferEdge" 
  ADD CONSTRAINT "fk_edge_result_installment_schedule" 
  FOREIGN KEY ("resultInstallmentId", "scheduleId") 
  REFERENCES "AdmissionInstallment"("id", "scheduleId") 
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- 7. Reversal Event & Allocation Payment Ownership:
-- Enforces that the reversal event belongs to the payment declared on the adjustment row
ALTER TABLE "InstallmentAllocationReversalEvent" 
  ADD CONSTRAINT "fk_reversal_alloc_reversal_event" 
  FOREIGN KEY ("paymentReversalEventId", "feePaymentId") 
  REFERENCES "PaymentReversalEvent"("id", "feePaymentId") 
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- 8. Target Allocation & Reversal Payment Ownership:
-- Enforces that the target allocation belongs to the exact same payment declared on the adjustment row
ALTER TABLE "InstallmentAllocationReversalEvent" 
  ADD CONSTRAINT "fk_reversal_alloc_allocation" 
  FOREIGN KEY ("allocationId", "feePaymentId") 
  REFERENCES "FeePaymentInstallmentAllocation"("id", "feePaymentId") 
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================
-- POSITIVE & NON-NEGATIVE CHECK CONSTRAINTS (Tasks 04A.7 - 04A.9)
-- ============================================================================

-- Strict positive amount on transfer edges
ALTER TABLE "InstallmentLineageTransferEdge" 
  ADD CONSTRAINT "chk_transfer_edge_positive_amount" 
  CHECK ("amount" > 0);

-- Strict positive reversal amount on PaymentReversalEvent
ALTER TABLE "PaymentReversalEvent" 
  ADD CONSTRAINT "chk_payment_reversal_positive_amount" 
  CHECK ("reversalAmount" > 0);

-- Strict positive adjustment amount on InstallmentAllocationReversalEvent
ALTER TABLE "InstallmentAllocationReversalEvent" 
  ADD CONSTRAINT "chk_alloc_reversal_positive_amount" 
  CHECK ("amount" > 0);

-- Strict positive allocated amount on FeePaymentInstallmentAllocation
ALTER TABLE "FeePaymentInstallmentAllocation" 
  ADD CONSTRAINT "chk_alloc_positive_allocated_amount" 
  CHECK ("allocatedAmount" > 0);

-- Strict non-negative reversed amount counter on FeePaymentInstallmentAllocation
ALTER TABLE "FeePaymentInstallmentAllocation" 
  ADD CONSTRAINT "chk_alloc_non_negative_reversed_amount" 
  CHECK ("reversedAmount" >= 0);

-- Strict positive amount on AdmissionInstallment
ALTER TABLE "AdmissionInstallment" 
  ADD CONSTRAINT "chk_installment_positive_amount" 
  CHECK ("amount" > 0);
