import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ActiveAcademicYearDashboardSummaryDto {
  @ApiProperty({ example: '3f8a1b2c-4d5e-6f7a-8b9c-0d1e2f3a4b5c' })
  id: string;

  @ApiProperty({ example: 'AY 2026-27' })
  name: string;

  @ApiProperty({ example: '2026-06-01T00:00:00.000Z' })
  startDate: Date;

  @ApiProperty({ example: '2027-05-31T00:00:00.000Z' })
  endDate: Date;
}

export class FeeDashboardResponseDto {
  @ApiProperty({ example: true })
  configured: boolean;

  @ApiProperty({ example: false })
  invalidConfiguration: boolean;

  @ApiPropertyOptional({ type: ActiveAcademicYearDashboardSummaryDto, nullable: true })
  activeAcademicYear: ActiveAcademicYearDashboardSummaryDto | null;

  @ApiProperty({ type: [Object], description: 'List of confirmed admissions' })
  data: any[];

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 25 })
  pageSize: number;

  @ApiProperty({ example: 100 })
  total: number;

  @ApiProperty({ example: 4 })
  totalPages: number;
}
