# Architecture

> Wanderline — visual trip journal. This document owns the **HOW**: the stack, the layers, the data flow, and the frozen module/route contracts every slice codes against. Product behavior lives in `roadmap.md`, `capabilities/`, `data.md`, `api.md`, `ui.md`.

---

## System Overview

Wanderline is a **single Next.js full-stack application** (App Router, TypeScript) running on port **8001**. There is **no separate backend service** and **no Python**. The browser renders owner (authoring) and reader (story) UIs; Next.js **Route Handlers** under `src/app/api/**` provide the JSON/multipart API; **Prisma** persists to a file-based **SQLite** database; uploaded photos are processed by **sharp** and written through a **storage interface** whose Phase-1 implementation is local disk. The only external network dependency is **OpenStreetMap** — Nominatim (geocoding, proxied server-side) and OSM tiles (map rendering, client-side). No LLM, no agent framework, no API keys of any kind are required to run Phase 1.

## Component Map

```
                         Browser (React 19)
   ┌───────────────────────────┬─────────────────────────────┐
   │  Owner UI (slice-editor)   │  Story UI (slice-story)      │
   │  login / home / editor     │  serpentine reading view     │
   │  Leaflet picker · uploader │  SVG draw-on-scroll · parallax│
   └─────────────┬──────────────┴───────────────┬─────────────┘
                 │  fetch (src/lib/api-client.ts) │
                 ▼                                ▼
        ┌───────────────────────────────────────────────┐
        │  Next.js Route Handlers  (src/app/api/**)      │  ← slice-api
        │  auth · trips · stops · photos · geocode       │
        │  guarded by src/middleware.ts (owner session)  │
        └───┬───────────────┬───────────────┬────────────┘
            │               │               │
            ▼               ▼               ▼
   ┌────────────────┐ ┌──────────────┐ ┌──────────────────────┐
   │ Prisma → SQLite│ │ PhotoStorage │ │ Geocode proxy        │
   │ (src/lib/db)   │ │ (local disk) │ │ → Nominatim (OSM)    │
   └────────────────┘ └──────┬───────┘ └──────────────────────┘
                             ▼
                   sharp pipeline (web + thumb + original)
                   served via /api/media/[...key]
```
All boxes except the two OSM dependencies are inside the one app. `slice-foundation` owns the persistence + storage + shell boxes; `slice-api` owns the route-handler box; `slice-editor` / `slice-story` own the two browser boxes.

## Layers

| Layer | Responsibility | Owned by |
|-------|----------------|----------|
| **UI (client)** | React components, Framer Motion animations, Leaflet map, scroll-driven SVG, forms, uploads | `slice-editor`, `slice-story` |
| **API (route handlers)** | Request parsing, auth enforcement, validation, orchestration of DB + storage + geocode | `slice-api` |
| **Domain libs** | Auth/session HMAC, geocode proxy, EXIF (P3), markdown (P3) | `slice-api` (+ P3 slices) |
| **Data + storage** | Prisma client, `PhotoStorage` interface + implementations, sharp pipeline, env validation, structured logger | `slice-foundation` |
| **Persistence** | SQLite file (`file:./dev.db`) via Prisma; photo bytes on local disk (P1) / R2 (P3) | `slice-foundation` |

## Data Flow

**Authoring a stop with a photo (owner):**
1. Trigger: owner submits the Add-Stop form in the editor.
2. Client calls `POST /api/trips/:tripId/stops` with location + date/time + body → new `Stop` row (order = max+1).
3. Client uploads files to `POST /api/stops/:stopId/photos` (multipart). For each file the handler runs the **sharp pipeline** → a web-optimized derivative + a thumbnail, retains the original → `storage.save()` returns opaque keys → a `Photo` row is created (first photo becomes cover). The response includes resolved `webUrl`/`thumbUrl` via `storage.url(key)`.
4. Location, when set via search/map-click, first hits `GET /api/geocode` (server proxy → Nominatim) to resolve coordinates + display name.
5. Output: the editor reflects the saved stop and gallery; nothing is lost (autosave-on-blur + explicit save).

**Reading a story (owner preview in P1; public in P2):**
1. Trigger: navigate to `/trips/:tripId/story` (owner) or `/s/:slug` (public, P2).
2. Server/client loads the full trip (ordered stops + ordered photos, cover flagged) via `GET /api/trips/:tripId` (or `/api/public/trips/:slug`).
3. Client lays stops along the SVG serpentine; scroll progress drives `stroke-dashoffset` (path draw), Framer Motion `whileInView` (stop enter), and translate transforms (photo parallax + traveling marker).
4. Output: the animated narrative; photo bytes stream from `/api/media/[...key]` (or R2 URL in P3).

## External Dependencies

| Dependency | Purpose | Failure Mode |
|------------|---------|--------------|
| **Nominatim** (OpenStreetMap geocoding) | Resolve place-name search + reverse-geocode a map click into coordinates + display name | Proxied server-side with a proper `User-Agent`; on error/timeout the API returns `502` and the UI surfaces "geocoding unavailable — enter location manually" and lets the owner save a **text-only** location (precision `none`) rather than guessing. |
| **OSM tile server** | Leaflet map tiles in the editor picker and (P2) the map overview | If tiles fail to load, the map container still renders and manual lat/lng entry remains available; degraded, not blocking. |
| **Local disk** (dev) / **Cloudflare R2** (deployed) | Media byte storage behind `PhotoStorage`, including direct browser uploads via presigned `PUT` | Disk-full / write error → `500` with a clear message; the `Stop` is preserved, only that media item fails and can be retried. |
| **Browser media APIs** (P2.5) — `<video>` metadata, `canvas.toBlob`, `IntersectionObserver`, `HTMLMediaElement.play()` | Read video width/height/duration, capture the poster frame, autoplay-in-view | Decode failure / 8 s timeout → no poster + zero dimensions; the upload still completes and the UI shows a labelled placeholder. Rejected `play()` (autoplay policy) → visible ▶ control. Unsupported codec → poster + "can't play in this browser" + Download. Never a broken black box. |
| **Google Fonts via `next/font/google`** (P2.5) | The four per-theme feeling display faces, self-hosted at build time by `next/font` (no runtime request to Google) | A build-time fetch failure fails `pnpm build` loudly; at runtime each `quoteStyle.fontFamily` carries a matching fallback stack, so a missing face degrades to a same-class system font. |

**Secrets / env:** documented in `.env.example`. Required for a secured deployment: `OWNER_PASSWORD`, `SESSION_SECRET`. Provided with **safe dev defaults** so the app boots without them (a visible warning shows when defaults are in use). `DATABASE_URL` defaults to `file:./dev.db`; `PHOTO_STORAGE_DIR` defaults to `./storage/photos`. `NOMINATIM_USER_AGENT` has a default identifying the app. `R2_*` vars are commented placeholders, unused until Phase 3. **No LLM/API keys exist.** The real `.env` is gitignored; only `.env.example` is committed.

---

## Stack

> Concrete choices for this project. **This OVERRIDES the repo's Python/LangGraph/FastAPI baseline** — see "Superseded baseline" below.

- **Language:** TypeScript 5.x on Node.js 20+ (single language, front and back).
- **Framework:** Next.js 15 (App Router) + React 19 — full-stack; API via Route Handlers (`src/app/api/**/route.ts`) and server components.
- **Agent framework:** **none** — no AI/LLM. See `agent.md`.
- **LLM provider + model:** **none.**
- **Backend:** Next.js Route Handlers (no separate service).
- **Database + ORM:** **PostgreSQL** via **Prisma 5.x** — **Neon** in the live Vercel deployment; `datasource db { provider = "postgresql" }`. Migrations via `prisma migrate`, written as Postgres DDL. *(Phase 1/1.5 shipped on SQLite; the datasource moved to Postgres at deployment. Postgres is now authoritative — every gate uses the production driver, and destructive gate work runs in an isolated `test_gate` schema, never `public`.)*
- **Frontend:** Next.js 15 + React 19, **Tailwind CSS** for styling, **Framer Motion** for enter/parallax animations, native **SVG** `stroke-dashoffset` for draw-on-scroll, **react-leaflet** + **Leaflet** for maps.
- **Photo processing:** **sharp** (resize → web + thumbnail; retain original).
- **Dependency management:** **pnpm**.
- **Testing:** **Playwright** (headless E2E; the primary gate) + **Vitest** (unit/integration for libs from P3). No Jest.
- **Runtime note:** Route handlers that use `sharp`, `fs`, Prisma, or `crypto` HMAC declare `export const runtime = "nodejs"` (never Edge).

| Key library | Version (min) | Purpose |
|-------------|---------------|---------|
| `next` | 15 | App Router full-stack framework |
| `react`, `react-dom` | 19 | UI |
| `typescript` | 5 | types |
| `@prisma/client`, `prisma` | 5 | ORM + migrations (SQLite) |
| `sharp` | 0.33+ | image resize/thumbnail |
| `framer-motion` | 11+ | enter + parallax animations |
| `leaflet`, `react-leaflet` | 1.9 / 4 | map picker + (P2) overview |
| `tailwindcss`, `postcss`, `autoprefixer` | 3.4 / 8 / 10 | styling |
| `zod` | 3 | request-body validation at API boundaries |
| `@playwright/test` | 1.4x | headless E2E gate |
| `vitest` | 1/2 | unit/integration (from P3) |
| `exifr` | 7 | (P3) EXIF GPS/timestamp parsing |
| `marked` + `dompurify` (or `react-markdown`) | latest | (P3) markdown render |
| `aws4fetch` | 1.0.20+ | **the only** R2/S3 signer — SigV4 over `fetch`, used for object PUT/DELETE **and** presigned upload URLs (video + poster included) |

**Phase 2.5 dependency decisions (no new runtime packages):**
- **NEVER add the AWS SDK** (`@aws-sdk/*`). Every R2 interaction, including the poster object's presigned `PUT`, goes through the existing `aws4fetch` client in `src/lib/storage/r2.ts`. (An earlier draft of this table listed `@aws-sdk/client-s3`; it was never installed and is now explicitly forbidden.)
- **NEVER add `ffmpeg`, `ffprobe`, `fluent-ffmpeg`, `@ffmpeg/*` or any server-side transcoding/probing package.** All video metadata **and** the poster frame are produced **client-side in the browser**. The server stores bytes it never decodes.
- **`sharp` must never receive video bytes.** `complete` does not call `sharp`; the legacy multipart route branches on MIME **before** `processUpload` and returns 415 for video.
- The only additions this phase are four **`next/font/google`** faces (build-time self-hosted, no new package), one per theme and each from a **different type class** so they can never be mistaken for one another or for the chrome (Fraunces + Inter):

  | Theme | Face | Register | CSS variable | Weight |
  |-------|------|----------|--------------|--------|
  | cinematic | **Playfair Display** | dramatic display serif | `--font-feeling-cinematic` | `"600"` |
  | editorial | **Bodoni Moda** | high-contrast didone | `--font-feeling-editorial` | `"700"` |
  | minimal | **Space Grotesk** | geometric techno grotesque | `--font-feeling-minimal` | `"500"` |
  | vintage | **Caveat** | cursive handwriting (the only script in the set) | `--font-feeling-vintage` | `"600"` |

  All four: `subsets: ["latin"]`, `display: "swap"`, one weight each, registered in `src/app/layout.tsx` and appended to the `<html>` className. **No `axes` option on Bodoni Moda.** See [`ui.md`](ui.md) for the fallback stacks and the per-theme rationale (including why Cormorant Garamond was rejected for cinematic and Pinyon Script for vintage). **No script/handwriting face is used for `editorial`.**

**Avoid:** any LLM/agent SDK (out of scope); a separate Python/FastAPI service; storing media bytes in the DB (files go through `PhotoStorage`); Prisma scalar-list fields (`String[]`) — tags use a relation table; putting uploads under `public/` (breaks the R2 URL indirection — serve via `/api/media`); a parallel `Video` model (video is a `kind` on `Photo`).

---

## Module Contracts (frozen — slices code against these)

These signatures are frozen so `slice-api` can author against `slice-foundation`'s modules concurrently (contract dependency, not build-order).

**`src/lib/db.ts`** — `export const prisma: PrismaClient` (singleton; guards against dev hot-reload duplication).

**`src/lib/env.ts`** — `export const env: { OWNER_PASSWORD: string; SESSION_SECRET: string; DATABASE_URL: string; PHOTO_STORAGE_DIR: string; PHOTO_STORAGE_BACKEND: "local" | "r2"; NOMINATIM_USER_AGENT: string; usingDevDefaults: boolean }`. Validates at import; fills safe dev defaults (`OWNER_PASSWORD="letmein"`, a fixed dev `SESSION_SECRET`) and sets `usingDevDefaults=true` with a `console.warn` when a real value is missing. Never throws for missing owner secrets (must boot); throws only for a malformed `DATABASE_URL`.

**`src/lib/storage/types.ts`** — the swap seam:
```ts
export interface SavedObject { key: string; url: string; }
export interface PhotoStorage {
  save(input: { data: Buffer; key: string; contentType: string }): Promise<SavedObject>;
  delete(key: string): Promise<void>;
  url(key: string): string;               // resolve a public URL from an opaque key
}
```
**`src/lib/storage/index.ts`** — `export const storage: PhotoStorage` selected by `env.PHOTO_STORAGE_BACKEND` (P1: always `LocalDiskStorage`; P3 adds `R2Storage`). Call sites use only `storage`; swapping the backend touches no call site.

**`src/lib/photos.ts`** — `export async function processUpload(file: { buffer: Buffer; filename: string; contentType: string }, opts: { tripId: string; stopId: string }): Promise<{ webKey: string; thumbKey: string; originalKey: string; width: number; height: number }>`. **Displays the ORIGINAL at full resolution — no downscaling** (owner decision; slower loads accepted). Always retains the untouched original; `webKey`/`thumbKey` point at the *displayed* object, which equals `originalKey` for browser-renderable formats (JPEG/PNG/WebP/GIF/AVIF) or a **full-resolution** upright JPEG fallback for formats browsers can't show inline (HEIC/HEIF/TIFF/…). sharp is used only to read metadata (upright dimensions via EXIF orientation) and for the fallback encode. Callers resolve URLs via `storage.url(key)`. **Signature unchanged in Phase 2.5 — and it must NEVER be called with video bytes**: its single caller (the legacy multipart route) branches on MIME first and returns 415 for video; the direct-upload `complete` route does not import it at all.

**`src/lib/api-client.ts`** — typed `fetch` wrappers matching every route in `api.md` (e.g. `createTrip`, `listTrips`, `getTrip`, `addStop`, `reorderStops`, `uploadPhotos`, `setCover`, `geocode`). Both frontend slices import these; the shapes equal `api.md`'s response types. **Phase-1.5 additions (frozen — all three theme slices code against these):**
```ts
export type StoryTheme = "cinematic" | "editorial" | "minimal" | "vintage"; // default "cinematic"
```
- `Trip.theme: StoryTheme` and `TripSummary.theme: StoryTheme` added to the response types.
- `CreateTripInput.theme?: StoryTheme` and `TripPatch.theme?: StoryTheme` added to the input types.
- Existing wrappers (`createTrip`, `updateTrip`, `getTrip`, `listTrips`) carry `theme` unchanged in signature — only the type shapes gain the field. `src/lib/api-client.ts` is edited **only** by `slice-theme-data-api`; the two frontend theme slices import `StoryTheme`/`Trip` from it (contract dependency, not a write).

**Phase-2.5 additions to `src/lib/api-client.ts` (frozen — written ONLY by `slice-media-data`; every other slice imports them):**
```ts
export type MediaKind = "photo" | "video";
export type FeelingPlacement = "card" | "inline" | "none";

/** Accepted video content types (MIME parameters stripped before matching). */
export const VIDEO_MIME_TYPES: readonly string[]; // ["video/mp4","video/quicktime","video/webm"]
export const MAX_FEELING_CHARS: 200;

export interface Photo {           // unchanged fields + these three
  kind: MediaKind;                 // "photo" for every pre-existing row
  posterUrl: string | null;        // video only
  durationSec: number | null;      // video only
}
export type Media = Photo;         // domain alias; the DB table stays `Photo`

export interface Stop {            // unchanged fields + these two
  feeling: string | null;
  feelingPlacement: FeelingPlacement;
}
export interface StopInput {       // (= StopPatch) unchanged fields + these two
  feeling?: string | null;
  feelingPlacement?: FeelingPlacement;
}

/** True when `file` is one of the accepted video types (MIME, else extension). */
export function isVideoFile(file: File): boolean;

/** Browser-only. Reads intrinsic size + duration from a <video> and captures a
 *  poster JPEG via canvas.toBlob(). NEVER server-side — no ffmpeg exists.
 *  Resolves { width:0, height:0, durationSec:null, poster:null } on decode
 *  failure or after an 8s timeout; always revokes its object URL. */
export function readVideoMetadata(file: File): Promise<{
  width: number; height: number; durationSec: number | null; poster: Blob | null;
}>;

/** Upload ONE media item (photo OR video) directly to storage:
 *  presign (video → also a poster target) → PUT bytes → PUT poster → complete.
 *  A failed poster PUT still completes the video, without a posterKey. */
export function uploadMediaDirect(
  stopId: string,
  file: File,
  onStage?: (stage: "reading" | "uploading" | "poster" | "finishing") => void,
): Promise<Media>;

/** Kept as a thin alias of uploadMediaDirect so no existing call site breaks. */
export function uploadPhotoDirect(stopId: string, file: File): Promise<Photo>;
```

**`src/components/story/CoverMedia.tsx`** *(new, Phase 2.5 — frozen; written ONLY by `slice-story-video`, imported by `slice-story-feeling`'s `StopCard`)*:
```ts
export interface CoverMediaProps {
  media: Media;                  // kind "photo" | "video"
  alt: string;
  reduce: boolean;               // prefers-reduced-motion
  y: MotionValue<number>;        // parallax translateY supplied by StopCard
  accent: string;                // theme accent, tints the mute/play controls
  /** Rendered instead of the media when the object fails to load. */
  fallback: ReactNode;
}
export function CoverMedia(props: CoverMediaProps): JSX.Element;
```
Renders `[data-cover-photo]` for **both** kinds (so the shipped parallax/cover assertions hold), **adds** `[data-cover-video]` for videos, owns the IntersectionObserver autoplay/pause, the `[data-video-mute-toggle]`, the reduced-motion `[data-video-play]` control and the `[data-video-unplayable]` labelled fallback. It keeps the shipped cover classes (`absolute -top-[8%] left-0 h-[116%] w-full object-cover`) and the ken-burns drift for photos.

**`src/components/story/serpentine.ts`** *(Phase-2.5 additions — strictly additive; `slice-story-feeling`)*:
```ts
export type BeatKind = "stop" | "feeling";
export interface Beat { kind: BeatKind; stopIndex: number; }      // index into the SHOWN stops
export interface BeatLayout extends Beat {
  index: number; side: "left" | "right"; cx: number; cy: number; height: number;
}
export interface SerpentineGeometry { /* …existing fields… */ beats: BeatLayout[]; }

/** [stop0, feeling0?, stop1, feeling1?, …] — a feeling beat is emitted only when
 *  the stop's feeling is non-blank AND feelingPlacement === "card". */
export function buildBeats(stops: Pick<Stop, "feeling" | "feelingPlacement">[]): Beat[];

/** Variable-height geometry. Stop beats get `segmentHeight` (+ `inlineExtra` when
 *  that stop renders an inline pull-quote); feeling beats get
 *  `feelingSegmentHeight` (clamped to 200–420px). Sides alternate by BEAT index;
 *  cy is the running cumulative centre. */
export function buildBeatGeometry(width: number, beats: Beat[], opts: {
  segmentHeight: number; feelingSegmentHeight: number; inlineExtra: number;
  hasInline: (stopIndex: number) => boolean;
}): SerpentineGeometry;
```
`buildGeometry(width, count, segmentHeight)` keeps its exact signature and behaviour (uniform heights) and now also fills `beats`. `nodeAnchors(geom)` returns one `NodeAnchor` per **beat**, derived from `geom.beats`; `serpentinePathD(geom)` is unchanged and therefore threads the path through every beat, feeling cards included. Motif ornaments look up the anchor of the **stop** beat with the matching `stopIndex`.

**`src/components/story/themes/types.ts`** *(Phase-2.5 addition — `slice-story-feeling`)*: a new required `feeling: FeelingTreatment` block on `StoryThemeTreatment`, in the existing house style (pure data — Tailwind classNames for structure, inline `CSSProperties` for dynamic colour):
```ts
export interface FeelingTreatment {
  /** Height (px) a standalone feeling beat occupies on the path. */
  segmentHeight: number;
  /** Extra height (px) added to a STOP beat that renders an inline pull-quote. */
  inlineExtraHeight: number;
  /** Card footprint. Must satisfy widthPct <= card.widthPct and reuse
   *  card.sideInsetPct, so no new horizontal collision risk is introduced. */
  widthPct: number;
  maxWidth: number;
  sideInsetPct: number;
  /** The standalone [data-feeling-card] surface. */
  cardClassName: string;
  cardStyle?: CSSProperties;
  /** The [data-feeling-quote] display text. `quoteStyle.color` is ALWAYS the
   *  solid fallback ink and must be set. */
  quoteClassName: string;
  /** MUST include fontFamily: "var(--font-feeling-<theme>), <that theme's
   *  fallback stack>" — cinematic: Playfair Display / Georgia, "Times New
   *  Roman", serif · editorial: Bodoni Moda / "Didot", "Bodoni MT", "Times New
   *  Roman", serif · minimal: Space Grotesk / "Segoe UI", Roboto, system-ui,
   *  sans-serif · vintage: Caveat / "Segoe Script", "Bradley Hand", cursive.
   *  The fallback must stay in the SAME type class as the webfont, so a failed
   *  load never degrades into Fraunces. See ui.md. */
  quoteStyle: CSSProperties;
  /** Optional multi-colour ink. Applied as `backgroundImage` +
   *  background-clip:text + color:transparent ONLY when the browser reports
   *  support; otherwise quoteStyle.color shows. */
  quoteGradient?: string;
  /** Decorative opening quote mark. */
  markClassName: string;
  markStyle?: CSSProperties;
  /** The [data-feeling-inline] pull-quote inside a stop card. */
  inlineClassName: string;
  inlineStyle?: CSSProperties;
  inlineQuoteClassName: string;
  /** Same `fontFamily` as quoteStyle (one face per theme), at the smaller
   *  ~20px inline size — that size is a legibility constraint on the face
   *  choice, not an afterthought. */
  inlineQuoteStyle: CSSProperties;
  /** Theme flourish on the standalone card. */
  flourish: "rule" | "tape" | "none";
}
```
**Gradient fallback mechanism (frozen):** `FeelingCard` renders the quote with `style={{ ...quoteStyle }}` (solid colour) on first paint, and only after mount — when `typeof CSS !== "undefined" && CSS.supports("-webkit-background-clip", "text")` — merges `{ backgroundImage: quoteGradient, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }`. Unsupported browsers, SSR and the pre-hydration paint all show the solid themed ink, so the text is never invisible.

**`src/lib/logger.ts`** — `export const log: { info; warn; error }` emitting single-line JSON `{ ts, level, msg, ...fields }` to stdout. Route handlers log `{ method, path, status, ms }` per request (observability from day one; no LLM tracing since there is no LLM).

**`src/middleware.ts`** — gates owner surfaces: redirects unauthenticated requests for `/`, `/trips/**` (any child) to `/login`, and returns `401` for owner `/api/**` writes without a valid session. Exempt: `/login`, `/api/auth/login`, `/health`, `/api/media/**`, and (P2) `/s/**` + `/api/public/**`. Verifies the session cookie via `src/lib/session.ts`.

---

## Architecture Notes / Assumptions

- **Storage swap (local → R2/S3).** All photo I/O goes through the `PhotoStorage` interface. The DB stores **opaque keys** (`webKey`, `thumbKey`, `originalKey`) — never absolute URLs — and URLs are resolved at read time via `storage.url(key)`. With `PHOTO_STORAGE_BACKEND="local"`, `LocalDiskStorage` writes under `PHOTO_STORAGE_DIR` and `url(key)` returns `/api/media/<key>` (streamed by `src/app/api/media/[...key]/route.ts`). With `="r2"` (implemented in `src/lib/storage/r2.ts`, used for cloud deploys), `R2Storage.save` uploads to the R2 bucket (S3-compatible) and `url(key)` returns the R2 public URL directly — **no call-site changes**, only `env.PHOTO_STORAGE_BACKEND` flips (R2 credentials validated at boot in `env.ts`). This is why uploads must **not** live under `public/`. See `DEPLOY.md`.
- **No-AI decision.** The product owner explicitly excluded AI/LLM. Wanderline is pure CRUD + media; there is no agent graph, no model calls, and no provider keys. `agent.md` records this so the manifest's "agent file" requirement is satisfied without inventing a graph.
- **Superseded baseline.** `CLAUDE.md` describes a Python/FastAPI/LangGraph/uv skeleton and `harness/patterns/project-layout.md` assumes a Python `src/<package>/` tree. **Neither applies here.** This project is one Next.js app at the repo root using the Next `src/` convention (`src/app`, `src/lib`, `src/components`; `prisma/` for schema; `package.json`/`next.config.ts`/`tsconfig.json`/`tailwind.config.ts` at root). No Python is created. The generic rules in `harness/patterns/code.md` (types at boundaries, fail loud at startup, no hardcoding) still hold, adapted to TypeScript.
- **Ordered sequence only.** Stops and photos each carry an integer `order` with a per-parent unique constraint; reordering is a transactional bulk reassignment. Branching journeys are out of scope entirely.

## Deployment Model

A single long-running Next.js server: `pnpm build` then `pnpm start` (binds **8001**). SQLite file + photo directory live on the same host's disk (P1). Suitable for a small VPS or a container with a mounted volume. Health via `GET /health`. Moving to R2 (P3) removes the disk dependency for photos.
