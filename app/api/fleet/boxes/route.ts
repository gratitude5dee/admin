import { NextRequest, NextResponse } from "next/server";
import { adminSend } from "@/lib/controlPlane";
import type { RelabelReport, StopIdleReport } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const back = request.nextUrl.clone();
  back.pathname = "/fleet";
  back.search = "";
  try {
    const form = await request.formData();
    const action = form.get("action");
    if (action === "relabel") {
      const report = await adminSend<RelabelReport>(
        "/api/admin/boxes/relabel", "POST", {},
      );
      back.searchParams.set(
        "box_result",
        `Labels: ${report.relabeled} applied, ${report.skipped} skipped, ${report.failed} failed.`,
      );
    } else if (action === "stop-idle") {
      const channel = form.get("channel") ?? "dev";
      if (channel !== "dev" && channel !== "prod") {
        throw new Error("channel must be dev or prod");
      }
      if (form.get("confirm") !== "stop-idle") {
        throw new Error("Confirm safe-stop for the selected channel first.");
      }
      const after = form.get("after");
      if (after !== null && (typeof after !== "string" || !after.trim())) {
        throw new Error("after must be a non-empty box ID");
      }
      const report = await adminSend<StopIdleReport>(
        "/api/admin/boxes/stop-idle", "POST",
        { channel, ...(after ? { after } : {}) },
      );
      back.searchParams.set(
        "box_result",
        `${channel} batch: ${report.processed} of ${report.targeted} candidates processed; ` +
        `${report.stopped} stopped, ${report.stopping} snapshotting, ` +
        `${report.indexingDeferred} deferred, ` +
        `${report.processed - report.stopped - report.stopping - report.indexingDeferred} stop errors, ` +
        `${report.releaseFailed} claim release errors.`,
      );
      if (report.continuation) {
        back.searchParams.set("continue_stop", channel);
        if (report.continuation.after) {
          back.searchParams.set("after", report.continuation.after);
        }
      }
    } else {
      throw new Error("Unknown box action.");
    }
  } catch (error) {
    back.searchParams.set(
      "error", error instanceof Error ? error.message : "Control plane unreachable.",
    );
  }
  return NextResponse.redirect(back, 303);
}
