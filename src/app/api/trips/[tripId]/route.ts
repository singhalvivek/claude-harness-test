// GET · PATCH · DELETE /api/trips/:tripId — owner only.
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Trip, Stop, Photo, Tag, StopTag } from "@prisma/client";
import { prisma } from "@/lib/db";
import { storage } from "@/lib/storage";
import { requireOwner } from "@/lib/auth";
import { log } from "@/lib/logger";

type StopTagWithTag = StopTag & { tag: Tag };
type StopWithRelations = Stop & { photos: Photo[]; tags: StopTagWithTag[] };
type TripFull = Trip & { stops: StopWithRelations[] };

function serializePhoto(p: Photo) {
  return {
    id: p.id,
    order: p.order,
    isCover: p.isCover,
    webUrl: storage.url(p.webKey),
    thumbUrl: storage.url(p.thumbKey),
    width: p.width,
    height: p.height,
    caption: p.caption,
  };
}

function serializeTag(st: StopTagWithTag) {
  return {
    id: st.tag.id,
    label: st.tag.label,
    kind: st.tag.kind as "mood" | "activity",
  };
}

function serializeStop(s: StopWithRelations) {
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
    motif: s.motif,
    tags: s.tags.map(serializeTag),
    photos: [...s.photos].sort((a, b) => a.order - b.order).map(serializePhoto),
  };
}

function serializeTrip(t: TripFull) {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    theme: t.theme,
    isPublished: t.isPublished,
    shareSlug: t.shareSlug,
    stops: [...t.stops].sort((a, b) => a.order - b.order).map(serializeStop),
  };
}

// Frozen StoryTheme enum (see spec/api.md + spec/capabilities/story-themes.md).
const themeEnum = z.enum(["cinematic", "editorial", "minimal", "vintage"]);

const patchSchema = z.object({
  title: z.string().trim().min(1).optional(),
  description: z.string().nullable().optional(),
  coverPhotoId: z.string().nullable().optional(),
  theme: themeEnum.optional(),
});

function loadFullTrip(tripId: string) {
  return prisma.trip.findUnique({
    where: { id: tripId },
    include: {
      stops: {
        orderBy: { order: "asc" },
        include: {
          photos: { orderBy: { order: "asc" } },
          tags: { orderBy: { tag: { label: "asc" } }, include: { tag: true } },
        },
      },
    },
  });
}

async function handleGet(tripId: string): Promise<NextResponse> {
  const trip = await loadFullTrip(tripId);
  if (!trip) {
    return NextResponse.json({ error: "trip not found" }, { status: 404 });
  }
  return NextResponse.json(serializeTrip(trip), { status: 200 });
}

async function handlePatch(
  req: NextRequest,
  tripId: string,
): Promise<NextResponse> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid request body" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid trip fields" }, { status: 400 });
  }

  const existing = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!existing) {
    return NextResponse.json({ error: "trip not found" }, { status: 404 });
  }

  // Non-destructive: only update fields explicitly present in the request.
  const data: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) data.title = parsed.data.title;
  if (parsed.data.description !== undefined) data.description = parsed.data.description;
  if (parsed.data.coverPhotoId !== undefined) data.coverPhotoId = parsed.data.coverPhotoId;
  if (parsed.data.theme !== undefined) data.theme = parsed.data.theme;

  if (Object.keys(data).length > 0) {
    await prisma.trip.update({ where: { id: tripId }, data });
  }

  const trip = await loadFullTrip(tripId);
  return NextResponse.json(serializeTrip(trip as TripFull), { status: 200 });
}

async function handleDelete(tripId: string): Promise<NextResponse> {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: { stops: { include: { photos: true } } },
  });
  if (!trip) {
    return NextResponse.json({ error: "trip not found" }, { status: 404 });
  }

  const keys: string[] = [];
  for (const stop of trip.stops) {
    for (const photo of stop.photos) {
      keys.push(photo.webKey, photo.thumbKey, photo.originalKey);
    }
  }

  // Cascade removes stops + photos rows via the schema's onDelete: Cascade.
  await prisma.trip.delete({ where: { id: tripId } });

  // Best-effort byte cleanup; a failed unlink must not fail the delete.
  for (const key of keys) {
    try {
      await storage.delete(key);
    } catch (err) {
      log.error("photo file delete failed", {
        key,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return new NextResponse(null, { status: 204 });
}

type Ctx = { params: Promise<{ tripId: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const started = Date.now();
  const { tripId } = await params;
  if (!(await requireOwner(req))) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const res = await handleGet(tripId);
  log.info("request", {
    method: "GET",
    path: `/api/trips/${tripId}`,
    status: res.status,
    ms: Date.now() - started,
  });
  return res;
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const started = Date.now();
  const { tripId } = await params;
  if (!(await requireOwner(req))) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const res = await handlePatch(req, tripId);
  log.info("request", {
    method: "PATCH",
    path: `/api/trips/${tripId}`,
    status: res.status,
    ms: Date.now() - started,
  });
  return res;
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const started = Date.now();
  const { tripId } = await params;
  if (!(await requireOwner(req))) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const res = await handleDelete(tripId);
  log.info("request", {
    method: "DELETE",
    path: `/api/trips/${tripId}`,
    status: res.status,
    ms: Date.now() - started,
  });
  return res;
}
