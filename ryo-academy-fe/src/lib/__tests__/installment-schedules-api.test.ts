import { describe, expect, it, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";

const mockCalls = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("@/lib/api-client", () => ({
  apiClient: mockCalls,
  ApiError: class ApiError extends Error {
    readonly status: number;
    readonly backendMessage: string | string[];
    readonly body?: unknown;
    constructor(status: number, body?: unknown) {
      const msg = (body as any)?.message ?? `Request failed with status ${status}`;
      super(Array.isArray(msg) ? msg.join(", ") : msg);
      this.name = "ApiError";
      this.status = status;
      this.backendMessage = msg;
      this.body = body;
    }
  },
}));

vi.mock("@/lib/session", () => ({
  session: { getAccessToken: () => "test-token" },
}));

import {
  installmentSchedulesApi,
  installmentScheduleErrorMessage,
  useInstallmentSchedule,
  useInstallmentScheduleLineage,
  usePreviewInstallmentSchedule,
  useCreateTemplateSchedule,
  useCreateManualSchedule,
  useUpdateDraftSchedule,
  installmentSchedulesQueryKey,
} from "@/lib/installment-schedules-api";
import {
  installmentTemplatesApi,
  useInstallmentTemplates,
  installmentTemplatesQueryKey,
} from "@/lib/installment-templates-api";
import { admissionsQueryKey } from "@/lib/admissions-api";
import { ApiError } from "@/lib/api-client";

describe("Installment Schedules API Client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Route Construction and Query Encoding", () => {
    it("constructs GET /admissions/:id/installment-schedule without header query", async () => {
      mockCalls.get.mockResolvedValueOnce({ admissionId: "adm-1", schedule: null });
      await installmentSchedulesApi.getSchedule("adm-1");
      expect(mockCalls.get).toHaveBeenCalledWith(
        "/admissions/adm-1/installment-schedule",
        { token: "test-token" },
      );
    });

    it("encodes special characters and verified feePaymentHeaderId query", async () => {
      mockCalls.get.mockResolvedValueOnce({ admissionId: "adm 1", schedule: null });
      await installmentSchedulesApi.getSchedule("adm 1", "hdr 99");
      expect(mockCalls.get).toHaveBeenCalledWith(
        "/admissions/adm%201/installment-schedule?feePaymentHeaderId=hdr%2099",
        { token: "test-token" },
      );
    });

    it("constructs GET /admissions/:id/installment-schedule/lineage with optional query", async () => {
      mockCalls.get.mockResolvedValueOnce({ admissionId: "adm-1", lineageEvents: [] });
      await installmentSchedulesApi.getLineage("adm-1", "hdr-1");
      expect(mockCalls.get).toHaveBeenCalledWith(
        "/admissions/adm-1/installment-schedule/lineage?feePaymentHeaderId=hdr-1",
        { token: "test-token" },
      );
    });

    it("posts preview payload with ISO calendar firstDueDate and allowFinalAbsorption", async () => {
      mockCalls.post.mockResolvedValueOnce({ netAmount: "1000.00", installments: [] });
      const payload = {
        templateId: "tpl-1",
        firstDueDate: "2026-06-15",
        allowFinalAbsorption: true,
        feePaymentHeaderId: "hdr-1",
      };
      await installmentSchedulesApi.preview("adm-1", payload);
      expect(mockCalls.post).toHaveBeenCalledWith(
        "/admissions/adm-1/installment-schedule/preview",
        payload,
        { token: "test-token" },
      );
    });

    it("posts createFromTemplate payload to /admissions/:id/installment-schedule/template", async () => {
      mockCalls.post.mockResolvedValueOnce({ id: "sch-1", scheduleType: "TEMPLATE" });
      const payload = {
        templateId: "tpl-1",
        firstDueDate: "2026-07-01",
        allowFinalAbsorption: false,
      };
      await installmentSchedulesApi.createFromTemplate("adm-1", payload);
      expect(mockCalls.post).toHaveBeenCalledWith(
        "/admissions/adm-1/installment-schedule/template",
        payload,
        { token: "test-token" },
      );
    });

    it("posts createManual payload with justification and custom installments", async () => {
      mockCalls.post.mockResolvedValueOnce({ id: "sch-2", scheduleType: "CUSTOM" });
      const payload = {
        justification: "Special management approval for split terms",
        installments: [
          { sequence: 1, label: "Term 1", amount: "500.00", dueDate: "2026-06-15" },
          { sequence: 2, label: "Term 2", amount: "500.00", dueDate: "2026-10-15" },
        ],
        feePaymentHeaderId: "hdr-1",
      };
      await installmentSchedulesApi.createManual("adm-1", payload);
      expect(mockCalls.post).toHaveBeenCalledWith(
        "/admissions/adm-1/installment-schedule/manual",
        payload,
        { token: "test-token" },
      );
    });

    it("puts updateDraft payload to /admissions/:id/installment-schedule", async () => {
      mockCalls.put.mockResolvedValueOnce({ id: "sch-1", status: "DRAFT" });
      const payload = {
        reason: "Parent requested delayed term 2 date",
        installments: [
          { sequence: 1, label: "Term 1", amount: "600.00", dueDate: "2026-06-15" },
          { sequence: 2, label: "Term 2", amount: "400.00", dueDate: "2026-11-15" },
        ],
      };
      await installmentSchedulesApi.updateDraft("adm-1", payload);
      expect(mockCalls.put).toHaveBeenCalledWith(
        "/admissions/adm-1/installment-schedule",
        payload,
        { token: "test-token" },
      );
    });
  });

  describe("Installment Templates API", () => {
    it("calls GET /installment-templates without query by default", async () => {
      mockCalls.get.mockResolvedValueOnce([]);
      await installmentTemplatesApi.list();
      expect(mockCalls.get).toHaveBeenCalledWith(
        "/installment-templates",
        { token: "test-token" },
      );
    });

    it("appends ?includeInactive=true when requested", async () => {
      mockCalls.get.mockResolvedValueOnce([]);
      await installmentTemplatesApi.list(true);
      expect(mockCalls.get).toHaveBeenCalledWith(
        "/installment-templates?includeInactive=true",
        { token: "test-token" },
      );
    });
  });

  describe("Query and Mutation Hooks", () => {
    it("fetches schedule and lineage via useInstallmentSchedule and useInstallmentScheduleLineage", async () => {
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      mockCalls.get.mockResolvedValueOnce({ admissionId: "adm-1", schedule: { id: "sch-1" } });

      const wrapper = ({ children }: { children: React.ReactNode }) =>
        createElement(QueryClientProvider, { client: queryClient }, children);

      const { result } = renderHook(
        () => useInstallmentSchedule("adm-1", "hdr-1"),
        { wrapper },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.admissionId).toBe("adm-1");
      expect(mockCalls.get).toHaveBeenCalledWith(
        "/admissions/adm-1/installment-schedule?feePaymentHeaderId=hdr-1",
        expect.anything(),
      );

      queryClient.clear();
    });

    it("fetches templates via useInstallmentTemplates", async () => {
      const queryClient = new QueryClient();
      mockCalls.get.mockResolvedValueOnce([{ id: "tpl-1", name: "Standard 3-Term" }]);

      const wrapper = ({ children }: { children: React.ReactNode }) =>
        createElement(QueryClientProvider, { client: queryClient }, children);

      const { result } = renderHook(() => useInstallmentTemplates(false), { wrapper });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toHaveLength(1);
      queryClient.clear();
    });

    it("invalidates schedule and admission queries upon createFromTemplate success", async () => {
      const queryClient = new QueryClient();
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);
      mockCalls.post.mockResolvedValueOnce({ id: "sch-1", status: "DRAFT" });

      const wrapper = ({ children }: { children: React.ReactNode }) =>
        createElement(QueryClientProvider, { client: queryClient }, children);

      const { result } = renderHook(() => useCreateTemplateSchedule("adm-1"), { wrapper });
      await result.current.mutateAsync({
        templateId: "tpl-1",
        firstDueDate: "2026-06-15",
      });

      await waitFor(() => {
        expect(invalidateSpy).toHaveBeenCalledWith({
          queryKey: [...installmentSchedulesQueryKey, "adm-1"],
        });
        expect(invalidateSpy).toHaveBeenCalledWith({
          queryKey: [...admissionsQueryKey, "adm-1"],
        });
        expect(invalidateSpy).toHaveBeenCalledWith({
          queryKey: admissionsQueryKey,
        });
      });
      queryClient.clear();
    });

    it("invalidates schedule and admission queries upon createManual success", async () => {
      const queryClient = new QueryClient();
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);
      mockCalls.post.mockResolvedValueOnce({ id: "sch-manual", status: "DRAFT" });

      const wrapper = ({ children }: { children: React.ReactNode }) =>
        createElement(QueryClientProvider, { client: queryClient }, children);

      const { result } = renderHook(() => useCreateManualSchedule("adm-1"), { wrapper });
      await result.current.mutateAsync({
        justification: "Hardship consideration",
        installments: [{ sequence: 1, label: "Full", amount: "1000.00", dueDate: "2026-06-15" }],
      });

      await waitFor(() => {
        expect(invalidateSpy).toHaveBeenCalledWith({
          queryKey: [...installmentSchedulesQueryKey, "adm-1"],
        });
        expect(invalidateSpy).toHaveBeenCalledWith({
          queryKey: [...admissionsQueryKey, "adm-1"],
        });
        expect(invalidateSpy).toHaveBeenCalledWith({
          queryKey: admissionsQueryKey,
        });
      });
      queryClient.clear();
    });

    it("invalidates schedule and admission queries upon updateDraft success", async () => {
      const queryClient = new QueryClient();
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);
      mockCalls.put.mockResolvedValueOnce({ id: "sch-1", status: "DRAFT" });

      const wrapper = ({ children }: { children: React.ReactNode }) =>
        createElement(QueryClientProvider, { client: queryClient }, children);

      const { result } = renderHook(() => useUpdateDraftSchedule("adm-1"), { wrapper });
      await result.current.mutateAsync({
        installments: [{ sequence: 1, label: "Term 1", amount: "1000.00", dueDate: "2026-06-15" }],
      });

      await waitFor(() => {
        expect(invalidateSpy).toHaveBeenCalledWith({
          queryKey: [...installmentSchedulesQueryKey, "adm-1"],
        });
        expect(invalidateSpy).toHaveBeenCalledWith({
          queryKey: [...admissionsQueryKey, "adm-1"],
        });
        expect(invalidateSpy).toHaveBeenCalledWith({
          queryKey: admissionsQueryKey,
        });
      });
      queryClient.clear();
    });
  });

  describe("Error Helper Formatting", () => {
    it("formats SCHEDULE_FROZEN_PAYMENT_EXISTS domain code", () => {
      const err = new ApiError(409, {
        code: "SCHEDULE_FROZEN_PAYMENT_EXISTS",
        message: "Installment schedule cannot be modified once fee payments have been recorded for this header.",
      });
      const message = installmentScheduleErrorMessage(err);
      expect(message).toBe(
        "Installment schedule is frozen because payment history exists for this fee header.",
      );
    });

    it("formats SCHEDULE_ALREADY_EXISTS domain code", () => {
      const err = new ApiError(409, {
        code: "SCHEDULE_ALREADY_EXISTS",
        message: "An installment schedule already exists for this fee header.",
      });
      const message = installmentScheduleErrorMessage(err);
      expect(message).toBe(
        "An installment schedule already exists for this fee header. Use update to modify an unpaid schedule.",
      );
    });

    it("formats standard HTTP statuses (401, 403, 404)", () => {
      expect(installmentScheduleErrorMessage(new ApiError(401, {}))).toBe(
        "Your session has expired. Please sign in again.",
      );
      expect(installmentScheduleErrorMessage(new ApiError(403, {}))).toBe(
        "You do not have permission to manage installment schedules.",
      );
      expect(installmentScheduleErrorMessage(new ApiError(404, {}))).toBe(
        "Installment schedule or admission was not found.",
      );
    });

    it("joins array backend validation error messages", () => {
      const err = new ApiError(400, {
        message: [
          "Installment sequences must be contiguous starting from 1.",
          "Total installment amount does not match net obligation.",
        ],
      });
      expect(installmentScheduleErrorMessage(err)).toBe(
        "Installment sequences must be contiguous starting from 1. Total installment amount does not match net obligation.",
      );
    });

    it("returns fallback for non-ApiError", () => {
      expect(installmentScheduleErrorMessage(new Error("Network drop"), "Custom fallback")).toBe(
        "Custom fallback",
      );
    });
  });
});
