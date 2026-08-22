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
- **Tokens** — gateway-metered prompt/completion tokens and cost
  (`/api/admin/tokens`)
- **Connectors** — connection health per toolkit/status (`/api/admin/connectors`)
- **Skills** — template skill set and per-user template versions; per-skill
  usage is not metered control-plane-side (C4)
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
