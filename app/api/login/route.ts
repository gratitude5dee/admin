import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  createSessionCookie,
  passwordMatches,
} from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const form = await request.formData().catch(() => null);
  const password = form?.get("password");
  if (typeof password !== "string" || !passwordMatches(password)) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = "?error=1";
    return NextResponse.redirect(login, { status: 303 });
  }
  const cookie = await createSessionCookie();
  if (!cookie) {
    return NextResponse.json(
      { error: "DASHBOARD_PASSWORD is not configured" },
      { status: 500 }
    );
  }
  const home = request.nextUrl.clone();
  home.pathname = "/";
  home.search = "";
  const response = NextResponse.redirect(home, { status: 303 });
  response.cookies.set(SESSION_COOKIE, cookie, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
  return response;
}
