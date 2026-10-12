// Fetch wrapper: adds auth and tenant headers, normalises API errors, and reports
// expired sessions so the app can send the user back to the login page.

export const API_BASE = "/api/v1";

const TOKEN_KEY = "wp.session.token";
const TENANT_KEY = "wp.session.tenant";

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable (private mode); the session then lasts for this tab only.
  }
}

let memoryToken: string | null = null;
let memoryTenant: string | null = null;

/** Persisted session credentials (token and current tenant). */
export const sessionStore = {
  getToken(): string | null {
    return memoryToken ?? read(TOKEN_KEY);
  },
  setToken(token: string | null): void {
    memoryToken = token;
    write(TOKEN_KEY, token);
  },
  getTenantId(): string | null {
    return memoryTenant ?? read(TENANT_KEY);
  },
  setTenantId(tenantId: string | null): void {
    memoryTenant = tenantId;
    write(TENANT_KEY, tenantId);
  },
  clear(): void {
    memoryToken = null;
    memoryTenant = null;
    write(TOKEN_KEY, null);
    // The tenant is kept so the same account is picked after signing back in.
  },
};

type UnauthorizedListener = () => void;
const unauthorizedListeners = new Set<UnauthorizedListener>();

/** Subscribe to "the session has expired" (a 401 on an authenticated request). */
export function onUnauthorized(listener: UnauthorizedListener): () => void {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly extra: unknown;
  /** Validation messages keyed by field name (from 422 responses). */
  readonly fieldErrors: Record<string, string>;

  constructor(
    status: number,
    message: string,
    code: string | null = null,
    extra: unknown = null,
    fieldErrors: Record<string, string> = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.extra = extra;
    this.fieldErrors = fieldErrors;
  }
}

interface ValidationIssue {
  loc?: (string | number)[];
  msg?: string;
  type?: string;
}

function humanizeField(name: string): string {
  const text = name.replace(/_/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function cleanMessage(msg: string): string {
  return msg.replace(/^Value error, /, "").replace(/^Assertion failed, /, "");
}

/** Turn any error body the API can produce into an ApiError. */
function toApiError(status: number, body: unknown, fallback: string): ApiError {
  if (body && typeof body === "object" && "detail" in body) {
    const { detail, code, extra } = body as { detail: unknown; code?: string; extra?: unknown };
    if (typeof detail === "string") {
      return new ApiError(status, detail, code ?? null, extra ?? null);
    }
    if (Array.isArray(detail)) {
      const fieldErrors: Record<string, string> = {};
      const messages = (detail as ValidationIssue[]).map((issue) => {
        const loc = (issue.loc ?? []).filter(
          (part) => part !== "body" && part !== "query" && part !== "path",
        );
        const field = [...loc].reverse().find((part): part is string => typeof part === "string");
        const msg = cleanMessage(issue.msg ?? "is invalid");
        if (field && !(field in fieldErrors)) fieldErrors[field] = msg;
        return field ? `${humanizeField(field)}: ${msg}` : msg;
      });
      const unique = [...new Set(messages)];
      const message =
        unique.length > 2 ? `${unique.slice(0, 2).join(". ")} (and ${unique.length - 2} more)` : unique.join(". ");
      return new ApiError(status, message || fallback, "validation_error", detail, fieldErrors);
    }
  }
  return new ApiError(status, fallback);
}

function fallbackMessage(status: number): string {
  if (status === 401) return "Please sign in to continue.";
  if (status === 403) return "You don't have permission to do that.";
  if (status === 404) return "We couldn't find that. It may have been deleted.";
  if (status === 413) return "That file is too large.";
  if (status >= 500) return "Something went wrong on our side. Please try again in a moment.";
  return `Request failed (${status}).`;
}

export type QueryParams = Record<string, string | number | boolean | null | undefined>;

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** JSON body. */
  body?: unknown;
  /** Multipart body (file uploads). */
  form?: FormData;
  query?: QueryParams;
  /** Send the bearer token and tenant header (default true). Public endpoints pass false. */
  auth?: boolean;
  signal?: AbortSignal;
}

export function buildUrl(path: string, query?: QueryParams): string {
  const url = path.startsWith("/api/") ? path : `${API_BASE}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const token = sessionStore.getToken();
  const tenant = sessionStore.getTenantId();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (tenant) headers["X-Tenant-ID"] = tenant;
  return headers;
}

async function send(path: string, options: RequestOptions, accept: string): Promise<Response> {
  const { method = "GET", body, form, query, auth = true, signal } = options;
  const headers: Record<string, string> = { Accept: accept };
  if (auth) Object.assign(headers, authHeaders());
  let payload: BodyInit | undefined;
  if (form) {
    payload = form;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), { method, headers, body: payload, signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError(0, "We couldn't reach the server. Check your connection and try again.", "network_error");
  }

  if (!response.ok) {
    let data: unknown = null;
    try {
      data = await response.json();
    } catch {
      // Non-JSON error (e.g. a proxy error page).
    }
    const error = toApiError(response.status, data, fallbackMessage(response.status));
    if (response.status === 401 && auth && headers.Authorization) {
      unauthorizedListeners.forEach((listener) => listener());
    }
    throw error;
  }
  return response;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await send(path, options, "application/json");
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const api = {
  get: <T>(path: string, query?: QueryParams, signal?: AbortSignal) =>
    request<T>(path, { query, signal }),
  post: <T>(path: string, body?: unknown, query?: QueryParams) =>
    request<T>(path, { method: "POST", body: body ?? {}, query }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body: body ?? {} }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: "PATCH", body }),
  delete: <T = void>(path: string, query?: QueryParams) =>
    request<T>(path, { method: "DELETE", query }),
  upload: <T>(path: string, file: File, field = "file") => {
    const form = new FormData();
    form.append(field, file);
    return request<T>(path, { method: "POST", form });
  },
};

/** Public (unauthenticated) endpoints used by wedding guests. */
export const publicApi = {
  get: <T>(path: string) => request<T>(path, { auth: false }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ?? {}, auth: false }),
};

function filenameFrom(disposition: string | null, fallback: string): string {
  if (!disposition) return fallback;
  const star = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(disposition);
  if (star) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ""));
    } catch {
      // fall through
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(disposition);
  return plain ? plain[1] : fallback;
}

/** Fetch an authenticated file (e.g. a CSV export) and save it. */
export async function downloadFile(path: string, fallbackName: string): Promise<void> {
  const response = await send(path, {}, "*/*");
  const blob = await response.blob();
  const name = filenameFrom(response.headers.get("Content-Disposition"), fallbackName);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A readable message for any thrown value. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "Something went wrong. Please try again.";
}

export function isApiError(error: unknown, status?: number): error is ApiError {
  return error instanceof ApiError && (status === undefined || error.status === status);
}

/** Public URL for an uploaded image. */
export const assetUrl = (assetId: string): string => `${API_BASE}/public/media/${assetId}`;
