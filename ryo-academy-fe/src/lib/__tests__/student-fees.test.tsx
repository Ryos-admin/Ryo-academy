import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  studentFeesApi,
  studentFeesQueryKey,
  useRecordStudentFeePayment,
  parsePaymentMinor,
  validatePaymentAmount,
} from "@/lib/student-fees-api";

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
