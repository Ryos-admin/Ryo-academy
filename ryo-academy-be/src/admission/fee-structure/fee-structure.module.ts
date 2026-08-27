import { Module } from "@nestjs/common";
import { FeeStructureController } from "./fee-structure.controller.js";
import { FeeStructureService } from "./fee-structure.service.js";

@Module({
    imports: [],
    controllers: [FeeStructureController],
    providers: [FeeStructureService],
    exports: [FeeStructureService],
})

export class FeeStructureModule {}