import { describe, expect, it } from "vitest";
import { date, titleCase } from "@/pages/page-primitives";
import { dateOnly } from "@/lib/academic-years-api";

describe("date", () => {
  it("formats a date-only value", () => {
    expect(date("2028-05-31")).toBe("31 May 2028");
  });

  it("formats a full ISO datetime from a Prisma DateTime column", () => {
    // This is the shape the API actually returns; it used to produce an
    // Invalid Date and threw a RangeError during render.
    expect(date("2028-05-31T00:00:00.000Z")).toBe("31 May 2028");
  });

  it("does not shift the day for a non-UTC offset datetime", () => {
    expect(date("2028-05-31T23:30:00.000Z")).toBe("31 May 2028");
  });

  it("returns an em dash for missing values", () => {
    expect(date(undefined)).toBe("—");
    expect(date(null)).toBe("—");
    expect(date("")).toBe("—");
  });

  it("returns an em dash for unparseable values instead of throwing", () => {
    expect(() => date("not-a-date")).not.toThrow();
    expect(date("not-a-date")).toBe("—");
    expect(date("2028-13-45")).toBe("—");
  });

  it("never throws for any string input", () => {
    for (const value of ["2028-05-31T00:00:00.000Z", "2028-05-31", "zzz", "0", "-1"]) {
      expect(() => date(value)).not.toThrow();
    }
  });
});

describe("dateOnly", () => {
  it("trims an ISO datetime to its calendar date", () => {
    expect(dateOnly("2028-05-31T00:00:00.000Z")).toBe("2028-05-31");
  });

  it("passes a date-only value through", () => {
    expect(dateOnly("2028-05-31")).toBe("2028-05-31");
  });

  it("returns an empty string for missing values instead of throwing", () => {
    expect(dateOnly(undefined)).toBe("");
    expect(dateOnly(null)).toBe("");
    expect(() => dateOnly(null)).not.toThrow();
  });
});

describe("titleCase", () => {
  it("splits and capitalises camelCase keys", () => {
    expect(titleCase("studentNumber")).toBe("Student Number");
  });
});
