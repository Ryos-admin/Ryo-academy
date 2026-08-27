import { Module } from '@nestjs/common';
import { AcademicYearService } from './academic-year.service.js';
import { AcademicYearController } from './academic-year.controller.js';
import { AccessTokenModule } from '../../security/token/access-token.module.js';
import { AuthorizationService } from '../../auth/authorization.service.js';
import { PermissionsGuard } from '../../auth/permissions.guard.js';

@Module({
  imports: [AccessTokenModule],
  controllers: [AcademicYearController],
  providers: [AcademicYearService, AuthorizationService, PermissionsGuard],
  exports: [AcademicYearService],
})
export class AcademicYearModule {}
