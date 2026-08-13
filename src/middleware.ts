// Owner-auth gate. Runs on the Next.js EDGE runtime, so it stays Edge-safe:
// it imports only `verifySession` (Web Crypto) — no Node `crypto`, no Prisma.
//
// - Unauthenticated PAGE requests for `/` and `/trips/**` → redirect to /login.
// - Unauthenticated owner `/api/**` requests → 401 JSON.
// - Exempt (always allowed): /login, /api/auth/login, /api/auth/session,
//   /health, /api/media/**, and (P2) /s/** (public reader pages) +
//   /api/public/** (public read API).
// - The `matcher` excludes Next internals and static assets so they never hit
//   this function.

import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";

function isExempt(pathname: string): boolean {
  if (
    pathname === "/login" ||
    pathname === "/health" ||
    pathname === "/api/auth/login" ||
    pathname === "/api/auth/session"
  ) {
    return true;
  }
  // Public photo byte stream.
  if (pathname === "/api/media" || pathname.startsWith("/api/media/")) {
    return true;
  }
  // (P2) Public read API — served without owner auth.
  if (pathname === "/api/public" || pathname.startsWith("/api/public/")) {
    return true;
  }
  // (P2) Public reader pages under the opaque share slug.
  if (pathname === "/s" || pathname.startsWith("/s/")) {
    return true;
  }
  return false;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isExempt(pathname)) {
    return NextResponse.next();
  }

  const token = req.cookies.get("session")?.value;
  const session = token ? await verifySession(token) : null;
  const authed = session !== null;

  // Owner API surface: reject unauthenticated calls with 401 JSON.
  if (pathname.startsWith("/api/")) {
    if (!authed) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    return NextResponse.next();
  }

  // Owner page surface (`/`, `/trips/**`): redirect to /login when unauthenticated.
  if (!authed) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Run on everything except Next internals and static assets. Exempt public
  // paths (/health, /api/media/**, ...) still reach middleware and are allowed
  // by isExempt() above.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|css|js|map|txt|woff|woff2|ttf|eot)$).*)",
  ],
};
