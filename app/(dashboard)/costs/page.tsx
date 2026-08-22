import { adminGetSafe } from "@/lib/controlPlane";
import type { CostsResponse, TokensResponse } from "@/lib/types";
import { DataTable, LoadError, Panel, Stat } from "@/components/panel";

export const dynamic = "force-dynamic";

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function gb(bytes: number): string {
  return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
}

export default async function CostsPage() {
  const [costs, tokens] = await Promise.all([
    adminGetSafe<CostsResponse>("/api/admin/costs"),
    adminGetSafe<TokensResponse>("/api/admin/tokens?days=30"),
  ]);

  return (
    <>
      <Panel title="Gateway spend (30 days)" note="From /api/admin/tokens — metered LLM cost per user.">
        {tokens.error !== null ? (
          <LoadError error={tokens.error} />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Stat
              label="total LLM cost"
              value={`$${tokens.data.totals.cost_usd.toFixed(2)}`}
            />
            <Stat label="users" value={String(tokens.data.users.length)} />
          </div>
        )}
      </Panel>
      <Panel title="Creative costs (30 days)" note="From /api/admin/costs — render spend, storage estimate, ad spend against ceilings.">
        {costs.error !== null ? (
          <LoadError error={costs.error} />
        ) : (
          <DataTable
            headers={[
              "user",
              "renders",
              "storage",
              "storage / mo",
              "ad spend",
              "ad ceiling",
            ]}
            rows={costs.data.users.map((user) => [
              user.user_id,
              dollars(user.render_cents),
              gb(user.storage_bytes),
              dollars(user.storage_cents_month),
              dollars(user.ad_spend_cents),
              user.ad_ceiling_cents === null
                ? null
                : dollars(user.ad_ceiling_cents),
            ])}
          />
        )}
      </Panel>
    </>
  );
}
