// Typed fetch wrappers for every route in spec/api.md, plus the shared response
// types the frontend slices import. Called from the browser only — all URLs are
// relative (same-origin) so the session cookie rides along automatically.
//
// Every wrapper parses JSON and throws an `ApiError` ({ status, error }) on any
// non-2xx response. Response shapes mirror api.md's documented JSON exactly.

// ─── Shared types (mirror spec/api.md + spec/data.md) ────────────────────────

export type LocationPrecision = "exact" | "approximate" | "none";

// Per-trip story look (see spec/capabilities/story-themes.md). Default "cinematic".
export type StoryTheme = "cinematic" | "editorial" | "minimal" | "vintage";

export interface Tag {
  id: string;
  label: string;
  kind: "mood" | "activity";
}

export interface Photo {
  id: string;
  order: number;
  isCover: boolean;
  webUrl: string;
  thumbUrl: string;
  width: number;
  height: number;
  caption: string | null;
}

export interface Stop {
  id: string;
  order: number;
  title: string | null;
  placeName: string | null;
  lat: number | null;
  lng: number | null;
  locationPrecision: LocationPrecision;
  occurredAt: string | null; // ISO 8601
  body: string | null;
  tags: Tag[]; // always [] in Phase 1
  photos: Photo[];
}

export interface Trip {
  id: string;
  title: string;
  description: string | null;
  theme: StoryTheme;
  isPublished: boolean;
  shareSlug: string | null;
  stops: Stop[];
}

export interface TripSummary {
  id: string;
  title: string;
  description: string | null;
  coverThumbUrl: string | null;
  stopCount: number;
  isPublished: boolean;
  updatedAt: string; // ISO 8601
  theme: StoryTheme;
}

export interface GeocodeCandidate {
  displayName: string;
  lat: number;
  lng: number;
  type: string;
  importance: number;
}

export interface SessionState {
  owner: boolean;
  usingDevDefaults: boolean;
}

// ─── Request/patch input shapes ──────────────────────────────────────────────

export interface CreateTripInput {
  title: string;
  description?: string;
  theme?: StoryTheme;
}

export interface TripPatch {
  title?: string;
  description?: string;
  coverPhotoId?: string | null;
  theme?: StoryTheme;
}

export interface StopInput {
  title?: string | null;
  placeName?: string | null;
  lat?: number | null;
  lng?: number | null;
  locationPrecision?: LocationPrecision;
  occurredAt?: string | null; // ISO 8601
  body?: string;
}

export type StopPatch = StopInput;

export interface PhotoPatch {
  caption?: string;
}

// ─── Error type ──────────────────────────────────────────────────────────────

export class ApiError extends Error {
  readonly status: number;
  readonly error: string;

  constructor(status: number, error: string) {
    super(error);
    this.name = "ApiError";
    this.status = status;
    this.error = error;
  }
}

// ─── Core request helper ─────────────────────────────────────────────────────

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "same-origin",
    ...init,
  });

  if (!res.ok) {
    let message = res.statusText || `Request failed with status ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body && typeof body.error === "string") message = body.error;
    } catch {
      // Non-JSON error body — keep the status-text fallback.
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return undefined as T;
  }
  return (await res.json()) as T;
}

function jsonInit(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export function login(password: string): Promise<{ ok: true }> {
  return request<{ ok: true }>("/api/auth/login", jsonInit("POST", { password }));
}

export function logout(): Promise<{ ok: true }> {
  return request<{ ok: true }>("/api/auth/logout", { method: "POST" });
}

export function getSession(): Promise<SessionState> {
  return request<SessionState>("/api/auth/session");
}

// ─── Trips ───────────────────────────────────────────────────────────────────

export async function listTrips(): Promise<TripSummary[]> {
  const data = await request<{ trips: TripSummary[] }>("/api/trips");
  return data.trips;
}

export function createTrip(input: CreateTripInput): Promise<Trip> {
  return request<Trip>("/api/trips", jsonInit("POST", input));
}

export function getTrip(id: string): Promise<Trip> {
  return request<Trip>(`/api/trips/${encodeURIComponent(id)}`);
}

export function updateTrip(id: string, patch: TripPatch): Promise<Trip> {
  return request<Trip>(`/api/trips/${encodeURIComponent(id)}`, jsonInit("PATCH", patch));
}

export function deleteTrip(id: string): Promise<void> {
  return request<void>(`/api/trips/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// ─── Stops ───────────────────────────────────────────────────────────────────

export function addStop(tripId: string, input: StopInput): Promise<Stop> {
  return request<Stop>(
    `/api/trips/${encodeURIComponent(tripId)}/stops`,
    jsonInit("POST", input),
  );
}

export function updateStop(stopId: string, patch: StopPatch): Promise<Stop> {
  return request<Stop>(`/api/stops/${encodeURIComponent(stopId)}`, jsonInit("PATCH", patch));
}

export function deleteStop(stopId: string): Promise<void> {
  return request<void>(`/api/stops/${encodeURIComponent(stopId)}`, { method: "DELETE" });
}

export function reorderStops(tripId: string, orderedStopIds: string[]): Promise<{ ok: true }> {
  return request<{ ok: true }>(
    `/api/trips/${encodeURIComponent(tripId)}/stops/reorder`,
    jsonInit("POST", { orderedStopIds }),
  );
}

// ─── Photos ──────────────────────────────────────────────────────────────────

export async function uploadPhotos(stopId: string, files: File[]): Promise<Photo[]> {
  const form = new FormData();
  for (const file of files) {
    form.append("files", file);
  }
  const data = await request<{ photos: Photo[] }>(
    `/api/stops/${encodeURIComponent(stopId)}/photos`,
    { method: "POST", body: form },
  );
  return data.photos;
}

export function updatePhoto(photoId: string, patch: PhotoPatch): Promise<Photo> {
  return request<Photo>(`/api/photos/${encodeURIComponent(photoId)}`, jsonInit("PATCH", patch));
}

export function reorderPhotos(stopId: string, orderedPhotoIds: string[]): Promise<{ ok: true }> {
  return request<{ ok: true }>(
    `/api/stops/${encodeURIComponent(stopId)}/photos/reorder`,
    jsonInit("POST", { orderedPhotoIds }),
  );
}

export function setCover(photoId: string): Promise<{ ok: true }> {
  return request<{ ok: true }>(`/api/photos/${encodeURIComponent(photoId)}/cover`, {
    method: "POST",
  });
}

export function deletePhoto(photoId: string): Promise<void> {
  return request<void>(`/api/photos/${encodeURIComponent(photoId)}`, { method: "DELETE" });
}

// ─── Geocode ─────────────────────────────────────────────────────────────────

export async function geocode(q: string): Promise<GeocodeCandidate[]> {
  const data = await request<{ candidates: GeocodeCandidate[] }>(
    `/api/geocode?q=${encodeURIComponent(q)}`,
  );
  return data.candidates;
}

export function reverseGeocode(lat: number, lng: number): Promise<{ displayName: string | null }> {
  return request<{ displayName: string | null }>(
    `/api/geocode/reverse?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`,
  );
}
