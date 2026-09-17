# Visual walkthrough — 2026-09-17

Recorded run of the operator dashboard (production build `zJGMh5tLqL5deAnXyqJyo`, `next start` on :3111) against the mock control plane (`mock-cp.mjs` on :4600), driven by Playwright/Chromium at 1280×800. Status: **passed**. 86 assertions.

## What it proves

- **T6 Deployments** — Platform stats (short git SHA, green Dispatcher, orange `dev expiring (7d)`), both fleet channels, both app rows with the orange `expires in …` label and the pink failed build; `revoke dev` opens an inline confirm (no navigation, no native dialog) whose form is a plain same-origin POST; confirming yields a 303 back to `/deployments`, the mock logs `POST /api/admin/create/apps/alice-tour/dev auth_valid=true` with `{"action":"revoke"}` (see [mock.log](./mock.log)), and the row re-renders `dev —` from the control plane's state.
- **T7 Create** — the funnel canvas is painted, `failed` is pink, `by_rule` is sorted descending, all six panels render with no LoadError (the 500 → six "Failed to load" case is pinned by `app/(dashboard)/create/page.test.ts`).
- **T8 Tokens groups** — the tab strip, the stage and provider grouped views, the Astra vs GLM card, a `~` list-estimated cost cell with its tooltip, and the A6 reconciliation line on each grouped tab.
- **T9 Reconcile** — home `production apps` = `/deployments` `production live` = `/create` funnel `production` = the stage card's `production apps`.
- **Secret leak** — the bearer (`test-admin-key`) appears in none of the 9 served pages nor anywhere under `.next/static`; the session cookie is absent from `document.cookie`.

## Steps

| # | step | url | screenshot | assertions |
| --- | --- | --- | --- | --- |
| 1 | login page | `/login` | [01-login.png](./01-login.png) | 3 |
| 2 | home after login | `/` | [02-home.png](./02-home.png) | 11 |
| 3 | deployments | `/deployments` | [03-deployments.png](./03-deployments.png) | 12 |
| 4 | deployments — inline confirm | `/deployments` | [04-deployments-confirm.png](./04-deployments-confirm.png) | 11 |
| 5 | deployments after revoke | `/deployments` | [05-deployments-revoked.png](./05-deployments-revoked.png) | 10 |
| 6 | create | `/create` | [06-create.png](./06-create.png) | 12 |
| 7 | tokens by stage | `/tokens?group=stage` | [07-tokens-stage.png](./07-tokens-stage.png) | 10 |
| 8 | tokens by provider | `/tokens?group=provider` | [08-tokens-provider.png](./08-tokens-provider.png) | 6 |
| 9 | fleet | `/fleet` | [09-fleet.png](./09-fleet.png) | 6 |
| 10 | reconcile (T9) | — | — | 2 |
| 11 | secret scan | — | — | 3 |

Video: [walkthrough.webm](./walkthrough.webm). Machine-readable summary: [manifest.json](./manifest.json).

## Re-run

```sh
node scripts/visual/record.mjs
```

Needs Playwright at `PLAYWRIGHT_MODULE` (default `/home/user/pwtools/node_modules/playwright`) and a Chromium at `CHROMIUM` (default `/opt/pw-browsers/chromium`); no repo dependency is added. The script rebuilds `.next` when it is older than the sources, starts and stops both servers itself (only the PIDs it started), and overwrites this directory. Set `VISUAL_DATE` to write a new dated folder.
