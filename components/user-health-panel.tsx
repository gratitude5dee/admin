import { DataTable, LoadError, Panel, Stat } from "@/components/panel";
import type { HealthResponse } from "@/lib/types";

type HealthResult =
  | { data: HealthResponse; error: null }
  | { data: null; error: string };

function timestamp(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "—";
}

function duration(seconds: number | null): string {
  if (seconds === null) return "—";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

function money(value: number | null): string {
  return value === null ? "—" : `$${value.toFixed(2)}`;
}

export function UserHealthPanel({
  health,
  userId,
  days,
  memoryRequested,
  wakeRequested,
}: {
  health: HealthResult;
  userId: string;
  days: number;
  memoryRequested: boolean;
  wakeRequested: boolean;
}) {
  const userPath = `/users/${encodeURIComponent(userId)}`;
  return (
    <Panel
      title="Health"
      note="Metadata only. Live memory checks run only when an operator requests one."
    >
      {health.error !== null ? (
        <LoadError error={health.error} />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <form method="get" action={userPath}>
              <input type="hidden" name="days" value={String(days)} />
              <input type="hidden" name="health_memory" value="1" />
              <button
                type="submit"
                className="rounded-md border border-sky-400/40 bg-sky-400/10 px-3 py-1.5 font-mono text-[11px] text-sky-300 hover:bg-sky-400/20"
              >
                Check live memory
              </button>
            </form>
            <form method="get" action={userPath}>
              <input type="hidden" name="days" value={String(days)} />
              <input type="hidden" name="health_memory" value="1" />
              <input type="hidden" name="health_wake" value="1" />
              <button
                type="submit"
                className="rounded-md border border-orange-400/40 bg-orange-400/10 px-3 py-1.5 font-mono text-[11px] text-orange-300 hover:bg-orange-400/20"
              >
                Wake and check memory
              </button>
            </form>
            {memoryRequested ? (
              <span className="self-center font-mono text-[10px] text-muted-foreground">
                {wakeRequested
                  ? "Explicit wake requested."
                  : "No-wake live check requested."}
              </span>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Stat
              label="memory"
              value={health.data.memory.status}
              sub={
                health.data.memory.checked_at
                  ? timestamp(health.data.memory.checked_at)
                  : undefined
              }
              accent={
                health.data.memory.status === "healthy" ? "green" : "orange"
              }
            />
            <Stat
              label="Hermes runs"
              value={String(health.data.hermes.runs)}
              sub={`${health.data.hermes.success} ok / ${health.data.hermes.failed} failed`}
              accent="blue"
            />
            <Stat
              label="connectors"
              value={String(health.data.connectors.total)}
              sub={`${health.data.connectors.counts["active"] ?? 0} active`}
              accent="purple"
            />
            <Stat
              label="inbound queue"
              value={String(health.data.transport.queued)}
              sub={`oldest ${duration(
                health.data.transport.oldest_queued_age_seconds,
              )}`}
              accent="orange"
            />
            <Stat
              label="fleet drift"
              value={health.data.compute.drift}
              sub={health.data.compute.baseline_version ?? "no baseline"}
            />
            <Stat
              label="monthly spend"
              value={money(health.data.spend.spend_mtd_usd)}
              sub={
                health.data.spend.monthly_cap_usd === null
                  ? "no cap"
                  : `${Math.round(
                      (health.data.spend.monthly_cap_ratio ?? 0) * 100,
                    )}% of ${money(health.data.spend.monthly_cap_usd)}`
              }
              accent="pink"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <p className="mb-2 font-mono text-[10px] text-muted-foreground">
                memory and Hermes
              </p>
              <DataTable
                headers={["signal", "value"]}
                rows={[
                  ["resources", health.data.memory.resources],
                  ["memories", health.data.memory.memories],
                  ["workspace bytes", health.data.memory.workspace_bytes],
                  ["pending index work", health.data.memory.pending],
                  ["truncated", health.data.memory.truncated ? "yes" : "no"],
                  ["open runs", health.data.hermes.open],
                  ["stuck runs", health.data.hermes.stuck],
                  ["p95 latency", health.data.hermes.p95_latency_ms],
                  [
                    "failure outcomes",
                    Object.entries(health.data.hermes.failure_outcomes)
                      .map(([outcome, count]) => `${outcome}: ${count}`)
                      .join(", ") || "—",
                  ],
                  ["last run", timestamp(health.data.hermes.last_run_at)],
                ]}
              />
            </div>
            <div>
              <p className="mb-2 font-mono text-[10px] text-muted-foreground">
                transport and lifecycle
              </p>
              <DataTable
                headers={["signal", "value"]}
                rows={[
                  ["received", health.data.transport.received],
                  ["dispatched", health.data.transport.dispatched],
                  ["failed", health.data.transport.failed],
                  ["ignored", health.data.transport.ignored],
                  ["latest inbound", timestamp(health.data.transport.latest_received_at)],
                  ["starts / stops", `${health.data.compute.starts} / ${health.data.compute.stops}`],
                  ["last event", health.data.compute.last_event_state],
                  ["created", timestamp(health.data.compute.created_at)],
                  ["replacement claim", health.data.compute.replacement_claim_status],
                  [
                    "claim timestamp",
                    timestamp(health.data.compute.replacement_claimed_at),
                  ],
                ]}
              />
            </div>
          </div>

          <div>
            <p className="mb-2 font-mono text-[10px] text-muted-foreground">
              connector state
            </p>
            <DataTable
              headers={["provider", "toolkit", "status", "connected"]}
              rows={health.data.connectors.connections.map((connection) => [
                connection.provider,
                connection.toolkit,
                connection.status,
                timestamp(connection.connected_at),
              ])}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <p className="mb-2 font-mono text-[10px] text-muted-foreground">
                provider and release
              </p>
              <DataTable
                headers={["signal", "value"]}
                rows={[
                  ["provider", health.data.compute.provider],
                  ["provider Box", health.data.compute.provider_box_id],
                  ["environment", health.data.compute.environment],
                  ["state", health.data.compute.state],
                  ["channel", health.data.compute.channel],
                  ["target release", health.data.compute.target_version],
                  ["target Hermes", health.data.compute.target_hermes_ref],
                  ["baseline synced", timestamp(health.data.compute.baseline_synced_at)],
                  ["last active", timestamp(health.data.compute.last_active_at)],
                  ["stop deadline", timestamp(health.data.compute.stop_after)],
                ]}
              />
            </div>
            <div>
              <p className="mb-2 font-mono text-[10px] text-muted-foreground">
                cost and quota
              </p>
              <DataTable
                headers={["signal", "value"]}
                rows={[
                  ["speed tier", health.data.spend.speed_tier],
                  ["gateway cost", `$${health.data.spend.gateway_cost_usd.toFixed(4)}`],
                  ["total tokens", health.data.spend.total_tokens.toLocaleString()],
                  ["render spend", money(health.data.spend.render_cents / 100)],
                  ["storage bytes", health.data.spend.storage_bytes.toLocaleString()],
                  ["storage / month", money(health.data.spend.storage_cents_month / 100)],
                  ["ad spend", money(health.data.spend.ad_spend_cents / 100)],
                  ["ad ceiling", health.data.spend.ad_ceiling_cents === null ? "—" : money(health.data.spend.ad_ceiling_cents / 100)],
                  ["Cortex calls / errors", `${health.data.spend.cortex_calls} / ${health.data.spend.cortex_errors}`],
                ]}
              />
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}
