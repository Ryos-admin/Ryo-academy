-- CreateEnum
CREATE TYPE "AdmissionStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "Relation" AS ENUM ('FATHER', 'MOTHER', 'GUARDIAN');

-- CreateTable
CREATE TABLE "Admission" (
    "id" TEXT NOT NULL,
    "admissionNumber" TEXT NOT NULL,
    "admissionSequence" INTEGER NOT NULL,
    "admissionStatus" "AdmissionStatus" NOT NULL DEFAULT 'DRAFT',
    "academicYearId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "studentName" TEXT NOT NULL,
    "gender" "Gender" NOT NULL,
    "dateOfBirth" TIMESTAMP(3) NOT NULL,
    "parentName" TEXT NOT NULL,
    "parentRelation" "Relation" NOT NULL,
    "parentPhone" TEXT NOT NULL,
    "parentAlternatePhone" TEXT,
    "parentEmail" TEXT,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'India',
    "discountPercentage" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "discountReason" TEXT,
    "studentId" TEXT,
    "createdById" TEXT NOT NULL,
    "confirmedById" TEXT,
    "cancelledById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Admission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeeComponent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "amount" DECIMAL(65,30) NOT NULL,
    "feeStructureId" TEXT NOT NULL,
    "discountApplicable" BOOLEAN NOT NULL DEFAULT false,
    "isMandatory" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeeComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeePaymentDetails" (
    "id" TEXT NOT NULL,
    "feePaymentHeaderId" TEXT NOT NULL,
    "feeComponentId" TEXT NOT NULL,
    "nameSnapshot" TEXT NOT NULL,
    "originalAmount" DECIMAL(65,30) NOT NULL,
    "discountApplicable" BOOLEAN NOT NULL,
    "isMandatory" BOOLEAN NOT NULL,
    "discountAmount" DECIMAL(65,30) NOT NULL,
    "finalAmount" DECIMAL(65,30) NOT NULL,
    "totalAmountToBePaid" DECIMAL(65,30) NOT NULL,
    "amountPaid" DECIMAL(65,30) NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeePaymentDetails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeePaymentHeader" (
    "id" TEXT NOT NULL,
    "admissionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "feeStructureId" TEXT NOT NULL,
    "grossAmount" DECIMAL(65,30) NOT NULL,
    "discountAmount" DECIMAL(65,30) NOT NULL,
    "netAmount" DECIMAL(65,30) NOT NULL,
    "totalPaidAmount" DECIMAL(65,30) NOT NULL,
    "totalDueAmount" DECIMAL(65,30) NOT NULL,
    "totalFeeAmount" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeePaymentHeader_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeeStructure" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "academicYearId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "totalAmount" DECIMAL(65,30) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeeStructure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Student" (
    "id" TEXT NOT NULL,
    "studentName" TEXT NOT NULL,
    "studentNumber" TEXT NOT NULL,
    "studentSequence" INTEGER NOT NULL,
    "admissionId" TEXT NOT NULL,
    "gender" "Gender" NOT NULL,
    "dateOfBirth" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Student_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Admission_admissionNumber_key" ON "Admission"("admissionNumber");

-- CreateIndex
CREATE INDEX "Admission_academicYearId_programId_classId_idx" ON "Admission"("academicYearId", "programId", "classId");

-- CreateIndex
CREATE UNIQUE INDEX "Admission_academicYearId_programId_classId_key" ON "Admission"("academicYearId", "programId", "classId");

-- CreateIndex
CREATE INDEX "FeeComponent_feeStructureId_idx" ON "FeeComponent"("feeStructureId");

-- CreateIndex
CREATE UNIQUE INDEX "FeeComponent_feeStructureId_name_key" ON "FeeComponent"("feeStructureId", "name");

-- CreateIndex
CREATE INDEX "FeePaymentDetails_feePaymentHeaderId_feeComponentId_idx" ON "FeePaymentDetails"("feePaymentHeaderId", "feeComponentId");

-- CreateIndex
CREATE UNIQUE INDEX "FeePaymentDetails_feePaymentHeaderId_feeComponentId_key" ON "FeePaymentDetails"("feePaymentHeaderId", "feeComponentId");

-- CreateIndex
CREATE INDEX "FeePaymentHeader_academicYearId_studentId_admissionId_feeSt_idx" ON "FeePaymentHeader"("academicYearId", "studentId", "admissionId", "feeStructureId");

-- CreateIndex
CREATE UNIQUE INDEX "FeePaymentHeader_academicYearId_studentId_admissionId_feeSt_key" ON "FeePaymentHeader"("academicYearId", "studentId", "admissionId", "feeStructureId");

-- CreateIndex
CREATE INDEX "FeeStructure_academicYearId_programId_classId_idx" ON "FeeStructure"("academicYearId", "programId", "classId");

-- CreateIndex
CREATE UNIQUE INDEX "FeeStructure_academicYearId_programId_classId_key" ON "FeeStructure"("academicYearId", "programId", "classId");

-- CreateIndex
CREATE UNIQUE INDEX "Student_studentNumber_key" ON "Student"("studentNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Student_admissionId_key" ON "Student"("admissionId");

-- AddForeignKey
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeComponent" ADD CONSTRAINT "FeeComponent_feeStructureId_fkey" FOREIGN KEY ("feeStructureId") REFERENCES "FeeStructure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeePaymentDetails" ADD CONSTRAINT "FeePaymentDetails_feePaymentHeaderId_fkey" FOREIGN KEY ("feePaymentHeaderId") REFERENCES "FeePaymentHeader"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeePaymentDetails" ADD CONSTRAINT "FeePaymentDetails_feeComponentId_fkey" FOREIGN KEY ("feeComponentId") REFERENCES "FeeComponent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeePaymentHeader" ADD CONSTRAINT "FeePaymentHeader_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "Admission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeePaymentHeader" ADD CONSTRAINT "FeePaymentHeader_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeePaymentHeader" ADD CONSTRAINT "FeePaymentHeader_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeePaymentHeader" ADD CONSTRAINT "FeePaymentHeader_feeStructureId_fkey" FOREIGN KEY ("feeStructureId") REFERENCES "FeeStructure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeStructure" ADD CONSTRAINT "FeeStructure_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeStructure" ADD CONSTRAINT "FeeStructure_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeStructure" ADD CONSTRAINT "FeeStructure_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "Admission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
