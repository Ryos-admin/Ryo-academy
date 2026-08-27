import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateAcademicYearDto } from './create-academic-year.dto.js';

export class UpdateAcademicYearDto extends PartialType(
  OmitType(CreateAcademicYearDto, ['schoolId'] as const),
) {}
