import { Module } from '@nestjs/common';
import { AcademicYearService } from './academic-year.service.js';
import { AcademicYearController } from './academic-year.controller.js';
import { AccessTokenModule } from '../../security/token/access-token.module.js';
import { AuthorizationService } from '../../auth/authorization.service.js';
import { PermissionsGuard } from '../../auth/permissions.guard.js';
import { JwtAuthGuard } from '../../security/token/jwt-auth.guard.js';
import { AcademicCalendarModule } from '../academic-calendar/academic-calendar.module.js';

@Module({
  imports: [AccessTokenModule, AcademicCalendarModule],
  controllers: [AcademicYearController],
  providers: [AcademicYearService, AuthorizationService, PermissionsGuard, JwtAuthGuard],
  exports: [AcademicYearService],
})
export class AcademicYearModule {}
