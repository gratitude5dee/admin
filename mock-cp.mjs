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
data["/api/admin/timeseries"] = { bucket: "day", points: [] };

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
