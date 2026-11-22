import { apiClient } from './api-client';
import { useQuery } from '@tanstack/react-query';
import { useAccessToken } from './auth-api';
import { session } from './session';

export interface FeeDashboardItem {
  id: string;
  admissionNumber: string;
  admissionSequence: number;
  admissionStatus: 'CONFIRMED' | string;
  studentName: string;
  program?: { id: string; name: string } | null;
  class?: { id: string; name: string } | null;
  section?: { id: string; name: string } | null;
  student?: { id: string; studentNumber: string; studentName: string } | null;
  confirmedAt?: string | null;
  createdAt: string;
}

export interface FeeDashboardResponse {
  configured: boolean;
  invalidConfiguration: boolean;
  activeAcademicYear: {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
  } | null;
  data: FeeDashboardItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface FeeDashboardQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  classId?: string;
  programId?: string;
}

export const feeDashboardQueryKey = (params: FeeDashboardQuery) =>
  ['fee-management', 'dashboard', params] as const;

export const feeDashboardApi = {
  getDashboard: (params: FeeDashboardQuery = {}, token?: string) => {
    const searchParams = new URLSearchParams();
    if (params.page !== undefined && params.page > 0) searchParams.set('page', String(params.page));
    if (params.pageSize !== undefined && params.pageSize > 0) searchParams.set('pageSize', String(params.pageSize));
    if (params.search && params.search.trim().length > 0) searchParams.set('search', params.search.trim());
    if (params.classId) searchParams.set('classId', params.classId);
    if (params.programId) searchParams.set('programId', params.programId);

    const queryStr = searchParams.toString();
    const endpoint = `/fee-management/dashboard${queryStr ? `?${queryStr}` : ''}`;
    const auth = token ?? session.getAccessToken();
    return apiClient.get<FeeDashboardResponse>(
      endpoint,
      auth ? { token: auth } : undefined,
    );
  },
};

export function useFeeDashboard(params: FeeDashboardQuery = {}, enabled = true) {
  const token = useAccessToken();
  const activeToken = token ?? session.getAccessToken();

  return useQuery<FeeDashboardResponse>({
    queryKey: feeDashboardQueryKey(params),
    queryFn: () => feeDashboardApi.getDashboard(params, activeToken ?? undefined),
    enabled: Boolean(activeToken) && enabled,
    staleTime: 30_000,
    retry: false,
  });
}
