import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  authApi,
  currentUserQueryKey,
  useAccessToken,
  useCurrentUser,
  useLogin,
  useLogout,
} from "@/lib/auth-api";
import { session } from "@/lib/session";

const wrapperFor = (client: QueryClient) => {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return Wrapper;
};

const createClient = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

const profile = {
  user: { id: "u-1", email: "a@b.c", firstName: "Ananya", lastName: "Rao" },
  roles: [{ id: "r-1", name: "OFFICE_ADMIN" }],
  permissions: ["ADMISSION_READ"],
};

describe("useLogin", () => {
  beforeEach(() => session.clear());
  afterEach(() => {
    vi.restoreAllMocks();
    session.clear();
  });

  it("stores the token from the response", async () => {
    vi.spyOn(authApi, "login").mockResolvedValue({
      accessToken: "jwt-abc",
      tokenType: "Bearer",
      expiresIn: 3600,
    });
    const client = createClient();

    const { result } = renderHook(() => useLogin(), { wrapper: wrapperFor(client) });
    await result.current.mutateAsync({ email: "a@b.c", password: "pw" });

    expect(session.getAccessToken()).toBe("jwt-abc");
  });

  it("invalidates the current-user query so the profile is refetched", async () => {
    vi.spyOn(authApi, "login").mockResolvedValue({
      accessToken: "jwt-abc",
      tokenType: "Bearer",
      expiresIn: 3600,
    });
    const client = createClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useLogin(), { wrapper: wrapperFor(client) });
    await result.current.mutateAsync({ email: "a@b.c", password: "pw" });

    expect(invalidate.mock.calls.map((c) => c[0].queryKey)).toContainEqual([
      ...currentUserQueryKey,
    ]);
  });
});

describe("useCurrentUser", () => {
  beforeEach(() => session.clear());
  afterEach(() => {
    vi.restoreAllMocks();
    session.clear();
  });

  it("stays disabled while there is no token", () => {
    const client = createClient();
    const { result } = renderHook(() => useCurrentUser(), { wrapper: wrapperFor(client) });
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("loads the profile from /protected/me once a token exists", async () => {
    session.setAccessToken("jwt-abc");
    const spy = vi.spyOn(authApi, "getAuthorizedUser").mockResolvedValue(profile);
    const client = createClient();

    const { result } = renderHook(() => useCurrentUser(), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(spy).toHaveBeenCalledWith("jwt-abc");
    expect(result.current.data?.permissions).toEqual(["ADMISSION_READ"]);
  });

  it("accepts a null profile (inactive user) without throwing", async () => {
    session.setAccessToken("jwt-abc");
    vi.spyOn(authApi, "getAuthorizedUser").mockResolvedValue(null);
    const client = createClient();

    const { result } = renderHook(() => useCurrentUser(), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toBeNull();
  });
});

describe("useAccessToken", () => {
  afterEach(() => session.clear());

  it("reflects the stored token and updates when it changes", () => {
    const { result } = renderHook(() => useAccessToken());
    expect(result.current).toBeNull();

    // session.setAccessToken notifies subscribers, which schedules a
    // re-render, so the assertions must be wrapped in act().
    act(() => session.setAccessToken("jwt-xyz"));
    expect(result.current).toBe("jwt-xyz");

    act(() => session.clear());
    expect(result.current).toBeNull();
  });

  it("exposes a subscribe function that detaches cleanly", () => {
    const unsubscribe = session.subscribe(() => {});
    expect(typeof unsubscribe).toBe("function");
    expect(() => unsubscribe()).not.toThrow();
  });
});

describe("useLogout", () => {
  beforeEach(() => {
    session.clear();
  });
  afterEach(() => session.clear());

  it("clears the session token", () => {
    session.setAccessToken("jwt-abc");
    const client = createClient();

    const { result } = renderHook(() => useLogout(), { wrapper: wrapperFor(client) });
    result.current();

    expect(session.getAccessToken()).toBeNull();
    expect(session.hasSession()).toBe(false);
  });

  it("drops cached server state so the next user cannot read it", () => {
    session.setAccessToken("jwt-abc");
    const client = createClient();
    // Simulate data cached for the signed-in user.
    client.setQueryData(["students"], [{ id: "s-1", studentName: "Private" }]);
    client.setQueryData(["fees"], [{ id: "f-1" }]);
    client.setQueryData(currentUserQueryKey, profile);

    const { result } = renderHook(() => useLogout(), { wrapper: wrapperFor(client) });
    result.current();

    // The previous user's domain data must not survive into the next session.
    expect(client.getQueryData(["students"])).toBeUndefined();
    expect(client.getQueryData(["fees"])).toBeUndefined();
    expect(client.getQueryData(currentUserQueryKey)).toBeUndefined();
    expect(client.getQueryCache().getAll()).toHaveLength(0);
  });
});
