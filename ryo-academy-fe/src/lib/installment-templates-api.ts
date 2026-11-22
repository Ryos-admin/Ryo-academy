import { useContext } from "react";
import { QueryClientContext, useQuery, type QueryClient } from "@tanstack/react-query";
import { apiClient } from "./api-client";
import { session } from "./session";
import { queryClient as defaultQueryClient } from "./query-client";

function useSafeQueryClient(customClient?: QueryClient): QueryClient {
  const contextClient = useContext(QueryClientContext);
  return customClient ?? contextClient ?? defaultQueryClient;
}

export type InstallmentCalculationType = "EQUAL_SPLIT" | "PERCENTAGE" | "FIXED_AMOUNT";

export interface InstallmentTemplateItemResponse {
  id: string;
  templateId: string;
  sequence: number;
  label: string;
  percentage: number | string | null;
  fixedAmount: number | string | null;
  dueDaysAfterAdmission: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface InstallmentTemplateResponse {
  id: string;
  schoolId: string;
  name: string;
  description: string | null;
  calculationType: InstallmentCalculationType;
  installmentCount: number;
  isActive: boolean;
  items: InstallmentTemplateItemResponse[];
  createdAt?: string;
  updatedAt?: string;
}

export const installmentTemplatesQueryKey = ["installment-templates"] as const;

const authOptions = () => {
  const token = session.getAccessToken();
  return token ? { token } : undefined;
};

export const installmentTemplatesApi = {
  list: (includeInactive?: boolean) => {
    const query = includeInactive ? "?includeInactive=true" : "";
    return apiClient.get<InstallmentTemplateResponse[]>(
      `/installment-templates${query}`,
      authOptions(),
    );
  },
};

export function useInstallmentTemplates(
  includeInactive?: boolean,
  customClient?: QueryClient,
) {
  const client = useSafeQueryClient(customClient);
  return useQuery(
    {
      queryKey: [...installmentTemplatesQueryKey, { includeInactive: Boolean(includeInactive) }],
      queryFn: () => installmentTemplatesApi.list(includeInactive),
      retry: false,
    },
    client,
  );
}
