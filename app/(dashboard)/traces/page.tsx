import { adminGetSafe } from "@/lib/controlPlane";
import type { TracesResponse } from "@/lib/types";
import { fetchUserDirectory } from "@/lib/users";
import { DataTable, LoadError, Panel, Stat } from "@/components/panel";
import { UserLink } from "@/components/user-link";

export const dynamic = "force-dynamic";

const PREVIEW_COLUMNS = [
  "ts",
  "kind",
  "status",
  "tier",
  "model",
  "requested_model",
  "reasoning_effort",
  "latency_ms",
  "prompt_tokens",
  "completion_tokens",
  "cost_usd",
] as const;

type Receipt = TracesResponse["receipts"][number];

function isRouted(receipt: Receipt): boolean {
  return typeof receipt["tier"] === "string";
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(
    sorted.length - 1,
    Math.ceil((p / 100) * sorted.length) - 1
  );
  return sorted[Math.max(0, index)];
}

/** Router health computed from the routed (gateway) receipts in view. */
function routerSummary(receipts: Receipt[]) {
  const routed = receipts.filter(isRouted);
  const byTier = new Map<string, number>();
  for (const receipt of routed) {
    const tier = String(receipt["tier"]);
    byTier.set(tier, (byTier.get(tier) ?? 0) + 1);
  }
  const latencies = routed
    .map((receipt) => receipt["latency_ms"])
    .filter((value): value is number => typeof value === "number")
    .sort((a, b) => a - b);
  const mean =
    latencies.length > 0
      ? Math.round(latencies.reduce((sum, v) => sum + v, 0) / latencies.length)
      : 0;
  return {
    routed: routed.length,
    tiers: [...byTier.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([tier, count]) => `${tier} ${count}`)
      .join(" · "),
    meanLatency: mean,
    p95Latency: percentile(latencies, 95),
  };
}

export default async function TracesPage({
  searchParams,
}: {
  searchParams: Promise<{ user_id?: string; tier?: string }>;
}) {
  const { user_id, tier } = await searchParams;
  const query = new URLSearchParams({ limit: "200" });
  if (user_id) query.set("user_id", user_id);
  const [traces, directory] = await Promise.all([
    adminGetSafe<TracesResponse>(`/api/admin/traces?${query.toString()}`),
    fetchUserDirectory(),
  ]);

  const exportQuery = user_id ? `&user_id=${encodeURIComponent(user_id)}` : "";

  const allReceipts = traces.error === null ? traces.data.receipts : [];
  const summary = routerSummary(allReceipts);
  const visible =
    tier && tier !== "all"
      ? allReceipts.filter((receipt) => receipt["tier"] === tier)
      : allReceipts;
  const tierOptions = [
    "all",
    ...new Set(
      allReceipts
        .filter(isRouted)
        .map((receipt) => String(receipt["tier"]))
    ),
  ];

  return (
    <Panel
      title="Agent traces"
      note="From /api/admin/traces — receipts metadata only (no message content, prompts, or memory). Router columns (tier/model/reasoning/latency) come from gateway metering."
    >
      <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="routed runs (in view)" value={String(summary.routed)} accent="blue" />
        <Stat label="tier mix" value={summary.tiers || "—"} accent="purple" />
        <Stat label="mean latency" value={`${summary.meanLatency} ms`} accent="green" />
        <Stat label="p95 latency" value={`${summary.p95Latency} ms`} accent="orange" />
      </div>
      <form method="get" className="mb-3 flex gap-2">
        <input
          type="text"
          name="user_id"
          defaultValue={user_id ?? ""}
          placeholder="filter by user_id (uuid)"
          className="w-80 rounded-md border border-border bg-background px-3 py-1.5 font-mono text-[11px] text-foreground outline-none focus:border-accent"
        />
        <select
          name="tier"
          defaultValue={tier ?? "all"}
          className="rounded-md border border-border bg-background px-2 py-1.5 font-mono text-[11px] text-foreground outline-none focus:border-accent"
        >
          {tierOptions.map((option) => (
            <option key={option} value={option}>
              {option === "all" ? "all tiers" : option}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-md border border-border px-3 py-1.5 font-mono text-[11px] text-foreground"
        >
          Filter
        </button>
        <a
          href={`/api/traces/export?format=csv${exportQuery}`}
          className="rounded-md border border-border px-3 py-1.5 font-mono text-[11px] text-muted-foreground hover:text-foreground"
        >
          Export CSV
        </a>
        <a
          href={`/api/traces/export?format=jsonl${exportQuery}`}
          className="rounded-md border border-border px-3 py-1.5 font-mono text-[11px] text-muted-foreground hover:text-foreground"
        >
          Export JSONL
        </a>
      </form>
      {traces.error !== null ? (
        <LoadError error={traces.error} />
      ) : (
        <DataTable
          headers={["user", ...PREVIEW_COLUMNS]}
          rows={visible.slice(0, 200).map((receipt) => [
            typeof receipt.user_id === "string" ? (
              <UserLink
                userId={receipt.user_id}
                label={directory.label(receipt.user_id)}
              />
            ) : null,
            ...PREVIEW_COLUMNS.map((column) => receipt[column] ?? null),
          ])}
        />
      )}
    </Panel>
  );
}
