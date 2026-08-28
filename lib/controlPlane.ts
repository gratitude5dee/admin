/**
 * Server-only client for the airv2 control-plane admin APIs. ADMIN_API_KEY
 * and CONTROL_PLANE_URL are plain (non-NEXT_PUBLIC_) env vars: every call
 * happens in a server component or route handler and the bearer key never
 * reaches the browser. All responses are metadata/receipts only (C4).
 */
import "server-only";

export class ControlPlaneError extends Error {
  constructor(
    public readonly status: number,
    public readonly path: string,
    message?: string
  ) {
    super(message ?? `control plane ${status} on ${path}`);
  }
}

function baseUrl(): string {
  const url = process.env.CONTROL_PLANE_URL;
  if (!url) throw new Error("CONTROL_PLANE_URL is not configured");
  return url.replace(/\/$/, "");
}

function apiKey(): string {
  const key = process.env.ADMIN_API_KEY;
  if (!key) throw new Error("ADMIN_API_KEY is not configured");
  return key;
}

export async function adminFetch(path: string): Promise<Response> {
  return fetch(`${baseUrl()}${path}`, {
    headers: { Authorization: `Bearer ${apiKey()}` },
    cache: "no-store",
  });
}

export async function adminSend<T>(
  path: string,
  method: "POST" | "PATCH",
  body: Record<string, unknown>
): Promise<T> {
  const response = await fetch(`${baseUrl()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!response.ok) {
    let message = `control plane returned ${response.status}`;
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload.error) message = payload.error;
    } catch {
      // non-JSON error body — keep the status message
    }
    throw new ControlPlaneError(response.status, path, message);
  }
  const text = await response.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined as T;
  }
}

export async function adminGet<T>(path: string): Promise<T> {
  const response = await adminFetch(path);
  if (!response.ok) throw new ControlPlaneError(response.status, path);
  return (await response.json()) as T;
}

/** Same read, but panels render an inline error instead of crashing. */
export async function adminGetSafe<T>(
  path: string
): Promise<{ data: T; error: null } | { data: null; error: string }> {
  try {
    return { data: await adminGet<T>(path), error: null };
  } catch (cause) {
    const message =
      cause instanceof ControlPlaneError
        ? `control plane returned ${cause.status}`
        : cause instanceof Error
          ? cause.message
          : "control plane unreachable";
    return { data: null, error: message };
  }
}
