import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiClient } from "./api-client";
import { session } from "./session";

export interface StaffResponse { id: string; staffCode: string; firstName: string; lastName: string; email: string; phoneNumber: string; dateOfBirth: string; status: boolean; userId: string; createdAt: string; updatedAt: string; teachingAssignments?: unknown[] }
export interface StaffCreateRequest { staffCode: string; firstName: string; lastName: string; email: string; phoneNumber: string; dateOfBirth: string }
export interface StaffUpdateRequest { staffCode: string; firstName: string; lastName: string; email: string; phoneNumber: string; dateOfBirth: string }
export const staffQueryKey = ["staff"] as const;
export const staffDetailQueryKey = (id: string) => [...staffQueryKey, id] as const;
const authOptions = () => { const token = session.getAccessToken(); return token ? { token } : undefined; };
export const staffApi = {
  listStaff: () => apiClient.get<StaffResponse[]>("/staff", authOptions()),
  getStaff: (id: string) => apiClient.get<StaffResponse>(`/staff/${id}`, authOptions()),
  createStaff: (payload: StaffCreateRequest) => apiClient.post<StaffResponse>("/staff", payload, authOptions()),
  updateStaff: (id: string, payload: StaffUpdateRequest) => apiClient.patch<StaffResponse>(`/staff/${id}`, payload, authOptions()),
  updateStaffStatus: (id: string, status: boolean) => apiClient.patch<StaffResponse>(`/staff/${id}/status`, { status }, authOptions()),
};
export function useStaff() { return useQuery({ queryKey: staffQueryKey, queryFn: staffApi.listStaff, retry: false }); }
export function useStaffMember(id?: string) { return useQuery({ queryKey: staffDetailQueryKey(id || ""), queryFn: () => staffApi.getStaff(id!), enabled: Boolean(id), retry: false }); }
export function useSaveStaff(id?: string) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: (payload: StaffCreateRequest | StaffUpdateRequest) => id ? staffApi.updateStaff(id, payload as StaffUpdateRequest) : staffApi.createStaff(payload as StaffCreateRequest), onSuccess: async (saved) => { queryClient.setQueryData(staffDetailQueryKey(saved.id), saved); await queryClient.invalidateQueries({ queryKey: staffQueryKey }); } });
}
export function useUpdateStaffStatus() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: ({ id, status }: { id: string; status: boolean }) => staffApi.updateStaffStatus(id, status), onSuccess: async (saved) => { queryClient.setQueryData(staffDetailQueryKey(saved.id), saved); await queryClient.invalidateQueries({ queryKey: staffQueryKey }); } });
}
export function staffErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof ApiError)) return fallback;
  if (error.status === 401) return "Your session has expired. Please sign in again.";
  if (error.status === 403) return "You do not have permission to manage Staff.";
  if (error.status === 404) return "Staff member not found.";
  if (error.status === 409) return Array.isArray(error.backendMessage) ? error.backendMessage.join(" ") : error.backendMessage || "A Staff conflict occurred.";
  if (Array.isArray(error.backendMessage)) return error.backendMessage.join(" ");
  return error.backendMessage || fallback;
}
