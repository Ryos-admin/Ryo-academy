import { describe, expect, it } from "vitest";
import { initialFeeSelection, parsePayableMinor, toggleFeeSelection, validatePayableAmount } from "@/pages/admissions-students-pages";

describe("payable concession validation", () => {
  it.each(["0", "0.00", "10.0", "10.00", "100.25"])("accepts valid decimal %s", (value) => {
    expect(validatePayableAmount(value, "100.25")).not.toBeNull();
  });
  it.each(["-1", "1.234", "abc", "", ".5", "."])("rejects malformed or over-precision %s", (value) => {
    expect(validatePayableAmount(value, "100.25")).toBeNull();
  });
  it("rejects a value above the original amount", () => {
    expect(validatePayableAmount("100.26", "100.25")).toBeNull();
  });
  it("uses exact minor units for comparison and subtraction", () => {
    expect(parsePayableMinor("10.00")).toBe(1000n);
    expect(parsePayableMinor("10.0")).toBe(1000n);
    expect(parsePayableMinor("100.25")! - parsePayableMinor("0.25")!).toBe(10000n);
  });
});

describe("admission fee selection", () => {
  it("selects all preview components initially and keeps mandatory components selected", () => {
    expect(initialFeeSelection([
      { id: "mandatory", initiallySelected: true, isMandatory: true },
      { id: "optional", initiallySelected: true, isMandatory: false },
      { id: "not-selected", initiallySelected: false, isMandatory: false },
    ])).toEqual(["mandatory", "optional"]);
    expect(toggleFeeSelection(["mandatory", "optional"], "mandatory", true, false)).toEqual(["mandatory", "optional"]);
  });
  it("allows optional components to be deselected and reselected by source ID", () => {
    expect(toggleFeeSelection(["source-1", "source-2"], "source-2", false, false)).toEqual(["source-1"]);
    expect(toggleFeeSelection(["source-1"], "source-2", false, true)).toEqual(["source-1", "source-2"]);
  });
});
