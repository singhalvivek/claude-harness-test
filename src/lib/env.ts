// Environment configuration with safe dev defaults.
//
// The app MUST boot without secrets (see roadmap "Must boot without secrets").
// When OWNER_PASSWORD / SESSION_SECRET are unset we fall back to insecure dev
// defaults, flip `usingDevDefaults`, and warn — we never throw for missing owner
// secrets. Fatal misconfigurations (fail loud at boot): a DATABASE_URL that is
// neither SQLite nor Postgres/libSQL, or PHOTO_STORAGE_BACKEND="r2" without the
// required R2 credentials.

export type PhotoStorageBackend = "local" | "r2";

export interface Env {
  OWNER_PASSWORD: string;
  SESSION_SECRET: string;
  DATABASE_URL: string;
  PHOTO_STORAGE_DIR: string;
  PHOTO_STORAGE_BACKEND: PhotoStorageBackend;
  NOMINATIM_USER_AGENT: string;
  // Cloudflare R2 / S3 (used only when PHOTO_STORAGE_BACKEND="r2").
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_BUCKET: string;
  R2_PUBLIC_BASE_URL: string;
  usingDevDefaults: boolean;
}

const DEV_OWNER_PASSWORD = "letmein";
// Fixed, insecure dev secret — fine for local testing, never for production.
const DEV_SESSION_SECRET = "wanderline-dev-session-secret-change-me-in-production";
const DEFAULT_DATABASE_URL = "file:./dev.db";
const DEFAULT_PHOTO_STORAGE_DIR = "./storage/photos";
const DEFAULT_NOMINATIM_USER_AGENT =
  "Wanderline/0.1 (personal trip journal; contact: owner@example.com)";

// Accepted DATABASE_URL schemes: SQLite (local/dev) and Postgres/libSQL (deploy).
const DB_URL_PREFIXES = ["file:", "postgres://", "postgresql://", "libsql://"];

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
  // Fail loud on an unusable URL at boot, not at first query.
  if (!DB_URL_PREFIXES.some((p) => DATABASE_URL.startsWith(p))) {
    throw new Error(
      `Malformed DATABASE_URL: expected one of ${DB_URL_PREFIXES.join(", ")} — received "${DATABASE_URL}".`,
    );
  }

  const PHOTO_STORAGE_DIR =
    process.env.PHOTO_STORAGE_DIR?.trim() || DEFAULT_PHOTO_STORAGE_DIR;

  const backendRaw = (process.env.PHOTO_STORAGE_BACKEND?.trim() || "local").toLowerCase();
  const PHOTO_STORAGE_BACKEND: PhotoStorageBackend = backendRaw === "r2" ? "r2" : "local";

  const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID?.trim() || "";
  const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID?.trim() || "";
  const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY?.trim() || "";
  const R2_BUCKET = process.env.R2_BUCKET?.trim() || "";
  const R2_PUBLIC_BASE_URL = (process.env.R2_PUBLIC_BASE_URL?.trim() || "").replace(/\/+$/, "");

  // When R2 is the selected backend, every credential must be present — a partial
  // config would silently drop photos. Fail loud at boot for a real deployment.
  if (PHOTO_STORAGE_BACKEND === "r2") {
    const missing = [
      ["R2_ACCOUNT_ID", R2_ACCOUNT_ID],
      ["R2_ACCESS_KEY_ID", R2_ACCESS_KEY_ID],
      ["R2_SECRET_ACCESS_KEY", R2_SECRET_ACCESS_KEY],
      ["R2_BUCKET", R2_BUCKET],
      ["R2_PUBLIC_BASE_URL", R2_PUBLIC_BASE_URL],
    ]
      .filter(([, v]) => !v)
      .map(([k]) => k);
    if (missing.length > 0) {
      throw new Error(
        `PHOTO_STORAGE_BACKEND="r2" but missing required R2 config: ${missing.join(", ")}. ` +
          "Set these in the environment or use PHOTO_STORAGE_BACKEND=\"local\".",
      );
    }
  }

  const NOMINATIM_USER_AGENT =
    process.env.NOMINATIM_USER_AGENT?.trim() || DEFAULT_NOMINATIM_USER_AGENT;

  return {
    OWNER_PASSWORD,
    SESSION_SECRET,
    DATABASE_URL,
    PHOTO_STORAGE_DIR,
    PHOTO_STORAGE_BACKEND,
    NOMINATIM_USER_AGENT,
    R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY,
    R2_BUCKET,
    R2_PUBLIC_BASE_URL,
    usingDevDefaults,
  };
}

export const env: Env = loadEnv();
