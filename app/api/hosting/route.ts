/**
 * Hosting switch writes, proxied server-side so HOSTING_SWITCH_TOKEN never
 * reaches the browser. POST with target=vercel|cloudflare flips which upstream
 * the app-switch worker serves app.wzrd.tech from, then redirects back to
 * /hosting carrying any upstream error in the query string.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  HOSTING_TARGETS,
  HostingSwitchError,
  setHostingTarget,
  type HostingTarget,
} from "@/lib/hostingSwitch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const url = request.nextUrl.clone();
  url.pathname = "/hosting";
  url.search = "";
  try {
    const target = String((await request.formData()).get("target") ?? "");
    if (!HOSTING_TARGETS.includes(target as HostingTarget)) {
      throw new HostingSwitchError(400, `unknown target "${target}"`);
    }
    await setHostingTarget(target as HostingTarget);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    url.search = `?error=${encodeURIComponent(message)}`;
  }
  return NextResponse.redirect(url, 303);
}
