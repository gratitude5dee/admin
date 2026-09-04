/**
 * Fleet sync actions, proxied server-side so ADMIN_API_KEY never reaches the
 * browser. POST with action=sync points the channel at the newest release
 * (if it is behind) and starts a sync job — canary-first when a canary box is
 * chosen, repinning Hermes when the release carries a hermes_ref and the
 * operator left "include Hermes" on; pause/resume/abort patch the active job.
 * Always redirects back to /fleet, carrying any upstream error in the query
 * string.
 */
import { NextRequest, NextResponse } from "next/server";
import { adminGet, adminSend, ControlPlaneError } from "@/lib/controlPlane";
import type {
  FleetChannelsResponse,
  FleetReleasesResponse,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHANNELS = new Set(["dev", "prod"]);
const JOB_ACTIONS = new Set(["pause", "resume", "abort"]);

function back(request: NextRequest, error?: string): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = "/fleet";
  url.search = error ? `?error=${encodeURIComponent(error)}` : "";
  return NextResponse.redirect(url, 303);
}

interface SyncOptions {
  canaryBoxId: string | null;
  includeHermes: boolean;
}

async function syncToLatest(
  channel: string,
  options: SyncOptions
): Promise<void> {
  const [{ releases }, { channels }] = await Promise.all([
    adminGet<FleetReleasesResponse>("/api/admin/fleet/releases"),
    adminGet<FleetChannelsResponse>("/api/admin/fleet/channels"),
  ]);
  const latest = releases[0];
  if (!latest) throw new Error("no template releases cut yet");
  const pointer = channels.find((c) => c.name === channel);
  if (pointer?.release_id !== latest.id) {
    await adminSend("/api/admin/fleet/channels", "POST", {
      channel,
      release_id: latest.id,
    });
  }
  await adminSend("/api/admin/fleet/sync", "POST", {
    channel,
    ...(options.canaryBoxId ? { canary_box_ids: [options.canaryBoxId] } : {}),
    ...(options.includeHermes && latest.hermes_ref
      ? { include_hermes: true }
      : {}),
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const form = await request.formData();
  const action = String(form.get("action") ?? "sync");
  const channel = String(form.get("channel") ?? "prod");
  if (!CHANNELS.has(channel)) {
    return back(request, "channel must be dev or prod");
  }
  try {
    if (action === "sync") {
      const canary = String(form.get("canary_box_id") ?? "").trim();
      await syncToLatest(channel, {
        canaryBoxId: canary || null,
        includeHermes: form.get("include_hermes") === "on",
      });
    } else if (JOB_ACTIONS.has(action)) {
      const jobId = String(form.get("job_id") ?? "");
      if (!jobId) return back(request, "job_id required");
      await adminSend("/api/admin/fleet/sync", "PATCH", {
        job_id: jobId,
        action,
      });
    } else {
      return back(request, "unknown action");
    }
    return back(request);
  } catch (error) {
    const message =
      error instanceof ControlPlaneError || error instanceof Error
        ? error.message
        : "control plane unreachable";
    return back(request, message);
  }
}
