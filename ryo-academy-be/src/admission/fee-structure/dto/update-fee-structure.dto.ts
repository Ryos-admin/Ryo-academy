import { PartialType, OmitType } from '@nestjs/mapped-types';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { FeeStructureDto } from './fee-structure.dto.js';

export class UpdateFeeStructureDto extends PartialType(
  OmitType(FeeStructureDto, ['academicYearId', 'programId', 'classId', 'feeComponents'] as const),
) {
  @ApiPropertyOptional({
    description: 'Whether the fee structure is available for new admissions.',
    type: Boolean,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}