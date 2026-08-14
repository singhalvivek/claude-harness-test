// PATCH · DELETE /api/photos/:photoId — owner only. `kind`-agnostic: the row may
// be a photo or (Phase 2.5) a video, and DELETE removes the video's poster object
// alongside its three key columns.
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Photo } from "@prisma/client";
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

const patchSchema = z.object({
  caption: z.string().nullable().optional(),
});

async function handlePatch(
  req: NextRequest,
  photoId: string,
): Promise<NextResponse> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid request body" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid photo fields" }, { status: 400 });
  }

  const existing = await prisma.photo.findUnique({ where: { id: photoId } });
  if (!existing) {
    return NextResponse.json({ error: "photo not found" }, { status: 404 });
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.caption !== undefined) data.caption = parsed.data.caption;

  const updated =
    Object.keys(data).length > 0
      ? await prisma.photo.update({ where: { id: photoId }, data })
      : existing;

  return NextResponse.json(serializePhoto(updated), { status: 200 });
}

async function handleDelete(photoId: string): Promise<NextResponse> {
  const photo = await prisma.photo.findUnique({ where: { id: photoId } });
  if (!photo) {
    return NextResponse.json({ error: "photo not found" }, { status: 404 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.photo.delete({ where: { id: photoId } });
    if (photo.isCover) {
      const next = await tx.photo.findFirst({
        where: { stopId: photo.stopId },
        orderBy: { order: "asc" },
      });
      if (next) {
        await tx.photo.update({
          where: { id: next.id },
          data: { isCover: true },
        });
      }
    }
  });

  // Delete every distinct object this row owns — including the video poster
  // (P2.5). `storage.delete` is idempotent, so a missing object is not an error.
  const keys = new Set(
    [photo.webKey, photo.thumbKey, photo.originalKey, photo.posterKey].filter(
      (k): k is string => typeof k === "string" && k.length > 0,
    ),
  );
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

type Ctx = { params: Promise<{ photoId: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const started = Date.now();
  const { photoId } = await params;
  if (!(await requireOwner(req))) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const res = await handlePatch(req, photoId);
  log.info("request", {
    method: "PATCH",
    path: `/api/photos/${photoId}`,
    status: res.status,
    ms: Date.now() - started,
  });
  return res;
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const started = Date.now();
  const { photoId } = await params;
  if (!(await requireOwner(req))) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const res = await handleDelete(photoId);
  log.info("request", {
    method: "DELETE",
    path: `/api/photos/${photoId}`,
    status: res.status,
    ms: Date.now() - started,
  });
  return res;
}
