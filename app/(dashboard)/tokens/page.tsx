import { adminGetSafe } from "@/lib/controlPlane";
import { fetchUserDirectory } from "@/lib/users";
import type {
  CreateOpsResponse,
  TokensGroup,
  TokensGroupedResponse,
  TokensResponse,
} from "@/lib/types";
import { stripContentFields } from "@/lib/createOps";
import {
  GROUP_NOTES,
  costLabel,
  estimatedBadge,
  formatUsd,
  groupTotals,
  parseTokensGroup,
  reconcileGroups,
  sortGroups,
  stageComparison,
  topGroups,
  type GroupRow,
  type StageComparisonRow,
} from "@/lib/tokens";
import { DataTable, LoadError, Panel, Stat } from "@/components/panel";
import { GroupTabs } from "@/components/group-tabs";
import { TokensChart } from "@/components/tokens-chart";
import { UserLink } from "@/components/user-link";

export const dynamic = "force-dynamic";

/** Today's fixed window; the Create funnel is read for the same one (§3.3). */
const WINDOW_DAYS = 30;

/** `~$1.2100` with the list-estimated tooltip on estimated rows only. */
function CostCell({
  row,
  digits,
}: {
  row: Pick<GroupRow, "cost_usd" | "cost_estimated">;
  digits: number;
}) {
  const badge = estimatedBadge(row);
  return <span title={badge.title ?? undefined}>{costLabel(row, digits)}</span>;
}

function UserBody({
  tokens,
  label,
}: {
  tokens: TokensResponse;
  label: (userId: string) => string;
}) {
  return (
    <>
      <div className="mb-4 grid grid-cols-3 gap-3">
        <Stat
          label="prompt tokens"
          value={tokens.totals.prompt_tokens.toLocaleString()}
        />
        <Stat
          label="completion tokens"
          value={tokens.totals.completion_tokens.toLocaleString()}
        />
        <Stat label="cost" value={`$${tokens.totals.cost_usd.toFixed(2)}`} />
      </div>
      <TokensChart
        data={tokens.users.slice(0, 12).map((user) => ({
          label: label(user.user_id),
          prompt: user.prompt_tokens,
          completion: user.completion_tokens,
        }))}
      />
      <div className="mt-4">
        <DataTable
          headers={["user", "runs", "prompt", "completion", "total", "cost"]}
          rows={tokens.users.map((user) => [
            <UserLink
              key={user.user_id}
              userId={user.user_id}
              label={label(user.user_id)}
            />,
            user.runs,
            user.prompt_tokens.toLocaleString(),
            user.completion_tokens.toLocaleString(),
            user.total_tokens.toLocaleString(),
            `$${user.cost_usd.toFixed(4)}`,
          ])}
        />
      </div>
    </>
  );
}

function GroupBody({
  group,
  tokens,
}: {
  group: TokensGroup;
  tokens: TokensGroupedResponse;
}) {
  const groups = sortGroups(tokens.groups);
  const folded = groupTotals(groups);
  const reconciliation = reconcileGroups(tokens);
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="groups" value={String(groups.length)} />
        <Stat label="runs" value={folded.runs.toLocaleString()} accent="blue" />
        <Stat
          label="prompt tokens"
          value={tokens.totals.prompt_tokens.toLocaleString()}
          accent="purple"
        />
        <Stat
          label="completion tokens"
          value={tokens.totals.completion_tokens.toLocaleString()}
          accent="purple"
        />
        <Stat
          label="cost"
          value={formatUsd(tokens.totals.cost_usd)}
          sub={
            folded.estimated_rows > 0
              ? `${folded.estimated_rows} of ${groups.length} rows list-estimated`
              : "confirmed gateway rates"
          }
          accent={folded.estimated_rows > 0 ? "orange" : "none"}
        />
      </div>
      <TokensChart
        data={topGroups(groups).map((row) => ({
          label: row.key,
          prompt: row.prompt_tokens,
          completion: row.completion_tokens,
        }))}
      />
      <div className="mt-4">
        <DataTable
          headers={[group, "runs", "prompt", "completion", "total", "cost"]}
          rows={groups.map((row) => [
            row.key,
            row.runs,
            row.prompt_tokens.toLocaleString(),
            row.completion_tokens.toLocaleString(),
            row.total_tokens.toLocaleString(),
            <CostCell key="cost" row={row} digits={4} />,
          ])}
        />
      </div>
      <p
        className={`mt-2 font-mono text-[10px] ${
          reconciliation.matches ? "text-muted-foreground" : "text-orange-400"
        }`}
      >
        grouped sum {reconciliation.grouped.prompt_tokens.toLocaleString()} prompt
        · {reconciliation.grouped.completion_tokens.toLocaleString()} completion
        · {formatUsd(reconciliation.grouped.cost_usd)} —{" "}
        {reconciliation.matches
          ? "reconciles with the totals above (A6)"
          : "does not reconcile with the totals above (A6)"}
      </p>
      {folded.estimated_rows > 0 ? (
        <p className="mt-1 font-mono text-[10px] text-muted-foreground">
          ~ list-estimated: priced from the provider&apos;s list rate, not a
          confirmed GMI rate.
        </p>
      ) : null}
    </>
  );
}

function StageBody({
  rows,
  production,
}: {
  rows: StageComparisonRow[];
  production: number | null;
}) {
  return (
    <>
      <div className="mb-4 grid grid-cols-3 gap-3">
        <Stat
          label="production apps"
          value={production === null ? "—" : String(production)}
          sub={`Create funnel, ${WINDOW_DAYS}d`}
          accent="green"
        />
        {rows.map((row) => (
          <Stat
            key={row.key}
            label={`${row.label} · cost / production app`}
            value={formatUsd(row.cost_per_production_app, 2, row.cost_estimated)}
            sub={row.model}
            accent={row.key === "plan" ? "purple" : "blue"}
          />
        ))}
      </div>
      <DataTable
        headers={["stage", "model", "runs", "tokens", "cost", "cost / production app"]}
        rows={rows.map((row) => [
          `${row.label} (${row.stages.join(", ")})`,
          row.model,
          row.runs,
          row.tokens.toLocaleString(),
          <CostCell key="cost" row={row} digits={2} />,
          formatUsd(row.cost_per_production_app, 2, row.cost_estimated),
        ])}
      />
    </>
  );
}

export default async function TokensPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string }>;
}) {
  const group = parseTokensGroup((await searchParams).group);
  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="font-mono text-[10px] text-muted-foreground">
        Token usage over {WINDOW_DAYS} days, grouped by {group}. Counts, tokens
        and cost only (C4).
      </p>
      <GroupTabs group={group} basePath="/tokens" />
    </div>
  );

  if (group === "user") {
    const [tokens, directory] = await Promise.all([
      adminGetSafe<TokensResponse>(`/api/admin/tokens?days=${WINDOW_DAYS}`),
      fetchUserDirectory(),
    ]);
    return (
      <>
        {header}
        <Panel title={`Token usage (${WINDOW_DAYS} days)`} note={GROUP_NOTES.user}>
          {tokens.error !== null ? (
            <LoadError error={tokens.error} />
          ) : (
            <UserBody
              tokens={stripContentFields(tokens.data)}
              label={directory.label}
            />
          )}
        </Panel>
      </>
    );
  }

  const [tokens, create] = await Promise.all([
    adminGetSafe<TokensGroupedResponse>(
      `/api/admin/tokens?days=${WINDOW_DAYS}&group=${group}`
    ),
    group === "stage"
      ? adminGetSafe<CreateOpsResponse>(`/api/admin/create?days=${WINDOW_DAYS}`)
      : null,
  ]);
  // A1: drop any content-named field before anything renders.
  const grouped = tokens.error === null ? stripContentFields(tokens.data) : null;

  return (
    <>
      {header}
      <Panel
        title={`Token usage by ${group} (${WINDOW_DAYS} days)`}
        note={GROUP_NOTES[group]}
      >
        {grouped === null ? (
          <LoadError error={tokens.error ?? "control plane unreachable"} />
        ) : (
          <GroupBody group={group} tokens={grouped} />
        )}
      </Panel>
      {group === "stage" && create !== null ? (
        <Panel
          title={`Astra vs GLM (${WINDOW_DAYS} days)`}
          note={`Plan turns run on Astra (openai/gpt-6-astra); build and review run on GLM-5.3-Flash. cost / production app divides each row's cost by the Create funnel's production count for the same ${WINDOW_DAYS}-day window (/api/admin/create) — the number goal-create-v12 §7 decides on. finalize and chat sit in neither row; ~ marks a list-estimated cost.`}
        >
          {create.error !== null ? <LoadError error={create.error} /> : null}
          {grouped === null ? (
            <LoadError error={tokens.error ?? "control plane unreachable"} />
          ) : (
            <StageBody
              rows={stageComparison(
                grouped.groups,
                create.error === null ? create.data.funnel.production : null
              )}
              production={create.error === null ? create.data.funnel.production : null}
            />
          )}
        </Panel>
      ) : null}
    </>
  );
}
