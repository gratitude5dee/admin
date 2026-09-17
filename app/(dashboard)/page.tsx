import Link from "next/link";
import { adminGetSafe } from "@/lib/controlPlane";
import { fetchUserDirectory } from "@/lib/users";
import type {
  BoxesResponse,
  CreateOpsResponse,
  DeploymentsResponse,
  OpsResponse,
  TimeseriesResponse,
} from "@/lib/types";
import { buildFailedAccent } from "@/lib/createOps";
import {
  DataTable,
  LoadError,
  Panel,
  Stat,
  type StatAccent,
} from "@/components/panel";
import {
  ActivityAreaChart,
  BreakdownPieChart,
  LabeledBarChart,
} from "@/components/charts";
import { RangeToggle, rangeDays } from "@/components/range-toggle";
import { UserLink } from "@/components/user-link";
import { shortRef } from "@/lib/fleet";

export const dynamic = "force-dynamic";

function hours(seconds: number): string {
  return `${(seconds / 3600).toFixed(1)}h`;
}

/** A Stat that is also a link to the page with the detail (goal.md §3.4). */
function StatLink({
  href,
  label,
  value,
  sub,
  accent,
}: {
  href: string;
  label: string;
  value: string;
  sub: string;
  accent: StatAccent;
}) {
  return (
    <Link href={href} className="block rounded-md hover:ring-1 hover:ring-border">
      <Stat label={label} value={value} sub={sub} accent={accent} />
    </Link>
  );
}

export default async function BoxesPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const days = rangeDays((await searchParams).days);
  const [ops, boxes, series, deployments, create, directory] = await Promise.all([
    adminGetSafe<OpsResponse>("/api/admin/ops"),
    adminGetSafe<BoxesResponse>(`/api/admin/boxes?days=${days}`),
    adminGetSafe<TimeseriesResponse>(`/api/admin/timeseries?days=${days}`),
    // Totals only; the rows are on /deployments (airv2 §12 honours ?limit=).
    adminGetSafe<DeploymentsResponse>("/api/admin/deployments?limit=1"),
    adminGetSafe<CreateOpsResponse>("/api/admin/create?days=1"),
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
        <div className="mb-3 flex justify-end">
          <RangeToggle days={days} basePath="/" />
        </div>
        {series.error !== null ? (
          <LoadError error={series.error} />
        ) : (
          <>
          <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
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
          </>
        )}
      </Panel>

      <Panel
        title="Deployments and Create"
        note="From /api/admin/deployments totals and /api/admin/create?days=1 — Create apps live on dev (link.wzrd.tech) and production (mini.wzrd.tech), and builds in the last 24 hours. Each stat opens its page."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {deployments.error !== null ? (
            <div className="sm:col-span-2">
              <LoadError error={deployments.error} />
            </div>
          ) : (
            <>
              <StatLink
                href="/deployments?channel=dev"
                label="dev releases live"
                value={String(deployments.data.apps.dev_live)}
                sub={
                  deployments.data.apps.expiring_7d > 0
                    ? `${deployments.data.apps.expiring_7d} expiring within 7d · /deployments →`
                    : "none expiring within 7d · /deployments →"
                }
                accent={deployments.data.apps.expiring_7d > 0 ? "orange" : "green"}
              />
              <StatLink
                href="/deployments?channel=prod"
                label="production apps"
                value={String(deployments.data.apps.prod_live)}
                sub={`of ${deployments.data.apps.total} apps · /deployments →`}
                accent="green"
              />
            </>
          )}
          {create.error !== null ? (
            <LoadError error={create.error} />
          ) : (
            <StatLink
              href="/create?days=1"
              label="builds (24h)"
              value={String(create.data.builds.total)}
              sub={`${create.data.builds.failed} failed · /create →`}
              accent={
                buildFailedAccent(create.data.builds) === "pink" ? "pink" : "blue"
              }
            />
          )}
        </div>
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

      <Panel title={`Box usage (${days}d)`} note="From /api/admin/boxes — current state, wakes/stops, metered box seconds. release is the template release the box was last synced to and hermes its pinned Hermes ref; drift against the channel is on the Fleet page. Click a user to drill down.">
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
                "channel",
                "release",
                "hermes",
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
                user.channel ?? null,
                user.baseline_version ?? null,
                shortRef(user.template_version),
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
