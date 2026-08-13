// The photo storage swap seam. Every photo byte flows through this interface, so
// swapping local disk (P1) for R2/S3 (P3) touches no call site — only the backend
// selection in `index.ts`. The DB stores opaque `key`s; URLs are resolved here.

export interface SavedObject {
  key: string;
  url: string;
}

export interface PhotoStorage {
  save(input: { data: Buffer; key: string; contentType: string }): Promise<SavedObject>;
  delete(key: string): Promise<void>;
  url(key: string): string; // resolve a public URL from an opaque key
}
