// POST /api/photos/:photoId/cover — make this photo its stop's cover. Owner only.
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireOwner } from "@/lib/auth";
import { log } from "@/lib/logger";

async function handlePost(photoId: string): Promise<NextResponse> {
  const photo = await prisma.photo.findUnique({
    where: { id: photoId },
    select: { id: true, stopId: true },
  });
  if (!photo) {
    return NextResponse.json({ error: "photo not found" }, { status: 404 });
  }

  await prisma.$transaction([
    prisma.photo.updateMany({
      where: { stopId: photo.stopId, isCover: true },
      data: { isCover: false },
    }),
    prisma.photo.update({
      where: { id: photoId },
      data: { isCover: true },
    }),
  ]);

  return NextResponse.json({ ok: true }, { status: 200 });
}

type Ctx = { params: Promise<{ photoId: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const started = Date.now();
  const { photoId } = await params;
  if (!(await requireOwner(req))) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const res = await handlePost(photoId);
  log.info("request", {
    method: "POST",
    path: `/api/photos/${photoId}/cover`,
    status: res.status,
    ms: Date.now() - started,
  });
  return res;
}
