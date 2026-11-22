import type { FeeComponentCreateRequest } from "./fees-api";

const INPUT_MONEY_PATTERN = /^\d+(?:\.\d{1,2})?$/;
const DISPLAY_MONEY_PATTERN = /^(-?)(\d+)(?:\.(\d+))?$/;

export function parseFeeMoneyMinorUnits(value: string): bigint | null {
  if (!INPUT_MONEY_PATTERN.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2));
}

export function isPositiveFeeMoney(value: string): boolean {
  const minorUnits = parseFeeMoneyMinorUnits(value);
  return minorUnits !== null && minorUnits > 0n;
}

export function sumFeeMoneyMinorUnits(values: readonly string[]): bigint | null {
  let total = 0n;
  for (const value of values) {
    const minorUnits = parseFeeMoneyMinorUnits(value);
    if (minorUnits === null) return null;
    total += minorUnits;
  }
  return total;
}

export function formatFeeMinorUnits(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  const whole = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(absolute / 100n);
  const fraction = String(absolute % 100n).padStart(2, "0");
  return `₹${sign}${whole}.${fraction}`;
}

export function formatFeeMoney(value: string): string {
  const match = DISPLAY_MONEY_PATTERN.exec(value);
  if (!match) return "—";
  const [, sign, whole, fraction = ""] = match;
  const groupedWhole = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(BigInt(`${sign}${whole}`));
  return `₹${groupedWhole}.${fraction.length < 2 ? fraction.padEnd(2, "0") : fraction}`;
}

export type FeeComponentFormValues = Omit<FeeComponentCreateRequest, "amount"> & { amount: string };

export function buildFeeComponentPayload(values: FeeComponentFormValues): FeeComponentCreateRequest | null {
  if (!isPositiveFeeMoney(values.amount)) return null;
  return { ...values, amount: values.amount };
}
