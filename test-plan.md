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
