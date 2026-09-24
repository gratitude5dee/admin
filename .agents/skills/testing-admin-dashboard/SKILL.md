---
name: testing-admin-dashboard
description: How to run and browser-test the wzrd.tech operator dashboard (Next.js 15) locally with a mock airv2 control plane — env vars, mock server, auth flow, and export verification.
---

# Testing the operator admin dashboard locally

The dashboard (this repo) proxies server-side to airv2 admin APIs. No live control plane is needed for UI testing — stand up a mock.

## Setup
1. `npm install` (if not already), then create `.env.local`:
   ```
   CONTROL_PLANE_URL=http://localhost:4600
   ADMIN_API_KEY=test-admin-key
   DASHBOARD_PASSWORD=<any test password>
   ```
   All env vars are server-only (no NEXT_PUBLIC_). SESSION_SECRET defaults to DASHBOARD_PASSWORD.
   GOTCHA: the org secret `ADMIN_API_KEY` is present in the ambient shell env and
   Next.js gives process env precedence over `.env.local` — the dev server will
   send the REAL key upstream regardless of what `.env.local` says. Either start
   the mock with `MOCK_ADMIN_KEY="$ADMIN_API_KEY"` or launch `npm run dev` with
   `env -u ADMIN_API_KEY`. If every panel shows "control plane returned 401",
   this is why (check the mock's request log for which Bearer arrived).
2. Run the tracked mock control plane: `MOCK_ADMIN_KEY=test-admin-key node mock-cp.mjs` (listens on :4600, checks `Authorization: Bearer $MOCK_ADMIN_KEY`, logs every request as `METHOD url auth_valid=<bool>` plus POST bodies to stdout). It serves `/api/admin/{ops,boxes,tokens,connectors,traces,costs,feedback,learning,timeseries,users,health,migrations,fleet/*}` and, for the Deployments/Create pages (goal.md §5, airv2 `docs/goal-create-v12.md` §12):
   - `GET /api/admin/deployments?channel=dev|prod&user_id=&limit=` → `DeploymentsResponse` (platform, kit, dispatcher, the fleet channels, apps totals, two app rows: `alice-tour` with dev + prod + mirror and a dev release expiring in 2 days, `bob-notes` draft-only with a failed build).
   - `GET /api/admin/create?days=` → `CreateOpsResponse` (same fixture for every window; `funnel.production` = 1 = `apps.prod_live`, A6).
   - `GET /api/admin/create/jobs?days=` → CreateJob rollups: `by_state` (7 jobs, one per workflow state), `by_kind` (initial 5 / change 2), `dev_live` 1, `by_skill_ver` {v5:4, v4:3}, `failures` (3 rows: stuck/build/tests.locked-removed, failed/code/turn.timeout, cancelled/check), `token_usage` (by stage plan/build/review and `create:<slug>` projects, `est` flagged rows), `skill_use.upgrades_queued` 2.
   - `GET /api/admin/create/health` → lane readiness `{ok:false, checks:{lane_env|bridge_secret|jobs_origin|live_token_secret:ok, worker_http:fail}, reasons:["worker_http: fail"], skill_version_min, max_fix_rounds, compile_max_per_turn, dev_origin_suffix}`. To exercise the `ok:true` green `ready` branch, make a copy of the mock with `createHealth` returning `ok:true`/`worker_http:ok`/`reasons:[]` (the tracked fixture has no toggle), or point the page at a 500-returning stub for the LoadError branch.
   - `GET /api/admin/tokens?days=&group=user|model|family|provider|tier|lane|stage|project` → `TokensGroupedResponse`; every group folds the same ledger so grouped sums equal the totals (the mock throws at startup if they do not).
   - `GET /api/admin/timeseries?days=&series=builds,dev_releases,publishes` → points with the requested series.
   - `POST /api/admin/create/apps/<slug>/dev` (`{"action":"revoke"|"renew"}`) and `POST /api/admin/create/apps/<slug>/suspend` mutate the in-memory app rows (revoke → `dev_version: null`; renew without a dev release → 409), so the next GET shows the new state. Restart the mock to reset.
   Response shapes: `lib/types.ts` here and airv2 `apps/web/app/api/admin/*/route.ts`. `/api/admin/traces` must support `format=json|csv|jsonl` and `user_id` filtering.
3. `npm run dev` → http://localhost:3000 (or `npm run build && npx next start -p 3111` for a production-mode check).

## Key behaviors to verify
- Middleware (`middleware.ts`): unauthenticated `/` → 302 to `/login`; unauthenticated `/api/*` → 401 JSON.
- Login: POST form to `/api/login`; wrong password → `/login?error=1` with "Wrong password."; correct → httpOnly `wzrd_admin_session` cookie (absent from `document.cookie`) and redirect to `/` (Boxes).
- Nav pages: Boxes(/), /tokens (DitherKit bar chart), /connectors, /onboarding, /skills, /fleet, /deployments, /create, /migrations, /traces, /costs, /feedback, /learning.
- Boxes (`/`): the "Deployments and Create" stat row (`dev releases live`, `production apps`, `builds (24h)`) links to `/deployments?channel=dev|prod` and `/create?days=1`; `production apps` must equal `/deployments` `production live` and the `/tokens?group=stage` card's `production apps` (T9).
- /deployments: Platform stats, the Fleet channels table (`components/fleet-channels.tsx`, shared with /fleet), the App deployments table with `channel`/`user_id` GET filters, and the two-step `revoke dev` / `renew dev` / `suspend` actions (`components/app-actions.tsx`: button → inline `confirm`/`cancel`, then a plain `<form method="post">` to `/api/deployments/apps/<slug>/{dev,suspend}`, which proxies with the bearer and 303s back to `/deployments`, `?error=` on failure). Verify the POST in the mock log and that the row re-renders from the control plane's state (`dev —` after revoke), never optimistically.
- /create: eleven panels — five V13 job-lane panels first (lane health `ready`/`not ready` + named failing check, deployments state bars + by-kind, failures table `job|app|state|step|rule|round|opened`, token usage by stage + `create:<slug>` project with `$x.xx est` rollups, skill use versions + queued upgrades) then the six V12 funnel panels (funnel + medians, builds by rule, quality, relay and mirror, templates, budget) — from `/api/admin/create{,/jobs,/health}?days=` reads. With the mock down or 500ing, every panel shows its own `Failed to load: control plane returned 500` line (11 total) and the page + RangeToggle still render.
- /tokens?group=: `components/group-tabs.tsx` tab strip (user · model · provider · tier · lane · stage · project). Non-user tabs render totals, chart, table with `~` on `cost_estimated` rows (tooltip "list-estimated") and a grouped-sum reconciliation line (A6). `group=stage` adds the Astra vs GLM card. `group=family` works by URL but has no tab.
- A1 guard: `lib/metadataOnly.test.ts` scans every `app/(dashboard)/**/page.tsx` for a `.prompt`/`.plan`/`.source`/`.body`/`.message` read in code (comments, labels and headers excluded); a new read needs either `stripContentFields` or a reasoned `ALLOWED` entry.
- Recorded walkthrough: `node scripts/visual/record.mjs` starts the mock and a production `next start` on :3111, walks login → / → /deployments (revoke flow) → /create → /tokens?group=stage → /tokens?group=provider → /fleet, greps every page's HTML for the bearer, and writes screenshots, `walkthrough.webm`, `manifest.json` and a README under `docs/visual/<date>/` (needs Playwright at `PLAYWRIGHT_MODULE` and a Chromium at `CHROMIUM`; see the script header).
- Traces: user_id filter is a GET form (`?user_id=`); Export CSV/JSONL links go through `/api/traces/export` proxy — check the mock's log to confirm the Bearer header was sent upstream, and inspect downloads in /tmp/chisel_browser_downloads/.
- Secret-leak check: grep page HTML and `.next/static` for the ADMIN_API_KEY value — must be absent.

## Gotchas
- Dev-mode React hydration-mismatch console error is caused by the automation browser's injected `devinid` attributes, not app code. The Next.js dev overlay shows "1 Issue" for it.
- Nav link clicks sometimes need a second click in the automation browser before navigation registers.
- `curl -X POST http://localhost:3000/api/login` needs `-H "Origin: http://localhost:3000"` — the middleware same-origin guard returns 403 without it.
- Swapping the mock mid-session: `pkill -f mock-cp` can match and kill your own exec shell (the pattern hits the wrapper's command line). Use `fuser -k 4600/tcp` then relaunch with `setsid env MOCK_ADMIN_KEY=test-admin-key node <mock>.mjs >log 2>&1 < /dev/null &` so it survives the shell.
