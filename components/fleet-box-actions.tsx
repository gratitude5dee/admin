import { Panel } from "@/components/panel";

const control = "rounded-md border border-border bg-background px-3 py-1.5 font-mono text-[11px] text-foreground";

export function FleetBoxActions({
  result,
  continuation,
  after,
}: {
  result?: string;
  continuation?: "dev" | "prod";
  after?: string;
}) {
  return (
    <Panel
      title="Box management"
      note="Relabel applies air-<username> to provider resources, including stopped Tenki snapshots. Stable box IDs remain unchanged. Safe-stop targets ready/idle boxes on the selected channel; active work and indexing still defer through the normal stop claim."
    >
      {result ? <p role="status" className="mb-3 font-mono text-xs">{result}</p> : null}
      <div className="flex flex-wrap items-start gap-6">
        <form method="post" action="/api/fleet/boxes">
          <input type="hidden" name="action" value="relabel" />
          <button type="submit" className={control}>Apply username labels</button>
        </form>
        <form method="post" action="/api/fleet/boxes" className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="action" value="stop-idle" />
          {continuation ? (
            <>
              <input type="hidden" name="channel" value={continuation} />
              {after ? <input type="hidden" name="after" value={after} /> : null}
              <span className="font-mono text-xs">Remaining {continuation} boxes</span>
            </>
          ) : (
            <label className="font-mono text-xs">
              Channel{" "}
              <select name="channel" defaultValue="dev" className={control}>
                <option value="dev">dev</option>
                <option value="prod">prod</option>
              </select>
            </label>
          )}
          <label className="flex items-center gap-2 font-mono text-[11px]">
            <input type="checkbox" name="confirm" value="stop-idle" required />
            Reclaim eligible compute on this channel
          </label>
          <button type="submit" className={control}>
            {continuation ? "Continue safe-stop batch" : "Safe-stop eligible boxes"}
          </button>
        </form>
      </div>
      <p className="mt-3 font-mono text-[10px] text-muted-foreground">
        Results cover one batch. Continue when prompted; deferred boxes need a later retry.
        Snapshotting boxes remain stopping until the provider confirms completion.
      </p>
    </Panel>
  );
}
