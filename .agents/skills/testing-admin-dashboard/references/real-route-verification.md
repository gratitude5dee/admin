# Real-route verification & mock extension recipes

The mock CP can't catch control-plane auth drift — mock-cp.mjs only checks
`Authorization: Bearer $MOCK_ADMIN_KEY`, while airv2's `requireAdmin`
(apps/web/lib/auth/guard.ts) requires BOTH the bearer AND a well-formed
`X-Admin-Operator` header (`/^[A-Za-z0-9._@-]{1,64}$/`) on every `/api/admin/*`
route. Until the dashboard sent the header (R-ADMIN-01), every CP call 401'd in
prod and every page degraded to "Failed to load: control plane returned 401" —
mock-backed tests passed throughout. When touching `lib/controlPlane.ts` or
adding a new direct fetch, verify against the REAL route too:

- local airv2 `next start` with `ADMIN_API_KEY=dummy-…` + hosts alias
  `127.0.0.1 cp.local` + `CONTROL_PLANE_URL=http://cp.local:3999` reaches the
  real route through main-host routing (localhost:3999 itself is the MINI host
  and 404s /api/admin/*).
- Or point straight at prod (`CONTROL_PLANE_URL=https://app.wzrd.tech`,
  org-secret `ADMIN_API_KEY`) — `curl -H "Authorization: Bearer $ADMIN_API_KEY"`
  alone → 401 demonstrates any auth regression; add
  `-H "X-Admin-Operator: <id>"` to confirm the route itself works.

## Extending mock-cp.mjs for a new route

Copy it to /tmp (don't edit the repo file for a test fixture) and insert a
`url.pathname === "/api/admin/<route>"` branch BEFORE the
`data[url.pathname]` fallback near the bottom. The request handler checks
`Authorization: Bearer $MOCK_ADMIN_KEY` (default `test-admin-key`) — match
`.env.local`'s ADMIN_API_KEY or export MOCK_ADMIN_KEY.
`appendFileSync("/tmp/mock-requests.log", JSON.stringify(searchParams))`
inside the handler proves the dashboard forwarded filters/cursors — more
reliable than reading the UI for param-passing assertions. For cursor pagers,
serve a first page WITH `next_before` and a second (any `before=` present)
without it → tests that "Older →" appears, carries filters, then disappears.

## Dev launch gotchas

- The ambient org `ADMIN_API_KEY` secret overrides `.env.local` — launch with
  `env -u ADMIN_API_KEY npm run dev` so the dummy key wins (mock's bearer check
  would fail otherwise).
- Next dev DOES hot-reload `.env.local` changes (verify via the mock request
  log — a fresh request path shows up immediately; no restart needed).
- Native `<select>` dropdowns and small inline links are hard to hit at
  1024-tool-scale — driving the page's GET URLs directly
  (`/logs?kind=app_opened`) produces identical server-rendered state; read
  `a[href]` via CDP to verify carried params instead of fighting the click.

## Devin secrets needed

- `ADMIN_API_KEY` (org secret) — real prod/local admin-route verification.
