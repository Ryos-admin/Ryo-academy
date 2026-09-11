import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiClient } from "./api-client";
import { session } from "./session";

export interface SubjectResponse { id: string; name: string; classId: string; isDeleted: boolean; createdAt: string; updatedAt: string }
export interface SubjectCreateRequest { classId: string; name: string }
export interface SubjectUpdateRequest { name: string }
export const subjectsQueryKey = ["subjects"] as const;
export const subjectDetailQueryKey = (id: string) => [...subjectsQueryKey, "detail", id] as const;
export const classSubjectsQueryKey = (classId: string) => [...subjectsQueryKey, classId] as const;
const authOptions = () => { const token = session.getAccessToken(); return token ? { token } : undefined; };

export const subjectsApi = {
  listSubjectsByClass: (classId: string) => apiClient.get<SubjectResponse[]>(`/classes/${classId}/subjects`, authOptions()),
  getSubject: (id: string) => apiClient.get<SubjectResponse>(`/subjects/${id}`, authOptions()),
  createSubject: (payload: SubjectCreateRequest) => apiClient.post<SubjectResponse>("/subjects", payload, authOptions()),
  updateSubject: (id: string, payload: SubjectUpdateRequest) => apiClient.patch<SubjectResponse>(`/subjects/${id}`, payload, authOptions()),
  deleteSubject: (id: string) => apiClient.delete<SubjectResponse>(`/subjects/${id}`, authOptions()),
};

export function useSubjectsByClass(classId?: string) { return useQuery({ queryKey: classId ? classSubjectsQueryKey(classId) : [...subjectsQueryKey, "unselected"], queryFn: () => subjectsApi.listSubjectsByClass(classId!), enabled: Boolean(classId), retry: false }); }
export function useSubject(id?: string) { return useQuery({ queryKey: subjectDetailQueryKey(id || ""), queryFn: () => subjectsApi.getSubject(id!), enabled: Boolean(id), retry: false }); }
export function useSaveSubject(id?: string) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: (payload: SubjectCreateRequest | SubjectUpdateRequest) => id ? subjectsApi.updateSubject(id, payload as SubjectUpdateRequest) : subjectsApi.createSubject(payload as SubjectCreateRequest), onSuccess: async (saved) => { queryClient.setQueryData(subjectDetailQueryKey(saved.id), saved); await queryClient.invalidateQueries({ queryKey: subjectsQueryKey }); } });
}
export function useDeleteSubject() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: ({ id }: { id: string; classId?: string }) => subjectsApi.deleteSubject(id), onSuccess: async (_deleted, variables) => { queryClient.removeQueries({ queryKey: subjectDetailQueryKey(variables.id) }); await queryClient.invalidateQueries({ queryKey: subjectsQueryKey }); } });
}
export function subjectErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof ApiError)) return fallback;
  if (error.status === 401) return "Your session has expired. Please sign in again.";
  if (error.status === 403) return "You do not have permission to manage subjects.";
  if (error.status === 404) return "Subject not found.";
  if (error.status === 409) return "A subject with this name already exists for the selected class.";
  if (Array.isArray(error.backendMessage)) return error.backendMessage.join(" ");
  return error.backendMessage || fallback;
}
