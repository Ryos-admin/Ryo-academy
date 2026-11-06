import { BadRequestException } from "@nestjs/common";
import { DiscountCalculator } from "./discount-calculator.js";
import { DiscountType } from "../../../generated/prisma/enums.js";
import { Prisma } from "../../../generated/prisma/client.js";

describe("DiscountCalculator", () => {
  describe("PERCENTAGE Discounts", () => {
    it("calculates exact percentage correctly with ROUND_HALF_UP (e.g. 15% of 1000 = 150)", () => {
      const result = DiscountCalculator.calculate(
        1000,
        DiscountType.PERCENTAGE,
        15,
        true,
        "Tuition Fee",
      );
      expect(result.calculatedDiscountAmount.toString()).toBe("150");
      expect(result.finalAmount.toString()).toBe("850");
      expect(result.totalAmountToBePaid.toString()).toBe("850");
    });

    it("applies ROUND_HALF_UP rounding to 2 decimal places (e.g. 15.555% on 333.33)", () => {
      // 333.33 * 15.555 / 100 = 51.8494815 -> rounded to 2 places is 51.85
      const result = DiscountCalculator.calculate(
        "333.33",
        DiscountType.PERCENTAGE,
        "15.555",
        true,
        "Tuition Fee",
      );
      expect(result.calculatedDiscountAmount.toString()).toBe("51.85");
      expect(result.finalAmount.toString()).toBe("281.48");
      expect(result.totalAmountToBePaid.toString()).toBe("281.48");
    });

    it("applies 100% discount correctly resulting in 0 payable", () => {
      const result = DiscountCalculator.calculate(
        5000,
        DiscountType.PERCENTAGE,
        100,
        true,
      );
      expect(result.calculatedDiscountAmount.toString()).toBe("5000");
      expect(result.finalAmount.toString()).toBe("0");
      expect(result.totalAmountToBePaid.toString()).toBe("0");
    });

    it("rejects percentage discount greater than 100%", () => {
      expect(() =>
        DiscountCalculator.calculate(
          5000,
          DiscountType.PERCENTAGE,
          100.01,
          true,
        ),
      ).toThrow(BadRequestException);
    });

    it("rejects zero or negative percentage discount", () => {
      expect(() =>
        DiscountCalculator.calculate(
          5000,
          DiscountType.PERCENTAGE,
          0,
          true,
        ),
      ).toThrow(BadRequestException);

      expect(() =>
        DiscountCalculator.calculate(
          5000,
          DiscountType.PERCENTAGE,
          -5,
          true,
        ),
      ).toThrow(BadRequestException);
    });
  });

  describe("FIXED Discounts (Decision 1)", () => {
    it("calculates valid fixed discount correctly", () => {
      const result = DiscountCalculator.calculate(
        2500,
        DiscountType.FIXED,
        500,
        true,
        "Lab Fee",
      );
      expect(result.calculatedDiscountAmount.toString()).toBe("500");
      expect(result.finalAmount.toString()).toBe("2000");
      expect(result.totalAmountToBePaid.toString()).toBe("2000");
    });

    it("allows fixed discount exactly equal to original amount (100% concession)", () => {
      const result = DiscountCalculator.calculate(
        2500,
        DiscountType.FIXED,
        2500,
        true,
        "Lab Fee",
      );
      expect(result.calculatedDiscountAmount.toString()).toBe("2500");
      expect(result.finalAmount.toString()).toBe("0");
      expect(result.totalAmountToBePaid.toString()).toBe("0");
    });

    it("REJECTS fixed discount exceeding original amount without auto-capping (Decision 1)", () => {
      expect(() =>
        DiscountCalculator.calculate(
          2500,
          DiscountType.FIXED,
          2500.01,
          true,
          "Lab Fee",
        ),
      ).toThrow(
        "Fixed discount amount (₹2500.01) cannot exceed fee component amount (₹2500).",
      );
    });

    it("rejects zero or negative fixed discount", () => {
      expect(() =>
        DiscountCalculator.calculate(2500, DiscountType.FIXED, 0, true),
      ).toThrow(BadRequestException);

      expect(() =>
        DiscountCalculator.calculate(2500, DiscountType.FIXED, -100, true),
      ).toThrow(BadRequestException);
    });
  });

  describe("Ineligible Component Guard", () => {
    it("rejects concession if discountApplicable is false", () => {
      expect(() =>
        DiscountCalculator.calculate(
          1000,
          DiscountType.PERCENTAGE,
          10,
          false,
          "Examination Fee",
        ),
      ).toThrow("Examination Fee is not eligible for discounts.");
    });
  });
});
