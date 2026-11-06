import { Module } from '@nestjs/common';
import { StudentController } from './student.controller.js';
import { StudentService } from './student.service.js';
import { PaymentReversalService } from './payment-reversal.service.js';
import { AccessTokenModule } from '../security/token/access-token.module.js';
import { AuthorizationService } from '../auth/authorization.service.js';
import { PermissionsGuard } from '../auth/permissions.guard.js';
import { JwtAuthGuard } from '../security/token/jwt-auth.guard.js';
import { InstallmentTemplateModule } from '../admission/installment/installment-template.module.js';

@Module({
  imports: [AccessTokenModule, InstallmentTemplateModule],
  controllers: [StudentController],
  providers: [
    StudentService,
    PaymentReversalService,
    AuthorizationService,
    PermissionsGuard,
    JwtAuthGuard,
  ],
  exports: [StudentService, PaymentReversalService],
})
export class StudentModule {}
