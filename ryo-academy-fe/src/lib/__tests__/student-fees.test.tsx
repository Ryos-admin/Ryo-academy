import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  studentFeesApi,
  studentFeesErrorMessage,
  studentFeesQueryKey,
  useRecordStudentFeePayment,
  parsePaymentMinor,
  validatePaymentAmount,
} from "@/lib/student-fees-api";
import { ApiError } from "@/lib/api-client";

const STUDENT_ID = "student-1";

const createClient = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

const wrapperFor = (client: QueryClient) => {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return Wrapper;
};

describe("useRecordStudentFeePayment", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("posts the payment through the existing adapter", async () => {
    const createPayment = vi
      .spyOn(studentFeesApi, "createPayment")
      .mockResolvedValue({} as never);
    const client = createClient();

    const { result } = renderHook(() => useRecordStudentFeePayment(STUDENT_ID), {
      wrapper: wrapperFor(client),
    });

    await result.current.mutateAsync({ amount: "500.00", paymentDate: "2026-01-05" });

    expect(createPayment).toHaveBeenCalledWith(STUDENT_ID, {
      amount: "500.00",
      paymentDate: "2026-01-05",
    });
  });

  it("invalidates the student's fee snapshot and the students cache", async () => {
    vi.spyOn(studentFeesApi, "createPayment").mockResolvedValue({} as never);
    const client = createClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useRecordStudentFeePayment(STUDENT_ID), {
      wrapper: wrapperFor(client),
    });

    await result.current.mutateAsync({ amount: "250" });

    const invalidatedKeys = invalidate.mock.calls.map((call) => call[0].queryKey);
    expect(invalidatedKeys).toContainEqual([...studentFeesQueryKey, STUDENT_ID]);
    expect(invalidatedKeys).toContainEqual(["students"]);
  });

  it("exposes pending state and surfaces failures without caching them", async () => {
    vi.spyOn(studentFeesApi, "createPayment").mockRejectedValue(new Error("boom"));
    const client = createClient();

    const { result } = renderHook(() => useRecordStudentFeePayment(STUDENT_ID), {
      wrapper: wrapperFor(client),
    });

    expect(result.current.isPending).toBe(false);
    await expect(result.current.mutateAsync({ amount: "100" })).rejects.toThrow("boom");
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.isError).toBe(true);
  });
});

describe("student payment decimal contract", () => {
  it.each(["1", "1.2", "1.20", "1.23"])("accepts %s", (value) => expect(validatePaymentAmount(value, "2.00")).not.toBeNull());
  it.each(["", " ", "0", "-1", "1.234", "1e1", "abc"])("rejects %s", (value) => expect(validatePaymentAmount(value, "2.00")).toBeNull());
  it("rejects overpayment and accepts exact outstanding", () => { expect(validatePaymentAmount("2.01", "2.00")).toBeNull(); expect(validatePaymentAmount("2.00", "2.00")).toBe(200n); });
  it("uses exact minor units", () => expect(parsePaymentMinor("10.00")).toBe(1000n));
});

describe("student fee inclusion response", () => {
  it("preserves included and excluded snapshot flags", async () => {
    const included = { ...({ id: "included", feeComponentId: "fc-1", nameSnapshot: "Tuition", originalAmount: "100", discountApplicable: false, isMandatory: true, discountAmount: "0", finalAmount: "100", totalAmountToBePaid: "100", amountPaid: "0", amountOutstanding: "100", paymentDate: null } as const), isActive: true, isIncluded: true };
    const excluded = { ...included, id: "excluded", isMandatory: false, isIncluded: false };
    vi.spyOn(studentFeesApi, "get").mockResolvedValue({ fee: { components: [included, excluded] } } as never);
    const result = await studentFeesApi.get(STUDENT_ID);
    expect(result.fee?.components.map(({ isActive, isIncluded }) => ({ isActive, isIncluded }))).toEqual([
      { isActive: true, isIncluded: true },
      { isActive: true, isIncluded: false },
    ]);
  });
});

describe("studentFeesErrorMessage", () => {
  it("returns fallback for non-error or unknown value", () => {
    expect(studentFeesErrorMessage(null, "Fallback error")).toBe("Fallback error");
    expect(studentFeesErrorMessage(undefined, "Fallback error")).toBe("Fallback error");
    expect(studentFeesErrorMessage({}, "Fallback error")).toBe("Fallback error");
  });

  it("returns standard error message for generic Error instances", () => {
    expect(studentFeesErrorMessage(new Error("Network failed"), "Fallback error")).toBe("Network failed");
  });

  it("handles ADMISSION_FEE_DETAILS_OUTDATED with specific administrator guidance", () => {
    const error = new ApiError(409, {
      code: "ADMISSION_FEE_DETAILS_OUTDATED",
      message: "The admission fee details do not match master components.",
    });
    expect(studentFeesErrorMessage(error, "Fallback error")).toBe(
      "The fee details for this admission no longer match the latest Fee Structure configuration. Payment collection is blocked until an administrator synchronizes this Fee Structure.",
    );
  });

  it("handles 401, 403, and 404 HTTP errors", () => {
    expect(studentFeesErrorMessage(new ApiError(401), "Fallback")).toBe(
      "Your session has expired. Please sign in again.",
    );
    expect(studentFeesErrorMessage(new ApiError(403), "Fallback")).toBe(
      "You do not have permission to record student fee payments.",
    );
    expect(studentFeesErrorMessage(new ApiError(404), "Fallback")).toBe(
      "The requested student fee snapshot was not found.",
    );
  });

  it("handles general 409 conflict errors with body message or default", () => {
    const errorWithMessage = new ApiError(409, { message: "Concurrent modification detected" });
    expect(studentFeesErrorMessage(errorWithMessage, "Fallback")).toBe("Concurrent modification detected");

    const errorWithoutMessage = new ApiError(409, {});
    expect(studentFeesErrorMessage(errorWithoutMessage, "Fallback")).toBe(
      "A payment conflict occurred. Please refresh and try again.",
    );
  });

  it("handles backendMessage array or string", () => {
    const arrayError = new ApiError(400, { message: ["Amount is required", "Invalid date"] });
    expect(studentFeesErrorMessage(arrayError, "Fallback")).toBe("Amount is required Invalid date");

    const stringError = new ApiError(400, { message: "Custom error occurred" });
    expect(studentFeesErrorMessage(stringError, "Fallback")).toBe("Custom error occurred");
  });
});
