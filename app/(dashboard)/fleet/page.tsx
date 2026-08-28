import { adminGetSafe } from "@/lib/controlPlane";
import type {
  BoxesResponse,
  FleetChannelsResponse,
  FleetReleasesResponse,
  FleetSyncJob,
  FleetSyncResponse,
} from "@/lib/types";
import { DataTable, LoadError, Panel, Stat } from "@/components/panel";

export const dynamic = "force-dynamic";

const ACTIVE_STATES = new Set(["canary", "rolling", "paused"]);

function stateAccent(state: string): "green" | "orange" | "pink" | "blue" {
  if (state === "done") return "green";
  if (state === "failed" || state === "aborted") return "pink";
  if (state === "paused") return "orange";
  return "blue";
}

function SyncButton({ disabled }: { disabled: boolean }) {
  return (
    <form method="post" action="/api/fleet/sync">
      <input type="hidden" name="action" value="sync" />
      <input type="hidden" name="channel" value="prod" />
      <button
        type="submit"
        disabled={disabled}
        className="rounded-md border border-border bg-background px-3 py-1.5 font-mono text-[11px] text-foreground hover:bg-card disabled:cursor-not-allowed disabled:opacity-40"
      >
        Sync fleet to latest release
      </button>
    </form>
  );
}

function JobActions({ job }: { job: FleetSyncJob }) {
  const actions =
    job.state === "paused" ? ["resume", "abort"] : ["pause", "abort"];
  return (
    <div className="flex gap-2">
      {actions.map((action) => (
        <form key={action} method="post" action="/api/fleet/sync">
          <input type="hidden" name="action" value={action} />
          <input type="hidden" name="channel" value={job.channel} />
          <input type="hidden" name="job_id" value={job.id} />
          <button
            type="submit"
            className="rounded-md border border-border bg-background px-2 py-1 font-mono text-[10px] text-muted-foreground hover:text-foreground"
          >
            {action}
          </button>
        </form>
      ))}
    </div>
  );
}

export default async function FleetPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error: actionError } = await searchParams;
  const [releases, channels, sync, boxes] = await Promise.all([
    adminGetSafe<FleetReleasesResponse>("/api/admin/fleet/releases"),
    adminGetSafe<FleetChannelsResponse>("/api/admin/fleet/channels"),
    adminGetSafe<FleetSyncResponse>("/api/admin/fleet/sync"),
    adminGetSafe<BoxesResponse>("/api/admin/boxes?days=30"),
  ]);

  const releaseById = new Map(
    (releases.data?.releases ?? []).map((r) => [r.id, r])
  );
  const latest = releases.data?.releases[0] ?? null;
  const latestJob = sync.data?.jobs[0] ?? null;
  const jobActive = latestJob !== null && ACTIVE_STATES.has(latestJob.state);
  const boxLabel = new Map(
    (boxes.data?.users ?? [])
      .filter((u) => u.provider_box_id)
      .map((u) => [u.provider_box_id as string, u.username ?? u.user_id])
  );

  return (
    <>
      {actionError ? (
        <p className="font-mono text-[11px] text-red-400">{actionError}</p>
      ) : null}
      <Panel
        title="Fleet sync"
        note="One click converges every prod box to the newest template release: points the prod channel at it (if behind) and starts a canary-first sync job swept by the cron. sync-box.sh is idempotent and preserves user state; active boxes are deferred to their idle window."
      >
        <div className="flex flex-wrap items-end gap-4">
          <Stat
            label="latest release"
            value={latest ? latest.version : "—"}
            sub={latest?.notes ?? undefined}
            accent="blue"
          />
          {(channels.data?.channels ?? []).map((channel) => (
            <Stat
              key={channel.name}
              label={`${channel.name} channel`}
              value={releaseById.get(channel.release_id ?? "")?.version ?? "—"}
              accent={
                latest && channel.release_id === latest.id ? "green" : "orange"
              }
            />
          ))}
          <SyncButton disabled={jobActive} />
        </div>
        {channels.error !== null ? <LoadError error={channels.error} /> : null}
      </Panel>
      <Panel
        title="Latest sync job"
        note="Canary boxes go first; a failed canary or too many wave failures pauses the job and failed boxes keep their old baseline."
      >
        {sync.error !== null ? (
          <LoadError error={sync.error} />
        ) : latestJob === null ? (
          <p className="font-mono text-[11px] text-muted-foreground">
            No sync jobs yet.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-end gap-4">
              <Stat
                label="state"
                value={latestJob.state}
                accent={stateAccent(latestJob.state)}
              />
              <Stat
                label="release"
                value={
                  releaseById.get(latestJob.release_id)?.version ??
                  latestJob.release_id
                }
              />
              <Stat label="channel" value={latestJob.channel} />
              <Stat
                label="failures"
                value={`${latestJob.failures} / ${latestJob.failure_threshold}`}
              />
              {jobActive ? <JobActions job={latestJob} /> : null}
            </div>
            <DataTable
              headers={["box", "user", "canary", "state", "error", "finished"]}
              rows={(sync.data?.latest_job_boxes ?? []).map((box) => [
                box.provider_box_id,
                boxLabel.get(box.provider_box_id) ?? null,
                box.is_canary ? "yes" : null,
                box.state,
                box.error,
                box.finished_at
                  ? new Date(box.finished_at).toLocaleString()
                  : null,
              ])}
            />
          </div>
        )}
      </Panel>
      <Panel
        title="Releases"
        note="Immutable template artifacts cut from infra/template (release.sh); channels and sync jobs reference them by id."
      >
        {releases.error !== null ? (
          <LoadError error={releases.error} />
        ) : (
          <DataTable
            headers={["version", "git sha", "notes", "cut at"]}
            rows={(releases.data?.releases ?? []).map((release) => [
              release.version,
              release.git_sha.slice(0, 7),
              release.notes,
              new Date(release.created_at).toLocaleString(),
            ])}
          />
        )}
      </Panel>
    </>
  );
}
