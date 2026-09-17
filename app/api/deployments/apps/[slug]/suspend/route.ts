/**
 * Operator suspension of a Create app, proxied server-side so ADMIN_API_KEY
 * never reaches the browser (goal.md §4). POST forwards to
 * POST /api/admin/create/apps/<slug>/suspend (the existing suspension path,
 * audited on the control plane) and always 303s back to /deployments, with
 * any validation or upstream error in the query string (the /api/fleet/sync
 * pattern). The page shows the resulting state, never an optimistic one (A3).
 */
import { NextRequest, NextResponse } from "next/server";
import { adminSend } from "@/lib/controlPlane";
import { isAppSlug, viewFromForm, viewSearch, type DeploymentsView } from "@/lib/deployments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  // The form only carries the view to return to; a non-form body carries none.
  const view = viewFromForm(await request.formData().catch(() => null));
  if (!isAppSlug(slug)) return back(request, view, "invalid app slug");
  try {
    await adminSend(`/api/admin/create/apps/${slug}/suspend`, "POST", {});
    return back(request, view);
  } catch (error) {
    return back(
      request,
      view,
      error instanceof Error ? error.message : "control plane unreachable"
    );
  }
}
