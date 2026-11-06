import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsUUID } from "class-validator";
import { IsDecimalString } from "../../../common/money/money.util.js";

export class CreateAdmissionConcessionDto {
  @ApiProperty({ example: "fee-payment-details-uuid" })
  @IsUUID()
  @IsNotEmpty()
  feePaymentDetailsId!: string;

  @ApiProperty({ example: "1250.00", type: String })
  @IsDecimalString()
  payableAmount!: string;
}

export class UpdateAdmissionConcessionDto {
  @ApiProperty({ example: "1250.00", type: String })
  @IsDecimalString()
  payableAmount!: string;
}
