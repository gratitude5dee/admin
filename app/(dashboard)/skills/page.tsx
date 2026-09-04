import { adminGetSafe } from "@/lib/controlPlane";
import type { BoxesResponse, FleetReleasesResponse } from "@/lib/types";
import { fetchUserDirectory } from "@/lib/users";
import { shortRef } from "@/lib/fleet";
import { DataTable, LoadError, Panel } from "@/components/panel";
import { UserLink } from "@/components/user-link";

export const dynamic = "force-dynamic";

/** Skills ship inside the box template (infra/template/skills in airv2), so
 * the installed set is a function of the template release each box was last
 * synced to (baseline_version). Per-skill usage is NOT metered
 * control-plane-side: skill invocations happen inside the user's box and never
 * emit content or per-skill telemetry (C4). */
const TEMPLATE_SKILLS = [
  "ads-reporting",
  "air-onboarding",
  "analytics-interpretation",
  "app-store-search",
  "browser-use",
  "calendar-native",
  "computer-relay",
  "create-miniapp",
  "crm-people",
  "email-draft-review",
  "link-payments",
  "meta-ads-confirm",
  "open-miniapp",
  "openviking-memory",
  "resemble-detect",
  "shopping-checkout",
  "social-engage",
  "storefront-commerce",
  "tour-planning",
  "vault-use",
  "wzrdmail",
];

export default async function SkillsPage() {
  const [boxes, releases, directory] = await Promise.all([
    adminGetSafe<BoxesResponse>("/api/admin/boxes?days=30"),
    adminGetSafe<FleetReleasesResponse>("/api/admin/fleet/releases"),
    fetchUserDirectory(),
  ]);
  const latest = releases.data?.releases[0] ?? null;

  return (
    <>
      <Panel
        title={`Template skill set (${TEMPLATE_SKILLS.length})`}
        note={`Skills are baked into the box template${latest ? ` — latest release ${latest.version}` : ""}; a box has this set once its release column matches (see Fleet for drift). Per-skill usage is not metered control-plane-side: invocations run inside the user's box and emit no content or per-skill telemetry (C4).`}
      >
        <ul className="grid grid-cols-2 gap-1 sm:grid-cols-3">
          {TEMPLATE_SKILLS.map((skill) => (
            <li
              key={skill}
              className="font-mono text-[11px] text-foreground"
            >
              {skill}
            </li>
          ))}
        </ul>
      </Panel>
      <Panel
        title="Installed per user"
        note="Each user's installed skill set follows the template release their box was last synced to; hermes is the Hermes ref pinned alongside it (from /api/admin/boxes)."
      >
        {boxes.error !== null ? (
          <LoadError error={boxes.error} />
        ) : (
          <DataTable
            headers={[
              "user",
              "release",
              "hermes",
              "synced",
              "state",
              "runs (30d)",
            ]}
            rows={boxes.data.users.map((user) => [
              <UserLink
                key={user.user_id}
                userId={user.user_id}
                label={directory.label(user.user_id)}
              />,
              user.baseline_version ?? null,
              shortRef(user.template_version),
              user.baseline_synced_at
                ? new Date(user.baseline_synced_at).toLocaleString()
                : null,
              user.state,
              user.runs,
            ])}
          />
        )}
      </Panel>
    </>
  );
}
