-- AlterTable
ALTER TABLE "School" ADD COLUMN "activeAcademicYearId" TEXT;

-- CreateIndex
CREATE INDEX "School_activeAcademicYearId_idx" ON "School"("activeAcademicYearId");

-- AddForeignKey
ALTER TABLE "School" ADD CONSTRAINT "School_activeAcademicYearId_fkey" FOREIGN KEY ("activeAcademicYearId") REFERENCES "AcademicYear"("id") ON DELETE SET NULL ON UPDATE CASCADE;
