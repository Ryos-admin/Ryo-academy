import { Module } from "@nestjs/common";
import { FeeComponentController } from "./fee-component.controller.js";
import { FeeComponentService } from "./fee-component.service.js";
import { FeeStructureSyncService } from "./fee-structure-sync.service.js";
import { FeeStructureSyncController } from "../fee-structure/fee-structure-sync.controller.js";
import { AccessTokenModule } from "../../security/token/access-token.module.js";
import { FeeConcessionModule } from "../fee-concession/fee-concession.module.js";
import { PermissionsGuard } from "../../auth/permissions.guard.js";
import { AuthorizationService } from "../../auth/authorization.service.js";

@Module({
    imports: [AccessTokenModule, FeeConcessionModule],
    controllers: [FeeComponentController, FeeStructureSyncController],
    providers: [FeeComponentService, FeeStructureSyncService, AuthorizationService, PermissionsGuard],
    exports: [FeeComponentService, FeeStructureSyncService],
})
export class FeeComponentModule {}
