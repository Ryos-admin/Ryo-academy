import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  admissionPaymentsApi,
  admissionPaymentErrorMessage,
  admissionPaymentReversalErrorMessage,
  admissionPaymentsQueryKey,
  formatMinorToMoney,
  parseMoneyMinor,
  useRecordAdmissionPayment,
  useReverseAdmissionPayment,
  type CreateAdmissionPaymentRequest,
  type ReverseAdmissionPaymentRequest,
} from "../admission-payments-api";
import { ApiError, apiClient } from "../api-client";
import { session } from "../session";
import { QueryClient } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";

vi.mock("../api-client", () => {
  class MockApiError extends Error {
    status: number;
    body: any;
    constructor(status: number, message: string, body?: any) {
      super(message);
      this.status = status;
      this.body = body ?? { message };
    }
  }

  return {
    ApiError: MockApiError,
    apiClient: {
      get: vi.fn(),
      post: vi.fn(),
    },
  };
});

describe("FE-M3: admission-payments-api unit tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(session, "getAccessToken").mockReturnValue("test-token");
  });

  describe("1. Money Minor Unit Parsing and Formatting", () => {
    it("parses valid decimal strings to minor bigint units", () => {
      expect(parseMoneyMinor("10.00")).toBe(1000n);
      expect(parseMoneyMinor("0.05")).toBe(5n);
      expect(parseMoneyMinor("100")).toBe(10000n);
      expect(parseMoneyMinor("10.5")).toBe(1050n);
      expect(parseMoneyMinor("0")).toBe(0n);
      expect(parseMoneyMinor("123456.78")).toBe(12345678n);
    });

    it("rejects invalid amounts and strings with > 2 fractional digits", () => {
      expect(parseMoneyMinor("abc")).toBeNull();
      expect(parseMoneyMinor("10.123")).toBeNull();
      expect(parseMoneyMinor("-50.00")).toBeNull();
      expect(parseMoneyMinor("")).toBeNull();
      expect(parseMoneyMinor(null)).toBeNull();
      expect(parseMoneyMinor(undefined)).toBeNull();
    });

    it("formats minor units back to 2-decimal money strings", () => {
      expect(formatMinorToMoney(1000n)).toBe("10.00");
      expect(formatMinorToMoney(5n)).toBe("0.05");
      expect(formatMinorToMoney(0n)).toBe("0.00");
      expect(formatMinorToMoney(12345678n)).toBe("123456.78");
    });
  });

  describe("2. Query Key Definition", () => {
    it("generates exact admission payment query keys", () => {
      expect(admissionPaymentsQueryKey("adm-123")).toEqual([
        "admissions",
        "adm-123",
        "payments",
      ]);
    });
  });

  describe("3. API Client Methods", () => {
    it("invokes POST /admissions/:id/payments with exact serialized payload", async () => {
      const payload: CreateAdmissionPaymentRequest = {
        idempotencyKey: "11111111-2222-3333-4444-555555555555",
        feePaymentHeaderId: "hdr-1",
        amount: "5000.00",
        paymentMethod: "CASH",
        paymentDate: "2026-11-10T00:00:00.000Z",
        allocations: [
          { feePaymentDetailsId: "det-1", amount: "3000.00" },
          { feePaymentDetailsId: "det-2", amount: "2000.00" },
        ],
      };

      const mockResponse = {
        statusCode: 201,
        isReplay: false,
        id: "pay-1",
        idempotencyKey: payload.idempotencyKey,
        amount: "5000.00",
      };

      vi.mocked(apiClient.post).mockResolvedValueOnce(mockResponse);

      const result = await admissionPaymentsApi.create("adm-1", payload);

      expect(apiClient.post).toHaveBeenCalledWith(
        "/admissions/adm-1/payments",
        payload,
        { token: "test-token" },
      );
      expect(result).toEqual(mockResponse);
    });

    it("invokes GET /admissions/:id/payments to retrieve history", async () => {
      const mockList = [
        { id: "pay-1", amount: "5000.00", isReversed: false },
      ];
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockList);

      const result = await admissionPaymentsApi.list("adm-1");

      expect(apiClient.get).toHaveBeenCalledWith(
        "/admissions/adm-1/payments",
        { token: "test-token" },
      );
      expect(result).toEqual(mockList);
    });

    it("invokes GET /admissions/:id/payments/:paymentId to retrieve single payment details", async () => {
      const mockItem = { id: "pay-1", amount: "5000.00" };
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockItem);

      const result = await admissionPaymentsApi.get("adm-1", "pay-1");

      expect(apiClient.get).toHaveBeenCalledWith(
        "/admissions/adm-1/payments/pay-1",
        { token: "test-token" },
      );
      expect(result).toEqual(mockItem);
    });
  });

  describe("4. Error Message Helper", () => {
    it("handles SCHEDULE_REQUIRED conflict response with specific guidance", () => {
      const err = new ApiError(409, "Conflict", { code: "SCHEDULE_REQUIRED" });
      expect(admissionPaymentErrorMessage(err, "Fallback")).toBe(
        "An installment schedule must be configured before collecting the first payment on this admission.",
      );
    });

    it("handles ADMISSION_FEE_DETAILS_OUTDATED conflict response with clear administrator guidance", () => {
      const err = new ApiError(409, "Conflict", { code: "ADMISSION_FEE_DETAILS_OUTDATED" });
      expect(admissionPaymentErrorMessage(err, "Fallback")).toBe(
        "The fee details for this admission no longer match the latest Fee Structure configuration. Payment collection is blocked until an administrator synchronizes this Fee Structure.",
      );
    });

    it("extracts custom conflict and bad request messages", () => {
      const conflictErr = new ApiError(409, "Custom conflict", {
        message: "The idempotency key was already used with a different payment amount",
      });
      expect(admissionPaymentErrorMessage(conflictErr, "Fallback")).toBe(
        "The idempotency key was already used with a different payment amount",
      );

      const badReqErr = new ApiError(400, "Bad Request", {
        message: "Total allocations must match payment amount",
      });
      expect(admissionPaymentErrorMessage(badReqErr, "Fallback")).toBe(
        "Total allocations must match payment amount",
      );
    });

    it("handles 401 and 403 standard RBAC statuses", () => {
      expect(admissionPaymentErrorMessage(new ApiError(401, "Unauthorized"), "Fallback")).toBe(
        "Your session has expired. Please sign in again.",
      );
      expect(admissionPaymentErrorMessage(new ApiError(403, "Forbidden"), "Fallback")).toBe(
        "You do not have permission to record fee payments.",
      );
    });

    it("falls back to standard message for non-API errors", () => {
      expect(admissionPaymentErrorMessage(new Error("Network failed"), "Fallback")).toBe(
        "Network failed",
      );
      expect(admissionPaymentErrorMessage("Unknown", "Fallback")).toBe("Fallback");
    });
  });

  describe("5. Cache Invalidation upon Mutation Success", () => {
    it("invalidates fee configuration, concessions, schedule, lineage, payment history, and student fee keys", async () => {
      const queryClient = new QueryClient();
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      vi.mocked(apiClient.post).mockResolvedValueOnce({
        statusCode: 201,
        isReplay: false,
        id: "pay-1",
      });

      const { result } = renderHook(
        () => useRecordAdmissionPayment("adm-1", { studentId: "std-1" }, queryClient),
      );

      await result.current.mutateAsync({
        idempotencyKey: "test-key",
        amount: "1000.00",
        paymentMethod: "CASH",
        paymentDate: "2026-11-10",
        allocations: [{ feePaymentDetailsId: "det-1", amount: "1000.00" }],
      });

      await waitFor(() => {
        expect(invalidateSpy).toHaveBeenCalledWith({
          queryKey: ["admissions", "adm-1", "fee-configuration"],
        });
        expect(invalidateSpy).toHaveBeenCalledWith({
          queryKey: ["admissions", "adm-1", "concessions"],
        });
        expect(invalidateSpy).toHaveBeenCalledWith({
          queryKey: ["installment-schedules", "adm-1"],
        });
        expect(invalidateSpy).toHaveBeenCalledWith({
          queryKey: ["installment-schedules", "adm-1", "lineage"],
        });
        expect(invalidateSpy).toHaveBeenCalledWith({
          queryKey: ["admissions", "adm-1", "payments"],
        });
        expect(invalidateSpy).toHaveBeenCalledWith({
          queryKey: ["student-fees", "std-1"],
        });
        expect(invalidateSpy).toHaveBeenCalledWith({
          queryKey: ["student-fees"],
        });
        expect(invalidateSpy).toHaveBeenCalledWith({
          queryKey: ["admissions"],
        });
        expect(invalidateSpy).toHaveBeenCalledWith({
          queryKey: ["students"],
        });
      });
    });
  });

  describe("6. FE-M4 Payment Reversal API Client", () => {
    it("invokes POST /admissions/:id/payments/:paymentId/reverse with exact payload", async () => {
      const payload: ReverseAdmissionPaymentRequest = {
        idempotencyKey: "rev-uuid-1234",
        reason: "Entered against wrong student admission record",
      };

      const mockResponse = {
        statusCode: 200,
        isReplay: false,
        reversal: {
          id: "rev-event-1",
          reversalAmount: "5000.00",
          reason: payload.reason,
          createdAt: "2026-11-10T12:00:00.000Z",
        },
        headerSnapshot: {
          totalFeeAmount: "50000.00",
          totalPaidAmount: "0.00",
          totalDueAmount: "50000.00",
        },
      };

      vi.mocked(apiClient.post).mockResolvedValueOnce(mockResponse);

      const result = await admissionPaymentsApi.reverse("adm-1", "pay-1", payload);

      expect(apiClient.post).toHaveBeenCalledWith(
        "/admissions/adm-1/payments/pay-1/reverse",
        payload,
        { token: "test-token" },
      );
      expect(result).toEqual(mockResponse);
    });

    it("formats reversal-specific error codes and statuses", () => {
      const histErr = new ApiError(409, "Conflict", {
        code: "PAYMENT_DETAIL_ATTRIBUTION_UNAVAILABLE",
      });
      expect(admissionPaymentReversalErrorMessage(histErr, "Fallback")).toBe(
        "Payment detail attribution is unavailable for this historical payment; exact reversal is impossible.",
      );

      const alreadyReversedErr = new ApiError(409, "Conflict", {
        message: "Payment has already been reversed.",
      });
      expect(
        admissionPaymentReversalErrorMessage(alreadyReversedErr, "Fallback"),
      ).toBe("Payment has already been reversed.");

      const concurrentErr = new ApiError(409, "Conflict", {
        message: "Concurrent reversal conflict on an uncommitted transaction. Please retry.",
      });
      expect(admissionPaymentReversalErrorMessage(concurrentErr, "Fallback")).toBe(
        "Concurrent reversal conflict on an uncommitted transaction. Please retry.",
      );

      const reasonReqErr = new ApiError(400, "Bad Request", {
        message: "Reversal reason is required.",
      });
      expect(admissionPaymentReversalErrorMessage(reasonReqErr, "Fallback")).toBe(
        "Reversal reason is required.",
      );

      const unauthErr = new ApiError(401, "Unauthorized");
      expect(admissionPaymentReversalErrorMessage(unauthErr, "Fallback")).toBe(
        "Your session has expired. Please sign in again.",
      );

      const forbiddenErr = new ApiError(403, "Forbidden");
      expect(admissionPaymentReversalErrorMessage(forbiddenErr, "Fallback")).toBe(
        "You do not have permission to reverse fee payments.",
      );

      const notFoundErr = new ApiError(404, "Not Found");
      expect(admissionPaymentReversalErrorMessage(notFoundErr, "Fallback")).toBe(
        "Admission or payment record not found.",
      );
    });

    it("useReverseAdmissionPayment invalidates all financial queries upon successful reversal", async () => {
      const queryClient = new QueryClient();
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      vi.mocked(apiClient.post).mockResolvedValueOnce({
        statusCode: 200,
        isReplay: false,
        reversal: {
          id: "rev-1",
          reversalAmount: "5000.00",
          reason: "Cash entry error",
          createdAt: "2026-11-10T00:00:00.000Z",
        },
      });

      const { result } = renderHook(
        () => useReverseAdmissionPayment("adm-1", { studentId: "std-1" }, queryClient),
      );

      await result.current.mutateAsync({
        paymentId: "pay-1",
        payload: {
          idempotencyKey: "rev-key-1",
          reason: "Cash entry error",
        },
      });

      await waitFor(() => {
        expect(invalidateSpy).toHaveBeenCalledWith({
          queryKey: ["admissions", "adm-1", "fee-configuration"],
        });
        expect(invalidateSpy).toHaveBeenCalledWith({
          queryKey: ["admissions", "adm-1", "concessions"],
        });
        expect(invalidateSpy).toHaveBeenCalledWith({
          queryKey: ["installment-schedules", "adm-1"],
        });
        expect(invalidateSpy).toHaveBeenCalledWith({
          queryKey: ["installment-schedules", "adm-1", "lineage"],
        });
        expect(invalidateSpy).toHaveBeenCalledWith({
          queryKey: ["admissions", "adm-1", "payments"],
        });
        expect(invalidateSpy).toHaveBeenCalledWith({
          queryKey: ["student-fees", "std-1"],
        });
        expect(invalidateSpy).toHaveBeenCalledWith({
          queryKey: ["student-fees"],
        });
        expect(invalidateSpy).toHaveBeenCalledWith({
          queryKey: ["admissions"],
        });
        expect(invalidateSpy).toHaveBeenCalledWith({
          queryKey: ["students"],
        });
      });
    });
  });
});
