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

// Per-stop decorative motif — the frozen enum, in canonical picker order.
// Rendered as an animated ornament on the serpentine + a card accent, theme-colored.
// See spec/capabilities/story-decor.md. Default "none".
export const MOTIF_IDS = [
  "none",
  "flower",
  "mountain",
  "tree",
  "train",
  "plane",
  "boat",
  "car",
  "tent",
  "camera",
  "star",
  "compass",
  "sun",
  "heart",
] as const;

export type StopMotif = (typeof MOTIF_IDS)[number];

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
  motif: StopMotif; // decorative motif; "none" by default
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
  motif?: StopMotif; // omitted → DB default "none"
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

interface PresignResponse {
  key: string;
  uploadUrl: string;
  method: "PUT";
}

/** Read an image's pixel dimensions in the browser (0×0 if it can't decode,
 *  e.g. HEIC). Only drives layout aspect, never correctness. */
function readImageSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !file.type.startsWith("image/")) {
      resolve({ width: 0, height: 0 });
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve({ width: 0, height: 0 });
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

/**
 * Upload ONE photo DIRECTLY to storage (R2, or the local receiver in dev),
 * bypassing the serverless request-body size limit so full-resolution originals
 * of any size work: presign → PUT the bytes straight to storage → complete
 * (create the Photo row). Returns the created Photo.
 */
export async function uploadPhotoDirect(stopId: string, file: File): Promise<Photo> {
  const contentType = file.type || "application/octet-stream";
  const { width, height } = await readImageSize(file);

  const presign = await request<PresignResponse>(
    `/api/stops/${encodeURIComponent(stopId)}/photos/presign`,
    jsonInit("POST", { filename: file.name, contentType }),
  );

  // PUT the bytes directly to storage. Same-origin (local) sends the session
  // cookie by default; the cross-origin R2 presigned URL needs no cookies.
  const put = await fetch(presign.uploadUrl, {
    method: presign.method,
    body: file,
    headers: { "Content-Type": contentType },
  });
  if (!put.ok) {
    throw new ApiError(put.status, `Upload failed with status ${put.status}`);
  }

  return request<Photo>(
    `/api/stops/${encodeURIComponent(stopId)}/photos/complete`,
    jsonInit("POST", { key: presign.key, width, height }),
  );
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

// ─── Tags (Phase 2) ──────────────────────────────────────────────────────────

/** All tags in the workspace, ordered by label. */
export async function listTags(): Promise<Tag[]> {
  const data = await request<{ tags: Tag[] }>("/api/tags");
  return data.tags;
}

/** Create-or-find a tag by its unique label; a reused label returns the same row. */
export async function createTag(label: string, kind: "mood" | "activity"): Promise<Tag> {
  const data = await request<{ tag: Tag }>("/api/tags", jsonInit("POST", { label, kind }));
  return data.tag;
}

/**
 * Attach a tag to a stop — either an existing `tagId` or a `{ label, kind }` to
 * create-or-find. Idempotent. Resolves to the stop's tags after the change.
 */
export async function addStopTag(
  stopId: string,
  input: { tagId?: string; label?: string; kind?: "mood" | "activity" },
): Promise<Tag[]> {
  const data = await request<{ tags: Tag[] }>(
    `/api/stops/${encodeURIComponent(stopId)}/tags`,
    jsonInit("POST", input),
  );
  return data.tags;
}

/** Detach a tag from a stop (idempotent). Resolves to the stop's remaining tags. */
export async function removeStopTag(stopId: string, tagId: string): Promise<Tag[]> {
  const data = await request<{ tags: Tag[] }>(
    `/api/stops/${encodeURIComponent(stopId)}/tags/${encodeURIComponent(tagId)}`,
    { method: "DELETE" },
  );
  return data.tags;
}

// ─── Publish / Public read (Phase 2) ─────────────────────────────────────────

/** Publish a trip; returns the public share URL. */
export async function publishTrip(tripId: string): Promise<{ shareUrl: string }> {
  return request<{ shareUrl: string }>(
    `/api/trips/${encodeURIComponent(tripId)}/publish`,
    { method: "POST" },
  );
}

/** Unpublish a trip, revoking its public share link. */
export async function unpublishTrip(tripId: string): Promise<void> {
  await request<{ ok: true }>(
    `/api/trips/${encodeURIComponent(tripId)}/unpublish`,
    { method: "POST" },
  );
}

/** Read a published trip by its share slug (404 if unknown/unpublished). */
export function getPublicTrip(slug: string): Promise<Trip> {
  return request<Trip>(`/api/public/trips/${encodeURIComponent(slug)}`);
}
