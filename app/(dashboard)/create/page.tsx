import Link from "next/link";
import { adminGetSafe } from "@/lib/controlPlane";
import type { CreateOpsResponse } from "@/lib/types";
import { DataTable, LoadError, Panel, Stat } from "@/components/panel";
import { BreakdownPieChart, LabeledBarChart } from "@/components/charts";
import { RangeToggle, rangeDays } from "@/components/range-toggle";
import {
  QA_GATE,
  buildFailedAccent,
  buildFailureRatio,
  failedAccent,
  formatPct,
  funnelBars,
  medianLabel,
  mirrorAccent,
  openIntakes,
  qaAccent,
  ratio,
  relayAccent,
  relayFailureRatio,
  sortedRules,
  stripContentFields,
  templateSlices,
} from "@/lib/createOps";

export const dynamic = "force-dynamic";

function FunnelBody({ ops }: { ops: CreateOpsResponse }) {
  const { funnel, medians_s: medians } = ops;
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="open intakes" value={String(openIntakes(funnel))} accent="blue" />
        <Stat label="production" value={String(funnel.production)} accent="green" />
        <Stat label="dev ready" value={String(funnel.dev_ready)} accent="blue" />
        <Stat
          label="failed"
          value={String(funnel.failed)}
          accent={failedAccent(funnel.failed)}
        />
        <Stat label="abandoned" value={String(funnel.abandoned)} />
      </div>
      <p className="mb-1 font-mono text-[10px] text-muted-foreground">
        intakes by stage (pipeline order)
      </p>
      <LabeledBarChart
        valueLabel="intakes"
        color="blue"
        data={funnelBars(funnel)}
      />
      <p className="mt-4 mb-1 font-mono text-[10px] text-muted-foreground">
        medians
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="first question"
          value={medianLabel(medians.first_question)}
          sub="first message → questions sent"
        />
        <Stat
          label="plan"
          value={medianLabel(medians.plan)}
          sub="answers → plan sent"
        />
        <Stat
          label="confirm → dev"
          value={medianLabel(medians.confirm_to_dev)}
          sub="yes → dev link live"
        />
        <Stat
          label="dev → production"
          value={medianLabel(medians.dev_to_prod)}
          sub="dev link → approved"
        />
      </div>
    </>
  );
}

function BuildsBody({ ops }: { ops: CreateOpsResponse }) {
  const { builds } = ops;
  const rules = sortedRules(builds.by_rule);
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="builds" value={String(builds.total)} accent="blue" />
        <Stat
          label="failed"
          value={String(builds.failed)}
          sub={`${formatPct(buildFailureRatio(builds))} of builds`}
          accent={buildFailedAccent(builds)}
        />
        <Stat
          label="succeeded"
          value={String(Math.max(0, builds.total - builds.failed))}
          accent="green"
        />
        <Stat label="rules hit" value={String(rules.length)} />
      </div>
      <DataTable
        headers={["rule", "builds failed"]}
        rows={rules.map(([rule, count]) => [rule, String(count)])}
      />
    </>
  );
}

function QualityBody({ ops }: { ops: CreateOpsResponse }) {
  const { qa, tests } = ops;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      <Stat
        label="qa p50"
        value={qa.p50 === null ? "—" : String(qa.p50)}
        accent="purple"
      />
      <Stat
        label="qa p90"
        value={qa.p90 === null ? "—" : String(qa.p90)}
        accent="purple"
      />
      <Stat
        label={`qa below ${QA_GATE}`}
        value={String(qa.below_70)}
        sub="publish gate (CR22)"
        accent={qaAccent(qa.below_70)}
      />
      <Stat label="tests declared" value={String(tests.declared)} />
      <Stat
        label="tests passed"
        value={formatPct(tests.passed_ratio, 0)}
        sub="of declared tests"
        accent={tests.passed_ratio === 1 ? "green" : "none"}
      />
    </div>
  );
}

function RelayMirrorBody({ ops }: { ops: CreateOpsResponse }) {
  const { progress_relay: relay, mirror } = ops;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      <Stat
        label="cards updated"
        value={relay.cards_updated.toLocaleString()}
        accent="blue"
      />
      <Stat
        label="text fallbacks"
        value={relay.text_fallbacks.toLocaleString()}
        sub="card replaced by a text line"
      />
      <Stat
        label="update failures"
        value={relay.update_failures.toLocaleString()}
        sub={`${formatPct(relayFailureRatio(relay))} of ticks`}
        accent={relayAccent(relay)}
      />
      <Stat label="mirror ok" value={String(mirror.ok)} accent="green" />
      <Stat
        label="mirror failed"
        value={String(mirror.failed)}
        accent={mirrorAccent(mirror.failed)}
      />
    </div>
  );
}

function TemplatesBody({ ops }: { ops: CreateOpsResponse }) {
  const slices = templateSlices(ops.by_template);
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <BreakdownPieChart data={slices} />
      <DataTable
        headers={["template", "intakes", "share"]}
        rows={slices.map((slice) => [
          slice.label,
          String(slice.value),
          formatPct(ratio(slice.value, total), 0),
        ])}
      />
    </div>
  );
}

function BudgetBody({ ops }: { ops: CreateOpsResponse }) {
  return (
    <div className="flex flex-wrap items-end gap-4">
      <Stat
        label="budget exhausted"
        value={String(ops.budget_exhausted)}
        sub="intakes that hit their token budget"
        accent={ops.budget_exhausted > 0 ? "orange" : "none"}
      />
      <Link
        href="/tokens?group=project"
        className="pb-2 font-mono text-[11px] text-sky-400 hover:underline"
      >
        spend by project &rarr;
      </Link>
    </div>
  );
}

export default async function CreatePage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const days = rangeDays((await searchParams).days);
  const fetched = await adminGetSafe<CreateOpsResponse>(
    `/api/admin/create?days=${days}`
  );
  // A1: drop any content-named field before anything renders.
  const create: typeof fetched =
    fetched.error === null
      ? { data: stripContentFields(fetched.data), error: null }
      : fetched;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-[10px] text-muted-foreground">
          From /api/admin/create?days={days} — Create intake health: funnel,
          builds, QA, progress relay, mirror, templates and budget. Counts,
          medians and rule ids only (C4).
        </p>
        <RangeToggle days={days} basePath="/create" />
      </div>

      <Panel
        title={`Intake funnel (${days}d)`}
        note="Intakes by stage, asking → production, in the order the Create state machine walks them; failed and abandoned are exits and sit in the stats. Medians are wall-clock seconds per intake."
      >
        {create.error !== null ? (
          <LoadError error={create.error} />
        ) : (
          <FunnelBody ops={create.data} />
        )}
      </Panel>

      <Panel
        title={`Builds (${days}d)`}
        note="Build attempts in the window. failed turns pink above 10% of builds. 'by rule' counts the builds each hard finding rule failed, by rule id only (csp.host-reference, tests.locked-removed, …)."
      >
        {create.error !== null ? (
          <LoadError error={create.error} />
        ) : (
          <BuildsBody ops={create.data} />
        )}
      </Panel>

      <Panel
        title={`Quality (${days}d)`}
        note={`QA score distribution (0–100) across builds and the declared tests' pass ratio. A score under ${QA_GATE} blocks production (CR22), so any build below it is orange.`}
      >
        {create.error !== null ? (
          <LoadError error={create.error} />
        ) : (
          <QualityBody ops={create.data} />
        )}
      </Panel>

      <Panel
        title={`Progress relay and mirror (${days}d)`}
        note="Progress-card ticks the relay pushed during builds: text fallbacks are ticks that fell back to a plain text line, update failures are ticks that could not update the card (pink above 5% of ticks, the platform.md alarm). Mirror counts production publishes mirrored to the store; any failure is pink."
      >
        {create.error !== null ? (
          <LoadError error={create.error} />
        ) : (
          <RelayMirrorBody ops={create.data} />
        )}
      </Panel>

      <Panel
        title={`Templates (${days}d)`}
        note="Intakes by the template the Planner picked: landing, store, game-2d, game-3d, tool, page."
      >
        {create.error !== null ? (
          <LoadError error={create.error} />
        ) : (
          <TemplatesBody ops={create.data} />
        )}
      </Panel>

      <Panel
        title={`Budget (${days}d)`}
        note="Intakes stopped by the owner's Create token budget in the window. Where the tokens went, per project, is on Tokens › project."
      >
        {create.error !== null ? (
          <LoadError error={create.error} />
        ) : (
          <BudgetBody ops={create.data} />
        )}
      </Panel>
    </>
  );
}
