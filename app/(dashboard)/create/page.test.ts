import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CreateHealthResponse,
  CreateJobsResponse,
  CreateOpsResponse,
} from "@/lib/types";

vi.mock("server-only", () => ({}));
// dither-kit charts paint on a canvas; stand in with markup that exposes the
// labels in order so the test can assert what the chart would draw.
vi.mock("@/components/charts", () => ({
  LabeledBarChart: ({ data }: { data: { label: string; value: number }[] }) =>
    createElement(
      "ol",
      { "data-chart": "bar" },
      data.map((d) => createElement("li", { key: d.label }, `${d.label}=${d.value}`))
    ),
  BreakdownPieChart: ({ data }: { data: { label: string; value: number }[] }) =>
    createElement(
      "ol",
      { "data-chart": "pie" },
      data.map((d) => createElement("li", { key: d.label }, `${d.label}=${d.value}`))
    ),
}));

import CreatePage from "./page";

Object.assign(globalThis, { React });

const OPS: CreateOpsResponse = {
  window_days: 7,
  funnel: {
    asking: 3, planning: 2, plan_sent: 2, revising: 1, confirmed: 2, building: 1, qa: 1, testing: 1,
    dev_ready: 1, finalizing: 1, decision_sent: 1, production: 1, failed: 1, abandoned: 2,
  },
  medians_s: { first_question: 42, plan: 310, confirm_to_dev: 1260, dev_to_prod: 7200 },
  builds: { total: 11, failed: 4, by_rule: { "tests.locked-removed": 1, "csp.host-reference": 3 } },
  qa: { p50: 84, p90: 93, below_70: 1 },
  tests: { declared: 9, passed_ratio: 0.78 },
  progress_relay: { cards_updated: 240, text_fallbacks: 3, update_failures: 6 },
  mirror: { ok: 1, failed: 0 },
  budget_exhausted: 1,
  by_template: { landing: 2, store: 1, tool: 1 },
};

const JOBS: CreateJobsResponse = {
  window_days: 7,
  jobs: {
    total: 7,
    by_state: { live: 1, running: 1, queued: 1, stuck: 1, failed: 1, cancelled: 1, superseded: 1 },
    by_kind: { initial: 5, change: 2 },
    dev_live: 1,
    by_skill_ver: { "5": 4, "4": 3 },
    failures: [
      { id: "5f7a1c2e-0003-4000-8000-000000000003", app_id: "app-bob-notes", state: "stuck", step: "build", rule: "tests.locked-removed", round: 3, created_at: "2026-09-23T10:00:00.000Z" },
      { id: "5f7a1c2e-0004-4000-8000-000000000004", app_id: "app-bob-notes", state: "failed", step: "code", rule: "turn.timeout", round: 0, created_at: "2026-09-22T10:00:00.000Z" },
      { id: "5f7a1c2e-0007-4000-8000-000000000007", app_id: "app-dave-shop", state: "cancelled", step: "check", rule: null, round: 1, created_at: "2026-09-21T10:00:00.000Z" },
    ],
  },
  token_usage: {
    by_stage: [
      { key: "build", runs: 6, prompt_tokens: 50000, completion_tokens: 18000, total_tokens: 68000, cost_usd: 1.0, cost_estimated: false },
      { key: "plan", runs: 5, prompt_tokens: 60000, completion_tokens: 12000, total_tokens: 72000, cost_usd: 1.21, cost_estimated: true },
    ],
    by_project: [
      { key: "create:alice-tour", runs: 9, prompt_tokens: 85000, completion_tokens: 25000, total_tokens: 110000, cost_usd: 1.71, cost_estimated: true },
      { key: "create:bob-notes", runs: 5, prompt_tokens: 40000, completion_tokens: 9500, total_tokens: 49500, cost_usd: 0.8, cost_estimated: false },
    ],
  },
  skill_use: { upgrades_queued: 2, by_skill_ver: { "5": 4, "4": 3 } },
};

const HEALTH: CreateHealthResponse = {
  ok: false,
  checks: { lane_env: "ok", bridge_secret: "ok", jobs_origin: "ok", live_token_secret: "ok", worker_http: "fail" },
  reasons: ["worker_http: fail"],
  skill_version_min: 5,
  max_fix_rounds: 3,
  compile_max_per_turn: 5,
  dev_origin_suffix: "dev.wzrd.tech",
};

async function render(days?: string): Promise<string> {
  const tree = await CreatePage({ searchParams: Promise.resolve({ days }) });
  return renderToStaticMarkup(tree);
}

function count(html: string, needle: string): number {
  return html.split(needle).length - 1;
}

describe("/create page", () => {
  const requested: string[] = [];
  beforeEach(() => {
    process.env.CONTROL_PLANE_URL = "https://air.example.com";
    process.env.ADMIN_API_KEY = "test-admin-key";
    requested.length = 0;
  });
  afterEach(() => {
    delete process.env.CONTROL_PLANE_URL;
    delete process.env.ADMIN_API_KEY;
    vi.restoreAllMocks();
  });

  // Dispatch by path: the page fetches the funnel, the jobs rollup and the
  // lane health (jobs + health together after the funnel resolves).
  function serve(
    ops: unknown = OPS,
    jobs: unknown = JOBS,
    health: unknown = HEALTH,
    status = 200
  ) {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      requested.push(url);
      const body = url.includes("/api/admin/create/jobs")
        ? jobs
        : url.includes("/api/admin/create/health")
          ? health
          : ops;
      return new Response(JSON.stringify(body), { status });
    });
  }

  it("reads the funnel, jobs rollup and lane health and draws the funnel in stage order", async () => {
    serve(OPS);
    const html = await render("30");
    expect(requested).toEqual([
      "https://air.example.com/api/admin/create?days=30",
      "https://air.example.com/api/admin/create/jobs?days=30",
      "https://air.example.com/api/admin/create/health",
    ]);

    // The funnel is the second bar chart — the first is jobs-by-state.
    const bars = html.match(/<ol data-chart="bar">(.*?)<\/ol>/g)?.[1] ?? "";
    expect(bars.match(/<li>([a-z_]+)=/g)?.map((m) => m.slice(4, -1))).toEqual([
      "asking", "planning", "plan_sent", "revising", "confirmed", "building", "qa", "testing",
      "dev_ready", "finalizing", "decision_sent", "production",
    ]);
    expect(bars).not.toContain("failed=");
    expect(bars).not.toContain("abandoned=");
    expect(html).toContain("Intake funnel (30d)");
    expect(html).toContain('href="/create?days=30"');
  });

  it("accents failed intakes and failed builds pink, QA below the gate orange, relay within budget plain", async () => {
    serve(OPS);
    const html = await render();
    expect(html).toMatch(/failed<\/div><div class="[^"]*text-pink-400">1</); // funnel failed=1
    expect(html).toMatch(/failed<\/div><div class="[^"]*text-pink-400">4</); // builds 4/11 > 10%
    expect(html).toContain("36.4% of builds");
    expect(html).toMatch(/qa below 70<\/div><div class="[^"]*text-orange-400">1</);
    expect(html).toMatch(/update failures<\/div><div class="[^"]*text-foreground">6</); // 6/246 = 2.4%
    expect(html).toContain("2.4% of ticks");
    expect(html).toMatch(/mirror failed<\/div><div class="[^"]*text-foreground">0</);
    expect(html).toContain("78%");
    expect(html).toContain("5m 10s");
    expect(html).toContain("2h 0m");
  });

  it("lists build rules by count descending and links budget to the project token group", async () => {
    serve(OPS);
    const html = await render();
    // Scope to the Builds panel — the failures table may name the same rule.
    const buildsPanel = html.slice(html.indexOf("Builds (7d)"));
    expect(buildsPanel.indexOf("csp.host-reference")).toBeLessThan(
      buildsPanel.indexOf("tests.locked-removed")
    );
    expect(html).toContain('href="/tokens?group=project"');
    expect(html).toContain("landing=2");
  });

  it("falls back to a LoadError in every panel on a 500 without crashing, keeping the range toggle", async () => {
    serve({ error: "boom" }, { error: "boom" }, { error: "boom" }, 500);
    const html = await render("7");
    expect(count(html, "Failed to load: control plane returned 500")).toBe(11);
    expect(html).toContain('href="/create?days=1"');
    expect(html).toContain("Intake funnel (7d)");
    expect(html).not.toContain("boom");
  });

  it("draws the V13 panels: lane health, job deployments, failures, token use and skill use", async () => {
    serve();
    const html = await render();
    // Lane health: named checks + the failure reason.
    expect(html).toContain("not ready");
    expect(html).toContain("worker_http");
    expect(html).toContain("bridge_secret");
    // Deployments: state rollup + dev links.
    expect(html).toContain("Job deployments (7d)");
    expect(html).toContain("live dev links");
    expect(html).toContain("running=1");
    expect(html).toContain("stuck=1");
    // Failures: the attention table carries step and rule ids.
    expect(html).toContain("tests.locked-removed");
    expect(html).toContain("turn.timeout");
    expect(html).toContain("cancelled");
    // Token usage: by stage and project, est flagging.
    expect(html).toContain("Job token usage (7d)");
    expect(html).toContain("create:alice-tour");
    expect(html).toContain("$1.21 est");
    // Skill use: version histogram + queued upgrades.
    expect(html).toContain("Skill use (7d)");
    expect(html).toContain("v5");
    expect(html).toContain("upgrades queued");
  });

  it("a ready lane hides the reason line and marks live green", async () => {
    serve(OPS, JOBS, { ...HEALTH, ok: true, checks: { ...HEALTH.checks, worker_http: "ok" }, reasons: [] });
    const html = await render();
    expect(html).toContain(">ready<");
    expect(html).not.toContain("worker_http: fail");
  });

  it("never renders content-named fields or the bearer key (A1, A2)", async () => {
    serve({
      ...OPS,
      prompt: "SECRET-PROMPT",
      plan: "SECRET-PLAN",
      builds: { ...OPS.builds, message: "SECRET-MESSAGE" },
    });
    const html = await render();
    expect(html).not.toContain("SECRET-");
    expect(html).not.toContain("test-admin-key");
    expect(html).toContain("plan</div>"); // the median labelled plan still renders
  });
});
