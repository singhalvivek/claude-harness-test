// POST /api/trips/:tripId/unpublish — owner only.
// Revokes the public share link: clears isPublished + shareSlug. A later
// re-publish mints a FRESH slug (invalidating the old link) — see the publish
// route. Owner auth is enforced by src/middleware.ts; requireOwner() is a
// defense-in-depth re-check.
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireOwner } from "@/lib/auth";
import { log } from "@/lib/logger";

type Ctx = { params: Promise<{ tripId: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const started = Date.now();
  const { tripId } = await params;

  if (!(await requireOwner(req))) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let res: NextResponse;
  try {
    const trip = await prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) {
      res = NextResponse.json({ error: "trip not found" }, { status: 404 });
    } else {
      await prisma.trip.update({
        where: { id: tripId },
        data: { isPublished: false, shareSlug: null },
      });
      res = NextResponse.json({ ok: true }, { status: 200 });
    }
  } catch (err) {
    log.error("unpublish failed", {
      tripId,
      error: err instanceof Error ? err.message : String(err),
    });
    res = NextResponse.json({ error: "internal error" }, { status: 500 });
  }

  log.info("request", {
    method: "POST",
    path: `/api/trips/${tripId}/unpublish`,
    status: res.status,
    ms: Date.now() - started,
  });
  return res;
}
