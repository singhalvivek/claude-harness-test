// Phase-1 storage backend: writes photo bytes to local disk under
// PHOTO_STORAGE_DIR and serves them via the /api/media/[...key] route.
// Uploads deliberately do NOT live under public/ so the R2 URL indirection holds.
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";
import type { PhotoStorage, SavedObject } from "./types";

export class LocalDiskStorage implements PhotoStorage {
  private readonly baseDir: string;

  constructor(baseDir: string = env.PHOTO_STORAGE_DIR) {
    this.baseDir = baseDir;
  }

  async save(input: { data: Buffer; key: string; contentType: string }): Promise<SavedObject> {
    const filePath = path.join(this.baseDir, input.key);
    // Create parent directories as needed (mkdir -p).
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, input.data);
    return { key: input.key, url: this.url(input.key) };
  }

  async delete(key: string): Promise<void> {
    const filePath = path.join(this.baseDir, key);
    try {
      await unlink(filePath);
    } catch (err) {
      // A missing file is not an error for delete — treat ENOENT as success.
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }

  url(key: string): string {
    return `/api/media/${key}`;
  }
}
