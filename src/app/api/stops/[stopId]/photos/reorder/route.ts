// POST /api/stops/:stopId/photos/reorder — reassign photo order 0..n-1. Owner only.
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireOwner } from "@/lib/auth";
import { log } from "@/lib/logger";

const ORDER_OFFSET = 1_000_000;

const schema = z.object({ orderedPhotoIds: z.array(z.string()) });

async function handlePost(
  req: NextRequest,
  stopId: string,
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
      { error: "orderedPhotoIds is required" },
      { status: 400 },
    );
  }
  const orderedPhotoIds = parsed.data.orderedPhotoIds;

  const photos = await prisma.photo.findMany({
    where: { stopId },
    select: { id: true },
  });
  const existing = new Set(photos.map((p) => p.id));
  const provided = new Set(orderedPhotoIds);

  const matches =
    orderedPhotoIds.length === existing.size &&
    provided.size === orderedPhotoIds.length &&
    orderedPhotoIds.every((id) => existing.has(id));

  if (!matches) {
    return NextResponse.json(
      { error: "orderedPhotoIds must exactly match the stop's photos" },
      { status: 400 },
    );
  }

  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < orderedPhotoIds.length; i++) {
      await tx.photo.update({
        where: { id: orderedPhotoIds[i] },
        data: { order: ORDER_OFFSET + i },
      });
    }
    for (let i = 0; i < orderedPhotoIds.length; i++) {
      await tx.photo.update({
        where: { id: orderedPhotoIds[i] },
        data: { order: i },
      });
    }
  });

  return NextResponse.json({ ok: true }, { status: 200 });
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
    path: `/api/stops/${stopId}/photos/reorder`,
    status: res.status,
    ms: Date.now() - started,
  });
  return res;
}
