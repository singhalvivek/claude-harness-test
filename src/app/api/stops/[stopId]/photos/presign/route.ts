// POST /api/stops/:stopId/photos/presign — owner only.
// Step 1 of the direct upload: mint an opaque key + a short-lived URL the
// browser uploads the file bytes to directly (R2 presigned URL via aws4fetch, or
// the local receiver route), bypassing the serverless request-body size limit.
// The Photo/Media row is created afterwards by /photos/complete.
//
// Phase 2.5: `kind:"video"` mints a video key AND — when the caller supplies a
// `posterContentType` — a SECOND presigned target for the client-captured poster
// JPEG, in the SAME round-trip and under the SAME `<uuid>` prefix, so that
// /complete's prefix check and the delete path both hold. The server never sees
// or decodes the bytes: no ffmpeg, no sharp, no AWS SDK (aws4fetch only, behind
// the existing `storage.presignUpload` seam).
export const runtime = "nodejs";

import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { storage } from "@/lib/storage";
import { requireOwner } from "@/lib/auth";
import { log } from "@/lib/logger";
import { VIDEO_MIME_TYPES, type MediaKind } from "@/lib/api-client";

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/heic": "heic",
  "image/heif": "heif",
};
const ALLOWED_EXT = new Set(["jpg", "jpeg", "png", "webp", "gif", "avif", "heic", "heif"]);

// Accepted video types (the frozen VIDEO_MIME_TYPES list) → the key extension we
// mint for each. `video/quicktime` is the common iPhone `.mov` case.
const EXT_BY_VIDEO_MIME: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};
const ALLOWED_VIDEO_EXT = new Set(["mp4", "mov", "webm"]);

/** `video/mp4;codecs=avc1.42E01E` → `video/mp4`. */
function baseMime(contentType: string): string {
  return (contentType || "").split(";")[0]!.trim().toLowerCase();
}

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : "";
}

function imageExtFor(filename: string, contentType: string): string | null {
  const byMime = EXT_BY_MIME[baseMime(contentType)];
  if (byMime) return byMime;
  const ext = extensionOf(filename);
  return ALLOWED_EXT.has(ext) ? ext : null;
}

/** Video key extension, or null when the type is not one of the three accepted
 *  video types. An empty/unknown `File.type` falls back to the extension. */
function videoExtFor(filename: string, contentType: string): string | null {
  const mime = baseMime(contentType);
  if (VIDEO_MIME_TYPES.includes(mime)) {
    return EXT_BY_VIDEO_MIME[mime] ?? null;
  }
  if (mime && mime.startsWith("video/")) return null; // an explicitly unsupported codec container
  const ext = extensionOf(filename);
  return ALLOWED_VIDEO_EXT.has(ext) ? ext : null;
}

const presignSchema = z.object({
  filename: z.string().optional(),
  contentType: z.string().optional(),
  kind: z.enum(["photo", "video"]).optional(),
  posterContentType: z.string().optional(),
});

type PresignTarget = { key: string; uploadUrl: string; method: "PUT" };

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
  const parsed = presignSchema.safeParse(json);
  if (!parsed.success) {
    // An unknown `kind` lands here too — it is rejected at the boundary and
    // never persisted (spec/api.md).
    return NextResponse.json({ error: "invalid presign request" }, { status: 400 });
  }

  const filename = parsed.data.filename ?? "photo";
  const contentType = parsed.data.contentType ?? "";
  const kind: MediaKind = parsed.data.kind ?? "photo";

  const ext =
    kind === "video" ? videoExtFor(filename, contentType) : imageExtFor(filename, contentType);
  if (!ext) {
    return NextResponse.json(
      { error: kind === "video" ? "unsupported video type" : "unsupported image type" },
      { status: 400 },
    );
  }

  // One uuid prefix per media item — the video and its poster share it.
  const prefix = `trips/${stop.tripId}/${stopId}/${randomUUID()}`;
  const key = `${prefix}/original.${ext}`;

  // `posterContentType` is honoured only for videos. The key is always
  // `<prefix>/poster.jpg` (the shape /complete validates); a non-image poster
  // content type degrades to image/jpeg rather than failing the whole upload.
  const posterMime = baseMime(parsed.data.posterContentType ?? "");
  const wantsPoster = kind === "video" && posterMime.length > 0;
  const posterContentType = posterMime.startsWith("image/") ? posterMime : "image/jpeg";
  const posterKey = `${prefix}/poster.jpg`;

  try {
    const { url, method } = await storage.presignUpload({
      key,
      contentType: contentType || "application/octet-stream",
    });

    let poster: PresignTarget | null = null;
    if (wantsPoster) {
      const signedPoster = await storage.presignUpload({
        key: posterKey,
        contentType: posterContentType,
      });
      poster = { key: posterKey, uploadUrl: signedPoster.url, method: signedPoster.method };
    }

    log.info("request", {
      method: "POST",
      path: `/api/stops/${stopId}/photos/presign`,
      status: 200,
      ms: Date.now() - started,
    });
    return NextResponse.json({ key, uploadUrl: url, method, poster });
  } catch (err) {
    log.error("presign failed", {
      stopId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "failed to presign upload" }, { status: 500 });
  }
}
