import { Module } from "@nestjs/common";
import { ProgramController } from "./program.controller.js";
import { ProgramService } from "./program.service.js";

@Module({
  imports: [],
  controllers: [ProgramController],
  providers: [ProgramService],
  exports: [ProgramService],
})
export class ProgramModule {}