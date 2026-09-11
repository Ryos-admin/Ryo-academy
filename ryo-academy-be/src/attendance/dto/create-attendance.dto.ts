import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { AttendanceEntryDto } from './attendance-entry.dto.js';

export class CreateAttendanceDto {
  @ApiProperty({ example: 'academic-year-uuid', type: String })
  @IsString()
  @IsNotEmpty()
  academicYearId!: string;
  @ApiProperty({ example: 'class-uuid', type: String })
  @IsString()
  @IsNotEmpty()
  classId!: string;
  @ApiProperty({ example: 'section-uuid', type: String })
  @IsString()
  @IsNotEmpty()
  sectionId!: string;
  @ApiProperty({ example: '2027-06-01', format: 'date' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must be in YYYY-MM-DD format',
  })
  date!: string;
  @ApiProperty({ type: [AttendanceEntryDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AttendanceEntryDto)
  entries!: AttendanceEntryDto[];
}
