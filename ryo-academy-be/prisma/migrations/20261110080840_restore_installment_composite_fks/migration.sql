-- DropForeignKey
ALTER TABLE "AdmissionInstallmentSchedule" DROP CONSTRAINT "AdmissionInstallmentSchedule_feePaymentHeaderId_fkey";

-- DropForeignKey
ALTER TABLE "FeePaymentInstallmentAllocation" DROP CONSTRAINT "FeePaymentInstallmentAllocation_feePaymentId_fkey";

-- DropForeignKey
ALTER TABLE "FeePaymentInstallmentAllocation" DROP CONSTRAINT "FeePaymentInstallmentAllocation_installmentId_fkey";

-- AddForeignKey
ALTER TABLE "AdmissionInstallmentSchedule" ADD CONSTRAINT "AdmissionInstallmentSchedule_feePaymentHeaderId_admissionI_fkey" FOREIGN KEY ("feePaymentHeaderId", "admissionId") REFERENCES "FeePaymentHeader"("id", "admissionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeePaymentInstallmentAllocation" ADD CONSTRAINT "FeePaymentInstallmentAllocation_feePaymentId_feePaymentHea_fkey" FOREIGN KEY ("feePaymentId", "feePaymentHeaderId") REFERENCES "FeePayment"("id", "feePaymentHeaderId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeePaymentInstallmentAllocation" ADD CONSTRAINT "FeePaymentInstallmentAllocation_installmentId_feePaymentHe_fkey" FOREIGN KEY ("installmentId", "feePaymentHeaderId") REFERENCES "AdmissionInstallment"("id", "feePaymentHeaderId") ON DELETE RESTRICT ON UPDATE CASCADE;
