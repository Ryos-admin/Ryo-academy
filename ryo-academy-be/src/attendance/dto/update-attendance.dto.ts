import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { AttendanceEntryDto } from './attendance-entry.dto.js';

export class UpdateAttendanceDto {
  @ApiPropertyOptional({ type: [AttendanceEntryDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AttendanceEntryDto)
  entries?: AttendanceEntryDto[];
}
