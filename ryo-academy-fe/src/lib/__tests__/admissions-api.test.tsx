import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  ADMISSION_STATUS_RANK,
  admissionsApi,
  admissionsQueryKey,
  applicableFeeConfigurationErrorMessage,
  compareAdmissions,
  confirmationErrorMessage,
  parseDateTimestamp,
  useAdmissionWorkflow,
  type AdmissionPayload,
  type AdmissionResponse,
  type AdmissionUpdatePayload,
  type ApplicableFeeConfiguration,
} from "@/lib/admissions-api";
import { apiClient, ApiError } from "@/lib/api-client";

const wrapper = (client: QueryClient) => ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

describe("admissionsApi lifecycle and workflow contract", () => {
  it("does not expose unsupported deletion adapter on admissionsApi", () => {
    expect((admissionsApi as any).delete).toBeUndefined();
  });

  it("routes cancellation through POST /admission/:id/cancelled", async () => {
    const post = vi.spyOn(apiClient, "post").mockResolvedValue({ id: "admission-1", admissionStatus: "CANCELLED" });
    const res = await admissionsApi.cancel("admission-1");
    expect(post).toHaveBeenCalledWith("/admission/admission-1/cancelled", undefined, undefined);
    expect(res).toEqual({ id: "admission-1", admissionStatus: "CANCELLED" });
  });

  it("useAdmissionWorkflow executes cancel and invalidates queries", async () => {
    vi.spyOn(admissionsApi, "cancel").mockResolvedValue({ id: "admission-1", admissionStatus: "CANCELLED" } as any);
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useAdmissionWorkflow(), { wrapper: wrapper(client) });

    await result.current.mutateAsync({ id: "admission-1", action: "cancel" });

    expect(admissionsApi.cancel).toHaveBeenCalledWith("admission-1");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: admissionsQueryKey });
  });
});

describe("confirmationErrorMessage", () => {
  it("maps CONFIRMATION_PAYMENT_REQUIRED to actionable guidance", () => {
    const error = new ApiError(409, {
      code: "CONFIRMATION_PAYMENT_REQUIRED",
      message: "Admission cannot be confirmed without at least one non-reversed persisted payment.",
    });
    expect(confirmationErrorMessage(error)).toBe(
      "Confirmation is blocked. Record at least one non-reversed payment greater than zero before confirming this admission.",
    );
  });

  it("preserves known domain error codes", () => {
    expect(
      confirmationErrorMessage(new ApiError(409, { code: "NO_INCLUDED_FEE_DETAILS" })),
    ).toBe("Confirmation blocked: include at least one fee component.");

    expect(
      confirmationErrorMessage(new ApiError(409, { code: "DISCOUNT_REVIEW_REQUIRED" })),
    ).toBe("Confirmation blocked: review the concession and reapply it or acknowledge no concession.");

    expect(
      confirmationErrorMessage(new ApiError(409, { code: "FINANCIAL_SNAPSHOT_INCONSISTENT" })),
    ).toBe("Confirmation blocked: the fee snapshot is inconsistent and requires investigation.");
  });

  it("maps standard HTTP status codes via fallback", () => {
    expect(confirmationErrorMessage(new ApiError(401, {}))).toBe("Your session has expired. Please sign in again.");
    expect(confirmationErrorMessage(new ApiError(403, {}))).toBe("You do not have permission to manage admissions.");
    expect(confirmationErrorMessage(new ApiError(404, {}))).toBe("Admission not found.");
    expect(confirmationErrorMessage(new ApiError(409, { message: "Academic year is closed." }))).toBe("Academic year is closed.");
  });

  it("falls back to default fallback for unknown non-ApiError", () => {
    expect(confirmationErrorMessage(new Error("Network failed"))).toBe("Could not confirm admission.");
    expect(confirmationErrorMessage("unexpected", "Custom fallback")).toBe("Custom fallback");
  });
});

describe("applicable fee configuration contract", () => {
  it("returns the backend-shaped preview without reshaping it", async () => {
    const response = {
      feeStructure: {
        id: "master-1", name: "Standard Fees", totalAmount: "1500.00",
        academicYearId: "year-1", programId: "program-1", classId: "class-1",
        description: "Annual fees",
      },
      components: [{
        id: "source-tuition", name: "Tuition", originalAmount: "1200.00",
        isDiscountApplicable: true, isMandatory: true, description: null,
        initiallySelected: true, locked: true,
      }],
    } satisfies ApplicableFeeConfiguration;
    const get = vi.spyOn(apiClient, "get").mockResolvedValue(response);

    await expect(admissionsApi.getApplicableFeeConfiguration({
      academicYearId: "year-1", programId: "program-1", classId: "class-1",
    })).resolves.toBe(response);
    expect(get).toHaveBeenCalledWith(
      "/admission/fee-configuration/applicable?academicYearId=year-1&programId=program-1&classId=class-1",
      undefined,
    );
  });

  it("posts admission creation with selected source component IDs", async () => {
    const payload: AdmissionPayload = {
      schoolId: "school-1", academicYearId: "year-1", programId: "program-1", classId: "class-1", sectionId: "section-1",
      studentName: "Asha Student", gender: "FEMALE", dateOfBirth: "2015-04-03", parentName: "Parent",
      parentRelation: "MOTHER", parentPhone: "9876543210", parentAlternatePhone: "", parentEmail: "parent@example.test",
      addressLine1: "1 School Road", addressLine2: "", city: "Chennai", state: "Tamil Nadu", country: "India",
      postalCode: "600001", createdById: "user-1", selectedFeeComponentIds: ["source-component-1"],
    };
    const post = vi.spyOn(apiClient, "post").mockResolvedValue({ id: "admission-1" });

    await admissionsApi.create(payload);

    expect(post).toHaveBeenCalledWith("/admission", payload, undefined);
  });

  it("patches admission metadata without fee selection fields", async () => {
    const payload: AdmissionUpdatePayload = {
      admissionId: "admission-1", programId: "program-1", classId: "class-1", sectionId: "section-1",
      studentName: "Asha Updated", gender: "FEMALE", dateOfBirth: "2015-04-03", parentName: "Parent",
      parentRelation: "MOTHER", parentPhone: "9876543210", parentAlternatePhone: "", parentEmail: "parent@example.test",
      addressLine1: "1 School Road", addressLine2: "", city: "Chennai", state: "Tamil Nadu", country: "India", postalCode: "600001",
    };
    const patch = vi.spyOn(apiClient, "patch").mockResolvedValue({ id: "admission-1" });

    await admissionsApi.update("admission-1", payload);

    expect(patch).toHaveBeenCalledWith("/admission/admission-1", payload, undefined);
    expect(payload).not.toHaveProperty("selectedFeeComponentIds");
  });

  it("preserves backend details for missing and ambiguous previews", () => {
    expect(applicableFeeConfigurationErrorMessage(new ApiError(404, {
      message: "The matching fee structure has no active fee components.",
    }))).toBe("The matching fee structure has no active fee components.");
    expect(applicableFeeConfigurationErrorMessage(new ApiError(409, {
      message: "More than one active fee structure matches the selected academic year, program, and class.",
    }))).toBe("More than one active fee structure matches the selected academic year, program, and class.");
    expect(applicableFeeConfigurationErrorMessage(new Error("offline")))
      .toBe("Could not load the applicable fee configuration.");
  });
});

describe("compareAdmissions status and chronological sorting", () => {
  const makeAdmission = (overrides: Partial<AdmissionResponse> = {}): AdmissionResponse => ({
    id: "adm-default",
    admissionNumber: "ADM-001",
    admissionSequence: 1,
    admissionStatus: "CONFIRMED",
    schoolId: "school-1",
    academicYearId: "year-1",
    programId: "prog-1",
    classId: "class-1",
    sectionId: "sec-1",
    studentName: "Test Student",
    gender: "FEMALE",
    dateOfBirth: "2015-01-01",
    createdById: "user-1",
    ...overrides,
  });

  describe("ADMISSION_STATUS_RANK and parseDateTimestamp", () => {
    it("assigns expected status priority ranks", () => {
      expect(ADMISSION_STATUS_RANK.CONFIRMED).toBe(1);
      expect(ADMISSION_STATUS_RANK.DRAFT).toBe(2);
      expect(ADMISSION_STATUS_RANK.CANCELLED).toBe(3);
    });

    it("parses valid ISO date strings to numeric timestamps", () => {
      const iso = "2026-11-18T10:30:00.000Z";
      expect(parseDateTimestamp(iso)).toBe(new Date(iso).getTime());
    });

    it("returns null for missing, empty, or unparseable date values without throwing", () => {
      expect(parseDateTimestamp(undefined)).toBeNull();
      expect(parseDateTimestamp(null)).toBeNull();
      expect(parseDateTimestamp("")).toBeNull();
      expect(parseDateTimestamp("invalid-timestamp")).toBeNull();
    });
  });

  describe("Status Priority (CONFIRMED -> DRAFT -> CANCELLED)", () => {
    it("sorts CONFIRMED before DRAFT and DRAFT before CANCELLED", () => {
      const confirmed = makeAdmission({ id: "adm-1", admissionStatus: "CONFIRMED" });
      const draft = makeAdmission({ id: "adm-2", admissionStatus: "DRAFT" });
      const cancelled = makeAdmission({ id: "adm-3", admissionStatus: "CANCELLED" });

      expect(compareAdmissions(confirmed, draft)).toBeLessThan(0);
      expect(compareAdmissions(draft, cancelled)).toBeLessThan(0);
      expect(compareAdmissions(confirmed, cancelled)).toBeLessThan(0);

      const list = [cancelled, draft, confirmed];
      const sorted = [...list].sort(compareAdmissions);
      expect(sorted.map((item) => item.admissionStatus)).toEqual(["CONFIRMED", "DRAFT", "CANCELLED"]);
    });

    it("sorts unknown status after known statuses", () => {
      const confirmed = makeAdmission({ id: "adm-1", admissionStatus: "CONFIRMED" });
      const draft = makeAdmission({ id: "adm-2", admissionStatus: "DRAFT" });
      const cancelled = makeAdmission({ id: "adm-3", admissionStatus: "CANCELLED" });
      const unknown = makeAdmission({ id: "adm-4", admissionStatus: "UNKNOWN" as any });

      const sorted = [unknown, cancelled, draft, confirmed].sort(compareAdmissions);
      expect(sorted.map((item) => item.id)).toEqual(["adm-1", "adm-2", "adm-3", "adm-4"]);
    });
  });

  describe("Within-Status Chronological Ordering (Newest First)", () => {
    it("orders admissions with valid timestamps newest first within the same status", () => {
      const older = makeAdmission({ id: "adm-old", admissionStatus: "DRAFT", createdAt: "2026-11-10T10:00:00.000Z" });
      const newer = makeAdmission({ id: "adm-new", admissionStatus: "DRAFT", createdAt: "2026-11-18T10:00:00.000Z" });

      expect(compareAdmissions(older, newer)).toBeGreaterThan(0);
      expect(compareAdmissions(newer, older)).toBeLessThan(0);

      const sorted = [older, newer].sort(compareAdmissions);
      expect(sorted.map((item) => item.id)).toEqual(["adm-new", "adm-old"]);
    });

    it("orders a mixed multi-status matrix correctly", () => {
      const confOld = makeAdmission({ id: "c-old", admissionStatus: "CONFIRMED", createdAt: "2026-11-10T00:00:00.000Z" });
      const confNew = makeAdmission({ id: "c-new", admissionStatus: "CONFIRMED", createdAt: "2026-11-18T00:00:00.000Z" });
      const draftOld = makeAdmission({ id: "d-old", admissionStatus: "DRAFT", createdAt: "2026-11-12T00:00:00.000Z" });
      const draftNew = makeAdmission({ id: "d-new", admissionStatus: "DRAFT", createdAt: "2026-11-16T00:00:00.000Z" });
      const canOld = makeAdmission({ id: "x-old", admissionStatus: "CANCELLED", createdAt: "2026-11-08T00:00:00.000Z" });
      const canNew = makeAdmission({ id: "x-new", admissionStatus: "CANCELLED", createdAt: "2026-11-14T00:00:00.000Z" });

      const list = [draftOld, canOld, confOld, canNew, draftNew, confNew];
      const sorted = [...list].sort(compareAdmissions);

      expect(sorted.map((item) => item.id)).toEqual(["c-new", "c-old", "d-new", "d-old", "x-new", "x-old"]);
    });
  });

  describe("Invalid and Missing Timestamp Handling", () => {
    it("places valid timestamps before missing or invalid timestamps within the same status", () => {
      const valid = makeAdmission({ id: "adm-valid", admissionStatus: "CONFIRMED", createdAt: "2026-11-15T00:00:00.000Z" });
      const missing = makeAdmission({ id: "adm-missing", admissionStatus: "CONFIRMED", createdAt: undefined });
      const invalid = makeAdmission({ id: "adm-invalid", admissionStatus: "CONFIRMED", createdAt: "malformed-date" });

      expect(compareAdmissions(valid, missing)).toBeLessThan(0);
      expect(compareAdmissions(missing, valid)).toBeGreaterThan(0);
      expect(compareAdmissions(valid, invalid)).toBeLessThan(0);
      expect(compareAdmissions(invalid, valid)).toBeGreaterThan(0);

      const sorted = [invalid, missing, valid].sort(compareAdmissions);
      expect(sorted[0].id).toBe("adm-valid");
      expect(sorted.slice(1).map((i) => i.id)).toEqual(["adm-invalid", "adm-missing"]);
    });

    it("ensures status priority strictly dominates over date validity", () => {
      // Confirmed with missing date must still precede Draft with valid date
      const confMissing = makeAdmission({ id: "c-missing", admissionStatus: "CONFIRMED", createdAt: undefined });
      const draftValid = makeAdmission({ id: "d-valid", admissionStatus: "DRAFT", createdAt: "2026-11-18T12:00:00.000Z" });

      expect(compareAdmissions(confMissing, draftValid)).toBeLessThan(0);

      const sorted = [draftValid, confMissing].sort(compareAdmissions);
      expect(sorted.map((item) => item.id)).toEqual(["c-missing", "d-valid"]);
    });
  });

  describe("Deterministic Engineering Tie-Breaker", () => {
    it("breaks ties with identical valid timestamps deterministically using id ascending", () => {
      const date = "2026-11-18T10:00:00.000Z";
      const admA = makeAdmission({ id: "adm-alpha", admissionStatus: "CONFIRMED", createdAt: date });
      const admB = makeAdmission({ id: "adm-beta", admissionStatus: "CONFIRMED", createdAt: date });

      expect(compareAdmissions(admA, admB)).toBeLessThan(0);
      expect(compareAdmissions(admB, admA)).toBeGreaterThan(0);

      const sorted = [admB, admA].sort(compareAdmissions);
      expect(sorted.map((item) => item.id)).toEqual(["adm-alpha", "adm-beta"]);
    });

    it("breaks ties with both invalid timestamps deterministically using id ascending", () => {
      const admA = makeAdmission({ id: "adm-01", admissionStatus: "DRAFT", createdAt: undefined });
      const admB = makeAdmission({ id: "adm-02", admissionStatus: "DRAFT", createdAt: "not-a-date" });

      expect(compareAdmissions(admA, admB)).toBeLessThan(0);
      expect(compareAdmissions(admB, admA)).toBeGreaterThan(0);

      const sorted = [admB, admA].sort(compareAdmissions);
      expect(sorted.map((item) => item.id)).toEqual(["adm-01", "adm-02"]);
    });
  });
});
