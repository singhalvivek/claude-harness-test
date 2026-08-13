// Public media route: streams a stored photo derivative by its opaque key from
// PHOTO_STORAGE_DIR (Phase 1, local disk). No auth — photo bytes are public.
// In Phase 3 with R2, storage.url() returns the R2 URL directly and this route
// is bypassed for R2-backed keys.
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { logRequest } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
  ".heic": "image/heic",
  ".heif": "image/heif",
};

function contentTypeFor(filePath: string): string {
  return CONTENT_TYPE_BY_EXT[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const start = Date.now();
  const { key } = await params;
  const reqPath = `/api/media/${key.join("/")}`;

  const finish = (status: number, extra?: string) =>
    logRequest({ method: "GET", path: reqPath, status, ms: Date.now() - start, error: extra });

  // Guard against path traversal: reject any `..` segment or NUL byte before we
  // touch the filesystem.
  if (key.some((segment) => segment.includes("..") || segment.includes("\0"))) {
    finish(400, "invalid key");
    return NextResponse.json({ error: "invalid media key" }, { status: 400 });
  }

  const baseDir = path.resolve(env.PHOTO_STORAGE_DIR);
  const filePath = path.resolve(baseDir, ...key);

  // Defense in depth: ensure the resolved path stays inside the storage dir.
  if (filePath !== baseDir && !filePath.startsWith(baseDir + path.sep)) {
    finish(400, "key escapes storage dir");
    return NextResponse.json({ error: "invalid media key" }, { status: 400 });
  }

  let size: number;
  try {
    const info = await stat(filePath);
    if (!info.isFile()) {
      finish(404);
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    size = info.size;
  } catch {
    finish(404);
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const nodeStream = createReadStream(filePath);
  const body = Readable.toWeb(nodeStream) as unknown as ReadableStream<Uint8Array>;

  finish(200);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": contentTypeFor(filePath),
      "Content-Length": String(size),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
