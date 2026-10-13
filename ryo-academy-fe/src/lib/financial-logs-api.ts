import { useQuery } from '@tanstack/react-query';
import { apiClient } from './api-client';
import { session } from './session';

export type FinancialFlowType = 'INCOME' | 'EXPENSE';
export type FinancialSourceType = 'FEE_PAYMENT' | 'EXPENSE';
export interface FinancialLogRow { id: string; type: string; flowType: FinancialFlowType; amount: number | string; occurredAt: string; description?: string | null; sourceType: FinancialSourceType; sourceId: string; createdAt: string; }
export interface FinancialLogResponse { data: FinancialLogRow[]; page: number; pageSize: number; total: number; totalPages: number; summary: { income: number | string; expenses: number | string; net: number | string }; }
export interface FinancialLogFilters { from?: string; to?: string; flowType?: string; sourceType?: string; page?: number; pageSize?: number; }
export const financialLogsQueryKey = ['financial-logs'] as const;
const authOptions = () => { const token = session.getAccessToken(); return token ? { token } : undefined; };
export const financialLogsApi = { list: (filters: FinancialLogFilters = {}) => { const params = new URLSearchParams(); Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, String(value)); }); return apiClient.get<FinancialLogResponse>(`/financial-logs?${params.toString()}`, authOptions()); } };
export function useFinancialLogs(filters: FinancialLogFilters) { return useQuery({ queryKey: [...financialLogsQueryKey, filters], queryFn: () => financialLogsApi.list(filters), retry: false }); }
