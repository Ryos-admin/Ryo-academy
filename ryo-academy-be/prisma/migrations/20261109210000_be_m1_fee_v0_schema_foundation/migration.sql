-- CreateEnum
CREATE TYPE "FeePricingVersion" AS ENUM ('LEGACY', 'V0_SNAPSHOTTED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'LEGACY_UNSPECIFIED');

-- AlterTable FeeStructure: add gstPercentage with deliberate default 0.00
ALTER TABLE "FeeStructure" ADD COLUMN "gstPercentage" DECIMAL(5, 2) NOT NULL DEFAULT 0.00;

-- AlterTable FeePaymentHeader: add pricingVersion (classified as LEGACY), taxableAmount, gstAmount
ALTER TABLE "FeePaymentHeader" ADD COLUMN "pricingVersion" "FeePricingVersion";
UPDATE "FeePaymentHeader" SET "pricingVersion" = 'LEGACY' WHERE "pricingVersion" IS NULL;
ALTER TABLE "FeePaymentHeader" ALTER COLUMN "pricingVersion" SET NOT NULL;

ALTER TABLE "FeePaymentHeader" ADD COLUMN "taxableAmount" DECIMAL(12, 2);
ALTER TABLE "FeePaymentHeader" ADD COLUMN "gstAmount" DECIMAL(12, 2);

-- AlterTable FeePaymentDetails: add nullable snapshot fields
ALTER TABLE "FeePaymentDetails" ADD COLUMN "discountPercentage" DECIMAL(5, 2);
ALTER TABLE "FeePaymentDetails" ADD COLUMN "taxableAmount" DECIMAL(12, 2);
ALTER TABLE "FeePaymentDetails" ADD COLUMN "gstPercentage" DECIMAL(5, 2);
ALTER TABLE "FeePaymentDetails" ADD COLUMN "gstAmount" DECIMAL(12, 2);

-- AlterTable FeePayment: add paymentMethod (classified as LEGACY_UNSPECIFIED), make studentId nullable
ALTER TABLE "FeePayment" ADD COLUMN "paymentMethod" "PaymentMethod";
UPDATE "FeePayment" SET "paymentMethod" = 'LEGACY_UNSPECIFIED' WHERE "paymentMethod" IS NULL;
ALTER TABLE "FeePayment" ALTER COLUMN "paymentMethod" SET NOT NULL;

-- DropForeignKey
ALTER TABLE "FeePayment" DROP CONSTRAINT IF EXISTS "FeePayment_feePaymentHeaderId_fkey";
ALTER TABLE "FeePayment" DROP CONSTRAINT IF EXISTS "FeePayment_studentId_fkey";

-- AlterColumn FeePayment.studentId to nullable
ALTER TABLE "FeePayment" ALTER COLUMN "studentId" DROP NOT NULL;

-- AddForeignKey FeePayment.studentId -> Student(id) with SET NULL
ALTER TABLE "FeePayment" ADD CONSTRAINT "FeePayment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Prerequisite: Ensure explicit composite unique constraint on FeePaymentHeader(id, admissionId) exists before foreign key reference
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FeePaymentHeader_id_admissionId_key'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM pg_indexes WHERE tablename = 'FeePaymentHeader' AND indexname = 'FeePaymentHeader_id_admissionId_key'
    ) THEN
      ALTER TABLE "FeePaymentHeader" ADD CONSTRAINT "FeePaymentHeader_id_admissionId_key" UNIQUE USING INDEX "FeePaymentHeader_id_admissionId_key";
    ELSE
      ALTER TABLE "FeePaymentHeader" ADD CONSTRAINT "FeePaymentHeader_id_admissionId_key" UNIQUE ("id", "admissionId");
    END IF;
  END IF;
END $$;

-- AddForeignKey: Composite foreign key from FeePayment(feePaymentHeaderId, admissionId) to FeePaymentHeader(id, admissionId)
ALTER TABLE "FeePayment" ADD CONSTRAINT "FeePayment_feePaymentHeaderId_admissionId_fkey" FOREIGN KEY ("feePaymentHeaderId", "admissionId") REFERENCES "FeePaymentHeader"("id", "admissionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex: FeePayment(admissionId, createdAt)
CREATE INDEX "FeePayment_admissionId_createdAt_idx" ON "FeePayment"("admissionId", "createdAt");
