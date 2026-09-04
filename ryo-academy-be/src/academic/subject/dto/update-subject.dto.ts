import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class UpdateSubjectDto {
  @ApiProperty({ example: 'Advanced Mathematics' })
  @IsString()
  @IsNotEmpty()
  name!: string;
}
