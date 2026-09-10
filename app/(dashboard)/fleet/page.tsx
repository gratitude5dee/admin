import { adminGetSafe } from "@/lib/controlPlane";
import type {
  BoxesResponse,
  FleetChannelsResponse,
  FleetRelease,
  FleetReleasesResponse,
  FleetSyncJob,
  FleetSyncResponse,
} from "@/lib/types";
import {
  boxDrift,
  claimAge,
  countBy,
  driftAccent,
  OPEN_BOX_STATES,
  rowDuration,
  shortRef,
  type FleetBox,
} from "@/lib/fleet";
import {
  DataTable,
  LoadError,
  Panel,
  Stat,
  type StatAccent,
} from "@/components/panel";
import { UserLink } from "@/components/user-link";
import { FleetBoxActions } from "@/components/fleet-box-actions";

export const dynamic = "force-dynamic";

const ACTIVE_STATES = new Set(["canary", "rolling", "paused"]);
/** Box states a sync job enrolls (startSyncJob's SYNCABLE_STATES). */
const SYNCABLE_BOX_STATES = new Set(["ready", "stopped"]);
const BOX_STATE_ORDER = ["failed", "syncing", "deferred", "pending", "ok"];

/** Literal class names so Tailwind can see them. */
const ACCENT_TEXT: Record<StatAccent, string> = {
  green: "text-emerald-400",
  blue: "text-sky-400",
  purple: "text-violet-400",
  orange: "text-orange-400",
  pink: "text-pink-400",
  none: "text-foreground",
};

function stateAccent(state: string): StatAccent {
  if (state === "done") return "green";
  if (state === "failed" || state === "aborted") return "pink";
  if (state === "paused") return "orange";
  return "blue";
}

function boxStateAccent(state: string): StatAccent {
  switch (state) {
    case "ok":
      return "green";
    case "failed":
      return "pink";
    case "deferred":
      return "orange";
    case "syncing":
      return "blue";
    default:
      return "none";
  }
}

function when(iso: string | null | undefined): string | null {
  return iso ? new Date(iso).toLocaleString() : null;
}

function SyncForm({
  disabled,
  latest,
  candidates,
}: {
  disabled: boolean;
  latest: FleetRelease | null;
  candidates: { id: string; label: string }[];
}) {
  const control =
    "rounded-md border border-border bg-background px-2 py-1 font-mono text-[11px] text-foreground";
  return (
    <form
      method="post"
      action="/api/fleet/sync"
      className="flex flex-wrap items-end gap-3"
    >
      <input type="hidden" name="action" value="sync" />
      <input type="hidden" name="channel" value="prod" />
      <label className="flex flex-col gap-1 font-mono text-[10px] text-muted-foreground">
        canary box (optional)
        <select
          name="canary_box_id"
          defaultValue=""
          disabled={disabled}
          className={control}
        >
          <option value="">none — roll in waves from the start</option>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label} · {c.id}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 pb-1.5 font-mono text-[10px] text-muted-foreground">
        <input
          type="checkbox"
          name="include_hermes"
          defaultChecked={Boolean(latest?.hermes_ref)}
          disabled={disabled || !latest?.hermes_ref}
        />
        repin Hermes
        {latest?.hermes_ref ? ` (${shortRef(latest.hermes_ref)})` : " (release pins none)"}
      </label>
      <button
        type="submit"
        disabled={disabled}
        className="rounded-md border border-border bg-background px-3 py-1.5 font-mono text-[11px] text-foreground hover:bg-card disabled:cursor-not-allowed disabled:opacity-40"
      >
        Sync prod fleet to latest release
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
  searchParams: Promise<{
    error?: string;
    box_result?: string;
    continue_stop?: string;
    after?: string;
  }>;
}) {
  const { error: actionError, box_result, continue_stop, after } = await searchParams;
  const [releases, channels, sync, boxes] = await Promise.all([
    adminGetSafe<FleetReleasesResponse>("/api/admin/fleet/releases"),
    adminGetSafe<FleetChannelsResponse>("/api/admin/fleet/channels"),
    adminGetSafe<FleetSyncResponse>("/api/admin/fleet/sync"),
    adminGetSafe<BoxesResponse>("/api/admin/boxes?days=30"),
  ]);
  const now = Date.now();

  const releaseById = new Map(
    (releases.data?.releases ?? []).map((r) => [r.id, r])
  );
  const latest = releases.data?.releases[0] ?? null;
  const channelList = channels.data?.channels ?? [];
  const channelTarget = new Map(
    channelList.map((c) => [
      c.name as string,
      c.release_id ? (releaseById.get(c.release_id) ?? null) : null,
    ])
  );
  const jobs = sync.data?.jobs ?? [];
  const latestJob = jobs[0] ?? null;
  const jobActive = latestJob !== null && ACTIVE_STATES.has(latestJob.state);
  const jobBoxes = [...(sync.data?.latest_job_boxes ?? [])].sort(
    (a, b) =>
      BOX_STATE_ORDER.indexOf(a.state) - BOX_STATE_ORDER.indexOf(b.state)
  );
  const jobBoxCounts = countBy(jobBoxes, (b) => b.state);
  const openRows = jobBoxes.filter((b) => OPEN_BOX_STATES.has(b.state)).length;

  const fleet: FleetBox[] = (boxes.data?.users ?? []).filter(
    (u) => u.provider_box_id
  );
  const userLabel = (u: FleetBox) => u.username ?? u.user_id.slice(0, 8);
  const boxUser = new Map(fleet.map((u) => [u.provider_box_id as string, u]));
  const withDrift = fleet
    .map((u) => ({
      box: u,
      target: channelTarget.get(u.channel ?? "prod") ?? null,
      drift: boxDrift(u, channelTarget.get(u.channel ?? "prod") ?? null),
    }))
    .sort((a, b) => a.drift.localeCompare(b.drift));
  const driftCounts = countBy(withDrift, (d) => d.drift);
  const canaryCandidates = fleet
    .filter(
      (u) =>
        (u.channel ?? "prod") === "prod" &&
        SYNCABLE_BOX_STATES.has(u.state ?? "")
    )
    .map((u) => ({ id: u.provider_box_id as string, label: userLabel(u) }));

  return (
    <>
      {actionError ? (
        <p className="font-mono text-[11px] text-red-400">{actionError}</p>
      ) : null}
      <Panel
        title="Fleet sync"
        note="Converges every prod box to the newest template release: points the prod channel at it (if behind) and starts a sync job the cron sweeps one wave per minute. sync-box.sh is idempotent and preserves user state; a box mid-conversation is deferred (not interrupted) and retried on its next idle window. With a canary chosen the job syncs that box first and pauses on failure; 'repin Hermes' also moves each box to the release's Hermes ref and re-runs verify-box.sh."
      >
        <div className="flex flex-wrap items-end gap-4">
          <Stat
            label="latest release"
            value={latest ? latest.version : "—"}
            sub={
              latest
                ? `hermes ${shortRef(latest.hermes_ref) ?? "unpinned"}${latest.notes ? ` · ${latest.notes}` : ""}`
                : undefined
            }
            accent="blue"
          />
          {channelList.map((channel) => (
            <Stat
              key={channel.name}
              label={`${channel.name} channel`}
              value={releaseById.get(channel.release_id ?? "")?.version ?? "—"}
              sub={`since ${when(channel.updated_at) ?? "—"}`}
              accent={
                latest === null
                  ? "blue"
                  : channel.release_id === latest.id
                    ? "green"
                    : "orange"
              }
            />
          ))}
        </div>
        <div className="mt-3">
          <SyncForm
            disabled={jobActive || latest === null}
            latest={latest}
            candidates={canaryCandidates}
          />
          {jobActive ? (
            <p className="mt-1 font-mono text-[10px] text-muted-foreground">
              A job is {latestJob?.state}; pause/resume/abort it below before
              starting another.
            </p>
          ) : null}
        </div>
        {releases.error !== null ? <LoadError error={releases.error} /> : null}
        {channels.error !== null ? <LoadError error={channels.error} /> : null}
      </Panel>

      <FleetBoxActions
        result={box_result}
        continuation={continue_stop === "dev" || continue_stop === "prod" ? continue_stop : undefined}
        after={after}
      />

      <Panel
        title="Box drift"
        note="Each box against the release its channel points at. baseline is the template release sync-box.sh last converged it to; hermes is the pinned Hermes ref. 'behind' means the channel moved past the box, 'hermes behind' means the release only differs in its Hermes pin, 'unsynced' means no fleet sync has ever recorded a baseline for it, 'no target' means the box's channel has no release to compare against. A stopped box is normal (idle); it is resumed for its sync and stopped again."
      >
        {boxes.error !== null ? (
          <LoadError error={boxes.error} />
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-end gap-4">
              <Stat label="boxes" value={String(fleet.length)} />
              {(
                [
                  "current",
                  "behind",
                  "hermes behind",
                  "unsynced",
                  "no target",
                ] as const
              ).map((drift) => (
                <Stat
                  key={drift}
                  label={drift}
                  value={String(driftCounts[drift] ?? 0)}
                  accent={
                    (driftCounts[drift] ?? 0) === 0 ? "none" : driftAccent(drift)
                  }
                />
              ))}
            </div>
            <DataTable
              headers={[
                "owner label (target)",
                "stable box ID",
                "user",
                "provider",
                "channel",
                "box state",
                "drift",
                "baseline",
                "hermes",
                "synced",
                "last active",
              ]}
              rows={withDrift.map(({ box, target, drift }) => [
                box.username ? `air-${box.username}` : "No username",
                box.provider_box_id,
                <UserLink
                  key={box.user_id}
                  userId={box.user_id}
                  label={userLabel(box)}
                />,
                box.provider,
                box.channel ?? null,
                box.state,
                <span key="drift" className={ACCENT_TEXT[driftAccent(drift)]}>
                  {drift}
                </span>,
                box.baseline_version ?? null,
                target?.hermes_ref &&
                box.template_version &&
                box.template_version !== target.hermes_ref ? (
                  <span key="hermes" className="text-orange-400">
                    {shortRef(box.template_version)} → {shortRef(target.hermes_ref)}
                  </span>
                ) : (
                  shortRef(box.template_version)
                ),
                when(box.baseline_synced_at),
                when(box.last_active_at),
              ])}
            />
          </div>
        )}
      </Panel>

      <Panel
        title="Latest sync job"
        note="Each cron tick claims one wave and runs sync-box.sh on each box (then the Hermes repin + verify-box.sh when included). A failed canary, or failures reaching the threshold, pauses the job; resume continues from the remaining pending boxes. Failed boxes keep their old baseline and need attention (usually an unreachable provider command channel). 'syncing' rows show how long the claim has been held — a claim is only reclaimed by a later sweep once it outlives the lease (~24 min), so a few minutes is not stuck."
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
                sub={`updated ${when(latestJob.updated_at) ?? "—"}`}
                accent={stateAccent(latestJob.state)}
              />
              <Stat
                label="release"
                value={
                  releaseById.get(latestJob.release_id)?.version ??
                  latestJob.release_id
                }
                sub={`${latestJob.channel} · hermes ${latestJob.include_hermes ? "repinned" : "left as is"}`}
              />
              <Stat
                label="rollout"
                value={`${latestJob.canary_box_ids.length} canary · waves of ${latestJob.wave_size}`}
                sub={`started ${when(latestJob.created_at) ?? "—"}`}
              />
              <Stat
                label="failures"
                value={`${latestJob.failures} / ${latestJob.failure_threshold}`}
                accent={latestJob.failures > 0 ? "pink" : "none"}
              />
              <Stat
                label="boxes"
                value={`${jobBoxCounts.ok ?? 0} ok · ${openRows} open`}
                sub={BOX_STATE_ORDER.filter((s) => jobBoxCounts[s])
                  .map((s) => `${jobBoxCounts[s]} ${s}`)
                  .join(" · ")}
                accent={
                  (jobBoxCounts.failed ?? 0) > 0
                    ? "pink"
                    : openRows > 0
                      ? "blue"
                      : "green"
                }
              />
              {jobActive ? <JobActions job={latestJob} /> : null}
            </div>
            <DataTable
              headers={[
                "box",
                "user",
                "canary",
                "state",
                "error",
                "claimed",
                "finished",
                "took",
              ]}
              rows={jobBoxes.map((row) => {
                const age = claimAge(row, now);
                const user = boxUser.get(row.provider_box_id);
                return [
                  row.provider_box_id,
                  user ? (
                    <UserLink
                      key={user.user_id}
                      userId={user.user_id}
                      label={userLabel(user)}
                    />
                  ) : null,
                  row.is_canary ? "yes" : null,
                  <span
                    key="state"
                    className={ACCENT_TEXT[boxStateAccent(row.state)]}
                  >
                    {row.state}
                    {age ? (
                      <span
                        className={
                          age.expired ? " text-pink-400" : " text-muted-foreground"
                        }
                      >
                        {" "}
                        {age.expired ? `claim expired (${age.label})` : age.label}
                      </span>
                    ) : null}
                  </span>,
                  row.error,
                  when(row.started_at),
                  when(row.finished_at),
                  rowDuration(row),
                ];
              })}
            />
          </div>
        )}
      </Panel>

      {jobs.length > 1 ? (
        <Panel title="Sync job history">
          <DataTable
            headers={[
              "started",
              "channel",
              "release",
              "state",
              "hermes",
              "canaries",
              "wave",
              "failures",
              "updated",
            ]}
            rows={jobs.slice(1).map((job) => [
              when(job.created_at),
              job.channel,
              releaseById.get(job.release_id)?.version ?? job.release_id,
              <span key="state" className={ACCENT_TEXT[stateAccent(job.state)]}>
                {job.state}
              </span>,
              job.include_hermes ? "repinned" : null,
              job.canary_box_ids.length > 0
                ? String(job.canary_box_ids.length)
                : null,
              String(job.wave_size),
              `${job.failures} / ${job.failure_threshold}`,
              when(job.updated_at),
            ])}
          />
        </Panel>
      ) : null}

      <Panel
        title="Releases"
        note="Immutable template artifacts cut from infra/template (release.sh); channels and sync jobs reference them by id. hermes is the Hermes ref a release pins for boxes synced with 'repin Hermes'."
      >
        {releases.error !== null ? (
          <LoadError error={releases.error} />
        ) : (
          <DataTable
            headers={["version", "git sha", "hermes", "channels", "notes", "cut at"]}
            rows={(releases.data?.releases ?? []).map((release) => [
              release.version,
              release.git_sha.slice(0, 7),
              shortRef(release.hermes_ref),
              channelList
                .filter((c) => c.release_id === release.id)
                .map((c) => c.name)
                .join(", ") || null,
              release.notes,
              when(release.created_at),
            ])}
          />
        )}
      </Panel>
    </>
  );
}
