import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * BUG-5 regression guard.
 *
 * The uniqueness of an admission used to be enforced on
 * (academicYearId, programId, classId), which allowed at most one student per
 * class per academic year. The real boundaries are `admissionNumber` and
 * `Student.admissionId`. These tests assert the schema keeps that shape so the
 * constraint cannot silently come back.
 *
 * The database-level behaviour itself is proven by the live HTTP verification;
 * this guards the contract in the schema that produces it.
 */
const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');

const ADMISSION_MODEL = 'prisma/models/admission_fees/admission.prisma';
const STUDENT_MODEL = 'prisma/models/admission_fees/student.prisma';
const MIGRATION = 'prisma/migrations/20260926120000_admission_allow_multiple_per_class/migration.sql';

describe('Admission uniqueness (BUG-5)', () => {
  it('does NOT restrict admissions to one per academicYear/program/class', () => {
    const schema = read(ADMISSION_MODEL);
    expect(schema).not.toMatch(/@@unique\(\s*\[academicYearId,\s*programId,\s*classId\]\s*\)/);
  });

  it('keeps the non-unique index for per-class lookups', () => {
    const schema = read(ADMISSION_MODEL);
    expect(schema).toMatch(/@@index\(\s*\[academicYearId,\s*programId,\s*classId\]\s*\)/);
  });

  it('keeps admissionNumber unique as the real per-admission boundary', () => {
    const schema = read(ADMISSION_MODEL);
    expect(schema).toMatch(/admissionNumber\s+String\s+@unique/);
  });

  it('keeps the student <-> admission one-to-one boundary', () => {
    const schema = read(STUDENT_MODEL);
    expect(schema).toMatch(/admissionId\s+String\s+@unique/);
  });

  it('has a migration that drops only the incorrect unique index', () => {
    const sql = read(MIGRATION);
    expect(sql).toMatch(/DROP INDEX\s+"Admission_academicYearId_programId_classId_key"/);
    // The useful index and the real unique keys must survive.
    expect(sql).not.toMatch(/DROP INDEX\s+"Admission_academicYearId_programId_classId_idx"/);
    expect(sql).not.toMatch(/DROP INDEX\s+"Admission_admissionNumber_key"/);
  });

  it('leaves FeeStructure uniqueness intact (one fee plan per class/year)', () => {
    const schema = read('prisma/models/admission_fees/fee-structure.prisma');
    expect(schema).toMatch(/@@unique\(\s*\[academicYearId,\s*programId,\s*classId\]\s*\)/);
  });

  it('no longer keys the admission fixture on the removed compound key', () => {
    const seed = read('src/database/seed/attendance-dev.seed.ts');
    expect(seed).not.toMatch(/admission\.upsert\(/);
    // fee-dev.seed still legitimately uses the FeeStructure compound key.
    const feeSeed = read('src/database/seed/fee-dev.seed.ts');
    expect(feeSeed).toMatch(/feeStructure\.upsert\(/);
  });
});
