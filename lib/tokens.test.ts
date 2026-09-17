import { describe, expect, it } from "vitest";
import type { TokensGroupedResponse } from "./types";
import {
  CHART_GROUPS,
  COST_TOLERANCE_USD,
  DEFAULT_GROUP,
  ESTIMATED_TITLE,
  GROUP_NOTES,
  STAGE_COMPARISON,
  TOKENS_GROUP_TABS,
  TOKENS_GROUPS,
  costLabel,
  estimatedBadge,
  formatUsd,
  groupHref,
  groupTotals,
  isTokensGroup,
  parseTokensGroup,
  reconcileGroups,
  sortGroups,
  stageComparison,
  topGroups,
  type GroupRow,
} from "./tokens";

/** The mock-cp.mjs TOKEN_LEDGER folded by stage — its totals are the ungrouped fixture. */
const TOTALS = { prompt_tokens: 150000, completion_tokens: 42000, cost_usd: 3.21 };

const row = (
  key: string,
  runs: number,
  prompt: number,
  completion: number,
  cost: number,
  estimated = false
): GroupRow => ({
  key,
  runs,
  prompt_tokens: prompt,
  completion_tokens: completion,
  total_tokens: prompt + completion,
  cost_usd: cost,
  cost_estimated: estimated,
});

const STAGE: GroupRow[] = [
  row("plan", 5, 60000, 12000, 1.21, true),
  row("build", 6, 50000, 18000, 1.0),
  row("chat", 5, 25000, 7500, 0.7),
  row("review", 3, 15000, 4500, 0.3),
];

const MODEL: GroupRow[] = [
  row("zai-org/GLM-5.3-Flash", 9, 65000, 22500, 1.3),
  row("openai/gpt-6-astra", 5, 60000, 12000, 1.21, true),
  row("gpt-5.6-luna", 5, 25000, 7500, 0.7),
];

const grouped = (
  group: TokensGroupedResponse["group"],
  groups: GroupRow[]
): TokensGroupedResponse => ({
  window_days: 30,
  since: "2026-08-18T00:00:00Z",
  totals: TOTALS,
  users: [],
  group,
  groups,
});

describe("groups and tabs", () => {
  it("knows every airv2 §12 group and exposes the §3.3 tabs (family by URL only)", () => {
    expect(TOKENS_GROUPS).toEqual([
      "user", "model", "family", "provider", "tier", "lane", "stage", "project",
    ]);
    expect(TOKENS_GROUP_TABS).toEqual([
      "user", "model", "provider", "tier", "lane", "stage", "project",
    ]);
    expect(TOKENS_GROUP_TABS).not.toContain("family");
    for (const group of TOKENS_GROUPS) {
      expect(GROUP_NOTES[group]).toMatch(/^From \/api\/admin\/tokens/);
    }
    expect(GROUP_NOTES.lane).toContain("create:*");
    expect(GROUP_NOTES.lane).toContain("chat");
  });

  it("parses ?group= and falls back to the user view for anything unknown", () => {
    expect(DEFAULT_GROUP).toBe("user");
    expect(parseTokensGroup("stage")).toBe("stage");
    expect(parseTokensGroup("family")).toBe("family");
    expect(parseTokensGroup("bogus")).toBe("user");
    expect(parseTokensGroup("")).toBe("user");
    expect(parseTokensGroup(undefined)).toBe("user");
    expect(parseTokensGroup(null)).toBe("user");
    expect(isTokensGroup("model")).toBe(true);
    expect(isTokensGroup("Model")).toBe(false);
    expect(isTokensGroup(3)).toBe(false);
  });

  it("links the user tab to the bare page and the others to ?group=", () => {
    expect(groupHref("/tokens", "user")).toBe("/tokens");
    expect(groupHref("/tokens", "stage")).toBe("/tokens?group=stage");
  });
});

describe("groupTotals and reconciliation (A6)", () => {
  it("folds the stage groups back to the ungrouped totals", () => {
    const totals = groupTotals(STAGE);
    expect(totals.prompt_tokens).toBe(TOTALS.prompt_tokens);
    expect(totals.completion_tokens).toBe(TOTALS.completion_tokens);
    expect(totals.total_tokens).toBe(192000);
    expect(totals.cost_usd).toBeCloseTo(TOTALS.cost_usd, 8);
    expect(totals.runs).toBe(19);
    expect(totals.estimated_rows).toBe(1);
  });

  it("folds the model groups to the same totals", () => {
    const totals = groupTotals(MODEL);
    expect(totals.prompt_tokens).toBe(TOTALS.prompt_tokens);
    expect(totals.completion_tokens).toBe(TOTALS.completion_tokens);
    expect(totals.cost_usd).toBeCloseTo(TOTALS.cost_usd, 8);
    expect(totals.runs).toBe(19);
  });

  it("is all zeros for no groups", () => {
    expect(groupTotals([])).toEqual({
      runs: 0,
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      cost_usd: 0,
      estimated_rows: 0,
    });
  });

  it("reports a match within half a cent and a mismatch beyond it or on any token drift", () => {
    expect(reconcileGroups(grouped("stage", STAGE)).matches).toBe(true);
    expect(COST_TOLERANCE_USD).toBe(0.005);

    const roundedCost = grouped("stage", [
      ...STAGE.slice(1),
      row("plan", 5, 60000, 12000, 1.214, true),
    ]);
    expect(reconcileGroups(roundedCost).matches).toBe(true);

    const costOff = grouped("stage", [
      ...STAGE.slice(1),
      row("plan", 5, 60000, 12000, 1.22, true),
    ]);
    expect(reconcileGroups(costOff).matches).toBe(false);

    const tokensOff = grouped("stage", [
      ...STAGE.slice(1),
      row("plan", 5, 60001, 12000, 1.21, true),
    ]);
    const result = reconcileGroups(tokensOff);
    expect(result.matches).toBe(false);
    expect(result.grouped.prompt_tokens).toBe(150001);
    expect(result.totals).toBe(TOTALS);
  });

  it("refuses a row whose total_tokens is not prompt + completion", () => {
    const [first, ...rest] = STAGE;
    const corrupted = grouped("stage", [{ ...first!, total_tokens: first!.total_tokens + 1 }, ...rest]);
    expect(reconcileGroups(corrupted).matches).toBe(false);
  });
});

describe("ordering", () => {
  it("sorts by total tokens descending with a stable key tie-break, without mutating", () => {
    const input = [row("b", 1, 10, 0, 0), row("a", 1, 10, 0, 0), row("c", 1, 20, 0, 0)];
    const sorted = sortGroups(input);
    expect(sorted.map((g) => g.key)).toEqual(["c", "a", "b"]);
    expect(input.map((g) => g.key)).toEqual(["b", "a", "c"]);
    expect(sortGroups(STAGE).map((g) => g.key)).toEqual(["plan", "build", "chat", "review"]);
  });

  it("cuts the chart to the top 12 groups", () => {
    expect(CHART_GROUPS).toBe(12);
    const many = Array.from({ length: 20 }, (_, i) => row(`g${i}`, 1, (i + 1) * 100, 0, 0));
    const top = topGroups(many);
    expect(top).toHaveLength(12);
    expect(top[0].key).toBe("g19");
    expect(top[11].key).toBe("g8");
    expect(topGroups(STAGE, 2).map((g) => g.key)).toEqual(["plan", "build"]);
    expect(topGroups(STAGE, 0)).toEqual([]);
    expect(topGroups(STAGE, -1)).toEqual([]);
  });
});

describe("stageComparison", () => {
  it("compares plan (Astra) against build + review (GLM-5.3-Flash) per production app", () => {
    expect(STAGE_COMPARISON.map((spec) => spec.key)).toEqual(["plan", "build_review"]);
    const [plan, buildReview] = stageComparison(STAGE, 1);

    expect(plan.label).toBe("plan");
    expect(plan.model).toBe("Astra");
    expect(plan.stages).toEqual(["plan"]);
    expect(plan.runs).toBe(5);
    expect(plan.tokens).toBe(72000);
    expect(plan.cost_usd).toBeCloseTo(1.21);
    expect(plan.cost_estimated).toBe(true);
    expect(plan.cost_per_production_app).toBeCloseTo(1.21);

    expect(buildReview.label).toBe("build + review");
    expect(buildReview.model).toBe("GLM-5.3-Flash");
    expect(buildReview.stages).toEqual(["build", "review"]);
    expect(buildReview.runs).toBe(9);
    expect(buildReview.tokens).toBe(87500);
    expect(buildReview.cost_usd).toBeCloseTo(1.3);
    expect(buildReview.cost_estimated).toBe(false);
    expect(buildReview.cost_per_production_app).toBeCloseTo(1.3);
  });

  it("divides by the production count", () => {
    const [plan, buildReview] = stageComparison(STAGE, 4);
    expect(plan.cost_per_production_app).toBeCloseTo(0.3025);
    expect(buildReview.cost_per_production_app).toBeCloseTo(0.325);
  });

  it("yields null per-app cost with zero production apps or no funnel at all", () => {
    for (const production of [0, null, undefined, -1, Number.NaN]) {
      const rows = stageComparison(STAGE, production);
      expect(rows).toHaveLength(2);
      for (const r of rows) {
        expect(r.cost_per_production_app).toBeNull();
        expect(r.cost_usd).toBeGreaterThan(0); // the cost itself still reads
      }
    }
  });

  it("leaves finalize and chat out of both rows and copes with missing stages", () => {
    const withFinalize = [...STAGE, row("finalize", 1, 1000, 100, 0.05)];
    const total = stageComparison(withFinalize, 1).reduce((sum, r) => sum + r.tokens, 0);
    expect(total).toBe(72000 + 87500);

    const [plan, buildReview] = stageComparison([row("chat", 5, 25000, 7500, 0.7)], 1);
    expect(plan.tokens).toBe(0);
    expect(plan.cost_per_production_app).toBe(0);
    expect(plan.cost_estimated).toBe(false);
    expect(buildReview.tokens).toBe(0);
  });
});

describe("estimated badge and cost formatting", () => {
  it("badges only estimated rows", () => {
    expect(ESTIMATED_TITLE).toBe("list-estimated");
    expect(estimatedBadge({ cost_estimated: true })).toEqual({
      prefix: "~",
      title: "list-estimated",
    });
    expect(estimatedBadge({ cost_estimated: false })).toEqual({ prefix: "", title: null });
  });

  it("formats dollars with the ~ prefix for estimates and a dash for nothing", () => {
    expect(formatUsd(1.21)).toBe("$1.21");
    expect(formatUsd(1.21, 2, true)).toBe("~$1.21");
    expect(formatUsd(0.3025, 4)).toBe("$0.3025");
    expect(formatUsd(null)).toBe("—");
    expect(formatUsd(undefined)).toBe("—");
    expect(formatUsd(Number.POSITIVE_INFINITY)).toBe("—");
    expect(costLabel(STAGE[0])).toBe("~$1.2100");
    expect(costLabel(STAGE[1])).toBe("$1.0000");
    expect(costLabel(STAGE[1], 2)).toBe("$1.00");
  });
});
