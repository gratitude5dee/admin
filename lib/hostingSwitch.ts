/**
 * Client for the app-switch traffic director (workers/app-switch) bound to
 * app.wzrd.tech. The director reads a KV flag to choose whether requests to
 * app.wzrd.tech proxy to the airv2 Vercel origin or to the Cloudflare Workers
 * deployment; this flips it from the dashboard. Server-side only — the bearer
 * never reaches the browser.
 *
 * Envs: HOSTING_SWITCH_URL (default https://app.wzrd.tech), HOSTING_SWITCH_TOKEN.
 */

export type HostingTarget = "vercel" | "cloudflare";

export const HOSTING_TARGETS: readonly HostingTarget[] = [
  "vercel",
  "cloudflare",
];

export class HostingSwitchError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function switchUrl(): string {
  const base = process.env.HOSTING_SWITCH_URL ?? "https://app.wzrd.tech";
  return `${base.replace(/\/$/, "")}/_switch`;
}

function headers(): HeadersInit {
  const token = process.env.HOSTING_SWITCH_TOKEN;
  if (!token) {
    throw new HostingSwitchError(
      500,
      "HOSTING_SWITCH_TOKEN is not configured",
    );
  }
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
}

/** Current proxy target (defaults to "vercel" upstream-side when unset). */
export async function getHostingTarget(): Promise<HostingTarget> {
  const res = await fetch(switchUrl(), {
    headers: headers(),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as { target?: string };
  if (!res.ok) {
    throw new HostingSwitchError(
      res.status,
      `app-switch returned ${res.status}`,
    );
  }
  return body.target === "cloudflare" ? "cloudflare" : "vercel";
}

/** Flip the proxy target for app.wzrd.tech. */
export async function setHostingTarget(
  target: HostingTarget,
): Promise<HostingTarget> {
  const res = await fetch(switchUrl(), {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ target }),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as { target?: string };
  if (!res.ok) {
    throw new HostingSwitchError(
      res.status,
      `app-switch returned ${res.status}`,
    );
  }
  return body.target === "cloudflare" ? "cloudflare" : "vercel";
}
