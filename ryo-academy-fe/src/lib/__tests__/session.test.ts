import { beforeEach, describe, expect, it, vi } from "vitest";
import { session } from "@/lib/session";

const TOKEN_KEY = "ryo-academy-access-token";
const EXPIRY_KEY = "ryo-academy-access-token-expires-at";

describe("session", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("starts with no session", () => {
    expect(session.getAccessToken()).toBeNull();
    expect(session.hasSession()).toBe(false);
  });

  it("stores the access token", () => {
    session.setAccessToken("abc123");
    expect(localStorage.getItem(TOKEN_KEY)).toBe("abc123");
    expect(session.getAccessToken()).toBe("abc123");
    expect(session.hasSession()).toBe(true);
  });

  it("records an absolute expiry when expiresIn is supplied", () => {
    const before = Date.now();
    session.setAccessToken("abc123", 3600);
    const stored = Number(localStorage.getItem(EXPIRY_KEY));
    expect(stored).toBeGreaterThanOrEqual(before + 3600 * 1000);
    expect(stored).toBeLessThanOrEqual(Date.now() + 3600 * 1000);
  });

  it("removes any previous expiry when expiresIn is omitted", () => {
    session.setAccessToken("abc123", 3600);
    expect(localStorage.getItem(EXPIRY_KEY)).not.toBeNull();
    session.setAccessToken("abc123");
    expect(localStorage.getItem(EXPIRY_KEY)).toBeNull();
  });

  it("clears both keys", () => {
    session.setAccessToken("abc123", 3600);
    session.clear();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(EXPIRY_KEY)).toBeNull();
    expect(session.hasSession()).toBe(false);
  });

  it("notifies subscribers on set and clear", () => {
    const listener = vi.fn();
    const unsubscribe = session.subscribe(listener);

    session.setAccessToken("abc123");
    expect(listener).toHaveBeenCalledTimes(1);

    session.clear();
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    session.setAccessToken("again");
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("notifies every subscriber", () => {
    const first = vi.fn();
    const second = vi.fn();
    const offFirst = session.subscribe(first);
    const offSecond = session.subscribe(second);

    session.setAccessToken("abc123");
    expect(first).toHaveBeenCalled();
    expect(second).toHaveBeenCalled();

    offFirst();
    offSecond();
  });
});
