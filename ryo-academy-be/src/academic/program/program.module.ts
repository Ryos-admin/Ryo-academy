import { Module } from "@nestjs/common";
import { ProgramController } from "./program.controller.js";
import { ProgramService } from "./program.service.js";
import { AccessTokenModule } from "../../security/token/access-token.module.js";
import { AuthorizationService } from "../../auth/authorization.service.js";
import { PermissionsGuard } from "../../auth/permissions.guard.js";

@Module({
  imports: [AccessTokenModule],
  controllers: [ProgramController],
  providers: [ProgramService, AuthorizationService, PermissionsGuard],
  exports: [ProgramService],
})
export class ProgramModule {}