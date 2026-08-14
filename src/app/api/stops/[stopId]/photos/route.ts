// POST /api/stops/:stopId/photos — LEGACY multipart upload, IMAGES ONLY.
// multipart → sharp derivatives → rows. Owner only.
//
// This is the only route that runs `processUpload` (sharp). Phase 2.5 therefore
// branches on MIME/extension BEFORE `processUpload` is reached and returns 415
// for any video part: sharp throws on video bytes, so video must never get that
// far. Videos use the direct path (presign → PUT → complete), which never calls
// sharp at all. Kept because the Phase-1 smoke tests upload through here.
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import type { Photo } from "@prisma/client";
import { prisma } from "@/lib/db";
import { storage } from "@/lib/storage";
import { processUpload } from "@/lib/photos";
import { requireOwner } from "@/lib/auth";
import { log } from "@/lib/logger";
import type { MediaKind } from "@/lib/api-client";

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB per file
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);
const ALLOWED_EXT = new Set(["jpg", "jpeg", "png", "webp", "heic", "heif"]);

// Any of these — by MIME or by extension — is routed away from sharp with 415.
const VIDEO_EXT = new Set(["mp4", "mov", "webm", "m4v", "avi", "mkv", "hevc"]);

const VIDEO_REDIRECT_MESSAGE =
  "video uploads must use the direct upload path (presign → PUT → complete)";

function extOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

/** `video/mp4;codecs=avc1` → `video/mp4`. */
function baseMime(contentType: string): string {
  return (contentType || "").split(";")[0]!.trim().toLowerCase();
}

/** True for anything that looks like video — checked BEFORE sharp sees a byte. */
function isVideoPart(file: File): boolean {
  const mime = baseMime(file.type);
  if (mime.startsWith("video/")) return true;
  return VIDEO_EXT.has(extOf(file.name));
}

function isSupported(file: File): boolean {
  const mime = (file.type || "").toLowerCase();
  if (mime && ALLOWED_MIME.has(mime)) return true;
  return ALLOWED_EXT.has(extOf(file.name));
}

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

async function handlePost(
  req: NextRequest,
  stopId: string,
): Promise<NextResponse> {
  const stop = await prisma.stop.findUnique({
    where: { id: stopId },
    select: { id: true, tripId: true },
  });
  if (!stop) {
    return NextResponse.json({ error: "stop not found" }, { status: 404 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "expected multipart/form-data" },
      { status: 400 },
    );
  }

  const files = form.getAll("files").filter((v): v is File => v instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "no files provided" }, { status: 400 });
  }

  // VIDEO GUARD — first, before ANY byte is read and long before `processUpload`
  // (sharp) is reached. sharp throws on a video buffer, so this branch is what
  // keeps video out of the image pipeline entirely. No row is created.
  for (const file of files) {
    if (isVideoPart(file)) {
      return NextResponse.json({ error: VIDEO_REDIRECT_MESSAGE }, { status: 415 });
    }
  }

  // Validate the whole batch up-front so a bad file writes nothing.
  for (const file of files) {
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `file exceeds ${MAX_BYTES} byte limit` },
        { status: 413 },
      );
    }
    if (!isSupported(file)) {
      return NextResponse.json(
        { error: "unsupported image type" },
        { status: 400 },
      );
    }
  }

  const existingCount = await prisma.photo.count({ where: { stopId } });
  const agg = await prisma.photo.aggregate({
    where: { stopId },
    _max: { order: true },
  });
  const baseOrder = (agg._max.order ?? -1) + 1;

  try {
    // Process every file (sharp + storage.save) before touching the DB, then
    // persist rows atomically — a processing failure leaves no partial rows.
    const processed = [];
    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const result = await processUpload(
        { buffer, filename: file.name, contentType: file.type || "image/jpeg" },
        { tripId: stop.tripId, stopId },
      );
      processed.push(result);
    }

    const created = await prisma.$transaction(
      processed.map((r, i) =>
        prisma.photo.create({
          data: {
            stopId,
            order: baseOrder + i,
            isCover: existingCount === 0 && i === 0,
            webKey: r.webKey,
            thumbKey: r.thumbKey,
            originalKey: r.originalKey,
            width: r.width,
            height: r.height,
          },
        }),
      ),
    );

    return NextResponse.json(
      { photos: created.map(serializePhoto) },
      { status: 201 },
    );
  } catch (err) {
    log.error("photo upload processing failed", {
      stopId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "failed to process upload" },
      { status: 500 },
    );
  }
}

type Ctx = { params: Promise<{ stopId: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const started = Date.now();
  const { stopId } = await params;
  if (!(await requireOwner(req))) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const res = await handlePost(req, stopId);
  log.info("request", {
    method: "POST",
    path: `/api/stops/${stopId}/photos`,
    status: res.status,
    ms: Date.now() - started,
  });
  return res;
}
