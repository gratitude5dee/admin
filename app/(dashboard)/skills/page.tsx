import { adminGetSafe } from "@/lib/controlPlane";
import type { BoxesResponse } from "@/lib/types";
import { DataTable, LoadError, Panel } from "@/components/panel";

export const dynamic = "force-dynamic";

/** Skills ship inside the box template (infra/template/skills in airv2), so
 * the installed set is a function of each user's template_version. Per-skill
 * usage is NOT metered control-plane-side: skill invocations happen inside
 * the user's box and never emit content or per-skill telemetry (C4). */
const TEMPLATE_SKILLS = [
  "ads-reporting",
  "air-onboarding",
  "app-store-search",
  "calendar-native",
  "computer-relay",
  "feedback (via open-miniapp)",
  "meta-ads-confirm",
  "open-miniapp",
  "shopping-checkout",
  "social-engage",
  "vault-use",
];

export default async function SkillsPage() {
  const boxes = await adminGetSafe<BoxesResponse>("/api/admin/boxes?days=30");

  return (
    <>
      <Panel
        title="Template skill set"
        note="Skills are baked into the box template. Per-skill usage is not metered control-plane-side: invocations run inside the user's box and emit no content or per-skill telemetry (C4)."
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
        note="Each user's installed skill set follows their box template_version (from /api/admin/boxes)."
      >
        {boxes.error !== null ? (
          <LoadError error={boxes.error} />
        ) : (
          <DataTable
            headers={["user", "template version", "state", "runs (30d)"]}
            rows={boxes.data.users.map((user) => [
              user.user_id,
              user.template_version,
              user.state,
              user.runs,
            ])}
          />
        )}
      </Panel>
    </>
  );
}
