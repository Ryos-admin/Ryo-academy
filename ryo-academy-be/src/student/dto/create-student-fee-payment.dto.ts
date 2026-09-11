import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsNumber, IsOptional, IsPositive } from 'class-validator';

export class CreateStudentFeePaymentDto {
  @ApiProperty({
    description: 'Payment amount to record against the student admission fee snapshot.',
    example: 2500,
    type: Number,
  })
  @IsNumber({}, { message: 'Payment amount must be a number.' })
  @IsPositive({ message: 'Payment amount must be greater than zero.' })
  @IsNotEmpty({ message: 'Payment amount is required.' })
  amount!: number;

  @ApiPropertyOptional({
    description: 'Payment date for the recorded fee payment. Defaults to the current server date when omitted.',
    example: '2026-09-11',
    type: String,
  })
  @IsOptional()
  @IsDateString({}, { message: 'Payment date must be a valid ISO date string.' })
  paymentDate?: string;
}
