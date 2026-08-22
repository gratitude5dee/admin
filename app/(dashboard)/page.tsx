import { adminGetSafe } from "@/lib/controlPlane";
import { fetchUserDirectory } from "@/lib/users";
import type {
  BoxesResponse,
  OpsResponse,
  TimeseriesResponse,
} from "@/lib/types";
import { DataTable, LoadError, Panel, Stat } from "@/components/panel";
import {
  ActivityAreaChart,
  BreakdownPieChart,
  LabeledBarChart,
} from "@/components/charts";
import { RangeToggle, rangeDays } from "@/components/range-toggle";
import { UserLink } from "@/components/user-link";

export const dynamic = "force-dynamic";

function hours(seconds: number): string {
  return `${(seconds / 3600).toFixed(1)}h`;
}

export default async function BoxesPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const days = rangeDays((await searchParams).days);
  const [ops, boxes, series, directory] = await Promise.all([
    adminGetSafe<OpsResponse>("/api/admin/ops"),
    adminGetSafe<BoxesResponse>(`/api/admin/boxes?days=${days}`),
    adminGetSafe<TimeseriesResponse>(`/api/admin/timeseries?days=${days}`),
    fetchUserDirectory(),
  ]);

  const points = series.error === null ? series.data.points : [];
  const totals = points.reduce(
    (acc, point) => ({
      runs: acc.runs + point.runs,
      tokens: acc.tokens + point.prompt_tokens + point.completion_tokens,
      cost: acc.cost + point.cost_usd,
      boxSeconds: acc.boxSeconds + point.box_seconds,
    }),
    { runs: 0, tokens: 0, cost: 0, boxSeconds: 0 }
  );

  return (
    <>
      <Panel title={`Platform activity (${days}d)`} note="From /api/admin/timeseries — runs, box wakes/stops, tokens, and cost over time.">
        <div className="mb-3 flex items-center justify-between">
          <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat
              label="agent runs"
              value={totals.runs.toLocaleString()}
              sub={`over ${days}d`}
              accent="blue"
            />
            <Stat
              label="box time"
              value={hours(totals.boxSeconds)}
              sub="metered compute"
              accent="green"
            />
            <Stat
              label="tokens"
              value={totals.tokens.toLocaleString()}
              sub="prompt + completion"
              accent="purple"
            />
            <Stat
              label="gateway cost"
              value={`$${totals.cost.toFixed(2)}`}
              sub="LLM spend"
              accent="orange"
            />
          </div>
          <div className="ml-4 self-start">
            <RangeToggle days={days} basePath="/" />
          </div>
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

      <Panel title="Box start rate" note="From /api/admin/ops — platform ceilings 600/hr, 1,500/day.">
        {ops.error !== null ? (
          <LoadError error={ops.error} />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="starts / hour" value={String(ops.data.starts?.hour ?? 0)} accent="green" sub={`ceiling ${ops.data.starts?.hourly_ceiling ?? 600}`} />
            <Stat label="starts / day" value={String(ops.data.starts?.day ?? 0)} accent="green" sub={`ceiling ${ops.data.starts?.daily_ceiling ?? 1500}`} />
            <Stat
              label="hourly headroom"
              value={`${Math.max(0, Math.round((1 - (ops.data.starts?.hour ?? 0) / (ops.data.starts?.hourly_ceiling ?? 600)) * 100))}%`}
              accent="blue"
              sub="of hourly ceiling"
            />
            <Stat
              label="daily headroom"
              value={`${Math.max(0, Math.round((1 - (ops.data.starts?.day ?? 0) / (ops.data.starts?.daily_ceiling ?? 1500)) * 100))}%`}
              accent="blue"
              sub="of daily ceiling"
            />
          </div>
        )}
      </Panel>

      <Panel title={`Box usage (${days}d)`} note="From /api/admin/boxes — current state, wakes/stops, metered box seconds. Click a user to drill down.">
        {boxes.error !== null ? (
          <LoadError error={boxes.error} />
        ) : (
          <>
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="boxes" value={String(boxes.data.totals.boxes)} />
              <Stat label="starts / wakes" value={String(boxes.data.totals.starts)} />
              <Stat label="stops" value={String(boxes.data.totals.stops)} />
              <Stat
                label="box time"
                value={hours(boxes.data.totals.box_seconds)}
              />
            </div>
            <div className="mb-4 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-1 font-mono text-[10px] text-muted-foreground">
                  box hours by user
                </p>
                <LabeledBarChart
                  valueLabel="box hours"
                  color="green"
                  data={boxes.data.users.slice(0, 12).map((user) => ({
                    label: directory.label(user.user_id),
                    value: Number((user.box_seconds / 3600).toFixed(2)),
                  }))}
                />
              </div>
              <div>
                <p className="mb-1 font-mono text-[10px] text-muted-foreground">
                  boxes by state
                </p>
                <BreakdownPieChart
                  data={Object.entries(boxes.data.totals.by_state).map(
                    ([label, value]) => ({ label, value })
                  )}
                />
              </div>
            </div>
            <DataTable
              headers={[
                "user",
                "state",
                "provider",
                "template",
                "starts",
                "stops",
                "runs",
                "box time",
              ]}
              rows={boxes.data.users.map((user) => [
                <UserLink
                  key={user.user_id}
                  userId={user.user_id}
                  label={directory.label(user.user_id)}
                />,
                user.state,
                user.provider,
                user.template_version,
                user.starts,
                user.stops,
                user.runs,
                hours(user.box_seconds),
              ])}
            />
          </>
        )}
      </Panel>
    </>
  );
}
