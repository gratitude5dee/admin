import Link from "next/link";
import { adminGetSafe } from "@/lib/controlPlane";
import type {
  CreateHealthResponse,
  CreateJobsResponse,
  CreateOpsResponse,
} from "@/lib/types";
import { DataTable, LoadError, Panel, Stat } from "@/components/panel";
import { BreakdownPieChart, LabeledBarChart } from "@/components/charts";
import { RangeToggle, rangeDays } from "@/components/range-toggle";
import {
  QA_GATE,
  buildFailedAccent,
  buildFailureRatio,
  failedAccent,
  failureRows,
  formatPct,
  funnelBars,
  healthCheckRows,
  jobStateAccent,
  jobStateBars,
  medianLabel,
  mirrorAccent,
  openIntakes,
  qaAccent,
  ratio,
  relayAccent,
  relayFailureRatio,
  skillVerRows,
  sortedRules,
  stripContentFields,
  templateSlices,
  tokenGroupRows,
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

function LaneHealthBody({ health }: { health: CreateHealthResponse }) {
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat
          label="lane"
          value={health.ok ? "ready" : "not ready"}
          accent={health.ok ? "green" : "pink"}
        />
        <Stat label="skill floor" value={`v${health.skill_version_min}`} />
        <Stat label="max fix rounds" value={String(health.max_fix_rounds)} />
        <Stat label="compile / turn" value={String(health.compile_max_per_turn)} />
        <Stat label="dev origin" value={health.dev_origin_suffix} sub="suffix" />
      </div>
      <DataTable
        headers={["check", "state"]}
        rows={healthCheckRows(health.checks)}
      />
      {health.reasons.length > 0 && (
        <p className="mt-3 font-mono text-[11px] text-pink-400">
          {health.reasons.join(" · ")}
        </p>
      )}
    </>
  );
}

function JobDeploymentsBody({ ops }: { ops: CreateJobsResponse }) {
  const { jobs } = ops;
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="jobs" value={String(jobs.total)} accent="blue" />
        <Stat
          label="running"
          value={String(jobs.by_state.running ?? 0)}
          accent="purple"
        />
        <Stat label="queued" value={String(jobs.by_state.queued ?? 0)} />
        <Stat
          label="live dev links"
          value={String(jobs.dev_live)}
          accent="green"
        />
        <Stat
          label="stuck + failed"
          value={String(
            (jobs.by_state.stuck ?? 0) + (jobs.by_state.failed ?? 0)
          )}
          accent={jobStateAccent(jobs.by_state)}
        />
      </div>
      <p className="mb-1 font-mono text-[10px] text-muted-foreground">
        jobs by state
      </p>
      <LabeledBarChart
        valueLabel="jobs"
        color="blue"
        data={jobStateBars(jobs.by_state)}
      />
      <p className="mt-4 mb-1 font-mono text-[10px] text-muted-foreground">
        jobs by kind
      </p>
      <DataTable
        headers={["kind", "jobs"]}
        rows={Object.entries(jobs.by_kind).map(([kind, count]) => [
          kind,
          String(count),
        ])}
      />
    </>
  );
}

function JobFailuresBody({ ops }: { ops: CreateJobsResponse }) {
  const rows = failureRows(ops.jobs.failures);
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="attention"
          value={String(ops.jobs.failures.length)}
          accent={ops.jobs.failures.length > 0 ? "pink" : "green"}
        />
      </div>
      <DataTable
        headers={["job", "app", "state", "step", "rule", "round", "opened"]}
        rows={rows.length > 0 ? rows : [["—", "—", "none", "—", "—", "—", "—"]]}
      />
    </>
  );
}

function JobTokensBody({ ops }: { ops: CreateJobsResponse }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <div>
        <p className="mb-2 font-mono text-[10px] text-muted-foreground">
          by stage — plan = brief turns, build = code/fix turns
        </p>
        <DataTable
          headers={["stage", "runs", "tokens", "cost"]}
          rows={tokenGroupRows(ops.token_usage.by_stage)}
        />
      </div>
      <div>
        <p className="mb-2 font-mono text-[10px] text-muted-foreground">
          by project (top 20)
        </p>
        <DataTable
          headers={["project", "runs", "tokens", "cost"]}
          rows={tokenGroupRows(ops.token_usage.by_project)}
        />
      </div>
    </div>
  );
}

function SkillUseBody({ ops }: { ops: CreateJobsResponse }) {
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="upgrades queued"
          value={String(ops.skill_use.upgrades_queued)}
          sub="stale Boxes told to update"
          accent={ops.skill_use.upgrades_queued > 0 ? "orange" : "none"}
        />
        <Stat
          label="versions seen"
          value={String(Object.keys(ops.skill_use.by_skill_ver).length)}
        />
      </div>
      <DataTable
        headers={["skill version", "jobs"]}
        rows={skillVerRows(ops.skill_use.by_skill_ver)}
      />
    </>
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
  const [jobsFetched, healthFetched] = await Promise.all([
    adminGetSafe<CreateJobsResponse>(`/api/admin/create/jobs?days=${days}`),
    adminGetSafe<CreateHealthResponse>("/api/admin/create/health"),
  ]);
  // A1: drop any content-named field before anything renders.
  const create: typeof fetched =
    fetched.error === null
      ? { data: stripContentFields(fetched.data), error: null }
      : fetched;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-[10px] text-muted-foreground">
          From /api/admin/create{",/jobs,/health"}?days={days} — Create ops:
          the V13 job lane (deployments, failures, token use, skill use) and
          the V12 intake funnel beneath it. Counts, medians and rule ids only
          (C4).
        </p>
        <RangeToggle days={days} basePath="/create" />
      </div>

      <Panel
        title="Job lane health"
        note="Readiness for the Cloudflare Create lane (V13): Vercel-side env, the create.wzrd.tech Worker's /v1/health probe, the minimum skill version in force and the knobs the Workflow runs with. Any 'fail' names the piece to fix."
      >
        {healthFetched.error !== null ? (
          <LoadError error={healthFetched.error} />
        ) : (
          <LaneHealthBody health={healthFetched.data} />
        )}
      </Panel>

      <Panel
        title={`Job deployments (${days}d)`}
        note="CreateJob rows in the window: states in the order the Workflow walks them (admit → brief → code → build → check → publish), live dev links, and initial vs change jobs."
      >
        {jobsFetched.error !== null ? (
          <LoadError error={jobsFetched.error} />
        ) : (
          <JobDeploymentsBody ops={jobsFetched.data} />
        )}
      </Panel>

      <Panel
        title={`Job failures (${days}d)`}
        note="Newest stuck, failed or cancelled jobs — the step the job was on, the rule that stopped it (or —) and the fix round it reached. Job ids and rule ids only (C4)."
      >
        {jobsFetched.error !== null ? (
          <LoadError error={jobsFetched.error} />
        ) : (
          <JobFailuresBody ops={jobsFetched.data} />
        )}
      </Panel>

      <Panel
        title={`Job token usage (${days}d)`}
        note="create:<slug> receipts folded by stage and by project — the V13 metering the Tokens page reads by user/model. 'est' marks list-priced runs."
      >
        {jobsFetched.error !== null ? (
          <LoadError error={jobsFetched.error} />
        ) : (
          <JobTokensBody ops={jobsFetched.data} />
        )}
      </Panel>

      <Panel
        title={`Skill use (${days}d)`}
        note="x-air-skill versions the jobs ran under and the upgrade count queued to stale Boxes (F10). A tail on an old version means the fleet sync hasn't reached every Box."
      >
        {jobsFetched.error !== null ? (
          <LoadError error={jobsFetched.error} />
        ) : (
          <SkillUseBody ops={jobsFetched.data} />
        )}
      </Panel>

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
