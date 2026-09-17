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
import { isAppSlug } from "@/lib/deployments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  try {
    await adminSend(`/api/admin/create/apps/${slug}/suspend`, "POST", {});
    return back(request);
  } catch (error) {
    return back(
      request,
      error instanceof Error ? error.message : "control plane unreachable"
    );
  }
}
