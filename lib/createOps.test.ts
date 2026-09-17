import { describe, expect, it } from "vitest";
import type { CreateOpsResponse } from "./types";
import {
  BUILD_FAILURE_THRESHOLD,
  EXIT_STAGES,
  FUNNEL_STAGES,
  PIPELINE_STAGES,
  RELAY_FAILURE_THRESHOLD,
  buildFailedAccent,
  buildFailureRatio,
  failedAccent,
  formatPct,
  funnelBars,
  medianLabel,
  mirrorAccent,
  openIntakes,
  qaAccent,
  ratio,
  relayAccent,
  relayFailureRatio,
  sortedRules,
  stripContentFields,
  templateSlices,
} from "./createOps";

/** The mock-cp.mjs createOps() fixture. */
const OPS: CreateOpsResponse = {
  window_days: 7,
  funnel: {
    asking: 3,
    planning: 2,
    plan_sent: 2,
    revising: 1,
    confirmed: 2,
    building: 1,
    qa: 1,
    testing: 1,
    dev_ready: 1,
    finalizing: 1,
    decision_sent: 1,
    production: 1,
    failed: 1,
    abandoned: 2,
  },
  medians_s: { first_question: 42, plan: 310, confirm_to_dev: 1260, dev_to_prod: 7200 },
  builds: {
    total: 11,
    failed: 4,
    by_rule: { "csp.host-reference": 3, "tests.locked-removed": 1 },
  },
  qa: { p50: 84, p90: 93, below_70: 1 },
  tests: { declared: 9, passed_ratio: 0.78 },
  progress_relay: { cards_updated: 240, text_fallbacks: 3, update_failures: 6 },
  mirror: { ok: 1, failed: 0 },
  budget_exhausted: 1,
  by_template: { landing: 2, store: 1, tool: 1 },
};

describe("stage order", () => {
  it("covers every funnel key exactly once, pipeline first then exits", () => {
    expect([...FUNNEL_STAGES].sort()).toEqual(Object.keys(OPS.funnel).sort());
    expect(new Set(FUNNEL_STAGES).size).toBe(FUNNEL_STAGES.length);
    expect(PIPELINE_STAGES[0]).toBe("asking");
    expect(PIPELINE_STAGES[PIPELINE_STAGES.length - 1]).toBe("production");
    expect(EXIT_STAGES).toEqual(["failed", "abandoned"]);
  });

  it("emits funnel bars in pipeline order without the exits", () => {
    const bars = funnelBars(OPS.funnel);
    expect(bars.map((b) => b.label)).toEqual([
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
    ]);
    expect(bars[0]).toEqual({ label: "asking", value: 3 });
    expect(bars.find((b) => b.label === "failed")).toBeUndefined();
  });

  it("zero-fills stages the payload leaves out", () => {
    const bars = funnelBars({ asking: 5, production: 2 });
    expect(bars).toHaveLength(PIPELINE_STAGES.length);
    expect(bars.find((b) => b.label === "qa")?.value).toBe(0);
    expect(bars.find((b) => b.label === "production")?.value).toBe(2);
  });

  it("counts open intakes as every pipeline stage before production", () => {
    expect(openIntakes(OPS.funnel)).toBe(16);
    expect(openIntakes({})).toBe(0);
  });
});

describe("ratios", () => {
  it("divides, and yields null when there is nothing to divide by", () => {
    expect(ratio(1, 4)).toBe(0.25);
    expect(ratio(0, 4)).toBe(0);
    expect(ratio(3, 0)).toBeNull();
    expect(ratio(3, -1)).toBeNull();
    expect(ratio(Number.NaN, 4)).toBeNull();
  });

  it("computes the build failure ratio", () => {
    expect(buildFailureRatio(OPS.builds)).toBeCloseTo(4 / 11);
    expect(buildFailureRatio({ failed: 0, total: 0 })).toBeNull();
  });

  it("measures relay failures against all ticks, not against successes alone", () => {
    expect(relayFailureRatio(OPS.progress_relay)).toBeCloseTo(6 / 246);
    expect(
      relayFailureRatio({ cards_updated: 0, update_failures: 0 })
    ).toBeNull();
    expect(
      relayFailureRatio({ cards_updated: 0, update_failures: 3 })
    ).toBe(1);
  });
});

describe("accents", () => {
  it("turns failed builds pink only above 10% of the total", () => {
    expect(BUILD_FAILURE_THRESHOLD).toBe(0.1);
    expect(buildFailedAccent(OPS.builds)).toBe("pink");
    expect(buildFailedAccent({ failed: 1, total: 11 })).toBe("none");
    expect(buildFailedAccent({ failed: 1, total: 10 })).toBe("none");
    expect(buildFailedAccent({ failed: 2, total: 10 })).toBe("pink");
    expect(buildFailedAccent({ failed: 0, total: 0 })).toBe("none");
  });

  it("turns relay failures pink only above 5% of ticks", () => {
    expect(RELAY_FAILURE_THRESHOLD).toBe(0.05);
    expect(relayAccent(OPS.progress_relay)).toBe("none");
    expect(relayAccent({ cards_updated: 95, update_failures: 5 })).toBe("none");
    expect(relayAccent({ cards_updated: 94, update_failures: 6 })).toBe("pink");
    expect(relayAccent({ cards_updated: 0, update_failures: 0 })).toBe("none");
  });

  it("flags any QA score under the gate, any mirror failure, any failed intake", () => {
    expect(qaAccent(0)).toBe("none");
    expect(qaAccent(1)).toBe("orange");
    expect(mirrorAccent(0)).toBe("none");
    expect(mirrorAccent(1)).toBe("pink");
    expect(failedAccent(0)).toBe("none");
    expect(failedAccent(1)).toBe("pink");
  });
});

describe("formatting", () => {
  it("formats ratios as percentages", () => {
    expect(formatPct(6 / 246)).toBe("2.4%");
    expect(formatPct(0.78, 0)).toBe("78%");
    expect(formatPct(1)).toBe("100.0%");
    expect(formatPct(0)).toBe("0.0%");
    expect(formatPct(null)).toBe("—");
  });

  it("formats median seconds through formatDuration", () => {
    expect(medianLabel(42)).toBe("42s");
    expect(medianLabel(310)).toBe("5m 10s");
    expect(medianLabel(7200)).toBe("2h 0m");
    expect(medianLabel(null)).toBe("—");
  });

  it("sorts rules by count descending with a stable tie-break", () => {
    expect(sortedRules(OPS.builds.by_rule)).toEqual([
      ["csp.host-reference", 3],
      ["tests.locked-removed", 1],
    ]);
    expect(
      sortedRules({ "z.rule": 2, "a.rule": 2, "m.rule": 5 })
    ).toEqual([
      ["m.rule", 5],
      ["a.rule", 2],
      ["z.rule", 2],
    ]);
    expect(sortedRules({})).toEqual([]);
  });

  it("orders template slices largest first", () => {
    expect(templateSlices(OPS.by_template)).toEqual([
      { label: "landing", value: 2 },
      { label: "store", value: 1 },
      { label: "tool", value: 1 },
    ]);
  });
});

describe("stripContentFields (A1)", () => {
  it("drops content-named text fields at any depth and leaves the rest intact", () => {
    const tainted = {
      ...OPS,
      prompt: "build me a landing page",
      builds: { ...OPS.builds, message: "csp violation at line 3" },
      rows: [{ id: 1, body: "hello", source: { file: "main.tsx" } }],
    };
    const clean = stripContentFields(tainted) as Record<string, unknown>;
    expect(clean).not.toHaveProperty("prompt");
    expect(clean.builds).toEqual(OPS.builds);
    expect(clean.rows).toEqual([{ id: 1 }]);
    expect(JSON.stringify(clean)).not.toMatch(/landing page|csp violation|hello|main\.tsx/);
  });

  it("keeps numeric and null medians named plan, and does not mutate its input", () => {
    const clean = stripContentFields(OPS);
    expect(clean.medians_s.plan).toBe(310);
    expect(clean).toEqual(OPS);
    expect(clean).not.toBe(OPS);

    const noPlanMedian = stripContentFields({
      ...OPS,
      medians_s: { ...OPS.medians_s, plan: null },
    });
    expect(noPlanMedian.medians_s).toHaveProperty("plan", null);
  });

  it("passes primitives and arrays through", () => {
    expect(stripContentFields(3)).toBe(3);
    expect(stripContentFields(null)).toBeNull();
    expect(stripContentFields(["a", { message: "x", count: 1 }])).toEqual([
      "a",
      { count: 1 },
    ]);
  });
});
