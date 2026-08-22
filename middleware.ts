import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionCookie } from "@/lib/session";

const PUBLIC_PATHS = new Set(["/login", "/api/login"]);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
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
