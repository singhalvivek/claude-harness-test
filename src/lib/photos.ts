// Photo processing pipeline (sharp). For each upload we produce three stored
// objects under a unique, opaque key prefix:
//   web.jpg   — web-optimized derivative, long edge <= 1600px
//   thumb.jpg — thumbnail, long edge <= 400px
//   original  — the retained original bytes (untouched)
// All three are written through the storage seam. The DB stores only the keys;
// callers resolve URLs via storage.url(key).
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { storage } from "@/lib/storage";

const WEB_MAX_EDGE = 1600;
const THUMB_MAX_EDGE = 400;

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

  let web: { data: Buffer; info: sharp.OutputInfo };
  let thumb: Buffer;
  try {
    // .rotate() with no args applies the EXIF orientation then strips it, so the
    // pixel data is upright regardless of the phone's orientation tag.
    web = await sharp(file.buffer, { failOn: "error" })
      .rotate()
      .resize({
        width: WEB_MAX_EDGE,
        height: WEB_MAX_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });

    thumb = await sharp(file.buffer, { failOn: "error" })
      .rotate()
      .resize({
        width: THUMB_MAX_EDGE,
        height: THUMB_MAX_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 72, mozjpeg: true })
      .toBuffer();
  } catch (err) {
    // Unsupported/corrupt image — the API maps this to a 400.
    throw new Error(
      `Unsupported or corrupt image "${file.filename}": ${(err as Error).message}`,
    );
  }

  const webKey = `${prefix}/web.jpg`;
  const thumbKey = `${prefix}/thumb.jpg`;
  const originalKey = `${prefix}/original${originalExtension(file)}`;

  // Persist all three derivatives. A storage failure here throws → the API maps
  // it to a 500 and the Stop row is preserved (the photo can be retried).
  await storage.save({ data: web.data, key: webKey, contentType: "image/jpeg" });
  await storage.save({ data: thumb, key: thumbKey, contentType: "image/jpeg" });
  await storage.save({
    data: file.buffer,
    key: originalKey,
    contentType: file.contentType || "application/octet-stream",
  });

  return {
    webKey,
    thumbKey,
    originalKey,
    width: web.info.width,
    height: web.info.height,
  };
}
