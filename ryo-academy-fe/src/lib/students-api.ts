import { useQuery } from "@tanstack/react-query";
import { ApiError, apiClient } from "./api-client";
import { session } from "./session";

export interface StudentResponse {
  id: string;
  studentName: string;
  studentNumber: string;
  studentSequence: number;
  admissionId: string;
  gender: string;
  dateOfBirth: string;
  createdAt: string;
  updatedAt: string;
  admission: { id: string; schoolId: string; academicYearId: string; programId: string; classId: string; sectionId: string };
}

export const studentsQueryKey = ["students"] as const;
const authOptions = () => { const token = session.getAccessToken(); return token ? { token } : undefined; };

export const studentsApi = {
  list: () => apiClient.get<StudentResponse[]>("/students", authOptions()),
  get: (id: string) => apiClient.get<StudentResponse>(`/students/${id}`, authOptions()),
};

export function useStudents() { return useQuery({ queryKey: studentsQueryKey, queryFn: studentsApi.list, retry: false }); }
export function useStudent(id?: string) { return useQuery({ queryKey: [...studentsQueryKey, id], queryFn: () => studentsApi.get(id!), enabled: Boolean(id), retry: false }); }
export function studentErrorMessage(error: unknown, fallback: string) { if (!(error instanceof ApiError)) return fallback; if (error.status === 401) return "Your session has expired. Please sign in again."; if (error.status === 403) return "You do not have permission to view students."; if (error.status === 404) return "Student not found."; if (Array.isArray(error.backendMessage)) return error.backendMessage.join(" "); return error.backendMessage || fallback; }
