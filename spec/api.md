# API

> The contract both frontend slices code against and `slice-api` implements. **REST-ish JSON** via Next.js Route Handlers under `src/app/api/**/route.ts`, plus `GET /health` at `src/app/health/route.ts`. Handlers touching Prisma/sharp/fs/crypto set `export const runtime = "nodejs"`. Request bodies validated with `zod`. Owner routes require a valid session (enforced by `src/middleware.ts` + `requireOwner()`); public routes (P2) do not.

---

## API Style

REST over JSON; multipart for photo uploads; opaque-slug public reads (P2). All responses are JSON except `/api/media/*` (binary) and `/api/trips/:tripId/export` (PDF, P3). Errors use `{ "error": string }` with the status codes below.

Conventions: 200 OK, 201 Created, 204 No Content; 400 invalid body (zod), 401 unauthenticated, 404 not found, 409 conflict (e.g. duplicate order), 500 internal, 502 upstream (Nominatim/storage) failure.

## Auth

### `POST /api/auth/login`
**Purpose:** authenticate the owner. **Request:** `{ "password": string }`. **Response 200:** `{ "ok": true }` + `Set-Cookie: session=<hmac-signed token>; HttpOnly; SameSite=Lax; Path=/` (`Secure` in production). **Errors:** 400 missing password; 401 `{ "error": "invalid password" }`.

### `POST /api/auth/logout`
**Response 200:** `{ "ok": true }` + clears the session cookie.

### `GET /api/auth/session`
**Response 200:** `{ "owner": boolean, "usingDevDefaults": boolean }` — the login page reads `usingDevDefaults` to show the dev-password warning banner.

## Trips

> **`StoryTheme`** — the per-trip story look, one of `"cinematic" | "editorial" | "minimal" | "vintage"` (default `"cinematic"`). Exported from `src/lib/api-client.ts`. Present on `Trip` and `TripSummary` responses; accepted (optional) on trip create/patch and **validated with a `zod` enum** — an unknown value returns **400** and is never persisted. Backing column: `Trip.theme` (`data.md`); render contract: [`capabilities/story-themes.md`](capabilities/story-themes.md).

### `GET /api/trips` *(owner)*
**Response 200:** `{ "trips": TripSummary[] }` where `TripSummary = { id, title, description, coverThumbUrl: string|null, stopCount: number, isPublished: boolean, updatedAt: string, theme: StoryTheme }`.

### `POST /api/trips` *(owner)*
**Request:** `{ "title": string, "description"?: string, "theme"?: StoryTheme }`. `theme` is optional and defaults to `"cinematic"` (DB default) when omitted; a supplied value is zod-enum-validated. **Response 201:** `Trip` (see full shape below, including `theme`). **Errors:** 400 empty title; 400 unknown `theme` value.

### `GET /api/trips/:tripId` *(owner)*
**Response 200:** full trip used by both editor and story:
```json
{
  "id": "…", "title": "…", "description": "…",
  "theme": "cinematic",
  "isPublished": false, "shareSlug": null,
  "stops": [
    {
      "id": "…", "order": 0, "title": "…", "placeName": "Kyoto, Japan",
      "lat": 35.01, "lng": 135.76, "locationPrecision": "exact",
      "occurredAt": "2026-05-01T09:30:00.000Z", "body": "…",
      "motif": "none",
      "feeling": "The rain smelled like cedar.",
      "feelingPlacement": "card",
      "tags": [],
      "photos": [
        { "id": "…", "order": 0, "isCover": true, "kind": "photo",
          "webUrl": "/api/media/trips/…/original.jpg",
          "thumbUrl": "/api/media/trips/…/original.jpg",
          "posterUrl": null, "durationSec": null,
          "width": 1600, "height": 1067, "caption": "…" },
        { "id": "…", "order": 1, "isCover": false, "kind": "video",
          "webUrl": "/api/media/trips/…/original.mp4",
          "thumbUrl": "/api/media/trips/…/poster.jpg",
          "posterUrl": "/api/media/trips/…/poster.jpg", "durationSec": 12.48,
          "width": 1920, "height": 1080, "caption": "…" }
      ]
    }
  ]
}
```
Stops and photos are returned **sorted by `order` ascending**. `webUrl`/`thumbUrl` are resolved via `storage.url(key)`. **Errors:** 404 unknown trip.

### `PATCH /api/trips/:tripId` *(owner)*
**Request (any subset):** `{ "title"?, "description"?, "coverPhotoId"?, "theme"? }`. `theme` is zod-enum-validated (`StoryTheme`). **Response 200:** updated `Trip` (including `theme`). Non-destructive — omitted fields are untouched. **Errors:** 400 unknown `theme` value.

### `DELETE /api/trips/:tripId` *(owner)*
Cascades stops + photos and deletes all photo files via `storage.delete`. **Response 204.**

## Stops

> **`StopMotif`** — the per-stop decorative motif, one of `"none" | "flower" | "mountain" | "tree" | "train" | "plane" | "boat" | "car" | "tent" | "camera" | "star" | "compass" | "sun" | "heart"` (default `"none"`). Exported (with `MOTIF_IDS`) from `src/lib/api-client.ts`. Returned on **every** stop (owner trip GET, public trip GET, stop create/patch); accepted (optional) on stop create/patch and **validated with a `zod` enum** — an unknown value returns **400** and is never persisted. Backing column: `Stop.motif` (`data.md`); render contract: [`capabilities/story-decor.md`](capabilities/story-decor.md).

> **`FeelingPlacement`** *(Phase 2.5)* — how a stop's feeling renders: `"card" | "inline" | "none"` (default `"card"`). Exported from `src/lib/api-client.ts`. Returned on **every** stop (owner trip GET, public trip GET, stop create/patch) together with `feeling: string | null`; accepted (optional) on stop create/patch and **validated with `zod`** — an unknown placement, or a `feeling` longer than **200 characters**, returns **400** and is never persisted. A blank/whitespace-only `feeling` is normalised to `null`. Backing columns: `Stop.feeling` / `Stop.feelingPlacement` ([`data.md`](data.md)); render contract: [`capabilities/feeling-cards.md`](capabilities/feeling-cards.md).

### `POST /api/trips/:tripId/stops` *(owner)*
**Request (all optional except implied):** `{ "title"?, "placeName"?, "lat"?, "lng"?, "locationPrecision"?: "exact"|"approximate"|"none", "occurredAt"?: ISO8601, "body"?, "motif"?: StopMotif, "feeling"?: string|null, "feelingPlacement"?: FeelingPlacement }`. Server assigns `order = max(order)+1`. `motif` defaults to `"none"` and `feelingPlacement` to `"card"` (DB defaults) when omitted; supplied values are zod-validated. **Response 201:** the created `Stop` (with empty `photos`, including `motif`, `feeling`, `feelingPlacement`). **Errors:** 400 unknown `motif`/`feelingPlacement` value; 400 `feeling` over 200 chars.

### `PATCH /api/stops/:stopId` *(owner)*
**Request (any subset of stop fields, including `motif`?: StopMotif, `feeling`?: string|null, `feelingPlacement`?: FeelingPlacement).** **Response 200:** updated `Stop` (including `motif`, `feeling`, `feelingPlacement`). Non-destructive — omitted fields are untouched, so the editor's feeling autosave and its explicit **Save stop** can never clobber each other. **Errors:** 400 unknown `motif`/`feelingPlacement` value; 400 `feeling` over 200 chars.

### `DELETE /api/stops/:stopId` *(owner)*
Cascades media (+ files, **including each video's `posterKey`**). **Response 204.**

### `POST /api/trips/:tripId/stops/reorder` *(owner)*
**Request:** `{ "orderedStopIds": string[] }` (complete list of the trip's stop IDs in the new order). Server reassigns `order` 0..n-1 in a single transaction. **Response 200:** `{ "ok": true }`. **Errors:** 400 if the set of IDs doesn't match the trip's stops.

## Photos / Media

> **`MediaKind`** *(Phase 2.5)* — `"photo" | "video"` (default `"photo"`). Exported from `src/lib/api-client.ts`, which also exports `type Media = Photo` (the domain alias; the response type keeps the name `Photo`). Every `Photo` object in **every** response gains three fields:
> ```ts
> kind: MediaKind;              // "photo" (backfilled for all existing rows) | "video"
> posterUrl: string | null;     // video only; the client-captured poster frame
> durationSec: number | null;   // video only; seconds, read in the browser
> ```
> `webUrl` always resolves the **playable/displayable** object. `thumbUrl` resolves the **poster** for a video that has one, else the object itself — see the `thumbUrl` safety rule in [`data.md`](data.md). Accepted video content types: `video/mp4`, `video/quicktime`, `video/webm` (MIME parameters stripped before matching; an empty `File.type` falls back to the `.mp4`/`.mov`/`.webm` extension). Render contract: [`capabilities/video-media.md`](capabilities/video-media.md).

### `POST /api/stops/:stopId/photos` *(owner — LEGACY multipart, images only)*
**Request:** `multipart/form-data` with one or more `files` parts (JPEG/PNG/WebP/HEIC). For each file: `processUpload` (sharp) → retain original + a displayable object → `storage.save` → `Photo` row (order = max+1; first ever media of the stop → `isCover=true`). **Response 201:** `{ "photos": Photo[] }` (resolved `webUrl`/`thumbUrl`, plus `kind:"photo"`, `posterUrl:null`, `durationSec:null`, `width`/`height`; P3 also returns EXIF suggestions). **Errors:** 400 unsupported type; **415 `{ "error": "video uploads must use the direct upload path (presign → PUT → complete)" }`** when any part is a **video** MIME/extension — the branch happens **before** `processUpload`, so `sharp` never receives video bytes and no row is created; 413 too large (default 25 MB/file); 500 processing/storage failure (the stop is preserved).
> This route is kept because the Phase-1 smokes upload through it. New uploads (photo **and** video) go through the direct path below.

### `POST /api/stops/:stopId/photos/presign` *(owner — step 1 of the direct upload)*
Mints the opaque key(s) and short-lived upload target(s). For R2 the URL is signed with **aws4fetch** (never the AWS SDK); for the local backend it is the owner-gated receiver `PUT /api/uploads/[...key]`.

**Request:**
```json
{ "filename": "clip.mov", "contentType": "video/quicktime",
  "kind": "video", "posterContentType": "image/jpeg" }
```
`kind` is optional (`MediaKind`, default `"photo"`, zod-enum-validated). `posterContentType` is honoured **only** when `kind === "video"`.

**Response 200:**
```json
{ "key":       "trips/<tripId>/<stopId>/<uuid>/original.mov",
  "uploadUrl": "https://…",
  "method":    "PUT",
  "poster":    { "key": "trips/<tripId>/<stopId>/<uuid>/poster.jpg",
                 "uploadUrl": "https://…", "method": "PUT" } }
```
`poster` is `null` for photos and for a video request that omitted `posterContentType`. The poster shares the **same `<uuid>` prefix** as its video so the `complete` prefix check and deletion both hold. **Errors:** 400 unsupported image/video type (a `kind:"video"` request whose `contentType`/extension is not one of the three accepted video types); 401; 404 unknown stop; 500 presign failure.

### `POST /api/stops/:stopId/photos/complete` *(owner — step 2 of the direct upload)*
Creates the media row after the browser has `PUT` the bytes. **Never calls `sharp`** and never reads the object.

**Request:**
```json
{ "key": "trips/<tripId>/<stopId>/<uuid>/original.mov",
  "width": 1920, "height": 1080,
  "kind": "video",
  "posterKey": "trips/<tripId>/<stopId>/<uuid>/poster.jpg",
  "durationSec": 12.48 }
```
`kind` optional (`MediaKind`, default `"photo"`). `posterKey` optional; when present it must start with the same `trips/<tripId>/<stopId>/` prefix, contain no `..`, and end in `/poster.jpg` — otherwise **400 `{"error":"invalid poster key"}`**. `durationSec` optional, finite and ≥ 0 (anything else → stored as `null`). `posterKey`/`durationSec` supplied with `kind:"photo"` are ignored. `width`/`height` are client-read and only drive layout aspect.

**Response 201:** the created `Photo`/`Media` object (`kind`, `posterUrl`, `durationSec` included). **Errors:** 400 invalid body / invalid key / unknown `kind`; 401; 404 unknown stop; 500 write failure.

### `PATCH /api/photos/:photoId` *(owner)*
**Request:** `{ "caption"? }`. **Response 200:** updated `Photo` (including `kind`/`posterUrl`/`durationSec`).

### `POST /api/stops/:stopId/photos/reorder` *(owner)*
**Request:** `{ "orderedPhotoIds": string[] }`. Transactional reassignment. **Response 200.** `kind`-agnostic — photos and videos share one ordered list.

### `POST /api/photos/:photoId/cover` *(owner)*
Sets this media item as its stop's cover; unsets the previous cover in the same transaction. **Response 200:** `{ "ok": true }`. `kind`-agnostic — **a video can be the cover.**

### `DELETE /api/photos/:photoId` *(owner)*
Removes the row and calls `storage.delete` on `webKey`/`thumbKey`/`originalKey` **and `posterKey` when non-null** (P2.5, idempotent); if it was the cover and others remain, promotes the next by order. **Response 204.**

## Geocode *(owner — proxied to protect Nominatim usage)*

### `GET /api/geocode?q=<query>` *(owner)*
Server-side proxy to Nominatim **search** with a proper `User-Agent` (`NOMINATIM_USER_AGENT`), `limit=5`, `format=jsonv2`. **Response 200:** `{ "candidates": [ { "displayName": string, "lat": number, "lng": number, "type": string, "importance": number } ] }`. **Errors:** 502 on upstream failure/timeout (client falls back to manual/text-only). Client debounces (≥ 400 ms) and only fires for queries ≥ 3 chars.

### `GET /api/geocode/reverse?lat=<lat>&lng=<lng>` *(owner)*
Reverse-geocode a map click. **Response 200:** `{ "displayName": string|null }`. Used to auto-fill a place name after a map-click/pin-drag; a null name still allows saving with precision `approximate`.

## Media

### `GET /api/media/[...key]` *(public read)*
Streams a stored media object by key (local backend: from `PHOTO_STORAGE_DIR`; sets `Content-Type` + long-lived `Cache-Control`). Keys are the opaque values stored on `Photo`. **Errors:** 404 unknown key. With the R2 backend, `storage.url` returns the R2 public URL directly and this route is bypassed.

**Phase 2.5 additions (required for video playback on the local backend):**
- The extension → `Content-Type` map gains `.mp4 → video/mp4`, `.mov → video/quicktime`, `.webm → video/webm`, `.m4v → video/x-m4v`.
- The route **honours HTTP `Range`**: it always sends `Accept-Ranges: bytes`, and for a request carrying `Range: bytes=<start>-<end>` it replies **206** with `Content-Range: bytes <start>-<end>/<size>`, the correct `Content-Length`, and a `createReadStream(filePath, { start, end })` body. An unsatisfiable range → **416** with `Content-Range: bytes */<size>`. Without seekable range support the browser cannot scrub or reliably `preload="metadata"` a video.

### `PUT /api/uploads/[...key]` *(owner — local direct-upload receiver)*
Unchanged contract; it is content-type agnostic and already accepts video bytes. Used only when `PHOTO_STORAGE_BACKEND="local"` (the R2 backend presigns straight to R2 with **aws4fetch**).

## Health

### `GET /health` *(public)*
**Response 200:** `{ "status": "ok", "db": "up" }` after a trivial `prisma.$queryRaw('SELECT 1')`. Returns 503 `{ "status": "degraded", "db": "down" }` if the DB check fails. Used by the Playwright `webServer` readiness probe and any uptime check.

## Public *(Phase 2 — stubbed in Phase 1)*

### `GET /api/public/trips/:slug` *(public read)*
Returns the same full-trip shape as `GET /api/trips/:tripId` **only if** the trip is published and the slug matches; strips owner-only fields. **404** for unknown/unpublished slugs (indistinguishable, so an unpublished trip can't be probed). In P1 this route may exist returning `404` (feature not yet live); the UI shows a "coming soon" stub for Share.

### `POST /api/trips/:tripId/publish` · `POST /api/trips/:tripId/unpublish` *(owner, Phase 2)*
Publish generates a fresh ≥ 24-char `shareSlug` and sets `isPublished=true`; unpublish clears both. **Response 200:** `{ "shareUrl": string }`.

## Export *(Phase 3)*

### `GET /api/trips/:tripId/export` *(owner)*
Renders the trip to a PDF. **Response 200:** `application/pdf` byte stream (attachment). **Errors:** 404 unknown trip; 500 render failure.

## Authentication

Owner routes require a valid HMAC-signed `session` cookie (issued by `POST /api/auth/login`, verified by `src/lib/session.ts`). `src/middleware.ts` redirects unauthenticated **page** requests under `/` and `/trips/**` to `/login` and rejects unauthenticated owner **API** writes with 401. Public/exempt routes: `/login`, `/api/auth/login`, `/health`, `/api/media/**`, and (P2) `/s/**` + `/api/public/**`. There are no API keys and no third-party auth.
