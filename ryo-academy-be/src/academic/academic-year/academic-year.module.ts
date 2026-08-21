import { Module } from '@nestjs/common';
import { AcademicYearService } from './academic-year.service.js';
import { AcademicYearController } from './academic-year.controller.js';

@Module({
  controllers: [AcademicYearController],
  providers: [AcademicYearService],
  exports: [AcademicYearService],
})
export class AcademicYearModule {}
