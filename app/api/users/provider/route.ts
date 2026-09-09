import { NextRequest, NextResponse } from "next/server";
import {
  adminGet,
  adminSend,
  ControlPlaneError,
} from "@/lib/controlPlane";
import { tenkiSwitchEligibility } from "@/lib/providerSwitch";
import type { BoxesResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function back(
  request: NextRequest,
  userId: string,
  days: string,
  result: { error?: string; switched?: string },
): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = `/users/${encodeURIComponent(userId)}`;
  url.search = "";
  if (days) url.searchParams.set("days", days);
  if (result.error) url.searchParams.set("error", result.error);
  if (result.switched) url.searchParams.set("switched", result.switched);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const form = await request.formData();
  const userId = String(form.get("user_id") ?? "").trim();
  const boxId = String(form.get("box_id") ?? "").trim();
  const provider = String(form.get("provider") ?? "");
  const days = String(form.get("days") ?? "");

  if (!userId) {
    return back(request, "unknown", days, { error: "user_id required" });
  }
  if (!boxId) return back(request, userId, days, { error: "box_id required" });
  if (provider !== "tenki") {
    return back(request, userId, days, {
      error: "only an explicit Tenki switch is supported",
    });
  }
  if (form.get("confirm") !== "replace") {
    return back(request, userId, days, {
      error: "confirm the Box replacement first",
    });
  }

  try {
    const boxes = await adminGet<BoxesResponse>("/api/admin/boxes?days=1");
    const currentBox = boxes.users.find((box) => box.user_id === userId);
    if (!currentBox || currentBox.provider_box_id !== boxId) {
      return back(request, userId, days, {
        error: "current Box ownership could not be verified",
      });
    }
    const eligibility = tenkiSwitchEligibility(currentBox);
    if (!eligibility.eligible) {
      return back(request, userId, days, {
        error: eligibility.message ?? "Box is not eligible for replacement",
      });
    }
    await adminSend("/api/admin/boxes/reprovision", "POST", {
      user_id: userId,
      box_id: boxId,
      provider: "tenki",
    });
    return back(request, userId, days, { switched: "tenki" });
  } catch (error) {
    const message =
      error instanceof ControlPlaneError || error instanceof Error
        ? error.message
        : "control plane unreachable";
    return back(request, userId, days, { error: message });
  }
}
