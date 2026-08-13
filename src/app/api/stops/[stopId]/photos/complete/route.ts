// POST /api/stops/:stopId/photos/complete — owner only.
// Step 2 of the direct upload: after the browser has PUT the file to `key`,
// create the Photo row. Originals-only: webKey/thumbKey/originalKey all point at
// the single uploaded object. Dimensions are supplied by the client (read from
// the image before upload); they only drive layout aspect, never correctness.
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import type { Photo } from "@prisma/client";
import { prisma } from "@/lib/db";
import { storage } from "@/lib/storage";
import { requireOwner } from "@/lib/auth";
import { log } from "@/lib/logger";

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

type Ctx = { params: Promise<{ stopId: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const started = Date.now();
  const { stopId } = await params;

  if (!(await requireOwner(req))) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const stop = await prisma.stop.findUnique({
    where: { id: stopId },
    select: { id: true, tripId: true },
  });
  if (!stop) {
    return NextResponse.json({ error: "stop not found" }, { status: 404 });
  }

  let body: { key?: unknown; width?: unknown; height?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "expected JSON body" }, { status: 400 });
  }

  const key = typeof body.key === "string" ? body.key : "";
  const width = Number.isFinite(body.width) ? Math.max(0, Math.trunc(body.width as number)) : 0;
  const height = Number.isFinite(body.height) ? Math.max(0, Math.trunc(body.height as number)) : 0;

  // The key must belong to this stop's prefix (an owner can't attach arbitrary
  // objects, and it must match what /presign minted).
  const prefix = `trips/${stop.tripId}/${stopId}/`;
  if (!key.startsWith(prefix) || key.includes("..")) {
    return NextResponse.json({ error: "invalid key" }, { status: 400 });
  }

  try {
    const existingCount = await prisma.photo.count({ where: { stopId } });
    const agg = await prisma.photo.aggregate({ where: { stopId }, _max: { order: true } });
    const order = (agg._max.order ?? -1) + 1;

    const created = await prisma.photo.create({
      data: {
        stopId,
        order,
        isCover: existingCount === 0,
        webKey: key,
        thumbKey: key,
        originalKey: key,
        width,
        height,
      },
    });

    log.info("request", {
      method: "POST",
      path: `/api/stops/${stopId}/photos/complete`,
      status: 201,
      ms: Date.now() - started,
    });
    return NextResponse.json(serializePhoto(created), { status: 201 });
  } catch (err) {
    log.error("photo complete failed", {
      stopId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "failed to record photo" }, { status: 500 });
  }
}
