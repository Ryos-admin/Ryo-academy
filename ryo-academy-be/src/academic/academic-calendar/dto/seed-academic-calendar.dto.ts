import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsString,
} from 'class-validator';

export enum WeekdayDto {
  MONDAY = 'MONDAY',
  TUESDAY = 'TUESDAY',
  WEDNESDAY = 'WEDNESDAY',
  THURSDAY = 'THURSDAY',
  FRIDAY = 'FRIDAY',
  SATURDAY = 'SATURDAY',
  SUNDAY = 'SUNDAY',
}

export class SeedAcademicCalendarDto {
  @ApiProperty({ example: 'academic-year-uuid', type: String })
  @IsString()
  @IsNotEmpty()
  academicYearId!: string;

  @ApiProperty({
    enum: WeekdayDto,
    isArray: true,
    type: [String],
    example: ['SATURDAY', 'SUNDAY'],
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsEnum(WeekdayDto, { each: true })
  weeklyOffDays!: WeekdayDto[];
}
