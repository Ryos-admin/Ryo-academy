/* Migration to add historicalStaffId column and foreign key to TeachingAssignment */
ALTER TABLE "TeachingAssignment" ADD COLUMN "historicalStaffId" TEXT;
ALTER TABLE "TeachingAssignment" ADD CONSTRAINT "TeachingAssignment_historicalStaffId_fkey"
  FOREIGN KEY ("historicalStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL;
