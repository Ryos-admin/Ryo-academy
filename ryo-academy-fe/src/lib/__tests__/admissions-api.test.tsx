import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { admissionsApi, admissionsQueryKey, applicableFeeConfigurationErrorMessage, useDeleteAdmission, type AdmissionPayload, type AdmissionUpdatePayload, type ApplicableFeeConfiguration } from "@/lib/admissions-api";
import { apiClient, ApiError } from "@/lib/api-client";

const wrapper = (client: QueryClient) => ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

describe("useDeleteAdmission", () => {
  it("calls delete and invalidates admissions and students", async () => {
    vi.spyOn(admissionsApi, "delete").mockResolvedValue({} as never);
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const remove = vi.spyOn(client, "removeQueries");
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useDeleteAdmission(), { wrapper: wrapper(client) });

    await result.current.mutateAsync({ id: "admission-1" });

    expect(admissionsApi.delete).toHaveBeenCalledWith("admission-1");
    expect(remove).toHaveBeenCalledWith({ queryKey: [...admissionsQueryKey, "admission-1"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: admissionsQueryKey });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["students"] });
  });

  it("does not invalidate on mutation failure", async () => {
    vi.spyOn(admissionsApi, "delete").mockRejectedValue(new Error("failed"));
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useDeleteAdmission(), { wrapper: wrapper(client) });

    await expect(result.current.mutateAsync({ id: "admission-1" })).rejects.toThrow("failed");
    expect(invalidate).not.toHaveBeenCalled();
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
