-- DropForeignKey
ALTER TABLE "TeachingAssignment" DROP CONSTRAINT "TeachingAssignment_historicalStaffId_fkey";

-- AddForeignKey
ALTER TABLE "TeachingAssignment" ADD CONSTRAINT "TeachingAssignment_historicalStaffId_fkey" FOREIGN KEY ("historicalStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
