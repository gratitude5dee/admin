import { adminGetSafe } from "@/lib/controlPlane";
import type { LogEvent, LogsResponse } from "@/lib/types";
import { fetchUserDirectory } from "@/lib/users";
import { DataTable, LoadError, Panel, Stat } from "@/components/panel";
import { UserLink } from "@/components/user-link";

export const dynamic = "force-dynamic";

const SOURCES = ["all", "ops", "gate"] as const;

function topKinds(events: LogEvent[], n: number): string {
  const counts = new Map<string, number>();
  for (const event of events) {
    counts.set(event.kind, (counts.get(event.kind) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([kind, count]) => `${kind} ${count}`)
    .join(" · ");
}

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<{
    user_id?: string;
    source?: string;
    kind?: string;
    app?: string;
    before?: string;
  }>;
}) {
  const { user_id, source, kind, app, before } = await searchParams;
  const query = new URLSearchParams({ limit: "200" });
  if (user_id) query.set("user_id", user_id);
  if (source && source !== "all") query.set("source", source);
  if (kind) query.set("kind", kind);
  if (app) query.set("app", app);
  if (before) query.set("before", before);
  const [logs, directory] = await Promise.all([
    adminGetSafe<LogsResponse>(`/api/admin/logs?${query.toString()}`),
    fetchUserDirectory(),
  ]);

  const events = logs.error === null ? logs.data.events : [];
  const nextBefore =
    logs.error === null ? logs.data.next_before : undefined;
  const bySource = { ops: 0, gate: 0 };
  for (const event of events) bySource[event.source] += 1;

  // The older-page link carries every active filter forward.
  const nextQuery = new URLSearchParams();
  const carry: Array<[string, string | undefined]> = [
    ["user_id", user_id],
    ["source", source],
    ["kind", kind],
    ["app", app],
  ];
  for (const [key, value] of carry) {
    if (value) nextQuery.set(key, value);
  }
  if (nextBefore) nextQuery.set("before", nextBefore);

  return (
    <Panel
      title="Event logs"
      note="From /api/admin/logs — merged ops_events + miniapp_gate_events, newest first. Metadata only (kinds, slugs, refs, bytes); no content, prompts, or message bodies."
    >
      <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="events (in view)" value={String(events.length)} accent="blue" />
        <Stat label="ops" value={String(bySource.ops)} accent="purple" />
        <Stat label="gate" value={String(bySource.gate)} accent="green" />
        <Stat label="top kinds" value={topKinds(events, 3) || "—"} accent="orange" />
      </div>
      <form method="get" className="mb-3 flex flex-wrap gap-2">
        <input
          type="text"
          name="user_id"
          defaultValue={user_id ?? ""}
          placeholder="filter by user_id (uuid)"
          className="w-80 rounded-md border border-border bg-background px-3 py-1.5 font-mono text-[11px] text-foreground outline-none focus:border-accent"
        />
        <input
          type="text"
          name="kind"
          defaultValue={kind ?? ""}
          placeholder="kind (e.g. app_opened)"
          className="w-52 rounded-md border border-border bg-background px-3 py-1.5 font-mono text-[11px] text-foreground outline-none focus:border-accent"
        />
        <input
          type="text"
          name="app"
          defaultValue={app ?? ""}
          placeholder="app slug"
          className="w-44 rounded-md border border-border bg-background px-3 py-1.5 font-mono text-[11px] text-foreground outline-none focus:border-accent"
        />
        <select
          name="source"
          defaultValue={source ?? "all"}
          className="rounded-md border border-border bg-background px-2 py-1.5 font-mono text-[11px] text-foreground outline-none focus:border-accent"
        >
          {SOURCES.map((option) => (
            <option key={option} value={option}>
              {option === "all" ? "all sources" : option}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-md border border-border px-3 py-1.5 font-mono text-[11px] text-foreground"
        >
          Filter
        </button>
        {nextBefore ? (
          <a
            href={`/logs?${nextQuery.toString()}`}
            className="rounded-md border border-border px-3 py-1.5 font-mono text-[11px] text-muted-foreground hover:text-foreground"
          >
            Older →
          </a>
        ) : null}
      </form>
      {logs.error !== null ? (
        <LoadError error={logs.error} />
      ) : (
        <DataTable
          headers={["ts", "source", "kind", "app", "user", "ref", "bytes"]}
          rows={events.map((event) => [
            event.ts.replace("T", " ").replace(/(\.\d+)?Z$/, ""),
            event.source,
            event.kind,
            event.app_slug,
            event.user_id ? (
              <UserLink
                userId={event.user_id}
                label={directory.label(event.user_id)}
              />
            ) : null,
            event.ref,
            event.bytes,
          ])}
        />
      )}
    </Panel>
  );
}
