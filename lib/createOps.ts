/**
 * Pure helpers for the Create page (goal.md §3.2): intake stage order,
 * failure ratios and the accents they earn, percentage and median
 * formatting, and the A1 guard that drops content-named fields before
 * render. Everything here works on counts, medians and rule ids only —
 * airv2 goal-create-v12 §12 fixes the /api/admin/create payload.
 */
import { formatDuration } from "./fleet";
import type { CreateOpsResponse } from "./types";

export type FunnelStage = keyof CreateOpsResponse["funnel"];
export type Accent = "green" | "orange" | "pink" | "blue" | "purple" | "none";

/**
 * Intake stages in pipeline order (goal-create-v12 §5.1 state machine):
 * the owner is asked, a plan is drafted and sent, confirmed (after any
 * revisions), built, QA'd and tested onto the dev link, finalized, and
 * approved into production.
 */
export const PIPELINE_STAGES = [
  "asking",
  "planning",
  "plan_sent",
  "revising",
  "confirmed",
  "building",
  "qa",
  "testing",
  "dev_ready",
  "finalizing",
  "decision_sent",
  "production",
] as const satisfies readonly FunnelStage[];

/** Terminal exits that leave the pipeline (not funnel steps). */
export const EXIT_STAGES = ["failed", "abandoned"] as const satisfies readonly FunnelStage[];

export const FUNNEL_STAGES = [...PIPELINE_STAGES, ...EXIT_STAGES] as const;

/** Builds are alarming once more than this share of them failed. */
export const BUILD_FAILURE_THRESHOLD = 0.1;
/** platform.md §Operations: progress relay update failures > 5% of ticks. */
export const RELAY_FAILURE_THRESHOLD = 0.05;
/** Publish gate (CR22): a QA score under this blocks production. */
export const QA_GATE = 70;

/** Bars for the funnel chart: every pipeline stage, in order, zero-filled. */
export function funnelBars(
  funnel: Partial<Record<FunnelStage, number>>
): { label: string; value: number }[] {
  return PIPELINE_STAGES.map((stage) => ({
    label: stage,
    value: funnel[stage] ?? 0,
  }));
}

/** Intakes still moving through the pipeline (everything before production). */
export function openIntakes(
  funnel: Partial<Record<FunnelStage, number>>
): number {
  return PIPELINE_STAGES.filter((stage) => stage !== "production").reduce(
    (sum, stage) => sum + (funnel[stage] ?? 0),
    0
  );
}

/** numerator / denominator, or null when there is nothing to divide by. */
export function ratio(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return null;
  if (denominator <= 0) return null;
  return numerator / denominator;
}

export function buildFailureRatio(
  builds: Pick<CreateOpsResponse["builds"], "failed" | "total">
): number | null {
  return ratio(builds.failed, builds.total);
}

/**
 * Share of progress-card ticks that could not update the card. Text
 * fallbacks are not failures — the card was still refreshed, as a line.
 */
export function relayFailureRatio(
  relay: Pick<CreateOpsResponse["progress_relay"], "cards_updated" | "update_failures">
): number | null {
  return ratio(
    relay.update_failures,
    relay.cards_updated + relay.update_failures
  );
}

function overThreshold(
  value: number | null,
  threshold: number,
  accent: Accent
): Accent {
  return value !== null && value > threshold ? accent : "none";
}

/** Pink once failed builds exceed 10% of the total. */
export function buildFailedAccent(
  builds: Pick<CreateOpsResponse["builds"], "failed" | "total">
): Accent {
  return overThreshold(buildFailureRatio(builds), BUILD_FAILURE_THRESHOLD, "pink");
}

/** Pink once relay update failures exceed 5% of ticks. */
export function relayAccent(
  relay: Pick<CreateOpsResponse["progress_relay"], "cards_updated" | "update_failures">
): Accent {
  return overThreshold(relayFailureRatio(relay), RELAY_FAILURE_THRESHOLD, "pink");
}

/** Orange as soon as any build sits under the QA gate. */
export function qaAccent(below70: number): Accent {
  return below70 > 0 ? "orange" : "none";
}

/** Pink as soon as any mirror failed. */
export function mirrorAccent(failed: number): Accent {
  return failed > 0 ? "pink" : "none";
}

/** Pink as soon as any intake failed. */
export function failedAccent(failed: number): Accent {
  return failed > 0 ? "pink" : "none";
}

/** 0.0244 → "2.4%"; null → "—". */
export function formatPct(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

/** Median seconds → "5m 10s"; null → "—". */
export function medianLabel(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "—";
  return formatDuration(seconds * 1000);
}

/** Rule ids by count, highest first; ties break on the id so the order is stable. */
export function sortedRules(
  byRule: Record<string, number>
): [rule: string, count: number][] {
  return Object.entries(byRule).sort(
    ([ruleA, countA], [ruleB, countB]) =>
      countB - countA || ruleA.localeCompare(ruleB)
  );
}

/** Template counts as chart slices, largest first (the pie drops zeros itself). */
export function templateSlices(
  byTemplate: Record<string, number>
): { label: string; value: number }[] {
  return sortedRules(byTemplate).map(([label, value]) => ({ label, value }));
}

/**
 * Field names that would carry content rather than metadata (A1). The
 * control plane never sends them on these endpoints; if one ever appears
 * the page drops it before render.
 */
export const CONTENT_FIELDS: ReadonlySet<string> = new Set([
  "prompt",
  "plan",
  "source",
  "body",
  "message",
]);

/**
 * Deep-copies `payload` without any content-named field whose value could
 * hold text (strings, objects, arrays). Numbers, booleans and null under
 * those names are counters and stay — `medians_s.plan` is the median
 * seconds an intake spends in `planning`, not a plan.
 */
export function stripContentFields<T>(payload: T): T {
  if (Array.isArray(payload)) {
    return payload.map((item) => stripContentFields(item)) as T;
  }
  if (payload === null || typeof payload !== "object") return payload;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    if (CONTENT_FIELDS.has(key) && couldBeContent(value)) continue;
    out[key] = stripContentFields(value);
  }
  return out as T;
}

function couldBeContent(value: unknown): boolean {
  return !(
    value === null ||
    value === undefined ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

/* ------------------------------------------------------------- V13 jobs */

import type {
  CreateHealthResponse,
  CreateJobFailure,
  CreateTokenGroup,
} from "./types";

/** Fixed display order for job states; unknown states append alphabetically. */
export const JOB_STATE_ORDER = [
  "running",
  "queued",
  "live",
  "stuck",
  "failed",
  "cancelled",
  "superseded",
] as const;

export function jobStateBars(byState: Record<string, number>): { label: string; value: number }[] {
  const keys = [
    ...JOB_STATE_ORDER.filter((state) => byState[state] !== undefined),
    ...Object.keys(byState)
      .filter((state) => !JOB_STATE_ORDER.includes(state as (typeof JOB_STATE_ORDER)[number]))
      .sort(),
  ];
  return keys.map((label) => ({ label, value: byState[label] ?? 0 }));
}

/** Pink when a lane has real trouble (stuck/failed) — the failures table detail. */
export function jobStateAccent(byState: Record<string, number>): Accent {
  return (byState["stuck"] ?? 0) + (byState["failed"] ?? 0) > 0 ? "pink" : "none";
}

export function failureRows(failures: CreateJobFailure[]): string[][] {
  return failures.map((job) => [
    job.id.slice(0, 8),
    job.app_id === null ? "—" : job.app_id.slice(0, 8),
    job.state,
    job.step ?? "—",
    job.rule ?? "—",
    job.round === null ? "—" : String(job.round),
    job.created_at === null ? "—" : job.created_at.replace("T", " ").slice(0, 16),
  ]);
}

/** skill_ver histogram, numeric order (v4 before v10); "?" for jobs with none. */
export function skillVerRows(byVer: Record<string, number>): string[][] {
  return Object.entries(byVer)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([ver, count]) => [`v${ver}`, String(count)]);
}

/** One row per readiness check, reason text under fails for the panel note. */
export function healthCheckRows(checks: CreateHealthResponse["checks"]): string[][] {
  return Object.entries(checks).map(([name, state]) => [name, state]);
}

export function tokenGroupRows(groups: CreateTokenGroup[]): string[][] {
  return groups.map((row) => [
    row.key,
    String(row.runs),
    row.total_tokens.toLocaleString("en-US"),
    `$${row.cost_usd.toFixed(2)}${row.cost_estimated ? " est" : ""}`,
  ]);
}
