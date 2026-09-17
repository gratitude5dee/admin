import Link from "next/link";
import { accentText, DataTable, Stat, type StatAccent } from "@/components/panel";
import { driftAccent, shortRef } from "@/lib/fleet";
import {
  DRIFT_ORDER,
  jobStateAccent,
  summarizeChannels,
  type ChannelBox,
} from "@/lib/deployments";
import type { FleetChannel, FleetRelease, FleetSyncJob } from "@/lib/types";

function when(iso: string | null | undefined): string | null {
  return iso ? new Date(iso).toLocaleString() : null;
}

/**
 * Green at the newest release, orange behind it, blue while no release has
 * been cut to compare against.
 */
export function channelAccent(
  channel: FleetChannel,
  latest: FleetRelease | null
): StatAccent {
  if (latest === null) return "blue";
  return channel.release_id === latest.id ? "green" : "orange";
}

/**
 * One Stat per channel — the release it points at and when it moved. This is
 * the Fleet sync panel's channel row, extracted so /fleet and /deployments
 * render exactly the same thing. `releases` is newest-first, as
 * /api/admin/fleet/releases serves it.
 */
export function FleetChannelStats({
  channels,
  releases,
}: {
  channels: readonly FleetChannel[];
  releases: readonly FleetRelease[];
}) {
  const releaseById = new Map(releases.map((release) => [release.id, release]));
  const latest = releases[0] ?? null;
  return (
    <>
      {channels.map((channel) => (
        <Stat
          key={channel.name}
          label={`${channel.name} channel`}
          value={releaseById.get(channel.release_id ?? "")?.version ?? "—"}
          sub={`since ${when(channel.updated_at) ?? "—"}`}
          accent={channelAccent(channel, latest)}
        />
      ))}
    </>
  );
}

/**
 * The Deployments-page view: the shared channel Stats plus, per channel, the
 * release version / git SHA / hermes ref, boxes on the channel with their
 * drift, and the sync job still owning it — with a link to manage the fleet.
 */
export function FleetChannels({
  channels,
  releases,
  boxes,
  jobs,
}: {
  channels: readonly FleetChannel[];
  releases: readonly FleetRelease[];
  boxes: readonly ChannelBox[];
  jobs: readonly FleetSyncJob[];
}) {
  const summaries = summarizeChannels(channels, releases, boxes, jobs);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-4">
        <FleetChannelStats channels={channels} releases={releases} />
      </div>
      <DataTable
        headers={[
          "channel",
          "release",
          "git sha",
          "hermes",
          "boxes",
          "drift",
          "active job",
          "updated",
        ]}
        rows={summaries.map(({ channel, release, boxes: count, drift, job }) => [
          channel.name,
          release?.version ?? null,
          release ? release.git_sha.slice(0, 7) : null,
          shortRef(release?.hermes_ref),
          String(count),
          count === 0 ? null : (
            <span key="drift" className="flex flex-wrap gap-x-2">
              {DRIFT_ORDER.filter((kind) => drift[kind]).map((kind) => (
                <span key={kind} className={accentText(driftAccent(kind))}>
                  {drift[kind]} {kind}
                </span>
              ))}
            </span>
          ),
          job ? (
            <span key="job" className={accentText(jobStateAccent(job.state))}>
              {job.state} · {job.failures} / {job.failure_threshold} failures
            </span>
          ) : null,
          when(channel.updated_at),
        ])}
      />
      <Link
        href="/fleet"
        className="inline-block font-mono text-[11px] text-sky-400 hover:underline"
      >
        manage → /fleet
      </Link>
    </div>
  );
}
