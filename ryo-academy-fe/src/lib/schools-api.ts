import { apiClient } from "./api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccessToken } from "./auth-api";
import { session } from "./session";

export interface SchoolConfigurationResponse {
  schoolId: string;
  schoolName: string;
  schoolCode: string;
  activeAcademicYearId: string | null;
  activeAcademicYear: {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
    isActive: boolean;
  } | null;
  isConfigured: boolean;
  isInvalid: boolean;
}

export interface UpdateSchoolConfigurationDto {
  activeAcademicYearId: string;
}

export const schoolConfigQueryKey = ["schools", "configuration"] as const;

export const schoolsApi = {
  getConfiguration: (token?: string) => {
    const auth = token ?? session.getAccessToken();
    return apiClient.get<SchoolConfigurationResponse>(
      "/schools/configuration",
      auth ? { token: auth } : undefined,
    );
  },
  updateConfiguration: (data: UpdateSchoolConfigurationDto, token?: string) => {
    const auth = token ?? session.getAccessToken();
    // console.log("req", data);

    return apiClient.patch<SchoolConfigurationResponse>(
      "/schools/configuration",
      data,
      auth ? { token: auth } : undefined,
    );
  },
};

export function useSchoolConfiguration() {
  const token = useAccessToken();
  const activeToken = token ?? session.getAccessToken();
  return useQuery<SchoolConfigurationResponse>({
    queryKey: schoolConfigQueryKey,
    queryFn: () => schoolsApi.getConfiguration(activeToken ?? undefined),
    enabled: Boolean(activeToken),
    staleTime: 60_000,
    retry: false,
  });
}

export function useUpdateSchoolConfiguration() {
  const token = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateSchoolConfigurationDto) => {
      const activeToken = token ?? session.getAccessToken();
      return schoolsApi.updateConfiguration(data, activeToken ?? undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: schoolConfigQueryKey });
      queryClient.invalidateQueries({ queryKey: ["fee-management", "dashboard"] });
    },
  });
}
