import { ApiError, apiClient } from "./api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { session } from "./session";

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  tokenType: "Bearer" | string;
  expiresIn: number;
}

// The backend currently returns only the JWT subject from /auth/me.
export interface CurrentUser {
  userId: string;
}

export const authApi = {
  login: (request: LoginRequest) => apiClient.post<LoginResponse>("/auth/login", request),
  getCurrentUser: (token: string) => apiClient.get<CurrentUser>("/auth/me", { token }),
};

export const currentUserQueryKey = ["auth", "me"] as const;

export function useAccessToken() {
  return useSyncExternalStore(session.subscribe, session.getAccessToken, () => null);
}

export function useCurrentUser() {
  const token = useAccessToken();
  return useQuery({
    queryKey: currentUserQueryKey,
    queryFn: async () => {
      try {
        return await authApi.getCurrentUser(token!);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          session.clear();
        }
        throw error;
      }
    },
    enabled: Boolean(token),
    retry: false,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: authApi.login,
    onSuccess: async (response) => {
      session.setAccessToken(response.accessToken, response.expiresIn);
      await queryClient.invalidateQueries({ queryKey: currentUserQueryKey });
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return () => {
    session.clear();
    queryClient.removeQueries({ queryKey: currentUserQueryKey });
  };
}
