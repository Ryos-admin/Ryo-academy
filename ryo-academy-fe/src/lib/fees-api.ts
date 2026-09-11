import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiClient } from "./api-client";
import { session } from "./session";

export interface FeeComponentResponse {
  id: string;
  name: string;
  description?: string | null;
  amount: number | string;
  isMandatory: boolean;
  discountApplicable: boolean;
  isActive: boolean;
  feeStructureId: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface FeeStructureResponse {
  id: string;
  name: string;
  description?: string | null;
  totalAmount: number | string;
  isActive: boolean;
  academicYearId: string;
  programId: string;
  classId: string;
  academicYear?: { id: string; name: string };
  program?: { id: string; name: string };
  class?: { id: string; name: string };
  feeComponents: FeeComponentResponse[];
  createdAt?: string;
  updatedAt?: string;
}

export interface FeeComponentCreateRequest {
  name: string;
  description?: string | null;
  amount: number;
  feeStructureId: string;
  discountApplicable?: boolean;
  isMandatory?: boolean;
}

export interface FeeComponentUpdateRequest {
  name?: string;
  description?: string | null;
  amount?: number;
  discountApplicable?: boolean;
  isMandatory?: boolean;
}

export interface FeeComponentInputRequest {
  name: string;
  description?: string | null;
  amount: number;
  discountApplicable?: boolean;
  isMandatory?: boolean;
}

export interface FeeStructureCreateRequest {
  name: string;
  description: string;
  academicYearId: string;
  programId: string;
  classId: string;
  totalAmount: number;
  feeComponents: FeeComponentInputRequest[];
}

export interface FeeStructureUpdateRequest {
  name?: string;
  description?: string;
  totalAmount?: number;
  isActive?: boolean;
}

export const feeStructuresQueryKey = ["feeStructures"] as const;
export const feeComponentsQueryKey = ["feeComponents"] as const;

function authOptions() {
  const token = session.getAccessToken();
  return token ? { token } : undefined;
}

export const feesApi = {
  listStructures: () => apiClient.get<FeeStructureResponse[]>("/fee-structure-master", authOptions()),
  getStructure: (id: string) => apiClient.get<FeeStructureResponse>(`/fee-structure-master/${id}`, authOptions()),
  createStructure: (payload: FeeStructureCreateRequest) => apiClient.post<FeeStructureResponse>("/fee-structure-master", payload, authOptions()),
  updateStructure: (id: string, payload: FeeStructureUpdateRequest) => apiClient.patch<FeeStructureResponse>(`/fee-structure-master/${id}`, payload, authOptions()),
  deleteStructure: (id: string) => apiClient.delete<FeeStructureResponse>(`/fee-structure-master/${id}`, authOptions()),
  listComponents: () => apiClient.get<FeeComponentResponse[]>("/fee-structure-child", authOptions()),
  getComponent: (id: string) => apiClient.get<FeeComponentResponse>(`/fee-structure-child/${id}`, authOptions()),
  createComponent: (payload: FeeComponentCreateRequest) => apiClient.post<FeeComponentResponse>("/fee-structure-child", payload, authOptions()),
  updateComponent: (id: string, payload: FeeComponentUpdateRequest) => apiClient.put<FeeComponentResponse>(`/fee-structure-child/${id}`, payload, authOptions()),
  deleteComponent: (id: string) => apiClient.delete<FeeComponentResponse>(`/fee-structure-child/${id}`, authOptions()),
};

export function useFeeStructures() {
  return useQuery({
    queryKey: feeStructuresQueryKey,
    queryFn: feesApi.listStructures,
    retry: false,
  });
}

export function useFeeStructure(id?: string) {
  return useQuery({
    queryKey: [...feeStructuresQueryKey, id],
    queryFn: () => feesApi.getStructure(id!),
    enabled: Boolean(id),
    retry: false,
  });
}

export function useFeeComponents() {
  return useQuery({
    queryKey: feeComponentsQueryKey,
    queryFn: feesApi.listComponents,
    retry: false,
  });
}

export function useFeeComponent(id?: string) {
  return useQuery({
    queryKey: [...feeComponentsQueryKey, id],
    queryFn: () => feesApi.getComponent(id!),
    enabled: Boolean(id),
    retry: false,
  });
}

export function useCreateFeeStructure() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: feesApi.createStructure,
    onSuccess: async (saved) => {
      queryClient.setQueryData([...feeStructuresQueryKey, saved.id], saved);
      await queryClient.invalidateQueries({ queryKey: feeStructuresQueryKey });
      await queryClient.invalidateQueries({ queryKey: feeComponentsQueryKey });
    },
  });
}

export function useUpdateFeeStructure() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: FeeStructureUpdateRequest }) => feesApi.updateStructure(id, payload),
    onSuccess: async (saved) => {
      queryClient.setQueryData([...feeStructuresQueryKey, saved.id], saved);
      await queryClient.invalidateQueries({ queryKey: feeStructuresQueryKey });
      await queryClient.invalidateQueries({ queryKey: feeComponentsQueryKey });
    },
  });
}

export function useDeactivateFeeStructure() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => feesApi.deleteStructure(id),
    onSuccess: async (_, id) => {
      queryClient.removeQueries({ queryKey: [...feeStructuresQueryKey, id] });
      await queryClient.invalidateQueries({ queryKey: feeStructuresQueryKey });
      await queryClient.invalidateQueries({ queryKey: feeComponentsQueryKey });
    },
  });
}

export function useCreateFeeComponent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: feesApi.createComponent,
    onSuccess: async (saved) => {
      queryClient.setQueryData([...feeComponentsQueryKey, saved.id], saved);
      await queryClient.invalidateQueries({ queryKey: feeComponentsQueryKey });
      await queryClient.invalidateQueries({ queryKey: feeStructuresQueryKey });
    },
  });
}

export function useUpdateFeeComponent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: FeeComponentUpdateRequest }) => feesApi.updateComponent(id, payload),
    onSuccess: async (saved) => {
      queryClient.setQueryData([...feeComponentsQueryKey, saved.id], saved);
      await queryClient.invalidateQueries({ queryKey: feeComponentsQueryKey });
      await queryClient.invalidateQueries({ queryKey: feeStructuresQueryKey });
    },
  });
}

export function useDeactivateFeeComponent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => feesApi.deleteComponent(id),
    onSuccess: async (_, id) => {
      queryClient.removeQueries({ queryKey: [...feeComponentsQueryKey, id] });
      await queryClient.invalidateQueries({ queryKey: feeComponentsQueryKey });
      await queryClient.invalidateQueries({ queryKey: feeStructuresQueryKey });
    },
  });
}

export function feeErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof ApiError)) return fallback;
  if (error.status === 401) return "Your session has expired. Please sign in again.";
  if (error.status === 403) return "You do not have permission to update fee configuration.";
  if (error.status === 404) return "The requested fee record was not found.";
  if (error.status === 409) return "The fee record conflicts with existing configuration.";
  if (Array.isArray(error.backendMessage)) return error.backendMessage.join(" ");
  return error.backendMessage || fallback;
}

export function feeAmount(value: number | string) {
  return Number(value);
}
