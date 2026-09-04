import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateSubjectDto {
  @ApiProperty({ example: 'class-uuid' })
  @IsString()
  @IsNotEmpty()
  classId: string;

  @ApiProperty({ example: 'Mathematics' })
  @IsString()
  @IsNotEmpty()
  name: string;
}
