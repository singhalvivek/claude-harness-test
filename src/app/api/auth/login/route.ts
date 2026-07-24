// POST /api/auth/login — authenticate the owner and issue a session cookie.
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyPassword, sessionCookie } from "@/lib/auth";
import { signSession } from "@/lib/session";
import { log } from "@/lib/logger";

const bodySchema = z.object({ password: z.string().min(1) });

async function handle(req: NextRequest): Promise<NextResponse> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid request body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "password is required" }, { status: 400 });
  }

  if (!verifyPassword(parsed.data.password)) {
    return NextResponse.json({ error: "invalid password" }, { status: 401 });
  }

  const token = await signSession({ owner: true });
  const res = NextResponse.json({ ok: true }, { status: 200 });
  res.cookies.set(sessionCookie(token));
  return res;
}

export async function POST(req: NextRequest) {
  const started = Date.now();
  const res = await handle(req);
  log.info("request", {
    method: "POST",
    path: "/api/auth/login",
    status: res.status,
    ms: Date.now() - started,
  });
  return res;
}
