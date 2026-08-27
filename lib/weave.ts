/**
 * Optional W&B Weave mirror, following airv2's apps/web/lib/traces/weave.ts:
 * receipt METADATA only, dormant by default. Without WANDB_API_KEY this
 * module performs zero egress. When a key is configured, receipts exported
 * through the dashboard's traces proxy are mirrored as a run-history batch
 * via the W&B public API: resolve the key's entity (viewer), upsert the
 * project + a per-export run, then stream the receipt rows through the run's
 * file_stream endpoint. Receipts are content-free by construction on the
 * control plane; transcripts never exist on this path.
 */

const WANDB_API = "https://api.wandb.ai";

export function weaveEnabled(): boolean {
  return Boolean(process.env.WANDB_API_KEY);
}

async function graphql(
  auth: string,
  query: string,
  variables: Record<string, string>
): Promise<Record<string, unknown> | null> {
  const response = await fetch(`${WANDB_API}/graphql`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) return null;
  const parsed = (await response.json()) as {
    data?: Record<string, unknown>;
    errors?: unknown[];
  };
  if (parsed.errors && parsed.errors.length > 0) return null;
  return parsed.data ?? null;
}

/** Best-effort, fire-and-forget: mirroring must never fail or slow the
 * operator's export. No-op (zero network calls) when the key is absent. */
export async function mirrorReceipts(
  receipts: Record<string, unknown>[]
): Promise<void> {
  const apiKey = process.env.WANDB_API_KEY;
  if (!apiKey || receipts.length === 0) return;
  const auth = `Basic ${Buffer.from(`api:${apiKey}`).toString("base64")}`;
  const project = process.env.WANDB_PROJECT ?? "wzrd-admin";
  try {
    const viewer = await graphql(auth, "query { viewer { entity } }", {});
    const entity = (viewer?.["viewer"] as { entity?: string } | undefined)
      ?.entity;
    if (!entity) return;
    // Only create the project when it doesn't exist yet: upsertModel on an
    // existing project makes the immediately-following upsertBucket fail
    // server-side ("driver: bad connection"), so an unconditional upsert
    // would break every mirror after the first.
    const existing = await graphql(
      auth,
      "query($entity: String!, $project: String!) { project(entityName: $entity, name: $project) { name } }",
      { entity, project }
    );
    if (!existing?.["project"]) {
      await graphql(
        auth,
        "mutation($entity: String!, $project: String!) { upsertModel(input: { entityName: $entity, name: $project }) { model { name } } }",
        { entity, project }
      );
    }
    const run = `export-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    let created = await graphql(
      auth,
      "mutation($entity: String!, $project: String!, $run: String!) { upsertBucket(input: { entityName: $entity, modelName: $project, name: $run }) { bucket { name } } }",
      { entity, project, run }
    );
    if (!created?.["upsertBucket"]) {
      created = await graphql(
        auth,
        "mutation($entity: String!, $project: String!, $run: String!) { upsertBucket(input: { entityName: $entity, modelName: $project, name: $run }) { bucket { name } } }",
        { entity, project, run }
      );
    }
    if (!created?.["upsertBucket"]) return;
    await fetch(`${WANDB_API}/files/${entity}/${project}/${run}/file_stream`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        files: {
          "wandb-history.jsonl": {
            offset: 0,
            content: receipts.map((row, index) =>
              JSON.stringify({ ...row, _step: index })
            ),
          },
        },
        complete: true,
        exitcode: 0,
      }),
    });
  } catch {
    // metadata mirror only — never surfaces to the operator
  }
}
