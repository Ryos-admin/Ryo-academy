import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

export enum DayTypeDto {
  WORKING_DAY = 'WORKING_DAY',
  WEEKEND = 'WEEKEND',
  HOLIDAY = 'HOLIDAY',
  SPECIAL_WORKING_DAY = 'SPECIAL_WORKING_DAY',
}

export class CreateAcademicCalendarDto {
  @ApiProperty({ example: 'academic-year-uuid', type: String })
  @IsString()
  @IsNotEmpty()
  academicYearId!: string;

  @ApiProperty({ example: '2027-06-01', format: 'date' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must be in YYYY-MM-DD format',
  })
  date!: string;

  @ApiProperty({ enum: DayTypeDto, type: String })
  @IsEnum(DayTypeDto)
  dayType!: DayTypeDto;

  @ApiProperty({ example: 'School reopening', type: String })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: true, type: Boolean })
  @IsBoolean()
  isWorkingDay!: boolean;
}
