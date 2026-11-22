import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class ReverseAdmissionPaymentDto {
  @ApiProperty({
    description: 'Client-generated UUID idempotency key to safely retry the reversal request.',
    format: 'uuid',
  })
  @IsUUID()
  @IsNotEmpty({ message: 'idempotencyKey is required and must be a UUID.' })
  idempotencyKey!: string;

  @ApiProperty({
    description: 'Mandatory reason for full payment reversal.',
    example: 'Entered wrong fee components at front desk',
  })
  @IsString()
  @IsNotEmpty({ message: 'Reversal reason is required.' })
  reason!: string;
}
