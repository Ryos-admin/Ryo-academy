import 'reflect-metadata';
import '../src/common/money/decimal-precision.js';
import assert from 'node:assert/strict';
import { assertQaDatabase } from '../src/test/assert-qa-database.js';
import argon2 from 'argon2';
import request from 'supertest';
import { DatabaseService } from '../src/database/database.service.js';
import { NestFactory } from '@nestjs/core';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppModule } from '../src/app.module.js';
import { AuthController } from '../src/auth/auth.controller.js';
import { AuthService } from '../src/auth/auth.service.js';
import { PasswordService } from '../src/security/password/password.service.js';
import { UsersService } from '../src/users/users.service.js';
import { UsersRepository } from '../src/users/users.repository.js';
import { AccessTokenService } from '../src/security/token/access-token.service.js';
import { FinancialLogController } from '../src/finance/financial-log.controller.js';
import { FinancialLogService } from '../src/finance/financial-log.service.js';
import { QueryFinancialLogDto } from '../src/finance/dto/query-financial-log.dto.js';
import { ExpenseController } from '../src/finance/expense.controller.js';
import { ExpenseService } from '../src/finance/expense.service.js';
import { CreateExpenseDto } from '../src/finance/dto/create-expense.dto.js';
import { PermissionsGuard } from '../src/auth/permissions.guard.js';
import { AuthorizationService } from '../src/auth/authorization.service.js';

process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'qa-test-jwt-access-secret-minimum-32-chars-long';
process.env.JWT_ACCESS_EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES_IN || '3600';
process.env.JWT_ISSUER = process.env.JWT_ISSUER || 'self';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'self';

// Provide DI constructor metadata stripped by tsx/esbuild
Reflect.defineMetadata('design:paramtypes', [AuthService], AuthController);
Reflect.defineMetadata('design:paramtypes', [PasswordService, UsersService, AccessTokenService], AuthService);
Reflect.defineMetadata('design:paramtypes', [UsersRepository], UsersService);
Reflect.defineMetadata('design:paramtypes', [DatabaseService], UsersRepository);
Reflect.defineMetadata('design:paramtypes', [FinancialLogService], FinancialLogController);
Reflect.defineMetadata('design:paramtypes', [QueryFinancialLogDto, Object], FinancialLogController.prototype, 'findAll');
Reflect.defineMetadata('design:paramtypes', [DatabaseService], FinancialLogService);
Reflect.defineMetadata('design:paramtypes', [ExpenseService], ExpenseController);
Reflect.defineMetadata('design:paramtypes', [CreateExpenseDto, Object], ExpenseController.prototype, 'create');
Reflect.defineMetadata('design:paramtypes', [String, Object], ExpenseController.prototype, 'remove');
Reflect.defineMetadata('design:paramtypes', [DatabaseService], ExpenseService);
Reflect.defineMetadata('design:paramtypes', [Reflector, AuthorizationService], PermissionsGuard);
Reflect.defineMetadata('design:paramtypes', [DatabaseService], AuthorizationService);

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
  await assertQaDatabase(db);
  const ids = { schools: [] as string[], users: [] as string[], logs: [] as string[], expenses: [] as string[] };
  const emailA = `qa-http-office-a-${Date.now()}@example.test`;
  const emailB = `qa-http-office-b-${Date.now()}@example.test`;
  const emailStaff = `qa-http-staff-a-${Date.now()}@example.test`;

  let app: INestApplication | null = null;

  const cleanup = async () => {
    await db.$transaction(async (tx) => {
      await tx.financialLog.deleteMany({ where: { schoolId: { in: ids.schools } } });
      await tx.expense.deleteMany({ where: { schoolId: { in: ids.schools } } });
      await tx.user.deleteMany({ where: { id: { in: ids.users } } });
      await tx.school.deleteMany({ where: { id: { in: ids.schools } } });
    });
  };

  try {
    const permFeesRead = await db.permission.upsert({
      where: { name: 'fees:read' },
      update: {},
      create: { name: 'fees:read', description: 'View fees.' },
    });
    const permExpenseCreate = await db.permission.upsert({
      where: { name: 'expense:create' },
      update: {},
      create: { name: 'expense:create', description: 'Create expense.' },
    });
    const permExpenseDelete = await db.permission.upsert({
      where: { name: 'expense:delete' },
      update: {},
      create: { name: 'expense:delete', description: 'Delete expense.' },
    });

    const officeRole = await db.role.upsert({
      where: { name: 'OFFICE_ADMIN' },
      update: {},
      create: { name: 'OFFICE_ADMIN', description: 'Office Administrator' },
    });
    await db.role.upsert({
      where: { name: 'STAFF' },
      update: {},
      create: { name: 'STAFF', description: 'Staff Member' },
    });

    for (const p of [permFeesRead, permExpenseCreate, permExpenseDelete]) {
      await db.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: officeRole.id,
            permissionId: p.id,
          },
        },
        update: {},
        create: {
          roleId: officeRole.id,
          permissionId: p.id,
        },
      });
    }

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

    // Bootstrap isolated in-process Nest application
    app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
    app.setGlobalPrefix('api/v0');
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();

    const http = request(app.getHttpServer());
    for (const [method, path] of routes) {
      const noToken = await http[method](path);
      assert.equal(noToken.status, 401, `${method.toUpperCase()} ${path} without token`);
      const invalid = await http[method](path).set('Authorization', 'Bearer invalid.token.value');
      assert.equal(invalid.status, 401, `${method.toUpperCase()} ${path} invalid token`);
    }

    const login = async (email: string) => {
      const response = await http.post('/api/v0/auth/login').send({ email, password });
      if (response.status !== 201) {
        console.error('Login failed:', response.status, response.body);
      }
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
    if (app) {
      await app.close();
    }
    await cleanup();
    await db.$disconnect();
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error?.message || error);
    process.exit(1);
  });
