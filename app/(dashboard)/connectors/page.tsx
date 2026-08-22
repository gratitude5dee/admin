import { adminGetSafe } from "@/lib/controlPlane";
import type { ConnectorsResponse } from "@/lib/types";
import { DataTable, LoadError, Panel, Stat } from "@/components/panel";
import { BreakdownPieChart, LabeledBarChart } from "@/components/charts";

export const dynamic = "force-dynamic";

export default async function ConnectorsPage() {
  const connectors = await adminGetSafe<ConnectorsResponse>(
    "/api/admin/connectors"
  );

  return (
    <Panel title="Connectors" note="From /api/admin/connectors — connection rows per toolkit and status across all users.">
      {connectors.error !== null ? (
        <LoadError error={connectors.error} />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Stat label="active" value={String(connectors.data.totals.active)} />
            <Stat label="pending" value={String(connectors.data.totals.pending)} />
            <Stat label="revoked" value={String(connectors.data.totals.revoked)} />
            <Stat label="error" value={String(connectors.data.totals.error)} />
            <Stat label="unknown" value={String(connectors.data.totals.unknown)} />
          </div>
          <div className="mb-4 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-1 font-mono text-[10px] text-muted-foreground">
                connections by status
              </p>
              <BreakdownPieChart
                data={Object.entries(connectors.data.totals).map(
                  ([label, value]) => ({ label, value })
                )}
              />
            </div>
            <div>
              <p className="mb-1 font-mono text-[10px] text-muted-foreground">
                active connections by toolkit
              </p>
              <LabeledBarChart
                valueLabel="active"
                color="purple"
                data={connectors.data.toolkits.slice(0, 12).map((toolkit) => ({
                  label: toolkit.toolkit,
                  value: toolkit.active,
                }))}
              />
            </div>
          </div>
          <DataTable
            headers={[
              "toolkit",
              "active",
              "pending",
              "revoked",
              "error",
              "total",
              "users",
            ]}
            rows={connectors.data.toolkits.map((toolkit) => [
              toolkit.toolkit,
              toolkit.active,
              toolkit.pending,
              toolkit.revoked,
              toolkit.error,
              toolkit.total,
              toolkit.users,
            ])}
          />
        </>
      )}
    </Panel>
  );
}
