// POST /api/auth/logout — clear the owner session cookie.
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { clearCookie } from "@/lib/auth";
import { log } from "@/lib/logger";

export async function POST() {
  const started = Date.now();
  const res = NextResponse.json({ ok: true }, { status: 200 });
  res.cookies.set(clearCookie());
  log.info("request", {
    method: "POST",
    path: "/api/auth/logout",
    status: 200,
    ms: Date.now() - started,
  });
  return res;
}
