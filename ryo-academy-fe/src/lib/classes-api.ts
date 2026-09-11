import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiClient } from "./api-client";
import { session } from "./session";

export interface ClassResponse { id: string; name: string; programId: string; createdAt?: string; updatedAt?: string }
export interface ClassCreateRequest { name: string; programId: string }
export interface ClassUpdateRequest { name: string }
export const classesQueryKey = ["classes"] as const;
const authOptions = () => { const token = session.getAccessToken(); return token ? { token } : undefined; };
export const classesApi = {
  list: () => apiClient.get<ClassResponse[]>("/classes", authOptions()),
  get: (id: string) => apiClient.get<ClassResponse>(`/classes/${id}`, authOptions()),
  create: (payload: ClassCreateRequest) => apiClient.post<ClassResponse>("/classes", payload, authOptions()),
  update: (id: string, payload: ClassUpdateRequest) => apiClient.patch<ClassResponse>(`/classes/${id}`, payload, authOptions()),
};
export function useClasses() { return useQuery({ queryKey: classesQueryKey, queryFn: classesApi.list, retry: false }); }
export function useClass(id?: string) { return useQuery({ queryKey: [...classesQueryKey, id], queryFn: () => classesApi.get(id!), enabled: Boolean(id), retry: false }); }
export function useSaveClass(id?: string) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: (payload: ClassCreateRequest | ClassUpdateRequest) => id ? classesApi.update(id, payload as ClassUpdateRequest) : classesApi.create(payload as ClassCreateRequest), onSuccess: async (saved) => { queryClient.setQueryData([...classesQueryKey, saved.id], saved); await queryClient.invalidateQueries({ queryKey: classesQueryKey }); } });
}
export function classErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof ApiError)) return fallback;
  if (error.status === 401) return "Your session has expired. Please sign in again.";
  if (error.status === 403) return "You do not have permission to manage classes.";
  if (error.status === 404) return "Class not found.";
  if (error.status === 409) return "An academic class with this name already exists for the selected program.";
  if (Array.isArray(error.backendMessage)) return error.backendMessage.join(" ");
  const message = error.backendMessage.toLowerCase();
  if (message.includes("program") && message.includes("not found")) return "The selected program could not be found.";
  if (message.includes("already exists")) return "An academic class with this name already exists for the selected program.";
  return error.backendMessage || fallback;
}
