import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  studentFeesApi,
  studentFeesQueryKey,
  useRecordStudentFeePayment,
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

    await result.current.mutateAsync({ amount: 500, paymentDate: "2026-01-05" });

    expect(createPayment).toHaveBeenCalledWith(STUDENT_ID, {
      amount: 500,
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

    await result.current.mutateAsync({ amount: 250 });

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
    await expect(result.current.mutateAsync({ amount: 100 })).rejects.toThrow("boom");
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.isError).toBe(true);
  });
});
