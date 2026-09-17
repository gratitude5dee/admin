/**
 * Operator revoke / renew of a Create app's dev release, proxied server-side
 * so ADMIN_API_KEY never reaches the browser (goal.md §4). POST with
 * action=revoke|renew forwards to POST /api/admin/create/apps/<slug>/dev,
 * which writes the audit row; we always 303 back to /deployments, carrying
 * any validation or upstream error in the query string (the /api/fleet/sync
 * pattern). The page then shows the state the control plane reports — never
 * an optimistic one (A3).
 */
import { NextRequest, NextResponse } from "next/server";
import { adminSend } from "@/lib/controlPlane";
import { isAppSlug } from "@/lib/deployments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIONS = new Set(["revoke", "renew"]);

function back(request: NextRequest, error?: string): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = "/deployments";
  url.search = error ? `?error=${encodeURIComponent(error)}` : "";
  return NextResponse.redirect(url, 303);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
): Promise<NextResponse> {
  const { slug } = await params;
  if (!isAppSlug(slug)) return back(request, "invalid app slug");
  const form = await request.formData();
  const action = String(form.get("action") ?? "");
  if (!ACTIONS.has(action)) {
    return back(request, "action must be revoke or renew");
  }
  try {
    await adminSend(`/api/admin/create/apps/${slug}/dev`, "POST", { action });
    return back(request);
  } catch (error) {
    return back(
      request,
      error instanceof Error ? error.message : "control plane unreachable"
    );
  }
}
