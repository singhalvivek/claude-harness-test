// Server-side Nominatim (OpenStreetMap) geocoding proxy.
//
// Runs in the Node.js runtime (imported only by the /api/geocode route
// handlers). Sets the required identifying `User-Agent`, keeps volume low
// (`limit=5`) per Nominatim's usage policy, and applies a ~5s timeout. On any
// upstream failure/timeout it throws `GeocodeUpstreamError`, which the routes
// translate into a 502 so the client can fall back to manual/text-only entry.

import { env } from "@/lib/env";

export interface GeocodeCandidate {
  displayName: string;
  lat: number;
  lng: number;
  type: string;
  importance: number;
}

export class GeocodeUpstreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeocodeUpstreamError";
  }
}

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
const TIMEOUT_MS = 5000;

async function nominatimGet(path: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${NOMINATIM_BASE}${path}`, {
      headers: {
        "User-Agent": env.NOMINATIM_USER_AGENT,
        Accept: "application/json",
      },
      signal: controller.signal,
      // Never cache geocode lookups at the fetch layer.
      cache: "no-store",
    });
    if (!res.ok) {
      throw new GeocodeUpstreamError(`nominatim responded ${res.status}`);
    }
    return await res.json();
  } catch (err) {
    if (err instanceof GeocodeUpstreamError) throw err;
    const message =
      err instanceof Error ? err.message : "nominatim request failed";
    throw new GeocodeUpstreamError(message);
  } finally {
    clearTimeout(timer);
  }
}

/** Forward-geocode a free-text query into up to 5 candidates. */
export async function search(q: string): Promise<GeocodeCandidate[]> {
  const path = `/search?format=jsonv2&limit=5&q=${encodeURIComponent(q)}`;
  const data = await nominatimGet(path);
  if (!Array.isArray(data)) return [];
  return data
    .map((raw): GeocodeCandidate => {
      const item = raw as Record<string, unknown>;
      return {
        displayName: typeof item.display_name === "string" ? item.display_name : "",
        lat: Number(item.lat),
        lng: Number(item.lon),
        type: typeof item.type === "string" ? item.type : "",
        importance:
          typeof item.importance === "number"
            ? item.importance
            : Number(item.importance ?? 0) || 0,
      };
    })
    .filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng));
}

/** Reverse-geocode a coordinate pair into a display name (or null). */
export async function reverse(
  lat: number,
  lng: number,
): Promise<{ displayName: string | null }> {
  const path = `/reverse?format=jsonv2&lat=${encodeURIComponent(
    String(lat),
  )}&lon=${encodeURIComponent(String(lng))}`;
  const data = (await nominatimGet(path)) as Record<string, unknown> | null;
  const displayName =
    data && typeof data.display_name === "string" ? data.display_name : null;
  return { displayName };
}
