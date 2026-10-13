-- CreateTable
CREATE TABLE "FeePayment" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "admissionId" TEXT NOT NULL,
    "feePaymentHeaderId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeePayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FeePayment_idempotencyKey_key" ON "FeePayment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "FeePayment_schoolId_createdAt_idx" ON "FeePayment"("schoolId", "createdAt");

-- CreateIndex
CREATE INDEX "FeePayment_studentId_createdAt_idx" ON "FeePayment"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "FeePayment_feePaymentHeaderId_createdAt_idx" ON "FeePayment"("feePaymentHeaderId", "createdAt");

-- AddForeignKey
ALTER TABLE "FeePayment" ADD CONSTRAINT "FeePayment_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeePayment" ADD CONSTRAINT "FeePayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeePayment" ADD CONSTRAINT "FeePayment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeePayment" ADD CONSTRAINT "FeePayment_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "Admission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeePayment" ADD CONSTRAINT "FeePayment_feePaymentHeaderId_fkey" FOREIGN KEY ("feePaymentHeaderId") REFERENCES "FeePaymentHeader"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
