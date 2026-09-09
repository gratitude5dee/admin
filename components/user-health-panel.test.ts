import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { HealthResponse } from "@/lib/types";
import { UserHealthPanel } from "./user-health-panel";

Object.assign(globalThis, { React });

const health: HealthResponse = {
  user_id: "u1",
  window_days: 7,
  since: "2026-09-01T00:00:00.000Z",
  checked_at: "2026-09-08T00:00:00.000Z",
  memory: {
    enabled: true,
    status: "not_checked",
    checked_at: null,
    woke: false,
    healthy: false,
    resources: 2,
    memories: 3,
    workspace_bytes: 4,
    pending: 0,
    truncated: false,
  },
  hermes: {
    runs: 5,
    success: 4,
    failed: 1,
    other: 0,
    open: 0,
    stuck: 0,
    last_run_at: null,
    last_success_at: null,
    last_failure_at: null,
    p95_latency_ms: 100,
    failure_outcomes: {},
  },
  connectors: {
    total: 1,
    counts: { active: 1 },
    connections: [
      {
        provider: "composio",
        toolkit: "slack",
        status: "active",
        connected_at: null,
      },
    ],
  },
  transport: {
    total: 2,
    received: 1,
    dispatched: 1,
    failed: 0,
    ignored: 0,
    queued: 1,
    oldest_queued_at: null,
    oldest_queued_age_seconds: 30,
    latest_received_at: null,
  },
  compute: {
    provider: "ascii",
    provider_box_id: "bx_1",
    environment: "ubuntu",
    state: "ready",
    channel: "prod",
    template_version: "hermes-1",
    baseline_version: "release-1",
    baseline_synced_at: null,
    target_version: "release-1",
    target_hermes_ref: "hermes-1",
    channel_updated_at: null,
    drift: "current",
    last_active_at: null,
    stop_after: null,
    created_at: null,
    starts: 1,
    stops: 0,
    last_event_state: "ready",
    last_event_at: null,
    replacement_claimed_at: null,
    replacement_claim_status: "none",
  },
  spend: {
    prompt_tokens: 10,
    completion_tokens: 5,
    total_tokens: 15,
    gateway_cost_usd: 0.01,
    speed_tier: "fast",
    spend_mtd_usd: 1,
    monthly_cap_usd: 10,
    monthly_cap_ratio: 0.1,
    render_cents: 0,
    storage_bytes: 0,
    storage_cents_month: 0,
    ad_spend_cents: 0,
    ad_ceiling_cents: null,
    cortex_calls: 1,
    cortex_errors: 0,
  },
};

describe("UserHealthPanel", () => {
  it("renders metadata layers and explicit live-check controls", () => {
    const html = renderToStaticMarkup(
      createElement(UserHealthPanel, {
        health: { data: health, error: null },
        userId: "u1",
        days: 7,
        memoryRequested: false,
        wakeRequested: false,
      }),
    );

    expect(html).toContain("Live memory checks run only");
    expect(html).toContain("Check live memory");
    expect(html).toContain("Wake and check memory");
    expect(html).toContain('name="health_memory" value="1"');
    expect(html).toContain('name="health_wake" value="1"');
    expect(html).not.toContain("<a ");
    expect(html).toContain("connector state");
    expect(html).toContain("transport and lifecycle");
    expect(html).toContain("cost and quota");
  });

  it("renders load failures instead of health data", () => {
    const html = renderToStaticMarkup(
      createElement(UserHealthPanel, {
        health: { data: null, error: "control plane unavailable" },
        userId: "u1",
        days: 7,
        memoryRequested: false,
        wakeRequested: false,
      }),
    );

    expect(html).toContain("Failed to load: control plane unavailable");
    expect(html).not.toContain("Wake and check memory");
  });
});
