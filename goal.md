# goal.md: wzrd.tech admin — Deployments and Create observability (V12 companion)

| Field | Value |
| --- | --- |
| Status | Build specification (executable plan) |
| Companion to | `gratitude5dee/airv2` → [`docs/goal-create-v12.md`](https://github.com/gratitude5dee/airv2/blob/main/docs/goal-create-v12.md) §12, which fixes the control-plane endpoints this dashboard consumes |
| Primary outcome | An operator opens `admin.wzrd.tech` and sees, on one page, every dev and production deployment (fleet channels **and** Create apps), and on another, token usage broken down by model, provider, tier, lane, stage (Astra plan vs GLM build) and project — with the same metadata-only posture (C4) the dashboard has today |
| Repository | `gratitude5dee/admin` (Next.js 15 App Router, React 19, Tailwind 4, dither-kit) |
| Last verified | 2026-09-17 against `admin` @ `8174228` (11 nav pages; `lib/controlPlane.ts`, `lib/types.ts`, `lib/fleet.ts`, `components/{panel,charts,tokens-chart}.tsx`, `mock-cp.mjs`, `middleware.ts`) |

Everything here is **metadata and receipts only**. No message content, prompts, plans, source, or memory are fetched or displayed. Every control-plane call happens server-side through `lib/controlPlane.ts` with `ADMIN_API_KEY`; nothing is `NEXT_PUBLIC_`.

---

## 0. The outcome

Two new pages and one upgraded page:

| Page | Route | Answers |
| --- | --- | --- |
| **Deployments** | `/deployments` | What is live where? Fleet: which template release each channel (`dev`, `prod`) points at, drift, active sync job. Apps: every Create app's dev release (`link.wzrd.tech/<u>/<a>`, expiry), production version (`mini.wzrd.tech/<u>/<a>`), draft, last build, QA, tests, Functions state, mirror state. Platform: control-plane git SHA, Kit version, Dispatcher health. One-click **Revoke dev** / **Renew dev** / **Suspend** per app (audited, confirm-gated) |
| **Create** | `/create` | Is `/create` working? Intake funnel (asked → planned → confirmed → dev → production), medians, builds and their failure rules, QA distribution, tests pass ratio, progress-relay health, mirror results, budget exhaustions, template mix |
| **Tokens** (upgraded) | `/tokens` | Where is the money going? Existing per-user view plus `group=` tabs: model, provider (GMI vs OpenAI vs …), tier, lane (create vs chat), **stage** (plan / build / review / finalize — the Astra vs GLM split), project. A `cost_estimated` badge where the control plane prices from list rather than a confirmed GMI rate |

The Boxes home page gets one extra stat row (dev releases live, production apps, builds/24 h) linking to the new pages.

### 0.1 Non-goals

No Vercel or Cloudflare API access from this repo (deploy facts come from the control plane's `/api/admin/deployments`, which reads its own env and the Dispatcher health URL). No live log tailing. No editing of apps, plans, or budgets beyond the three audited actions above. No per-user drill into content.

---

## 1. Existing substrate and what changes

| Exists | Where | Use |
| --- | --- | --- |
| Server-only control-plane client | `lib/controlPlane.ts` (`adminGet`, `adminGetSafe`, `adminSend`, `ControlPlaneError`) | Every new read/write |
| Response types | `lib/types.ts` | Gains `DeploymentsResponse`, `CreateOpsResponse`, `TokensGroupedResponse`, `TimeseriesSeries` |
| Panel primitives | `components/panel.tsx` (`Panel`, `Stat` with accents, `DataTable`, `LoadError`) | Every new page |
| Charts | `components/charts.tsx` (`LabeledBarChart`, `ActivityAreaChart`, `BreakdownPieChart`), `components/tokens-chart.tsx`, dither-kit | Stage/provider breakdowns, funnel bars, series |
| Fleet math | `lib/fleet.ts` (`boxDrift`, `driftAccent`, `claimAge`, `shortRef`, `formatDuration`) | Reused verbatim on Deployments |
| Write-route pattern | `app/api/fleet/sync/route.ts` (server proxy, redirect back with `?error=`) | Template for `/api/deployments/*` actions |
| Auth | `middleware.ts` session cookie; `lib/session.ts` | Unchanged; new API routes sit behind it |
| Range toggle | `components/range-toggle.tsx` (`rangeDays`) | Create and Tokens windows |
| Mock control plane | `mock-cp.mjs` | Gains the three new endpoints and `group=` handling |
| Tests | vitest, `**/*.test.ts` (`lib/fleet.test.ts`, `app/api/fleet/*/route.test.ts`, `components/*.test.ts`) | Same shape for new pure helpers and routes |
| Testing skill | `.agents/skills/testing-admin-dashboard/SKILL.md`, `test-plan.md` | Extended with the new pages |

Nothing in the visual system changes: dark operator theme, mono type, `Stat` accents (`green` ok, `orange` behind/expiring, `pink` failed/unsynced, `blue` in progress, `purple` tokens).

---

## 2. Constraints

| ID | Constraint |
| --- | --- |
| A1 | **Metadata only (C4).** No endpoint used here returns content; if a payload ever carries a field named `prompt`, `plan`, `source`, `body`, or `message`, the page drops it before render and a test asserts the drop. |
| A2 | **Server-side only.** `ADMIN_API_KEY` and `CONTROL_PLANE_URL` never reach the browser; every new page is a server component; every action is a `POST` to a same-origin `/api/*` route that proxies with the bearer. |
| A3 | **Actions are confirm-gated and audited.** Revoke, renew, suspend render a native `confirm()`-free two-step (button → inline "confirm" button) and the control plane writes the audit row; the UI shows the resulting state after redirect, never an optimistic one. |
| A4 | **Panels fail independently.** Each panel uses `adminGetSafe`; one 5xx renders one `LoadError`, not a blank page. |
| A5 | **No new dependencies.** dither-kit, d3-scale/shape, motion, clsx, tailwind-merge only. |
| A6 | **Numbers reconcile.** Grouped token totals equal ungrouped totals for the same window (asserted in a helper test against fixture data); the Deployments count of production apps equals the Create funnel's `production` count for the same window. |

---

## 3. Pages

### 3.1 `/deployments`

Sections, top to bottom:

1. **Platform** — `Stat` row: control-plane `git_sha` (short) + `deployed_at`; Kit `version` and `restricted_version`; Dispatcher `healthy` (green/pink) + `checked_at`; apps totals (`dev_live`, `prod_live`, `drafts_only`, `expiring_7d` with `orange` when > 0).
2. **Fleet channels** — reuse the `/fleet` page's channel table (extract `ChannelTable` into `components/fleet-channels.tsx` and render it on both pages): channel → release version / git SHA / hermes ref, boxes on channel, drift counts, active job state. Link "manage → /fleet".
3. **App deployments** — `DataTable` with a `channel` filter (`all | dev | prod`) and a `user_id` filter (GET form like `/traces`): `app` (`<u>/<a>` as text, plus two external links rendered as plain anchors to `link.wzrd.tech/<u>/<a>` and `mini.wzrd.tech/<u>/<a>` when present), `owner` (`UserLink`), `lane`, `status` · `visibility` · `listed`, `dev` (version, `expires in <d>` with `orange` under 3 days, `—` when none), `prod` (live version), `draft`, `last build` (status accent + `finished_at` relative), `qa` (score, `pink` < 70), `tests` (`passed/total`, `pink` when not equal), `functions` (`disabled | draft | live | suspended`), `worker` (`sha256[0:7]`), `mirror` (`mirrored_at` relative or `—`), `actions` (`revoke dev`, `renew dev`, `suspend` — each a two-step form posting to `/api/deployments/apps/[slug]/{dev,suspend}`).
4. **Deployment activity** — `ActivityAreaChart` over `GET /api/admin/timeseries?days=&series=builds,dev_releases,publishes` with the range toggle.

Pure helpers (`lib/deployments.ts`, unit-tested): `devExpiry(expires_at, now) → { label, accent }`, `buildAccent(status)`, `testsAccent(passed,total)`, `appUrl(host, u, a)` (never builds a URL from untrusted parts without `USERNAME`/`APPNAME` pattern checks mirroring airv2), `reconcileCounts(deployments, create)`.

### 3.2 `/create`

1. **Funnel** — `LabeledBarChart` of the stage counts in stage order, plus `Stat`s: `production`, `dev_ready`, `failed` (pink), `abandoned`; medians row (`first_question`, `plan`, `confirm_to_dev`, `dev_to_prod`) via `formatDuration`.
2. **Builds** — total, failed (pink when > 10% of total), `by_rule` as a `DataTable` sorted desc (rule ids only, e.g. `csp.host-reference`, `tests.locked-removed`).
3. **Quality** — QA `p50`/`p90`/`below_70` (orange when > 0), tests `declared` and `passed_ratio`.
4. **Relay and mirror** — progress relay `cards_updated`, `text_fallbacks`, `update_failures` (pink when failures / (updated+failures) > 5%); mirror `ok` / `failed` (pink when failed > 0).
5. **Templates** — `BreakdownPieChart` of `by_template`.
6. **Budget** — `budget_exhausted` count with a link to `/tokens?group=project`.

### 3.3 `/tokens` (upgrade)

- Tabs (GET `?group=`): `user` (today's view, unchanged), `model`, `provider`, `tier`, `lane`, `stage`, `project`.
- For every non-user group: `Stat` totals, `TokensChart`-style bar chart of the top 12 groups (prompt vs completion), `DataTable` with `runs`, `prompt`, `completion`, `total`, `cost`, and a `~` prefix plus tooltip "list-estimated" when `cost_estimated` is true.
- `stage` tab adds a two-row comparison card: **plan (Astra)** vs **build + review (GLM-5.3-Flash)** — tokens, cost, cost per production app (cost ÷ Create funnel `production`) — the number the product decision in `goal-create-v12.md` §7 depends on.
- `lane` tab labels: `create` (labels `create:*`) vs `chat` (everything else).

Pure helper (`lib/tokens.ts`, unit-tested): `groupTotals(groups)`, `stageComparison(groups, productionCount)`, `estimatedBadge(row)`.

### 3.4 Boxes home (`/`)

One extra `Stat` row under Platform activity: `dev releases live`, `production apps`, `builds (24h)`, each linking to `/deployments` or `/create`. Source: `GET /api/admin/deployments` totals and `GET /api/admin/create?days=1` builds.

---

## 4. API routes (this repository, server-side proxies)

| Route | Method | Proxies to | Notes |
| --- | --- | --- | --- |
| `/api/deployments/apps/[slug]/dev` | POST (`action=revoke\|renew`) | `POST /api/admin/create/apps/<slug>/dev` | Redirect 303 back to `/deployments` with `?error=` on failure (the `/api/fleet/sync` pattern); slug validated `^[a-z0-9][a-z0-9_-]{0,63}$` |
| `/api/deployments/apps/[slug]/suspend` | POST | `POST /api/admin/create/apps/<slug>/suspend` | Same |
| `/api/traces/export` (existing) | GET | unchanged | — |

Reads are done directly in server components with `adminGetSafe` (no proxy route needed).

---

## 5. Types (`lib/types.ts`, additive)

```ts
export interface DeploymentsResponse {
  control_plane: { git_sha: string | null; deployed_at: string | null; region: string | null };
  kit: { version: string; restricted_version: string | null };
  dispatcher: { healthy: boolean | null; checked_at: string | null };
  channels: FleetChannel[];
  apps: { total: number; dev_live: number; prod_live: number; drafts_only: number; expiring_7d: number };
  rows: {
    slug: string; username: string | null; appname: string | null;
    lane: "drop" | "vibe" | "import" | "push" | null;
    status: "draft" | "published" | "suspended"; visibility: "public" | "unlisted" | "private"; listed: boolean;
    dev_version: string | null; dev_expires_at: string | null;
    live_version: string | null; draft_version: string | null;
    last_build: { status: "queued" | "running" | "succeeded" | "failed"; finished_at: string | null; findings_hard: number } | null;
    qa_score: number | null; tests: { passed: number; total: number } | null;
    worker_sha256_prefix: string | null;
    functions_status: "disabled" | "draft" | "live" | "suspended";
    mirrored_at: string | null;
  }[];
}

export interface CreateOpsResponse {
  window_days: number;
  funnel: Record<
    | "asking" | "planning" | "plan_sent" | "revising" | "confirmed" | "building" | "qa" | "testing"
    | "dev_ready" | "finalizing" | "decision_sent" | "production" | "failed" | "abandoned", number>;
  medians_s: { first_question: number | null; plan: number | null; confirm_to_dev: number | null; dev_to_prod: number | null };
  builds: { total: number; failed: number; by_rule: Record<string, number> };
  qa: { p50: number | null; p90: number | null; below_70: number };
  tests: { declared: number; passed_ratio: number | null };
  progress_relay: { cards_updated: number; text_fallbacks: number; update_failures: number };
  mirror: { ok: number; failed: number };
  budget_exhausted: number;
  by_template: Record<string, number>;
}

export type TokensGroup = "user" | "model" | "family" | "provider" | "tier" | "lane" | "stage" | "project";
export interface TokensGroupedResponse extends TokensResponse {
  group: TokensGroup;
  groups: { key: string; runs: number; prompt_tokens: number; completion_tokens: number; total_tokens: number; cost_usd: number; cost_estimated: boolean }[];
}
```

`TimeseriesPoint` gains optional `builds`, `dev_releases`, `publishes`.

---

## 6. Module and file plan

```
app/(dashboard)/layout.tsx                 NAV += { "/deployments", "Deployments" }, { "/create", "Create" } (after Fleet)
app/(dashboard)/deployments/page.tsx       §3.1
app/(dashboard)/create/page.tsx            §3.2
app/(dashboard)/tokens/page.tsx            §3.3 tabs
app/(dashboard)/page.tsx                   §3.4 stat row
app/api/deployments/apps/[slug]/dev/route.ts
app/api/deployments/apps/[slug]/suspend/route.ts
components/fleet-channels.tsx              extracted from fleet/page.tsx (shared)
components/app-actions.tsx                 two-step confirm forms (client component, no fetch — plain <form method=post>)
components/group-tabs.tsx                  GET-form tab strip for ?group=
lib/deployments.ts (+ .test.ts)            pure helpers §3.1
lib/tokens.ts (+ .test.ts)                 pure helpers §3.3
lib/types.ts                               §5
mock-cp.mjs                                /api/admin/deployments, /api/admin/create, tokens group=, timeseries series=, the two POST actions
test-plan.md                               T6–T9 below
.agents/skills/testing-admin-dashboard/SKILL.md   new pages + endpoints
README.md                                  Panels list += Deployments, Create; Tokens description updated
```

---

## 7. Milestones

**AD0 — contract fixtures.** Add the three response shapes to `lib/types.ts` and `mock-cp.mjs` with realistic fixtures (two apps: one with dev + prod + mirror, one draft-only with a failed build; funnel with every stage non-zero; token groups where `stage` totals equal `user` totals). Exit: `npm run typecheck` green; the mock serves all routes with the bearer check.

**AD1 — Deployments page.** Extract `FleetChannels`, build `/deployments`, the two action routes, `lib/deployments.ts` + tests. Exit: page renders from the mock; revoke → mock logs the bearer POST → redirect shows `dev —`; expiry accents match `lib/deployments.test.ts`.

**AD2 — Create page.** `/create` with funnel, builds, quality, relay, templates, budget. Exit: every panel renders; a mock 500 on `/api/admin/create` renders one `LoadError` and the rest of the page.

**AD3 — Tokens groups.** Tabs, grouped tables, stage comparison, `cost_estimated` badge, `lib/tokens.ts` + tests. Exit: `groupTotals(stage) == totals` on the fixture; the badge appears only on estimated rows.

**AD4 — Home row, docs, skill, test plan.** Exit: `npm run lint`, `npm run typecheck`, `npm test -- --run`, `npm run build` green; `test-plan.md` T6–T9 executed against the mock with evidence noted.

Dependency: AD0 → {AD1, AD2, AD3} (parallel) → AD4. airv2 §12 endpoints must exist before pointing at a real control plane; until then the mock is the contract.

---

## 8. Test plan additions (`test-plan.md`)

- **T6 Deployments** — `/deployments` shows Platform stats, both channels, two app rows; the dev-expiring row is orange; clicking `revoke dev` shows an inline confirm, confirming POSTs with the bearer (mock log) and the row re-renders with `dev —`; the ADMIN_API_KEY string is absent from page HTML and `.next/static`.
- **T7 Create** — funnel bars in stage order; `failed` pink; `by_rule` sorted desc; with the mock returning 500 for `/api/admin/create`, the page shows one "Failed to load" and no crash.
- **T8 Tokens groups** — each `?group=` tab renders; `stage` tab shows the Astra vs GLM card; `~` prefix on estimated rows; ungrouped totals equal grouped sums (visible numbers).
- **T9 Reconcile** — the home row's `production apps` equals `/deployments` `prod_live` and `/create` funnel `production` for the same window.

Unit tests: `lib/deployments.test.ts` (expiry labels/accents at 0, 2, 3, 13 days; build/test accents; URL guard rejects a username with a hyphen), `lib/tokens.test.ts` (group totals, stage comparison division by zero → null, badge), `app/api/deployments/apps/[slug]/dev/route.test.ts` (slug validation, action validation, redirect with error).

---

## 9. Acceptance criteria

- Operator can tell, within one screen, which template release each channel runs and which apps are live on dev and production, with expiries and last-build health.
- Revoke/renew/suspend work end to end against the mock and leave an audit row on the control plane (verified when airv2 §12 lands).
- Tokens by `stage` shows Astra (plan) and GLM (build/review) spend separately and the cost per production app.
- No `NEXT_PUBLIC_` variable, no bearer in the browser, no content field rendered (A1 test).
- `npm run lint`, `npm run typecheck`, `npm test -- --run`, `npm run build` all pass.

## 10. Definition of done

AD0–AD4 shipped; T1–T9 pass against the mock; pointed at production once `airv2` exposes `/api/admin/{deployments,create}` and `tokens?group=`; one real `/create` intake's Astra and GLM spend is visible on `/tokens?group=stage` and its dev and production versions on `/deployments`.
