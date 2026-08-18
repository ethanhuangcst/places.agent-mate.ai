export class AdminApiError extends Error {
  readonly key: string;
  readonly status: number;

  constructor(key: string, status: number) {
    super(key);
    this.name = "AdminApiError";
    this.key = key;
    this.status = status;
  }
}

export function errorKeyFromBody(
  body: unknown,
  fallback = "errors.session_expired",
): string {
  if (body && typeof body === "object" && "error" in body) {
    const err = (body as { error?: { key?: unknown } }).error;
    if (err && typeof err.key === "string" && err.key.length > 0) {
      return err.key;
    }
  }
  return fallback;
}

export async function adminJson<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(url, {
    credentials: "include",
    ...init,
    headers,
  });
  const body: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new AdminApiError(errorKeyFromBody(body), res.status);
  }
  return body as T;
}

export type SessionResponse = {
  id?: string;
  name: string | null;
  email?: string;
  mustSetPassword?: boolean;
};

export type ApiKeyRow = {
  id: string;
  name: string;
  description: string;
  prefix: string;
  status: string;
  issued: string;
};

export type ApiKeyDetail = {
  id: string;
  name: string;
  description: string;
  prefix: string;
  status: string;
};

export type ApiKeySecretPayload = {
  id: string;
  name?: string;
  prefix: string;
  secret: string;
};

export type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  status: string;
};
