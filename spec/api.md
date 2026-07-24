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

### `GET /api/trips` *(owner)*
**Response 200:** `{ "trips": TripSummary[] }` where `TripSummary = { id, title, description, coverThumbUrl: string|null, stopCount: number, isPublished: boolean, updatedAt: string }`.

### `POST /api/trips` *(owner)*
**Request:** `{ "title": string, "description"?: string }`. **Response 201:** `Trip` (see full shape below). **Errors:** 400 empty title.

### `GET /api/trips/:tripId` *(owner)*
**Response 200:** full trip used by both editor and story:
```json
{
  "id": "…", "title": "…", "description": "…",
  "isPublished": false, "shareSlug": null,
  "stops": [
    {
      "id": "…", "order": 0, "title": "…", "placeName": "Kyoto, Japan",
      "lat": 35.01, "lng": 135.76, "locationPrecision": "exact",
      "occurredAt": "2026-05-01T09:30:00.000Z", "body": "…",
      "tags": [],
      "photos": [
        { "id": "…", "order": 0, "isCover": true,
          "webUrl": "/api/media/trips/…/web.jpg",
          "thumbUrl": "/api/media/trips/…/thumb.jpg",
          "width": 1600, "height": 1067, "caption": "…" }
      ]
    }
  ]
}
```
Stops and photos are returned **sorted by `order` ascending**. `webUrl`/`thumbUrl` are resolved via `storage.url(key)`. **Errors:** 404 unknown trip.

### `PATCH /api/trips/:tripId` *(owner)*
**Request (any subset):** `{ "title"?, "description"?, "coverPhotoId"? }`. **Response 200:** updated `Trip`. Non-destructive — omitted fields are untouched.

### `DELETE /api/trips/:tripId` *(owner)*
Cascades stops + photos and deletes all photo files via `storage.delete`. **Response 204.**

## Stops

### `POST /api/trips/:tripId/stops` *(owner)*
**Request (all optional except implied):** `{ "title"?, "placeName"?, "lat"?, "lng"?, "locationPrecision"?: "exact"|"approximate"|"none", "occurredAt"?: ISO8601, "body"? }`. Server assigns `order = max(order)+1`. **Response 201:** the created `Stop` (with empty `photos`).

### `PATCH /api/stops/:stopId` *(owner)*
**Request (any subset of stop fields).** **Response 200:** updated `Stop`. Non-destructive.

### `DELETE /api/stops/:stopId` *(owner)*
Cascades photos (+ files). **Response 204.**

### `POST /api/trips/:tripId/stops/reorder` *(owner)*
**Request:** `{ "orderedStopIds": string[] }` (complete list of the trip's stop IDs in the new order). Server reassigns `order` 0..n-1 in a single transaction. **Response 200:** `{ "ok": true }`. **Errors:** 400 if the set of IDs doesn't match the trip's stops.

## Photos

### `POST /api/stops/:stopId/photos` *(owner)*
**Request:** `multipart/form-data` with one or more `files` parts (JPEG/PNG/WebP/HEIC accepted; large phone images expected). For each file: sharp → web + thumbnail derivatives, retain original → `storage.save` → `Photo` row (order = max+1; first ever photo of the stop → `isCover=true`). **Response 201:** `{ "photos": Photo[] }` (resolved `webUrl`/`thumbUrl`, plus `width`/`height`; P3 also returns `suggestedLat`/`suggestedLng`/`suggestedOccurredAt` from EXIF when present). **Errors:** 400 unsupported type; 413 too large (cap configurable, default 25 MB/file); 500 processing/storage failure (the stop is preserved).

### `PATCH /api/photos/:photoId` *(owner)*
**Request:** `{ "caption"? }`. **Response 200:** updated `Photo`.

### `POST /api/stops/:stopId/photos/reorder` *(owner)*
**Request:** `{ "orderedPhotoIds": string[] }`. Transactional reassignment. **Response 200.**

### `POST /api/photos/:photoId/cover` *(owner)*
Sets this photo as its stop's cover; unsets the previous cover in the same transaction. **Response 200:** `{ "ok": true }`.

### `DELETE /api/photos/:photoId` *(owner)*
Removes the row and calls `storage.delete` on all three keys; if it was the cover and others remain, promotes the next by order. **Response 204.**

## Geocode *(owner — proxied to protect Nominatim usage)*

### `GET /api/geocode?q=<query>` *(owner)*
Server-side proxy to Nominatim **search** with a proper `User-Agent` (`NOMINATIM_USER_AGENT`), `limit=5`, `format=jsonv2`. **Response 200:** `{ "candidates": [ { "displayName": string, "lat": number, "lng": number, "type": string, "importance": number } ] }`. **Errors:** 502 on upstream failure/timeout (client falls back to manual/text-only). Client debounces (≥ 400 ms) and only fires for queries ≥ 3 chars.

### `GET /api/geocode/reverse?lat=<lat>&lng=<lng>` *(owner)*
Reverse-geocode a map click. **Response 200:** `{ "displayName": string|null }`. Used to auto-fill a place name after a map-click/pin-drag; a null name still allows saving with precision `approximate`.

## Media

### `GET /api/media/[...key]` *(public read)*
Streams a stored photo derivative by key (P1: from `PHOTO_STORAGE_DIR`; sets `Content-Type` + long-lived `Cache-Control`). Keys are the opaque values stored on `Photo`. **Errors:** 404 unknown key. In P3 with R2, `storage.url` returns the R2 URL directly and this route is bypassed for R2-backed keys.

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
