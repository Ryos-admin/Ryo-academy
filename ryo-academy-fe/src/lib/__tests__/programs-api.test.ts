import { describe, expect, it } from "vitest";
import {
  programErrorMessage,
  toProgramViewModel,
  toWeekdayCodes,
  toWeekdayNames,
  type ProgramResponse,
  type WeekdayCode,
} from "@/lib/programs-api";
import { ApiError } from "@/lib/api-client";

const ALL_CODES: WeekdayCode[] = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

describe("toWeekdayCodes", () => {
  it("converts full weekday names to codes", () => {
    expect(toWeekdayCodes("Monday, Tuesday, Wednesday, Thursday, Friday")).toEqual([
      "MON",
      "TUE",
      "WED",
      "THU",
      "FRI",
    ]);
  });

  it("tolerates surrounding and duplicated whitespace", () => {
    expect(toWeekdayCodes("  Monday ,   Saturday  ")).toEqual(["MON", "SAT"]);
  });

  it("drops empty segments", () => {
    expect(toWeekdayCodes("Monday,,  ,Friday")).toEqual(["MON", "FRI"]);
  });

  it("drops unknown names instead of producing invalid codes", () => {
    expect(toWeekdayCodes("Monday, Funday, Tuesday")).toEqual(["MON", "TUE"]);
  });

  it("returns an empty array for an empty or whitespace string", () => {
    expect(toWeekdayCodes("")).toEqual([]);
    expect(toWeekdayCodes("   ")).toEqual([]);
  });

  it("converts all seven days", () => {
    const names = toWeekdayNames(ALL_CODES);
    expect(toWeekdayCodes(names.join(", "))).toEqual(ALL_CODES);
  });
});

describe("toWeekdayNames", () => {
  it("maps codes to their display names", () => {
    expect(toWeekdayNames(["MON", "SUN"])).toEqual(["Monday", "Sunday"]);
  });

  it("drops unknown codes", () => {
    expect(toWeekdayNames(["MON", "FUNDAY" as WeekdayCode])).toEqual(["Monday"]);
  });

  it("preserves the order of the input", () => {
    expect(toWeekdayNames(["SUN", "MON"])).toEqual(["Sunday", "Monday"]);
  });

  it("returns an empty array for no input", () => {
    expect(toWeekdayNames([])).toEqual([]);
  });

  it("round-trips every code through names and back", () => {
    for (const code of ALL_CODES) {
      expect(toWeekdayCodes(toWeekdayNames([code]).join(","))).toEqual([code]);
    }
  });
});

describe("toProgramViewModel", () => {
  const base: ProgramResponse = {
    id: "prg-1",
    name: "Regular Day Programme",
    academicYearId: "ay-1",
    isPrimary: true,
    daysOfWeek: ["MON", "TUE", "WED", "THU", "FRI"],
    startTime: "09:00",
    endTime: "16:00",
  };

  it("maps the response to the view model and converts days to names", () => {
    const view = toProgramViewModel(base, "2025-26");
    expect(view).toEqual({
      id: "prg-1",
      name: "Regular Day Programme",
      academicYearId: "ay-1",
      academicYear: "2025-26",
      primary: true,
      daysOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      startTime: "09:00",
      endTime: "16:00",
    });
  });

  it("renames isPrimary to primary", () => {
    expect(toProgramViewModel({ ...base, isPrimary: false }).primary).toBe(false);
  });

  it("falls back to an em dash when the academic year name is missing", () => {
    expect(toProgramViewModel(base).academicYear).toBe("—");
  });
});

describe("programErrorMessage", () => {
  const fallback = "Fallback message.";

  it("returns the fallback for a non-API error", () => {
    expect(programErrorMessage(new Error("boom"), fallback)).toBe(fallback);
  });

  it("maps 401 to an expired-session message", () => {
    expect(programErrorMessage(new ApiError(401, { message: "x" }), fallback)).toBe(
      "Your session has expired. Please sign in again.",
    );
  });

  it("maps 403 to a permission message", () => {
    expect(programErrorMessage(new ApiError(403, { message: "x" }), fallback)).toBe(
      "You do not have permission to manage academic programs.",
    );
  });

  it("maps 404 to a not-found message", () => {
    expect(programErrorMessage(new ApiError(404, { message: "x" }), fallback)).toBe(
      "Academic program not found.",
    );
  });

  it("maps 409 to a duplicate-name message", () => {
    expect(programErrorMessage(new ApiError(409, { message: "x" }), fallback)).toBe(
      "An academic program with this name already exists for the selected academic year.",
    );
  });

  it("joins an array of backend messages", () => {
    const error = new ApiError(400, { message: ["first", "second"] });
    expect(programErrorMessage(error, fallback)).toBe("first second");
  });

  it("passes through a plain backend message", () => {
    expect(
      programErrorMessage(new ApiError(400, { message: "Bad input" }), fallback),
    ).toBe("Bad input");
  });
});
