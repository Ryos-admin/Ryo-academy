import { Module } from "@nestjs/common";
import { ClassService } from "./class.service.js";
import { ClassController } from "./class.controller.js";
import { AccessTokenModule } from "../../security/token/access-token.module.js";
import { AuthorizationService } from "../../auth/authorization.service.js";
import { PermissionsGuard } from "../../auth/permissions.guard.js";
import { SubjectService } from "../subject/subject.service.js";

@Module({
  imports: [AccessTokenModule],
  controllers: [ClassController],
  providers: [ClassService, SubjectService, AuthorizationService, PermissionsGuard],
  exports: [ClassService],
})
export class ClassModule {}
