export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export type ApiErrorMessage = string | string[];

export interface ApiErrorBody {
  statusCode?: number;
  message?: ApiErrorMessage;
  error?: string;
  [key: string]: unknown;
}

export class ApiError extends Error {
  readonly status: number;
  readonly backendMessage: ApiErrorMessage;
  readonly backendError?: string;
  readonly body?: unknown;

  constructor(status: number, body?: unknown) {
    const normalized = isApiErrorBody(body) ? body : undefined;
    const message = normalized?.message ?? `Request failed with status ${status}`;

    super(Array.isArray(message) ? message.join(", ") : message);
    this.name = "ApiError";
    this.status = status;
    this.backendMessage = message;
    this.backendError = normalized?.error;
    this.body = body;
  }
}

export interface ApiRequestOptions extends Omit<RequestInit, "body" | "method"> {
  token?: string;
  body?: unknown;
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();

function resolveUrl(path: string) {
  if (!apiBaseUrl) {
    throw new Error("VITE_API_BASE_URL is not configured");
  }

  return new URL(path.replace(/^\/+/, ""), `${apiBaseUrl.replace(/\/+$/, "")}/`).toString();
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return typeof value === "object" && value !== null;
}

async function parseResponse(response: Response): Promise<unknown> {
  if (response.status === 204 || response.headers.get("content-length") === "0") {
    return undefined;
  }

  const text = await response.text();
  if (!text) return undefined;

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  }

  return text;
}

async function request<T>(method: HttpMethod, path: string, options: ApiRequestOptions = {}) {
  const { token, body, headers: requestHeaders, ...requestInit } = options;
  const headers = new Headers(requestHeaders);
  headers.set("Accept", "application/json");

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const hasBody = body !== undefined;
  if (hasBody) headers.set("Content-Type", "application/json");

  const response = await fetch(resolveUrl(path), {
    ...requestInit,
    method,
    headers,
    body: hasBody ? JSON.stringify(body) : undefined,
  });
  const payload = await parseResponse(response);

  if (!response.ok) {
    throw new ApiError(response.status, payload);
  }

  return payload as T;
}

export const apiClient = {
  get: <T>(path: string, options?: ApiRequestOptions) => request<T>("GET", path, options),
  post: <T>(path: string, body?: unknown, options?: ApiRequestOptions) => request<T>("POST", path, { ...options, body }),
  patch: <T>(path: string, body?: unknown, options?: ApiRequestOptions) => request<T>("PATCH", path, { ...options, body }),
  put: <T>(path: string, body?: unknown, options?: ApiRequestOptions) => request<T>("PUT", path, { ...options, body }),
  delete: <T>(path: string, options?: ApiRequestOptions) => request<T>("DELETE", path, options),
};
