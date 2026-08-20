/*
  Warnings:

  - You are about to drop the column `schoolCode` on the `Class` table. All the data in the column will be lost.
  - You are about to drop the column `schoolCode` on the `Program` table. All the data in the column will be lost.
  - You are about to drop the column `schoolCode` on the `Section` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Class" DROP COLUMN "schoolCode";

-- AlterTable
ALTER TABLE "Program" DROP COLUMN "schoolCode";

-- AlterTable
ALTER TABLE "Section" DROP COLUMN "schoolCode";
