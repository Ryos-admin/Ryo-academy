import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";

const calls = vi.hoisted(() => ({ post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() }));
vi.mock("@/lib/api-client", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api-client")>()), apiClient: calls }));
vi.mock("@/lib/session", () => ({ session: { getAccessToken: () => "test-token" } }));

import { feeComponentsQueryKey, feeStructuresQueryKey, feesApi, feeErrorMessage, useDeactivateFeeComponent, useDeactivateFeeStructure, useUpdateFeeStructure } from "@/lib/fees-api";
import { ApiError } from "@/lib/api-client";

describe("fee component API money contract", () => {
  beforeEach(() => vi.clearAllMocks());

  it("posts nested fee components without a client total", async () => {
    const payload = {
      name: "Standard Fees",
      description: "Annual school fees",
      academicYearId: "year-1",
      programId: "program-1",
      classId: "class-1",
      feeComponents: [{ name: "Tuition", amount: "1250.50", isMandatory: true, discountApplicable: false }],
    };
    await feesApi.createStructure(payload);
    expect(calls.post).toHaveBeenCalledWith("/fee-structure-master", payload, expect.anything());
    expect(calls.post.mock.calls[0][1]).not.toHaveProperty("totalAmount");
    expect(typeof calls.post.mock.calls[0][1].feeComponents[0].amount).toBe("string");
  });

  it("posts a decimal-string component amount", async () => {
    await feesApi.createComponent({
      name: "Tuition",
      description: "Annual tuition",
      amount: "10.00",
      feeStructureId: "master-1",
      discountApplicable: true,
      isMandatory: true,
    });
    expect(calls.post).toHaveBeenCalledWith("/fee-structure-child", expect.objectContaining({ amount: "10.00" }), expect.anything());
    expect(typeof calls.post.mock.calls[0][1].amount).toBe("string");
  });

  it("preserves the backend conflict detail for fee-creation errors", () => {
    expect(feeErrorMessage(new ApiError(409, { message: "A fee structure already exists for this scope." }), "Try again."))
      .toBe("A fee structure already exists for this scope.");
  });

  it("updates master metadata and invalidates master and component caches", async () => {
    const saved = {
      id: "master-1", name: "Updated", description: "Updated description", totalAmount: "10.00", isActive: true,
      academicYearId: "year-1", programId: "program-1", classId: "class-1", feeComponents: [],
    };
    calls.patch.mockResolvedValueOnce(saved);
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
    const { result } = renderHook(() => useUpdateFeeStructure(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ id: "master-1", payload: { name: "Updated", description: "Updated description" } });
    });

    expect(calls.patch).toHaveBeenCalledWith("/fee-structure-master/master-1", { name: "Updated", description: "Updated description" }, expect.anything());
    expect(client.getQueryData([...feeStructuresQueryKey, "master-1"])).toEqual(saved);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: feeStructuresQueryKey });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: feeComponentsQueryKey });
  });

  it("puts a decimal-string amount when updating a component", async () => {
    await feesApi.updateComponent("component-1", { amount: "10.25" });
    expect(calls.put).toHaveBeenCalledWith("/fee-structure-child/component-1", { amount: "10.25" }, expect.anything());
    expect(typeof calls.put.mock.calls[0][1].amount).toBe("string");
  });

  it("deactivates a master and removes its detail cache while refreshing fee lists", async () => {
    calls.delete.mockResolvedValueOnce({ id: "master-1", isActive: false });
    const client = new QueryClient();
    const remove = vi.spyOn(client, "removeQueries");
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
    const { result } = renderHook(() => useDeactivateFeeStructure(), { wrapper });

    await act(async () => { await result.current.mutateAsync("master-1"); });

    expect(calls.delete).toHaveBeenCalledWith("/fee-structure-master/master-1", expect.anything());
    expect(remove).toHaveBeenCalledWith({ queryKey: [...feeStructuresQueryKey, "master-1"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: feeStructuresQueryKey });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: feeComponentsQueryKey });
  });

  it("deactivates a component and removes its detail cache while refreshing fee lists", async () => {
    calls.delete.mockResolvedValueOnce({ id: "component-1", isActive: false });
    const client = new QueryClient();
    const remove = vi.spyOn(client, "removeQueries");
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
    const { result } = renderHook(() => useDeactivateFeeComponent(), { wrapper });

    await act(async () => { await result.current.mutateAsync("component-1"); });

    expect(calls.delete).toHaveBeenCalledWith("/fee-structure-child/component-1", expect.anything());
    expect(remove).toHaveBeenCalledWith({ queryKey: [...feeComponentsQueryKey, "component-1"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: feeComponentsQueryKey });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: feeStructuresQueryKey });
  });
});
