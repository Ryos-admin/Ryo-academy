import { Module } from "@nestjs/common";
import { FeeComponentController } from "./fee-component.controller.js";
import { FeeComponentService } from "./fee-component.service.js";

@Module({
    imports: [],
    controllers: [FeeComponentController],
    providers: [FeeComponentService],
    exports: [FeeComponentService],
})

export class FeeComponentModule {}