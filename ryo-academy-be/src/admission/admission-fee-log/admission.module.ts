import { Module } from "@nestjs/common";
import { AdmissionController } from "./admission.controller.js";
import { AdmissionService } from "./admission.service.js";
import { AdmissionRepository } from "./admission.repository.js";

@Module({
    imports: [],
    controllers: [AdmissionController],
    providers: [AdmissionService, AdmissionRepository],
    exports: [AdmissionService, AdmissionRepository],
})
export class AdmissionModule {}