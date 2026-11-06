import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiClient } from "./api-client";
import { session } from "./session";

export type AdmissionStatus = "DRAFT" | "CONFIRMED" | "CANCELLED";
export interface AdmissionResponse {
  id: string;
  admissionNumber: string;
  admissionSequence: number;
  admissionStatus: AdmissionStatus;
  schoolId: string;
  academicYearId: string;
  programId: string;
  classId: string;
  sectionId: string;
  studentName: string;
  gender: string;
  dateOfBirth: string;
  parentName?: string;
  parentRelation?: string;
  parentPhone?: string;
  parentAlternatePhone?: string;
  parentEmail?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  country?: string;
  pincode?: string;
  studentId?: string;
  student?: { id: string; studentNumber: string; studentName: string } | null;
  createdById: string;
  confirmedAt?: string;
  cancelledAt?: string;
  createdAt?: string;
  updatedAt?: string;
}
export interface AdmissionPayload {
  schoolId: string;
  academicYearId: string;
  programId: string;
  classId: string;
  sectionId: string;
  studentName: string;
  gender: string;
  dateOfBirth: string;
  parentName: string;
  parentRelation: string;
  parentPhone: string;
  parentAlternatePhone: string;
  parentEmail: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  createdById: string;
  selectedFeeComponentIds: string[];
  admissionNumber?: string;
  admissionSequence?: number;
}
export interface ApplicableFeeConfiguration {
  feeStructure: {
    id: string;
    name: string;
    totalAmount: string;
    academicYearId: string;
    programId: string;
    classId: string;
    description: string | null;
  };
  components: Array<{
    id: string;
    name: string;
    originalAmount: string;
    isDiscountApplicable: boolean;
    isMandatory: boolean;
    description: string | null;
    initiallySelected: boolean;
    locked: boolean;
  }>;
}
export interface AdmissionUpdatePayload {
  admissionId: string;
  programId?: string;
  classId?: string;
  sectionId?: string;
  studentName?: string;
  gender?: string;
  dateOfBirth?: string;
  parentName?: string;
  parentRelation?: string;
  parentPhone?: string;
  parentAlternatePhone?: string;
  parentEmail?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
}
export const admissionsQueryKey = ["admissions"] as const;
const authOptions = () => {
  const token = session.getAccessToken();
  return token ? { token } : undefined;
};
export const admissionsApi = {
  getApplicableFeeConfiguration: (query: { academicYearId: string; programId: string; classId: string }) => apiClient.get<ApplicableFeeConfiguration>(`/admission/fee-configuration/applicable?academicYearId=${encodeURIComponent(query.academicYearId)}&programId=${encodeURIComponent(query.programId)}&classId=${encodeURIComponent(query.classId)}`, authOptions()),
  list: () => apiClient.get<AdmissionResponse[]>("/admission", authOptions()),
  get: (id: string) => apiClient.get<AdmissionResponse | null>(`/admission/${id}`, authOptions()),
  create: (payload: AdmissionPayload) =>
    apiClient.post<AdmissionResponse | undefined>("/admission", payload, authOptions()),
  update: (id: string, payload: AdmissionUpdatePayload) =>
    apiClient.patch<AdmissionResponse>(`/admission/${id}`, payload, authOptions()),
  delete: (id: string) =>
    apiClient.patch<AdmissionResponse>(`/admission/${id}/delete`, undefined, authOptions()),
  confirm: (id: string) =>
    apiClient.post<AdmissionResponse>(`/admission/${id}/confirmed`, undefined, authOptions()),
  cancel: (id: string) =>
    apiClient.post<AdmissionResponse>(`/admission/${id}/cancelled`, undefined, authOptions()),
};
export function useApplicableFeeConfiguration(query: { academicYearId: string; programId: string; classId: string }) { const enabled = Boolean(query.academicYearId && query.programId && query.classId); return useQuery({ queryKey: ["admission-fee-configuration-applicable", query.academicYearId, query.programId, query.classId], queryFn: () => admissionsApi.getApplicableFeeConfiguration(query), enabled, retry: false }); }
export function useAdmissions() {
  return useQuery({ queryKey: admissionsQueryKey, queryFn: admissionsApi.list, retry: false });
}
export function useAdmission(id?: string) {
  return useQuery({
    queryKey: [...admissionsQueryKey, id],
    queryFn: () => admissionsApi.get(id!),
    enabled: Boolean(id),
    retry: false,
  });
}
export function useSaveAdmission(id?: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: AdmissionPayload | AdmissionUpdatePayload) =>
      id
        ? admissionsApi.update(id, payload as AdmissionUpdatePayload)
        : admissionsApi.create(payload as AdmissionPayload),
    onSuccess: async (saved) => {
      if (saved?.id) client.setQueryData([...admissionsQueryKey, saved.id], saved);
      await client.invalidateQueries({ queryKey: admissionsQueryKey });
    },
  });
}
export function useAdmissionWorkflow() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: "confirm" | "cancel" }) =>
      action === "confirm" ? admissionsApi.confirm(id) : admissionsApi.cancel(id),
    onSuccess: async (saved) => {
      client.setQueryData([...admissionsQueryKey, saved.id], saved);
      await client.invalidateQueries({ queryKey: admissionsQueryKey });
      await client.invalidateQueries({ queryKey: ["students"] });
      await client.invalidateQueries({ queryKey: ["admissions", saved.id, "fee-configuration"] });
      await client.invalidateQueries({ queryKey: ["admissions", saved.id, "concessions"] });
    },
  });
}

export function confirmationErrorMessage(error: unknown, fallback = "Could not confirm admission.") {
  if (!(error instanceof ApiError)) return fallback;
  const body = error.body as { code?: string; message?: string | string[] } | undefined;
  switch (body?.code) {
    case "NO_INCLUDED_FEE_DETAILS": return "Confirmation blocked: include at least one fee component.";
    case "DISCOUNT_REVIEW_REQUIRED": return "Confirmation blocked: review the concession and reapply it or acknowledge no concession.";
    case "FINANCIAL_SNAPSHOT_INCONSISTENT": return "Confirmation blocked: the fee snapshot is inconsistent and requires investigation.";
    default: return admissionErrorMessage(error, fallback);
  }
}

export function useDeleteAdmission() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string }) => admissionsApi.delete(id),
    onSuccess: async (_deleted, { id }) => {
      client.removeQueries({ queryKey: [...admissionsQueryKey, id] });
      await client.invalidateQueries({ queryKey: admissionsQueryKey });
      await client.invalidateQueries({ queryKey: ["students"] });
    },
  });
}

export function admissionStatusLabel(status: AdmissionStatus) {
  return status === "DRAFT" ? "Pending" : status === "CONFIRMED" ? "Confirmed" : "Cancelled";
}
export function admissionErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof ApiError)) return fallback;
  if (error.status === 401) return "Your session has expired. Please sign in again.";
  if (error.status === 403) return "You do not have permission to manage admissions.";
  if (error.status === 404) return "Admission not found.";
  if (error.status === 409)
    return Array.isArray(error.backendMessage)
      ? error.backendMessage.join(" ")
      : error.backendMessage || "This admission conflicts with an existing record.";
  if (Array.isArray(error.backendMessage)) return error.backendMessage.join(" ");
  return error.backendMessage || fallback;
}

export function applicableFeeConfigurationErrorMessage(error: unknown, fallback = "Could not load the applicable fee configuration.") {
  if (!(error instanceof ApiError)) return fallback;
  if (error.status === 404) {
    return Array.isArray(error.backendMessage)
      ? error.backendMessage.join(" ")
      : error.backendMessage || "No applicable active fee structure was found.";
  }
  if (error.status === 409) {
    return Array.isArray(error.backendMessage)
      ? error.backendMessage.join(" ")
      : error.backendMessage || "Multiple active fee structures match this selection.";
  }
  return admissionErrorMessage(error, fallback);
}
