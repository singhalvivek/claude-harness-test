// Owner authentication helpers.
//
// - `verifyPassword` compares the submitted password to `env.OWNER_PASSWORD`
//   with a length-independent constant-time-ish comparison (never early-exit,
//   never leak length via timing).
// - `requireOwner` reads + verifies the `session` cookie (HMAC via session.ts)
//   for defense-in-depth on every owner route, even though middleware also gates.
// - `sessionCookie` / `clearCookie` return cookie descriptors for
//   `NextResponse.cookies.set(...)`.
//
// Runs in the Node.js runtime (route handlers). Only Web-standard APIs are used
// (TextEncoder, no Node `crypto`), so nothing here is runtime-specific.

import { env } from "@/lib/env";
import { verifySession } from "@/lib/session";

export const SESSION_COOKIE_NAME = "session";

/** Length-safe, constant-time-ish string comparison. */
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  // Fold the length difference into the accumulator so a length mismatch can
  // never short-circuit, then compare every byte up to the longer length.
  let diff = ab.length ^ bb.length;
  const len = Math.max(ab.length, bb.length);
  for (let i = 0; i < len; i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

/** True iff `input` equals the configured owner password. */
export function verifyPassword(input: string): boolean {
  if (typeof input !== "string" || input.length === 0) return false;
  return timingSafeEqual(input, env.OWNER_PASSWORD);
}

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    if (key === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return undefined;
}

/** True iff the request carries a valid owner session cookie. */
export async function requireOwner(req: Request): Promise<boolean> {
  const token = readCookie(req, SESSION_COOKIE_NAME);
  if (!token) return false;
  const payload = await verifySession(token);
  return payload !== null && payload.owner === true;
}

const secure = process.env.NODE_ENV === "production";

/** Cookie descriptor that persists a freshly-signed session token. */
export function sessionCookie(token: string) {
  return {
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure,
  };
}

/** Cookie descriptor that clears the session on logout. */
export function clearCookie() {
  return {
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure,
    maxAge: 0,
  };
}
