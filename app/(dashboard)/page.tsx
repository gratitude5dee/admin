import { adminGetSafe } from "@/lib/controlPlane";
import { fetchUserDirectory } from "@/lib/users";
import type { BoxesResponse, OpsResponse } from "@/lib/types";
import { DataTable, LoadError, Panel, Stat } from "@/components/panel";
import { BreakdownPieChart, LabeledBarChart } from "@/components/charts";

export const dynamic = "force-dynamic";

function hours(seconds: number): string {
  return `${(seconds / 3600).toFixed(1)}h`;
}

export default async function BoxesPage() {
  const [ops, boxes, directory] = await Promise.all([
    adminGetSafe<OpsResponse>("/api/admin/ops"),
    adminGetSafe<BoxesResponse>("/api/admin/boxes?days=7"),
    fetchUserDirectory(),
  ]);

  return (
    <>
      <Panel title="Box start rate" note="From /api/admin/ops — platform ceilings 600/hr, 1,500/day.">
        {ops.error !== null ? (
          <LoadError error={ops.error} />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="starts / hour" value={String(ops.data.starts?.hour ?? 0)} />
            <Stat label="starts / day" value={String(ops.data.starts?.day ?? 0)} />
            <Stat
              label="hourly ceiling"
              value={String(ops.data.starts?.hourly_ceiling ?? 600)}
            />
            <Stat
              label="daily ceiling"
              value={String(ops.data.starts?.daily_ceiling ?? 1500)}
            />
          </div>
        )}
      </Panel>

      <Panel title="Box usage (7 days)" note="From /api/admin/boxes — current state, wakes/stops, metered box seconds.">
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
                directory.label(user.user_id),
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
