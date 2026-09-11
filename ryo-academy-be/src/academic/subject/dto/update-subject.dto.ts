import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class UpdateSubjectDto {
  @ApiProperty({ example: 'Advanced Mathematics', type: String })
  @IsString()
  @IsNotEmpty()
  name!: string;
}
