// Liveness/readiness probe. The Playwright webServer waits on this before running
// the specs, so it must be reliable and never statically cached.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logRequest } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    logRequest({ method: "GET", path: "/health", status: 200, ms: Date.now() - start });
    return NextResponse.json({ status: "ok", db: "up" });
  } catch (err) {
    logRequest({
      method: "GET",
      path: "/health",
      status: 503,
      ms: Date.now() - start,
      error: (err as Error).message,
    });
    return NextResponse.json({ status: "degraded", db: "down" }, { status: 503 });
  }
}
