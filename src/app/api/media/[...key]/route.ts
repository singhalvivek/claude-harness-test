// Public media route: streams a stored media object by its opaque key from
// PHOTO_STORAGE_DIR (local disk backend). No auth — media bytes are public.
// With the R2 backend, storage.url() returns the R2 URL directly and this route
// is bypassed for R2-backed keys.
//
// Phase 2.5: serves VIDEO too. Two things are required for that and neither is
// optional — the correct video `Content-Type`, and real HTTP `Range` support.
// Without seekable ranges a browser cannot scrub, cannot reliably
// `preload="metadata"`, and Safari refuses to play the element at all. So the
// route always advertises `Accept-Ranges: bytes`, answers a satisfiable
// `Range: bytes=<start>-<end>` with a 206 + `Content-Range`, and an
// unsatisfiable one with a 416 + `Content-Range: bytes */<size>`.
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
  // Phase 2.5 — video.
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".m4v": "video/x-m4v",
};

function contentTypeFor(filePath: string): string {
  return CONTENT_TYPE_BY_EXT[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

type ParsedRange = { start: number; end: number };

/**
 * Parse a single-range `Range` header against a known object size.
 * - `null`        → no usable range; serve the whole object with 200.
 * - `"invalid"`   → syntactically fine but unsatisfiable; serve 416.
 * - `{start,end}` → inclusive byte range to serve with 206.
 * Multi-range requests are deliberately answered with the full body (200),
 * which RFC 9110 permits and every browser handles.
 */
function parseRange(header: string, size: number): ParsedRange | "invalid" | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;

  const [, rawStart, rawEnd] = match;
  if (rawStart === "" && rawEnd === "") return null;

  let start: number;
  let end: number;

  if (rawStart === "") {
    // Suffix form: `bytes=-N` → the last N bytes.
    const suffix = Number(rawEnd);
    if (!Number.isFinite(suffix) || suffix <= 0) return "invalid";
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === "" ? size - 1 : Number(rawEnd);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return "invalid";
    if (end > size - 1) end = size - 1;
  }

  if (size === 0 || start >= size || start > end || start < 0) return "invalid";
  return { start, end };
}

function streamOf(filePath: string, range?: ParsedRange): ReadableStream<Uint8Array> {
  const nodeStream = range
    ? createReadStream(filePath, { start: range.start, end: range.end })
    : createReadStream(filePath);
  return Readable.toWeb(nodeStream) as unknown as ReadableStream<Uint8Array>;
}

export async function GET(
  req: NextRequest,
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

  const contentType = contentTypeFor(filePath);
  const cacheControl = "public, max-age=31536000, immutable";

  const rangeHeader = req.headers.get("range");
  if (rangeHeader) {
    const range = parseRange(rangeHeader, size);

    if (range === "invalid") {
      finish(416, "unsatisfiable range");
      return new NextResponse(null, {
        status: 416,
        headers: {
          "Content-Range": `bytes */${size}`,
          "Accept-Ranges": "bytes",
          "Content-Type": contentType,
        },
      });
    }

    if (range) {
      finish(206);
      return new NextResponse(streamOf(filePath, range), {
        status: 206,
        headers: {
          "Content-Type": contentType,
          "Content-Length": String(range.end - range.start + 1),
          "Content-Range": `bytes ${range.start}-${range.end}/${size}`,
          "Accept-Ranges": "bytes",
          "Cache-Control": cacheControl,
        },
      });
    }
  }

  finish(200);
  return new NextResponse(streamOf(filePath), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(size),
      "Accept-Ranges": "bytes",
      "Cache-Control": cacheControl,
    },
  });
}
