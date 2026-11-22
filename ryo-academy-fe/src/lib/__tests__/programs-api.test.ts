import { beforeEach, describe, expect, it, vi } from "vitest";
import { programsApi } from "@/lib/programs-api";

const apiCalls = vi.hoisted(() => ({ post: vi.fn(), patch: vi.fn() }));
vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return {
    ...actual,
    apiClient: { ...actual.apiClient, post: apiCalls.post, patch: apiCalls.patch },
  };
});
vi.mock("@/lib/session", () => ({
  session: { getAccessToken: () => "test-token" },
}));

import {
  programErrorMessage,
  toProgramViewModel,
  toWeekdayCodes,
  toWeekdayNames,
  type ProgramResponse,
  type WeekdayCode,
} from "@/lib/programs-api";
import { ApiError } from "@/lib/api-client";

const ALL_CODES: WeekdayCode[] = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
];

beforeEach(() => vi.clearAllMocks());

describe("toWeekdayCodes", () => {
  it("maps selected Sunday and Monday values to backend enum values", () => {
    expect(toWeekdayCodes("SUNDAY")).toEqual(["SUNDAY"]);
    expect(toWeekdayCodes("MONDAY")).toEqual(["MONDAY"]);
  });

  it("maps multiple selected days and omits unselected days", () => {
    expect(toWeekdayCodes("SUNDAY, MONDAY, FRIDAY")).toEqual([
      "SUNDAY",
      "MONDAY",
      "FRIDAY",
    ]);
  });

  it("tolerates surrounding and duplicated whitespace", () => {
    expect(toWeekdayCodes("  Monday ,   Saturday  ")).toEqual([
      "MONDAY",
      "SATURDAY",
    ]);
  });

  it("drops empty segments", () => {
    expect(toWeekdayCodes("Monday,,  ,Friday")).toEqual([
      "MONDAY",
      "FRIDAY",
    ]);
  });

  it("drops unknown names instead of producing invalid codes", () => {
    expect(toWeekdayCodes("Monday, Funday, Tuesday")).toEqual([
      "MONDAY",
      "TUESDAY",
    ]);
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
  it("maps backend enum values to their display names", () => {
    expect(toWeekdayNames(["MONDAY", "SUNDAY"])).toEqual([
      "Monday",
      "Sunday",
    ]);
  });

  it("drops unknown codes", () => {
    expect(toWeekdayNames(["MONDAY", "FUNDAY" as WeekdayCode])).toEqual([
      "Monday",
    ]);
  });

  it("preserves the order of the input", () => {
    expect(toWeekdayNames(["SUNDAY", "MONDAY"])).toEqual([
      "Sunday",
      "Monday",
    ]);
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
    daysOfWeek: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"],
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

describe("program weekday API payloads", () => {
  const daysOfWeek = toWeekdayCodes("SUNDAY, MONDAY, FRIDAY");

  it("posts the unchanged create fields with backend weekday enums", async () => {
    const payload = {
      name: "Primary Day Care",
      academicYear: "ay-uuid-1",
      isPrimary: true,
      daysOfWeek,
      startTime: "08:00",
      endTime: "15:00",
    };

    await programsApi.create(payload);

    expect(apiCalls.post).toHaveBeenCalledWith("/programs", payload, {
      token: "test-token",
    });
    expect(apiCalls.post.mock.calls[0][1].daysOfWeek).toEqual([
      "SUNDAY",
      "MONDAY",
      "FRIDAY",
    ]);
  });

  it("patches supported update fields with the same backend weekday enums", async () => {
    const payload = {
      name: "Updated Day Care",
      isPrimary: false,
      daysOfWeek,
      startTime: "08:30",
      endTime: "15:30",
    };

    await programsApi.update("program-1", payload);

    expect(apiCalls.patch).toHaveBeenCalledWith(
      "/programs/program-1",
      payload,
      { token: "test-token" },
    );
    expect(apiCalls.patch.mock.calls[0][1].daysOfWeek).toEqual([
      "SUNDAY",
      "MONDAY",
      "FRIDAY",
    ]);
  });

  it("preserves the backend empty-array rejection contract", () => {
    expect(toWeekdayCodes("")).toEqual([]);
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
