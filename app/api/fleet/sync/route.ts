/**
 * Fleet sync actions, proxied server-side so ADMIN_API_KEY never reaches the
 * browser. POST with action=sync points the channel at the newest release
 * (if it is behind) and starts a sync job — canary-first when a canary box is
 * chosen, repinning Hermes when the release carries a hermes_ref and the
 * operator left "include Hermes" on; pause/resume/abort patch the active job.
 * Both channel writes are compare-and-set against the release we last saw:
 * the advance is conditional on the pointer we read, and if the job cannot
 * be started afterwards the pointer is put back conditional on the release
 * we advanced it to. A rejected sync therefore never leaves the whole
 * channel reading "behind" with no rollout in flight, and a move another
 * operator made meanwhile is never undone — if they already pointed the
 * channel at the latest release we sync without owning (or rolling back)
 * their move; if they pointed it elsewhere we stop and ask for a refresh.
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
  const previous = channels.find((c) => c.name === channel)?.release_id ?? null;
  let advanced = previous !== latest.id;
  if (advanced) {
    advanced = await advancePointer(channel, previous, latest.id);
  }
  try {
    await adminSend("/api/admin/fleet/sync", "POST", {
      channel,
      ...(options.canaryBoxId
        ? { canary_box_ids: [options.canaryBoxId] }
        : {}),
      ...(options.includeHermes && latest.hermes_ref
        ? { include_hermes: true }
        : {}),
    });
  } catch (error) {
    if (advanced && previous) {
      await restorePointer(channel, previous, latest.id);
    }
    throw error;
  }
}

/**
 * Points the channel at `to` only if it still reads `from`. Returns whether
 * this request performed the move (and so owns the rollback). A concurrent
 * operator who already moved it to `to` yields false; one who moved it
 * anywhere else is an error the operator must see.
 */
async function advancePointer(
  channel: string,
  from: string | null,
  to: string
): Promise<boolean> {
  try {
    await adminSend("/api/admin/fleet/channels", "POST", {
      channel,
      release_id: to,
      expected_release_id: from,
    });
    return true;
  } catch (error) {
    if (!(error instanceof ControlPlaneError) || error.status !== 409) {
      throw error;
    }
  }
  const { channels } = await adminGet<FleetChannelsResponse>(
    "/api/admin/fleet/channels"
  );
  const current = channels.find((c) => c.name === channel)?.release_id ?? null;
  if (current === to) return false;
  throw new Error(
    `channel ${channel} was moved by someone else since the page loaded; refresh and retry`
  );
}

async function restorePointer(
  channel: string,
  previous: string,
  advancedTo: string
): Promise<void> {
  try {
    await adminSend("/api/admin/fleet/channels", "POST", {
      channel,
      release_id: previous,
      expected_release_id: advancedTo,
    });
  } catch {
    // a 409 means the channel moved on; either way the original failure is
    // what the operator needs to see
  }
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
