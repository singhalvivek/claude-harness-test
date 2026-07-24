// Environment configuration with safe dev defaults.
//
// The app MUST boot without secrets (see roadmap "Must boot without secrets").
// When OWNER_PASSWORD / SESSION_SECRET are unset we fall back to insecure dev
// defaults, flip `usingDevDefaults`, and warn — we never throw for missing owner
// secrets. The only fatal misconfiguration is a malformed DATABASE_URL.

export type PhotoStorageBackend = "local" | "r2";

export interface Env {
  OWNER_PASSWORD: string;
  SESSION_SECRET: string;
  DATABASE_URL: string;
  PHOTO_STORAGE_DIR: string;
  PHOTO_STORAGE_BACKEND: PhotoStorageBackend;
  NOMINATIM_USER_AGENT: string;
  usingDevDefaults: boolean;
}

const DEV_OWNER_PASSWORD = "letmein";
// Fixed, insecure dev secret — fine for local testing, never for production.
const DEV_SESSION_SECRET = "wanderline-dev-session-secret-change-me-in-production";
const DEFAULT_DATABASE_URL = "file:./dev.db";
const DEFAULT_PHOTO_STORAGE_DIR = "./storage/photos";
const DEFAULT_NOMINATIM_USER_AGENT =
  "Wanderline/0.1 (personal trip journal; contact: owner@example.com)";

function loadEnv(): Env {
  const rawOwnerPassword = process.env.OWNER_PASSWORD?.trim();
  const rawSessionSecret = process.env.SESSION_SECRET?.trim();

  // Dev defaults are in play if EITHER owner secret is missing.
  const usingDevDefaults = !rawOwnerPassword || !rawSessionSecret;
  if (usingDevDefaults) {
    console.warn(
      "[wanderline] OWNER_PASSWORD/SESSION_SECRET not set — using insecure DEV DEFAULTS " +
        `(login password is "${DEV_OWNER_PASSWORD}"). Set OWNER_PASSWORD and SESSION_SECRET ` +
        "in .env to secure a real deployment.",
    );
  }

  const OWNER_PASSWORD = rawOwnerPassword || DEV_OWNER_PASSWORD;
  const SESSION_SECRET = rawSessionSecret || DEV_SESSION_SECRET;

  const DATABASE_URL = process.env.DATABASE_URL?.trim() || DEFAULT_DATABASE_URL;
  // SQLite (the production DB here) requires a `file:` URL. This is the one fatal
  // misconfiguration — fail loud so it is caught at boot, not at first query.
  if (!DATABASE_URL.startsWith("file:")) {
    throw new Error(
      `Malformed DATABASE_URL: expected a SQLite "file:" URL, received "${DATABASE_URL}".`,
    );
  }

  const PHOTO_STORAGE_DIR =
    process.env.PHOTO_STORAGE_DIR?.trim() || DEFAULT_PHOTO_STORAGE_DIR;

  const backendRaw = (process.env.PHOTO_STORAGE_BACKEND?.trim() || "local").toLowerCase();
  const PHOTO_STORAGE_BACKEND: PhotoStorageBackend = backendRaw === "r2" ? "r2" : "local";

  const NOMINATIM_USER_AGENT =
    process.env.NOMINATIM_USER_AGENT?.trim() || DEFAULT_NOMINATIM_USER_AGENT;

  return {
    OWNER_PASSWORD,
    SESSION_SECRET,
    DATABASE_URL,
    PHOTO_STORAGE_DIR,
    PHOTO_STORAGE_BACKEND,
    NOMINATIM_USER_AGENT,
    usingDevDefaults,
  };
}

export const env: Env = loadEnv();
