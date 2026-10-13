import assert from 'node:assert/strict';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../src/database/database.service.js';
import { ExpenseService } from '../src/finance/expense.service.js';

class FailingExpenseService extends ExpenseService {
  protected override createFinancialLog(): Promise<never> { throw new Error('intentional expense ledger failure'); }
}

const databaseUrl = process.env.DATABASE_URL;
assert.ok(databaseUrl);
const target = new URL(databaseUrl);
assert.equal(target.hostname, '127.0.0.1'); assert.equal(target.port, '55432'); assert.equal(target.pathname, '/ryo_qa');

async function main() {
  const db = new DatabaseService({ getOrThrow: () => databaseUrl } as any); await db.$connect();
  const ids = { schools: [] as string[], users: [] as string[], expenses: [] as string[], logs: [] as string[] };
  const cleanup = async () => db.$transaction(async (tx: any) => {
    await tx.financialLog.deleteMany({ where: { schoolId: { in: ids.schools } } });
    await tx.expense.deleteMany({ where: { schoolId: { in: ids.schools } } });
    await tx.user.deleteMany({ where: { id: { in: ids.users } } });
    await tx.school.deleteMany({ where: { id: { in: ids.schools } } });
  });
  try {
    const schoolA = await db.school.create({ data: { name: 'QA Expense School A', schoolCode: `QA-EXP-A-${Date.now()}` } });
    const schoolB = await db.school.create({ data: { name: 'QA Expense School B', schoolCode: `QA-EXP-B-${Date.now()}` } }); ids.schools.push(schoolA.id, schoolB.id);
    const actorA = await db.user.create({ data: { email: `qa-expense-a-${Date.now()}@example.test`, passwordHash: 'fixture-hash', firstName: 'Expense', lastName: 'A', schoolId: schoolA.id } });
    const actorB = await db.user.create({ data: { email: `qa-expense-b-${Date.now()}@example.test`, passwordHash: 'fixture-hash', firstName: 'Expense', lastName: 'B', schoolId: schoolB.id } }); ids.users.push(actorA.id, actorB.id);
    const service = new ExpenseService(db);
    const created = await service.create({ category: 'SUPPLIES', amount: 125, occurredAt: '2026-10-10', description: 'QA supplies' }, actorA.id); ids.expenses.push(created.id);
    const originalLog = await db.financialLog.findFirst({ where: { sourceType: 'EXPENSE', sourceId: created.id, type: 'EXPENSE' } }); assert.ok(originalLog); ids.logs.push(originalLog.id);
    assert.equal(created.schoolId, schoolA.id); assert.equal(created.userId, actorA.id); assert.equal(originalLog.flowType, 'EXPENSE'); assert.equal(originalLog.amount.toString(), '125');
    await assert.rejects(() => new FailingExpenseService(db).create({ category: 'SUPPLIES', amount: 20, occurredAt: '2026-10-10' }, actorA.id), /intentional expense ledger failure/);
    assert.equal(await db.expense.count({ where: { schoolId: schoolA.id } }), 1); assert.equal(await db.financialLog.count({ where: { schoolId: schoolA.id } }), 1);
    await assert.rejects(() => service.remove(created.id, actorB.id), NotFoundException);
    const deleted = await service.remove(created.id, actorA.id); const afterDelete = await db.expense.findUnique({ where: { id: created.id } });
    const reversal = await db.financialLog.findFirst({ where: { sourceType: 'EXPENSE', sourceId: created.id, type: 'EXPENSE_REVERSAL' } });
    assert.equal(deleted.isActive, false); assert.equal(afterDelete?.deletedById, actorA.id); assert.equal(afterDelete?.deletedAt?.getTime(), deleted.deletedAt?.getTime()); assert.ok(reversal); assert.equal(reversal.flowType, 'INCOME'); assert.equal(reversal.amount.toString(), '125');
    const deletionTime = afterDelete?.deletedAt?.getTime(); await assert.rejects(() => service.remove(created.id, actorA.id), ConflictException);
    assert.equal(await db.financialLog.count({ where: { sourceType: 'EXPENSE', sourceId: created.id } }), 2); assert.equal((await db.expense.findUnique({ where: { id: created.id } }))?.deletedAt?.getTime(), deletionTime);
    const second = await service.create({ category: 'UTILITIES', amount: 50, occurredAt: '2026-10-10' }, actorA.id); ids.expenses.push(second.id);
    const failingDelete = new FailingExpenseService(db); await assert.rejects(() => failingDelete.remove(second.id, actorA.id), /intentional expense ledger failure/);
    const preserved = await db.expense.findUnique({ where: { id: second.id } }); assert.equal(preserved?.isActive, true); assert.equal(preserved?.deletedAt, null); assert.equal(await db.financialLog.count({ where: { sourceId: second.id } }), 1);
    assert.equal(await db.financialLog.count({ where: { sourceType: 'EXPENSE', sourceId: created.id } }), 2);
    console.log('EXPENSE_INTEGRATION_PASS');
  } finally { await cleanup(); await db.$disconnect(); }
}
main().catch((error) => { console.error(error?.message || error); process.exitCode = 1; });
