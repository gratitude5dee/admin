# Operator Dashboard Test Plan (PR #1)

Setup (done): mock control plane on :4600 (checks `Authorization: Bearer test-admin-key`), Next dev on :3000, `.env.local` = CONTROL_PLANE_URL=http://localhost:4600, ADMIN_API_KEY=test-admin-key, DASHBOARD_PASSWORD=hunter2-operator.

## T1 Auth gate
1. Fresh browser, go to http://localhost:3000/ → **Pass:** URL becomes /login, login form visible.
2. Shell: `curl -i http://localhost:3000/api/traces/export` (no cookie) → **Pass:** 401 `{"error":"unauthorized"}` (already verified; recapture as evidence).

## T2 Login
1. Type `wrong-password`, click Enter → **Pass:** stay on /login?error=1 with red "Wrong password." text visible.
2. Type `hunter2-operator`, click Enter → **Pass:** lands on `/` showing "Boxes" panel with mock rows (user_id 1111…, state "started", provider "morph"). Cookie `wzrd_admin_session` present with HttpOnly (check via document.cookie returning empty / devtoolsless: assert `document.cookie` does not contain session cookie).

## T3 All pages render with mock data
Visit via nav links: Boxes(/), Tokens, Connectors, Skills, Traces, Costs, Feedback.
- **Pass:** each page shows panel with mock values: Tokens shows totals cost $3.21 and a rendered DitherKit bar chart canvas; Connectors shows gmail/googlecalendar rows; Traces shows 3 receipts; Costs shows render_cents 120/40; Feedback shows 3 items incl. "Export broken".
- Secret leak check: `grep -r "test-admin-key"` across page HTML (curl with cookie? no — use browser: search page source of each visited page) and `curl -s http://localhost:3000/_next/...`? Practical: run `grep -rl "test-admin-key" .next/static/` and check browser HTML via console `document.documentElement.outerHTML.includes("test-admin-key")` → **Pass:** false everywhere.
- No console errors on any page.

## T4 Traces filter + export
1. On /traces enter user_id `11111111-1111-4111-8111-111111111111`, click Filter → **Pass:** table shows only 2 rows (daily-brief, email-sync), not calendar-plan.
2. Click Export CSV → **Pass:** downloads traces.csv containing header `user_id,ts,...` and only the 2 U1 rows; mock log shows request hit /api/admin/traces?format=csv&user_id=... with Bearer header (proves proxy path).
3. Click Export JSONL → **Pass:** traces.jsonl with 2 JSON lines for U1.

## T5 Logout
Click Logout button → **Pass:** redirected to /login; revisiting / redirects to /login again.

---

# Deployments and Create additions (goal.md §8)

Setup: `MOCK_ADMIN_KEY=test-admin-key node mock-cp.mjs` on :4600 (tracked in the repo; it serves `/api/admin/{deployments,create}`, `tokens?group=`, `timeseries?series=` and the two POST actions, and mutates its app rows on POST), production server `npm run build && env -u ADMIN_API_KEY CONTROL_PLANE_URL=http://localhost:4600 ADMIN_API_KEY=test-admin-key DASHBOARD_PASSWORD=visual-pass npx next start -p 3111`. `node scripts/visual/record.mjs` runs all of T6–T9 end to end and records the walk (video, per-page screenshots and `manifest.json`) under `docs/visual/<date>/`.

## T6 Deployments
Status: **Pass** (2026-09-17, `node scripts/visual/record.mjs` against the mock, production build). Evidence: `docs/visual/2026-09-17/03-deployments.png` (steps 1–3: short SHA `f6267a7`, green `healthy`, orange `dev expiring (7d) 1`, channels `prod`/`dev`, rows `alice/tour` + `bob/notes`, orange `0.3.0 · expires in 1d`, pink `failed`), `04-deployments-confirm.png` (step 4: inline `revoke dev alice-tour?` + `confirm`/`cancel`, no dialog, POST form to `/api/deployments/apps/alice-tour/dev` with hidden `action=revoke`), `05-deployments-revoked.png` + `mock.log` (step 5: `POST /api/admin/create/apps/alice-tour/dev auth_valid=true`, body `{"action":"revoke"}`, `create app alice-tour revoke -> dev=—`; 303 back to `/deployments`, row `dev —`, `dev live 0`, `dev expiring (7d) 0`, revoke/renew disabled), `manifest.json` › `secret_scan` (step 6: bearer absent from all 9 served pages and `.next/static`).
1. Log in, open /deployments → **Pass:** Platform stats show a 7-char control-plane SHA, Kit `0.12.3`, Dispatcher `healthy` (green), and the apps totals (`dev live 1`, `production live 1`, `drafts only 1`, `dev expiring (7d) 1` in orange).
2. Fleet channels panel → **Pass:** both channels (`dev`, `prod`) render with release version / git SHA / hermes ref / boxes / drift / active job, and a "manage → /fleet" link.
3. App deployments table → **Pass:** two app rows (`alice/tour`, `bob/notes`); `alice/tour` `dev` cell reads `0.3.0 · expires in 1d` (or `expires in <h>h`) in orange (`text-orange-400`); `bob/notes` `dev` is empty and its last build `failed` is pink.
4. Click `revoke dev` on `alice/tour` → **Pass:** no navigation and no `confirm()` dialog; an inline form appears reading `revoke dev alice-tour?` with `confirm` and `cancel` buttons.
5. Click `confirm` → **Pass:** browser POSTs same-origin `/api/deployments/apps/alice-tour/dev` (`action=revoke`), lands back on `/deployments` (303, no `?error=`); the mock log shows `POST /api/admin/create/apps/alice-tour/dev auth_valid=true` with body `{"action":"revoke"}`; the `alice/tour` row now shows `dev` empty (`—`), `dev live 0`, `dev expiring (7d) 0`, and `revoke dev` / `renew dev` disabled.
6. Secret leak → **Pass:** the served HTML of every visited page and `grep -rl test-admin-key .next/static/` contain no `test-admin-key`.

## T7 Create
Status: **Pass** (2026-09-17, recorded walk). Evidence: `docs/visual/2026-09-17/06-create.png` (steps 1–3: painted funnel canvas in stage order, `failed 1` pink, `by rule` `3 ≥ 1`, all six panels, `spend by project →` link, no "Failed to load"); step 4 by `npx vitest run "app/(dashboard)/create/page.test.ts"` (500 → six "Failed to load" lines, header and RangeToggle still render).
1. Open /create → **Pass:** funnel bar chart lists the 12 pipeline stages in state-machine order (`asking` … `production`), the stats row shows `production 1`, `dev ready 1`, `failed 1` in pink (`text-pink-400`), `abandoned 2`, and the medians row is populated.
2. Builds panel → **Pass:** `by rule` table sorted by count descending (`csp.host-reference 3` above `tests.locked-removed 1`); `failed` is pink when > 10% of builds.
3. Quality, Relay/mirror, Templates (pie), Budget (link to `/tokens?group=project`) all render.
4. Failure isolation: point `CONTROL_PLANE_URL` at a mock that returns 500 for `/api/admin/create` (or stop the mock) and reload → **Pass:** the page still renders its header and range toggle; every panel shows a "Failed to load" line (one per panel, six in total — `app/(dashboard)/create/page.test.ts` pins this) and nothing crashes. Covered by the unit test rather than the recorded walk.

## T8 Tokens groups
Status: **Pass** (2026-09-17, recorded walk). Evidence: `docs/visual/2026-09-17/07-tokens-stage.png` (tab strip user · model · provider · tier · lane · stage · project; stage table with `~$1.2100` on `plan` and tooltip `list-estimated`; `Astra vs GLM` card: `production apps 1`, `plan · cost / production app ~$1.21` (Astra), `build + review · cost / production app $1.30` (GLM-5.3-Flash); `grouped sum 150,000 prompt · 42,000 completion · $3.21 — reconciles with the totals above (A6)`), `08-tokens-provider.png` (`gmi` / `openai` rows, same totals, reconciliation line, no Astra card). Visible totals (150,000 / 42,000 / $3.21) equal the user view's totals; the mock refuses to start if any group fails to fold to the totals.
1. Open /tokens → **Pass:** the `group by` tab strip shows user · model · provider · tier · lane · stage · project; the user view is unchanged (totals, chart, per-user table).
2. Open /tokens?group=stage → **Pass:** the grouped panel renders totals, the bar chart and a `stage` table; the `Astra vs GLM` card shows `production apps`, `plan · cost / production app` (Astra) and `build + review · cost / production app` (GLM-5.3-Flash); at least one cost cell carries the `~` prefix with the `list-estimated` tooltip; the footer line reads `reconciles with the totals above (A6)`.
3. Open /tokens?group=provider (and each other tab) → **Pass:** renders a `provider` table whose grouped sum line reconciles; visible prompt/completion totals equal the user view's totals.

## T9 Reconcile
Status: **Pass** (2026-09-17, recorded walk; `manifest.json` step "reconcile (T9)"). Evidence: `docs/visual/2026-09-17/02-home.png` (`production apps 1`, `dev releases live 1`), `03-deployments.png` (`production live 1`, `dev live 1`), `06-create.png` (funnel `production 1`), `07-tokens-stage.png` (card `production apps 1`) — all equal.
1. On `/` read `production apps` in the Deployments and Create row; on /deployments read `production live`; on /tokens?group=stage read `production apps` (the Create funnel `production`) → **Pass:** all three equal (`1` on the mock). Note: after T6 step 5 the home row's `dev releases live` reads `0`, matching /deployments `dev live`.
