import { adminGetSafe } from "@/lib/controlPlane";
import type { FeedbackResponse } from "@/lib/types";
import { fetchUserDirectory } from "@/lib/users";
import { DataTable, LoadError, Panel, Stat } from "@/components/panel";
import { BreakdownPieChart } from "@/components/charts";

export const dynamic = "force-dynamic";

export default async function FeedbackPage() {
  const [feedback, directory] = await Promise.all([
    adminGetSafe<FeedbackResponse>("/api/admin/feedback?limit=200"),
    fetchUserDirectory(),
  ]);

  return (
    <Panel title="Feedback inbox" note="From /api/admin/feedback — bug reports and feature requests submitted through the in-air feedback mini-app.">
      {feedback.error !== null ? (
        <LoadError error={feedback.error} />
      ) : feedback.data.unavailable ? (
        <p className="font-mono text-[11px] text-muted-foreground">
          feedback_items migration not applied yet.
        </p>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Object.entries(feedback.data.counts).map(([status, count]) => (
              <Stat key={status} label={status} value={String(count)} />
            ))}
          </div>
          <div className="mb-4">
            <p className="mb-1 font-mono text-[10px] text-muted-foreground">
              items by status
            </p>
            <BreakdownPieChart
              data={Object.entries(feedback.data.counts).map(
                ([label, value]) => ({ label, value })
              )}
            />
          </div>
          <DataTable
            headers={["when", "user", "kind", "status", "title", "body"]}
            rows={feedback.data.items.map((item) => [
              new Date(item.created_at).toISOString().slice(0, 16),
              directory.label(item.user_id),
              item.kind,
              item.status,
              item.title,
              item.body,
            ])}
          />
        </>
      )}
    </Panel>
  );
}
