import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CreateOpsResponse } from "@/lib/types";

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

  function serve(body: unknown, status = 200) {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      requested.push(String(input));
      return new Response(JSON.stringify(body), { status });
    });
  }

  it("reads one window of /api/admin/create and draws the funnel in stage order", async () => {
    serve(OPS);
    const html = await render("30");
    expect(requested).toEqual(["https://air.example.com/api/admin/create?days=30"]);

    const bars = html.match(/<ol data-chart="bar">(.*?)<\/ol>/)?.[1] ?? "";
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
    expect(html.indexOf("csp.host-reference")).toBeLessThan(
      html.indexOf("tests.locked-removed")
    );
    expect(html).toContain('href="/tokens?group=project"');
    expect(html).toContain("landing=2");
  });

  it("falls back to a LoadError in every panel on a 500 without crashing, keeping the range toggle", async () => {
    serve({ error: "boom" }, 500);
    const html = await render("7");
    expect(count(html, "Failed to load: control plane returned 500")).toBe(6);
    expect(html).toContain('href="/create?days=1"');
    expect(html).toContain("Intake funnel (7d)");
    expect(html).not.toContain("boom");
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
