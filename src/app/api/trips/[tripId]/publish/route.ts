// POST /api/trips/:tripId/publish — owner only.
// Mints (or reuses) an unguessable public share slug and marks the trip
// published. Owner auth is enforced by src/middleware.ts; requireOwner() is a
// defense-in-depth re-check, matching the other owner routes.
export const runtime = "nodejs";

import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireOwner } from "@/lib/auth";
import { log } from "@/lib/logger";

/**
 * Generate a fresh, unguessable, URL-safe share slug.
 * 18 random bytes → 24 base64url chars (no padding) → ≥ 24 chars as required by
 * spec/data.md (144 bits of entropy; possession grants read-only access).
 */
function generateShareSlug(): string {
  return randomBytes(18).toString("base64url");
}

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
      // Reuse the live slug when the trip is already published; otherwise mint a
      // fresh one and flip the published flag in a single update.
      let slug = trip.shareSlug;
      if (!trip.isPublished || !slug) {
        slug = generateShareSlug();
        await prisma.trip.update({
          where: { id: tripId },
          data: { isPublished: true, shareSlug: slug },
        });
      }
      const shareUrl = new URL(`/s/${slug}`, req.url).toString();
      res = NextResponse.json({ shareUrl }, { status: 200 });
    }
  } catch (err) {
    log.error("publish failed", {
      tripId,
      error: err instanceof Error ? err.message : String(err),
    });
    res = NextResponse.json({ error: "internal error" }, { status: 500 });
  }

  log.info("request", {
    method: "POST",
    path: `/api/trips/${tripId}/publish`,
    status: res.status,
    ms: Date.now() - started,
  });
  return res;
}
