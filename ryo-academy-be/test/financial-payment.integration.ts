import assert from 'node:assert/strict';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../src/database/database.service.js';
import { StudentService } from '../src/student/student.service.js';

class FinancialLogFailureStudentService extends StudentService {
  protected override createFinancialLog(): Promise<never> {
    throw new Error('intentional FinancialLog failure');
  }
}

const databaseUrl = process.env.DATABASE_URL;
assert.ok(databaseUrl, 'DATABASE_URL is required');
const target = new URL(databaseUrl);
assert.equal(target.hostname, '127.0.0.1');
assert.equal(target.port, '55432');
assert.equal(target.pathname, '/ryo_qa');

async function main() {
  const db = new DatabaseService({ getOrThrow: () => databaseUrl } as any);
  await db.$connect();
  const ids: Record<string, string[]> = { schools: [], users: [], years: [], programs: [], classes: [], sections: [], structures: [], components: [], admissions: [], students: [], headers: [], details: [], payments: [], logs: [] };
  const cleanup = async () => db.$transaction(async (tx: any) => {
    await tx.financialLog.deleteMany({ where: { OR: [{ id: { in: ids.logs } }, { schoolId: { in: ids.schools } }] } });
    await tx.feePayment.deleteMany({ where: { OR: [{ id: { in: ids.payments } }, { schoolId: { in: ids.schools } }] } });
    await tx.feePaymentDetails.deleteMany({ where: { id: { in: ids.details } } });
    await tx.feePaymentHeader.deleteMany({ where: { OR: [{ id: { in: ids.headers } }, { admission: { schoolId: { in: ids.schools } } }] } });
    await tx.student.deleteMany({ where: { id: { in: ids.students } } });
    await tx.admission.deleteMany({ where: { id: { in: ids.admissions } } });
    await tx.feeComponent.deleteMany({ where: { id: { in: ids.components } } });
    await tx.feeStructure.deleteMany({ where: { id: { in: ids.structures } } });
    await tx.section.deleteMany({ where: { id: { in: ids.sections } } });
    await tx.class.deleteMany({ where: { id: { in: ids.classes } } });
    await tx.program.deleteMany({ where: { id: { in: ids.programs } } });
    await tx.academicYear.deleteMany({ where: { id: { in: ids.years } } });
    await tx.user.deleteMany({ where: { id: { in: ids.users } } });
    await tx.school.deleteMany({ where: { id: { in: ids.schools } } });
  });
  try {
    const schoolA = await db.school.create({ data: { name: 'QA Finance Payment School A', schoolCode: `QA-FP-A-${Date.now()}` } });
    const schoolB = await db.school.create({ data: { name: 'QA Finance Payment School B', schoolCode: `QA-FP-B-${Date.now()}` } });
    ids.schools.push(schoolA.id, schoolB.id);
    const actorA = await db.user.create({ data: { email: `qa-finance-actor-a-${Date.now()}@example.test`, passwordHash: 'fixture-hash', firstName: 'Finance', lastName: 'A', schoolId: schoolA.id } });
    const actorB = await db.user.create({ data: { email: `qa-finance-actor-b-${Date.now()}@example.test`, passwordHash: 'fixture-hash', firstName: 'Finance', lastName: 'B', schoolId: schoolB.id } });
    ids.users.push(actorA.id, actorB.id);
    const year = await db.academicYear.create({ data: { name: 'QA Finance Year', startDate: new Date('2026-06-01'), endDate: new Date('2027-03-31'), schoolId: schoolA.id } }); ids.years.push(year.id);
    const program = await db.program.create({ data: { name: 'QA Finance Program', academicYearId: year.id, startTime: '08:00', endTime: '15:00', daysOfWeek: ['MON'] } }); ids.programs.push(program.id);
    const cls = await db.class.create({ data: { name: 'QA Finance Class', programId: program.id } }); ids.classes.push(cls.id);
    const section = await db.section.create({ data: { name: 'QA Finance Section', classId: cls.id } }); ids.sections.push(section.id);
    const structure = await db.feeStructure.create({ data: { name: 'QA Finance Structure', academicYearId: year.id, programId: program.id, classId: cls.id, totalAmount: 100 } }); ids.structures.push(structure.id);
    const component = await db.feeComponent.create({ data: { name: 'QA Finance Component', amount: 100, feeStructureId: structure.id } }); ids.components.push(component.id);
    const admission = await db.admission.create({ data: { admissionNumber: `QA-FP-ADM-${Date.now()}`, admissionSequence: 1, schoolId: schoolA.id, academicYearId: year.id, programId: program.id, classId: cls.id, sectionId: section.id, studentName: 'QA Finance Student', gender: 'OTHER', dateOfBirth: new Date('2015-01-01'), createdById: actorA.id, admissionStatus: 'CONFIRMED' } }); ids.admissions.push(admission.id);
    const student = await db.student.create({ data: { studentName: 'QA Finance Student', studentNumber: `QA-FP-STU-${Date.now()}`, admissionId: admission.id, gender: 'OTHER', dateOfBirth: new Date('2015-01-01') } }); ids.students.push(student.id);
    const header = await db.feePaymentHeader.create({ data: { admissionId: admission.id, academicYearId: year.id, feeStructureId: structure.id, grossAmount: 100, discountAmount: 0, netAmount: 100, totalPaidAmount: 0, totalDueAmount: 100, totalFeeAmount: 100 } }); ids.headers.push(header.id);
    const detail = await db.feePaymentDetails.create({ data: { feePaymentHeaderId: header.id, feeComponentId: component.id, nameSnapshot: component.name, originalAmount: 100, discountApplicable: false, isMandatory: true, discountAmount: 0, finalAmount: 100, totalAmountToBePaid: 100, amountPaid: 0, paymentDate: new Date() } }); ids.details.push(detail.id);
    const service = new StudentService(db);
    const key = '11111111-1111-4111-8111-111111111111';
    await service.recordStudentFeePayment(student.id, { amount: 40, paymentDate: '2026-10-10', idempotencyKey: key }, actorA.id);
    const posted = await db.$transaction(async (tx: any) => ({ payment: await tx.feePayment.findUnique({ where: { idempotencyKey: key } }), log: await tx.financialLog.findMany({ where: { sourceType: 'FEE_PAYMENT' } }), header: await tx.feePaymentHeader.findUnique({ where: { id: header.id } }), detail: await tx.feePaymentDetails.findUnique({ where: { id: detail.id } }) }));
    ids.payments.push(posted.payment.id); ids.logs.push(posted.log[0].id);
    assert.equal(posted.payment.amount.toString(), '40'); assert.equal(posted.payment.userId, actorA.id); assert.equal(posted.payment.schoolId, schoolA.id); assert.equal(posted.log.length, 1); assert.equal(posted.log[0].flowType, 'INCOME'); assert.equal(posted.log[0].sourceId, posted.payment.id); assert.equal(posted.header.totalPaidAmount.toString(), '40'); assert.equal(posted.detail.amountPaid.toString(), '40');
    await service.recordStudentFeePayment(student.id, { amount: 40, paymentDate: '2026-10-10', idempotencyKey: key }, actorA.id);
    assert.equal((await db.feePayment.count({ where: { idempotencyKey: key } })), 1); assert.equal((await db.financialLog.count({ where: { sourceId: posted.payment.id } })), 1);
    await assert.rejects(() => service.recordStudentFeePayment(student.id, { amount: 50, idempotencyKey: key }, actorA.id), ConflictException);
    const concurrentKey = '44444444-4444-4444-8444-444444444444';
    await Promise.all([
      service.recordStudentFeePayment(student.id, { amount: 10, idempotencyKey: concurrentKey }, actorA.id),
      service.recordStudentFeePayment(student.id, { amount: 10, idempotencyKey: concurrentKey }, actorA.id),
    ]);
    assert.equal(await db.feePayment.count({ where: { idempotencyKey: concurrentKey } }), 1);
    const concurrentPayment = await db.feePayment.findUnique({ where: { idempotencyKey: concurrentKey } });
    assert.equal(await db.financialLog.count({ where: { sourceType: 'FEE_PAYMENT', sourceId: concurrentPayment.id } }), 1);
    await assert.rejects(() => service.recordStudentFeePayment(student.id, { amount: 10, idempotencyKey: '22222222-2222-4222-8222-222222222222' }, actorB.id), NotFoundException);
    await assert.rejects(() => service.recordStudentFeePayment(student.id, { amount: 100, idempotencyKey: '33333333-3333-4333-8333-333333333333' }, actorA.id));
    assert.equal((await db.feePayment.count({ where: { studentId: student.id } })), 2); assert.equal((await db.financialLog.count({ where: { sourceType: 'FEE_PAYMENT', sourceId: posted.payment.id } })), 1);
    const beforeFailure = await db.$transaction(async (tx: any) => ({ header: await tx.feePaymentHeader.findUnique({ where: { id: header.id } }), detail: await tx.feePaymentDetails.findUnique({ where: { id: detail.id } }), payments: await tx.feePayment.count({ where: { studentId: student.id } }), logs: await tx.financialLog.count({ where: { sourceType: 'FEE_PAYMENT' } }) }));
    const failingService = new FinancialLogFailureStudentService(db);
    await assert.rejects(() => failingService.recordStudentFeePayment(student.id, { amount: 5, idempotencyKey: '55555555-5555-4555-8555-555555555555' }, actorA.id), /intentional FinancialLog failure/);
    const afterFailure = await db.$transaction(async (tx: any) => ({ header: await tx.feePaymentHeader.findUnique({ where: { id: header.id } }), detail: await tx.feePaymentDetails.findUnique({ where: { id: detail.id } }), payment: await tx.feePayment.findUnique({ where: { idempotencyKey: '55555555-5555-4555-8555-555555555555' } }), payments: await tx.feePayment.count({ where: { studentId: student.id } }), logs: await tx.financialLog.count({ where: { sourceType: 'FEE_PAYMENT' } }) }));
    assert.equal(afterFailure.header.totalPaidAmount.toString(), beforeFailure.header.totalPaidAmount.toString()); assert.equal(afterFailure.detail.amountPaid.toString(), beforeFailure.detail.amountPaid.toString()); assert.equal(afterFailure.payment, null); assert.equal(afterFailure.payments, beforeFailure.payments); assert.equal(afterFailure.logs, beforeFailure.logs);
    await service.recordStudentFeePayment(student.id, { amount: 5, idempotencyKey: '66666666-6666-4666-8666-666666666666' }, actorA.id);
    assert.equal(await db.feePayment.count({ where: { studentId: student.id } }), beforeFailure.payments + 1);
    console.log('FINANCIAL_PAYMENT_INTEGRATION_PASS');
  } finally { await cleanup(); await db.$disconnect(); }
}
main().catch((error) => { console.error(error?.message || error); process.exitCode = 1; });
