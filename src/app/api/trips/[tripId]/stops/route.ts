// POST /api/trips/:tripId/stops — create a stop (order = max+1). Owner only.
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Stop } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireOwner } from "@/lib/auth";
import { log } from "@/lib/logger";

const createSchema = z.object({
  title: z.string().optional(),
  placeName: z.string().nullable().optional(),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  locationPrecision: z.enum(["exact", "approximate", "none"]).optional(),
  occurredAt: z.string().datetime({ offset: true }).nullable().optional(),
  body: z.string().optional(),
});

function serializeNewStop(s: Stop) {
  return {
    id: s.id,
    order: s.order,
    title: s.title,
    placeName: s.placeName,
    lat: s.lat,
    lng: s.lng,
    locationPrecision: s.locationPrecision,
    occurredAt: s.occurredAt ? s.occurredAt.toISOString() : null,
    body: s.body,
    tags: [] as never[],
    photos: [] as never[],
  };
}

async function handlePost(
  req: NextRequest,
  tripId: string,
): Promise<NextResponse> {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    select: { id: true },
  });
  if (!trip) {
    return NextResponse.json({ error: "trip not found" }, { status: 404 });
  }

  let json: unknown = {};
  try {
    json = await req.json();
  } catch {
    json = {};
  }
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid stop fields" }, { status: 400 });
  }

  const agg = await prisma.stop.aggregate({
    where: { tripId },
    _max: { order: true },
  });
  const nextOrder = (agg._max.order ?? -1) + 1;

  const d = parsed.data;
  const stop = await prisma.stop.create({
    data: {
      tripId,
      order: nextOrder,
      title: d.title,
      placeName: d.placeName ?? undefined,
      lat: d.lat ?? undefined,
      lng: d.lng ?? undefined,
      locationPrecision: d.locationPrecision,
      occurredAt: d.occurredAt ? new Date(d.occurredAt) : undefined,
      body: d.body,
    },
  });

  return NextResponse.json(serializeNewStop(stop), { status: 201 });
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
    path: `/api/trips/${tripId}/stops`,
    status: res.status,
    ms: Date.now() - started,
  });
  return res;
}
