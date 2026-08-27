import { Type } from 'class-transformer';
import { IsDate, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateAcademicYearDto {
  @ApiProperty({
    description: 'Unique code identifying the school',
    example: 'RYO',
  })
  @IsString()
  @IsNotEmpty()
  schoolId: string;

  @ApiProperty({
    description: 'Academic year name, e.g., 2027-28',
    example: '2027-28',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'Start date of the academic year',
    example: '2027-06-01',
    type: String,
    format: 'date',
  })
  @Type(() => Date)
  @IsDate()
  startDate: Date;

  @ApiProperty({
    description: 'End date of the academic year',
    example: '2028-05-31',
    type: String,
    format: 'date',
  })
  @Type(() => Date)
  @IsDate()
  endDate: Date;
}
