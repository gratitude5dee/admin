import { NextRequest, NextResponse } from "next/server";
import { adminSend, ControlPlaneError } from "@/lib/controlPlane";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OPS = new Set([
  "prepare",
  "cutover",
  "cancel",
  "return",
  "cleanup",
  "drive",
]);
const DIRECTIONS = new Set(["box_to_tenki", "tenki_to_box"]);

function back(
  request: NextRequest,
  userId: string,
  result: { error?: string; done?: string },
): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = "/migrations";
  url.search = "";
  if (userId && userId !== "unknown") url.searchParams.set("user_id", userId);
  if (result.error) url.searchParams.set("error", result.error);
  if (result.done) url.searchParams.set("done", result.done);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const form = await request.formData();
  const op = String(form.get("op") ?? "");
  const userId = String(form.get("user_id") ?? "").trim();
  const direction = String(form.get("direction") ?? "");

  if (!userId) return back(request, "unknown", { error: "user_id required" });
  if (!OPS.has(op)) return back(request, userId, { error: "unknown op" });
  // Every mutating op needs its checkbox — these are irreversible-ish
  // transitions (route commit, source delete) even when they are safe.
  if (form.get("confirm") !== op) {
    return back(request, userId, { error: `confirm the ${op} first` });
  }

  const body: Record<string, unknown> = { op, user_id: userId };
  if (op === "prepare") {
    if (!DIRECTIONS.has(direction)) {
      return back(request, userId, { error: "direction required" });
    }
    body["direction"] = direction;
  }
  try {
    await adminSend("/api/admin/migrations", "POST", body);
    return back(request, userId, { done: op });
  } catch (error) {
    const message =
      error instanceof ControlPlaneError || error instanceof Error
        ? error.message
        : "control plane unreachable";
    return back(request, userId, { error: message });
  }
}
