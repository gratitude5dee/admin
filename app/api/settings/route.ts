/**
 * Fleet settings writes, proxied server-side so ADMIN_API_KEY never reaches
 * the browser. POST with provider=ascii|tenki writes the control plane's
 * platform_settings.box_default_provider — which provider a brand-new
 * signup's box lands on — then redirects back to /fleet carrying any
 * upstream error in the query string.
 */
import { NextRequest, NextResponse } from "next/server";
import { adminSend, ControlPlaneError } from "@/lib/controlPlane";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROVIDERS = new Set(["ascii", "tenki"]);

export async function POST(request: NextRequest): Promise<NextResponse> {
  const url = request.nextUrl.clone();
  url.pathname = "/fleet";
  url.search = "";
  try {
    const provider = String((await request.formData()).get("provider") ?? "");
    if (!PROVIDERS.has(provider)) {
      throw new ControlPlaneError(
        400,
        "/api/admin/settings",
        `unknown provider "${provider}"`
      );
    }
    await adminSend("/api/admin/settings", "POST", {
      box_default_provider: provider,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    url.search = `?error=${encodeURIComponent(message)}`;
  }
  return NextResponse.redirect(url, 303);
}
