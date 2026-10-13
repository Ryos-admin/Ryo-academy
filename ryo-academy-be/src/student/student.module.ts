import { Module } from '@nestjs/common';
import { StudentController } from './student.controller.js';
import { StudentService } from './student.service.js';
import { AccessTokenModule } from '../security/token/access-token.module.js';
import { AuthorizationService } from '../auth/authorization.service.js';
import { PermissionsGuard } from '../auth/permissions.guard.js';
import { JwtAuthGuard } from '../security/token/jwt-auth.guard.js';

@Module({
  imports: [AccessTokenModule],
  controllers: [StudentController],
  providers: [StudentService, AuthorizationService, PermissionsGuard, JwtAuthGuard],
  exports: [StudentService],
})
export class StudentModule {}
