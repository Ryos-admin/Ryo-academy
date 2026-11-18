import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ActiveAcademicYearSummaryDto {
  @ApiProperty({ example: '3f8a1b2c-4d5e-6f7a-8b9c-0d1e2f3a4b5c' })
  id: string;

  @ApiProperty({ example: 'AY 2025–26' })
  name: string;

  @ApiProperty({ example: '2025-06-01T00:00:00.000Z' })
  startDate: Date;

  @ApiProperty({ example: '2026-05-31T00:00:00.000Z' })
  endDate: Date;

  @ApiProperty({ example: true })
  isActive: boolean;
}

export class SchoolConfigurationResponseDto {
  @ApiProperty({ example: 'school-1-uuid' })
  schoolId: string;

  @ApiProperty({ example: 'Ryo Central Academy' })
  schoolName: string;

  @ApiProperty({ example: 'RCA' })
  schoolCode: string;

  @ApiPropertyOptional({ example: '3f8a1b2c-4d5e-6f7a-8b9c-0d1e2f3a4b5c', nullable: true })
  activeAcademicYearId: string | null;

  @ApiPropertyOptional({ type: ActiveAcademicYearSummaryDto, nullable: true })
  activeAcademicYear: ActiveAcademicYearSummaryDto | null;

  @ApiProperty({ example: true })
  isConfigured: boolean;

  @ApiProperty({ example: false })
  isInvalid: boolean;
}
