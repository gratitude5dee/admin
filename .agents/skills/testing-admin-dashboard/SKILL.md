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
2. Run a mock control plane on :4600 that checks `Authorization: Bearer <ADMIN_API_KEY>` and serves `/api/admin/{ops,boxes,tokens,connectors,traces,costs,feedback}`. Response shapes: `lib/types.ts` here and `/home/ubuntu/repos/airv2/apps/web/app/api/admin/*/route.ts`. `/api/admin/traces` must support `format=json|csv|jsonl` and `user_id` filtering. A ready-made mock existed at `mock-cp.mjs` (untracked test artifact) — recreate if missing.
3. `npm run dev` → http://localhost:3000.

## Key behaviors to verify
- Middleware (`middleware.ts`): unauthenticated `/` → 302 to `/login`; unauthenticated `/api/*` → 401 JSON.
- Login: POST form to `/api/login`; wrong password → `/login?error=1` with "Wrong password."; correct → httpOnly `wzrd_admin_session` cookie (absent from `document.cookie`) and redirect to `/` (Boxes).
- Nav pages: Boxes(/), /tokens (DitherKit bar chart), /connectors, /skills, /traces, /costs, /feedback.
- Traces: user_id filter is a GET form (`?user_id=`); Export CSV/JSONL links go through `/api/traces/export` proxy — check the mock's log to confirm the Bearer header was sent upstream, and inspect downloads in /tmp/chisel_browser_downloads/.
- Secret-leak check: grep page HTML and `.next/static` for the ADMIN_API_KEY value — must be absent.

## Gotchas
- Dev-mode React hydration-mismatch console error is caused by the automation browser's injected `devinid` attributes, not app code. The Next.js dev overlay shows "1 Issue" for it.
- Nav link clicks sometimes need a second click in the automation browser before navigation registers.
