import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiClient } from "./api-client";
import { session } from "./session";

export type DayType = "WORKING_DAY" | "WEEKEND" | "HOLIDAY" | "SPECIAL_WORKING_DAY";

export interface AcademicCalendarRecord {
  id: string;
  academicYearId: string;
  date: string;
  dayType: DayType;
  title: string;
  description?: string | null;
  isWorkingDay: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface AcademicCalendarQuery {
  academicYearId?: string;
  from?: string;
  to?: string;
  dayType?: DayType;
  isWorkingDay?: boolean;
}

export interface CreateAcademicCalendarRequest {
  academicYearId: string;
  date: string;
  dayType: DayType;
  title: string;
  description?: string;
  isWorkingDay: boolean;
}

export interface UpdateAcademicCalendarRequest {
  date?: string;
  dayType?: DayType;
  title?: string;
  description?: string;
  isWorkingDay?: boolean;
}

export const academicCalendarQueryKey = ["academicCalendar"] as const;
export const academicCalendarDetailQueryKey = (id: string) => [...academicCalendarQueryKey, id] as const;

function authOptions() {
  const token = session.getAccessToken();
  return token ? { token } : undefined;
}

function withQuery(path: string, query?: AcademicCalendarQuery) {
  const params = new URLSearchParams();
  if (query?.academicYearId) params.set("academicYearId", query.academicYearId);
  if (query?.from) params.set("from", query.from);
  if (query?.to) params.set("to", query.to);
  if (query?.dayType) params.set("dayType", query.dayType);
  if (query?.isWorkingDay !== undefined) params.set("isWorkingDay", String(query.isWorkingDay));
  const text = params.toString();
  return text ? `${path}?${text}` : path;
}

export const academicCalendarApi = {
  listAcademicCalendar: (query?: AcademicCalendarQuery) => apiClient.get<AcademicCalendarRecord[]>(withQuery("/academic-calendar", query), authOptions()),
  getAcademicCalendar: (id: string) => apiClient.get<AcademicCalendarRecord>(`/academic-calendar/${id}`, authOptions()),
  createAcademicCalendar: (payload: CreateAcademicCalendarRequest) => apiClient.post<AcademicCalendarRecord>("/academic-calendar", payload, authOptions()),
  updateAcademicCalendar: (id: string, payload: UpdateAcademicCalendarRequest) => apiClient.patch<AcademicCalendarRecord>(`/academic-calendar/${id}`, payload, authOptions()),
  deleteAcademicCalendar: (id: string) => apiClient.delete<AcademicCalendarRecord>(`/academic-calendar/${id}`, authOptions()),
};

export function useAcademicCalendar(query?: AcademicCalendarQuery) {
  return useQuery({
    queryKey: [...academicCalendarQueryKey, query],
    queryFn: () => academicCalendarApi.listAcademicCalendar(query),
    retry: false,
  });
}

export function useAcademicCalendarRecord(id?: string) {
  return useQuery({
    queryKey: academicCalendarDetailQueryKey(id || ""),
    queryFn: () => academicCalendarApi.getAcademicCalendar(id!),
    enabled: Boolean(id),
    retry: false,
  });
}

export function useSaveAcademicCalendar(id?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateAcademicCalendarRequest | UpdateAcademicCalendarRequest) =>
      id ? academicCalendarApi.updateAcademicCalendar(id, payload as UpdateAcademicCalendarRequest) : academicCalendarApi.createAcademicCalendar(payload as CreateAcademicCalendarRequest),
    onSuccess: async (saved) => {
      queryClient.setQueryData(academicCalendarDetailQueryKey(saved.id), saved);
      await queryClient.invalidateQueries({ queryKey: academicCalendarQueryKey });
    },
  });
}

export function useDeleteAcademicCalendar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => academicCalendarApi.deleteAcademicCalendar(id),
    onSuccess: async (_deleted, id) => {
      queryClient.removeQueries({ queryKey: academicCalendarDetailQueryKey(id) });
      await queryClient.invalidateQueries({ queryKey: academicCalendarQueryKey });
    },
  });
}

export function academicCalendarErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof ApiError)) return fallback;
  if (error.status === 401) return "Your session has expired. Please sign in again.";
  if (error.status === 403) return "You do not have permission to manage the academic calendar.";
  if (error.status === 404) return "Academic calendar record not found.";
  if (error.status === 409) return "A calendar record already exists for this academic year and date.";
  if (Array.isArray(error.backendMessage)) return error.backendMessage.join(" ");
  return error.backendMessage || fallback;
}
