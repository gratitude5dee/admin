import { adminGetSafe } from "@/lib/controlPlane";
import { fetchUserDirectory } from "@/lib/users";
import type {
  BoxesResponse,
  DeploymentsResponse,
  FleetReleasesResponse,
  FleetSyncResponse,
  TimeseriesResponse,
} from "@/lib/types";
import { shortRef } from "@/lib/fleet";
import {
  ago,
  appUrl,
  buildAccent,
  devExpiry,
  functionsAccent,
  qaAccent,
  statusAccent,
  stripContentFields,
  testsAccent,
} from "@/lib/deployments";
import { accentText, DataTable, LoadError, Panel, Stat } from "@/components/panel";
import { ActivityAreaChart } from "@/components/charts";
import { RangeToggle, rangeDays } from "@/components/range-toggle";
import { UserLink } from "@/components/user-link";
import { FleetChannels } from "@/components/fleet-channels";
import { AppActions } from "@/components/app-actions";

export const dynamic = "force-dynamic";

const CHANNEL_FILTERS = ["all", "dev", "prod"] as const;
type ChannelFilter = (typeof CHANNEL_FILTERS)[number];

const control =
  "rounded-md border border-border bg-background px-2 py-1.5 font-mono text-[11px] text-foreground outline-none focus:border-accent";

function when(iso: string | null | undefined): string | null {
  return iso ? new Date(iso).toLocaleString() : null;
}

/** Plain anchor to an app host — only ever given a URL appUrl has vetted. */
function External({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="whitespace-nowrap text-sky-400 hover:underline"
    >
      {label} ↗
    </a>
  );
}

export default async function DeploymentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    days?: string;
    channel?: string;
    user_id?: string;
    error?: string;
  }>;
}) {
  const params = await searchParams;
  const days = rangeDays(params.days);
  const channel: ChannelFilter =
    params.channel === "dev" || params.channel === "prod" ? params.channel : "all";
  const userId = params.user_id?.trim() ?? "";
  const query = new URLSearchParams({ limit: "200" });
  if (channel !== "all") query.set("channel", channel);
  if (userId) query.set("user_id", userId);

  const [deployments, releases, sync, boxes, series, directory] =
    await Promise.all([
      adminGetSafe<DeploymentsResponse>(`/api/admin/deployments?${query}`),
      adminGetSafe<FleetReleasesResponse>("/api/admin/fleet/releases"),
      adminGetSafe<FleetSyncResponse>("/api/admin/fleet/sync"),
      adminGetSafe<BoxesResponse>("/api/admin/boxes?days=30"),
      adminGetSafe<TimeseriesResponse>(
        `/api/admin/timeseries?days=${days}&series=builds,dev_releases,publishes`
      ),
      fetchUserDirectory(),
    ]);
  const now = Date.now();

  // A1: rows are stripped of any content-bearing field before they reach the
  // renderer; the columns below are the only ones ever drawn.
  const rows = (deployments.data?.rows ?? []).map(stripContentFields);
  const releaseList = releases.data?.releases ?? [];
  const fleetBoxes = (boxes.data?.users ?? []).filter((u) => u.provider_box_id);
  const jobs = sync.data?.jobs ?? [];
  // §5 rows carry the owner's username, not user_id; the directory labels
  // users by username first, so the reverse lookup finds the drill-down id.
  const userIdByLabel = new Map(
    directory.users.map((user) => [user.label, user.user_id])
  );

  const points = series.error === null ? series.data.points : [];
  const activity = points.reduce(
    (acc, point) => ({
      builds: acc.builds + (point.builds ?? 0),
      devReleases: acc.devReleases + (point.dev_releases ?? 0),
      publishes: acc.publishes + (point.publishes ?? 0),
    }),
    { builds: 0, devReleases: 0, publishes: 0 }
  );

  return (
    <>
      {params.error ? (
        <p className="font-mono text-[11px] text-red-400">{params.error}</p>
      ) : null}

      <Panel
        title="Platform"
        note="From /api/admin/deployments — the control plane's own deploy (git SHA, when, region), the Kit version it serves, Dispatcher health, and how many Create apps are live on dev and production. Metadata only."
      >
        {deployments.error !== null ? (
          <LoadError error={deployments.error} />
        ) : (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
            <Stat
              label="control plane"
              value={shortRef(deployments.data.control_plane.git_sha) ?? "—"}
              sub={`deployed ${when(deployments.data.control_plane.deployed_at) ?? "—"}${
                deployments.data.control_plane.region
                  ? ` · ${deployments.data.control_plane.region}`
                  : ""
              }`}
              accent="blue"
            />
            <Stat
              label="kit"
              value={deployments.data.kit.version}
              sub={`restricted ${deployments.data.kit.restricted_version ?? "—"}`}
            />
            <Stat
              label="dispatcher"
              value={
                deployments.data.dispatcher.healthy === null
                  ? "unknown"
                  : deployments.data.dispatcher.healthy
                    ? "healthy"
                    : "unhealthy"
              }
              sub={`checked ${ago(deployments.data.dispatcher.checked_at, now) ?? "—"}`}
              accent={
                deployments.data.dispatcher.healthy === null
                  ? "orange"
                  : deployments.data.dispatcher.healthy
                    ? "green"
                    : "pink"
              }
            />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Stat label="apps" value={String(deployments.data.apps.total)} />
            <Stat
              label="dev live"
              value={String(deployments.data.apps.dev_live)}
              accent="green"
            />
            <Stat
              label="production live"
              value={String(deployments.data.apps.prod_live)}
              accent="green"
            />
            <Stat
              label="drafts only"
              value={String(deployments.data.apps.drafts_only)}
              accent="blue"
            />
            <Stat
              label="dev expiring (7d)"
              value={String(deployments.data.apps.expiring_7d)}
              accent={deployments.data.apps.expiring_7d > 0 ? "orange" : "none"}
            />
            </div>
          </div>
        )}
      </Panel>

      <Panel
        title="Fleet channels"
        note="Which template release each channel points at (the same channel row the Fleet page shows), the boxes following it and their drift against it, and the sync job still owning it. Cutting releases, moving channels and running syncs happen on the Fleet page."
      >
        {deployments.error !== null ? (
          <LoadError error={deployments.error} />
        ) : (
          <FleetChannels
            channels={deployments.data.channels}
            releases={releaseList}
            boxes={fleetBoxes}
            jobs={jobs}
          />
        )}
        {releases.error !== null ? <LoadError error={releases.error} /> : null}
        {sync.error !== null ? <LoadError error={sync.error} /> : null}
        {boxes.error !== null ? <LoadError error={boxes.error} /> : null}
      </Panel>

      <Panel
        title="App deployments"
        note="Every Create app's dev release (link.wzrd.tech/<u>/<a>, with its expiry), production version (mini.wzrd.tech/<u>/<a>), draft, last build, QA score, declared tests, Functions state, worker hash and mirror. Actions are two-step and audited by the control plane; the row shows the state it reports after the redirect, never an optimistic one."
      >
        <form method="get" className="mb-3 flex flex-wrap gap-2">
          <input type="hidden" name="days" value={String(days)} />
          <select name="channel" defaultValue={channel} className={control}>
            {CHANNEL_FILTERS.map((option) => (
              <option key={option} value={option}>
                {option === "all" ? "all channels" : `${option} only`}
              </option>
            ))}
          </select>
          <input
            type="text"
            name="user_id"
            defaultValue={userId}
            placeholder="filter by user_id (uuid)"
            className={`w-80 ${control}`}
          />
          <button
            type="submit"
            className="rounded-md border border-border px-3 py-1.5 font-mono text-[11px] text-foreground"
          >
            Filter
          </button>
        </form>
        {deployments.error !== null ? (
          <LoadError error={deployments.error} />
        ) : (
          <DataTable
            headers={[
              "app",
              "owner",
              "lane",
              "status · visibility · listed",
              "dev",
              "prod",
              "draft",
              "last build",
              "qa",
              "tests",
              "functions",
              "worker",
              "mirror",
              "actions",
            ]}
            rows={rows.map((row) => {
              const expiry = devExpiry(row.dev_expires_at, now);
              const name =
                row.username && row.appname
                  ? `${row.username}/${row.appname}`
                  : row.slug;
              const devUrl =
                row.dev_version !== null && expiry.accent !== "pink"
                  ? appUrl("link.wzrd.tech", row.username, row.appname)
                  : null;
              const liveUrl =
                row.live_version !== null
                  ? appUrl("mini.wzrd.tech", row.username, row.appname)
                  : null;
              const ownerId = row.username
                ? userIdByLabel.get(row.username)
                : undefined;
              return [
                <span key="app" className="flex flex-col gap-0.5">
                  <span>{name}</span>
                  {devUrl || liveUrl ? (
                    <span className="flex gap-2 text-[10px]">
                      {devUrl ? <External href={devUrl} label="link" /> : null}
                      {liveUrl ? <External href={liveUrl} label="mini" /> : null}
                    </span>
                  ) : null}
                </span>,
                row.username ? (
                  ownerId ? (
                    <UserLink key="owner" userId={ownerId} label={row.username} />
                  ) : (
                    row.username
                  )
                ) : null,
                row.lane,
                <span key="status">
                  <span className={accentText(statusAccent(row.status))}>
                    {row.status}
                  </span>
                  {` · ${row.visibility} · ${row.listed ? "listed" : "not listed"}`}
                </span>,
                row.dev_version === null ? null : (
                  <span key="dev" className={accentText(expiry.accent)}>
                    {row.dev_version}
                    {row.dev_expires_at ? ` · ${expiry.label}` : ""}
                  </span>
                ),
                row.live_version,
                row.draft_version,
                row.last_build === null ? null : (
                  <span
                    key="build"
                    className={accentText(buildAccent(row.last_build.status))}
                  >
                    {row.last_build.status}
                    {row.last_build.finished_at
                      ? ` · ${ago(row.last_build.finished_at, now)}`
                      : ""}
                    {row.last_build.findings_hard > 0
                      ? ` · ${row.last_build.findings_hard} hard`
                      : ""}
                  </span>
                ),
                row.qa_score === null ? null : (
                  <span key="qa" className={accentText(qaAccent(row.qa_score))}>
                    {row.qa_score}
                  </span>
                ),
                row.tests === null ? null : (
                  <span
                    key="tests"
                    className={accentText(
                      testsAccent(row.tests.passed, row.tests.total)
                    )}
                  >
                    {row.tests.passed}/{row.tests.total}
                  </span>
                ),
                <span
                  key="functions"
                  className={accentText(functionsAccent(row.functions_status))}
                >
                  {row.functions_status}
                </span>,
                row.worker_sha256_prefix
                  ? row.worker_sha256_prefix.slice(0, 7)
                  : null,
                ago(row.mirrored_at, now),
                <AppActions
                  key="actions"
                  slug={row.slug}
                  hasDev={row.dev_version !== null}
                  suspended={row.status === "suspended"}
                  view={{ days: String(days), channel, user_id: userId }}
                />,
              ];
            })}
          />
        )}
      </Panel>

      <Panel
        title={`Deployment activity (${days}d)`}
        note="From /api/admin/timeseries?series=builds,dev_releases,publishes — Create builds started, dev releases cut and production publishes over time."
      >
        <div className="mb-3 flex justify-end">
          <RangeToggle days={days} basePath="/deployments" />
        </div>
        {series.error !== null ? (
          <LoadError error={series.error} />
        ) : (
          <>
            <div className="mb-3 grid grid-cols-3 gap-3">
              <Stat
                label="builds"
                value={activity.builds.toLocaleString()}
                sub={`over ${days}d`}
                accent="blue"
              />
              <Stat
                label="dev releases"
                value={activity.devReleases.toLocaleString()}
                sub="cut to link.wzrd.tech"
                accent="purple"
              />
              <Stat
                label="publishes"
                value={activity.publishes.toLocaleString()}
                sub="to mini.wzrd.tech"
                accent="green"
              />
            </div>
            <ActivityAreaChart
              bucket={series.data.bucket}
              data={points.map((point) => ({
                ts: point.ts,
                builds: point.builds ?? 0,
                dev_releases: point.dev_releases ?? 0,
                publishes: point.publishes ?? 0,
              }))}
              series={[
                { key: "builds", label: "builds", color: "blue" },
                { key: "dev_releases", label: "dev releases", color: "purple" },
                { key: "publishes", label: "publishes", color: "green" },
              ]}
            />
          </>
        )}
      </Panel>
    </>
  );
}
