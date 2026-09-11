import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiClient } from "./api-client";
import { session } from "./session";

export interface SectionResponse { id: string; name: string; classId: string; createdAt?: string; updatedAt?: string }
export interface SectionCreateRequest { name: string; classId: string }
export interface SectionUpdateRequest { name: string }
export const sectionsQueryKey = ["sections"] as const;
const authOptions = () => { const token = session.getAccessToken(); return token ? { token } : undefined; };
export const sectionsApi = {
  list: () => apiClient.get<SectionResponse[]>("/sections", authOptions()),
  listByClass: (classId: string) => apiClient.get<SectionResponse[]>(`/sections/${classId}`, authOptions()),
  create: (payload: SectionCreateRequest) => apiClient.post<SectionResponse | undefined>("/sections", payload, authOptions()),
  update: (id: string, payload: SectionUpdateRequest) => apiClient.patch<SectionResponse>(`/sections/${id}`, payload, authOptions()),
};
export function useSections() { return useQuery({ queryKey: sectionsQueryKey, queryFn: sectionsApi.list, retry: false }); }
export function useSectionsByClass(classId?: string) { return useQuery({ queryKey: [...sectionsQueryKey, classId], queryFn: () => sectionsApi.listByClass(classId!), enabled: Boolean(classId), retry: false }); }
export function useSaveSection(id?: string) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: (payload: SectionCreateRequest | SectionUpdateRequest) => id ? sectionsApi.update(id, payload as SectionUpdateRequest) : sectionsApi.create(payload as SectionCreateRequest), onSuccess: async (saved) => { if (saved?.id) queryClient.setQueryData([...sectionsQueryKey, saved.id], saved); await queryClient.invalidateQueries({ queryKey: sectionsQueryKey }); } });
}
export function sectionErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof ApiError)) return fallback;
  if (error.status === 401) return "Your session has expired. Please sign in again.";
  if (error.status === 403) return "You do not have permission to manage sections.";
  if (error.status === 404) return "Section not found.";
  if (error.status === 409) return "An academic section with this name already exists for the selected class.";
  if (Array.isArray(error.backendMessage)) return error.backendMessage.join(" ");
  const message = error.backendMessage.toLowerCase();
  if (message.includes("class") && message.includes("not found")) return "The selected class could not be found.";
  if (message.includes("already exists")) return "An academic section with this name already exists for the selected class.";
  return error.backendMessage || fallback;
}
