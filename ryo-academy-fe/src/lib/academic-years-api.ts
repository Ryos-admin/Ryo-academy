import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient, ApiError } from "./api-client";
import { session } from "./session";

export interface AcademicYear {
  id: string;
  schoolId: string;
  name: string;
  startDate: string;
  endDate: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateAcademicYearRequest {
  schoolId: string;
  name: string;
  startDate: string;
  endDate: string;
}

export interface UpdateAcademicYearRequest {
  name?: string;
  startDate?: string;
  endDate?: string;
}

export const academicYearsQueryKey = ["academicYears"] as const;

export function dateOnly(value: string) {
  return value.slice(0, 10);
}

function authOptions() {
  const token = session.getAccessToken();
  return token ? { token } : undefined;
}

export const academicYearsApi = {
  list: () => apiClient.get<AcademicYear[]>("/academic-years", authOptions()),
  get: (id: string) => apiClient.get<AcademicYear>(`/academic-years/${id}`, authOptions()),
  create: (payload: CreateAcademicYearRequest) => apiClient.post<AcademicYear>("/academic-years", payload, authOptions()),
  update: (id: string, payload: UpdateAcademicYearRequest) => apiClient.patch<AcademicYear>(`/academic-years/${id}`, payload, authOptions()),
};

export function useAcademicYears() {
  return useQuery({
    queryKey: academicYearsQueryKey,
    queryFn: academicYearsApi.list,
    retry: false,
  });
}

export function useAcademicYear(id?: string) {
  return useQuery({
    queryKey: [...academicYearsQueryKey, id],
    queryFn: () => academicYearsApi.get(id!),
    enabled: Boolean(id),
    retry: false,
  });
}

export function useSaveAcademicYear(id?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateAcademicYearRequest | UpdateAcademicYearRequest) =>
      id ? academicYearsApi.update(id, payload as UpdateAcademicYearRequest) : academicYearsApi.create(payload as CreateAcademicYearRequest),
    onSuccess: async (saved) => {
      queryClient.setQueryData([...academicYearsQueryKey, saved.id], saved);
      await queryClient.invalidateQueries({ queryKey: academicYearsQueryKey });
    },
  });
}

export function academicYearErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof ApiError)) return fallback;
  if (error.status === 401) return "Your session has expired. Please sign in again.";
  if (error.status === 403) return "You do not have permission to manage academic years.";
  if (error.status === 404) return "Academic year not found.";
  if (error.status === 409) return "An academic year with this school and name already exists.";
  if (Array.isArray(error.backendMessage)) return error.backendMessage.join(" ");
  return error.backendMessage || fallback;
}
