import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const jsonResponse = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });

const fetchMock = vi.fn();

async function loadClient() {
  vi.resetModules();
  return (await import("@/lib/api-client")).apiClient;
}

describe("api-client", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves the configured base URL and strips leading slashes", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    const api = await loadClient();

    await api.get("/programs");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("http://api.test/programs");
  });

  it("sends Accept: application/json", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    const api = await loadClient();

    await api.get("/programs");

    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get("Accept")).toBe("application/json");
  });

  it("attaches a Bearer token only when one is provided", async () => {
    // A Response body can only be read once, so hand out a fresh one per call.
    fetchMock.mockImplementation(async () => jsonResponse({}));
    const api = await loadClient();

    await api.get("/programs", { token: "jwt-123" });
    expect(
      (fetchMock.mock.calls[0][1].headers as Headers).get("Authorization"),
    ).toBe("Bearer jwt-123");

    await api.get("/programs");
    expect(
      (fetchMock.mock.calls[1][1].headers as Headers).get("Authorization"),
    ).toBeNull();
  });

  it("serialises a JSON body and sets Content-Type", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: "p1" }, { status: 201 }));
    const api = await loadClient();

    const result = await api.post("/programs", { name: "Morning" });

    const init = fetchMock.mock.calls[0][1];
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ name: "Morning" }));
    expect((init.headers as Headers).get("Content-Type")).toBe(
      "application/json",
    );
    expect(result).toEqual({ id: "p1" });
  });

  it("does not set Content-Type when there is no body", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    const api = await loadClient();

    await api.delete("/programs/p1");

    const init = fetchMock.mock.calls[0][1];
    expect(init.body).toBeUndefined();
    expect((init.headers as Headers).get("Content-Type")).toBeNull();
  });

  it("returns undefined for 204 No Content", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const api = await loadClient();

    await expect(api.delete("/programs/p1")).resolves.toBeUndefined();
  });

  it("returns undefined when content-length is 0", async () => {
    fetchMock.mockResolvedValue(
      new Response("", {
        status: 200,
        headers: { "content-length": "0" },
      }),
    );
    const api = await loadClient();

    await expect(api.get("/programs")).resolves.toBeUndefined();
  });

  it("falls back to raw text when the body is not JSON", async () => {
    fetchMock.mockResolvedValue(
      new Response("plain text", {
        status: 200,
        headers: { "content-type": "text/plain" },
      }),
    );
    const api = await loadClient();

    await expect(api.get("/programs")).resolves.toBe("plain text");
  });

  it("falls back to raw text when the JSON is malformed", async () => {
    fetchMock.mockResolvedValue(
      new Response("{not json", {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const api = await loadClient();

    await expect(api.get("/programs")).resolves.toBe("{not json");
  });

  describe("ApiError", () => {
    it("throws with the HTTP status and a joined message array", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ message: ["a is too short", "b is invalid"] }, { status: 400 }),
      );
      const api = await loadClient();

      await expect(api.post("/programs", {})).rejects.toMatchObject({
        name: "ApiError",
        status: 400,
        message: "a is too short, b is invalid",
        backendMessage: ["a is too short", "b is invalid"],
      });
    });

    it("keeps a single string message intact", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ message: "Conflict" }, { status: 409 }),
      );
      const api = await loadClient();

      await expect(api.post("/programs", {})).rejects.toMatchObject({
        status: 409,
        backendMessage: "Conflict",
      });
    });

    it("surfaces the top-level error field", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ error: "Internal", message: "Boom" }, { status: 500 }),
      );
      const api = await loadClient();

      await expect(api.get("/programs")).rejects.toMatchObject({
        status: 500,
        backendError: "Internal",
      });
    });

    it("synthesises a message when the body has none", async () => {
      fetchMock.mockResolvedValue(new Response("", { status: 500 }));
      const api = await loadClient();

      await expect(api.get("/programs")).rejects.toMatchObject({
        status: 500,
        message: "Request failed with status 500",
      });
    });
  });

  it("throws a configuration error when VITE_API_BASE_URL is missing", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "");
    const api = await loadClient();

    await expect(api.get("/programs")).rejects.toThrow(
      "VITE_API_BASE_URL is not configured",
    );
  });
});
