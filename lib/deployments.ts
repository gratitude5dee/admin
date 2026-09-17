/**
 * Pure helpers for the Deployments page (goal.md §3.1): dev-release expiry,
 * build / test / QA accents, pattern-guarded app URLs, the per-channel fleet
 * summary, the A1 content-field guard and the A6 reconciliation between
 * /api/admin/deployments totals and the Create funnel. No I/O and no
 * server-only import, so the client-side action component can share the
 * action-route mapping. Metadata only.
 */
import {
  boxDrift,
  countBy,
  formatDuration,
  type Drift,
  type FleetBox,
} from "./fleet";
import type {
  CreateOpsResponse,
  DeploymentsResponse,
  FleetChannel,
  FleetRelease,
  FleetSyncJob,
} from "./types";

export type DeploymentRow = DeploymentsResponse["rows"][number];
export type BuildStatus = NonNullable<DeploymentRow["last_build"]>["status"];

/** Same vocabulary as components/panel.tsx StatAccent. */
export type Accent = "green" | "blue" | "purple" | "orange" | "pink" | "none";

export const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;
/** A dev release with fewer days than this left reads orange (§3.1). */
export const EXPIRING_SOON_DAYS = 3;

/** airv2 apps/web/lib/settings/account.ts USERNAME_PATTERN — no hyphens. */
export const USERNAME_PATTERN = /^[a-z0-9_]{2,24}$/;
/** airv2 apps/web/lib/miniapps/publish.ts APPNAME_PATTERN — inner hyphens only. */
export const APPNAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;
/** Slug accepted by /api/deployments/apps/[slug]/* (goal.md §4). */
export const APP_SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export type AppHost = "link.wzrd.tech" | "mini.wzrd.tech";

export function isAppSlug(slug: string): boolean {
  return APP_SLUG_PATTERN.test(slug);
}

/**
 * `https://<host>/<u>/<a>`, but only when both parts pass the airv2 patterns.
 * A username or appname the control plane would never have accepted (a
 * hyphenated username, a path segment, uppercase) yields null rather than an
 * anchor assembled from untrusted text.
 */
export function appUrl(
  host: AppHost,
  username: string | null,
  appname: string | null
): string | null {
  if (!username || !appname) return null;
  if (!USERNAME_PATTERN.test(username) || !APPNAME_PATTERN.test(appname)) {
    return null;
  }
  return `https://${host}/${username}/${appname}`;
}

export interface DevExpiry {
  label: string;
  accent: Accent;
}

/**
 * How long a dev release has left: hours under a day, whole days otherwise;
 * orange under EXPIRING_SOON_DAYS, pink once expired, "—" when there is no
 * expiry to report.
 */
export function devExpiry(expiresAt: string | null, now: number): DevExpiry {
  if (!expiresAt) return { label: "—", accent: "none" };
  const at = Date.parse(expiresAt);
  if (Number.isNaN(at)) return { label: "—", accent: "none" };
  const remaining = at - now;
  if (remaining <= 0) return { label: "expired", accent: "pink" };
  if (remaining < DAY_MS) {
    const hours = Math.max(1, Math.ceil(remaining / HOUR_MS));
    return { label: `expires in ${hours}h`, accent: "orange" };
  }
  return {
    label: `expires in ${Math.floor(remaining / DAY_MS)}d`,
    accent: remaining < EXPIRING_SOON_DAYS * DAY_MS ? "orange" : "green",
  };
}

export function buildAccent(status: BuildStatus | null | undefined): Accent {
  switch (status) {
    case "succeeded":
      return "green";
    case "failed":
      return "pink";
    case "running":
    case "queued":
      return "blue";
    default:
      return "none";
  }
}

/** `passed/total` reads pink whenever the two differ; no tests, no accent. */
export function testsAccent(passed: number, total: number): Accent {
  if (total <= 0) return "none";
  return passed === total ? "green" : "pink";
}

export function qaAccent(score: number | null): Accent {
  if (score === null) return "none";
  return score < 70 ? "pink" : "green";
}

export function statusAccent(status: DeploymentRow["status"]): Accent {
  switch (status) {
    case "published":
      return "green";
    case "suspended":
      return "pink";
    default:
      return "blue";
  }
}

export function functionsAccent(
  status: DeploymentRow["functions_status"]
): Accent {
  switch (status) {
    case "live":
      return "green";
    case "suspended":
      return "pink";
    case "draft":
      return "blue";
    default:
      return "none";
  }
}

export function jobStateAccent(state: FleetSyncJob["state"]): Accent {
  if (state === "done") return "green";
  if (state === "failed" || state === "aborted") return "pink";
  if (state === "paused") return "orange";
  return "blue";
}

/** "3h 0m ago" / "in 2m 0s" for an ISO timestamp; null when absent or unparseable. */
export function ago(iso: string | null | undefined, now: number): string | null {
  if (!iso) return null;
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return null;
  return at <= now
    ? `${formatDuration(now - at)} ago`
    : `in ${formatDuration(at - now)}`;
}

/**
 * A1 (C4): field names that would carry content rather than metadata. No
 * endpoint used here returns them, but a row is stripped of them before it
 * reaches the renderer so a future payload cannot leak through.
 */
export const CONTENT_FIELDS = [
  "prompt",
  "plan",
  "source",
  "body",
  "message",
] as const;
export type ContentField = (typeof CONTENT_FIELDS)[number];

export function stripContentFields<T extends object>(
  row: T
): Omit<T, ContentField> {
  const copy = { ...row } as Record<string, unknown>;
  for (const field of CONTENT_FIELDS) delete copy[field];
  return copy as Omit<T, ContentField>;
}

export interface Reconciliation {
  prod_live: number;
  production: number;
  matches: boolean;
}

/**
 * A6: the Deployments count of production apps must equal the Create
 * funnel's `production` count for the same window.
 */
export function reconcileCounts(
  deployments: Pick<DeploymentsResponse, "apps">,
  create: Pick<CreateOpsResponse, "funnel">
): Reconciliation {
  const prodLive = deployments.apps.prod_live;
  const production = create.funnel.production;
  return { prod_live: prodLive, production, matches: prodLive === production };
}

/** Sync-job states that still own the channel (the Fleet page's ACTIVE_STATES). */
export const ACTIVE_JOB_STATES: ReadonlySet<FleetSyncJob["state"]> = new Set([
  "canary",
  "rolling",
  "paused",
]);

/** Display order for per-channel drift counts. */
export const DRIFT_ORDER: readonly Drift[] = [
  "current",
  "behind",
  "hermes behind",
  "unsynced",
  "no target",
];

export type ChannelBox = Pick<
  FleetBox,
  "provider_box_id" | "channel" | "baseline_version" | "template_version"
>;

export interface ChannelSummary {
  channel: FleetChannel;
  /** The release the channel points at, when /fleet/releases knows it. */
  release: FleetRelease | null;
  /** Fleet boxes (rows with a provider box) following this channel. */
  boxes: number;
  drift: Partial<Record<Drift, number>>;
  /** The newest sync job still owning this channel, if any. */
  job: FleetSyncJob | null;
}

/**
 * Per-channel view for the Fleet channels table: release pointer, boxes on
 * the channel with their drift against it, and the active sync job. Boxes
 * without a channel follow prod, as on the Fleet page; `jobs` is newest-first
 * as /api/admin/fleet/sync serves it.
 */
export function summarizeChannels(
  channels: readonly FleetChannel[],
  releases: readonly FleetRelease[],
  boxes: readonly ChannelBox[],
  jobs: readonly FleetSyncJob[]
): ChannelSummary[] {
  const releaseById = new Map(releases.map((release) => [release.id, release]));
  return channels.map((channel) => {
    const release = channel.release_id
      ? (releaseById.get(channel.release_id) ?? null)
      : null;
    const onChannel = boxes.filter(
      (box) => box.provider_box_id && (box.channel ?? "prod") === channel.name
    );
    return {
      channel,
      release,
      boxes: onChannel.length,
      drift: countBy(onChannel, (box) => boxDrift(box, release)) as Partial<
        Record<Drift, number>
      >,
      job:
        jobs.find(
          (job) => job.channel === channel.name && ACTIVE_JOB_STATES.has(job.state)
        ) ?? null,
    };
  });
}

export type AppAction = "revoke" | "renew" | "suspend";

export const APP_ACTIONS: readonly { action: AppAction; label: string }[] = [
  { action: "revoke", label: "revoke dev" },
  { action: "renew", label: "renew dev" },
  { action: "suspend", label: "suspend" },
];

/**
 * Same-origin proxy route and form fields for an action (goal.md §4):
 * revoke/renew post `action=` to .../dev, suspend posts an empty form to
 * .../suspend. The route re-validates the slug server-side.
 */
export function actionRoute(
  slug: string,
  action: AppAction
): { path: string; fields: Record<string, string> } {
  const base = `/api/deployments/apps/${encodeURIComponent(slug)}`;
  return action === "suspend"
    ? { path: `${base}/suspend`, fields: {} }
    : { path: `${base}/dev`, fields: { action } };
}
