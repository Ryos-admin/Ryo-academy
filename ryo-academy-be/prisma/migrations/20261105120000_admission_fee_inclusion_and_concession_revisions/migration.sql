-- Add admission-level inclusion without changing existing snapshot values.
ALTER TABLE "FeePaymentDetails"
ADD COLUMN "isIncluded" BOOLEAN NOT NULL DEFAULT true;

-- Backfill calculation mode from the only two existing legacy discount types.
CREATE TYPE "CalculationMode" AS ENUM ('LEGACY_PERCENTAGE', 'LEGACY_FIXED', 'PAYABLE');

ALTER TABLE "AdmissionFeeConcession"
ADD COLUMN "calculationMode" "CalculationMode";

UPDATE "AdmissionFeeConcession"
SET "calculationMode" = CASE "discountType"
    WHEN 'PERCENTAGE' THEN 'LEGACY_PERCENTAGE'::"CalculationMode"
    WHEN 'FIXED' THEN 'LEGACY_FIXED'::"CalculationMode"
END;

ALTER TABLE "AdmissionFeeConcession"
ALTER COLUMN "calculationMode" SET NOT NULL,
ADD COLUMN "requiresReview" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "concessionCategoryId" DROP NOT NULL,
ALTER COLUMN "discountType" DROP NOT NULL,
ALTER COLUMN "discountValue" DROP NOT NULL;

CREATE TABLE "AdmissionFeeConcessionRevision" (
    "id" TEXT NOT NULL,
    "sourceConcessionId" TEXT NOT NULL,
    "calculationMode" "CalculationMode" NOT NULL,
    "discountType" "DiscountType",
    "discountValue" DECIMAL(65,30),
    "concessionCategoryId" TEXT,
    "previousPayableAmount" DECIMAL(65,30),
    "calculatedDiscountAmount" DECIMAL(65,30) NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdmissionFeeConcessionRevision_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AdmissionFeeConcessionRevision_sourceConcessionId_idx"
ON "AdmissionFeeConcessionRevision"("sourceConcessionId");

ALTER TABLE "AdmissionFeeConcessionRevision"
ADD CONSTRAINT "AdmissionFeeConcessionRevision_sourceConcessionId_fkey"
FOREIGN KEY ("sourceConcessionId") REFERENCES "AdmissionFeeConcession"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "AdmissionFeeConcessionRevision_actorId_fkey"
FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
