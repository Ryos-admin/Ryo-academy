import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class ReverseStudentFeePaymentDto {
  @ApiProperty({
    description: 'Unique client-supplied idempotency key for safely retrying or recovering payment reversal requests.',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID('4', { message: 'idempotencyKey must be a valid UUID v4' })
  @IsNotEmpty({ message: 'idempotencyKey is required' })
  idempotencyKey!: string;

  @ApiProperty({
    description: 'Detailed explanation/reason for performing the fee payment reversal.',
    example: 'Check bounced by issuing bank on clearing cycle.',
  })
  @IsString({ message: 'reason must be a string' })
  @IsNotEmpty({ message: 'reason is required' })
  reason!: string;
}
