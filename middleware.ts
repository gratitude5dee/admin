import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionCookie } from "@/lib/session";
import { needsOriginCheck, originMatchesHost } from "@/lib/origin";

const PUBLIC_PATHS = new Set(["/login", "/api/login"]);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // Every state change (login included) must come from this dashboard's own
  // pages: a sibling host of the same site carries the Lax cookie too.
  if (
    needsOriginCheck(request.method) &&
    !originMatchesHost(request.headers.get("origin"), request.nextUrl.host)
  ) {
    return NextResponse.json({ error: "cross-origin request refused" }, { status: 403 });
  }
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  const cookie = request.cookies.get(SESSION_COOKIE)?.value;
  if (await verifySessionCookie(cookie)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const login = request.nextUrl.clone();
  login.pathname = "/login";
  login.search = "";
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
