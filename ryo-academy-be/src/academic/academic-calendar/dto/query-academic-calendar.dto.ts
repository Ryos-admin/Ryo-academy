import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBooleanString,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { DayTypeDto } from './create-academic-calendar.dto.js';

export class QueryAcademicCalendarDto {
  @ApiPropertyOptional({ example: 'academic-year-uuid', type: String })
  @IsOptional()
  @IsString()
  academicYearId?: string;

  @ApiPropertyOptional({ example: '2027-06-01', format: 'date', type: String })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'from must be in YYYY-MM-DD format',
  })
  from?: string;

  @ApiPropertyOptional({ example: '2028-05-31', format: 'date', type: String })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'to must be in YYYY-MM-DD format',
  })
  to?: string;

  @ApiPropertyOptional({ enum: DayTypeDto, type: String })
  @IsOptional()
  @IsEnum(DayTypeDto)
  dayType?: DayTypeDto;

  @ApiPropertyOptional({ example: true, type: Boolean })
  @IsOptional()
  @IsBooleanString()
  isWorkingDay?: string;
}
