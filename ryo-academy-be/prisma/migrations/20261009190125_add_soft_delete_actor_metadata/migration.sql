-- DropForeignKey
ALTER TABLE "TeachingAssignment" DROP CONSTRAINT "TeachingAssignment_staffId_fkey";

-- AlterTable
ALTER TABLE "AcademicCalendar" ADD COLUMN     "deletedById" TEXT;

-- AlterTable
ALTER TABLE "AcademicYear" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedById" TEXT;

-- AlterTable
ALTER TABLE "Admission" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Class" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedById" TEXT;

-- AlterTable
ALTER TABLE "Program" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedById" TEXT;

-- AlterTable
ALTER TABLE "Section" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedById" TEXT;

-- AlterTable
ALTER TABLE "Staff" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedById" TEXT;

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Subjects" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedById" TEXT;

-- AlterTable
ALTER TABLE "TeachingAssignment" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedById" TEXT,
ALTER COLUMN "staffId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedById" TEXT;

-- CreateIndex
CREATE INDEX "AcademicCalendar_deletedById_idx" ON "AcademicCalendar"("deletedById");

-- CreateIndex
CREATE INDEX "AcademicYear_isActive_deletedAt_idx" ON "AcademicYear"("isActive", "deletedAt");

-- CreateIndex
CREATE INDEX "AcademicYear_deletedById_idx" ON "AcademicYear"("deletedById");

-- CreateIndex
CREATE INDEX "Class_isActive_deletedAt_idx" ON "Class"("isActive", "deletedAt");

-- CreateIndex
CREATE INDEX "Class_deletedById_idx" ON "Class"("deletedById");

-- CreateIndex
CREATE INDEX "Program_isActive_deletedAt_idx" ON "Program"("isActive", "deletedAt");

-- CreateIndex
CREATE INDEX "Program_deletedById_idx" ON "Program"("deletedById");

-- CreateIndex
CREATE INDEX "Section_isActive_deletedAt_idx" ON "Section"("isActive", "deletedAt");

-- CreateIndex
CREATE INDEX "Section_deletedById_idx" ON "Section"("deletedById");

-- CreateIndex
CREATE INDEX "Staff_deletedById_idx" ON "Staff"("deletedById");

-- CreateIndex
CREATE INDEX "Subjects_deletedById_idx" ON "Subjects"("deletedById");

-- CreateIndex
CREATE INDEX "TeachingAssignment_deletedById_idx" ON "TeachingAssignment"("deletedById");

-- CreateIndex
CREATE INDEX "User_deletedById_idx" ON "User"("deletedById");

-- AddForeignKey
ALTER TABLE "AcademicYear" ADD CONSTRAINT "AcademicYear_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Class" ADD CONSTRAINT "Class_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Program" ADD CONSTRAINT "Program_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeachingAssignment" ADD CONSTRAINT "TeachingAssignment_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeachingAssignment" ADD CONSTRAINT "TeachingAssignment_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subjects" ADD CONSTRAINT "Subjects_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicCalendar" ADD CONSTRAINT "AcademicCalendar_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
