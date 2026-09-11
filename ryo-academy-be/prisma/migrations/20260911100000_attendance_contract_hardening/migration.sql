DROP INDEX IF EXISTS "AttendanceLogMaster_academicYearId_classId_sectionId_date_key";

CREATE INDEX "AttendanceLogMaster_academicYearId_classId_sectionId_date_idx"
ON "AttendanceLogMaster"("academicYearId", "classId", "sectionId", "date");

CREATE UNIQUE INDEX "AttendanceLogMaster_active_register_key"
ON "AttendanceLogMaster"("academicYearId", "classId", "sectionId", "date")
WHERE "deletedAt" IS NULL;