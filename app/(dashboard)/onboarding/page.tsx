import { adminGetSafe } from "@/lib/controlPlane";
import type { OnboardingResponse } from "@/lib/types";
import { DataTable, LoadError, Panel, Stat } from "@/components/panel";
import { LabeledBarChart } from "@/components/charts";
import { UserLink } from "@/components/user-link";

export const dynamic = "force-dynamic";

function shortDate(value: string | null): string | null {
  return value ? new Date(value).toISOString().slice(0, 16) : null;
}

export default async function OnboardingPage() {
  const onboarding = await adminGetSafe<OnboardingResponse>(
    "/api/admin/onboarding"
  );

  return (
    <Panel
      title="Onboarding"
      note="From /api/admin/onboarding — step funnel, status-mirror health, and per-user progress. Metadata only (C4)."
    >
      {onboarding.error !== null ? (
        <LoadError error={onboarding.error} />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-6">
            <Stat
              label="users"
              value={String(onboarding.data.totals.users)}
            />
            <Stat
              label="completed"
              value={String(onboarding.data.totals.completed)}
              accent="green"
            />
            <Stat
              label="cards sent"
              value={String(onboarding.data.totals.cards_sent)}
              accent="blue"
            />
            <Stat
              label="warm mirrors"
              value={String(onboarding.data.totals.mirrored)}
              accent="purple"
            />
            <Stat
              label="cold (no mirror)"
              value={String(onboarding.data.totals.cold)}
              accent="orange"
            />
            <Stat
              label="stale mirrors"
              value={String(onboarding.data.totals.stale)}
              sub={`older than ${Math.round(onboarding.data.stale_after_ms / 1000)}s`}
            />
          </div>
          <div className="mb-4">
            <p className="mb-1 font-mono text-[10px] text-muted-foreground">
              users done per step (mirrored users only)
            </p>
            <LabeledBarChart
              valueLabel="done"
              color="green"
              data={onboarding.data.steps.map((step) => ({
                label: step,
                value: onboarding.data.funnel[step]?.done ?? 0,
              }))}
            />
          </div>
          <DataTable
            headers={[
              "user",
              "done",
              "skipped",
              "todo",
              "next step",
              "mirror refreshed",
              "card sent",
            ]}
            rows={onboarding.data.users.map((user) => [
              <UserLink
                key={user.user_id}
                userId={user.user_id}
                label={user.username ?? user.user_id.slice(0, 8)}
              />,
              user.done,
              user.skipped,
              user.todo,
              user.next_step ?? "complete",
              shortDate(user.mirror_refreshed_at) ?? "cold",
              shortDate(user.card_sent_at),
            ])}
          />
        </>
      )}
    </Panel>
  );
}
