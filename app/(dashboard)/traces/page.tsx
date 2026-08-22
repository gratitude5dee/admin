import { adminGetSafe } from "@/lib/controlPlane";
import type { TracesResponse } from "@/lib/types";
import { fetchUserDirectory } from "@/lib/users";
import { DataTable, LoadError, Panel } from "@/components/panel";
import { UserLink } from "@/components/user-link";

export const dynamic = "force-dynamic";

const PREVIEW_COLUMNS = [
  "ts",
  "kind",
  "status",
  "label",
  "cost_usd",
  "box_seconds",
] as const;

export default async function TracesPage({
  searchParams,
}: {
  searchParams: Promise<{ user_id?: string }>;
}) {
  const { user_id } = await searchParams;
  const query = new URLSearchParams({ limit: "200" });
  if (user_id) query.set("user_id", user_id);
  const [traces, directory] = await Promise.all([
    adminGetSafe<TracesResponse>(`/api/admin/traces?${query.toString()}`),
    fetchUserDirectory(),
  ]);

  const exportQuery = user_id ? `&user_id=${encodeURIComponent(user_id)}` : "";

  return (
    <Panel
      title="Agent traces"
      note="From /api/admin/traces — receipts metadata only (no message content, prompts, or memory)."
    >
      <form method="get" className="mb-3 flex gap-2">
        <input
          type="text"
          name="user_id"
          defaultValue={user_id ?? ""}
          placeholder="filter by user_id (uuid)"
          className="w-80 rounded-md border border-border bg-background px-3 py-1.5 font-mono text-[11px] text-foreground outline-none focus:border-accent"
        />
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
          rows={traces.data.receipts.slice(0, 200).map((receipt) => [
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
