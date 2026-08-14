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

// ─── Media (Phase 2.5) ───────────────────────────────────────────────────────
// The DOMAIN concept is "media" — a photo OR a video. The DB table and the API
// response type both keep the name `Photo` (no rename, no parallel Video model);
// a single discriminator `kind` splits them. See spec/capabilities/video-media.md.

/** Media discriminator. Every pre-2.5 row backfills to "photo". */
export type MediaKind = "photo" | "video";

/**
 * Accepted video content types (MIME parameters stripped before matching, so
 * `video/mp4;codecs=avc1.42E01E` matches `video/mp4`). `video/quicktime` is the
 * common iPhone `.mov` case. Typed `readonly string[]` on purpose: server routes
 * test arbitrary request strings against it with `.includes(mime)`.
 */
export const VIDEO_MIME_TYPES: readonly string[] = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
];

/** Filename extensions used when `File.type` is empty (some OS/browser combos
 *  report no MIME for `.mov`). Kept in lockstep with VIDEO_MIME_TYPES. */
const VIDEO_EXTENSIONS: readonly string[] = ["mp4", "mov", "webm", "m4v"];

/** Fallback MIME for an extension, used only when `File.type` is empty. */
const VIDEO_MIME_BY_EXTENSION: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
};

export interface Photo {
  id: string;
  order: number;
  isCover: boolean;
  /** "photo" for every pre-existing row; "video" for a video (Phase 2.5). */
  kind: MediaKind;
  /** Always the playable/displayable object (the video itself for kind:"video"). */
  webUrl: string;
  /** The POSTER for a video that has one, else the object itself. Consumers must
   *  branch on `kind` before putting this in an <img> (thumbUrl safety rule). */
  thumbUrl: string;
  /** Video only: the client-captured poster frame. Null for photos. */
  posterUrl: string | null;
  /** Video only: duration in seconds, read in the browser. Null for photos. */
  durationSec: number | null;
  width: number;
  height: number;
  caption: string | null;
}

/** Domain alias — the DB table and response type stay named `Photo`. */
export type Media = Photo;

// ─── Feeling (Phase 2.5) ─────────────────────────────────────────────────────

/** How a stop's feeling renders on the path:
 *  - `before` — its own beat standing BEFORE the stop it belongs to (so the
 *    first stop's feeling opens the story, ahead of any stop card);
 *  - `card`   — its own beat AFTER the stop (the default, and the original
 *    Phase-2.5 meaning — unchanged so existing rows keep rendering as-is);
 *  - `inline` — a pull-quote inside the stop card;
 *  - `none`   — kept in the DB but not rendered. */
export type FeelingPlacement = "before" | "card" | "inline" | "none";

/** The single source of truth for the placement values, shared by the zod
 *  enums in every route so a new value can never be accepted by one endpoint
 *  and rejected by another. */
export const FEELING_PLACEMENTS = ["before", "card", "inline", "none"] as const;

/** Maximum length of a stop's feeling line (zod-validated server-side; longer → 400). */
export const MAX_FEELING_CHARS = 200;

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
  /** One short line of how this stop felt (≤ MAX_FEELING_CHARS). Blank → null. */
  feeling: string | null;
  feelingPlacement: FeelingPlacement; // "card" by default
  tags: Tag[]; // always [] in Phase 1
  photos: Photo[];
}

export interface Trip {
  id: string;
  title: string;
  description: string | null;
  theme: StoryTheme;
  /** Phase 2.6 — an epigraph for the whole journey (≤ MAX_FEELING_CHARS),
   *  rendered as the FIRST beat on the path, before any stop. Blank → null. */
  feeling: string | null;
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
  /** Phase 2.6 — omitted means "leave untouched" (non-destructive PATCH).
   *  Blank/whitespace normalises to null server-side. */
  feeling?: string | null;
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
  /** Phase 2.5 — omitted means "leave untouched" (non-destructive PATCH).
   *  Blank/whitespace normalises to null server-side. */
  feeling?: string | null;
  feelingPlacement?: FeelingPlacement;
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

interface PresignTarget {
  key: string;
  uploadUrl: string;
  method: "PUT";
}

interface PresignResponse extends PresignTarget {
  /** Phase 2.5 — the second target for a video's poster JPEG, under the SAME
   *  `<uuid>` prefix. Null for photos and for a video request that asked for no
   *  poster (capture failed). */
  poster?: PresignTarget | null;
}

/** `video/mp4;codecs=avc1.42E01E` → `video/mp4`. */
function baseMime(contentType: string): string {
  return (contentType || "").split(";")[0]!.trim().toLowerCase();
}

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : "";
}

/**
 * True when `file` is one of the accepted video types. The MIME decides (with
 * parameters stripped); when `File.type` is empty or the generic
 * `application/octet-stream`, the `.mp4`/`.m4v`/`.mov`/`.webm` extension decides.
 */
export function isVideoFile(file: File): boolean {
  const mime = baseMime(file.type);
  if (VIDEO_MIME_TYPES.includes(mime)) return true;
  if (mime && mime !== "application/octet-stream") return false;
  return VIDEO_EXTENSIONS.includes(extensionOf(file.name));
}

/** The content type to declare for `file` — its own MIME, or one derived from a
 *  video extension when the browser reported none. */
function contentTypeFor(file: File): string {
  const mime = baseMime(file.type);
  if (mime && mime !== "application/octet-stream") return mime;
  const byExt = VIDEO_MIME_BY_EXTENSION[extensionOf(file.name)];
  return byExt ?? file.type ?? "application/octet-stream";
}

export interface VideoMetadata {
  width: number;
  height: number;
  durationSec: number | null;
  poster: Blob | null;
}

const VIDEO_METADATA_TIMEOUT_MS = 8_000;

/**
 * Browser-only. Reads intrinsic size + duration from an off-DOM `<video>` and
 * captures a poster JPEG via `canvas.toBlob()`. NEVER server-side — no ffmpeg
 * exists (and never will); this is the ONLY source of a video's width/height/
 * duration/poster.
 *
 * Resolves `{ width: 0, height: 0, durationSec: null, poster: null }` on decode
 * failure or after an 8 s timeout, and always revokes its object URL. If the
 * metadata was read but only the POSTER capture failed (seek error, tainted
 * canvas, `toBlob` → null), the real width/height/duration are returned with
 * `poster: null` — the video still uploads and the UI shows its labelled
 * no-poster placeholder. Never rejects.
 */
export function readVideoMetadata(file: File): Promise<VideoMetadata> {
  const empty: VideoMetadata = { width: 0, height: 0, durationSec: null, poster: null };

  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.resolve(empty);
  }

  return new Promise<VideoMetadata>((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Updated as soon as loadedmetadata fires, so a later failure still returns
    // what we legitimately know.
    let known: VideoMetadata = { ...empty };

    const settle = (result: VideoMetadata) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      video.removeAttribute("src");
      try {
        video.load();
      } catch {
        // Best-effort teardown only.
      }
      URL.revokeObjectURL(url);
      resolve(result);
    };

    timer = setTimeout(() => settle(known), VIDEO_METADATA_TIMEOUT_MS);

    video.onerror = () => settle(known);

    video.onloadedmetadata = () => {
      const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null;
      known = {
        width: video.videoWidth || 0,
        height: video.videoHeight || 0,
        durationSec: duration,
        poster: null,
      };

      if (known.width === 0 || known.height === 0) {
        settle(known);
        return;
      }

      video.onseeked = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = known.width;
          canvas.height = known.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            settle(known);
            return;
          }
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(
            (blob) => settle({ ...known, poster: blob ?? null }),
            "image/jpeg",
            0.82,
          );
        } catch {
          settle(known); // e.g. a tainted canvas — keep the metadata, drop the poster.
        }
      };

      try {
        video.currentTime = duration ? Math.min(0.1, duration / 2) : 0.1;
      } catch {
        settle(known);
      }
    };

    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";
    video.src = url;
  });
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

/** Progress stages reported by `uploadMediaDirect`, in order. "poster" only
 *  happens for a video whose poster frame was captured. */
export type UploadStage = "reading" | "uploading" | "poster" | "finishing";

/**
 * Upload ONE media item (photo OR video) DIRECTLY to storage (R2, or the local
 * receiver in dev), bypassing the serverless request-body size limit so
 * full-resolution originals of any size work:
 *
 *   presign (video → also a poster target) → PUT bytes → PUT poster → complete.
 *
 * The poster is uploaded BEFORE `complete`, so a registered `posterKey` always
 * points at bytes that exist. A failed poster PUT still completes the video,
 * without a `posterKey` (the UI degrades to its labelled placeholder). A failed
 * media PUT throws and creates no row.
 */
export async function uploadMediaDirect(
  stopId: string,
  file: File,
  onStage?: (stage: UploadStage) => void,
): Promise<Media> {
  const contentType = contentTypeFor(file);
  const isVideo = isVideoFile(file);

  // ── reading: intrinsic size (+ duration and poster frame for a video) ──
  onStage?.("reading");
  let width = 0;
  let height = 0;
  let durationSec: number | null = null;
  let poster: Blob | null = null;

  if (isVideo) {
    const meta = await readVideoMetadata(file);
    width = meta.width;
    height = meta.height;
    durationSec = meta.durationSec;
    poster = meta.poster;
  } else {
    const size = await readImageSize(file);
    width = size.width;
    height = size.height;
  }

  const presign = await request<PresignResponse>(
    `/api/stops/${encodeURIComponent(stopId)}/photos/presign`,
    jsonInit("POST", {
      filename: file.name,
      contentType,
      ...(isVideo ? { kind: "video" as MediaKind } : {}),
      // Only ask for a poster target when we actually captured one.
      ...(isVideo && poster ? { posterContentType: "image/jpeg" } : {}),
    }),
  );

  // ── uploading: PUT the bytes directly to storage. Same-origin (local) sends
  // the session cookie by default; the cross-origin R2 presigned URL needs none.
  onStage?.("uploading");
  const put = await fetch(presign.uploadUrl, {
    method: presign.method,
    body: file,
    headers: { "Content-Type": contentType },
  });
  if (!put.ok) {
    throw new ApiError(put.status, `Upload failed with status ${put.status}`);
  }

  // ── poster: best-effort. A failure here must never lose the video. ──
  let posterKey: string | null = null;
  const posterTarget = presign.poster ?? null;
  if (isVideo && poster && posterTarget) {
    onStage?.("poster");
    try {
      const posterPut = await fetch(posterTarget.uploadUrl, {
        method: posterTarget.method,
        body: poster,
        headers: { "Content-Type": "image/jpeg" },
      });
      if (posterPut.ok) posterKey = posterTarget.key;
    } catch {
      posterKey = null; // continue without a poster
    }
  }

  // ── finishing: create the media row ──
  onStage?.("finishing");
  return request<Media>(
    `/api/stops/${encodeURIComponent(stopId)}/photos/complete`,
    jsonInit("POST", {
      key: presign.key,
      width,
      height,
      ...(isVideo
        ? { kind: "video" as MediaKind, posterKey, durationSec }
        : {}),
    }),
  );
}

/** Kept as a thin alias of `uploadMediaDirect` so no existing call site breaks. */
export function uploadPhotoDirect(stopId: string, file: File): Promise<Photo> {
  return uploadMediaDirect(stopId, file);
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
