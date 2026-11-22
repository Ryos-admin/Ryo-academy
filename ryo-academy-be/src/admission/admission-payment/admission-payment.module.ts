import { Module } from '@nestjs/common';
import { AdmissionPaymentController } from './admission-payment.controller.js';
import { AdmissionPaymentService } from './admission-payment.service.js';
import { AccessTokenModule } from '../../security/token/access-token.module.js';
import { PermissionsGuard } from '../../auth/permissions.guard.js';
import { AuthorizationService } from '../../auth/authorization.service.js';

@Module({
  imports: [AccessTokenModule],
  controllers: [AdmissionPaymentController],
  providers: [AdmissionPaymentService, AuthorizationService, PermissionsGuard],
  exports: [AdmissionPaymentService],
})
export class AdmissionPaymentModule {}
