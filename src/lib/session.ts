// HMAC-signed owner session token.
//
// CRITICAL: this module is imported by `src/middleware.ts`, which runs on the
// Next.js EDGE runtime where Node's `crypto` module is unavailable. Sign/verify
// are therefore implemented with the Web Crypto API (`crypto.subtle`,
// HMAC-SHA256), which is present in BOTH the Edge runtime and the Node.js
// runtime — so the same code path works in middleware and in route handlers.
//
// Token format: `${base64url(payloadJson)}.${base64url(hmacSig)}`.
// The payload is the owner-session marker plus an `issuedAt` timestamp.

import { env } from "@/lib/env";

export interface SessionPayload {
  /** Owner-session marker — always true for a valid session. */
  owner: true;
  /** Milliseconds since epoch when the session was issued. */
  issuedAt: number;
}

// --- base64url helpers (Edge-safe: use btoa/atob, no Buffer) ---

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(input: string): Uint8Array {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + "=".repeat(padLen);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// TS 5.7's lib.dom parameterizes Uint8Array by its backing buffer; arrays that
// carry the default `ArrayBufferLike` are not assignable to `BufferSource`.
// This adapter keeps the Web Crypto calls portable across TS lib versions.
const asBufferSource = (u: Uint8Array): BufferSource =>
  u as unknown as BufferSource;

async function importKey(): Promise<CryptoKey> {
  const secret = new TextEncoder().encode(env.SESSION_SECRET);
  return crypto.subtle.importKey(
    "raw",
    asBufferSource(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/**
 * Sign an owner-session payload into an opaque token.
 * `issuedAt` is stamped automatically; callers may pass a partial payload but
 * only the owner marker is meaningful in Phase 1.
 */
export async function signSession(
  payload: Partial<SessionPayload> = {},
): Promise<string> {
  const body: SessionPayload = {
    owner: true,
    issuedAt: Date.now(),
    ...payload,
  };
  const payloadBytes = new TextEncoder().encode(JSON.stringify(body));
  const key = await importKey();
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, asBufferSource(payloadBytes)),
  );
  return `${bytesToBase64Url(payloadBytes)}.${bytesToBase64Url(signature)}`;
}

/**
 * Verify a session token. Returns the payload on success, or `null` on any
 * tamper / malformed input / signature mismatch. The signature comparison is
 * delegated to `crypto.subtle.verify`, which is constant-time.
 */
export async function verifySession(
  token: string | null | undefined,
): Promise<SessionPayload | null> {
  if (!token || typeof token !== "string") return null;

  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;

  const payloadB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);

  let payloadBytes: Uint8Array;
  let signature: Uint8Array;
  try {
    payloadBytes = base64UrlToBytes(payloadB64);
    signature = base64UrlToBytes(sigB64);
  } catch {
    return null;
  }

  let valid: boolean;
  try {
    const key = await importKey();
    valid = await crypto.subtle.verify(
      "HMAC",
      key,
      asBufferSource(signature),
      asBufferSource(payloadBytes),
    );
  } catch {
    return null;
  }
  if (!valid) return null;

  try {
    const parsed = JSON.parse(new TextDecoder().decode(payloadBytes)) as unknown;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      (parsed as SessionPayload).owner !== true ||
      typeof (parsed as SessionPayload).issuedAt !== "number"
    ) {
      return null;
    }
    return parsed as SessionPayload;
  } catch {
    return null;
  }
}
