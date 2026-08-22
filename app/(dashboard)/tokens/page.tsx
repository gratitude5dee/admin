import { adminGetSafe } from "@/lib/controlPlane";
import { fetchUserDirectory } from "@/lib/users";
import type { TokensResponse } from "@/lib/types";
import { DataTable, LoadError, Panel, Stat } from "@/components/panel";
import { TokensChart } from "@/components/tokens-chart";

export const dynamic = "force-dynamic";

export default async function TokensPage() {
  const [tokens, directory] = await Promise.all([
    adminGetSafe<TokensResponse>("/api/admin/tokens?days=30"),
    fetchUserDirectory(),
  ]);

  return (
    <Panel title="Token usage (30 days)" note="From /api/admin/tokens — gateway-metered prompt/completion tokens and cost per user.">
      {tokens.error !== null ? (
        <LoadError error={tokens.error} />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-3 gap-3">
            <Stat
              label="prompt tokens"
              value={tokens.data.totals.prompt_tokens.toLocaleString()}
            />
            <Stat
              label="completion tokens"
              value={tokens.data.totals.completion_tokens.toLocaleString()}
            />
            <Stat
              label="cost"
              value={`$${tokens.data.totals.cost_usd.toFixed(2)}`}
            />
          </div>
          <TokensChart
            data={tokens.data.users.slice(0, 12).map((user) => ({
              user: directory.label(user.user_id),
              prompt: user.prompt_tokens,
              completion: user.completion_tokens,
            }))}
          />
          <div className="mt-4">
            <DataTable
              headers={["user", "runs", "prompt", "completion", "total", "cost"]}
              rows={tokens.data.users.map((user) => [
                directory.label(user.user_id),
                user.runs,
                user.prompt_tokens.toLocaleString(),
                user.completion_tokens.toLocaleString(),
                user.total_tokens.toLocaleString(),
                `$${user.cost_usd.toFixed(4)}`,
              ])}
            />
          </div>
        </>
      )}
    </Panel>
  );
}
