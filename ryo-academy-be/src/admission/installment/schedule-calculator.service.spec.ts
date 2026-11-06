import { BadRequestException } from "@nestjs/common";
import { ScheduleCalculatorService } from "./schedule-calculator.service.js";
import { InstallmentCalculationType } from "../../../generated/prisma/enums.js";
import { Prisma } from "../../../generated/prisma/client.js";

const Decimal = Prisma.Decimal;

describe("ScheduleCalculatorService", () => {
  let service: ScheduleCalculatorService;

  beforeEach(() => {
    service = new ScheduleCalculatorService();
  });

  describe("Group B: Percentage Calculations", () => {
    it("should calculate exact amounts for a standard 50% / 30% / 20% schedule", () => {
      const template = {
        calculationType: InstallmentCalculationType.PERCENTAGE,
        installmentCount: 3,
        items: [
          { sequence: 1, label: "Term 1", percentage: 50, dueDaysAfterAdmission: 0 },
          { sequence: 2, label: "Term 2", percentage: 30, dueDaysAfterAdmission: 60 },
          { sequence: 3, label: "Term 3", percentage: 20, dueDaysAfterAdmission: 60 },
        ],
      };

      const result = service.calculateSchedule(100000, template, "2026-06-15");
      expect(result.installments.length).toBe(3);
      expect(result.installments[0].amount.toString()).toBe("50000");
      expect(result.installments[1].amount.toString()).toBe("30000");
      expect(result.installments[2].amount.toString()).toBe("20000");

      const sum = result.installments.reduce((acc, it) => acc.plus(it.amount), new Decimal(0));
      expect(sum.toString()).toBe("100000");
    });

    it("should reject percentage total below 100%", () => {
      const template = {
        calculationType: InstallmentCalculationType.PERCENTAGE,
        installmentCount: 2,
        items: [
          { sequence: 1, label: "Part 1", percentage: 50, dueDaysAfterAdmission: 0 },
          { sequence: 2, label: "Part 2", percentage: 49.99, dueDaysAfterAdmission: 30 },
        ],
      };

      expect(() => service.calculateSchedule(50000, template, "2026-06-15")).toThrow(
        BadRequestException,
      );
    });

    it("should reject percentage total above 100%", () => {
      const template = {
        calculationType: InstallmentCalculationType.PERCENTAGE,
        installmentCount: 2,
        items: [
          { sequence: 1, label: "Part 1", percentage: 50, dueDaysAfterAdmission: 0 },
          { sequence: 2, label: "Part 2", percentage: 50.01, dueDaysAfterAdmission: 30 },
        ],
      };

      expect(() => service.calculateSchedule(50000, template, "2026-06-15")).toThrow(
        BadRequestException,
      );
    });

    it("should absorb rounding remainder in the final installment (e.g. 1/3 splits: 33.33 / 33.33 / 33.34)", () => {
      const template = {
        calculationType: InstallmentCalculationType.PERCENTAGE,
        installmentCount: 3,
        items: [
          { sequence: 1, label: "Term 1", percentage: 33.33, dueDaysAfterAdmission: 0 },
          { sequence: 2, label: "Term 2", percentage: 33.33, dueDaysAfterAdmission: 30 },
          { sequence: 3, label: "Term 3", percentage: 33.34, dueDaysAfterAdmission: 30 },
        ],
      };

      // ₹10,000 net amount:
      // Inst 1: 10000 * 33.33% = 3333.00
      // Inst 2: 10000 * 33.33% = 3333.00
      // Inst 3 absorbs remainder: 10000 - 6666 = 3334.00
      const result = service.calculateSchedule(10000, template, "2026-06-15");
      expect(result.installments[0].amount.toString()).toBe("3333");
      expect(result.installments[1].amount.toString()).toBe("3333");
      expect(result.installments[2].amount.toString()).toBe("3334");

      const sum = result.installments.reduce((acc, it) => acc.plus(it.amount), new Decimal(0));
      expect(sum.toString()).toBe("10000");
    });

    it("should handle fractional decimal boundary cases (e.g. ₹100.01 with 50/50 split)", () => {
      const template = {
        calculationType: InstallmentCalculationType.PERCENTAGE,
        installmentCount: 2,
        items: [
          { sequence: 1, label: "T1", percentage: 50, dueDaysAfterAdmission: 0 },
          { sequence: 2, label: "T2", percentage: 50, dueDaysAfterAdmission: 30 },
        ],
      };

      // ₹100.01 * 50% = 50.005 -> ROUND_HALF_UP = 50.01
      // Final absorbs remainder: 100.01 - 50.01 = 50.00
      const result = service.calculateSchedule(100.01, template, "2026-06-15");
      expect(result.installments[0].amount.toFixed(2)).toBe("50.01");
      expect(result.installments[1].amount.toFixed(2)).toBe("50.00");

      const sum = result.installments.reduce((acc, it) => acc.plus(it.amount), new Decimal(0));
      expect(sum.toFixed(2)).toBe("100.01");
    });

    it("should correctly calculate awkward monetary values exercising ROUND_HALF_UP", () => {
      const template = {
        calculationType: InstallmentCalculationType.PERCENTAGE,
        installmentCount: 3,
        items: [
          { sequence: 1, label: "Term 1", percentage: 33.33, dueDaysAfterAdmission: 0 },
          { sequence: 2, label: "Term 2", percentage: 33.33, dueDaysAfterAdmission: 30 },
          { sequence: 3, label: "Term 3", percentage: 33.34, dueDaysAfterAdmission: 30 },
        ],
      };

      // ₹1,234.56 net obligation:
      // Inst 1: 1234.56 * 33.33% = 411.478848 -> 411.48
      // Inst 2: 1234.56 * 33.33% = 411.478848 -> 411.48
      // Inst 3: 1234.56 - 822.96 = 411.60
      const result = service.calculateSchedule(1234.56, template, "2026-06-15");
      expect(result.installments[0].amount.toFixed(2)).toBe("411.48");
      expect(result.installments[1].amount.toFixed(2)).toBe("411.48");
      expect(result.installments[2].amount.toFixed(2)).toBe("411.60");

      const sum = result.installments.reduce((acc, it) => acc.plus(it.amount), new Decimal(0));
      expect(sum.toFixed(2)).toBe("1234.56");

      // Another awkward value: ₹777.77 with 30% / 35% / 35%
      const template2 = {
        calculationType: InstallmentCalculationType.PERCENTAGE,
        installmentCount: 3,
        items: [
          { sequence: 1, label: "T1", percentage: 30, dueDaysAfterAdmission: 0 },
          { sequence: 2, label: "T2", percentage: 35, dueDaysAfterAdmission: 30 },
          { sequence: 3, label: "T3", percentage: 35, dueDaysAfterAdmission: 30 },
        ],
      };
      // 777.77 * 30% = 233.331 -> 233.33
      // 777.77 * 35% = 272.2195 -> 272.22
      // Inst 3 absorbs: 777.77 - (233.33 + 272.22) = 272.22
      const result2 = service.calculateSchedule(777.77, template2, "2026-06-15");
      expect(result2.installments[0].amount.toFixed(2)).toBe("233.33");
      expect(result2.installments[1].amount.toFixed(2)).toBe("272.22");
      expect(result2.installments[2].amount.toFixed(2)).toBe("272.22");
      const sum2 = result2.installments.reduce((acc, it) => acc.plus(it.amount), new Decimal(0));
      expect(sum2.toFixed(2)).toBe("777.77");
    });

    it("should guarantee final installment remains positive and reject if net amount is too small", () => {
      const template = {
        calculationType: InstallmentCalculationType.PERCENTAGE,
        installmentCount: 2,
        items: [
          { sequence: 1, label: "T1", percentage: 99.99, dueDaysAfterAdmission: 0 },
          { sequence: 2, label: "T2", percentage: 0.01, dueDaysAfterAdmission: 30 },
        ],
      };

      // ₹0.01 net amount:
      // Inst 1: 0.01 * 99.99% = 0.009999 -> ROUND_HALF_UP = 0.01
      // Remainder for Inst 2: 0.01 - 0.01 = 0.00 (non-positive!)
      expect(() => service.calculateSchedule(0.01, template, "2026-06-15")).toThrow(
        BadRequestException,
      );
    });
  });

  describe("Group C: Fixed-Amount Calculations", () => {
    it("should calculate exact fixed amounts when sum matches net obligation", () => {
      const template = {
        calculationType: InstallmentCalculationType.CUSTOM_AMOUNT,
        installmentCount: 3,
        items: [
          { sequence: 1, label: "Inst 1", fixedAmount: 40000, dueDaysAfterAdmission: 0 },
          { sequence: 2, label: "Inst 2", fixedAmount: 35000, dueDaysAfterAdmission: 30 },
          { sequence: 3, label: "Inst 3", fixedAmount: 25000, dueDaysAfterAdmission: 30 },
        ],
      };

      const result = service.calculateSchedule(100000, template, "2026-06-15", false);
      expect(result.installments[0].amount.toString()).toBe("40000");
      expect(result.installments[1].amount.toString()).toBe("35000");
      expect(result.installments[2].amount.toString()).toBe("25000");
      const sum = result.installments.reduce((acc, it) => acc.plus(it.amount), new Decimal(0));
      expect(sum.toString()).toBe("100000");
    });

    it("should reject fixed amount mismatch when difference absorption is disabled", () => {
      const template = {
        calculationType: InstallmentCalculationType.CUSTOM_AMOUNT,
        installmentCount: 2,
        items: [
          { sequence: 1, label: "Inst 1", fixedAmount: 40000, dueDaysAfterAdmission: 0 },
          { sequence: 2, label: "Inst 2", fixedAmount: 40000, dueDaysAfterAdmission: 30 },
        ],
      };

      // ₹80,000 fixed sum vs ₹100,000 net obligation
      expect(() => service.calculateSchedule(100000, template, "2026-06-15", false)).toThrow(
        BadRequestException,
      );
    });

    it("should absorb positive difference in final installment when absorption is enabled", () => {
      const template = {
        calculationType: InstallmentCalculationType.CUSTOM_AMOUNT,
        installmentCount: 3,
        items: [
          { sequence: 1, label: "Inst 1", fixedAmount: 30000, dueDaysAfterAdmission: 0 },
          { sequence: 2, label: "Inst 2", fixedAmount: 30000, dueDaysAfterAdmission: 30 },
          { sequence: 3, label: "Inst 3", fixedAmount: 30000, dueDaysAfterAdmission: 30 },
        ],
      };

      // ₹90,000 fixed sum vs ₹100,000 net obligation (difference: +₹10,000)
      const result = service.calculateSchedule(100000, template, "2026-06-15", true);
      expect(result.installments[0].amount.toString()).toBe("30000");
      expect(result.installments[1].amount.toString()).toBe("30000");
      expect(result.installments[2].amount.toString()).toBe("40000"); // 30000 + 10000
      const sum = result.installments.reduce((acc, it) => acc.plus(it.amount), new Decimal(0));
      expect(sum.toString()).toBe("100000");
    });

    it("should absorb negative difference in final installment when absorption is enabled and final amount remains positive", () => {
      const template = {
        calculationType: InstallmentCalculationType.CUSTOM_AMOUNT,
        installmentCount: 3,
        items: [
          { sequence: 1, label: "Inst 1", fixedAmount: 40000, dueDaysAfterAdmission: 0 },
          { sequence: 2, label: "Inst 2", fixedAmount: 40000, dueDaysAfterAdmission: 30 },
          { sequence: 3, label: "Inst 3", fixedAmount: 40000, dueDaysAfterAdmission: 30 },
        ],
      };

      // ₹120,000 fixed sum vs ₹100,000 net obligation (difference: -₹20,000)
      const result = service.calculateSchedule(100000, template, "2026-06-15", true);
      expect(result.installments[0].amount.toString()).toBe("40000");
      expect(result.installments[1].amount.toString()).toBe("40000");
      expect(result.installments[2].amount.toString()).toBe("20000"); // 40000 - 20000 = 20000 (> 0)
      const sum = result.installments.reduce((acc, it) => acc.plus(it.amount), new Decimal(0));
      expect(sum.toString()).toBe("100000");
    });

    it("should reject absorption when prior installments exceed or equal net obligation (producing non-positive final installment)", () => {
      const template = {
        calculationType: InstallmentCalculationType.CUSTOM_AMOUNT,
        installmentCount: 3,
        items: [
          { sequence: 1, label: "Inst 1", fixedAmount: 60000, dueDaysAfterAdmission: 0 },
          { sequence: 2, label: "Inst 2", fixedAmount: 50000, dueDaysAfterAdmission: 30 },
          { sequence: 3, label: "Inst 3", fixedAmount: 10000, dueDaysAfterAdmission: 30 },
        ],
      };

      // Prior installments = ₹110,000 vs net obligation ₹100,000 -> final = -₹10,000
      expect(() => service.calculateSchedule(100000, template, "2026-06-15", true)).toThrow(
        BadRequestException,
      );
    });

    it("should reject absorption when final installment becomes exactly zero", () => {
      const template = {
        calculationType: InstallmentCalculationType.CUSTOM_AMOUNT,
        installmentCount: 3,
        items: [
          { sequence: 1, label: "Inst 1", fixedAmount: 50000, dueDaysAfterAdmission: 0 },
          { sequence: 2, label: "Inst 2", fixedAmount: 50000, dueDaysAfterAdmission: 30 },
          { sequence: 3, label: "Inst 3", fixedAmount: 10000, dueDaysAfterAdmission: 30 },
        ],
      };

      // Prior installments = ₹100,000 == net obligation ₹100,000 -> final = ₹0 (rejected)
      expect(() => service.calculateSchedule(100000, template, "2026-06-15", true)).toThrow(
        BadRequestException,
      );
    });

    it("should reject non-positive fixed amounts in template items", () => {
      const template = {
        calculationType: InstallmentCalculationType.CUSTOM_AMOUNT,
        installmentCount: 2,
        items: [
          { sequence: 1, label: "Inst 1", fixedAmount: -500, dueDaysAfterAdmission: 0 },
          { sequence: 2, label: "Inst 2", fixedAmount: 50000, dueDaysAfterAdmission: 30 },
        ],
      };

      expect(() => service.calculateSchedule(50000, template, "2026-06-15", false)).toThrow(
        BadRequestException,
      );
    });
  });

  describe("Group D: Due-Date Calculations & Timezone Handling", () => {
    it("should calculate due dates from previous installment matching the approved prompt example", () => {
      // Prompt example:
      // First due date: 2026-06-15
      // Intervals: 0, 30, 30 days
      // Installment 1: 2026-06-15
      // Installment 2: 2026-07-15
      // Installment 3: 2026-08-14
      const template = {
        calculationType: InstallmentCalculationType.PERCENTAGE,
        installmentCount: 3,
        items: [
          { sequence: 1, label: "Inst 1", percentage: 40, intervalDaysAfterPrevious: 0 },
          { sequence: 2, label: "Inst 2", percentage: 30, intervalDaysAfterPrevious: 30 },
          { sequence: 3, label: "Inst 3", percentage: 30, intervalDaysAfterPrevious: 30 },
        ],
      };

      const result = service.calculateSchedule(10000, template, "2026-06-15");
      expect(result.installments[0].dueDateFormatted).toBe("2026-06-15");
      expect(result.installments[1].dueDateFormatted).toBe("2026-07-15");
      expect(result.installments[2].dueDateFormatted).toBe("2026-08-14");
    });

    it("should correctly handle leap years (e.g. Feb 29 in 2028)", () => {
      const template = {
        calculationType: InstallmentCalculationType.PERCENTAGE,
        installmentCount: 3,
        items: [
          { sequence: 1, label: "T1", percentage: 50, intervalDaysAfterPrevious: 0 },
          { sequence: 2, label: "T2", percentage: 25, intervalDaysAfterPrevious: 14 },
          { sequence: 3, label: "T3", percentage: 25, intervalDaysAfterPrevious: 1 },
        ],
      };

      // 2028 is a leap year:
      // Inst 1: 2028-02-15
      // Inst 2: +14 days = 2028-02-29 (leap day)
      // Inst 3: +1 day = 2028-03-01
      const result = service.calculateSchedule(10000, template, "2028-02-15");
      expect(result.installments[0].dueDateFormatted).toBe("2028-02-15");
      expect(result.installments[1].dueDateFormatted).toBe("2028-02-29");
      expect(result.installments[2].dueDateFormatted).toBe("2028-03-01");
    });

    it("should correctly handle month-end arithmetic (e.g. Jan 31 + 28 days = Feb 28 in non-leap year)", () => {
      const template = {
        calculationType: InstallmentCalculationType.PERCENTAGE,
        installmentCount: 3,
        items: [
          { sequence: 1, label: "T1", percentage: 50, dueDaysAfterAdmission: 0 },
          { sequence: 2, label: "T2", percentage: 25, dueDaysAfterAdmission: 28 },
          { sequence: 3, label: "T3", percentage: 25, dueDaysAfterAdmission: 31 },
        ],
      };

      // 2026 is non-leap:
      // Inst 1: 2026-01-31
      // Inst 2: +28 days = 2026-02-28
      // Inst 3: +31 days = 2026-03-31
      const result = service.calculateSchedule(10000, template, "2026-01-31");
      expect(result.installments[0].dueDateFormatted).toBe("2026-01-31");
      expect(result.installments[1].dueDateFormatted).toBe("2026-02-28");
      expect(result.installments[2].dueDateFormatted).toBe("2026-03-31");
    });

    it("should strictly reject non-YYYY-MM-DD date inputs and invalid calendar dates", () => {
      const template = {
        calculationType: InstallmentCalculationType.PERCENTAGE,
        installmentCount: 2,
        items: [
          { sequence: 1, label: "T1", percentage: 50, dueDaysAfterAdmission: 0 },
          { sequence: 2, label: "T2", percentage: 50, dueDaysAfterAdmission: 30 },
        ],
      };

      // Invalid calendar date: Feb 30 does not exist
      expect(() => service.calculateSchedule(10000, template, "2026-02-30")).toThrow(
        BadRequestException,
      );

      // Timestamp with time component rejected (strict date-only contract)
      expect(() => service.calculateSchedule(10000, template, "2026-06-15T18:30:00.000Z")).toThrow(
        BadRequestException,
      );

      // Malformed date strings
      expect(() => service.calculateSchedule(10000, template, "15-06-2026")).toThrow(
        BadRequestException,
      );
      expect(() => service.calculateSchedule(10000, template, "invalid-date")).toThrow(
        BadRequestException,
      );
    });

    it("should calculate sequential due dates using relative intervals without weekend shifting", () => {
      const template = {
        calculationType: InstallmentCalculationType.PERCENTAGE,
        installmentCount: 3,
        items: [
          { sequence: 1, label: "T1", percentage: 50, dueDaysAfterAdmission: 0 },
          { sequence: 2, label: "T2", percentage: 25, dueDaysAfterAdmission: 30 },
          { sequence: 3, label: "T3", percentage: 25, dueDaysAfterAdmission: 45 },
        ],
      };

      // Start: 2026-06-15 (Monday)
      // Inst 1: 2026-06-15 (Monday)
      // Inst 2: +30 days = 2026-07-15 (Wednesday)
      // Inst 3: +45 days from Inst 2 = 2026-08-29 (Saturday - preserved without shifting)
      const result = service.calculateSchedule(100000, template, "2026-06-15");
      expect(result.installments[0].dueDateFormatted).toBe("2026-06-15");
      expect(result.installments[1].dueDateFormatted).toBe("2026-07-15");
      expect(result.installments[2].dueDateFormatted).toBe("2026-08-29");

      // Verify Inst 3 is indeed Saturday (day 6) and preserved
      expect(result.installments[2].dueDate.getUTCDay()).toBe(6);
    });

    it("should support multiple installments sharing a due date when interval is zero", () => {
      const template = {
        calculationType: InstallmentCalculationType.PERCENTAGE,
        installmentCount: 2,
        items: [
          { sequence: 1, label: "Immediate Part A", percentage: 60, dueDaysAfterAdmission: 0 },
          { sequence: 2, label: "Immediate Part B", percentage: 40, dueDaysAfterAdmission: 0 },
        ],
      };

      const result = service.calculateSchedule(100000, template, "2026-07-01");
      expect(result.installments[0].dueDateFormatted).toBe("2026-07-01");
      expect(result.installments[1].dueDateFormatted).toBe("2026-07-01");
    });

    it("should avoid UTC drift for date-only values across month and year boundaries", () => {
      const template = {
        calculationType: InstallmentCalculationType.PERCENTAGE,
        installmentCount: 2,
        items: [
          { sequence: 1, label: "Dec", percentage: 50, dueDaysAfterAdmission: 0 },
          { sequence: 2, label: "Jan", percentage: 50, dueDaysAfterAdmission: 31 },
        ],
      };

      // 2026-12-15 + 31 days = 2027-01-15
      const result = service.calculateSchedule(50000, template, "2026-12-15");
      expect(result.installments[0].dueDateFormatted).toBe("2026-12-15");
      expect(result.installments[1].dueDateFormatted).toBe("2027-01-15");
    });
  });

  describe("Equal Split Mode", () => {
    it("should divide net amount equally and allocate remainder to final installment", () => {
      const template = {
        calculationType: InstallmentCalculationType.EQUAL_SPLIT,
        installmentCount: 3,
        items: [
          { sequence: 1, label: "Split 1", dueDaysAfterAdmission: 0 },
          { sequence: 2, label: "Split 2", dueDaysAfterAdmission: 30 },
          { sequence: 3, label: "Split 3", dueDaysAfterAdmission: 30 },
        ],
      };

      // ₹10,000 / 3 = 3333.3333...
      // Inst 1: 3333.33
      // Inst 2: 3333.33
      // Inst 3: 10000 - 6666.66 = 3333.34
      const result = service.calculateSchedule(10000, template, "2026-06-15");
      expect(result.installments[0].amount.toFixed(2)).toBe("3333.33");
      expect(result.installments[1].amount.toFixed(2)).toBe("3333.33");
      expect(result.installments[2].amount.toFixed(2)).toBe("3333.34");

      const sum = result.installments.reduce((acc, it) => acc.plus(it.amount), new Decimal(0));
      expect(sum.toFixed(2)).toBe("10000.00");
    });

    it("should divide uneven two-decimal values (e.g. ₹100.01 across 3 installments)", () => {
      const template = {
        calculationType: InstallmentCalculationType.EQUAL_SPLIT,
        installmentCount: 3,
        items: [
          { sequence: 1, label: "Part 1", dueDaysAfterAdmission: 0 },
          { sequence: 2, label: "Part 2", dueDaysAfterAdmission: 30 },
          { sequence: 3, label: "Part 3", dueDaysAfterAdmission: 30 },
        ],
      };

      // ₹100.01 / 3 = 33.3366... -> ROUND_HALF_UP = 33.34
      // Inst 1: 33.34
      // Inst 2: 33.34
      // Inst 3: 100.01 - 66.68 = 33.33
      const result = service.calculateSchedule(100.01, template, "2026-06-15");
      expect(result.installments[0].amount.toFixed(2)).toBe("33.34");
      expect(result.installments[1].amount.toFixed(2)).toBe("33.34");
      expect(result.installments[2].amount.toFixed(2)).toBe("33.33");

      const sum = result.installments.reduce((acc, it) => acc.plus(it.amount), new Decimal(0));
      expect(sum.toFixed(2)).toBe("100.01");
    });

    it("should handle tiny amounts (e.g. ₹0.04 across 3 installments)", () => {
      const template = {
        calculationType: InstallmentCalculationType.EQUAL_SPLIT,
        installmentCount: 3,
        items: [
          { sequence: 1, label: "Part 1", dueDaysAfterAdmission: 0 },
          { sequence: 2, label: "Part 2", dueDaysAfterAdmission: 30 },
          { sequence: 3, label: "Part 3", dueDaysAfterAdmission: 30 },
        ],
      };

      // 0.04 / 3 = 0.0133... -> 0.01
      // Inst 1: 0.01
      // Inst 2: 0.01
      // Inst 3: 0.04 - 0.02 = 0.02
      const result = service.calculateSchedule(0.04, template, "2026-06-15");
      expect(result.installments[0].amount.toFixed(2)).toBe("0.01");
      expect(result.installments[1].amount.toFixed(2)).toBe("0.01");
      expect(result.installments[2].amount.toFixed(2)).toBe("0.02");

      const sum = result.installments.reduce((acc, it) => acc.plus(it.amount), new Decimal(0));
      expect(sum.toFixed(2)).toBe("0.04");
    });

    it("should reject equal split when net amount is too small to give every installment at least 1 paisa", () => {
      const template = {
        calculationType: InstallmentCalculationType.EQUAL_SPLIT,
        installmentCount: 3,
        items: [
          { sequence: 1, label: "Part 1", dueDaysAfterAdmission: 0 },
          { sequence: 2, label: "Part 2", dueDaysAfterAdmission: 30 },
          { sequence: 3, label: "Part 3", dueDaysAfterAdmission: 30 },
        ],
      };

      // ₹0.02 / 3 = 0.0066... -> 0.01
      // Inst 1: 0.01
      // Inst 2: 0.01
      // Remainder for Inst 3: 0.02 - 0.02 = 0.00 (non-positive!)
      expect(() => service.calculateSchedule(0.02, template, "2026-06-15")).toThrow(
        BadRequestException,
      );
    });
  });
});
