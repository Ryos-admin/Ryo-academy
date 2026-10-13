import { IsDateString, IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { FinancialFlowType, FinancialSourceType } from '../../../generated/prisma/enums.js';

export class QueryFinancialLogDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsEnum(FinancialFlowType) flowType?: FinancialFlowType;
  @IsOptional() @IsEnum(FinancialSourceType) sourceType?: FinancialSourceType;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 25;
}
