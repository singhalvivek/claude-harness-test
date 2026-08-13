// POST /api/stops/:stopId/photos/presign — owner only.
// Step 1 of the direct upload: mint an opaque key + a short-lived URL the
// browser uploads the file bytes to directly (R2 presigned URL, or the local
// receiver route), bypassing the serverless request-body size limit. The Photo
// row is created afterwards by /photos/complete.
export const runtime = "nodejs";

import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { storage } from "@/lib/storage";
import { requireOwner } from "@/lib/auth";
import { log } from "@/lib/logger";

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

function extFor(filename: string, contentType: string): string | null {
  const byMime = EXT_BY_MIME[(contentType || "").toLowerCase()];
  if (byMime) return byMime;
  const dot = filename.lastIndexOf(".");
  const ext = dot >= 0 ? filename.slice(dot + 1).toLowerCase() : "";
  return ALLOWED_EXT.has(ext) ? ext : null;
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

  let body: { filename?: unknown; contentType?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "expected JSON body" }, { status: 400 });
  }
  const filename = typeof body.filename === "string" ? body.filename : "photo";
  const contentType = typeof body.contentType === "string" ? body.contentType : "";

  const ext = extFor(filename, contentType);
  if (!ext) {
    return NextResponse.json({ error: "unsupported image type" }, { status: 400 });
  }

  const key = `trips/${stop.tripId}/${stopId}/${randomUUID()}/original.${ext}`;

  try {
    const { url, method } = await storage.presignUpload({
      key,
      contentType: contentType || "application/octet-stream",
    });
    log.info("request", {
      method: "POST",
      path: `/api/stops/${stopId}/photos/presign`,
      status: 200,
      ms: Date.now() - started,
    });
    return NextResponse.json({ key, uploadUrl: url, method });
  } catch (err) {
    log.error("presign failed", {
      stopId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "failed to presign upload" }, { status: 500 });
  }
}
