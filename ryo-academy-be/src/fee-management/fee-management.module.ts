import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AuthorizationService } from '../auth/authorization.service.js';
import { PermissionsGuard } from '../auth/permissions.guard.js';
import { SchoolsModule } from '../schools/schools.module.js';
import { FeeManagementController } from './fee-management.controller.js';
import { FeeManagementService } from './fee-management.service.js';

@Module({
  imports: [DatabaseModule, AuthModule, SchoolsModule],
  controllers: [FeeManagementController],
  providers: [FeeManagementService, AuthorizationService, PermissionsGuard],
  exports: [FeeManagementService],
})
export class FeeManagementModule {}
