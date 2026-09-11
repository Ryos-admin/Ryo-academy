import { Module } from '@nestjs/common';
import { AttendanceController } from './attendance.controller.js';
import { AttendanceService } from './attendance.service.js';
import { AccessTokenModule } from '../security/token/access-token.module.js';
import { AuthorizationService } from '../auth/authorization.service.js';
import { PermissionsGuard } from '../auth/permissions.guard.js';

@Module({
  imports: [AccessTokenModule],
  controllers: [AttendanceController],
  providers: [AttendanceService, AuthorizationService, PermissionsGuard],
})
export class AttendanceModule {}
