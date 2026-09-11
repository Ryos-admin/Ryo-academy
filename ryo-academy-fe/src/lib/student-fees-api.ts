import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiClient } from "./api-client";
import { session } from "./session";

export interface StudentFeeComponentResponse {
  id: string;
  feeComponentId: string;
  nameSnapshot: string;
  originalAmount: number | string;
  discountApplicable: boolean;
  isMandatory: boolean;
  discountAmount: number | string;
  finalAmount: number | string;
  totalAmountToBePaid: number | string;
  amountPaid: number | string;
  amountOutstanding: number | string;
  paymentDate: string | null;
}

export interface StudentFeeResponse {
  student: {
    id: string;
    studentNumber: string;
    studentName: string;
  };
  admission: {
    id: string;
    admissionNumber: string;
    admissionStatus: string;
  };
  fee: {
    id: string;
    academicYearId: string;
    feeStructureId: string;
    totalAmount: number | string;
    paidAmount: number | string;
    outstandingAmount: number | string;
    components: StudentFeeComponentResponse[];
  } | null;
  payments: Array<{
    id: string;
    paymentDate: string | null;
    amount: number | string;
    createdAt: string;
  }>;
}

export interface CreateStudentFeePaymentRequest {
  amount: number;
  paymentDate?: string;
}

export const studentFeesQueryKey = ["student-fees"] as const;

function authOptions() {
  const token = session.getAccessToken();
  return token ? { token } : undefined;
}

export const studentFeesApi = {
  get: (studentId: string) => apiClient.get<StudentFeeResponse>(`/students/${studentId}/fees`, authOptions()),
  createPayment: (studentId: string, payload: CreateStudentFeePaymentRequest) => apiClient.post<StudentFeeResponse>(`/students/${studentId}/fees/payments`, payload, authOptions()),
};

export function useStudentFees(studentId?: string) {
  return useQuery({
    queryKey: [...studentFeesQueryKey, studentId || ""],
    queryFn: () => studentFeesApi.get(studentId!),
    enabled: Boolean(studentId),
    retry: false,
  });
}

export function useRecordStudentFeePayment(studentId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateStudentFeePaymentRequest) => studentFeesApi.createPayment(studentId, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [...studentFeesQueryKey, studentId] });
      await queryClient.invalidateQueries({ queryKey: ["students"] });
    },
  });
}

export function studentFeesErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof ApiError)) return fallback;
  if (error.status === 401) return "Your session has expired. Please sign in again.";
  if (error.status === 403) return "You do not have permission to record student fee payments.";
  if (error.status === 404) return "The requested student fee snapshot was not found.";
  if (Array.isArray(error.backendMessage)) return error.backendMessage.join(" ");
  return error.backendMessage || fallback;
}
