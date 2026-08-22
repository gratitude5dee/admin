/**
 * Optional W&B Weave mirror, following airv2's apps/web/lib/traces/weave.ts:
 * receipt METADATA only, dormant by default. Without WANDB_API_KEY this
 * module performs zero egress. When a key is configured, receipts exported
 * through the dashboard's traces proxy are mirrored as a run-history batch
 * via the W&B public API. Receipts are content-free by construction on the
 * control plane; transcripts never exist on this path.
 */

export function weaveEnabled(): boolean {
  return Boolean(process.env.WANDB_API_KEY);
}

/** Best-effort, fire-and-forget: mirroring must never fail or slow the
 * operator's export. No-op (zero network calls) when the key is absent. */
export async function mirrorReceipts(
  receipts: Record<string, unknown>[]
): Promise<void> {
  const apiKey = process.env.WANDB_API_KEY;
  if (!apiKey || receipts.length === 0) return;
  try {
    await fetch("https://api.wandb.ai/files/stream", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`api:${apiKey}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        project: process.env.WANDB_PROJECT ?? "wzrd-admin",
        files: {
          "wandb-history.jsonl": {
            offset: 0,
            content: receipts.map((row) => JSON.stringify(row)),
          },
        },
      }),
    });
  } catch {
    // metadata mirror only — never surfaces to the operator
  }
}
