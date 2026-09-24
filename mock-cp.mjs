// Mock airv2 control plane for local dashboard testing.
import http from "node:http";
import { appendFileSync } from "node:fs";

const KEY = process.env.MOCK_ADMIN_KEY || "test-admin-key";
const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";
const REL_NEW = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const REL_OLD = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const HERMES_NEW = "29112bef099274229cadff79cdff7bf7b99c4b77";
const HERMES_OLD = "fcbd1076fcbd1076fcbd1076fcbd1076fcbd1076";

const receipts = [
  { user_id: U1, ts: "2026-02-10T10:00:00Z", kind: "run", status: "ok", label: "daily-brief", cost_usd: 0.12, box_seconds: 340 },
  { user_id: U1, ts: "2026-02-10T11:00:00Z", kind: "run", status: "error", label: "email-sync", cost_usd: 0.03, box_seconds: 45 },
  { user_id: U2, ts: "2026-02-10T12:00:00Z", kind: "run", status: "ok", label: "calendar-plan", cost_usd: 0.2, box_seconds: 512 },
];

function health(userId, memoryRequested, wakeRequested) {
  return {
    user_id: userId,
    window_days: 7,
    since: "2026-02-03T00:00:00Z",
    checked_at: "2026-02-10T12:00:00Z",
    memory: {
      enabled: true,
      status: memoryRequested ? "healthy" : "not_checked",
      checked_at: memoryRequested ? "2026-02-10T12:00:00Z" : null,
      woke: wakeRequested,
      healthy: memoryRequested,
      resources: 4,
      memories: 12,
      workspace_bytes: 524288,
      pending: 0,
      truncated: false,
    },
    hermes: {
      runs: 7,
      success: 6,
      failed: 1,
      other: 0,
      open: 0,
      stuck: 0,
      last_run_at: "2026-02-10T11:00:00Z",
      last_success_at: "2026-02-10T11:00:10Z",
      last_failure_at: "2026-02-09T18:00:05Z",
      p95_latency_ms: 820,
      failure_outcomes: { failed: 1 },
    },
    connectors: {
      total: 2,
      counts: { active: 2 },
      connections: [
        { provider: "composio", toolkit: "gmail", status: "active", connected_at: "2026-02-01T00:00:00Z" },
        { provider: "composio", toolkit: "googlecalendar", status: "active", connected_at: "2026-02-01T00:00:00Z" },
      ],
    },
    transport: {
      total: 9,
      received: 1,
      dispatched: 7,
      failed: 1,
      ignored: 0,
      queued: 1,
      oldest_queued_at: "2026-02-10T11:59:30Z",
      oldest_queued_age_seconds: 30,
      latest_received_at: "2026-02-10T11:59:30Z",
    },
    compute: {
      provider: "ascii",
      provider_box_id: userId === U1 ? "bx_alpha" : "bx_bravo",
      environment: "ubuntu",
      state: userId === U1 ? "ready" : "stopped",
      channel: "prod",
      template_version: userId === U1 ? HERMES_NEW : HERMES_OLD,
      baseline_version: userId === U1 ? "2026.02.10-abc1234" : "2026.01.28-9876fed",
      baseline_synced_at: "2026-02-10T09:30:00Z",
      target_version: "2026.02.10-abc1234",
      target_hermes_ref: HERMES_NEW,
      channel_updated_at: "2026-02-10T09:05:00Z",
      drift: userId === U1 ? "current" : "behind",
      last_active_at: "2026-02-10T10:00:00Z",
      stop_after: null,
      created_at: "2026-01-01T00:00:00Z",
      starts: 5,
      stops: 4,
      last_event_state: userId === U1 ? "ready" : "stopped",
      last_event_at: "2026-02-10T10:00:00Z",
      replacement_claimed_at: null,
      replacement_claim_status: "none",
    },
    spend: {
      prompt_tokens: 100000,
      completion_tokens: 30000,
      total_tokens: 130000,
      gateway_cost_usd: 2.11,
      speed_tier: "balanced",
      spend_mtd_usd: 3,
      monthly_cap_usd: 10,
      monthly_cap_ratio: 0.3,
      render_cents: 120,
      storage_bytes: 5000000,
      storage_cents_month: 1,
      ad_spend_cents: 0,
      ad_ceiling_cents: 1000,
      cortex_calls: 4,
      cortex_errors: 0,
    },
  };
}

const data = {
  "/api/admin/ops": {
    starts: { hour: 3, day: 17, hourly_ceiling: 20, daily_ceiling: 100, alerts: [] },
    lines: [],
  },
  "/api/admin/boxes": {
    window_days: 7,
    since: "2026-02-03T00:00:00Z",
    totals: { boxes: 2, by_state: { started: 1, stopped: 1 }, starts: 9, stops: 8, box_seconds: 3600 },
    users: [
      { user_id: U1, username: "alice", provider_box_id: "bx_alpha", state: "ready", provider: "ascii", environment: "ubuntu", channel: "prod", template_version: HERMES_NEW, baseline_version: "2026.02.10-abc1234", baseline_synced_at: "2026-02-10T09:30:00Z", last_active_at: "2026-02-10T10:00:00Z", starts: 5, stops: 4, runs: 12, box_seconds: 2400 },
      { user_id: U2, username: "bob", provider_box_id: "bx_bravo", state: "stopped", provider: "ascii", environment: "ubuntu", channel: "prod", template_version: HERMES_OLD, baseline_version: "2026.01.28-9876fed", baseline_synced_at: "2026-01-28T12:00:00Z", last_active_at: "2026-02-09T18:00:00Z", starts: 4, stops: 4, runs: 7, box_seconds: 1200 },
    ],
  },
  "/api/admin/deliveries": {
    days: 7,
    deliveries: [
      { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", user_id: U1, schedule_id: "dddddddd-dddd-4ddd-8ddd-ddddddddddd1", schedule_name: "site watch — checkout", channel: "imessage", disposition: "delivered", content_hash: "h1", excerpt: "checkout page is 500ing — woke you", created_at: "2026-02-10T09:58:00Z" },
      { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2", user_id: U1, schedule_id: "dddddddd-dddd-4ddd-8ddd-ddddddddddd1", schedule_name: "site watch — checkout", channel: "none", disposition: "suppressed_silent", content_hash: null, excerpt: null, created_at: "2026-02-10T09:53:00Z" },
      { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3", user_id: U1, schedule_id: "dddddddd-dddd-4ddd-8ddd-ddddddddddd2", schedule_name: "weekly digest", channel: "none", disposition: "suppressed_repeat", content_hash: "h2", excerpt: "same output as 6h ago", created_at: "2026-02-10T08:00:00Z" },
      { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4", user_id: U2, schedule_id: "dddddddd-dddd-4ddd-8ddd-ddddddddddd3", schedule_name: "inbox sweep", channel: "none", disposition: "suppressed_transient", content_hash: null, excerpt: "Operation interrupted", created_at: "2026-02-10T07:30:00Z" },
    ],
  },
  "/api/admin/fleet/releases": {
    releases: [
      { id: REL_NEW, version: "2026.02.10-abc1234", git_sha: "abc1234abc1234abc1234abc1234abc1234abc12", hermes_ref: HERMES_NEW, notes: "mini-app cards", created_at: "2026-02-10T09:00:00Z" },
      { id: REL_OLD, version: "2026.01.28-9876fed", git_sha: "9876fed9876fed9876fed9876fed9876fed98765", hermes_ref: HERMES_OLD, notes: null, created_at: "2026-01-28T11:00:00Z" },
    ],
  },
  "/api/admin/fleet/channels": {
    channels: [
      { name: "prod", release_id: REL_NEW, template_box_id: null, updated_at: "2026-02-10T09:05:00Z" },
      { name: "dev", release_id: REL_NEW, template_box_id: null, updated_at: "2026-02-10T09:05:00Z" },
    ],
  },
  "/api/admin/fleet/sync": {
    jobs: [
      { id: "job-2", channel: "prod", release_id: REL_NEW, state: "paused", include_hermes: true, wave_size: 2, canary_box_ids: ["bx_alpha"], failure_threshold: 2, failures: 1, created_at: "2026-02-10T09:10:00Z", updated_at: "2026-02-10T09:40:00Z" },
      { id: "job-1", channel: "prod", release_id: REL_OLD, state: "done", include_hermes: false, wave_size: 3, canary_box_ids: [], failure_threshold: 1, failures: 0, created_at: "2026-01-28T11:30:00Z", updated_at: "2026-01-28T12:10:00Z" },
    ],
    latest_job_boxes: [
      { job_id: "job-2", provider_box_id: "bx_alpha", state: "ok", is_canary: true, error: null, started_at: "2026-02-10T09:11:00Z", finished_at: "2026-02-10T09:30:00Z" },
      { job_id: "job-2", provider_box_id: "bx_bravo", state: "deferred", is_canary: false, error: "active conversation; retry next idle window", started_at: "2026-02-10T09:31:00Z", finished_at: "2026-02-10T09:31:05Z" },
      { job_id: "job-2", provider_box_id: "bx_charlie", state: "failed", is_canary: false, error: "box_direct_failed: Unable to connect", started_at: "2026-02-10T09:31:00Z", finished_at: "2026-02-10T09:39:00Z" },
      { job_id: "job-2", provider_box_id: "bx_delta", state: "syncing", is_canary: false, error: null, started_at: new Date(Date.now() - 4 * 60_000).toISOString(), finished_at: null },
      { job_id: "job-2", provider_box_id: "bx_echo", state: "pending", is_canary: false, error: null, started_at: null, finished_at: null },
    ],
  },
  // PlatformSettingsResponse (lib/types.ts): the Fleet page's "New user boxes"
  // panel reads it; POST /api/admin/settings lands in the generic POST handler.
  "/api/admin/settings": {
    box_default_provider: "ascii",
    effective_box_provider: "ascii",
  },
  "/api/admin/tokens": {
    window_days: 7,
    since: "2026-02-03T00:00:00Z",
    totals: { prompt_tokens: 150000, completion_tokens: 42000, cost_usd: 3.21 },
    users: [
      { user_id: U1, runs: 12, prompt_tokens: 100000, completion_tokens: 30000, total_tokens: 130000, cost_usd: 2.11 },
      { user_id: U2, runs: 7, prompt_tokens: 50000, completion_tokens: 12000, total_tokens: 62000, cost_usd: 1.1 },
    ],
  },
  "/api/admin/connectors": {
    statuses: ["pending", "active", "revoked", "error"],
    totals: { pending: 1, active: 3, revoked: 0, error: 1, unknown: 0 },
    toolkits: [
      { toolkit: "gmail", pending: 0, active: 2, revoked: 0, error: 0, total: 2, users: 2 },
      { toolkit: "googlecalendar", pending: 1, active: 1, revoked: 0, error: 1, total: 3, users: 2 },
    ],
  },
  "/api/admin/onboarding": {
    steps: ["welcome", "environment", "username", "email", "model", "selfies", "twin", "avatar", "imessage", "import", "onairos", "connect", "secrets", "stripe", "link", "agent", "walkthrough"],
    stale_after_ms: 60000,
    totals: { users: 2, mirrored: 1, cold: 1, stale: 1, completed: 0, cards_sent: 1 },
    funnel: {
      welcome: { done: 1, skipped: 0, todo: 0 },
      environment: { done: 1, skipped: 0, todo: 0 },
      username: { done: 0, skipped: 1, todo: 0 },
      email: { done: 0, skipped: 0, todo: 1 },
      model: { done: 0, skipped: 0, todo: 1 },
      selfies: { done: 0, skipped: 0, todo: 1 },
      twin: { done: 0, skipped: 0, todo: 1 },
      avatar: { done: 0, skipped: 0, todo: 1 },
      imessage: { done: 0, skipped: 0, todo: 1 },
      import: { done: 0, skipped: 0, todo: 1 },
      onairos: { done: 0, skipped: 0, todo: 1 },
      connect: { done: 0, skipped: 0, todo: 1 },
      secrets: { done: 0, skipped: 0, todo: 1 },
      stripe: { done: 0, skipped: 0, todo: 1 },
      link: { done: 0, skipped: 0, todo: 1 },
      agent: { done: 0, skipped: 0, todo: 1 },
      walkthrough: { done: 0, skipped: 0, todo: 1 },
    },
    users: [
      { user_id: U1, username: "amy", created_at: "2026-01-01T00:00:00Z", done: 2, skipped: 1, todo: 14, next_step: "email", mirror_refreshed_at: "2026-02-10T10:00:00Z", card_sent_at: "2026-02-09T09:00:00Z" },
      { user_id: U2, username: "bob", created_at: "2026-01-02T00:00:00Z", done: 0, skipped: 0, todo: 17, next_step: "welcome", mirror_refreshed_at: null, card_sent_at: null },
    ],
  },
  "/api/admin/costs": {
    window_days: 30,
    users: [
      { user_id: U1, render_cents: 120, storage_bytes: 5000000, storage_cents_month: 4, ad_spend_cents: 0, ad_ceiling_cents: 1000 },
      { user_id: U2, render_cents: 40, storage_bytes: 900000, storage_cents_month: 1, ad_spend_cents: 250, ad_ceiling_cents: null },
    ],
  },
  "/api/admin/feedback": {
    counts: { open: 2, closed: 1 },
    items: [
      { id: "fb-1", user_id: U1, kind: "bug", title: "Export broken", body: "CSV empty", status: "open", created_at: "2026-02-09T10:00:00Z" },
      { id: "fb-2", user_id: U2, kind: "idea", title: "Dark mode", body: null, status: "open", created_at: "2026-02-08T10:00:00Z" },
      { id: "fb-3", user_id: U2, kind: "bug", title: "Old issue", body: "fixed", status: "closed", created_at: "2026-02-01T10:00:00Z" },
    ],
  },
};

const CSV_COLS = ["user_id", "ts", "kind", "status", "label", "cost_usd", "box_seconds"];

// Local UI fixtures only; no real compute actions are performed.
function migration(user_id, phase, direction = "box_to_tenki") {
  return {
    id: `migration-${user_id}`, user_id, phase, direction, leg: "out",
    wake_at: "2026-09-10T12:05:00Z", error_code: null,
    work_paused_at: "2026-09-10T12:01:00Z",
    work_resumed_at: "2026-09-10T12:01:30Z",
    created_at: "2026-09-10T12:00:00Z", updated_at: "2026-09-10T12:04:00Z",
    request_key: null, source_provider: "ascii", target_provider: "tenki",
    source_box_id: "bx_source", candidate_box_id: "tk_candidate",
    expected_generation: 7, worker_lease_until: null, error_detail: null,
    cancel_requested_at: null, cleanup_approved_at: null,
    route_committed_at: null, activated_at: null,
    retention_until: "2026-09-11T12:00:00Z", completed_at: null, stats: {},
  };
}
const migrations = new Map([
  [U1, migration(U1, "precopy")],
  [U2, migration(U2, "completed")],
  ...["waiting_for_idle", "cleanup_pending", "route_committed", "activating", "observing"].map(
    phase => [phase, migration(phase, phase)],
  ),
  ["post-error", migration("post-error", "precopy")],
]);
data["/api/admin/users"] = {
  users: [ [U1, "alice"], [U2, "bob"] ].map(([user_id, username]) => ({
    user_id, username, status: "active", created_at: "2026-01-01T00:00:00Z", handles: [],
  })),
};
// ---- V12 operator view (admin goal.md §5; airv2 goal-create-v12 §12) -------
// Deployments, Create ops, tokens?group= and timeseries?series= fixtures. The
// deployment rows are mutable so the revoke/renew/suspend POSTs below change
// what the next GET shows (AD1 exit: revoke → the row re-renders "dev —").
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const CREATE_DEV_TTL_DAYS = 14;
const CP_GIT_SHA = "f6267a7c9d1e4b2a8f30d5e6c7b8a9f0e1d2c3b4";
const iso = (offsetMs) => new Date(Date.now() + offsetMs).toISOString();

function sendJson(res, code, body) {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function windowDays(query) {
  const days = Number(query.get("days"));
  return Number.isInteger(days) && days >= 1 && days <= 365 ? days : 7;
}

// `owner` is the mock's filter key for ?user_id= and is stripped from rows
// (the §5 row carries username, not user_id).
const apps = [
  {
    owner: U1,
    slug: "alice-tour", username: "alice", appname: "tour", lane: "vibe",
    status: "published", visibility: "public", listed: true,
    dev_version: "0.3.0", dev_expires_at: iso(2 * DAY_MS),
    live_version: "0.2.0", draft_version: "0.3.0",
    last_build: { status: "succeeded", finished_at: iso(-3 * HOUR_MS), findings_hard: 0 },
    qa_score: 88, tests: { passed: 4, total: 4 },
    worker_sha256_prefix: "3f9c2a1", functions_status: "live",
    mirrored_at: iso(-170 * 60_000),
  },
  {
    owner: U2,
    slug: "bob-notes", username: "bob", appname: "notes", lane: "drop",
    status: "draft", visibility: "private", listed: false,
    dev_version: null, dev_expires_at: null,
    live_version: null, draft_version: "0.1.0",
    last_build: { status: "failed", finished_at: iso(-40 * 60_000), findings_hard: 2 },
    qa_score: 61, tests: { passed: 1, total: 3 },
    worker_sha256_prefix: null, functions_status: "disabled",
    mirrored_at: null,
  },
];

/** The §5 row: everything but the mock-only owner key. */
const publicRow = (app) => Object.fromEntries(Object.entries(app).filter(([key]) => key !== "owner"));

function devLive(app, now) {
  return app.dev_version !== null && app.dev_expires_at !== null && Date.parse(app.dev_expires_at) > now;
}

function appTotals(now) {
  const totals = { total: apps.length, dev_live: 0, prod_live: 0, drafts_only: 0, expiring_7d: 0 };
  for (const app of apps) {
    const dev = devLive(app, now);
    if (dev) totals.dev_live += 1;
    if (app.live_version !== null) totals.prod_live += 1;
    if (!dev && app.live_version === null && app.draft_version !== null) totals.drafts_only += 1;
    if (dev && Date.parse(app.dev_expires_at) - now < 7 * DAY_MS) totals.expiring_7d += 1;
  }
  return totals;
}

function deployments(query) {
  const now = Date.now();
  const channel = query.get("channel");
  const userId = query.get("user_id");
  const limit = Number(query.get("limit"));
  let rows = apps;
  if (channel === "dev") rows = rows.filter((app) => devLive(app, now));
  else if (channel === "prod") rows = rows.filter((app) => app.live_version !== null);
  if (userId) rows = rows.filter((app) => app.owner === userId);
  if (Number.isInteger(limit) && limit > 0) rows = rows.slice(0, limit);
  return {
    control_plane: { git_sha: CP_GIT_SHA, deployed_at: iso(-6 * HOUR_MS), region: "iad1" },
    kit: { version: "0.12.3", restricted_version: "0.12.3-r1" },
    dispatcher: { healthy: true, checked_at: new Date(now - 45_000).toISOString() },
    // The same channel rows /api/admin/fleet/channels serves, so /deployments
    // and /fleet always agree on which release each channel points at.
    channels: data["/api/admin/fleet/channels"].channels,
    apps: appTotals(now),
    rows: rows.map(publicRow),
  };
}

// Same fixture for every window (window_days is echoed) so the home row's
// builds(24h) and /create's 7d panel read the same numbers; funnel.production
// (1) equals deployments.apps.prod_live (A6).
function createOps(query) {
  return {
    window_days: windowDays(query),
    funnel: {
      asking: 3, planning: 2, plan_sent: 2, revising: 1, confirmed: 2, building: 1, qa: 1, testing: 1,
      dev_ready: 1, finalizing: 1, decision_sent: 1, production: 1, failed: 1, abandoned: 2,
    },
    medians_s: { first_question: 42, plan: 310, confirm_to_dev: 1260, dev_to_prod: 7200 },
    builds: { total: 11, failed: 4, by_rule: { "csp.host-reference": 3, "tests.locked-removed": 1 } },
    qa: { p50: 84, p90: 93, below_70: 1 },
    tests: { declared: 9, passed_ratio: 0.78 },
    progress_relay: { cards_updated: 240, text_fallbacks: 3, update_failures: 6 },
    mirror: { ok: 1, failed: 0 },
    budget_exhausted: 1,
    by_template: { landing: 2, store: 1, tool: 1 },
  };
}

// ---- V13 job ops (airv2 goal-create-v13 §12) -------------------------------
// create_jobs rollup for the /create page's Deployments/Failures/token-use/
// skill-use panels. Job rows are metadata only: ids, states, step names,
// rule ids, percents — never prompt or code text.
const CREATE_JOBS = [
  { id: "5f7a1c2e-0001-4000-8000-000000000001", app_id: "app-alice-tour", kind: "initial", state: "live", step: "publish", percent: 100, round: 0, error_rule: null, skill_ver: 5, dev_url: "https://alice-tour.dev.wzrd.tech", created_at: iso(-26 * HOUR_MS), finished_at: iso(-25 * HOUR_MS) },
  { id: "5f7a1c2e-0002-4000-8000-000000000002", app_id: "app-alice-tour", kind: "change", state: "running", step: "check", percent: 71, round: 1, error_rule: null, skill_ver: 5, dev_url: null, created_at: iso(-2 * HOUR_MS), finished_at: null },
  { id: "5f7a1c2e-0003-4000-8000-000000000003", app_id: "app-bob-notes", kind: "initial", state: "stuck", step: "build", percent: 55, round: 3, error_rule: "tests.locked-removed", skill_ver: 4, dev_url: null, created_at: iso(-30 * HOUR_MS), finished_at: iso(-29 * HOUR_MS) },
  { id: "5f7a1c2e-0004-4000-8000-000000000004", app_id: "app-bob-notes", kind: "change", state: "failed", step: "code", percent: 12, round: 0, error_rule: "turn.timeout", skill_ver: 4, dev_url: null, created_at: iso(-50 * HOUR_MS), finished_at: iso(-49 * HOUR_MS) },
  { id: "5f7a1c2e-0005-4000-8000-000000000005", app_id: "app-alice-tour", kind: "initial", state: "superseded", step: "code", percent: 33, round: 0, error_rule: null, skill_ver: 5, dev_url: null, created_at: iso(-27 * HOUR_MS), finished_at: iso(-26 * HOUR_MS) },
  { id: "5f7a1c2e-0006-4000-8000-000000000006", app_id: "app-carol-games", kind: "initial", state: "queued", step: "admit", percent: 2, round: 0, error_rule: null, skill_ver: 5, dev_url: null, created_at: iso(-20 * 60_000), finished_at: null },
  { id: "5f7a1c2e-0007-4000-8000-000000000007", app_id: "app-dave-shop", kind: "initial", state: "cancelled", step: "check", percent: 64, round: 1, error_rule: null, skill_ver: 4, dev_url: null, created_at: iso(-70 * HOUR_MS), finished_at: iso(-69 * HOUR_MS) },
];

function createJobs(query) {
  const days = windowDays(query);
  const since = Date.now() - days * DAY_MS;
  const rows = CREATE_JOBS.filter((job) => Date.parse(job.created_at) >= since);
  const byState = {};
  const byKind = {};
  const bySkill = {};
  const failures = [];
  let devLive = 0;
  for (const job of rows) {
    byState[job.state] = (byState[job.state] ?? 0) + 1;
    byKind[job.kind] = (byKind[job.kind] ?? 0) + 1;
    if (job.skill_ver !== null) {
      const ver = String(job.skill_ver);
      bySkill[ver] = (bySkill[ver] ?? 0) + 1;
    }
    if (job.state === "live" && job.dev_url !== null) devLive += 1;
    if (job.state === "stuck" || job.state === "failed" || job.state === "cancelled") {
      failures.push({ id: job.id, app_id: job.app_id, state: job.state, step: job.step, rule: job.error_rule, round: job.round, created_at: job.created_at });
    }
  }
  failures.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  // Token use folds the same TOKEN_LEDGER the Tokens page reads, limited to
  // create:<slug> projects (V13 §14 metering: plan → brief, build → code/fix).
  const createRows = TOKEN_LEDGER.filter((row) => row.project.startsWith("create:"));
  const fold = (key) => {
    const byKey = new Map();
    for (const row of createRows) {
      const acc = byKey.get(row[key]) ?? { key: row[key], runs: 0, prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cost_usd: 0, cost_estimated: false };
      acc.runs += row.runs;
      acc.prompt_tokens += row.prompt_tokens;
      acc.completion_tokens += row.completion_tokens;
      acc.total_tokens += row.prompt_tokens + row.completion_tokens;
      acc.cost_usd = cents(acc.cost_usd + row.cost_usd);
      acc.cost_estimated ||= row.cost_estimated;
      byKey.set(row[key], acc);
    }
    return [...byKey.values()].sort((a, b) => b.total_tokens - a.total_tokens);
  };
  return {
    window_days: days,
    jobs: { total: rows.length, by_state: byState, by_kind: byKind, dev_live: devLive, by_skill_ver: bySkill, failures: failures.slice(0, 25) },
    token_usage: { by_stage: fold("stage"), by_project: fold("project").slice(0, 20) },
    skill_use: { upgrades_queued: 2, by_skill_ver: bySkill },
  };
}

function createHealth() {
  return {
    ok: false,
    checks: { lane_env: "ok", bridge_secret: "ok", jobs_origin: "ok", live_token_secret: "ok", worker_http: "fail" },
    reasons: ["worker_http: fail"],
    skill_version_min: 5,
    max_fix_rounds: 3,
    compile_max_per_turn: 5,
    dev_origin_suffix: "dev.wzrd.tech",
  };
}

// One ledger of run buckets; every tokens?group= is a fold over it, so the
// grouped sums equal the ungrouped totals by construction (asserted at boot).
// Astra plan turns are priced from the OpenAI list until GMI confirms a rate
// (goal-create-v12 §7) — those rows carry cost_estimated: true. Runs outside
// Create have no stage/project and land in the "chat" bucket.
const TOKEN_GROUPS = ["user", "model", "family", "provider", "tier", "lane", "stage", "project"];
const TOKEN_LEDGER = [
  [U1, "openai/gpt-6-astra", "gmi", "gmi", "create-deep", "create", "plan", "create:alice-tour", 3, 40000, 8000, 0.81, true],
  [U1, "zai-org/GLM-5.3-Flash", "gmi", "gmi", "create-balanced", "create", "build", "create:alice-tour", 4, 35000, 14000, 0.7, false],
  [U1, "zai-org/GLM-5.3-Flash", "gmi", "gmi", "create-fast", "create", "review", "create:alice-tour", 2, 10000, 3000, 0.2, false],
  [U1, "gpt-5.6-luna", "openai", "openai", "balanced", "chat", "chat", "chat", 3, 15000, 5000, 0.4, false],
  [U2, "openai/gpt-6-astra", "gmi", "gmi", "create-deep", "create", "plan", "create:bob-notes", 2, 20000, 4000, 0.4, true],
  [U2, "zai-org/GLM-5.3-Flash", "gmi", "gmi", "create-balanced", "create", "build", "create:bob-notes", 2, 15000, 4000, 0.3, false],
  [U2, "zai-org/GLM-5.3-Flash", "gmi", "gmi", "create-fast", "create", "review", "create:bob-notes", 1, 5000, 1500, 0.1, false],
  [U2, "gpt-5.6-luna", "openai", "openai", "balanced", "chat", "chat", "chat", 2, 10000, 2500, 0.3, false],
].map(([user, model, family, provider, tier, lane, stage, project, runs, prompt_tokens, completion_tokens, cost_usd, cost_estimated]) =>
  ({ user, model, family, provider, tier, lane, stage, project, runs, prompt_tokens, completion_tokens, cost_usd, cost_estimated }));

const cents = (usd) => Math.round(usd * 100) / 100;

function tokenGroups(group) {
  const byKey = new Map();
  for (const row of TOKEN_LEDGER) {
    const key = row[group];
    const acc = byKey.get(key) ?? { key, runs: 0, prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cost_usd: 0, cost_estimated: false };
    acc.runs += row.runs;
    acc.prompt_tokens += row.prompt_tokens;
    acc.completion_tokens += row.completion_tokens;
    acc.total_tokens += row.prompt_tokens + row.completion_tokens;
    acc.cost_usd = cents(acc.cost_usd + row.cost_usd);
    acc.cost_estimated ||= row.cost_estimated;
    byKey.set(key, acc);
  }
  return [...byKey.values()].sort((a, b) => b.total_tokens - a.total_tokens);
}

function tokens(query) {
  const days = windowDays(query);
  const base = { ...data["/api/admin/tokens"], window_days: days, since: iso(-days * DAY_MS) };
  const group = query.get("group");
  return group === null ? base : { ...base, group, groups: tokenGroups(group) };
}

function assertTokenLedgerReconciles() {
  const { totals, users } = data["/api/admin/tokens"];
  for (const group of TOKEN_GROUPS) {
    const sum = tokenGroups(group).reduce(
      (acc, g) => ({ prompt: acc.prompt + g.prompt_tokens, completion: acc.completion + g.completion_tokens, cost: cents(acc.cost + g.cost_usd) }),
      { prompt: 0, completion: 0, cost: 0 },
    );
    if (sum.prompt !== totals.prompt_tokens || sum.completion !== totals.completion_tokens || sum.cost !== totals.cost_usd) {
      throw new Error(`token fixture: group=${group} sums ${JSON.stringify(sum)} do not equal totals ${JSON.stringify(totals)}`);
    }
  }
  for (const user of users) {
    const g = tokenGroups("user").find((row) => row.key === user.user_id);
    if (!g || g.runs !== user.runs || g.prompt_tokens !== user.prompt_tokens || g.completion_tokens !== user.completion_tokens || g.cost_usd !== user.cost_usd) {
      throw new Error(`token fixture: group=user row for ${user.user_id} does not match the per-user fixture`);
    }
  }
}
assertTokenLedgerReconciles();

// Seven daily values per series; over ?days=7 they sum to the tokens totals
// (19 runs, 150k/42k tokens, $3.21) and the boxes totals (9 starts, 8 stops,
// 3600 box seconds). builds sum to the Create fixture's 11. Longer windows
// cycle the pattern; the 24h window spreads it over every third hour.
const SERIES_BASE = {
  runs: [2, 3, 1, 4, 2, 3, 4],
  prompt_tokens: [12000, 25000, 8000, 30000, 15000, 24000, 36000],
  completion_tokens: [3000, 7000, 2000, 9000, 4000, 7000, 10000],
  cost_usd: [0.25, 0.55, 0.16, 0.66, 0.31, 0.5, 0.78],
  box_seconds: [400, 700, 200, 900, 500, 300, 600],
  starts: [1, 2, 1, 2, 1, 1, 1],
  stops: [1, 1, 1, 2, 1, 1, 1],
};
const SERIES_EXTRA = {
  builds: [1, 2, 1, 3, 0, 2, 2],
  dev_releases: [0, 1, 0, 1, 0, 0, 1],
  publishes: [0, 0, 0, 1, 0, 0, 0],
};
const SERIES_NAMES = new Set(["tokens", "cost", ...Object.keys(SERIES_EXTRA)]);

function timeseries(query) {
  const days = windowDays(query);
  const requested = (query.get("series") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const unknown = requested.filter((s) => !SERIES_NAMES.has(s));
  if (unknown.length) return { error: `unknown series: ${unknown.join(",")}` };
  const extras = requested.filter((s) => s in SERIES_EXTRA);
  const bucket = days <= 1 ? "hour" : "day";
  const step = bucket === "hour" ? HOUR_MS : DAY_MS;
  const count = bucket === "hour" ? 24 : days;
  const end = Math.floor(Date.now() / step) * step;
  const start = end - (count - 1) * step;
  const at = (arr, i) => (bucket === "hour" ? (i % 3 === 0 ? arr[(i / 3) % arr.length] : 0) : arr[i % arr.length]);
  const points = Array.from({ length: count }, (_, i) => {
    const point = { ts: new Date(start + i * step).toISOString() };
    for (const [key, arr] of Object.entries(SERIES_BASE)) point[key] = at(arr, i);
    for (const key of extras) point[key] = at(SERIES_EXTRA[key], i);
    return point;
  });
  return { window_days: days, since: new Date(start).toISOString(), bucket, user_id: query.get("user_id"), points };
}

const CREATE_APP_ACTION = /^\/api\/admin\/create\/apps\/([a-z0-9][a-z0-9_-]{0,63})\/(dev|suspend)$/;

http
  .createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    console.log(`${req.method} ${req.url} auth_valid=${req.headers.authorization === `Bearer ${KEY}`}`);
    if (req.headers.authorization !== `Bearer ${KEY}`) {
      res.writeHead(401, { "content-type": "application/json" });
      return res.end(JSON.stringify({ error: "unauthorized" }));
    }
    if (url.pathname === "/api/admin/migrations") {
      const send = (code, body) => {
        res.writeHead(code, { "content-type": "application/json" });
        res.end(JSON.stringify(body));
      };
      if (req.method === "POST") {
        let raw = "";
        req.on("data", chunk => raw += chunk);
        return req.on("end", () => {
          const body = JSON.parse(raw);
          const code = body.user_id === "post-error" ? 409 : 200;
          appendFileSync("/tmp/migration-posts.jsonl", JSON.stringify({body, code, auth_valid: true}) + "\n");
          if (code === 409) return send(code, {error: "mock_cutover_refused: live operations still draining"});
          if (body.op === "prepare") migrations.set(body.user_id, migration(body.user_id, "waiting_for_idle", body.direction));
          const m = migrations.get(body.user_id);
          if (m && body.op === "cutover") m.phase = "observing";
          if (m && body.op === "cancel") migrations.delete(body.user_id);
          if (m && body.op === "return") { m.phase = "return_requested"; m.leg = "back"; }
          if (m && body.op === "cleanup") m.cleanup_approved_at = "2026-09-10T12:06:00Z";
          send(200, {ok: true});
        });
      }
      const userId = url.searchParams.get("user_id");
      if (!userId) return send(200, { migrations: [...migrations.values()] });
      const m = migrations.get(userId) ?? null;
      return send(200, {
        migration: m,
        targets: m ? [
          {role: "source", provider: "ascii", provider_box_id: "bx_source", hosted_url: null, credentials_sealed: null},
          {role: "candidate", provider: "tenki", provider_box_id: "tk_candidate", hosted_url: null, credentials_sealed: "mock-sealed-value"},
        ] : [],
        liveOperations: m ? 2 : 0,
        control: {admission: "open", routing_generation: 7, active_migration_id: m?.id ?? null, fence_epoch: 3},
      });
    }
    if (req.method === "GET" && url.pathname === "/api/admin/deployments") {
      const channel = url.searchParams.get("channel");
      if (channel !== null && channel !== "dev" && channel !== "prod") {
        return sendJson(res, 400, { error: "channel must be dev or prod" });
      }
      return sendJson(res, 200, deployments(url.searchParams));
    }
    if (req.method === "GET" && url.pathname === "/api/admin/create/jobs") {
      return sendJson(res, 200, createJobs(url.searchParams));
    }
    if (req.method === "GET" && url.pathname === "/api/admin/create/health") {
      return sendJson(res, 200, createHealth());
    }
    if (req.method === "GET" && url.pathname === "/api/admin/create") {
      return sendJson(res, 200, createOps(url.searchParams));
    }
    if (req.method === "GET" && url.pathname === "/api/admin/tokens") {
      const group = url.searchParams.get("group");
      if (group !== null && !TOKEN_GROUPS.includes(group)) {
        return sendJson(res, 400, { error: `group must be one of ${TOKEN_GROUPS.join("|")}` });
      }
      return sendJson(res, 200, tokens(url.searchParams));
    }
    if (req.method === "GET" && url.pathname === "/api/admin/timeseries") {
      const body = timeseries(url.searchParams);
      return sendJson(res, body.error ? 400 : 200, body);
    }
    const appAction = url.pathname.match(CREATE_APP_ACTION);
    if (appAction) {
      const [, slug, kind] = appAction;
      if (req.method !== "POST") return sendJson(res, 405, { error: "method not allowed" });
      let raw = "";
      req.on("data", (chunk) => (raw += chunk));
      return req.on("end", () => {
        console.log(`  body ${raw}`);
        let body = {};
        try {
          body = raw ? JSON.parse(raw) : {};
        } catch {
          return sendJson(res, 400, { error: "invalid json body" });
        }
        const app = apps.find((row) => row.slug === slug);
        if (!app) return sendJson(res, 404, { error: `app ${slug} not found` });
        const action = kind === "suspend" ? "suspend" : body.action;
        if (kind === "dev" && action !== "revoke" && action !== "renew") {
          return sendJson(res, 400, { error: "action must be revoke or renew" });
        }
        if (action === "revoke") {
          app.dev_version = null;
          app.dev_expires_at = null;
        } else if (action === "renew") {
          if (app.dev_version === null) {
            return sendJson(res, 409, { error: `app ${slug} has no dev release to renew` });
          }
          app.dev_expires_at = iso(CREATE_DEV_TTL_DAYS * DAY_MS);
        } else {
          app.status = "suspended";
          if (app.functions_status !== "disabled") app.functions_status = "suspended";
        }
        console.log(`  create app ${slug} ${action} -> dev=${app.dev_version ?? "—"} status=${app.status}`);
        sendJson(res, 200, { ok: true, slug, action });
      });
    }
    if (url.pathname === "/api/admin/traces") {
      const format = url.searchParams.get("format") ?? "json";
      const userId = url.searchParams.get("user_id");
      const rows = userId ? receipts.filter((r) => r.user_id === userId) : receipts;
      if (format === "csv") {
        const lines = [CSV_COLS.join(","), ...rows.map((r) => CSV_COLS.map((c) => r[c]).join(","))];
        res.writeHead(200, { "content-type": "text/csv; charset=utf-8" });
        return res.end(lines.join("\n") + "\n");
      }
      if (format === "jsonl") {
        res.writeHead(200, { "content-type": "application/x-ndjson" });
        return res.end(rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
      }
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ user_id: userId ?? null, count: rows.length, receipts: rows }));
    }
    if (url.pathname === "/api/admin/health") {
      const userId = url.searchParams.get("user_id") ?? U1;
      const body = health(
        userId,
        url.searchParams.get("memory") === "1",
        url.searchParams.get("wake") === "1",
      );
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify(body));
    }
    if (req.method === "POST" || req.method === "PATCH") {
      let raw = "";
      req.on("data", (chunk) => (raw += chunk));
      return req.on("end", () => {
        console.log(`  body ${raw}`);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      });
    }
    const body = data[url.pathname];
    if (!body) {
      res.writeHead(404, { "content-type": "application/json" });
      return res.end(JSON.stringify({ error: "not found" }));
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  })
  .listen(4600, () => console.log("mock control plane on :4600"));
