-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENTAGE', 'FIXED');

-- CreateTable
CREATE TABLE "AdmissionFeeConcession" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "admissionId" TEXT NOT NULL,
    "feePaymentDetailsId" TEXT NOT NULL,
    "concessionCategoryId" TEXT NOT NULL,
    "discountType" "DiscountType" NOT NULL,
    "discountValue" DECIMAL(65,30) NOT NULL,
    "calculatedDiscountAmount" DECIMAL(65,30) NOT NULL,
    "justification" TEXT,
    "appliedById" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdmissionFeeConcession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeeConcessionCategory" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeeConcessionCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdmissionFeeConcession_feePaymentDetailsId_key" ON "AdmissionFeeConcession"("feePaymentDetailsId");

-- CreateIndex
CREATE INDEX "AdmissionFeeConcession_admissionId_idx" ON "AdmissionFeeConcession"("admissionId");

-- CreateIndex
CREATE INDEX "AdmissionFeeConcession_schoolId_createdAt_idx" ON "AdmissionFeeConcession"("schoolId", "createdAt");

-- CreateIndex
CREATE INDEX "FeeConcessionCategory_schoolId_isActive_idx" ON "FeeConcessionCategory"("schoolId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "FeeConcessionCategory_schoolId_code_key" ON "FeeConcessionCategory"("schoolId", "code");

-- AddForeignKey
ALTER TABLE "AdmissionFeeConcession" ADD CONSTRAINT "AdmissionFeeConcession_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmissionFeeConcession" ADD CONSTRAINT "AdmissionFeeConcession_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "Admission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmissionFeeConcession" ADD CONSTRAINT "AdmissionFeeConcession_feePaymentDetailsId_fkey" FOREIGN KEY ("feePaymentDetailsId") REFERENCES "FeePaymentDetails"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmissionFeeConcession" ADD CONSTRAINT "AdmissionFeeConcession_concessionCategoryId_fkey" FOREIGN KEY ("concessionCategoryId") REFERENCES "FeeConcessionCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmissionFeeConcession" ADD CONSTRAINT "AdmissionFeeConcession_appliedById_fkey" FOREIGN KEY ("appliedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeConcessionCategory" ADD CONSTRAINT "FeeConcessionCategory_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
