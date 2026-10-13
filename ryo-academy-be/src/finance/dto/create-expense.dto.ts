import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';
import { ExpenseCategory } from '../../../generated/prisma/enums.js';

export class CreateExpenseDto {
  @ApiProperty({ enum: ExpenseCategory })
  @IsEnum(ExpenseCategory)
  category!: ExpenseCategory;

  @ApiProperty({ example: 1250 })
  @IsNumber()
  @IsPositive()
  @IsNotEmpty()
  amount!: number;

  @ApiProperty({ example: '2026-10-10' })
  @IsDateString()
  occurredAt!: string;

  @ApiPropertyOptional({ example: 'Classroom supplies' })
  @IsOptional()
  @IsString()
  description?: string;
}
