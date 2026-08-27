/*
  Warnings:

  - You are about to drop the column `studentId` on the `FeePaymentHeader` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[schoolId,name]` on the table `AcademicYear` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[academicYearId,admissionId,feeStructureId]` on the table `FeePaymentHeader` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `schoolId` to the `Admission` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "AcademicYear" DROP CONSTRAINT "AcademicYear_schoolCode_fkey";

-- DropForeignKey
ALTER TABLE "FeePaymentHeader" DROP CONSTRAINT "FeePaymentHeader_studentId_fkey";

-- DropIndex
DROP INDEX "AcademicYear_schoolCode_idx";

-- DropIndex
DROP INDEX "AcademicYear_schoolCode_name_key";

-- DropIndex
DROP INDEX "FeePaymentHeader_academicYearId_studentId_admissionId_feeSt_idx";

-- DropIndex
DROP INDEX "FeePaymentHeader_academicYearId_studentId_admissionId_feeSt_key";

-- AlterTable
ALTER TABLE "AcademicYear" ADD COLUMN     "schoolId" TEXT,
ALTER COLUMN "schoolCode" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Admission" ADD COLUMN     "schoolId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "FeeComponent" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "FeePaymentHeader" DROP COLUMN "studentId";

-- CreateIndex
CREATE INDEX "AcademicYear_schoolId_idx" ON "AcademicYear"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "AcademicYear_schoolId_name_key" ON "AcademicYear"("schoolId", "name");

-- CreateIndex
CREATE INDEX "FeePaymentHeader_academicYearId_admissionId_feeStructureId_idx" ON "FeePaymentHeader"("academicYearId", "admissionId", "feeStructureId");

-- CreateIndex
CREATE UNIQUE INDEX "FeePaymentHeader_academicYearId_admissionId_feeStructureId_key" ON "FeePaymentHeader"("academicYearId", "admissionId", "feeStructureId");

-- AddForeignKey
ALTER TABLE "AcademicYear" ADD CONSTRAINT "AcademicYear_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
