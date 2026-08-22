import { Module } from "@nestjs/common";
import { ClassService } from "./class.service.js";
import { ClassController } from "./class.controller.js";

@Module({
  imports: [],
  controllers: [ClassController],
  providers: [ClassService],
  exports: [ClassService],
})
export class ClassModule {}