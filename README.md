# wzrd.tech admin

Operator dashboard for the air control plane, deployed at `admin.wzrd.tech`.
Next.js 15 (App Router) + React 19 + Tailwind 4, with the
[dither-kit](https://tripwire.sh) UI pack vendored under
`components/dither-kit/`.

Everything shown is **metadata and receipts only** — no message content,
prompts, or memory are stored or displayed (constraint C4).

## Panels

- **Boxes** — box start rate (`/api/admin/ops`) and per-user box usage
  (`/api/admin/boxes`)
- **Tokens** — gateway-metered prompt/completion tokens and cost per user
  (`/api/admin/tokens`), plus `group=` tabs for model, provider, tier, lane,
  stage and project (`/api/admin/tokens?group=`); the stage tab adds the
  Astra (plan) vs GLM (build + review) card with cost per production app, and
  `~` marks a list-estimated cost (`cost_estimated`)
- **Connectors** — connection health per toolkit/status (`/api/admin/connectors`)
- **Onboarding** — step funnel, status-mirror health, and per-user progress
  (`/api/admin/onboarding`)
- **Skills** — template skill set and per-user template versions; per-skill
  usage is not metered control-plane-side (C4)
- **Deployments** — what is live where: control-plane git SHA, Kit version
  and Dispatcher health, the template release each fleet channel points at,
  and every Create app's dev release (`link.wzrd.tech/<u>/<a>`, expiry),
  production version (`mini.wzrd.tech/<u>/<a>`), draft, last build, QA, tests,
  Functions and mirror state (`/api/admin/deployments`), with confirm-gated
  **revoke dev** / **renew dev** / **suspend** actions proxied through
  `/api/deployments/apps/[slug]/{dev,suspend}`
- **Create** — Create intake health: stage funnel and medians, builds and
  the rules they failed, QA distribution, tests pass ratio, progress-relay and
  mirror health, template mix and budget exhaustions (`/api/admin/create`)
- **Traces** — receipt metadata with CSV/JSONL export (`/api/admin/traces`)
- **Costs** — creative/ad/storage spend (`/api/admin/costs`) plus LLM cost
- **Feedback** — in-air bug/feature inbox (`/api/admin/feedback`)

## Auth

Two independent layers:

1. **UI password gate** — `middleware.ts` requires a signed httpOnly session
   cookie; `/login` sets it after checking `DASHBOARD_PASSWORD`.
2. **Control-plane key** — every admin API call happens server-side and
   attaches `Authorization: Bearer ${ADMIN_API_KEY}`. The key never reaches
   the browser (no `NEXT_PUBLIC_` vars anywhere).

## Setup

```sh
npm install
cp .env.example .env.local   # fill in values
npm run dev
```

Checks: `npm run lint`, `npm run typecheck`, `npm test -- --run`,
`npm run build`.

## Deploy

Deploy to Vercel with the env vars from `.env.example` set in the project
settings, and point `admin.wzrd.tech` at the deployment. `WANDB_API_KEY`
optionally enables the W&B Weave mirror for exported trace receipts
(`lib/weave.ts`, mirroring airv2's `apps/web/lib/traces/weave.ts` pattern).
