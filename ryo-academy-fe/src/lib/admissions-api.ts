import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiClient } from "./api-client";
import { session } from "./session";

export type AdmissionStatus = "DRAFT" | "CONFIRMED" | "CANCELLED";
export interface AdmissionResponse { id: string; admissionNumber: string; admissionSequence: number; admissionStatus: AdmissionStatus; schoolId: string; academicYearId: string; programId: string; classId: string; sectionId: string; studentName: string; gender: string; dateOfBirth: string; parentName?: string; parentRelation?: string; parentPhone?: string; parentAlternatePhone?: string; parentEmail?: string; addressLine1?: string; addressLine2?: string; city?: string; state?: string; country?: string; pincode?: string; studentId?: string; student?: { id: string; studentNumber: string; studentName: string } | null; createdById: string; confirmedAt?: string; cancelledAt?: string; createdAt?: string; updatedAt?: string; }
export interface AdmissionPayload { schoolId: string; academicYearId: string; programId: string; classId: string; sectionId: string; studentName: string; gender: string; dateOfBirth: string; parentName: string; parentRelation: string; parentPhone: string; parentAlternatePhone: string; parentEmail: string; addressLine1: string; addressLine2: string; city: string; state: string; country: string; postalCode: string; createdById: string; feePaymentHeaders: Record<string, unknown>; admissionNumber?: string; admissionSequence?: number; }
export interface AdmissionUpdatePayload extends Omit<AdmissionPayload, "schoolId" | "academicYearId" | "createdById"> { admissionId: string; }
export const admissionsQueryKey = ["admissions"] as const;
const authOptions = () => { const token = session.getAccessToken(); return token ? { token } : undefined; };
export const admissionsApi = {
  list: () => apiClient.get<AdmissionResponse[]>("/admission", authOptions()),
  get: (id: string) => apiClient.get<AdmissionResponse | null>(`/admission/${id}`, authOptions()),
  create: (payload: AdmissionPayload) => apiClient.post<AdmissionResponse | undefined>("/admission", payload, authOptions()),
  update: (id: string, payload: AdmissionUpdatePayload) => apiClient.patch<AdmissionResponse>(`/admission/${id}`, payload, authOptions()),
  confirm: (id: string) => apiClient.post<AdmissionResponse>(`/admission/${id}/confirmed`, undefined, authOptions()),
  cancel: (id: string) => apiClient.post<AdmissionResponse>(`/admission/${id}/cancelled`, undefined, authOptions()),
};
export function useAdmissions() { return useQuery({ queryKey: admissionsQueryKey, queryFn: admissionsApi.list, retry: false }); }
export function useAdmission(id?: string) { return useQuery({ queryKey: [...admissionsQueryKey, id], queryFn: () => admissionsApi.get(id!), enabled: Boolean(id), retry: false }); }
export function useSaveAdmission(id?: string) { const client = useQueryClient(); return useMutation({ mutationFn: (payload: AdmissionPayload | AdmissionUpdatePayload) => id ? admissionsApi.update(id, payload as AdmissionUpdatePayload) : admissionsApi.create(payload as AdmissionPayload), onSuccess: async (saved) => { if (saved?.id) client.setQueryData([...admissionsQueryKey, saved.id], saved); await client.invalidateQueries({ queryKey: admissionsQueryKey }); } }); }
export function useAdmissionWorkflow() { const client = useQueryClient(); return useMutation({ mutationFn: ({ id, action }: { id: string; action: "confirm" | "cancel" }) => action === "confirm" ? admissionsApi.confirm(id) : admissionsApi.cancel(id), onSuccess: async (saved) => { client.setQueryData([...admissionsQueryKey, saved.id], saved); await client.invalidateQueries({ queryKey: admissionsQueryKey }); await client.invalidateQueries({ queryKey: ["students"] }); } }); }
export function admissionStatusLabel(status: AdmissionStatus) { return status === "DRAFT" ? "Pending" : status === "CONFIRMED" ? "Confirmed" : "Cancelled"; }
export function admissionErrorMessage(error: unknown, fallback: string) { if (!(error instanceof ApiError)) return fallback; if (error.status === 401) return "Your session has expired. Please sign in again."; if (error.status === 403) return "You do not have permission to manage admissions."; if (error.status === 404) return "Admission not found."; if (error.status === 409) return Array.isArray(error.backendMessage) ? error.backendMessage.join(" ") : error.backendMessage || "This admission conflicts with an existing record."; if (Array.isArray(error.backendMessage)) return error.backendMessage.join(" "); return error.backendMessage || fallback; }
