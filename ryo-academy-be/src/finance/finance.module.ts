import { Module } from '@nestjs/common';
import { ExpenseController } from './expense.controller.js';
import { ExpenseService } from './expense.service.js';
import { FinancialLogController } from './financial-log.controller.js';
import { FinancialLogService } from './financial-log.service.js';
import { AccessTokenModule } from '../security/token/access-token.module.js';
import { AuthorizationService } from '../auth/authorization.service.js';
import { PermissionsGuard } from '../auth/permissions.guard.js';
import { JwtAuthGuard } from '../security/token/jwt-auth.guard.js';

@Module({ imports: [AccessTokenModule], controllers: [ExpenseController, FinancialLogController], providers: [ExpenseService, FinancialLogService, AuthorizationService, PermissionsGuard, JwtAuthGuard] })
export class FinanceModule {}
