/**
 * Pure helpers for the Fleet page: per-box drift against the channel's
 * release and claim-lease math for in-flight sync rows. Mirrors the
 * semantics of airv2 apps/web/lib/fleet/sync.ts; metadata only.
 */
import type { BoxesResponse, FleetRelease, FleetSyncJobBox } from "./types";

export type FleetBox = BoxesResponse["users"][number];

/** Job-box rows that keep the job alive. */
export const OPEN_BOX_STATES = new Set(["pending", "syncing", "deferred"]);

/**
 * airv2 resets a `syncing` claim back to `pending` only once it is older than
 * the sweep route's maxDuration (800s) + the longest single box command
 * (600s) + a 60s margin. Below that a long-running claim is normal, not stuck.
 */
export const CLAIM_LEASE_MS = (800 + 600 + 60) * 1000;

export type Drift =
  | "current"
  | "behind"
  | "hermes behind"
  | "unsynced"
  | "no target";

export function boxDrift(
  box: Pick<FleetBox, "baseline_version" | "template_version">,
  target: FleetRelease | null
): Drift {
  if (!target) return "no target";
  if (!box.baseline_version) return "unsynced";
  if (box.baseline_version !== target.version) return "behind";
  if (target.hermes_ref && box.template_version !== target.hermes_ref) {
    return "hermes behind";
  }
  return "current";
}

export function driftAccent(
  drift: Drift
): "green" | "orange" | "pink" | "blue" | "none" {
  switch (drift) {
    case "current":
      return "green";
    case "behind":
    case "hermes behind":
      return "orange";
    case "unsynced":
      return "pink";
    default:
      return "none";
  }
}

export function countBy<T>(
  rows: readonly T[],
  key: (row: T) => string
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) {
    const k = key(row);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

export function shortRef(ref: string | null | undefined): string | null {
  if (!ref) return null;
  return /^[0-9a-f]{40}$/i.test(ref) ? ref.slice(0, 7) : ref;
}

export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

/**
 * How long a job-box row has been claimed, and whether it has outlived the
 * lease (at which point the next sweep will reclaim it). Only `syncing` rows
 * hold a claim; everything else reports null.
 */
export function claimAge(
  row: Pick<FleetSyncJobBox, "state" | "started_at">,
  now: number
): { label: string; expired: boolean } | null {
  if (row.state !== "syncing" || !row.started_at) return null;
  const started = new Date(row.started_at).getTime();
  if (Number.isNaN(started)) return null;
  const age = now - started;
  return {
    label: `${formatDuration(age)} ago`,
    expired: age > CLAIM_LEASE_MS,
  };
}

/** Wall-clock a finished row took, from claim to completion. */
export function rowDuration(
  row: Pick<FleetSyncJobBox, "started_at" | "finished_at">
): string | null {
  if (!row.started_at || !row.finished_at) return null;
  const ms =
    new Date(row.finished_at).getTime() - new Date(row.started_at).getTime();
  return Number.isNaN(ms) ? null : formatDuration(ms);
}
