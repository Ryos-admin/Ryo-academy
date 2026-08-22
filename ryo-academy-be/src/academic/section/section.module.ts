import { Module } from "@nestjs/common";
import { SectionService } from "./section.service.js";
import { SectionController } from "./section.controller.js";

@Module({
  imports: [],
  controllers: [SectionController],
  providers: [SectionService],
  exports: [SectionService],
})
export class SectionModule {}