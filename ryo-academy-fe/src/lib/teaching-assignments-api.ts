import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiClient } from "./api-client";
import { session } from "./session";

export interface TeachingAssignmentRelation { id: string; name?: string; firstName?: string; lastName?: string; staffCode?: string; }
export interface TeachingAssignmentResponse { id: string; staffId: string; subjectId: string; classId: string; sectionId: string; staff?: TeachingAssignmentRelation; subject?: TeachingAssignmentRelation; class?: TeachingAssignmentRelation; section?: TeachingAssignmentRelation; createdAt: string; updatedAt: string }
export interface TeachingAssignmentCreateRequest { staffId: string; subjectId: string; classId: string; sectionId: string }
export interface TeachingAssignmentUpdateRequest { subjectId?: string; classId?: string; sectionId?: string }
export const teachingAssignmentsQueryKey = ["teachingAssignments"] as const;
export const staffTeachingAssignmentsQueryKey = (staffId: string) => [...teachingAssignmentsQueryKey, "staff", staffId] as const;
export const myTeachingAssignmentsQueryKey = [...teachingAssignmentsQueryKey, "me"] as const;
const authOptions = () => { const token = session.getAccessToken(); return token ? { token } : undefined; };
export const teachingAssignmentsApi = {
  listTeachingAssignments: () => apiClient.get<TeachingAssignmentResponse[]>("/staff/assignments", authOptions()),
  listTeachingAssignmentsByStaff: (staffId: string) => apiClient.get<TeachingAssignmentResponse[]>(`/staff/${staffId}/teaching-assignments`, authOptions()),
  listMyTeachingAssignments: () => apiClient.get<TeachingAssignmentResponse[]>("/staff/me/teaching-assignments", authOptions()),
  createTeachingAssignment: (payload: TeachingAssignmentCreateRequest) => apiClient.post<TeachingAssignmentResponse>("/staff/assignments", payload, authOptions()),
  updateTeachingAssignment: (id: string, payload: TeachingAssignmentUpdateRequest) => apiClient.patch<TeachingAssignmentResponse>(`/staff/assignments/${id}`, payload, authOptions()),
  deleteTeachingAssignment: (id: string) => apiClient.delete<{ message: string }>(`/staff/assignments/${id}`, authOptions()),
};
export function useTeachingAssignments() { return useQuery({ queryKey: teachingAssignmentsQueryKey, queryFn: teachingAssignmentsApi.listTeachingAssignments, retry: false }); }
export function useTeachingAssignmentsByStaff(staffId?: string) { return useQuery({ queryKey: staffId ? staffTeachingAssignmentsQueryKey(staffId) : [...teachingAssignmentsQueryKey, "staff", "unselected"], queryFn: () => teachingAssignmentsApi.listTeachingAssignmentsByStaff(staffId!), enabled: Boolean(staffId), retry: false }); }
export function useMyTeachingAssignments() { return useQuery({ queryKey: myTeachingAssignmentsQueryKey, queryFn: teachingAssignmentsApi.listMyTeachingAssignments, retry: false }); }
export function useSaveTeachingAssignment(id?: string) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: (payload: TeachingAssignmentCreateRequest | TeachingAssignmentUpdateRequest) => id ? teachingAssignmentsApi.updateTeachingAssignment(id, payload as TeachingAssignmentUpdateRequest) : teachingAssignmentsApi.createTeachingAssignment(payload as TeachingAssignmentCreateRequest), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: teachingAssignmentsQueryKey }); } });
}
export function useDeleteTeachingAssignment() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: (id: string) => teachingAssignmentsApi.deleteTeachingAssignment(id), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: teachingAssignmentsQueryKey }); } });
}
export function teachingAssignmentErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof ApiError)) return fallback;
  if (error.status === 401) return "Your session has expired. Please sign in again.";
  if (error.status === 403) return "You do not have permission to manage teaching assignments.";
  if (error.status === 404) return "Teaching assignment not found.";
  if (error.status === 409) return "This teaching assignment conflicts with an existing record.";
  if (Array.isArray(error.backendMessage)) return error.backendMessage.join(" ");
  return error.backendMessage || fallback;
}
