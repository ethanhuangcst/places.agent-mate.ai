import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { COOKIE } from "@/src/auth/cookie-names";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/admin") && !request.cookies.get(COOKIE)?.value) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
