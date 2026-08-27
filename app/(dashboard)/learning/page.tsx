import { adminGetSafe } from "@/lib/controlPlane";
import type { LearningResponse } from "@/lib/types";
import { DataTable, LoadError, Panel, Stat } from "@/components/panel";
import { BreakdownPieChart } from "@/components/charts";

export const dynamic = "force-dynamic";

const MILESTONE_BADGE: Record<string, string> = {
  shipped: "text-emerald-500",
  in_progress: "text-amber-500",
  planned: "text-muted-foreground",
};

export default async function LearningPage() {
  const learning = await adminGetSafe<LearningResponse>("/api/admin/learning");

  if (learning.error !== null) {
    return (
      <Panel title="Learning plane" note="From /api/admin/learning — content-free receipts only (L4).">
        <LoadError error={learning.error} />
      </Panel>
    );
  }

  const { plan, modes, feedback, experiments, profiles, events } =
    learning.data;

  return (
    <>
      <Panel
        title={`Learning plan (${plan.version})`}
        note={plan.objective}
      >
        <div className="mb-4 grid gap-2 sm:grid-cols-3">
          {plan.milestones.map((m) => (
            <div key={m.id} className="border border-border p-2">
              <p className="font-mono text-[11px] text-foreground">
                {m.id} — {m.title}{" "}
                <span className={`${MILESTONE_BADGE[m.status] ?? ""}`}>
                  [{m.status}]
                </span>
              </p>
              <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                {m.outcome}
              </p>
            </div>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-1 font-mono text-[10px] text-muted-foreground">
              control modes
            </p>
            <ul className="space-y-1">
              {plan.modes.map((m) => (
                <li key={m.mode} className="font-mono text-[10px] text-muted-foreground">
                  <span className="text-foreground">{m.mode}</span> — {m.description}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-1 font-mono text-[10px] text-muted-foreground">
              hard gates (fail-closed) · policy {plan.promotionPolicyVersion}
            </p>
            <p className="font-mono text-[10px] text-muted-foreground">
              {plan.hardGates.join(" · ")}
            </p>
            <p className="mt-2 mb-1 font-mono text-[10px] text-muted-foreground">
              invariants
            </p>
            <ul className="space-y-1">
              {plan.invariants.map((line) => (
                <li key={line} className="font-mono text-[10px] text-muted-foreground">
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Panel>

      <Panel
        title="Owner modes"
        note="learning_settings rows by mode — private beta defaults to observe."
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Object.entries(modes).map(([mode, count]) => (
            <Stat key={mode} label={mode} value={String(count)} />
          ))}
        </div>
      </Panel>

      <Panel
        title="Typed feedback"
        note="Reason enum and delivery only — free-text corrections never leave the owner's Box."
      >
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="total" value={String(feedback.total)} />
          <Stat label="last 24h" value={String(feedback.last24h)} />
          <Stat label="forwarded to box" value={String(feedback.forwarded)} />
        </div>
        {Object.keys(feedback.byReason).length > 0 && (
          <BreakdownPieChart
            data={Object.entries(feedback.byReason).map(([label, value]) => ({
              label,
              value,
            }))}
          />
        )}
      </Panel>

      <Panel
        title="Experiments"
        note="Aggregate results from twin evaluations — per-trial detail stays in the Box ledger."
      >
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Object.entries(experiments.byStatus).map(([status, count]) => (
            <Stat key={status} label={status} value={String(count)} />
          ))}
        </div>
        <DataTable
          headers={[
            "when",
            "experiment",
            "status",
            "backend",
            "n",
            "Δ success",
            "Δ lower95",
            "gate fails",
            "cost usd",
            "error",
          ]}
          rows={experiments.recent.map((e) => [
            new Date(e.created_at).toISOString().slice(0, 16),
            e.experiment_id,
            e.status,
            e.backend ?? "—",
            e.sample_count === null ? "—" : String(e.sample_count),
            e.task_success_delta === null ? "—" : String(e.task_success_delta),
            e.task_success_delta_lower95 === null
              ? "—"
              : String(e.task_success_delta_lower95),
            e.hard_gate_failures === null ? "—" : String(e.hard_gate_failures),
            e.cost_usd === null ? "—" : String(e.cost_usd),
            e.error_class ?? "—",
          ])}
        />
      </Panel>

      <Panel
        title="Profiles"
        note="Opaque profile IDs and lifecycle — profile bodies stay in the Box."
      >
        <DataTable
          headers={["when", "profile", "status", "rollback reason", "activated", "rolled back"]}
          rows={profiles.map((p) => [
            new Date(p.created_at).toISOString().slice(0, 16),
            p.profile_id,
            p.status,
            p.rollback_reason ?? "—",
            p.activated_at
              ? new Date(p.activated_at).toISOString().slice(0, 16)
              : "—",
            p.rolled_back_at
              ? new Date(p.rolled_back_at).toISOString().slice(0, 16)
              : "—",
          ])}
        />
      </Panel>

      <Panel
        title="Receipt stream"
        note="learning_events drained from each Box's outbox — allowlisted fields only."
      >
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Object.entries(events.byType).map(([type, count]) => (
            <Stat key={type} label={type} value={String(count)} />
          ))}
        </div>
        <DataTable
          headers={["occurred", "event", "status", "backend", "error", "rollback reason"]}
          rows={events.recent.map((e) => [
            new Date(e.occurred_at).toISOString().slice(0, 16),
            e.event_type,
            e.status ?? "—",
            e.backend ?? "—",
            e.error_class ?? "—",
            e.rollback_reason ?? "—",
          ])}
        />
      </Panel>
    </>
  );
}
