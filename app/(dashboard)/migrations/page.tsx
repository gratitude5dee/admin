import { adminGetSafe } from "@/lib/controlPlane";
import {
  cancellable,
  directionLabel,
  cleanupPending,
  cutoverable,
  drivable,
  phaseAccent,
  returnable,
  TERMINAL_PHASES,
  type MigrationListResponse,
  type MigrationListRow,
  type MigrationStatus,
} from "@/lib/migrations";
import {
  DataTable,
  LoadError,
  Panel,
  Stat,
  type StatAccent,
} from "@/components/panel";
import { UserLink } from "@/components/user-link";
import { fetchUserDirectory } from "@/lib/users";

export const dynamic = "force-dynamic";

const control =
  "rounded-md border border-border bg-background px-3 py-1.5 font-mono text-[11px] text-foreground";

const ACCENT_TEXT: Record<StatAccent, string> = {
  green: "text-emerald-400",
  blue: "text-sky-400",
  purple: "text-violet-400",
  orange: "text-orange-400",
  pink: "text-pink-400",
  none: "text-foreground",
};

function fmt(ts: string | null): string {
  if (!ts) return "—";
  return ts.replace("T", " ").slice(0, 19);
}

function ActionForm({
  userId,
  op,
  label,
  note,
  danger,
}: {
  userId: string;
  op: string;
  label: string;
  note: string;
  danger?: boolean;
}) {
  return (
    <form
      method="post"
      action="/api/migrations"
      className={`rounded-md border p-3 ${
        danger
          ? "border-orange-400/30 bg-orange-400/5"
          : "border-border bg-background"
      }`}
    >
      <input type="hidden" name="user_id" value={userId} />
      <input type="hidden" name="op" value={op} />
      <p className="font-mono text-[11px] text-muted-foreground">{note}</p>
      <label className="mt-3 flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
        <input required type="checkbox" name="confirm" value={op} className="size-3" />
        Confirm {op}
      </label>
      <button
        type="submit"
        className={`mt-3 px-3 py-1.5 font-mono text-[11px] rounded-md border ${
          danger
            ? "border-orange-400/50 bg-orange-400/10 text-orange-200 hover:bg-orange-400/20"
            : "border-border bg-card text-foreground hover:bg-border/30"
        }`}
      >
        {label}
      </button>
    </form>
  );
}

function intervalSummary(m: MigrationListRow): string {
  if (!m.work_paused_at) return "—";
  const paused = Date.parse(m.work_paused_at);
  const resumed = m.work_resumed_at ? Date.parse(m.work_resumed_at) : null;
  const pauseSecs = resumed ? Math.round((resumed - paused) / 1000) : null;
  const elapsed = Math.round((Date.parse(m.updated_at) - Date.parse(m.created_at)) / 1000);
  return `elapsed ${elapsed}s${pauseSecs !== null ? ` · paused ${pauseSecs}s` : " · pause in progress"}`;
}

export default async function MigrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ user_id?: string; error?: string; done?: string }>;
}) {
  const params = await searchParams;
  const userId = params.user_id?.trim() ?? "";
  const [list, directory] = await Promise.all([
    adminGetSafe<MigrationListResponse>("/api/admin/migrations"),
    fetchUserDirectory(),
  ]);

  let status: Awaited<ReturnType<typeof adminGetSafe<MigrationStatus>>> | null =
    null;
  if (userId) {
    status = await adminGetSafe<MigrationStatus>(
      `/api/admin/migrations?user_id=${encodeURIComponent(userId)}`,
    );
  }
  const migration = status?.data?.migration ?? null;

  const live = list.data
    ? list.data.migrations.filter((m) => !TERMINAL_PHASES.has(m.phase))
    : [];
  const settled = list.data
    ? list.data.migrations.filter((m) => TERMINAL_PHASES.has(m.phase))
    : [];

  return (
    <>
      {params.error ? (
        <p className="mb-4 font-mono text-[11px] text-red-400">
          {params.error}
        </p>
      ) : null}
      {params.done ? (
        <p className="mb-4 font-mono text-[11px] text-emerald-400">
          {params.done} accepted.
        </p>
      ) : null}

      <Panel
        title="Migration lookup"
        note="Data-preserving Box↔Tenki moves. Refused entirely while MIGRATION_ENABLED is unset on the control plane."
      >
        <form method="get" action="/migrations" className="flex flex-wrap items-center gap-3">
          <input
            name="user_id"
            defaultValue={userId}
            placeholder="user id"
            className={`${control} w-80`}
          />
          <button type="submit" className={control}>Load</button>
        </form>
      </Panel>

      {status ? (
        <Panel
          title={userId ? `Migration · ${directory.label(userId)}` : "Migration"}
          note="Status is read live from the control plane; actions below drive the persisted state machine."
        >
          {status.error !== null ? (
            <LoadError error={status.error} />
          ) : migration === null ? (
            <>
              <p className="font-mono text-[11px] text-muted-foreground">
                No live migration for this user.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <form
                  method="post"
                  action="/api/migrations"
                  className="rounded-md border border-border bg-background p-3"
                >
                  <input type="hidden" name="user_id" value={userId} />
                  <input type="hidden" name="op" value="prepare" />
                  <p className="font-mono text-[11px] text-muted-foreground">
                    Pre-copies the tenant&rsquo;s data to a freshly provisioned
                    candidate while the source keeps serving. Nothing about
                    routing changes until cutover.
                  </p>
                  <label className="mt-3 flex items-center gap-2 font-mono text-[11px]">
                    Direction{" "}
                    <select name="direction" defaultValue="box_to_tenki" className={control}>
                      <option value="box_to_tenki">Box → Tenki</option>
                      <option value="tenki_to_box">Tenki → Box</option>
                    </select>
                  </label>
                  <label className="mt-3 flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
                    <input required type="checkbox" name="confirm" value="prepare" className="size-3" />
                    Confirm prepare
                  </label>
                  <button type="submit" className={`mt-3 ${control}`}>
                    Prepare migration
                  </button>
                </form>
              </div>
            </>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-4">
                <Stat
                  label="phase"
                  value={migration.phase}
                  accent={phaseAccent(migration.phase)}
                />
                <Stat
                  label="direction"
                  value={`${directionLabel(migration.direction)} · ${migration.leg}`}
                />
                <Stat
                  label="routing generation"
                  value={String(status.data?.control?.routing_generation ?? "—")}
                  sub={status.data?.control ? `admission ${status.data.control.admission}` : undefined}
                />
                <Stat
                  label="live operations"
                  value={String(status.data?.liveOperations ?? 0)}
                  sub="leases still draining"
                />
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-4">
                <Stat label="work intervals" value={intervalSummary(migration)} />
                <Stat label="wake_at" value={fmt(migration.wake_at)} />
                <Stat
                  label="retention until"
                  value={fmt(migration.retention_until)}
                />
                <Stat
                  label="error"
                  value={migration.error_code ?? "—"}
                  sub={migration.error_detail ?? undefined}
                  accent={migration.error_code ? "pink" : "none"}
                />
              </div>

              {(status.data?.targets ?? []).length > 0 ? (
                <div className="mt-4">
                  <DataTable
                    headers={["role", "provider", "provider box id", "sealed creds"]}
                    rows={(status.data?.targets ?? []).map((t) => [
                      t.role,
                      t.provider,
                      t.provider_box_id,
                      t.credentials_sealed ? "sealed" : "—",
                    ])}
                  />
                </div>
              ) : null}

              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {cutoverable(migration) ? (
                  <ActionForm
                    userId={userId}
                    op="cutover"
                    label="Run cutover"
                    note="Closes admission, drains live operations, fences the source, copies the final generation, commits routing to the candidate, then re-opens on the new box."
                    danger
                  />
                ) : null}
                {cancellable(migration) ? (
                  <ActionForm
                    userId={userId}
                    op="cancel"
                    label="Cancel migration"
                    note="Pre-commit only: lifts the fence, re-opens admission on the source, and destroys the candidate. Refused once the route has committed."
                  />
                ) : null}
                {returnable(migration) ? (
                  <ActionForm
                    userId={userId}
                    op="return"
                    label="Return to source provider"
                    note="Reverses the move: a back-leg copies the new box's changes to the retained source, then routing flips back."
                    danger
                  />
                ) : null}
                {cleanupPending(migration) ? (
                  <ActionForm
                    userId={userId}
                    op="cleanup"
                    label="Approve source deletion"
                    note="Deletes the retained (old) box. Gated on the retention window AND this explicit acceptance."
                    danger
                  />
                ) : null}
                {drivable(migration) && !TERMINAL_PHASES.has(migration.phase) ? (
                  <ActionForm
                    userId={userId}
                    op="drive"
                    label="Drive now"
                    note="Re-arms the worker on a parked migration — use after clearing a fault so it doesn't wait for the sweeper."
                  />
                ) : null}
              </div>
            </>
          )}
        </Panel>
      ) : null}

      <Panel
        title="Live migrations"
        note="Non-terminal rows across the fleet, most recently touched first."
      >
        {list.error !== null ? (
          <LoadError error={list.error} />
        ) : (
          <DataTable
            headers={["user", "phase", "direction", "leg", "intervals", "wake_at", "error"]}
            rows={live.map((m) => [
              <UserLink key="u" userId={m.user_id} label={directory.label(m.user_id)} />,
              <span key="p" className={ACCENT_TEXT[phaseAccent(m.phase)]}>
                {m.phase}
              </span>,
              directionLabel(m.direction),
              m.leg,
              intervalSummary(m),
              fmt(m.wake_at),
              m.error_code,
            ])}
          />
        )}
      </Panel>

      <Panel title="Recently settled">
        {list.error !== null ? (
          <LoadError error={list.error} />
        ) : (
          <DataTable
            headers={["user", "phase", "direction", "updated", "error"]}
            rows={settled.map((m) => [
              <UserLink key="u" userId={m.user_id} label={directory.label(m.user_id)} />,
              m.phase,
              directionLabel(m.direction),
              fmt(m.updated_at),
              m.error_code,
            ])}
          />
        )}
      </Panel>
    </>
  );
}
