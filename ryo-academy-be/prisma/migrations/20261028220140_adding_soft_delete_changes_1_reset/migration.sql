/*
  Warnings:

  - A unique constraint covering the columns `[schoolId,name]` on the table `AcademicYear` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "AcademicYear_schoolId_name_deletedAt_key";

-- CreateIndex
CREATE UNIQUE INDEX "AcademicYear_schoolId_name_key" ON "AcademicYear"("schoolId", "name");
