import { useContext } from "react";
import { QueryClientContext, useMutation, useQuery, type QueryClient } from "@tanstack/react-query";
import { ApiError, apiClient } from "./api-client";
import { session } from "./session";
import { admissionsQueryKey } from "./admissions-api";
import { queryClient as defaultQueryClient } from "./query-client";

function useSafeQueryClient(customClient?: QueryClient): QueryClient {
  const contextClient = useContext(QueryClientContext);
  return customClient ?? contextClient ?? defaultQueryClient;
}

export type InstallmentScheduleType = "TEMPLATE" | "CUSTOM";
export type InstallmentScheduleStatus = "DRAFT" | "CONFIRMED" | "SUPERSEDED";
export type InstallmentRowStatus =
  | "PENDING"
  | "PARTIALLY_PAID"
  | "PAID"
  | "PAID_EARLY"
  | "PAID_LATE"
  | "OVERDUE"
  | "SUPERSEDED"
  | "VOID";

export interface AdmissionInstallmentResponse {
  id: string;
  scheduleId: string;
  feePaymentHeaderId: string;
  sequence: number;
  subSequence: number;
  label: string;
  amount: number | string;
  offsetAmount?: number | string;
  dueDate: string;
  status: InstallmentRowStatus;
  paidAt: string | null;
  allocatedAmount?: number | string;
  outstandingBalance?: number | string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AdmissionInstallmentScheduleResponse {
  id: string;
  schoolId: string;
  admissionId: string;
  feePaymentHeaderId: string;
  templateId: string | null;
  scheduleType: InstallmentScheduleType;
  status: InstallmentScheduleStatus;
  totalAmount: number | string;
  installmentCount: number;
  justification: string | null;
  confirmedAt: string | null;
  supersededAt: string | null;
  createdAt?: string;
  updatedAt?: string;
  installments: AdmissionInstallmentResponse[];
  template?: {
    id: string;
    name: string;
    calculationType: string;
    isActive: boolean;
  } | null;
}

export interface ScheduleViewResponse {
  admissionId: string;
  admissionStatus: string;
  isFrozen: boolean;
  header: {
    id: string;
    grossAmount: number | string;
    discountAmount: number | string;
    netAmount: number | string;
    totalPaidAmount: number | string;
    totalDueAmount: number | string;
  };
  schedule: AdmissionInstallmentScheduleResponse | null;
}

export interface ScheduleLineageTransferEdge {
  id: string;
  eventId: string;
  scheduleId: string;
  sourceInstallmentId: string | null;
  resultInstallmentId: string | null;
  amount: number | string;
  sourceInstallment?: AdmissionInstallmentResponse | null;
  resultInstallment?: AdmissionInstallmentResponse | null;
}

export interface ScheduleLineageEvent {
  id: string;
  scheduleId: string;
  eventType: string;
  description: string | null;
  createdAt: string;
  transferEdges?: ScheduleLineageTransferEdge[];
}

export interface ScheduleLineageResponse {
  admissionId: string;
  scheduleId: string;
  lineageEvents: ScheduleLineageEvent[];
}

export interface ManualInstallmentItem {
  sequence: number;
  label: string;
  amount: string;
  dueDate: string; // YYYY-MM-DD
}

export interface CreateTemplateScheduleRequest {
  templateId: string;
  firstDueDate: string; // YYYY-MM-DD
  allowFinalAbsorption?: boolean;
  feePaymentHeaderId?: string;
}

export interface CreateManualScheduleRequest {
  justification: string;
  installments: ManualInstallmentItem[];
  feePaymentHeaderId?: string;
}

export interface UpdateDraftScheduleRequest {
  installments: ManualInstallmentItem[];
  reason?: string;
  feePaymentHeaderId?: string;
}

export interface PreviewScheduleRequest {
  templateId?: string;
  manualSchedule?: CreateManualScheduleRequest;
  firstDueDate?: string; // YYYY-MM-DD
  allowFinalAbsorption?: boolean;
  feePaymentHeaderId?: string;
}

export interface SchedulePreviewResponse {
  admissionId: string;
  feePaymentHeaderId: string;
  scheduleType: InstallmentScheduleType;
  templateId?: string;
  netAmount: number | string;
  installmentCount: number;
  installments: Array<{
    sequence: number;
    subSequence?: number;
    label: string;
    amount: number | string;
    dueDate: string;
  }>;
}

export const installmentSchedulesQueryKey = ["installment-schedules"] as const;

const authOptions = () => {
  const token = session.getAccessToken();
  return token ? { token } : undefined;
};

export const installmentSchedulesApi = {
  getSchedule: (admissionId: string, feePaymentHeaderId?: string) => {
    const query = feePaymentHeaderId ? `?feePaymentHeaderId=${encodeURIComponent(feePaymentHeaderId)}` : "";
    return apiClient.get<ScheduleViewResponse>(
      `/admissions/${encodeURIComponent(admissionId)}/installment-schedule${query}`,
      authOptions(),
    );
  },

  getLineage: (admissionId: string, feePaymentHeaderId?: string) => {
    const query = feePaymentHeaderId ? `?feePaymentHeaderId=${encodeURIComponent(feePaymentHeaderId)}` : "";
    return apiClient.get<ScheduleLineageResponse>(
      `/admissions/${encodeURIComponent(admissionId)}/installment-schedule/lineage${query}`,
      authOptions(),
    );
  },

  preview: (admissionId: string, payload: PreviewScheduleRequest) => {
    return apiClient.post<SchedulePreviewResponse>(
      `/admissions/${encodeURIComponent(admissionId)}/installment-schedule/preview`,
      payload,
      authOptions(),
    );
  },

  createFromTemplate: (admissionId: string, payload: CreateTemplateScheduleRequest) => {
    return apiClient.post<AdmissionInstallmentScheduleResponse>(
      `/admissions/${encodeURIComponent(admissionId)}/installment-schedule/template`,
      payload,
      authOptions(),
    );
  },

  createManual: (admissionId: string, payload: CreateManualScheduleRequest) => {
    return apiClient.post<AdmissionInstallmentScheduleResponse>(
      `/admissions/${encodeURIComponent(admissionId)}/installment-schedule/manual`,
      payload,
      authOptions(),
    );
  },

  updateDraft: (admissionId: string, payload: UpdateDraftScheduleRequest) => {
    return apiClient.put<AdmissionInstallmentScheduleResponse>(
      `/admissions/${encodeURIComponent(admissionId)}/installment-schedule`,
      payload,
      authOptions(),
    );
  },
};

export function useInstallmentSchedule(
  admissionId?: string,
  feePaymentHeaderId?: string,
  customClient?: QueryClient,
) {
  const client = useSafeQueryClient(customClient);
  return useQuery(
    {
      queryKey: [...installmentSchedulesQueryKey, admissionId, feePaymentHeaderId],
      queryFn: () => installmentSchedulesApi.getSchedule(admissionId!, feePaymentHeaderId),
      enabled: Boolean(admissionId),
      retry: false,
    },
    client,
  );
}

export function useInstallmentScheduleLineage(
  admissionId?: string,
  feePaymentHeaderId?: string,
  customClient?: QueryClient,
) {
  const client = useSafeQueryClient(customClient);
  return useQuery(
    {
      queryKey: [...installmentSchedulesQueryKey, admissionId, "lineage", feePaymentHeaderId],
      queryFn: () => installmentSchedulesApi.getLineage(admissionId!, feePaymentHeaderId),
      enabled: Boolean(admissionId),
      retry: false,
    },
    client,
  );
}

export function usePreviewInstallmentSchedule(
  admissionId: string,
  customClient?: QueryClient,
) {
  const client = useSafeQueryClient(customClient);
  return useMutation(
    {
      mutationFn: (payload: PreviewScheduleRequest) =>
        installmentSchedulesApi.preview(admissionId, payload),
    },
    client,
  );
}

export function useCreateTemplateSchedule(
  admissionId: string,
  customClient?: QueryClient,
) {
  const qc = useSafeQueryClient(customClient);
  return useMutation(
    {
      mutationFn: (payload: CreateTemplateScheduleRequest) =>
        installmentSchedulesApi.createFromTemplate(admissionId, payload),
      onSuccess: async () => {
        await qc.invalidateQueries({ queryKey: [...installmentSchedulesQueryKey, admissionId] });
        await qc.invalidateQueries({ queryKey: [...admissionsQueryKey, admissionId] });
        await qc.invalidateQueries({ queryKey: admissionsQueryKey });
      },
    },
    qc,
  );
}

export function useCreateManualSchedule(
  admissionId: string,
  customClient?: QueryClient,
) {
  const qc = useSafeQueryClient(customClient);
  return useMutation(
    {
      mutationFn: (payload: CreateManualScheduleRequest) =>
        installmentSchedulesApi.createManual(admissionId, payload),
      onSuccess: async () => {
        await qc.invalidateQueries({ queryKey: [...installmentSchedulesQueryKey, admissionId] });
        await qc.invalidateQueries({ queryKey: [...admissionsQueryKey, admissionId] });
        await qc.invalidateQueries({ queryKey: admissionsQueryKey });
      },
    },
    qc,
  );
}

export function useUpdateDraftSchedule(
  admissionId: string,
  customClient?: QueryClient,
) {
  const qc = useSafeQueryClient(customClient);
  return useMutation(
    {
      mutationFn: (payload: UpdateDraftScheduleRequest) =>
        installmentSchedulesApi.updateDraft(admissionId, payload),
      onSuccess: async () => {
        await qc.invalidateQueries({ queryKey: [...installmentSchedulesQueryKey, admissionId] });
        await qc.invalidateQueries({ queryKey: [...admissionsQueryKey, admissionId] });
        await qc.invalidateQueries({ queryKey: admissionsQueryKey });
      },
    },
    qc,
  );
}

export function installmentScheduleErrorMessage(
  error: unknown,
  fallback = "Could not process installment schedule operation.",
): string {
  if (!(error instanceof ApiError)) return fallback;
  const body = error.body as { code?: string; message?: string | string[] } | undefined;
  const code = body?.code;

  if (code === "SCHEDULE_FROZEN_PAYMENT_EXISTS") {
    return "Installment schedule is frozen because payment history exists for this fee header.";
  }
  if (code === "SCHEDULE_ALREADY_EXISTS") {
    return "An installment schedule already exists for this fee header. Use update to modify an unpaid schedule.";
  }

  if (error.status === 401) return "Your session has expired. Please sign in again.";
  if (error.status === 403) return "You do not have permission to manage installment schedules.";
  if (error.status === 404) return "Installment schedule or admission was not found.";
  if (error.status === 409) {
    return Array.isArray(error.backendMessage)
      ? error.backendMessage.join(" ")
      : error.backendMessage || "This schedule operation conflicts with the current admission state.";
  }

  if (Array.isArray(error.backendMessage)) return error.backendMessage.join(" ");
  return error.backendMessage || fallback;
}
