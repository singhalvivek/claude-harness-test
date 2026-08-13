// GET /api/tags (list) · POST /api/tags (create-or-find) — owner only.
// Owner auth is enforced by src/middleware.ts + requireOwner() (defense-in-depth).
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Tag } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireOwner } from "@/lib/auth";
import { log } from "@/lib/logger";

// Serialize to the frozen Tag shape (spec/api.md + src/lib/api-client.ts):
// { id, label, kind } — createdAt is not part of the wire contract.
function serializeTag(t: Tag) {
  return {
    id: t.id,
    label: t.label,
    kind: t.kind as "mood" | "activity",
  };
}

const kindEnum = z.enum(["mood", "activity"]);

const createSchema = z.object({
  label: z.string().trim().min(1),
  kind: kindEnum,
});

async function handleGet(): Promise<NextResponse> {
  const tags = await prisma.tag.findMany({ orderBy: { label: "asc" } });
  return NextResponse.json({ tags: tags.map(serializeTag) }, { status: 200 });
}

async function handlePost(req: NextRequest): Promise<NextResponse> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid request body" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "label and kind are required" }, { status: 400 });
  }

  // Upsert by the unique label: a reused label maps to a single Tag row (no
  // duplicates). The existing row is returned unchanged when the label exists.
  const tag = await prisma.tag.upsert({
    where: { label: parsed.data.label },
    update: {},
    create: { label: parsed.data.label, kind: parsed.data.kind },
  });

  return NextResponse.json({ tag: serializeTag(tag) }, { status: 201 });
}

export async function GET(req: NextRequest) {
  const started = Date.now();
  if (!(await requireOwner(req))) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const res = await handleGet();
  log.info("request", {
    method: "GET",
    path: "/api/tags",
    status: res.status,
    ms: Date.now() - started,
  });
  return res;
}

export async function POST(req: NextRequest) {
  const started = Date.now();
  if (!(await requireOwner(req))) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const res = await handlePost(req);
  log.info("request", {
    method: "POST",
    path: "/api/tags",
    status: res.status,
    ms: Date.now() - started,
  });
  return res;
}
