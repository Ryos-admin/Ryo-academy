import { BadRequestException } from "@nestjs/common";
import { Prisma } from "../../../generated/prisma/client.js";
import { DiscountType } from "../../../generated/prisma/enums.js";
import "../../common/money/decimal-precision.js";

export interface ConcessionCalculationResult {
  originalAmount: Prisma.Decimal;
  discountType: DiscountType;
  discountValue: Prisma.Decimal;
  calculatedDiscountAmount: Prisma.Decimal;
  finalAmount: Prisma.Decimal;
  totalAmountToBePaid: Prisma.Decimal;
}

export class DiscountCalculator {
  /**
   * Calculates the discount for a single fee component according to approved domain rules:
   * 1. Only discountApplicable components qualify.
   * 2. PERCENTAGE: 0 < discountValue <= 100.
   * 3. FIXED: 0 < discountValue <= originalAmount (Decision 1: Reject if exceeds, no auto-capping).
   * 4. Decimal arithmetic with ROUND_HALF_UP to two decimal places.
   * 5. finalAmount = originalAmount - calculatedDiscountAmount.
   * 6. totalAmountToBePaid = finalAmount.
   */
  static calculate(
    rawOriginalAmount: Prisma.Decimal | number | string,
    rawDiscountType: DiscountType | string,
    rawDiscountValue: Prisma.Decimal | number | string,
    discountApplicable: boolean,
    componentName = "Fee component",
  ): ConcessionCalculationResult {
    const originalAmount = new Prisma.Decimal(rawOriginalAmount.toString());
    const discountValue = new Prisma.Decimal(rawDiscountValue.toString());
    const discountType = rawDiscountType as DiscountType;

    if (!discountApplicable) {
      throw new BadRequestException(
        `${componentName} is not eligible for discounts.`,
      );
    }

    if (discountValue.lte(0)) {
      throw new BadRequestException("Discount value must be greater than zero.");
    }

    let calculatedDiscountAmount: Prisma.Decimal;

    if (discountType === DiscountType.PERCENTAGE) {
      if (discountValue.gt(100)) {
        throw new BadRequestException(
          "Percentage discount cannot exceed 100%.",
        );
      }
      const rawDiscount = originalAmount.mul(discountValue).div(100);
      calculatedDiscountAmount = rawDiscount.toDecimalPlaces(
        2,
        Prisma.Decimal.ROUND_HALF_UP,
      );
    } else if (discountType === DiscountType.FIXED) {
      if (discountValue.gt(originalAmount)) {
        throw new BadRequestException(
          `Fixed discount amount (₹${discountValue}) cannot exceed fee component amount (₹${originalAmount}).`,
        );
      }
      calculatedDiscountAmount = discountValue.toDecimalPlaces(
        2,
        Prisma.Decimal.ROUND_HALF_UP,
      );
    } else {
      throw new BadRequestException(`Unsupported discount type "${discountType}".`);
    }

    // Mathematical safety invariant
    if (calculatedDiscountAmount.gt(originalAmount)) {
      calculatedDiscountAmount = originalAmount;
    }

    const finalAmount = originalAmount.minus(calculatedDiscountAmount);
    const totalAmountToBePaid = finalAmount;

    return {
      originalAmount,
      discountType,
      discountValue,
      calculatedDiscountAmount,
      finalAmount,
      totalAmountToBePaid,
    };
  }
}
