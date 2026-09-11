-- CreateEnum
CREATE TYPE "DayType" AS ENUM ('WORKING_DAY', 'WEEKEND', 'HOLIDAY', 'SPECIAL_WORKING_DAY');

-- CreateEnum
CREATE TYPE "AttendanceMasterStatus" AS ENUM ('DRAFT', 'SUBMITTED');

-- CreateEnum
CREATE TYPE "StudentAttendanceStatus" AS ENUM ('PRESENT', 'ABSENT');

-- CreateTable
CREATE TABLE "AcademicCalendar" (
    "id" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "dayType" "DayType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "isWorkingDay" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AcademicCalendar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceLogMaster" (
    "id" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "takenBy" TEXT NOT NULL,
    "status" "AttendanceMasterStatus" NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AttendanceLogMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceLogChild" (
    "id" TEXT NOT NULL,
    "attendanceMasterId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" "StudentAttendanceStatus" NOT NULL,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceLogChild_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AcademicCalendar_academicYearId_date_key" ON "AcademicCalendar"("academicYearId", "date");
CREATE UNIQUE INDEX "AttendanceLogMaster_academicYearId_classId_sectionId_date_key" ON "AttendanceLogMaster"("academicYearId", "classId", "sectionId", "date");
CREATE INDEX "AttendanceLogMaster_classId_sectionId_date_idx" ON "AttendanceLogMaster"("classId", "sectionId", "date");
CREATE UNIQUE INDEX "AttendanceLogChild_attendanceMasterId_studentId_key" ON "AttendanceLogChild"("attendanceMasterId", "studentId");
CREATE INDEX "AttendanceLogChild_studentId_idx" ON "AttendanceLogChild"("studentId");

-- AddForeignKey
ALTER TABLE "AcademicCalendar" ADD CONSTRAINT "AcademicCalendar_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceLogMaster" ADD CONSTRAINT "AttendanceLogMaster_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceLogMaster" ADD CONSTRAINT "AttendanceLogMaster_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceLogMaster" ADD CONSTRAINT "AttendanceLogMaster_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceLogMaster" ADD CONSTRAINT "AttendanceLogMaster_takenBy_fkey" FOREIGN KEY ("takenBy") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceLogChild" ADD CONSTRAINT "AttendanceLogChild_attendanceMasterId_fkey" FOREIGN KEY ("attendanceMasterId") REFERENCES "AttendanceLogMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceLogChild" ADD CONSTRAINT "AttendanceLogChild_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
