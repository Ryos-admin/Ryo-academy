import { useContext } from "react";
import {
  QueryClientContext,
  useMutation,
  useQuery,
  type QueryClient,
} from "@tanstack/react-query";
import { ApiError, apiClient } from "./api-client";
import { session } from "./session";
import { queryClient as defaultQueryClient } from "./query-client";
import {
  admissionConcessionsQueryKey,
  admissionFeeConfigurationQueryKey,
} from "./concessions-api";
import { installmentSchedulesQueryKey } from "./installment-schedules-api";
import { admissionsQueryKey } from "./admissions-api";
import { studentFeesQueryKey } from "./student-fees-api";

function useSafeQueryClient(customClient?: QueryClient): QueryClient {
  const contextClient = useContext(QueryClientContext);
  return customClient ?? contextClient ?? defaultQueryClient;
}

export interface AdmissionPaymentComponentAllocationDto {
  feePaymentDetailsId: string;
  amount: string;
}

export interface CreateAdmissionPaymentRequest {
  idempotencyKey: string;
  feePaymentHeaderId?: string;
  amount: string;
  paymentMethod: "CASH";
  paymentDate: string;
  allocations: AdmissionPaymentComponentAllocationDto[];
}

export interface ReverseAdmissionPaymentRequest {
  idempotencyKey: string;
  reason: string;
}

export interface AdmissionPaymentAllocationDetail {
  id: string;
  feePaymentDetailsId: string;
  amount: string;
}

export interface AdmissionPaymentInstallmentAllocationDetail {
  id: string;
  installmentId: string;
  feePaymentHeaderId?: string;
  allocatedAmount: string;
}

export interface AdmissionPaymentResponse {
  statusCode: 201 | 200;
  isReplay: boolean;
  id: string;
  idempotencyKey: string;
  admissionId: string;
  feePaymentHeaderId: string;
  amount: string;
  paymentMethod: "CASH";
  paymentDate: string;
  createdAt: string;
  allocations: AdmissionPaymentAllocationDetail[];
  installmentAllocations: AdmissionPaymentInstallmentAllocationDetail[];
  headerSnapshot: {
    totalFeeAmount: string;
    totalPaidAmount: string;
    totalDueAmount: string;
  } | null;
}

export interface PaymentReversalEventSummary {
  id: string;
  feePaymentId?: string;
  schoolId?: string;
  reversalAmount: string;
  reason: string;
  idempotencyKey?: string;
  reversedByUserId?: string;
  createdAt: string;
}

export interface AdmissionPaymentReversalResponse {
  statusCode: 200;
  isReplay: boolean;
  reversal: PaymentReversalEventSummary;
  headerSnapshot: {
    totalFeeAmount: string;
    totalPaidAmount: string;
    totalDueAmount: string;
  } | null;
}

export interface PaymentHistoryDetailAttribution {
  id: string;
  feePaymentDetailsId: string;
  componentName?: string;
  originalAmount?: string;
  netAmount?: string;
  amount?: string;
}

export interface PaymentHistoryInstallmentAllocation {
  id: string;
  installmentId: string;
  sequence?: number;
  label?: string;
  dueDate?: string | null;
  allocatedAmount: string;
  reversedAmount?: string;
  netAmount?: string;
}

export interface AdmissionPaymentHistoryItem {
  id: string;
  idempotencyKey: string;
  admissionId: string;
  feePaymentHeaderId: string;
  amount: string;
  paymentMethod: string;
  paymentDate: string;
  createdAt: string;
  isReversed: boolean;
  reversal: PaymentReversalEventSummary | null;
  allocations: PaymentHistoryDetailAttribution[];
  installmentAllocations: PaymentHistoryInstallmentAllocation[];
}

export const parseMoneyMinor = (
  value: string | number | null | undefined,
): bigint | null => {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(trimmed)) return null;
  const [whole, fraction = ""] = trimmed.split(".");
  return BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2));
};

export const formatMinorToMoney = (minor: bigint): string => {
  const isNeg = minor < 0n;
  const abs = isNeg ? -minor : minor;
  const whole = abs / 100n;
  const frac = abs % 100n;
  return `${isNeg ? "-" : ""}${whole.toString()}.${frac.toString().padStart(2, "0")}`;
};

export const admissionPaymentsQueryKey = (admissionId: string) =>
  ["admissions", admissionId, "payments"] as const;

function authOptions() {
  const token = session.getAccessToken();
  return token ? { token } : undefined;
}

export const admissionPaymentsApi = {
  list: (admissionId: string) =>
    apiClient.get<AdmissionPaymentHistoryItem[]>(
      `/admissions/${encodeURIComponent(admissionId)}/payments`,
      authOptions(),
    ),

  get: (admissionId: string, paymentId: string) =>
    apiClient.get<AdmissionPaymentHistoryItem>(
      `/admissions/${encodeURIComponent(admissionId)}/payments/${encodeURIComponent(paymentId)}`,
      authOptions(),
    ),

  create: (admissionId: string, payload: CreateAdmissionPaymentRequest) =>
    apiClient.post<AdmissionPaymentResponse>(
      `/admissions/${encodeURIComponent(admissionId)}/payments`,
      payload,
      authOptions(),
    ),

  reverse: (
    admissionId: string,
    paymentId: string,
    payload: ReverseAdmissionPaymentRequest,
  ) =>
    apiClient.post<AdmissionPaymentReversalResponse>(
      `/admissions/${encodeURIComponent(admissionId)}/payments/${encodeURIComponent(paymentId)}/reverse`,
      payload,
      authOptions(),
    ),
};

export function useAdmissionPayments(
  admissionId?: string,
  options?: { enabled?: boolean },
  customClient?: QueryClient,
) {
  const qc = useSafeQueryClient(customClient);
  return useQuery(
    {
      queryKey: admissionPaymentsQueryKey(admissionId || ""),
      queryFn: () => admissionPaymentsApi.list(admissionId!),
      enabled: Boolean(admissionId) && (options?.enabled ?? true),
      retry: false,
    },
    qc,
  );
}

export function useRecordAdmissionPayment(
  admissionId: string,
  options?: { studentId?: string },
  customClient?: QueryClient,
) {
  const qc = useSafeQueryClient(customClient);
  return useMutation(
    {
      mutationFn: (payload: CreateAdmissionPaymentRequest) =>
        admissionPaymentsApi.create(admissionId, payload),
      onSuccess: async () => {
        // 1. Invalidate admission fee configuration (which updates component amountPaid, totalDueAmount, etc.)
        await qc.invalidateQueries({
          queryKey: admissionFeeConfigurationQueryKey(admissionId),
        });
        // 2. Invalidate admission concessions
        await qc.invalidateQueries({
          queryKey: admissionConcessionsQueryKey(admissionId),
        });
        // 3. Invalidate installment schedule
        await qc.invalidateQueries({
          queryKey: [...installmentSchedulesQueryKey, admissionId],
        });
        // 3. Invalidate installment schedule lineage
        await qc.invalidateQueries({
          queryKey: [
            ...installmentSchedulesQueryKey,
            admissionId,
            "lineage",
          ],
        });
        // 4. Invalidate admission payment history
        await qc.invalidateQueries({
          queryKey: admissionPaymentsQueryKey(admissionId),
        });
        // 5. Invalidate student fees if a converted student exists
        if (options?.studentId) {
          await qc.invalidateQueries({
            queryKey: [...studentFeesQueryKey, options.studentId],
          });
        }
        await qc.invalidateQueries({ queryKey: studentFeesQueryKey });
        // 6. Invalidate general admissions and student listings
        await qc.invalidateQueries({ queryKey: admissionsQueryKey });
        await qc.invalidateQueries({ queryKey: ["students"] });
      },
    },
    qc,
  );
}

export function useReverseAdmissionPayment(
  admissionId: string,
  options?: { studentId?: string },
  customClient?: QueryClient,
) {
  const qc = useSafeQueryClient(customClient);
  return useMutation(
    {
      mutationFn: ({
        paymentId,
        payload,
      }: {
        paymentId: string;
        payload: ReverseAdmissionPaymentRequest;
      }) => admissionPaymentsApi.reverse(admissionId, paymentId, payload),
      onSuccess: async () => {
        // 1. Invalidate admission fee configuration (updates component amountPaid, totalDueAmount, etc.)
        await qc.invalidateQueries({
          queryKey: admissionFeeConfigurationQueryKey(admissionId),
        });
        // 2. Invalidate admission concessions
        await qc.invalidateQueries({
          queryKey: admissionConcessionsQueryKey(admissionId),
        });
        // 3. Invalidate installment schedule
        await qc.invalidateQueries({
          queryKey: [...installmentSchedulesQueryKey, admissionId],
        });
        // 4. Invalidate installment schedule lineage
        await qc.invalidateQueries({
          queryKey: [
            ...installmentSchedulesQueryKey,
            admissionId,
            "lineage",
          ],
        });
        // 5. Invalidate admission payment history
        await qc.invalidateQueries({
          queryKey: admissionPaymentsQueryKey(admissionId),
        });
        // 6. Invalidate student fees if a converted student exists
        if (options?.studentId) {
          await qc.invalidateQueries({
            queryKey: [...studentFeesQueryKey, options.studentId],
          });
        }
        await qc.invalidateQueries({ queryKey: studentFeesQueryKey });
        // 7. Invalidate general admissions and student listings
        await qc.invalidateQueries({ queryKey: admissionsQueryKey });
        await qc.invalidateQueries({ queryKey: ["students"] });
      },
    },
    qc,
  );
}

export function admissionPaymentErrorMessage(
  error: unknown,
  fallback: string,
): string {
  if (!(error instanceof ApiError)) {
    if (error instanceof Error && error.message) return error.message;
    return fallback;
  }

  const body = error.body as any;
  if (body?.code === "SCHEDULE_REQUIRED") {
    return "An installment schedule must be configured before collecting the first payment on this admission.";
  }
  if (error.status === 409) {
    if (typeof body?.message === "string") {
      return body.message;
    }
    return "A payment or schedule conflict occurred. Please refresh and check recent activity.";
  }
  if (error.status === 400) {
    if (typeof body?.message === "string") return body.message;
    if (Array.isArray(body?.message)) return body.message.join("; ");
    return "Invalid payment details submitted.";
  }
  if (error.status === 401) {
    return "Your session has expired. Please sign in again.";
  }
  if (error.status === 403) {
    return "You do not have permission to record fee payments.";
  }
  if (error.status === 404) {
    return "Admission or fee header not found.";
  }
  if (typeof body?.message === "string") return body.message;
  return fallback;
}

export function admissionPaymentReversalErrorMessage(
  error: unknown,
  fallback: string,
): string {
  if (!(error instanceof ApiError)) {
    if (error instanceof Error && error.message) return error.message;
    return fallback;
  }

  const body = error.body as any;
  if (body?.code === "PAYMENT_DETAIL_ATTRIBUTION_UNAVAILABLE") {
    return "Payment detail attribution is unavailable for this historical payment; exact reversal is impossible.";
  }
  if (error.status === 409) {
    if (typeof body?.message === "string") {
      return body.message;
    }
    return "A payment reversal conflict occurred. Please refresh and check recent activity.";
  }
  if (error.status === 400) {
    if (typeof body?.message === "string") return body.message;
    if (Array.isArray(body?.message)) return body.message.join("; ");
    return "Invalid reversal request submitted.";
  }
  if (error.status === 401) {
    return "Your session has expired. Please sign in again.";
  }
  if (error.status === 403) {
    return "You do not have permission to reverse fee payments.";
  }
  if (error.status === 404) {
    return "Admission or payment record not found.";
  }
  if (typeof body?.message === "string") return body.message;
  return fallback;
}

