// PATCH · DELETE /api/stops/:stopId — owner only.
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Stop, Photo } from "@prisma/client";
import { prisma } from "@/lib/db";
import { storage } from "@/lib/storage";
import { requireOwner } from "@/lib/auth";
import { log } from "@/lib/logger";
import { MOTIF_IDS } from "@/lib/api-client";

type StopWithPhotos = Stop & { photos: Photo[] };

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

function serializeStop(s: StopWithPhotos) {
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
    tags: [] as never[],
    photos: [...s.photos].sort((a, b) => a.order - b.order).map(serializePhoto),
  };
}

const patchSchema = z.object({
  title: z.string().nullable().optional(),
  placeName: z.string().nullable().optional(),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  locationPrecision: z.enum(["exact", "approximate", "none"]).optional(),
  occurredAt: z.string().datetime({ offset: true }).nullable().optional(),
  body: z.string().nullable().optional(),
  // Unknown motif → zod parse fails → 400. Persisted only when present.
  motif: z.enum(MOTIF_IDS).optional(),
});

async function handlePatch(
  req: NextRequest,
  stopId: string,
): Promise<NextResponse> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid request body" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid stop fields" }, { status: 400 });
  }

  const existing = await prisma.stop.findUnique({ where: { id: stopId } });
  if (!existing) {
    return NextResponse.json({ error: "stop not found" }, { status: 404 });
  }

  const d = parsed.data;
  const data: Record<string, unknown> = {};
  if (d.title !== undefined) data.title = d.title;
  if (d.placeName !== undefined) data.placeName = d.placeName;
  if (d.lat !== undefined) data.lat = d.lat;
  if (d.lng !== undefined) data.lng = d.lng;
  if (d.locationPrecision !== undefined) data.locationPrecision = d.locationPrecision;
  if (d.occurredAt !== undefined) {
    data.occurredAt = d.occurredAt ? new Date(d.occurredAt) : null;
  }
  if (d.body !== undefined) data.body = d.body;
  if (d.motif !== undefined) data.motif = d.motif;

  if (Object.keys(data).length > 0) {
    await prisma.stop.update({ where: { id: stopId }, data });
  }

  const stop = await prisma.stop.findUnique({
    where: { id: stopId },
    include: { photos: { orderBy: { order: "asc" } } },
  });
  return NextResponse.json(serializeStop(stop as StopWithPhotos), {
    status: 200,
  });
}

async function handleDelete(stopId: string): Promise<NextResponse> {
  const stop = await prisma.stop.findUnique({
    where: { id: stopId },
    include: { photos: true },
  });
  if (!stop) {
    return NextResponse.json({ error: "stop not found" }, { status: 404 });
  }

  const keys: string[] = [];
  for (const photo of stop.photos) {
    keys.push(photo.webKey, photo.thumbKey, photo.originalKey);
  }

  await prisma.stop.delete({ where: { id: stopId } });

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

type Ctx = { params: Promise<{ stopId: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const started = Date.now();
  const { stopId } = await params;
  if (!(await requireOwner(req))) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const res = await handlePatch(req, stopId);
  log.info("request", {
    method: "PATCH",
    path: `/api/stops/${stopId}`,
    status: res.status,
    ms: Date.now() - started,
  });
  return res;
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const started = Date.now();
  const { stopId } = await params;
  if (!(await requireOwner(req))) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const res = await handleDelete(stopId);
  log.info("request", {
    method: "DELETE",
    path: `/api/stops/${stopId}`,
    status: res.status,
    ms: Date.now() - started,
  });
  return res;
}
