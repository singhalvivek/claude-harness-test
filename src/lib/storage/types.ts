// The photo storage swap seam. Every photo byte flows through this interface, so
// swapping local disk for R2/S3 touches no call site — only the backend selection
// in `index.ts`. The DB stores opaque `key`s; URLs are resolved here.

export interface SavedObject {
  key: string;
  url: string;
}

/** A short-lived target the browser can PUT a file to directly (bypasses the
 *  serverless request-body limit). For R2 it's a presigned R2 URL; for local
 *  disk it's a same-origin owner-gated receiver route. */
export interface PresignedUpload {
  url: string;
  method: "PUT";
}

export interface PhotoStorage {
  save(input: { data: Buffer; key: string; contentType: string }): Promise<SavedObject>;
  delete(key: string): Promise<void>;
  url(key: string): string; // resolve a public URL from an opaque key
  /** Presign a direct browser upload of `key`. */
  presignUpload(input: { key: string; contentType: string }): Promise<PresignedUpload>;
}
