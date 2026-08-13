// GET /api/auth/session — report owner-session + dev-default state.
// Public (exempt in middleware) so the login page can read `usingDevDefaults`.
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { env } from "@/lib/env";
import { log } from "@/lib/logger";

export async function GET(req: NextRequest) {
  const started = Date.now();
  const owner = await requireOwner(req);
  const res = NextResponse.json(
    { owner, usingDevDefaults: env.usingDevDefaults },
    { status: 200 },
  );
  log.info("request", {
    method: "GET",
    path: "/api/auth/session",
    status: 200,
    ms: Date.now() - started,
  });
  return res;
}
