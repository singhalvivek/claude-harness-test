// Cloudflare R2 storage backend (S3-compatible), selected when
// PHOTO_STORAGE_BACKEND="r2"; credentials validated at boot in env.ts.
//
// Uses aws4fetch (a tiny SigV4 signer over fetch) rather than the heavy AWS SDK,
// which keeps builds and serverless cold-starts fast. Objects are written to the
// R2 bucket and served from R2's public base URL (r2.dev or a custom domain), so
// `url(key)` returns that public URL directly and /api/media is bypassed for
// R2-backed keys. Photos are public.
import { AwsClient } from "aws4fetch";
import { env } from "@/lib/env";
import type { PhotoStorage, SavedObject } from "./types";

export class R2Storage implements PhotoStorage {
  private readonly client: AwsClient;
  private readonly endpoint: string; // https://<acct>.r2.cloudflarestorage.com/<bucket>
  private readonly publicBase: string;

  constructor() {
    this.client = new AwsClient({
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      service: "s3",
      region: "auto",
    });
    this.endpoint = `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET}`;
    this.publicBase = env.R2_PUBLIC_BASE_URL; // trailing slash already stripped in env
  }

  private objectUrl(key: string): string {
    // Encode each path segment but keep the slashes between them.
    const encoded = key.split("/").map(encodeURIComponent).join("/");
    return `${this.endpoint}/${encoded}`;
  }

  async save(input: { data: Buffer; key: string; contentType: string }): Promise<SavedObject> {
    // A zero-copy Uint8Array view is a valid fetch body at runtime; the cast works
    // around TS 5.7's generic-typed-array vs DOM BodyInit friction (Buffer/Uint8Array).
    const body = new Uint8Array(
      input.data.buffer,
      input.data.byteOffset,
      input.data.byteLength,
    ) as unknown as BodyInit;
    const res = await this.client.fetch(this.objectUrl(input.key), {
      method: "PUT",
      body,
      headers: {
        "Content-Type": input.contentType,
        "Content-Length": String(input.data.byteLength),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`R2 upload failed for "${input.key}" (${res.status}): ${detail.slice(0, 300)}`);
    }
    return { key: input.key, url: this.url(input.key) };
  }

  async delete(key: string): Promise<void> {
    const res = await this.client.fetch(this.objectUrl(key), { method: "DELETE" });
    // R2 delete is idempotent — 404/204 both mean "gone". Only fail on real errors.
    if (!res.ok && res.status !== 404) {
      const detail = await res.text().catch(() => "");
      throw new Error(`R2 delete failed for "${key}" (${res.status}): ${detail.slice(0, 300)}`);
    }
  }

  url(key: string): string {
    const encoded = key.split("/").map(encodeURIComponent).join("/");
    return `${this.publicBase}/${encoded}`;
  }
}
