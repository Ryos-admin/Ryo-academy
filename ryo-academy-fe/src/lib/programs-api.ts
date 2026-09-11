import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiClient } from "./api-client";
import { session } from "./session";

export type WeekdayCode = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";
export type WeekdayName = "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday" | "Sunday";

export interface ProgramResponse {
  id: string;
  name: string;
  academicYearId: string;
  isPrimary: boolean;
  daysOfWeek: WeekdayCode[];
  startTime: string;
  endTime: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProgramRequest {
  name: string;
  academicYear: string;
  isPrimary: boolean;
  daysOfWeek: WeekdayCode[];
  startTime: string;
  endTime: string;
}

export interface ProgramUpdateRequest {
  name: string;
  isPrimary: boolean;
  daysOfWeek: WeekdayCode[];
  startTime: string;
  endTime: string;
}

export interface ProgramViewModel {
  id: string;
  name: string;
  academicYearId: string;
  academicYear: string;
  primary: boolean;
  daysOfWeek: WeekdayName[];
  startTime: string;
  endTime: string;
}

export const programsQueryKey = ["programs"] as const;

const weekdayNames: Record<WeekdayCode, WeekdayName> = {
  MON: "Monday", TUE: "Tuesday", WED: "Wednesday", THU: "Thursday",
  FRI: "Friday", SAT: "Saturday", SUN: "Sunday",
};
const weekdayCodes = Object.fromEntries(Object.entries(weekdayNames).map(([code, name]) => [name, code])) as Record<WeekdayName, WeekdayCode>;

export function toWeekdayCodes(value: string) {
  return value.split(",").map((day) => day.trim()).filter(Boolean).map((day) => weekdayCodes[day as WeekdayName]).filter((day): day is WeekdayCode => Boolean(day));
}

export function toWeekdayNames(values: WeekdayCode[]) {
  return values.map((value) => weekdayNames[value]).filter((value): value is WeekdayName => Boolean(value));
}

export function toProgramViewModel(program: ProgramResponse, academicYearName = "—"): ProgramViewModel {
  return { id: program.id, name: program.name, academicYearId: program.academicYearId, academicYear: academicYearName ?? "—", primary: program.isPrimary, daysOfWeek: toWeekdayNames(program.daysOfWeek), startTime: program.startTime, endTime: program.endTime };
}

function authOptions() {
  const token = session.getAccessToken();
  return token ? { token } : undefined;
}

export const programsApi = {
  list: () => apiClient.get<ProgramResponse[]>("/programs", authOptions()),
  get: (id: string) => apiClient.get<ProgramResponse>(`/programs/${id}`, authOptions()),
  create: (payload: ProgramRequest) => apiClient.post<ProgramResponse>("/programs", payload, authOptions()),
  update: (id: string, payload: ProgramUpdateRequest) => apiClient.patch<ProgramResponse>(`/programs/${id}`, payload, authOptions()),
};

export function usePrograms() {
  return useQuery({ queryKey: programsQueryKey, queryFn: programsApi.list, retry: false });
}

export function useProgram(id?: string) {
  return useQuery({ queryKey: [...programsQueryKey, id], queryFn: () => programsApi.get(id!), enabled: Boolean(id), retry: false });
}

export function useSaveProgram(id?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ProgramRequest | ProgramUpdateRequest) => id ? programsApi.update(id, payload as ProgramUpdateRequest) : programsApi.create(payload as ProgramRequest),
    onSuccess: async (saved) => {
      queryClient.setQueryData([...programsQueryKey, saved.id], saved);
      await queryClient.invalidateQueries({ queryKey: programsQueryKey });
    },
  });
}

export function programErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof ApiError)) return fallback;
  if (error.status === 401) return "Your session has expired. Please sign in again.";
  if (error.status === 403) return "You do not have permission to manage academic programs.";
  if (error.status === 404) return "Academic program not found.";
  if (error.status === 409) return "An academic program with this name already exists for the selected academic year.";
  if (Array.isArray(error.backendMessage)) return error.backendMessage.join(" ");
  if (error.backendMessage.includes("not found")) return "Selected academic year could not be found.";
  return error.backendMessage || fallback;
}
