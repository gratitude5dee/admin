/**
 * Pure helpers for the Tokens page's `?group=` tabs (goal.md §3.3): which
 * groups exist and which are tabs, the totals a grouped response folds to
 * and their A6 reconciliation against the ungrouped totals, the top-N cut
 * for the chart, the Astra-vs-GLM stage comparison (cost per production app
 * is the number goal-create-v12 §7 decides on) and the `~` list-estimated
 * badge. No I/O; metadata only — the airv2 goal-create-v12 §12 contract
 * fixes the /api/admin/tokens?group= payload.
 */
import { ratio } from "./createOps";
import type {
  TokensGroup,
  TokensGroupedResponse,
  TokensResponse,
} from "./types";

export type GroupRow = TokensGroupedResponse["groups"][number];

/** Every group the control plane accepts (airv2 §12). */
export const TOKENS_GROUPS = [
  "user",
  "model",
  "family",
  "provider",
  "tier",
  "lane",
  "stage",
  "project",
] as const satisfies readonly TokensGroup[];

/** The tab strip (goal.md §3.3) — `family` stays reachable by URL only. */
export const TOKENS_GROUP_TABS = [
  "user",
  "model",
  "provider",
  "tier",
  "lane",
  "stage",
  "project",
] as const satisfies readonly TokensGroup[];

export const DEFAULT_GROUP: TokensGroup = "user";

export function isTokensGroup(value: unknown): value is TokensGroup {
  return (
    typeof value === "string" &&
    (TOKENS_GROUPS as readonly string[]).includes(value)
  );
}

/** `?group=` as the page reads it: anything unknown is today's user view. */
export function parseTokensGroup(raw: string | null | undefined): TokensGroup {
  return isTokensGroup(raw) ? raw : DEFAULT_GROUP;
}

/** Tab link target; the user tab is the bare page so today's URL is unchanged. */
export function groupHref(basePath: string, group: TokensGroup): string {
  return group === DEFAULT_GROUP ? basePath : `${basePath}?group=${group}`;
}

/** Panel note per group — what the key means, in the control plane's terms. */
export const GROUP_NOTES: Record<TokensGroup, string> = {
  user:
    "From /api/admin/tokens — gateway-metered prompt/completion tokens and cost per user.",
  model:
    "From /api/admin/tokens?group=model — spend per model id as the gateway reports it (openai/gpt-6-astra, zai-org/GLM-5.3-Flash, gpt-5.6-luna, …).",
  family:
    "From /api/admin/tokens?group=family — spend per model family the router chose between.",
  provider:
    "From /api/admin/tokens?group=provider — spend per gateway provider (gmi, openai, …), the GMI-vs-OpenAI split.",
  tier:
    "From /api/admin/tokens?group=tier — spend per routing tier: create-deep, create-balanced and create-fast for Create runs, balanced for chat.",
  lane:
    "From /api/admin/tokens?group=lane — create (agent runs labelled create:*) vs chat (everything else).",
  stage:
    "From /api/admin/tokens?group=stage — agent_runs.create_stage: plan (Astra), build and review (GLM-5.3-Flash), finalize; runs outside Create carry no stage and fall in chat.",
  project:
    "From /api/admin/tokens?group=project — spend per Create app (create:<slug>); runs outside Create fall in chat.",
};

export interface GroupTotals {
  runs: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_usd: number;
  /** Rows priced from a list rate rather than a confirmed gateway rate. */
  estimated_rows: number;
}

/** What the grouped rows fold to; A6 says this equals the response `totals`. */
export function groupTotals(groups: readonly GroupRow[]): GroupTotals {
  return groups.reduce<GroupTotals>(
    (acc, row) => ({
      runs: acc.runs + row.runs,
      prompt_tokens: acc.prompt_tokens + row.prompt_tokens,
      completion_tokens: acc.completion_tokens + row.completion_tokens,
      total_tokens: acc.total_tokens + row.total_tokens,
      cost_usd: acc.cost_usd + row.cost_usd,
      estimated_rows: acc.estimated_rows + (row.cost_estimated ? 1 : 0),
    }),
    {
      runs: 0,
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      cost_usd: 0,
      estimated_rows: 0,
    }
  );
}

/** Cost sums reconcile to the cent; the control plane rounds each row. */
export const COST_TOLERANCE_USD = 0.005;

export interface Reconciliation {
  totals: TokensResponse["totals"];
  grouped: GroupTotals;
  matches: boolean;
}

/**
 * A6: grouped token totals equal the ungrouped totals for the same window.
 * Token counts must match exactly; cost within half a cent.
 */
export function reconcileGroups(
  response: Pick<TokensGroupedResponse, "totals" | "groups">
): Reconciliation {
  const grouped = groupTotals(response.groups);
  const { totals } = response;
  return {
    totals,
    grouped,
    matches:
      grouped.prompt_tokens === totals.prompt_tokens &&
      grouped.completion_tokens === totals.completion_tokens &&
      Math.abs(grouped.cost_usd - totals.cost_usd) < COST_TOLERANCE_USD,
  };
}

/** Largest first by total tokens; ties break on the key so the order is stable. */
export function sortGroups(groups: readonly GroupRow[]): GroupRow[] {
  return [...groups].sort(
    (a, b) => b.total_tokens - a.total_tokens || a.key.localeCompare(b.key)
  );
}

export const CHART_GROUPS = 12;

/** The groups the bar chart draws (goal.md §3.3: top 12). */
export function topGroups(
  groups: readonly GroupRow[],
  limit: number = CHART_GROUPS
): GroupRow[] {
  return sortGroups(groups).slice(0, Math.max(0, limit));
}

export interface StageComparisonSpec {
  key: "plan" | "build_review";
  label: string;
  /** Model the stage runs on, as goal.md §3.3 names it. */
  model: string;
  /** `create_stage` values folded into this row. */
  stages: readonly string[];
}

/**
 * The product decision in goal-create-v12 §7: planning on Astra versus
 * building and reviewing on GLM-5.3-Flash. finalize and chat sit in neither.
 */
export const STAGE_COMPARISON: readonly StageComparisonSpec[] = [
  { key: "plan", label: "plan", model: "Astra", stages: ["plan"] },
  {
    key: "build_review",
    label: "build + review",
    model: "GLM-5.3-Flash",
    stages: ["build", "review"],
  },
];

export interface StageComparisonRow extends StageComparisonSpec {
  runs: number;
  tokens: number;
  cost_usd: number;
  /** True when any folded stage was priced from list. */
  cost_estimated: boolean;
  /** cost ÷ the Create funnel's production count; null with nothing to divide by. */
  cost_per_production_app: number | null;
}

/**
 * Two rows from the `stage` groups: tokens, cost and cost per production app.
 * `productionCount` is the Create funnel's `production` for the same window;
 * null (endpoint down) or zero yields a null per-app cost, never Infinity.
 */
export function stageComparison(
  groups: readonly GroupRow[],
  productionCount: number | null | undefined
): StageComparisonRow[] {
  return STAGE_COMPARISON.map((spec) => {
    const rows = groups.filter((row) => spec.stages.includes(row.key));
    const folded = groupTotals(rows);
    return {
      ...spec,
      runs: folded.runs,
      tokens: folded.total_tokens,
      cost_usd: folded.cost_usd,
      cost_estimated: folded.estimated_rows > 0,
      cost_per_production_app:
        productionCount === null || productionCount === undefined
          ? null
          : ratio(folded.cost_usd, productionCount),
    };
  });
}

export const ESTIMATED_PREFIX = "~";
export const ESTIMATED_TITLE = "list-estimated";

export interface EstimatedBadge {
  prefix: "" | typeof ESTIMATED_PREFIX;
  /** Tooltip text; null when the cost is a confirmed gateway rate. */
  title: string | null;
}

/** `~` plus the "list-estimated" tooltip on estimated rows, nothing otherwise. */
export function estimatedBadge(
  row: Pick<GroupRow, "cost_estimated">
): EstimatedBadge {
  return row.cost_estimated
    ? { prefix: ESTIMATED_PREFIX, title: ESTIMATED_TITLE }
    : { prefix: "", title: null };
}

/** 1.21 → "$1.21"; estimated → "~$1.21"; null → "—". */
export function formatUsd(
  usd: number | null | undefined,
  digits = 2,
  estimated = false
): string {
  if (usd === null || usd === undefined || !Number.isFinite(usd)) return "—";
  return `${estimated ? ESTIMATED_PREFIX : ""}$${usd.toFixed(digits)}`;
}

/** A row's cost cell text: 4 decimals like the per-user table, badged. */
export function costLabel(
  row: Pick<GroupRow, "cost_usd" | "cost_estimated">,
  digits = 4
): string {
  return formatUsd(row.cost_usd, digits, row.cost_estimated);
}
