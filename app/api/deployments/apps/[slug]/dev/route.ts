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
import { isAppSlug, viewFromForm, viewSearch, type DeploymentsView } from "@/lib/deployments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIONS = new Set(["revoke", "renew"]);

function back(request: NextRequest, view: DeploymentsView, error?: string): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = "/deployments";
  url.search = viewSearch(view, error);
  return NextResponse.redirect(url, 303);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
): Promise<NextResponse> {
  const { slug } = await params;
  // A body that is not a form is a 303 with the reason, never a 500.
  const form = await request.formData().catch(() => null);
  const view = viewFromForm(form);
  if (!isAppSlug(slug)) return back(request, view, "invalid app slug");
  if (!form) return back(request, view, "expected a form submission");
  const action = String(form.get("action") ?? "");
  if (!ACTIONS.has(action)) {
    return back(request, view, "action must be revoke or renew");
  }
  try {
    await adminSend(`/api/admin/create/apps/${slug}/dev`, "POST", { action });
    return back(request, view);
  } catch (error) {
    return back(
      request,
      view,
      error instanceof Error ? error.message : "control plane unreachable"
    );
  }
}
