-- DropForeignKey
ALTER TABLE "AdmissionInstallment" DROP CONSTRAINT "fk_installment_schedule_header";

-- DropForeignKey
ALTER TABLE "AdmissionInstallmentSchedule" DROP CONSTRAINT "fk_schedule_header_admission";

-- DropForeignKey
ALTER TABLE "FeePaymentInstallmentAllocation" DROP CONSTRAINT "fk_alloc_installment_header";

-- DropForeignKey
ALTER TABLE "FeePaymentInstallmentAllocation" DROP CONSTRAINT "fk_alloc_payment_header";

-- DropForeignKey
ALTER TABLE "InstallmentAllocationReversalEvent" DROP CONSTRAINT "fk_reversal_alloc_allocation";

-- DropForeignKey
ALTER TABLE "InstallmentAllocationReversalEvent" DROP CONSTRAINT "fk_reversal_alloc_reversal_event";

-- DropForeignKey
ALTER TABLE "InstallmentLineageTransferEdge" DROP CONSTRAINT "fk_edge_event_schedule";

-- DropForeignKey
ALTER TABLE "InstallmentLineageTransferEdge" DROP CONSTRAINT "fk_edge_result_installment_schedule";

-- DropForeignKey
ALTER TABLE "InstallmentLineageTransferEdge" DROP CONSTRAINT "fk_edge_source_installment_schedule";

-- AlterTable
ALTER TABLE "OffsetBackfillRun" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- RenameForeignKey
ALTER TABLE "FeePaymentDetailAttribution" RENAME CONSTRAINT "FeePaymentDetailAttribution_detail_header_fkey" TO "FeePaymentDetailAttribution_feePaymentDetailsId_feePayment_fkey";

-- RenameForeignKey
ALTER TABLE "FeePaymentDetailAttribution" RENAME CONSTRAINT "FeePaymentDetailAttribution_header_fkey" TO "FeePaymentDetailAttribution_feePaymentHeaderId_fkey";

-- RenameForeignKey
ALTER TABLE "FeePaymentDetailAttribution" RENAME CONSTRAINT "FeePaymentDetailAttribution_payment_header_fkey" TO "FeePaymentDetailAttribution_feePaymentId_feePaymentHeaderI_fkey";

-- RenameIndex
ALTER INDEX "FeePaymentDetailAttribution_feePaymentId_feePaymentDetailsId_ke" RENAME TO "FeePaymentDetailAttribution_feePaymentId_feePaymentDetailsI_key";

-- RenameIndex
ALTER INDEX "FeePaymentDetails_uq_detail_id_header" RENAME TO "FeePaymentDetails_id_feePaymentHeaderId_key";
