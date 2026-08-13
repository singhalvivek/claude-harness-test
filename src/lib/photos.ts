// Photo pipeline (sharp). Per the owner's choice we display the ORIGINAL image
// at full resolution — no downscaling — accepting slower loads for full quality.
//
// For each upload we always retain the untouched original bytes under an opaque
// key prefix. The displayed image is:
//   - the ORIGINAL itself, served unchanged, when it's a browser-renderable
//     format (JPEG/PNG/WebP/GIF/AVIF); or
//   - a FULL-RESOLUTION JPEG (rotated upright, NOT downscaled) when the original
//     is a format browsers can't show inline (HEIC/HEIF/TIFF/…), so it still
//     renders while preserving full resolution.
// The DB keeps three key columns; webKey/thumbKey point at the displayed object
// (equal to originalKey in the common case). Callers resolve URLs via storage.url().
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { storage } from "@/lib/storage";

// Formats a browser can render inline directly from the original bytes.
const BROWSER_RENDERABLE = new Set(["jpeg", "png", "webp", "gif", "avif"]);

const EXT_BY_CONTENT_TYPE: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/heic": ".heic",
  "image/heif": ".heif",
  "image/gif": ".gif",
  "image/avif": ".avif",
};

function originalExtension(file: { filename: string; contentType: string }): string {
  const byType = EXT_BY_CONTENT_TYPE[file.contentType?.toLowerCase() ?? ""];
  if (byType) return byType;
  const dot = file.filename.lastIndexOf(".");
  if (dot >= 0 && dot < file.filename.length - 1) {
    return file.filename.slice(dot).toLowerCase();
  }
  return ".bin";
}

export async function processUpload(
  file: { buffer: Buffer; filename: string; contentType: string },
  opts: { tripId: string; stopId: string },
): Promise<{
  webKey: string;
  thumbKey: string;
  originalKey: string;
  width: number;
  height: number;
}> {
  const uid = randomUUID();
  const prefix = `trips/${opts.tripId}/${opts.stopId}/${uid}`;

  // Read metadata only (no re-encode of the original). Compute upright dimensions
  // by honouring the EXIF orientation tag (5–8 mean the axes are swapped).
  let format: string | undefined;
  let width = 0;
  let height = 0;
  try {
    const meta = await sharp(file.buffer, { failOn: "error" }).metadata();
    format = meta.format;
    const swapped = (meta.orientation ?? 0) >= 5;
    width = (swapped ? meta.height : meta.width) ?? 0;
    height = (swapped ? meta.width : meta.height) ?? 0;
  } catch (err) {
    // Unsupported/corrupt image — the API maps this to a 400.
    throw new Error(
      `Unsupported or corrupt image "${file.filename}": ${(err as Error).message}`,
    );
  }

  const originalKey = `${prefix}/original${originalExtension(file)}`;

  // Always keep the untouched original. A storage failure throws → the API maps
  // it to a 500 and the Stop row is preserved (the photo can be retried).
  await storage.save({
    data: file.buffer,
    key: originalKey,
    contentType: file.contentType || "application/octet-stream",
  });

  // Displayed object: the original itself when the browser can render it,
  // otherwise a full-resolution (NOT downscaled) upright JPEG fallback.
  let displayKey = originalKey;
  if (!BROWSER_RENDERABLE.has(format ?? "")) {
    let full: Buffer;
    try {
      full = await sharp(file.buffer, { failOn: "error" })
        .rotate() // apply EXIF orientation, then strip it
        .jpeg({ quality: 92, mozjpeg: true })
        .toBuffer();
    } catch (err) {
      throw new Error(
        `Could not render image "${file.filename}": ${(err as Error).message}`,
      );
    }
    displayKey = `${prefix}/full.jpg`;
    await storage.save({ data: full, key: displayKey, contentType: "image/jpeg" });
  }

  // web/thumb both point at the displayed (full-resolution) object.
  return {
    webKey: displayKey,
    thumbKey: displayKey,
    originalKey,
    width,
    height,
  };
}
