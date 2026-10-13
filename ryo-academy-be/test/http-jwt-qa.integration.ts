import assert from 'node:assert/strict';
import argon2 from 'argon2';
import request from 'supertest';
import { DatabaseService } from '../src/database/database.service.js';

const databaseUrl = process.env.DATABASE_URL;
assert.ok(databaseUrl, 'DATABASE_URL is required');
const target = new URL(databaseUrl);
assert.equal(target.hostname, '127.0.0.1');
assert.equal(target.port, '55432');
assert.equal(target.pathname, '/ryo_qa');

const password = 'QA-only-password-2026!';
const routes = [
  ['delete', '/api/v0/academic-years/not-a-real-id'],
  ['patch', '/api/v0/staff/not-a-real-id/status'],
  ['delete', '/api/v0/subjects/not-a-real-id'],
  ['post', '/api/v0/students/not-a-real-id/fees/payments'],
  ['post', '/api/v0/expenses'],
  ['delete', '/api/v0/expenses/not-a-real-id'],
  ['get', '/api/v0/financial-logs'],
] as const;

async function main() {
  const db = new DatabaseService({ getOrThrow: () => databaseUrl } as any);
  await db.$connect();
  const ids = { schools: [] as string[], users: [] as string[], logs: [] as string[], expenses: [] as string[] };
  const emailA = `qa-http-office-a-${Date.now()}@example.test`;
  const emailB = `qa-http-office-b-${Date.now()}@example.test`;
  const emailStaff = `qa-http-staff-a-${Date.now()}@example.test`;

  const cleanup = async () => {
    await db.$transaction(async (tx) => {
      await tx.financialLog.deleteMany({ where: { schoolId: { in: ids.schools } } });
      await tx.expense.deleteMany({ where: { schoolId: { in: ids.schools } } });
      await tx.user.deleteMany({ where: { id: { in: ids.users } } });
      await tx.school.deleteMany({ where: { id: { in: ids.schools } } });
    });
  };

  try {
    const [schoolA, schoolB] = await Promise.all([
      db.school.create({ data: { name: 'QA HTTP School A', schoolCode: `QA-HTTP-A-${Date.now()}` } }),
      db.school.create({ data: { name: 'QA HTTP School B', schoolCode: `QA-HTTP-B-${Date.now()}` } }),
    ]);
    ids.schools.push(schoolA.id, schoolB.id);
    const hash = await argon2.hash(password);
    const [officeA, officeB, staffA] = await Promise.all([
      db.user.create({ data: { email: emailA, passwordHash: hash, firstName: 'QA', lastName: 'OfficeA', schoolId: schoolA.id, roles: { create: { role: { connect: { name: 'OFFICE_ADMIN' } } } } } }),
      db.user.create({ data: { email: emailB, passwordHash: hash, firstName: 'QA', lastName: 'OfficeB', schoolId: schoolB.id, roles: { create: { role: { connect: { name: 'OFFICE_ADMIN' } } } } } }),
      db.user.create({ data: { email: emailStaff, passwordHash: hash, firstName: 'QA', lastName: 'StaffA', schoolId: schoolA.id, roles: { create: { role: { connect: { name: 'STAFF' } } } } } }),
    ]);
    ids.users.push(officeA.id, officeB.id, staffA.id);
    await db.financialLog.createMany({ data: [
      { schoolId: schoolA.id, userId: officeA.id, type: 'FEE_PAYMENT', flowType: 'INCOME', amount: 100, occurredAt: new Date('2026-10-01T12:00:00Z'), sourceType: 'FEE_PAYMENT', sourceId: `qa-http-a-${Date.now()}` },
      { schoolId: schoolB.id, userId: officeB.id, type: 'FEE_PAYMENT', flowType: 'INCOME', amount: 999, occurredAt: new Date('2026-10-01T12:00:00Z'), sourceType: 'FEE_PAYMENT', sourceId: `qa-http-b-${Date.now()}` },
    ]});

    const http = request('http://127.0.0.1:7676');
    for (const [method, path] of routes) {
      const noToken = await http[method](path);
      assert.equal(noToken.status, 401, `${method.toUpperCase()} ${path} without token`);
      const invalid = await http[method](path).set('Authorization', 'Bearer invalid.token.value');
      assert.equal(invalid.status, 401, `${method.toUpperCase()} ${path} invalid token`);
    }

    const login = async (email: string) => {
      const response = await http.post('/api/v0/auth/login').send({ email, password });
      assert.equal(response.status, 201);
      return response.body.accessToken as string;
    };
    const tokenA = await login(emailA);
    const tokenB = await login(emailB);
    const staffToken = await login(emailStaff);

    const report = await http.get('/api/v0/financial-logs').set('Authorization', `Bearer ${tokenA}`);
    assert.equal(report.status, 200);
    assert.equal(report.body.total, 1);
    assert.equal(report.body.data[0].amount, '100');
    assert.equal(report.body.data.some((row: { amount: string }) => row.amount === '999'), false);

    const staffReport = await http.get('/api/v0/financial-logs').set('Authorization', `Bearer ${staffToken}`);
    assert.equal(staffReport.status, 403);

    const created = await http.post('/api/v0/expenses').set('Authorization', `Bearer ${tokenB}`).send({ category: 'SUPPLIES', amount: 25, occurredAt: '2026-10-02', description: 'QA HTTP expense' });
    assert.equal(created.status, 201);
    ids.expenses.push(created.body.id);
    const beforeCrossSchool = await db.expense.findUnique({ where: { id: created.body.id } });
    assert.ok(beforeCrossSchool);
    const crossSchoolDelete = await http.delete(`/api/v0/expenses/${created.body.id}`).set('Authorization', `Bearer ${tokenA}`);
    assert.equal(crossSchoolDelete.status, 404);
    const afterCrossSchool = await db.expense.findUnique({ where: { id: created.body.id } });
    assert.equal(afterCrossSchool?.isActive, true);
    assert.equal(afterCrossSchool?.deletedAt, null);

    const ownDelete = await http.delete(`/api/v0/expenses/${created.body.id}`).set('Authorization', `Bearer ${tokenB}`);
    assert.equal(ownDelete.status, 200);
    const repeatedDelete = await http.delete(`/api/v0/expenses/${created.body.id}`).set('Authorization', `Bearer ${tokenB}`);
    assert.equal(repeatedDelete.status, 409);
    console.log('HTTP_JWT_QA_PASS');
  } finally {
    await cleanup();
    await db.$disconnect();
  }
}

main().catch((error) => { console.error(error?.message || error); process.exitCode = 1; });
