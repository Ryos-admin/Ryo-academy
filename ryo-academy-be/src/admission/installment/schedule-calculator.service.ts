import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "../../../generated/prisma/client.js";
import { InstallmentCalculationType } from "../../../generated/prisma/enums.js";
import "../../common/money/decimal-precision.js";

const Decimal = Prisma.Decimal;

export interface InstallmentCalculationInputItem {
  sequence: number;
  label: string;
  percentage?: number | Prisma.Decimal | null;
  fixedAmount?: number | Prisma.Decimal | null;
  /** Relative interval in days after the previous installment. For sequence 1, defaults to 0. */
  intervalDaysAfterPrevious?: number;
  /** Backward-compatible alias for intervalDaysAfterPrevious */
  dueDaysAfterAdmission?: number;
}

export interface InstallmentCalculationInputTemplate {
  calculationType: InstallmentCalculationType;
  installmentCount: number;
  items: InstallmentCalculationInputItem[];
}

export interface CalculatedInstallmentScheduleItem {
  sequence: number;
  subSequence: number;
  label: string;
  amount: Prisma.Decimal;
  dueDate: Date;
  /** Strict date-only serialization (YYYY-MM-DD) */
  dueDateFormatted: string;
}

export interface CalculatedInstallmentSchedule {
  netAmount: Prisma.Decimal;
  calculationType: InstallmentCalculationType;
  installmentCount: number;
  installments: CalculatedInstallmentScheduleItem[];
}

@Injectable()
export class ScheduleCalculatorService {
  /**
   * Deterministically calculates installment amounts and due dates from an admission net obligation
   * and an ordered template definition.
   */
  calculateSchedule(
    netPayableAmount: number | string | Prisma.Decimal,
    template: InstallmentCalculationInputTemplate,
    firstDueDateInput: string | Date,
    allowFinalAbsorption = false,
  ): CalculatedInstallmentSchedule {
    const netAmount = new Decimal(netPayableAmount);

    if (netAmount.lessThanOrEqualTo(0)) {
      throw new BadRequestException("Admission net payable amount must be strictly positive.");
    }

    if (!template.items || template.items.length === 0) {
      throw new BadRequestException("Template must contain at least one installment item.");
    }

    // Sort items by sequence ascending
    const sortedItems = [...template.items].sort((a, b) => a.sequence - b.sequence);

    // Validate sequential integrity (1, 2, 3... N)
    for (let i = 0; i < sortedItems.length; i++) {
      if (sortedItems[i].sequence !== i + 1) {
        throw new BadRequestException(
          `Installment items must have contiguous sequences starting from 1. Found sequence ${sortedItems[i].sequence} at index ${i}.`,
        );
      }
      const intervalDays =
        sortedItems[i].intervalDaysAfterPrevious ?? sortedItems[i].dueDaysAfterAdmission ?? 0;
      if (intervalDays < 0) {
        throw new BadRequestException(
          `Installment item sequence ${sortedItems[i].sequence} has negative interval (${intervalDays}).`,
        );
      }
    }

    const n = sortedItems.length;
    const baseFirstDueDate = this.parseDateUtc(firstDueDateInput);

    let calculatedAmounts: Prisma.Decimal[] = [];

    switch (template.calculationType) {
      case InstallmentCalculationType.PERCENTAGE:
        calculatedAmounts = this.calculatePercentageAmounts(netAmount, sortedItems);
        break;

      case InstallmentCalculationType.CUSTOM_AMOUNT:
        calculatedAmounts = this.calculateFixedAmounts(netAmount, sortedItems, allowFinalAbsorption);
        break;

      case InstallmentCalculationType.EQUAL_SPLIT:
        calculatedAmounts = this.calculateEqualSplitAmounts(netAmount, sortedItems);
        break;

      default:
        throw new BadRequestException(`Unsupported calculation type: ${template.calculationType}`);
    }

    // Calculate due dates sequentially using the approved business formula:
    // dueDate[0] = firstDueDate
    // dueDate[i] = dueDate[i - 1] + intervalDaysAfterPrevious[i] (for i >= 1)
    const dueDates: Date[] = [];
    let currentDueDate = new Date(baseFirstDueDate.getTime());

    for (let i = 0; i < n; i++) {
      if (i === 0) {
        dueDates.push(new Date(currentDueDate.getTime()));
      } else {
        const intervalDays =
          sortedItems[i].intervalDaysAfterPrevious ?? sortedItems[i].dueDaysAfterAdmission ?? 0;
        currentDueDate = this.addDaysUtc(currentDueDate, intervalDays);
        dueDates.push(new Date(currentDueDate.getTime()));
      }
    }

    const installments: CalculatedInstallmentScheduleItem[] = sortedItems.map((item, idx) => ({
      sequence: item.sequence,
      subSequence: 0,
      label: item.label.trim(),
      amount: calculatedAmounts[idx],
      dueDate: dueDates[idx],
      dueDateFormatted: dueDates[idx].toISOString().slice(0, 10),
    }));

    // Invariant verification: sum of installments MUST exactly equal netAmount
    const totalCalculated = installments.reduce((acc, cur) => acc.plus(cur.amount), new Decimal(0));
    if (!totalCalculated.equals(netAmount)) {
      throw new BadRequestException(
        `Internal calculation error: Calculated sum (₹${totalCalculated.toFixed(2)}) does not match net obligation (₹${netAmount.toFixed(2)}).`,
      );
    }

    return {
      netAmount,
      calculationType: template.calculationType,
      installmentCount: installments.length,
      installments,
    };
  }

  /**
   * Percentage calculation:
   * - Total percentages must equal exactly 100.00%.
   * - Intermediate installments use ROUND_HALF_UP.
   * - Final installment absorbs the rounding difference.
   */
  private calculatePercentageAmounts(
    netAmount: Prisma.Decimal,
    items: InstallmentCalculationInputItem[],
  ): Prisma.Decimal[] {
    const n = items.length;
    let percentSum = new Decimal(0);

    for (const item of items) {
      if (!item.percentage) {
        throw new BadRequestException(
          `Installment item sequence ${item.sequence} is missing percentage for PERCENTAGE calculation type.`,
        );
      }
      const pct = new Decimal(item.percentage);
      if (pct.lessThanOrEqualTo(0)) {
        throw new BadRequestException(
          `Installment item sequence ${item.sequence} has non-positive percentage (${pct}%).`,
        );
      }
      percentSum = percentSum.plus(pct);
    }

    if (!percentSum.equals(100)) {
      throw new BadRequestException(
        `Total percentage across installment items must equal exactly 100.00%. Current sum: ${percentSum.toFixed(2)}%.`,
      );
    }

    const amounts: Prisma.Decimal[] = [];
    let allocatedSum = new Decimal(0);

    for (let i = 0; i < n - 1; i++) {
      const pct = new Decimal(items[i].percentage!);
      const raw = netAmount.times(pct).dividedBy(100);
      const rounded = raw.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      amounts.push(rounded);
      allocatedSum = allocatedSum.plus(rounded);
    }

    // Final installment absorbs the exact remainder
    const finalAmount = netAmount.minus(allocatedSum);
    if (finalAmount.lessThanOrEqualTo(0)) {
      throw new BadRequestException(
        `Calculated final installment is zero or negative (₹${finalAmount.toFixed(2)}). Net amount ₹${netAmount.toFixed(2)} is too small for this template.`,
      );
    }
    amounts.push(finalAmount);

    return amounts;
  }

  /**
   * Fixed amount calculation:
   * - If sum matches netAmount, exact values are preserved.
   * - If sum differs and allowFinalAbsorption is true, final installment absorbs difference.
   * - If sum differs and allowFinalAbsorption is false, rejected.
   */
  private calculateFixedAmounts(
    netAmount: Prisma.Decimal,
    items: InstallmentCalculationInputItem[],
    allowFinalAbsorption: boolean,
  ): Prisma.Decimal[] {
    const n = items.length;
    let fixedSum = new Decimal(0);

    for (const item of items) {
      if (!item.fixedAmount) {
        throw new BadRequestException(
          `Installment item sequence ${item.sequence} is missing fixedAmount for CUSTOM_AMOUNT calculation type.`,
        );
      }
      const amt = new Decimal(item.fixedAmount);
      if (amt.lessThanOrEqualTo(0)) {
        throw new BadRequestException(
          `Installment item sequence ${item.sequence} has non-positive fixedAmount (₹${amt.toFixed(2)}).`,
        );
      }
      fixedSum = fixedSum.plus(amt);
    }

    if (fixedSum.equals(netAmount)) {
      return items.map((it) => new Decimal(it.fixedAmount!));
    }

    if (!allowFinalAbsorption) {
      throw new BadRequestException(
        `Sum of fixed installment amounts (₹${fixedSum.toFixed(2)}) does not match admission net obligation (₹${netAmount.toFixed(2)}). Final installment difference absorption is disabled.`,
      );
    }

    // Absorption enabled: intermediate items take configured amounts; final absorbs difference
    const amounts: Prisma.Decimal[] = [];
    let intermediateSum = new Decimal(0);

    for (let i = 0; i < n - 1; i++) {
      const amt = new Decimal(items[i].fixedAmount!);
      amounts.push(amt);
      intermediateSum = intermediateSum.plus(amt);
    }

    const finalAmount = netAmount.minus(intermediateSum);
    if (finalAmount.lessThanOrEqualTo(0)) {
      throw new BadRequestException(
        `Final installment after difference absorption is zero or negative (₹${finalAmount.toFixed(2)}). Prior installments (₹${intermediateSum.toFixed(2)}) exceed or equal net obligation (₹${netAmount.toFixed(2)}).`,
      );
    }
    amounts.push(finalAmount);

    return amounts;
  }

  /**
   * Equal split calculation:
   * - Divides net obligation equally into N parts.
   * - Intermediate installments rounded HALF_UP.
   * - Final installment absorbs the rounding remainder.
   */
  private calculateEqualSplitAmounts(
    netAmount: Prisma.Decimal,
    items: InstallmentCalculationInputItem[],
  ): Prisma.Decimal[] {
    const n = items.length;
    const countDec = new Decimal(n);
    const amounts: Prisma.Decimal[] = [];
    let allocatedSum = new Decimal(0);

    for (let i = 0; i < n - 1; i++) {
      const raw = netAmount.dividedBy(countDec);
      const rounded = raw.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      amounts.push(rounded);
      allocatedSum = allocatedSum.plus(rounded);
    }

    const finalAmount = netAmount.minus(allocatedSum);
    if (finalAmount.lessThanOrEqualTo(0)) {
      throw new BadRequestException(
        `Calculated final installment for equal split is zero or negative (₹${finalAmount.toFixed(2)}).`,
      );
    }
    amounts.push(finalAmount);

    return amounts;
  }

  /**
   * Parses strict YYYY-MM-DD or Date object into UTC midnight representation.
   * Strictly enforces date-only semantics and prevents timezone/DST drift.
   */
  public parseDateUtc(dateInput: string | Date): Date {
    if (typeof dateInput === "string") {
      const trimmed = dateInput.trim();
      const match = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.exec(trimmed);
      if (!match) {
        throw new BadRequestException(
          `Invalid date string: "${dateInput}". Expected strict date-only format YYYY-MM-DD.`,
        );
      }
      const y = parseInt(match[1], 10);
      const m = parseInt(match[2], 10);
      const d = parseInt(match[3], 10);
      const dt = new Date(Date.UTC(y, m - 1, d));
      // Validate that calendar date is real (e.g., February 30 is rejected)
      if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
        throw new BadRequestException(`Invalid calendar date: "${dateInput}".`);
      }
      return dt;
    }

    if (dateInput instanceof Date) {
      if (isNaN(dateInput.getTime())) {
        throw new BadRequestException("Invalid Date object provided.");
      }
      return new Date(Date.UTC(dateInput.getUTCFullYear(), dateInput.getUTCMonth(), dateInput.getUTCDate()));
    }

    throw new BadRequestException("Invalid date input. Expected strict YYYY-MM-DD string or Date object.");
  }

  /**
   * Adds specified days using UTC arithmetic, preserving holiday and weekend dates without automatic shifting.
   */
  private addDaysUtc(baseDate: Date, days: number): Date {
    const res = new Date(baseDate.getTime());
    res.setUTCDate(res.getUTCDate() + days);
    return res;
  }
}
