import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AuthorizationService } from '../auth/authorization.service.js';
import { PermissionsGuard } from '../auth/permissions.guard.js';
import { SchoolsController } from './schools.controller.js';
import { SchoolsService } from './schools.service.js';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [SchoolsController],
  providers: [SchoolsService, AuthorizationService, PermissionsGuard],
  exports: [SchoolsService],
})
export class SchoolsModule {}
