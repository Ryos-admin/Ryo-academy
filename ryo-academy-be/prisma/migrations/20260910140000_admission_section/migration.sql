-- Add section placement to admissions.
ALTER TABLE "Admission" ADD COLUMN "sectionId" TEXT NOT NULL;

ALTER TABLE "Admission" ADD CONSTRAINT "Admission_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
