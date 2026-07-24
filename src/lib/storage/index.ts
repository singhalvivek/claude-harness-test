// Backend selection for the PhotoStorage seam. Call sites import only `storage`;
// flipping env.PHOTO_STORAGE_BACKEND swaps the implementation with no call-site
// changes. Phase 1 is always LocalDiskStorage; Phase 3 adds R2Storage here.
import { env } from "@/lib/env";
import { log } from "@/lib/logger";
import { LocalDiskStorage } from "./local";
import type { PhotoStorage } from "./types";

function createStorage(): PhotoStorage {
  if (env.PHOTO_STORAGE_BACKEND === "r2") {
    // Phase-3 seam: `R2Storage` lands in slice-cloud-storage and is wired here:
    //   return new R2Storage();
    // Until then, boot on local disk (the app must always start) with a warning.
    log.warn("PHOTO_STORAGE_BACKEND=\"r2\" is not available until Phase 3; using local disk", {
      backend: env.PHOTO_STORAGE_BACKEND,
    });
    return new LocalDiskStorage();
  }
  return new LocalDiskStorage();
}

export const storage: PhotoStorage = createStorage();

export type { PhotoStorage, SavedObject } from "./types";
