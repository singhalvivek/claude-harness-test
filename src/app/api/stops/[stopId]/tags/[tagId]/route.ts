// DELETE /api/stops/:stopId/tags/:tagId — detach a tag from a stop (idempotent:
// detaching a tag that isn't attached is a no-op). Owner only. Returns the
// stop's remaining tags. Owner auth is enforced by middleware + requireOwner.
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import type { Tag } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireOwner } from "@/lib/auth";
import { log } from "@/lib/logger";

function serializeTag(t: Tag) {
  return {
    id: t.id,
    label: t.label,
    kind: t.kind as "mood" | "activity",
  };
}

async function loadStopTags(stopId: string) {
  const rows = await prisma.stopTag.findMany({
    where: { stopId },
    orderBy: { tag: { label: "asc" } },
    include: { tag: true },
  });
  return rows.map((r) => serializeTag(r.tag));
}

async function handleDelete(
  stopId: string,
  tagId: string,
): Promise<NextResponse> {
  const stop = await prisma.stop.findUnique({
    where: { id: stopId },
    select: { id: true },
  });
  if (!stop) {
    return NextResponse.json({ error: "stop not found" }, { status: 404 });
  }

  // Idempotent: deleteMany removes the join row if present, no-op otherwise.
  await prisma.stopTag.deleteMany({ where: { stopId, tagId } });

  const tags = await loadStopTags(stopId);
  return NextResponse.json({ tags }, { status: 200 });
}

type Ctx = { params: Promise<{ stopId: string; tagId: string }> };

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const started = Date.now();
  const { stopId, tagId } = await params;
  if (!(await requireOwner(req))) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const res = await handleDelete(stopId, tagId);
  log.info("request", {
    method: "DELETE",
    path: `/api/stops/${stopId}/tags/${tagId}`,
    status: res.status,
    ms: Date.now() - started,
  });
  return res;
}
