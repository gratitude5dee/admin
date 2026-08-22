// Mock airv2 control plane for local dashboard testing.
import http from "node:http";

const KEY = process.env.MOCK_ADMIN_KEY || "test-admin-key";
const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";

const receipts = [
  { user_id: U1, ts: "2026-02-10T10:00:00Z", kind: "run", status: "ok", label: "daily-brief", cost_usd: 0.12, box_seconds: 340 },
  { user_id: U1, ts: "2026-02-10T11:00:00Z", kind: "run", status: "error", label: "email-sync", cost_usd: 0.03, box_seconds: 45 },
  { user_id: U2, ts: "2026-02-10T12:00:00Z", kind: "run", status: "ok", label: "calendar-plan", cost_usd: 0.2, box_seconds: 512 },
];

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
      { user_id: U1, state: "started", provider: "morph", template_version: "v42", updated_at: "2026-02-10T10:00:00Z", starts: 5, stops: 4, runs: 12, box_seconds: 2400 },
      { user_id: U2, state: "stopped", provider: "morph", template_version: "v42", updated_at: "2026-02-09T18:00:00Z", starts: 4, stops: 4, runs: 7, box_seconds: 1200 },
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

http
  .createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    console.log(`${req.method} ${req.url} auth=${req.headers.authorization ?? "none"}`);
    if (req.headers.authorization !== `Bearer ${KEY}`) {
      res.writeHead(401, { "content-type": "application/json" });
      return res.end(JSON.stringify({ error: "unauthorized" }));
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
    const body = data[url.pathname];
    if (!body) {
      res.writeHead(404, { "content-type": "application/json" });
      return res.end(JSON.stringify({ error: "not found" }));
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  })
  .listen(4600, () => console.log("mock control plane on :4600"));
