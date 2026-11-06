import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./api-client";
import { session } from "./session";

export type DiscountType = "PERCENTAGE" | "FIXED";

export interface FeeConcessionCategory {
  id: string;
  schoolId: string;
  name: string;
  code: string;
  description?: string | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateFeeConcessionCategoryPayload {
  name: string;
  code: string;
  description?: string;
  schoolId?: string;
}

export interface ConcessionComponentItem {
  id: string;
  componentId: string;
  nameSnapshot: string;
  originalAmount: number | string;
  discountApplicable: boolean;
  isMandatory: boolean;
  discountAmount: number | string;
  finalAmount: number | string;
  totalAmountToBePaid: number | string;
  concession: null | {
    id: string;
    categoryId: string | null;
    categoryName: string | null;
    categoryCode: string | null;
    discountType: DiscountType | null;
    discountValue: number | string | null;
    calculatedDiscountAmount: number | string;
    justification?: string | null;
    appliedAt: string;
    calculationMode: "LEGACY_PERCENTAGE" | "LEGACY_FIXED" | "PAYABLE";
    requiresReview: boolean;
  };
}

export interface AdmissionConcessionBreakdown {
  admissionId: string;
  admissionStatus: string;
  headerId?: string;
  grossAmount: number | string;
  discountAmount: number | string;
  netAmount: number | string;
  components: ConcessionComponentItem[];
}

export interface CreateAdmissionConcessionPayload {
  feePaymentDetailsId: string;
  payableAmount: string;
}
export interface UpdateAdmissionConcessionPayload { payableAmount: string }
export interface FeeConfigurationConcessionSummary {
  id: string;
  requiresReview: boolean;
  calculationMode: "LEGACY_PERCENTAGE" | "LEGACY_FIXED" | "PAYABLE";
}
export interface FeeConfigurationDetail {
  id: string;
  feeComponentId: string;
  name?: string;
  originalAmount: string | null;
  discountAmount: string | null;
  finalAmount: string | null;
  totalAmountToBePaid: string | null;
  amountPaid: string | null;
  isMandatory: boolean;
  discountApplicable: boolean;
  isActive: boolean;
  isIncluded: boolean;
  concession: FeeConfigurationConcessionSummary | null;
}
export interface AdmissionFeeConfiguration { admissionId: string; feePaymentHeader: { id: string; grossAmount: string | null; discountAmount: string | null; netAmount: string | null; totalFeeAmount: string | null; totalPaidAmount: string | null; totalDueAmount: string | null; feePaymentDetails: FeeConfigurationDetail[] } }

const authOptions = () => {
  const token = session.getAccessToken();
  return token ? { headers: { Authorization: `Bearer ${token}` } } : {};
};

export const concessionCategoriesQueryKey = ["fee-concession-categories"] as const;
export const admissionConcessionsQueryKey = (admissionId: string) =>
  ["admissions", admissionId, "concessions"] as const;
export const admissionFeeConfigurationQueryKey = (admissionId: string) => ["admissions", admissionId, "fee-configuration"] as const;

export const concessionsApi = {
  listCategories: (includeInactive = false) =>
    apiClient.get<FeeConcessionCategory[]>(
      `/fee-concessions${includeInactive ? "?includeInactive=true" : ""}`,
      authOptions(),
    ),
  createCategory: (payload: CreateFeeConcessionCategoryPayload) =>
    apiClient.post<FeeConcessionCategory>("/fee-concessions", payload, authOptions()),
  updateCategory: (id: string, payload: Partial<FeeConcessionCategory>) =>
    apiClient.patch<FeeConcessionCategory>(`/fee-concessions/${id}`, payload, authOptions()),
  deleteCategory: (id: string) =>
    apiClient.delete<FeeConcessionCategory>(`/fee-concessions/${id}`, authOptions()),

  getAdmissionConcessions: (admissionId: string) =>
    apiClient.get<AdmissionConcessionBreakdown>(
      `/admission/${admissionId}/concessions`,
      authOptions(),
    ),
  getFeeConfiguration: (admissionId: string) => apiClient.get<AdmissionFeeConfiguration>(`/admission/${admissionId}/fee-configuration`, authOptions()),
  updateFeeConfiguration: (admissionId: string, selectedFeeComponentIds: string[]) => apiClient.patch<AdmissionFeeConfiguration>(`/admission/${admissionId}/fee-configuration`, { selectedFeeComponentIds }, authOptions()),
  assignAdmissionConcession: (admissionId: string, payload: CreateAdmissionConcessionPayload) =>
    apiClient.post<any>(
      `/admission/${admissionId}/concessions`,
      payload,
      authOptions(),
    ),
  updateAdmissionConcession: (admissionId: string, concessionId: string, payload: UpdateAdmissionConcessionPayload) => apiClient.patch<any>(`/admission/${admissionId}/concessions/${concessionId}`, payload, authOptions()),
  removeAdmissionConcession: (admissionId: string, concessionId: string) =>
    apiClient.delete<any>(
      `/admission/${admissionId}/concessions/${concessionId}`,
      authOptions(),
    ),
};

export function useFeeConcessionCategories(includeInactive = false) {
  return useQuery({
    queryKey: [...concessionCategoriesQueryKey, includeInactive],
    queryFn: () => concessionsApi.listCategories(includeInactive),
    retry: false,
  });
}

export function useAdmissionConcessions(admissionId?: string) {
  return useQuery({
    queryKey: admissionConcessionsQueryKey(admissionId || ""),
    queryFn: () => concessionsApi.getAdmissionConcessions(admissionId!),
    enabled: Boolean(admissionId),
    retry: false,
  });
}
export function useAdmissionFeeConfiguration(admissionId?: string) { return useQuery({ queryKey: admissionFeeConfigurationQueryKey(admissionId || ""), queryFn: () => concessionsApi.getFeeConfiguration(admissionId!), enabled: Boolean(admissionId), retry: false }); }
export function useUpdateAdmissionFeeConfiguration(admissionId: string) { const client = useQueryClient(); return useMutation({ mutationFn: (selectedFeeComponentIds: string[]) => concessionsApi.updateFeeConfiguration(admissionId, selectedFeeComponentIds), onSuccess: async () => { await client.invalidateQueries({ queryKey: admissionFeeConfigurationQueryKey(admissionId) }); await client.invalidateQueries({ queryKey: admissionConcessionsQueryKey(admissionId) }); } }); }

export function useAssignAdmissionConcession(admissionId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateAdmissionConcessionPayload) =>
      concessionsApi.assignAdmissionConcession(admissionId, payload),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: admissionConcessionsQueryKey(admissionId) });
      client.invalidateQueries({ queryKey: ["admissions"] });
      client.invalidateQueries({ queryKey: admissionFeeConfigurationQueryKey(admissionId) });
    },
  });
}
export function useUpdateAdmissionConcession(admissionId: string) { const client = useQueryClient(); return useMutation({ mutationFn: ({ concessionId, payload }: { concessionId: string; payload: UpdateAdmissionConcessionPayload }) => concessionsApi.updateAdmissionConcession(admissionId, concessionId, payload), onSuccess: () => { client.invalidateQueries({ queryKey: admissionConcessionsQueryKey(admissionId) }); client.invalidateQueries({ queryKey: admissionFeeConfigurationQueryKey(admissionId) }); } }); }

export function useRemoveAdmissionConcession(admissionId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (concessionId: string) =>
      concessionsApi.removeAdmissionConcession(admissionId, concessionId),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: admissionConcessionsQueryKey(admissionId) });
      client.invalidateQueries({ queryKey: ["admissions"] });
      client.invalidateQueries({ queryKey: admissionFeeConfigurationQueryKey(admissionId) });
    },
  });
}
