import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateSubjectDto {
  @ApiProperty({ example: 'class-uuid', type: String })
  @IsString()
  @IsNotEmpty()
  classId: string;

  @ApiProperty({ example: 'Mathematics', type: String })
  @IsString()
  @IsNotEmpty()
  name: string;
}
