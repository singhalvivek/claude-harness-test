// POST /api/stops/:stopId/tags — attach a tag to a stop (create-or-find the
// tag, then attach idempotently). Owner only. Returns the stop's tags after the
// change. Owner auth is enforced by middleware + requireOwner (defense-in-depth).
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
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

// The stop's tags, ordered by label — the response shape after any change.
async function loadStopTags(stopId: string) {
  const rows = await prisma.stopTag.findMany({
    where: { stopId },
    orderBy: { tag: { label: "asc" } },
    include: { tag: true },
  });
  return rows.map((r) => serializeTag(r.tag));
}

const kindEnum = z.enum(["mood", "activity"]);

// Body is either { tagId } (attach an existing tag) or { label, kind }
// (create-or-find by label, then attach).
const bodySchema = z.union([
  z.object({ tagId: z.string().min(1) }),
  z.object({ label: z.string().trim().min(1), kind: kindEnum }),
]);

async function handlePost(
  req: NextRequest,
  stopId: string,
): Promise<NextResponse> {
  const stop = await prisma.stop.findUnique({
    where: { id: stopId },
    select: { id: true },
  });
  if (!stop) {
    return NextResponse.json({ error: "stop not found" }, { status: 404 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid request body" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "provide either { tagId } or { label, kind }" },
      { status: 400 },
    );
  }

  // Resolve the tag: either an existing tagId or create-or-find by unique label.
  let tagId: string;
  if ("tagId" in parsed.data) {
    const tag = await prisma.tag.findUnique({
      where: { id: parsed.data.tagId },
      select: { id: true },
    });
    if (!tag) {
      return NextResponse.json({ error: "tag not found" }, { status: 404 });
    }
    tagId = tag.id;
  } else {
    const tag = await prisma.tag.upsert({
      where: { label: parsed.data.label },
      update: {},
      create: { label: parsed.data.label, kind: parsed.data.kind },
      select: { id: true },
    });
    tagId = tag.id;
  }

  // Idempotent attach: re-attaching an already-attached tag is a no-op.
  await prisma.stopTag.upsert({
    where: { stopId_tagId: { stopId, tagId } },
    update: {},
    create: { stopId, tagId },
  });

  const tags = await loadStopTags(stopId);
  return NextResponse.json({ tags }, { status: 200 });
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
    path: `/api/stops/${stopId}/tags`,
    status: res.status,
    ms: Date.now() - started,
  });
  return res;
}
