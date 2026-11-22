import { IsNotEmpty, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateSchoolConfigurationDto {
  @ApiProperty({
    description: 'UUID of the active Academic Year for the school',
    example: '3f8a1b2c-4d5e-6f7a-8b9c-0d1e2f3a4b5c',
  })
  @IsUUID('4', { message: 'activeAcademicYearId must be a valid UUID' })
  @IsNotEmpty({ message: 'activeAcademicYearId is required' })
  activeAcademicYearId: string;
}
