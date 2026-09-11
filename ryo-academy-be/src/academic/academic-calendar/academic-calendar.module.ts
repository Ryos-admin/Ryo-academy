import { Module } from '@nestjs/common';
import { AcademicCalendarController } from './academic-calendar.controller.js';
import { AcademicCalendarService } from './academic-calendar.service.js';
import { AccessTokenModule } from '../../security/token/access-token.module.js';
import { AuthorizationService } from '../../auth/authorization.service.js';
import { PermissionsGuard } from '../../auth/permissions.guard.js';

@Module({
  imports: [AccessTokenModule],
  controllers: [AcademicCalendarController],
  providers: [AcademicCalendarService, AuthorizationService, PermissionsGuard],
  exports: [AcademicCalendarService],
})
export class AcademicCalendarModule {}
