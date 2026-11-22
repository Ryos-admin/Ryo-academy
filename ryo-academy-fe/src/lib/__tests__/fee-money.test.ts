import { describe, expect, it } from "vitest";
import {
  buildFeeComponentPayload,
  formatFeeMinorUnits,
  formatFeeMoney,
  isPositiveFeeMoney,
  parseFeeMoneyMinorUnits,
  sumFeeMoneyMinorUnits,
} from "@/lib/fee-money";

describe("fee money strings", () => {
  it.each([
    ["0", 0n],
    ["0.00", 0n],
    ["10", 1000n],
    ["10.1", 1010n],
    ["10.01", 1001n],
    ["10.00", 1000n],
    ["9007199254740993.01", 900719925474099301n],
  ])("parses %s exactly", (value, expected) => {
    expect(parseFeeMoneyMinorUnits(value)).toBe(expected);
  });

  it.each(["", " ", "-1", "1.234", "1e2", "abc", ".5", "1."])("rejects invalid input %s", (value) => {
    expect(parseFeeMoneyMinorUnits(value)).toBeNull();
  });

  it("sums in minor units with exact carry", () => {
    expect(sumFeeMoneyMinorUnits(["0.10", "0.20", "1.99"])).toBe(229n);
    expect(formatFeeMinorUnits(sumFeeMoneyMinorUnits(["0.10", "0.20", "1.99"])!)).toBe("₹2.29");
    expect(sumFeeMoneyMinorUnits(["1.00", "invalid"])).toBeNull();
  });

  it("distinguishes valid zero from a submittable component amount", () => {
    expect(parseFeeMoneyMinorUnits("0.00")).toBe(0n);
    expect(isPositiveFeeMoney("0.00")).toBe(false);
    expect(isPositiveFeeMoney("0.01")).toBe(true);
  });

  it("formats Indian grouping and preserves all historical fractional digits", () => {
    expect(formatFeeMoney("1234567.4")).toBe("₹12,34,567.40");
    expect(formatFeeMoney("1234567.12340000")).toBe("₹12,34,567.12340000");
    expect(formatFeeMoney("not-a-decimal")).toBe("—");
  });

  it("preserves a valid amount string in the request payload and refuses invalid input", () => {
    const fields = {
      name: "Tuition",
      description: "Annual tuition",
      feeStructureId: "master-1",
      discountApplicable: true,
      isMandatory: true,
    };
    expect(buildFeeComponentPayload({ ...fields, amount: "10.00" })?.amount).toBe("10.00");
    expect(buildFeeComponentPayload({ ...fields, amount: "0" })).toBeNull();
    expect(buildFeeComponentPayload({ ...fields, amount: "1.234" })).toBeNull();
  });
});
