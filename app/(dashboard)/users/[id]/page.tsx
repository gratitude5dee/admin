import Link from "next/link";
import { adminGetSafe } from "@/lib/controlPlane";
import { fetchUserDirectory } from "@/lib/users";
import type {
  BoxesResponse,
  FeedbackResponse,
  HealthResponse,
  TimeseriesResponse,
  TokensResponse,
  TracesResponse,
} from "@/lib/types";
import { DataTable, LoadError, Panel, Stat } from "@/components/panel";
import { ActivityAreaChart } from "@/components/charts";
import { RangeToggle, rangeDays } from "@/components/range-toggle";
import { tenkiSwitchEligibility } from "@/lib/providerSwitch";
import { UserHealthPanel } from "@/components/user-health-panel";

export const dynamic = "force-dynamic";

const TRACE_COLUMNS = [
  "ts",
  "kind",
  "status",
  "label",
  "cost_usd",
  "box_seconds",
] as const;
function hours(seconds: number): string {
  return `${(seconds / 3600).toFixed(1)}h`;
}

export default async function UserDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    days?: string;
    error?: string;
    switched?: string;
    health_memory?: string;
    health_wake?: string;
  }>;
}) {
  const { id } = await params;
  const queryParams = await searchParams;
  const days = rangeDays(queryParams.days);
  const userId = id;
  const query = encodeURIComponent(userId);
  const memoryRequested = queryParams.health_memory === "1";
  const wakeRequested =
    memoryRequested && queryParams.health_wake === "1";
  const [directory, series, tokens, boxes, traces, feedback, health] =
    await Promise.all([
      fetchUserDirectory(),
      adminGetSafe<TimeseriesResponse>(
        `/api/admin/timeseries?days=${days}&user_id=${query}`
      ),
      adminGetSafe<TokensResponse>(`/api/admin/tokens?days=${days}`),
      adminGetSafe<BoxesResponse>(`/api/admin/boxes?days=${days}`),
      adminGetSafe<TracesResponse>(
        `/api/admin/traces?limit=100&user_id=${query}`
      ),
      adminGetSafe<FeedbackResponse>("/api/admin/feedback"),
      adminGetSafe<HealthResponse>(
        `/api/admin/health?days=${days}&user_id=${query}&memory=${
          memoryRequested ? 1 : 0
        }&wake=${wakeRequested ? 1 : 0}`,
      ),
    ]);

  const user = directory.users.find((entry) => entry.user_id === userId);
  const label = directory.label(userId);
  const tokenRow =
    tokens.error === null
      ? tokens.data.users.find((row) => row.user_id === userId)
      : undefined;
  const boxRow =
    boxes.error === null
      ? boxes.data.users.find((row) => row.user_id === userId)
      : undefined;
  const feedbackItems =
    feedback.error === null && feedback.data.items
      ? feedback.data.items.filter((item) => item.user_id === userId)
      : [];
  const points = series.error === null ? series.data.points : [];
  const provider = boxRow?.provider ?? null;
  const environment = boxRow?.environment ?? null;
  const switchEligibility = tenkiSwitchEligibility(boxRow);

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <Link
            href="/"
            className="font-mono text-[10px] text-muted-foreground hover:text-foreground"
          >
            &larr; boxes
          </Link>
          <h1 className="font-mono text-lg text-foreground">{label}</h1>
          <p className="font-mono text-[10px] text-muted-foreground">
            {userId}
            {user
              ? ` · ${user.status} · joined ${new Date(user.created_at).toLocaleDateString()}`
              : ""}
            {user && user.handles.length > 0
              ? ` · ${user.handles.map((h) => `${h.platform}:${h.address}`).join(", ")}`
              : ""}
          </p>
        </div>
        <RangeToggle days={days} basePath={`/users/${query}`} />
      </div>

      {queryParams.error ? (
        <p className="mb-4 font-mono text-[11px] text-red-400">
          {queryParams.error}
        </p>
      ) : null}
      {queryParams.switched === "tenki" ? (
        <p className="mb-4 font-mono text-[11px] text-emerald-400">
          Provider switched to Tenki.
        </p>
      ) : null}

      <Panel
        title="Compute provider"
        note="Manual per-user override only. Default provisioning and every untouched user stay on ascii.dev Box."
      >
        {boxes.error !== null ? (
          <LoadError error={boxes.error} />
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="provider" value={provider ?? "—"} accent="blue" />
            <Stat label="environment" value={environment ?? "—"} />
            <Stat
              label="provider box id"
              value={boxRow?.provider_box_id ?? "—"}
            />
          </div>
        )}
        {boxes.error === null && switchEligibility.eligible ? (
          <form
            method="post"
            action="/api/users/provider"
            className="mt-4 rounded-md border border-orange-400/30 bg-orange-400/5 p-3"
          >
            <input type="hidden" name="user_id" value={userId} />
            <input
              type="hidden"
              name="box_id"
              value={boxRow?.provider_box_id ?? ""}
            />
            <input type="hidden" name="provider" value="tenki" />
            <input type="hidden" name="days" value={String(days)} />
            <p className="font-mono text-[11px] text-orange-300">
              This creates a fresh Tenki machine, repoints the user, then
              permanently deletes the current Box and its local filesystem.
            </p>
            <label className="mt-3 flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
              <input
                required
                type="checkbox"
                name="confirm"
                value="replace"
                className="size-3"
              />
              I understand this replaces and deletes the current Box.
            </label>
            <button
              type="submit"
              className="mt-3 rounded-md border border-orange-400/50 bg-orange-400/10 px-3 py-1.5 font-mono text-[11px] text-orange-200 hover:bg-orange-400/20"
            >
              Switch this user to Tenki
            </button>
          </form>
        ) : boxes.error === null ? (
          <p className="mt-3 font-mono text-[11px] text-muted-foreground">
            {switchEligibility.message}
          </p>
        ) : null}
      </Panel>

      <UserHealthPanel
        health={health}
        userId={userId}
        days={days}
        memoryRequested={memoryRequested}
        wakeRequested={wakeRequested}
      />

      <Panel
        title={`Usage (${days}d)`}
        note="Metadata only — runs, tokens, cost, and box time metered at the gateway."
      >
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          <Stat
            label="runs"
            value={String(tokenRow?.runs ?? boxRow?.runs ?? 0)}
            accent="blue"
          />
          <Stat
            label="prompt tokens"
            value={(tokenRow?.prompt_tokens ?? 0).toLocaleString()}
            accent="purple"
          />
          <Stat
            label="completion tokens"
            value={(tokenRow?.completion_tokens ?? 0).toLocaleString()}
            accent="pink"
          />
          <Stat
            label="cost"
            value={`$${(tokenRow?.cost_usd ?? 0).toFixed(4)}`}
            accent="orange"
          />
          <Stat
            label="box time"
            value={hours(boxRow?.box_seconds ?? 0)}
            accent="green"
          />
          <Stat
            label="box state"
            value={boxRow?.state ?? "—"}
            sub={boxRow ? `${boxRow.starts} wakes / ${boxRow.stops} stops` : undefined}
          />
        </div>
        {series.error !== null ? (
          <LoadError error={series.error} />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <p className="mb-1 font-mono text-[10px] text-muted-foreground">
                runs / wakes / stops
              </p>
              <ActivityAreaChart
                bucket={series.data.bucket}
                data={points.map((p) => ({
                  ts: p.ts,
                  runs: p.runs,
                  wakes: p.starts,
                  stops: p.stops,
                }))}
                series={[
                  { key: "runs", label: "runs", color: "blue" },
                  { key: "wakes", label: "wakes", color: "green" },
                  { key: "stops", label: "stops", color: "orange" },
                ]}
              />
            </div>
            <div>
              <p className="mb-1 font-mono text-[10px] text-muted-foreground">
                tokens over time
              </p>
              <ActivityAreaChart
                bucket={series.data.bucket}
                data={points.map((p) => ({
                  ts: p.ts,
                  prompt: p.prompt_tokens,
                  completion: p.completion_tokens,
                }))}
                series={[
                  { key: "prompt", label: "prompt", color: "purple" },
                  { key: "completion", label: "completion", color: "pink" },
                ]}
              />
            </div>
          </div>
        )}
      </Panel>

      <Panel
        title="Recent traces"
        note="Receipts metadata only (no message content, prompts, or memory)."
      >
        {traces.error !== null ? (
          <LoadError error={traces.error} />
        ) : (
          <DataTable
            headers={[...TRACE_COLUMNS]}
            rows={traces.data.receipts
              .slice(0, 50)
              .map((receipt) =>
                TRACE_COLUMNS.map((column) => receipt[column] ?? null)
              )}
          />
        )}
      </Panel>

      <Panel title="Feedback" note="Bug/feature reports submitted by this user.">
        {feedback.error !== null ? (
          <LoadError error={feedback.error} />
        ) : (
          <DataTable
            headers={["created", "kind", "title", "status"]}
            rows={feedbackItems.map((item) => [
              new Date(item.created_at).toLocaleString(),
              item.kind,
              item.title,
              item.status,
            ])}
          />
        )}
      </Panel>
    </>
  );
}
