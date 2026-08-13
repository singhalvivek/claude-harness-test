// Backend selection for the PhotoStorage seam. Call sites import only `storage`;
// flipping env.PHOTO_STORAGE_BACKEND swaps the implementation with no call-site
// changes. "local" writes to disk (dev); "r2" writes to Cloudflare R2 (deploy).
import { env } from "@/lib/env";
import { LocalDiskStorage } from "./local";
import { R2Storage } from "./r2";
import type { PhotoStorage } from "./types";

function createStorage(): PhotoStorage {
  if (env.PHOTO_STORAGE_BACKEND === "r2") {
    // Credentials are validated at boot in env.ts, so this is safe to construct.
    return new R2Storage();
  }
  return new LocalDiskStorage();
}

export const storage: PhotoStorage = createStorage();

export type { PhotoStorage, SavedObject } from "./types";
