import { Module } from "@nestjs/common";
import { AdmissionController } from "./admission.controller.js";
import { AdmissionService } from "./admission.service.js";
import { AdmissionRepository } from "./admission.repository.js";
import { AccessTokenModule } from "../../security/token/access-token.module.js";
import { PermissionsGuard } from "../../auth/permissions.guard.js";
import { AuthorizationService } from "../../auth/authorization.service.js";
import { FeeConcessionModule } from "../fee-concession/fee-concession.module.js";
import { InstallmentTemplateModule } from "../installment/installment-template.module.js";

@Module({
    imports: [AccessTokenModule, FeeConcessionModule, InstallmentTemplateModule],
    controllers: [AdmissionController],
    providers: [AdmissionService, AdmissionRepository, AuthorizationService, PermissionsGuard],
    exports: [AdmissionService, AdmissionRepository],
})
export class AdmissionModule {}