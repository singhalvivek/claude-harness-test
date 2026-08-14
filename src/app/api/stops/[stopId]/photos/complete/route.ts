// POST /api/stops/:stopId/photos/complete — owner only.
// Step 2 of the direct upload: after the browser has PUT the file to `key`,
// create the media row. Originals-only: webKey/originalKey point at the single
// uploaded object. Dimensions are supplied by the client (read from the image or
// the <video> before upload); they only drive layout aspect, never correctness.
//
// Phase 2.5: this route also registers VIDEOS. It NEVER calls `sharp` and never
// reads the uploaded object — `kind`, `posterKey`, `durationSec`, `width` and
// `height` all arrive from the browser, because there is no ffmpeg/ffprobe on the
// server (and never will be). For a video with a poster, `thumbKey` points at the
// POSTER so every existing `<img src={thumbUrl}>` call site keeps rendering a
// real still (the thumbUrl safety rule in spec/data.md).
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import type { Photo } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { storage } from "@/lib/storage";
import { requireOwner } from "@/lib/auth";
import { log } from "@/lib/logger";
import type { MediaKind } from "@/lib/api-client";

function serializePhoto(p: Photo) {
  return {
    id: p.id,
    order: p.order,
    isCover: p.isCover,
    kind: p.kind as MediaKind,
    webUrl: storage.url(p.webKey),
    thumbUrl: storage.url(p.thumbKey),
    posterUrl: p.posterKey ? storage.url(p.posterKey) : null,
    durationSec: p.durationSec,
    width: p.width,
    height: p.height,
    caption: p.caption,
  };
}

// `width`/`height`/`durationSec` stay deliberately permissive: they are advisory
// client-read hints, so a junk value degrades to 0 / null rather than failing an
// upload whose bytes are already in storage (spec/api.md). `kind` is strict.
const completeSchema = z.object({
  key: z.string(),
  width: z.unknown().optional(),
  height: z.unknown().optional(),
  kind: z.enum(["photo", "video"]).optional(),
  posterKey: z.unknown().optional(),
  durationSec: z.unknown().optional(),
});

function nonNegativeInt(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
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

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "expected JSON body" }, { status: 400 });
  }
  const parsed = completeSchema.safeParse(json);
  if (!parsed.success) {
    // An unknown `kind` lands here too — rejected at the boundary, never persisted.
    return NextResponse.json({ error: "invalid request body" }, { status: 400 });
  }

  const key = parsed.data.key;
  const kind: MediaKind = parsed.data.kind ?? "photo";
  const width = nonNegativeInt(parsed.data.width);
  const height = nonNegativeInt(parsed.data.height);

  // The key must belong to this stop's prefix (an owner can't attach arbitrary
  // objects, and it must match what /presign minted).
  const prefix = `trips/${stop.tripId}/${stopId}/`;
  if (!key.startsWith(prefix) || key.includes("..")) {
    return NextResponse.json({ error: "invalid key" }, { status: 400 });
  }

  // The poster is validated whenever one is supplied — a malformed key is a
  // client bug worth surfacing, not something to swallow. It must sit under the
  // SAME stop prefix as the video (the /presign contract puts it under the same
  // <uuid>), carry no traversal, and be the `poster.jpg` object.
  const posterInput = parsed.data.posterKey;
  let rawPosterKey: string | null = null;
  if (posterInput !== undefined && posterInput !== null && posterInput !== "") {
    const valid =
      typeof posterInput === "string" &&
      posterInput.startsWith(prefix) &&
      !posterInput.includes("..") &&
      posterInput.endsWith("/poster.jpg");
    if (!valid) {
      return NextResponse.json({ error: "invalid poster key" }, { status: 400 });
    }
    rawPosterKey = posterInput;
  }

  // `posterKey`/`durationSec` are video-only; supplied with kind:"photo" they are
  // ignored (never persisted) — spec/api.md.
  const isVideo = kind === "video";
  const posterKey = isVideo && rawPosterKey ? rawPosterKey : null;
  const rawDuration = parsed.data.durationSec;
  const durationSec =
    isVideo && typeof rawDuration === "number" && Number.isFinite(rawDuration) && rawDuration >= 0
      ? rawDuration
      : null;

  // thumbUrl safety rule: a video's thumb is its poster when one exists, else the
  // video object itself (consumers branch on `kind` for the placeholder).
  const thumbKey = posterKey ?? key;

  try {
    const existingCount = await prisma.photo.count({ where: { stopId } });
    const agg = await prisma.photo.aggregate({ where: { stopId }, _max: { order: true } });
    const order = (agg._max.order ?? -1) + 1;

    const created = await prisma.photo.create({
      data: {
        stopId,
        order,
        isCover: existingCount === 0,
        kind,
        webKey: key,
        thumbKey,
        originalKey: key,
        posterKey,
        durationSec,
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
    log.error("media complete failed", {
      stopId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "failed to record photo" }, { status: 500 });
  }
}
