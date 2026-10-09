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

/**
 * Shape returned by GET /protected/me (see ProtectedService.getUserById).
 * `roles` is a real array of the user's roles, and `permissions` is the
 * flattened, de-duplicated list of effective permissions across all of them,
 * already normalised to the frontend naming convention ("subject:read" ->
 * "SUBJECT_READ").
 *
 * The endpoint returns `null` for unknown or inactive users.
 */
export interface CurrentUser {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    schoolId: string | null;
  } | null;
  roles: { id: string; name: string }[];
  permissions: string[];
}

export const authApi = {
  login: (request: LoginRequest) => apiClient.post<LoginResponse>("/auth/login", request),
  getCurrentUser: (token: string) => apiClient.get<CurrentUser>("/auth/me", { token }),
  getAuthorizedUser: (token: string) => apiClient.get<CurrentUser | null>("/protected/me", { token }),
};

export const currentUserQueryKey = ["auth", "me"] as const;

export function useAccessToken() {
  return useSyncExternalStore(session.subscribe, session.getAccessToken, () => null);
}

export function useCurrentUser() {
  const token = useAccessToken();
  return useQuery<CurrentUser | null>({
    queryKey: currentUserQueryKey,
    queryFn: async () => {
      try {
        return await authApi.getAuthorizedUser(token!);
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
    // Drop every cached server response first, so the next person to sign in on
    // this tab cannot read the previous user's data from memory. Session state
    // (the token) is cleared immediately after.
    queryClient.clear();
    session.clear();
  };
}
