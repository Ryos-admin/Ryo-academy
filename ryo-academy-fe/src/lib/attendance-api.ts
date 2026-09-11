import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiClient } from "./api-client";
import { session } from "./session";

export type AttendanceMasterStatus = "DRAFT" | "SUBMITTED";
export type StudentAttendanceStatus = "PRESENT" | "ABSENT";

export interface AttendanceChildResponse {
  id: string;
  attendanceMasterId: string;
  studentId: string;
  status: StudentAttendanceStatus;
  remarks?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AttendanceRegisterResponse {
  id: string;
  academicYearId: string;
  classId: string;
  sectionId: string;
  date: string;
  takenBy: string;
  status: AttendanceMasterStatus;
  submittedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  children: AttendanceChildResponse[];
}

export interface AttendanceQuery {
  academicYearId?: string;
  classId?: string;
  sectionId?: string;
  date?: string;
  from?: string;
  to?: string;
}

export interface AttendanceEntryRequest {
  studentId: string;
  status: StudentAttendanceStatus;
  remarks?: string;
}

export interface CreateAttendanceRequest {
  academicYearId: string;
  classId: string;
  sectionId: string;
  date: string;
  entries: AttendanceEntryRequest[];
}

export interface UpdateAttendanceRequest {
  entries?: AttendanceEntryRequest[];
}

export const attendanceQueryKey = ["attendance"] as const;
export const attendanceDetailQueryKey = (id: string) => [...attendanceQueryKey, id] as const;

function authOptions() {
  const token = session.getAccessToken();
  return token ? { token } : undefined;
}

function withQuery(path: string, query?: AttendanceQuery) {
  const params = new URLSearchParams();
  if (query?.academicYearId) params.set("academicYearId", query.academicYearId);
  if (query?.classId) params.set("classId", query.classId);
  if (query?.sectionId) params.set("sectionId", query.sectionId);
  if (query?.date) params.set("date", query.date);
  if (query?.from) params.set("from", query.from);
  if (query?.to) params.set("to", query.to);
  const text = params.toString();
  return text ? `${path}?${text}` : path;
}

export const attendanceApi = {
  list: (query?: AttendanceQuery) => apiClient.get<AttendanceRegisterResponse[]>(withQuery("/attendance", query), authOptions()),
  listMine: (query?: AttendanceQuery) => apiClient.get<AttendanceRegisterResponse[]>(withQuery("/attendance/my", query), authOptions()),
  get: (id: string) => apiClient.get<AttendanceRegisterResponse>(`/attendance/${id}`, authOptions()),
  create: (payload: CreateAttendanceRequest) => apiClient.post<AttendanceRegisterResponse>("/attendance", payload, authOptions()),
  update: (id: string, payload: UpdateAttendanceRequest) => apiClient.patch<AttendanceRegisterResponse>(`/attendance/${id}`, payload, authOptions()),
  submit: (id: string) => apiClient.post<AttendanceRegisterResponse>(`/attendance/${id}/submit`, undefined, authOptions()),
  delete: (id: string) => apiClient.delete<AttendanceRegisterResponse>(`/attendance/${id}`, authOptions()),
};

export function useAttendance(query?: AttendanceQuery, mine = false) {
  return useQuery({
    queryKey: [...attendanceQueryKey, mine ? "my" : "all", query],
    queryFn: () => (mine ? attendanceApi.listMine(query) : attendanceApi.list(query)),
    retry: false,
  });
}

export function useAttendanceRecord(id?: string) {
  return useQuery({
    queryKey: attendanceDetailQueryKey(id || ""),
    queryFn: () => attendanceApi.get(id!),
    enabled: Boolean(id),
    retry: false,
  });
}

function invalidateAttendance(queryClient: ReturnType<typeof useQueryClient>, id?: string) {
  const listInvalidation = queryClient.invalidateQueries({ queryKey: attendanceQueryKey });
  if (!id) return listInvalidation;
  return Promise.all([listInvalidation, queryClient.invalidateQueries({ queryKey: attendanceDetailQueryKey(id) })]);
}

export function useCreateAttendance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: attendanceApi.create,
    onSuccess: async (saved) => {
      queryClient.setQueryData(attendanceDetailQueryKey(saved.id), saved);
      await invalidateAttendance(queryClient);
    },
  });
}

export function useUpdateAttendance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateAttendanceRequest }) => attendanceApi.update(id, payload),
    onSuccess: async (saved) => {
      queryClient.setQueryData(attendanceDetailQueryKey(saved.id), saved);
      await invalidateAttendance(queryClient, saved.id);
    },
  });
}

export function useSubmitAttendance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: attendanceApi.submit,
    onSuccess: async (saved) => {
      queryClient.setQueryData(attendanceDetailQueryKey(saved.id), saved);
      await invalidateAttendance(queryClient, saved.id);
    },
  });
}

export function useDeleteAttendance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: attendanceApi.delete,
    onSuccess: async (_deleted, id) => {
      queryClient.removeQueries({ queryKey: attendanceDetailQueryKey(id) });
      await invalidateAttendance(queryClient, id);
    },
  });
}

export function attendanceErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof ApiError)) return fallback;
  if (error.status === 401) return "Your session has expired. Please sign in again.";
  if (error.status === 403) return Array.isArray(error.backendMessage) ? error.backendMessage.join(" ") : error.backendMessage || "You are not allowed to access this attendance register.";
  if (error.status === 404) return "Attendance register not found.";
  if (error.status === 409) return Array.isArray(error.backendMessage) ? error.backendMessage.join(" ") : error.backendMessage || "This attendance register cannot be changed in its current state.";
  if (Array.isArray(error.backendMessage)) return error.backendMessage.join(" ");
  return error.backendMessage || fallback;
}
