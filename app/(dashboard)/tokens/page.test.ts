import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CreateOpsResponse, TokensGroupedResponse, TokensResponse } from "@/lib/types";

vi.mock("server-only", () => ({}));
// The dither bar chart paints on a canvas; stand in with markup that exposes
// the labels in order so the test can assert what the chart would draw.
vi.mock("@/components/tokens-chart", () => ({
  TokensChart: ({ data }: { data: { label: string; prompt: number; completion: number }[] }) =>
    createElement(
      "ol",
      { "data-chart": "tokens" },
      data.map((d) => createElement("li", { key: d.label }, `${d.label}=${d.prompt}/${d.completion}`))
    ),
}));

import TokensPage from "./page";

Object.assign(globalThis, { React });

const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";

/** The mock-cp.mjs /api/admin/tokens fixture and its TOKEN_LEDGER folds. */
const TOKENS: TokensResponse = {
  window_days: 30,
  since: "2026-08-18T00:00:00Z",
  totals: { prompt_tokens: 150000, completion_tokens: 42000, cost_usd: 3.21 },
  users: [
    { user_id: U1, runs: 12, prompt_tokens: 100000, completion_tokens: 30000, total_tokens: 130000, cost_usd: 2.11 },
    { user_id: U2, runs: 7, prompt_tokens: 50000, completion_tokens: 12000, total_tokens: 62000, cost_usd: 1.1 },
  ],
};

const g = (key: string, runs: number, prompt: number, completion: number, cost: number, estimated = false) =>
  ({ key, runs, prompt_tokens: prompt, completion_tokens: completion, total_tokens: prompt + completion, cost_usd: cost, cost_estimated: estimated });

const GROUPS: Record<string, TokensGroupedResponse["groups"]> = {
  stage: [g("plan", 5, 60000, 12000, 1.21, true), g("build", 6, 50000, 18000, 1.0), g("chat", 5, 25000, 7500, 0.7), g("review", 3, 15000, 4500, 0.3)],
  model: [g("zai-org/GLM-5.3-Flash", 9, 65000, 22500, 1.3), g("openai/gpt-6-astra", 5, 60000, 12000, 1.21, true), g("gpt-5.6-luna", 5, 25000, 7500, 0.7)],
  lane: [g("create", 14, 125000, 34500, 2.51, true), g("chat", 5, 25000, 7500, 0.7)],
  family: [g("gmi", 14, 125000, 34500, 2.51, true), g("openai", 5, 25000, 7500, 0.7)],
};

const CREATE = {
  window_days: 30,
  funnel: { asking: 3, planning: 2, plan_sent: 2, revising: 1, confirmed: 2, building: 1, qa: 1, testing: 1, dev_ready: 1, finalizing: 1, decision_sent: 1, production: 1, failed: 1, abandoned: 2 },
  medians_s: { first_question: 42, plan: 310, confirm_to_dev: 1260, dev_to_prod: 7200 },
  builds: { total: 11, failed: 4, by_rule: {} },
  qa: { p50: 84, p90: 93, below_70: 1 },
  tests: { declared: 9, passed_ratio: 0.78 },
  progress_relay: { cards_updated: 240, text_fallbacks: 3, update_failures: 6 },
  mirror: { ok: 1, failed: 0 },
  budget_exhausted: 1,
  by_template: { landing: 2 },
} satisfies CreateOpsResponse;

const USERS = { users: [{ user_id: U1, username: "alice", status: "active", created_at: "2026-01-01T00:00:00Z", handles: [] }, { user_id: U2, username: "bob", status: "active", created_at: "2026-01-01T00:00:00Z", handles: [] }] };

async function render(group?: string): Promise<string> {
  const tree = await TokensPage({ searchParams: Promise.resolve({ group }) });
  return renderToStaticMarkup(tree);
}

function count(html: string, needle: string): number {
  return html.split(needle).length - 1;
}

describe("/tokens page", () => {
  const requested: string[] = [];
  let overrides: Record<string, { body: unknown; status?: number }> = {};

  beforeEach(() => {
    process.env.CONTROL_PLANE_URL = "https://air.example.com";
    process.env.ADMIN_API_KEY = "test-admin-key";
    requested.length = 0;
    overrides = {};
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = new URL(String(input));
      requested.push(url.pathname + url.search);
      const override = overrides[url.pathname];
      if (override) return new Response(JSON.stringify(override.body), { status: override.status ?? 200 });
      if (url.pathname === "/api/admin/users") return new Response(JSON.stringify(USERS));
      if (url.pathname === "/api/admin/create") return new Response(JSON.stringify(CREATE));
      if (url.pathname === "/api/admin/tokens") {
        const group = url.searchParams.get("group");
        const body = group === null ? TOKENS : { ...TOKENS, group, groups: GROUPS[group] ?? [] };
        return new Response(JSON.stringify(body));
      }
      return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
    });
  });
  afterEach(() => {
    delete process.env.CONTROL_PLANE_URL;
    delete process.env.ADMIN_API_KEY;
    vi.restoreAllMocks();
  });

  it("keeps today's per-user view for no group and for group=user", async () => {
    for (const group of [undefined, "user", "bogus"]) {
      requested.length = 0;
      const html = await render(group);
      expect(requested.sort()).toEqual(["/api/admin/tokens?days=30", "/api/admin/users"]);
      expect(html).toContain("Token usage (30 days)");
      expect(html).toContain(`href="/users/${U1}"`);
      expect(html).toContain(">alice</a>");
      expect(html).toContain("alice=100000/30000");
      expect(html).toContain("$2.1100");
      expect(html).toContain("$3.21");
      expect(html).not.toContain("Token usage by");
      expect(html).not.toContain("list-estimated");
    }
  });

  it("renders the tab strip on every view with the active tab marked", async () => {
    const user = await render();
    expect(user).toMatch(/<a aria-current="page" class="[^"]*" href="\/tokens">user<\/a>/);
    expect(count(user, 'aria-current="page"')).toBe(1);
    for (const tab of ["model", "provider", "tier", "lane", "stage", "project"]) {
      expect(user).toContain(`href="/tokens?group=${tab}"`);
    }
    const stage = await render("stage");
    expect(stage).toMatch(/<a aria-current="page" class="[^"]*" href="\/tokens\?group=stage">stage<\/a>/);
    expect(count(stage, 'aria-current="page"')).toBe(1);
  });

  it("renders a grouped view for model: totals, the top-12 chart, the table and the ~ badge on estimated rows only", async () => {
    const html = await render("model");
    expect(requested).toEqual(["/api/admin/tokens?days=30&group=model"]);
    expect(html).toContain("Token usage by model (30 days)");
    expect(html).toContain(">model</th>");
    expect(html).toMatch(/prompt tokens<\/div><div class="[^"]*text-violet-400">150,000</);
    expect(html).toMatch(/completion tokens<\/div><div class="[^"]*text-violet-400">42,000</);
    expect(html).toContain("$3.21");
    expect(html).toContain("1 of 3 rows list-estimated");

    const bars = html.match(/<ol data-chart="tokens">(.*?)<\/ol>/)?.[1] ?? "";
    expect(bars.match(/<li>([^=]+)=/g)?.map((m) => m.slice(4, -1))).toEqual([
      "zai-org/GLM-5.3-Flash", "openai/gpt-6-astra", "gpt-5.6-luna",
    ]);

    expect(count(html, 'title="list-estimated"')).toBe(1);
    expect(html).toContain('<span title="list-estimated">~$1.2100</span>');
    expect(html).toContain("<span>$1.3000</span>");
    expect(html).toContain("<span>$0.7000</span>");
    expect(html).toContain("~ list-estimated: priced from the provider");
    expect(html).toContain("grouped sum 150,000 prompt · 42,000 completion · $3.21 — reconciles with the totals above (A6)");
    expect(html).not.toContain("Astra vs GLM");
    expect(html).not.toContain(`href="/users/`);
  });

  it("shows the Astra vs GLM comparison on the stage tab with cost per production app from the same window", async () => {
    const html = await render("stage");
    expect(requested.sort()).toEqual(["/api/admin/create?days=30", "/api/admin/tokens?days=30&group=stage"]);
    expect(html).toContain("Astra vs GLM (30 days)");
    expect(html).toMatch(/production apps<\/div><div class="[^"]*text-emerald-400">1</);
    expect(html).toContain("plan (plan)");
    expect(html).toContain("build + review (build, review)");
    expect(html).toContain(">Astra</td>");
    expect(html).toContain(">GLM-5.3-Flash</td>");
    expect(html).toContain(">72,000</td>");
    expect(html).toContain(">87,500</td>");
    // per-app cost: plan is list-estimated (~), build+review confirmed.
    expect(html).toMatch(/plan · cost \/ production app<\/div><div class="[^"]*">~\$1\.21</);
    expect(html).toMatch(/build \+ review · cost \/ production app<\/div><div class="[^"]*">\$1\.30</);
    // one badge in the grouped table (plan row) and one in the comparison (plan row).
    expect(count(html, 'title="list-estimated"')).toBe(2);
    expect(html).toContain('<span title="list-estimated">~$1.21</span>');
    expect(html).toContain("<span>$1.30</span>");
  });

  it("keeps the stage card, with a dash per app and one LoadError, when /api/admin/create fails", async () => {
    overrides["/api/admin/create"] = { body: { error: "boom" }, status: 500 };
    const html = await render("stage");
    expect(count(html, "Failed to load: control plane returned 500")).toBe(1);
    expect(html).toContain("Astra vs GLM (30 days)");
    expect(html).toMatch(/production apps<\/div><div class="[^"]*">—</);
    expect(html).toMatch(/plan · cost \/ production app<\/div><div class="[^"]*">—</);
    expect(html).toContain('<span title="list-estimated">~$1.21</span>'); // cost still reads
    expect(html).toContain("Token usage by stage (30 days)");
    expect(html).not.toContain("boom");
  });

  it("renders one LoadError per panel when the grouped read fails, keeping the tabs", async () => {
    overrides["/api/admin/tokens"] = { body: { error: "down" }, status: 503 };
    const html = await render("stage");
    expect(count(html, "Failed to load: control plane returned 503")).toBe(2);
    expect(html).toContain('href="/tokens?group=project"');
    expect(html).not.toContain("<table");
    expect(html).not.toContain("down");
  });

  it("accepts family by URL even though it is not a tab, and labels lane create vs chat", async () => {
    const family = await render("family");
    expect(requested).toEqual(["/api/admin/tokens?days=30&group=family"]);
    expect(family).toContain("Token usage by family (30 days)");
    expect(family).not.toContain('aria-current="page"');

    const lane = await render("lane");
    expect(lane).toContain("create (agent runs labelled create:*) vs chat (everything else)");
    expect(lane).toContain(">create</td>");
    expect(lane).toContain(">chat</td>");
  });

  it("flags grouped sums that do not reconcile with the totals (A6)", async () => {
    overrides["/api/admin/tokens"] = {
      body: { ...TOKENS, group: "provider", groups: [g("gmi", 14, 125000, 34500, 2.51, true), g("openai", 5, 20000, 7500, 0.7)] },
    };
    const html = await render("provider");
    expect(html).toMatch(/text-orange-400">grouped sum 145,000 prompt · 42,000 completion · \$3\.21 — does not reconcile/);
  });

  it("never renders content-named fields or the bearer key (A1, A2)", async () => {
    overrides["/api/admin/tokens"] = {
      body: {
        ...TOKENS,
        group: "stage",
        prompt: "SECRET-PROMPT",
        groups: GROUPS.stage.map((row) => ({ ...row, message: "SECRET-MESSAGE", source: { file: "SECRET-SOURCE" } })),
      },
    };
    const html = await render("stage");
    expect(html).not.toContain("SECRET-");
    expect(html).not.toContain("test-admin-key");
    expect(html).toContain("plan (plan)"); // the stage named plan still renders

    overrides["/api/admin/tokens"] = { body: { ...TOKENS, body: "SECRET-BODY", plan: "SECRET-PLAN" } };
    const user = await render();
    expect(user).not.toContain("SECRET-");
    expect(user).not.toContain("test-admin-key");
  });
});
