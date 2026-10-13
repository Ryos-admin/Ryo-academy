import assert from "node:assert/strict";
import { AcademicYearService } from "../src/academic/academic-year/academic-year.service.js";
import { StaffService } from "../src/academic/staff/staff.service.js";
import { SubjectService } from "../src/academic/subject/subject.service.js";
import { PasswordService } from "../src/security/password/password.service.js";
import { DatabaseService } from "../src/database/database.service.js";

const databaseUrl = process.env.DATABASE_URL;
const expected = "postgresql://127.0.0.1:55432/ryo_qa";

function checkQaTarget() {
  assert.ok(databaseUrl, "DATABASE_URL must be set for the QA harness");
  const url = new URL(databaseUrl);
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.port, "55432");
  assert.equal(url.pathname, "/ryo_qa");
}

function expectError(action: () => Promise<unknown>, name: string) {
  return action().then(
    () => { throw new Error(`${name} unexpectedly succeeded`); },
    (error: any) => { assert.ok(error?.constructor?.name || error); },
  );
}

async function main() {
  checkQaTarget();
  const db = new DatabaseService({ getOrThrow: () => databaseUrl } as any);
  await db.$connect();

  const created = { schools: [] as string[], users: [] as string[], years: [] as string[], programs: [] as string[], classes: [] as string[], sections: [] as string[], subjects: [] as string[], staff: [] as string[], assignments: [] as string[], calendars: [] as string[], admissions: [] as string[], students: [] as string[] };
  const cleanup = async () => {
    await db.$transaction(async (tx: any) => {
      await tx.teachingAssignment.deleteMany({ where: { id: { in: created.assignments } } });
      await tx.academicCalendar.deleteMany({ where: { id: { in: created.calendars } } });
      await tx.subjects.deleteMany({ where: { id: { in: created.subjects } } });
      await tx.staff.deleteMany({ where: { id: { in: created.staff } } });
      await tx.student.deleteMany({ where: { id: { in: created.students } } });
      await tx.admission.deleteMany({ where: { id: { in: created.admissions } } });
      await tx.section.deleteMany({ where: { id: { in: created.sections } } });
      await tx.class.deleteMany({ where: { id: { in: created.classes } } });
      await tx.program.deleteMany({ where: { id: { in: created.programs } } });
      await tx.academicYear.deleteMany({ where: { id: { in: created.years } } });
      await tx.userRole.deleteMany({ where: { userId: { in: created.users } } });
      await tx.user.deleteMany({ where: { id: { in: created.users } } });
      await tx.school.deleteMany({ where: { id: { in: created.schools } } });
    });
  };

  try {
    const [schoolA, schoolB] = await Promise.all([
      db.school.create({ data: { name: "QA Soft Delete School A", schoolCode: `QA-SD-A-${Date.now()}` } }),
      db.school.create({ data: { name: "QA Soft Delete School B", schoolCode: `QA-SD-B-${Date.now()}` } }),
    ]);
    created.schools.push(schoolA.id, schoolB.id);
    const actorA = await db.user.create({ data: { email: `qa-soft-delete-a-${Date.now()}@example.test`, passwordHash: "fixture-hash", firstName: "QA", lastName: "Actor A", schoolId: schoolA.id } });
    const actorB = await db.user.create({ data: { email: `qa-soft-delete-b-${Date.now()}@example.test`, passwordHash: "fixture-hash", firstName: "QA", lastName: "Actor B", schoolId: schoolB.id } });
    created.users.push(actorA.id, actorB.id);

    const year = await db.academicYear.create({ data: { name: "QA Soft Delete Year", startDate: new Date("2026-06-01"), endDate: new Date("2027-03-31"), schoolId: schoolA.id } });
    const otherYear = await db.academicYear.create({ data: { name: "QA Other School Year", startDate: new Date("2026-06-01"), endDate: new Date("2027-03-31"), schoolId: schoolB.id } });
    created.years.push(year.id, otherYear.id);
    const program = await db.program.create({ data: { name: "QA Program", academicYearId: year.id, startTime: "08:00", endTime: "15:00", daysOfWeek: ["MON", "TUE"] } });
    const otherProgram = await db.program.create({ data: { name: "QA Other Program", academicYearId: otherYear.id, startTime: "08:00", endTime: "15:00", daysOfWeek: ["MON"] } });
    created.programs.push(program.id, otherProgram.id);
    const cls = await db.class.create({ data: { name: "QA Class", programId: program.id } });
    const otherClass = await db.class.create({ data: { name: "QA Other Class", programId: otherProgram.id } });
    created.classes.push(cls.id, otherClass.id);
    const section = await db.section.create({ data: { name: "QA Section", classId: cls.id } });
    const otherSection = await db.section.create({ data: { name: "QA Other Section", classId: otherClass.id } });
    created.sections.push(section.id, otherSection.id);
    const subject = await db.subjects.create({ data: { name: "QA Subject", classId: cls.id } });
    created.subjects.push(subject.id);
    const staffUser = await db.user.create({ data: { email: `qa-soft-delete-staff-${Date.now()}@example.test`, passwordHash: "fixture-hash", firstName: "QA", lastName: "Staff", schoolId: schoolA.id } });
    created.users.push(staffUser.id);
    const staff = await db.staff.create({ data: { staffCode: `QA-ST-${Date.now()}`, firstName: "QA", lastName: "Staff", email: staffUser.email, phoneNumber: "0000000000", dateOfBirth: "1990-01-01", userId: staffUser.id } });
    created.staff.push(staff.id);
    const assignment = await db.teachingAssignment.create({ data: { staffId: staff.id, subjectId: subject.id, classId: cls.id, sectionId: section.id } });
    created.assignments.push(assignment.id);
    const calendar = await db.academicCalendar.create({ data: { academicYearId: year.id, date: new Date("2026-06-01"), dayType: "WORKING_DAY", title: "QA day", isWorkingDay: true } });
    created.calendars.push(calendar.id);
    const admission = await db.admission.create({ data: { admissionNumber: `QA-ADM-${Date.now()}`, admissionSequence: 1, admissionStatus: "CONFIRMED", schoolId: schoolA.id, academicYearId: year.id, programId: program.id, classId: cls.id, sectionId: section.id, studentName: "QA Student", gender: "OTHER", dateOfBirth: new Date("2015-01-01"), createdById: actorA.id } });
    created.admissions.push(admission.id);
    const student = await db.student.create({ data: { studentName: "QA Student", studentNumber: `QA-STU-${Date.now()}`, admissionId: admission.id, gender: "OTHER", dateOfBirth: new Date("2015-01-01") } });
    created.students.push(student.id);
    await db.admission.update({ where: { id: admission.id }, data: { studentId: student.id } });

    const years = new AcademicYearService(db as any);
    const staffService = new StaffService(db as any, new PasswordService(), {} as any);
    const subjects = new SubjectService(db as any);

    await expectError(() => years.remove(year.id, actorA.id), "active enrollment block");
    const beforeBlock = await db.academicYear.findUnique({ where: { id: year.id }, select: { isActive: true, deletedAt: true } });
    assert.equal(beforeBlock?.isActive, true);
    await expectError(() => years.remove(year.id, actorB.id), "cross-school academic-year deletion");

    await staffService.updateStatus(staff.id, false, actorA.id);
    const staffAfter = await db.staff.findUnique({ where: { id: staff.id }, select: { isActive: true, deletedById: true, deletedAt: true } });
    const userAfter = await db.user.findUnique({ where: { id: staffUser.id }, select: { isActive: true, deletedById: true } });
    const assignmentAfter = await db.teachingAssignment.findUnique({ where: { id: assignment.id }, select: { staffId: true, deletedAt: true } });
    assert.equal(staffAfter?.isActive, false); assert.equal(staffAfter?.deletedById, actorA.id); assert.equal(userAfter?.isActive, false); assert.equal(userAfter?.deletedById, actorA.id); assert.equal(assignmentAfter?.staffId, null); assert.equal(assignmentAfter?.deletedAt, null);
    await expectError(() => staffService.updateStatus(staff.id, false, actorB.id), "cross-school staff mutation");

    await subjects.remove(subject.id, actorA.id);
    const subjectAfter = await db.subjects.findUnique({ where: { id: subject.id }, select: { isActive: true, deletedById: true, deletedAt: true } });
    const assignmentAfterSubject = await db.teachingAssignment.findUnique({ where: { id: assignment.id }, select: { isActive: true, deletedById: true } });
    assert.equal(subjectAfter?.isActive, false); assert.equal(subjectAfter?.deletedById, actorA.id); assert.equal(assignmentAfterSubject?.isActive, false); assert.equal(assignmentAfterSubject?.deletedById, actorA.id);
    await expectError(() => subjects.remove(subject.id, actorB.id), "cross-school subject mutation");

    await db.admission.update({ where: { id: admission.id }, data: { admissionStatus: "CANCELLED" } });
    const deleted = await years.remove(year.id, actorA.id);
    assert.equal(deleted.deletedById, actorA.id);
    const cascade = await db.$queryRaw<any[]>`SELECT "isActive", "deletedAt", "deletedById" FROM "AcademicYear" WHERE id = ${year.id}`;
    assert.equal(cascade[0].isActive, false); assert.equal(cascade[0].deletedById, actorA.id);
    const preserved = await db.student.findUnique({ where: { id: student.id }, select: { deletedAt: true } });
    assert.equal(preserved?.deletedAt, null);
    const deletedAt = cascade[0].deletedAt;
    await expectError(() => years.remove(year.id, actorA.id), "repeated academic-year deletion");
    const repeated = await db.academicYear.findUnique({ where: { id: year.id }, select: { deletedAt: true, deletedById: true } });
    assert.equal(repeated?.deletedById, actorA.id); assert.equal(repeated?.deletedAt?.getTime(), new Date(deletedAt).getTime());

    await expectError(async () => db.$transaction(async (tx: any) => { await tx.academicYear.update({ where: { id: otherYear.id }, data: { name: "QA transient mutation" } }); throw new Error("intentional rollback"); }), "transaction rollback");
    const rolledBack = await db.academicYear.findUnique({ where: { id: otherYear.id }, select: { name: true } });
    assert.equal(rolledBack?.name, "QA Other School Year");
    console.log("SOFT_DELETE_INTEGRATION_PASS");
  } finally {
    await cleanup();
    await db.$disconnect();
  }
}

main().catch((error) => { console.error(error?.message || error); process.exitCode = 1; });
