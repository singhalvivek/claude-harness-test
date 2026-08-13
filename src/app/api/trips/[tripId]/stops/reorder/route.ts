// POST /api/trips/:tripId/stops/reorder — reassign stop order 0..n-1. Owner only.
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireOwner } from "@/lib/auth";
import { log } from "@/lib/logger";

// Offset well past any realistic order count so phase-1 temp values can never
// collide with the final 0..n-1 slots inside the transaction.
const ORDER_OFFSET = 1_000_000;

const schema = z.object({ orderedStopIds: z.array(z.string()) });

async function handlePost(
  req: NextRequest,
  tripId: string,
): Promise<NextResponse> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid request body" }, { status: 400 });
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "orderedStopIds is required" },
      { status: 400 },
    );
  }
  const orderedStopIds = parsed.data.orderedStopIds;

  const stops = await prisma.stop.findMany({
    where: { tripId },
    select: { id: true },
  });
  const existing = new Set(stops.map((s) => s.id));
  const provided = new Set(orderedStopIds);

  const matches =
    orderedStopIds.length === existing.size &&
    provided.size === orderedStopIds.length && // no duplicates
    orderedStopIds.every((id) => existing.has(id));

  if (!matches) {
    return NextResponse.json(
      { error: "orderedStopIds must exactly match the trip's stops" },
      { status: 400 },
    );
  }

  await prisma.$transaction(async (tx) => {
    // Phase 1: move everything into a high, collision-free range.
    for (let i = 0; i < orderedStopIds.length; i++) {
      await tx.stop.update({
        where: { id: orderedStopIds[i] },
        data: { order: ORDER_OFFSET + i },
      });
    }
    // Phase 2: renumber into the final 0..n-1 sequence.
    for (let i = 0; i < orderedStopIds.length; i++) {
      await tx.stop.update({
        where: { id: orderedStopIds[i] },
        data: { order: i },
      });
    }
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}

type Ctx = { params: Promise<{ tripId: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const started = Date.now();
  const { tripId } = await params;
  if (!(await requireOwner(req))) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const res = await handlePost(req, tripId);
  log.info("request", {
    method: "POST",
    path: `/api/trips/${tripId}/stops/reorder`,
    status: res.status,
    ms: Date.now() - started,
  });
  return res;
}
