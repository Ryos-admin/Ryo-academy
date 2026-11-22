import { describe, expect, it, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";

const calls = vi.hoisted(() => ({ post: vi.fn(), patch: vi.fn(), delete: vi.fn(), get: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiClient: calls }));
vi.mock("@/lib/session", () => ({ session: { getAccessToken: () => "token" } }));

import {
  admissionConcessionsQueryKey,
  admissionFeeConfigurationQueryKey,
  concessionsApi,
  useAssignAdmissionConcession,
  useRemoveAdmissionConcession,
  useUpdateAdmissionConcession,
  useUpdateAdmissionFeeConfiguration,
} from "@/lib/concessions-api";

describe("payable concession API contract", () => {
  beforeEach(() => vi.clearAllMocks());

  it("posts only the payable concession fields", async () => {
    await concessionsApi.assignAdmissionConcession("adm-1", { feePaymentDetailsId: "detail-1", payableAmount: "0.00" });
    expect(calls.post).toHaveBeenCalledWith("/admission/adm-1/concessions", { feePaymentDetailsId: "detail-1", payableAmount: "0.00" }, expect.anything());
  });

  it("patches only the payable amount", async () => {
    await concessionsApi.updateAdmissionConcession("adm-1", "con-1", { payableAmount: "100.00" });
    expect(calls.patch).toHaveBeenCalledWith("/admission/adm-1/concessions/con-1", { payableAmount: "100.00" }, expect.anything());
  });

  it("uses the fee configuration and concession paths", async () => {
    await concessionsApi.getFeeConfiguration("adm-1");
    await concessionsApi.updateFeeConfiguration("adm-1", ["detail-1"]);
    await concessionsApi.getAdmissionConcessions("adm-1");
    await concessionsApi.removeAdmissionConcession("adm-1", "con-1");
    expect(calls.get).toHaveBeenCalledWith("/admission/adm-1/fee-configuration", expect.anything());
    expect(calls.patch).toHaveBeenCalledWith("/admission/adm-1/fee-configuration", { selectedFeeComponentIds: ["detail-1"] }, expect.anything());
    expect(calls.get).toHaveBeenCalledWith("/admission/adm-1/concessions", expect.anything());
    expect(calls.delete).toHaveBeenCalledWith("/admission/adm-1/concessions/con-1", expect.anything());
  });
  it("uses all preview criteria in the applicable-fee request", async () => {
    const { admissionsApi } = await import("@/lib/admissions-api");
    await admissionsApi.getApplicableFeeConfiguration({ academicYearId: "year 1", programId: "program-1", classId: "class-1" });
    expect(calls.get).toHaveBeenCalledWith("/admission/fee-configuration/applicable?academicYearId=year%201&programId=program-1&classId=class-1", expect.anything());
  });

  it("refreshes fee configuration and concessions after fee selection succeeds", async () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);
    const wrapper = ({ children }: { children: React.ReactNode }) => createElement(QueryClientProvider, { client: queryClient }, children);
    const { result } = renderHook(() => useUpdateAdmissionFeeConfiguration("adm-1"), { wrapper });
    await result.current.mutateAsync(["snapshot-1"]);
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: admissionFeeConfigurationQueryKey("adm-1") });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: admissionConcessionsQueryKey("adm-1") });
    });
    queryClient.clear();
  });

  it("refreshes fee configuration and concessions after concession POST and PATCH", async () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);
    const wrapper = ({ children }: { children: React.ReactNode }) => createElement(QueryClientProvider, { client: queryClient }, children);
    const createHook = renderHook(() => useAssignAdmissionConcession("adm-1"), { wrapper });
    await createHook.result.current.mutateAsync({ feePaymentDetailsId: "snapshot-1", payableAmount: "0.00" });
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: admissionFeeConfigurationQueryKey("adm-1") }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: admissionConcessionsQueryKey("adm-1") });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["admissions"] });
    invalidate.mockClear();

    const updateHook = renderHook(() => useUpdateAdmissionConcession("adm-1"), { wrapper });
    await updateHook.result.current.mutateAsync({ concessionId: "con-1", payload: { payableAmount: "50.00" } });
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: admissionFeeConfigurationQueryKey("adm-1") }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: admissionConcessionsQueryKey("adm-1") });
    queryClient.clear();
  });

  it("refreshes fee configuration and concessions after concession DELETE", async () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);
    const wrapper = ({ children }: { children: React.ReactNode }) => createElement(QueryClientProvider, { client: queryClient }, children);
    const { result } = renderHook(() => useRemoveAdmissionConcession("adm-1"), { wrapper });
    await result.current.mutateAsync("con-1");
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: admissionFeeConfigurationQueryKey("adm-1") });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: admissionConcessionsQueryKey("adm-1") });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ["admissions"] });
    });
    queryClient.clear();
  });
});
