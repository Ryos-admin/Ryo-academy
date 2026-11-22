import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryFeeDashboardDto {
  @ApiPropertyOptional({ default: 1, minimum: 1, description: 'Page number' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page must be an integer' })
  @Min(1, { message: 'page must not be less than 1' })
  page: number = 1;

  @ApiPropertyOptional({ default: 25, minimum: 1, maximum: 100, description: 'Items per page' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'pageSize must be an integer' })
  @Min(1, { message: 'pageSize must not be less than 1' })
  @Max(100, { message: 'pageSize must not be greater than 100' })
  pageSize: number = 25;

  @ApiPropertyOptional({ description: 'Filter by student name or admission number' })
  @IsOptional()
  @IsString({ message: 'search must be a string' })
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by class UUID' })
  @IsOptional()
  @IsUUID('4', { message: 'classId must be a valid UUID' })
  classId?: string;

  @ApiPropertyOptional({ description: 'Filter by program UUID' })
  @IsOptional()
  @IsUUID('4', { message: 'programId must be a valid UUID' })
  programId?: string;
}
