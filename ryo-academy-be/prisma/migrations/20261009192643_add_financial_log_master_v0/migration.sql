-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('SALARY', 'UTILITIES', 'SUPPLIES', 'MAINTENANCE', 'TRANSPORT', 'RENT', 'OTHER');

-- CreateEnum
CREATE TYPE "FinancialLogType" AS ENUM ('FEE_PAYMENT', 'EXPENSE', 'EXPENSE_REVERSAL');

-- CreateEnum
CREATE TYPE "FinancialFlowType" AS ENUM ('INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "FinancialSourceType" AS ENUM ('FEE_PAYMENT', 'EXPENSE');

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialLog" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "FinancialLogType" NOT NULL,
    "flowType" "FinancialFlowType" NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "sourceType" "FinancialSourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Expense_schoolId_occurredAt_idx" ON "Expense"("schoolId", "occurredAt");

-- CreateIndex
CREATE INDEX "Expense_schoolId_isActive_deletedAt_idx" ON "Expense"("schoolId", "isActive", "deletedAt");

-- CreateIndex
CREATE INDEX "Expense_deletedById_idx" ON "Expense"("deletedById");

-- CreateIndex
CREATE INDEX "FinancialLog_schoolId_occurredAt_idx" ON "FinancialLog"("schoolId", "occurredAt");

-- CreateIndex
CREATE INDEX "FinancialLog_schoolId_flowType_occurredAt_idx" ON "FinancialLog"("schoolId", "flowType", "occurredAt");

-- CreateIndex
CREATE INDEX "FinancialLog_sourceType_sourceId_idx" ON "FinancialLog"("sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialLog_sourceType_sourceId_type_key" ON "FinancialLog"("sourceType", "sourceId", "type");

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialLog" ADD CONSTRAINT "FinancialLog_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialLog" ADD CONSTRAINT "FinancialLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
