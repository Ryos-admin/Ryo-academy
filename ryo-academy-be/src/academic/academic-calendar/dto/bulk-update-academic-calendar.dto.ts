import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayNotEmpty, ArrayUnique, IsArray, IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';
import { DayTypeDto } from './create-academic-calendar.dto.js';

export class BulkUpdateAcademicCalendarDto {
  @ApiProperty({ example: 'academic-year-uuid' })
  @IsString()
  @IsNotEmpty()
  academicYearId!: string;

  @ApiProperty({ type: [String], example: ['2027-06-01', '2027-06-02'] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { each: true, message: 'dates must be in YYYY-MM-DD format' })
  dates!: string[];

  @ApiProperty({ enum: DayTypeDto })
  @IsEnum(DayTypeDto)
  dayType!: DayTypeDto;

  @ApiProperty({ example: 'Working Day' })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  isWorkingDay!: boolean;
}
