import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { IsMoneyString } from '../../common/money/money.util.js';
import { PaymentMethod } from '../../../generated/prisma/enums.js';
import { AdmissionComponentAllocationDto } from '../../admission/admission-payment/dto/create-admission-payment.dto.js';

export class CreateStudentFeePaymentDto {
  @ApiProperty({
    description: 'Stable key used to safely retry the same payment request.',
    format: 'uuid',
  })
  @IsUUID()
  @IsNotEmpty({ message: 'idempotencyKey is required.' })
  idempotencyKey!: string;

  @ApiPropertyOptional({
    description: 'Target fee payment header ID. Required if multiple active headers exist on the admission.',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  feePaymentHeaderId?: string;

  @ApiProperty({
    description: 'Payment amount to record against the student admission fee snapshot (max 2 decimal places).',
    example: '2500.00',
    type: String,
  })
  @IsMoneyString({ message: 'Payment amount must be a decimal string with no more than two fractional digits.' })
  @IsNotEmpty({ message: 'Payment amount is required.' })
  amount!: string;

  @ApiPropertyOptional({
    description: 'Payment date for the recorded fee payment. Defaults to the current server date when omitted.',
    example: '2026-09-11',
    type: String,
  })
  @IsOptional()
  @IsDateString({}, { message: 'Payment date must be a valid ISO date string.' })
  paymentDate?: string;

  @ApiPropertyOptional({
    enum: [PaymentMethod.CASH],
    description: 'Payment method. Required as CASH for V0 pricing headers.',
    example: PaymentMethod.CASH,
  })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({
    type: [AdmissionComponentAllocationDto],
    description: 'Explicit list of component allocations. Required for V0 pricing headers.',
  })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => AdmissionComponentAllocationDto)
  allocations?: AdmissionComponentAllocationDto[];
}
