import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  Equals,
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IsMoneyString } from '../../../common/money/money.util.js';
import { PaymentMethod } from '../../../../generated/prisma/enums.js';

export class AdmissionComponentAllocationDto {
  @ApiProperty({
    description: 'Target fee payment detail snapshot ID',
    format: 'uuid',
  })
  @IsUUID()
  @IsNotEmpty({ message: 'feePaymentDetailsId is required.' })
  feePaymentDetailsId!: string;

  @ApiProperty({
    description: 'Exact decimal amount allocated to this component (max 2 decimal places)',
    example: '1000.00',
    type: String,
  })
  @IsMoneyString({ message: 'Allocation amount must be a decimal string with no more than two fractional digits.' })
  @IsNotEmpty({ message: 'Allocation amount is required.' })
  amount!: string;
}

export class CreateAdmissionPaymentDto {
  @ApiProperty({
    description: 'Client-generated UUID idempotency key to safely retry the payment request.',
    format: 'uuid',
  })
  @IsUUID()
  @IsNotEmpty({ message: 'idempotencyKey is required.' })
  idempotencyKey!: string;

  @ApiPropertyOptional({
    description: 'Target fee payment header ID. Required only if multiple active headers exist on the admission.',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  feePaymentHeaderId?: string;

  @ApiProperty({
    description: 'Total payment amount. Must match the exact sum of component allocations.',
    example: '1000.00',
    type: String,
  })
  @IsMoneyString({ message: 'Payment amount must be a decimal string with no more than two fractional digits.' })
  @IsNotEmpty({ message: 'Payment amount is required.' })
  amount!: string;

  @ApiProperty({
    enum: [PaymentMethod.CASH],
    description: 'Payment method. V0 supports CASH only.',
    example: PaymentMethod.CASH,
  })
  @IsEnum(PaymentMethod)
  @Equals(PaymentMethod.CASH, { message: 'V0 supports CASH payment method only.' })
  paymentMethod!: PaymentMethod;

  @ApiProperty({
    description: 'Mandatory explicit payment date in ISO format (e.g., 2026-11-09T18:00:00.000Z or 2026-11-09).',
    example: '2026-11-09T18:00:00.000Z',
    type: String,
  })
  @IsDateString({}, { message: 'paymentDate must be a valid ISO date string and is mandatory for V0 payments.' })
  @IsNotEmpty({ message: 'paymentDate is mandatory.' })
  paymentDate!: string;

  @ApiProperty({
    type: [AdmissionComponentAllocationDto],
    description: 'Explicit list of component allocations. Must not be empty.',
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one component allocation must be provided.' })
  @ValidateNested({ each: true })
  @Type(() => AdmissionComponentAllocationDto)
  allocations!: AdmissionComponentAllocationDto[];
}
