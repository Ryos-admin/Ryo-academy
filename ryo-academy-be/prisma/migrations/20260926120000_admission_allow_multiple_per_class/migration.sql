-- Drop the incorrect uniqueness on (academicYearId, programId, classId).
--
-- It allowed at most one admission per class per academic year, which is
-- incompatible with a class holding many students. The real boundaries are
-- already enforced elsewhere:
--   * "Admission_admissionNumber_key"  -> UNIQUE (admissionNumber)
--   * Student_admissionId_key          -> UNIQUE (one student maps to one admission)
--
-- The non-unique index Admission_academicYearId_programId_classId_idx is
-- deliberately kept: it backs the per-class lookups that used to be served by
-- the unique index.

DROP INDEX "Admission_academicYearId_programId_classId_key";
