import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
// dither-kit charts paint on a canvas; stand in with inert markup.
vi.mock("@/components/charts", () => ({
  LabeledBarChart: () => createElement("div", { "data-chart": "bar" }),
  ActivityAreaChart: () => createElement("div", { "data-chart": "area" }),
  BreakdownPieChart: () => createElement("div", { "data-chart": "pie" }),
}));

import BoxesPage from "./page";

Object.assign(globalThis, { React });

const OPS = { starts: { hour: 3, day: 40, hourly_ceiling: 600, daily_ceiling: 1500, alerts: [] } };
const BOXES = { window_days: 7, since: "2026-09-10T00:00:00Z", totals: { boxes: 0, by_state: {}, starts: 0, stops: 0, box_seconds: 0 }, users: [] };
const SERIES = { window_days: 7, since: "2026-09-10T00:00:00Z", bucket: "day", user_id: null, points: [] };
const DEPLOYMENTS = {
  control_plane: { git_sha: null, deployed_at: null, region: null },
  kit: { version: "0.12.3", restricted_version: null },
  dispatcher: { healthy: true, checked_at: null },
  channels: [],
  apps: { total: 2, dev_live: 1, prod_live: 1, drafts_only: 1, expiring_7d: 1 },
  rows: [],
};
const CREATE = {
  window_days: 1,
  funnel: { asking: 0, planning: 0, plan_sent: 0, revising: 0, confirmed: 0, building: 0, qa: 0, testing: 0, dev_ready: 0, finalizing: 0, decision_sent: 0, production: 1, failed: 0, abandoned: 0 },
  medians_s: { first_question: null, plan: null, confirm_to_dev: null, dev_to_prod: null },
  builds: { total: 11, failed: 4, by_rule: {} },
  qa: { p50: null, p90: null, below_70: 0 },
  tests: { declared: 0, passed_ratio: null },
  progress_relay: { cards_updated: 0, text_fallbacks: 0, update_failures: 0 },
  mirror: { ok: 0, failed: 0 },
  budget_exhausted: 0,
  by_template: {},
};

async function render(): Promise<string> {
  const tree = await BoxesPage({ searchParams: Promise.resolve({}) });
  return renderToStaticMarkup(tree);
}

function count(html: string, needle: string): number {
  return html.split(needle).length - 1;
}

describe("/ home page — Deployments and Create row (§3.4)", () => {
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
      const bodies: Record<string, unknown> = {
        "/api/admin/ops": OPS,
        "/api/admin/boxes": BOXES,
        "/api/admin/timeseries": SERIES,
        "/api/admin/deployments": DEPLOYMENTS,
        "/api/admin/create": CREATE,
        "/api/admin/users": { users: [] },
      };
      const body = bodies[url.pathname];
      return body
        ? new Response(JSON.stringify(body))
        : new Response(JSON.stringify({ error: "not found" }), { status: 404 });
    });
  });
  afterEach(() => {
    delete process.env.CONTROL_PLANE_URL;
    delete process.env.ADMIN_API_KEY;
    vi.restoreAllMocks();
  });

  it("reads deployment totals and the 24h Create window and links each stat to its page", async () => {
    const html = await render();
    expect(requested).toContain("/api/admin/deployments?limit=1");
    expect(requested).toContain("/api/admin/create?days=1");
    expect(html).toContain("Deployments and Create");

    expect(html).toMatch(/<a class="[^"]*" href="\/deployments\?channel=dev"><div[^>]*><div[^>]*>dev releases live<\/div><div class="[^"]*text-orange-400">1</);
    expect(html).toContain("1 expiring within 7d · /deployments →");
    expect(html).toMatch(/<a class="[^"]*" href="\/deployments\?channel=prod"><div[^>]*><div[^>]*>production apps<\/div><div class="[^"]*text-emerald-400">1</);
    expect(html).toContain("of 2 apps · /deployments →");
    expect(html).toMatch(/<a class="[^"]*" href="\/create\?days=1"><div[^>]*><div[^>]*>builds \(24h\)<\/div><div class="[^"]*text-pink-400">11</); // 4/11 failed > 10%
    expect(html).toContain("4 failed · /create →");
  });

  it("reads green with nothing expiring and blue builds under the failure threshold", async () => {
    overrides["/api/admin/deployments"] = { body: { ...DEPLOYMENTS, apps: { ...DEPLOYMENTS.apps, expiring_7d: 0 } } };
    overrides["/api/admin/create"] = { body: { ...CREATE, builds: { total: 10, failed: 1, by_rule: {} } } };
    const html = await render();
    expect(html).toMatch(/dev releases live<\/div><div class="[^"]*text-emerald-400">1</);
    expect(html).toContain("none expiring within 7d");
    expect(html).toMatch(/builds \(24h\)<\/div><div class="[^"]*text-sky-400">10</);
  });

  it("fails per source: a deployments 500 leaves the builds stat, and vice versa", async () => {
    overrides["/api/admin/deployments"] = { body: { error: "boom" }, status: 500 };
    let html = await render();
    expect(count(html, "Failed to load: control plane returned 500")).toBe(1);
    expect(html).toContain('href="/create?days=1"');
    expect(html).not.toContain('href="/deployments?channel=prod"');
    expect(html).not.toContain("boom");

    overrides = { "/api/admin/create": { body: { error: "boom" }, status: 502 } };
    html = await render();
    expect(count(html, "Failed to load: control plane returned 502")).toBe(1);
    expect(html).toContain('href="/deployments?channel=prod"');
    expect(html).not.toContain('href="/create?days=1"');
  });

  it("never renders the bearer key", async () => {
    const html = await render();
    expect(html).not.toContain("test-admin-key");
  });
});
