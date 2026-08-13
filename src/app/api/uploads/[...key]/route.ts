// PUT /api/uploads/<key...> — receives a direct browser upload for the LOCAL
// disk backend (the R2 backend presigns straight to R2 and never hits this).
// Owner-only. Writes the raw body to disk under PHOTO_STORAGE_DIR via the same
// storage seam. Mirrors the presigned-PUT contract used by R2.
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { LocalDiskStorage } from "@/lib/storage/local";
import { requireOwner } from "@/lib/auth";
import { log } from "@/lib/logger";

type Ctx = { params: Promise<{ key: string[] }> };

export async function PUT(req: NextRequest, { params }: Ctx) {
  const started = Date.now();
  const { key } = await params;

  if (!(await requireOwner(req))) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  // Path-traversal guard before touching disk (Next already decodes segments).
  if (key.some((s) => s.includes("..") || s.includes("\0"))) {
    return NextResponse.json({ error: "invalid key" }, { status: 400 });
  }

  const keyStr = key.join("/");
  const contentType = req.headers.get("content-type") || "application/octet-stream";

  try {
    const buffer = Buffer.from(await req.arrayBuffer());
    await new LocalDiskStorage().save({ data: buffer, key: keyStr, contentType });
  } catch (err) {
    log.error("local upload write failed", {
      key: keyStr,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "failed to store upload" }, { status: 500 });
  }

  log.info("request", {
    method: "PUT",
    path: `/api/uploads/${keyStr}`,
    status: 200,
    ms: Date.now() - started,
  });
  return NextResponse.json({ ok: true });
}
