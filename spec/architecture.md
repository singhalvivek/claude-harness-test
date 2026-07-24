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
| **Local disk** (P1) / **R2/S3** (P3) | Photo byte storage behind `PhotoStorage` | Disk-full / write error → `500` with a clear message; the `Stop` is preserved, only the photo fails and can be retried. |

**Secrets / env:** documented in `.env.example`. Required for a secured deployment: `OWNER_PASSWORD`, `SESSION_SECRET`. Provided with **safe dev defaults** so the app boots without them (a visible warning shows when defaults are in use). `DATABASE_URL` defaults to `file:./dev.db`; `PHOTO_STORAGE_DIR` defaults to `./storage/photos`. `NOMINATIM_USER_AGENT` has a default identifying the app. `R2_*` vars are commented placeholders, unused until Phase 3. **No LLM/API keys exist.** The real `.env` is gitignored; only `.env.example` is committed.

---

## Stack

> Concrete choices for this project. **This OVERRIDES the repo's Python/LangGraph/FastAPI baseline** — see "Superseded baseline" below.

- **Language:** TypeScript 5.x on Node.js 20+ (single language, front and back).
- **Framework:** Next.js 15 (App Router) + React 19 — full-stack; API via Route Handlers (`src/app/api/**/route.ts`) and server components.
- **Agent framework:** **none** — no AI/LLM. See `agent.md`.
- **LLM provider + model:** **none.**
- **Backend:** Next.js Route Handlers (no separate service).
- **Database + ORM:** **SQLite** (file-based) via **Prisma 5.x**. SQLite is the production database here — authoritative, not a stand-in for PostgreSQL, so the "no-SQLite-substitute" rule does not apply. Migrations via `prisma migrate`.
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
| `@aws-sdk/client-s3` | 3 | (P3) R2/S3 storage backend |

**Avoid:** any LLM/agent SDK (out of scope); PostgreSQL/other DB engines (SQLite is authoritative here); a separate Python/FastAPI service; storing photo bytes in the DB (files go through `PhotoStorage`); Prisma scalar-list fields (`String[]`) — unsupported on SQLite, so tags (P2) use a relation table, never an array column; putting uploads under `public/` (breaks the R2-swap URL indirection — serve via `/api/media`).

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

**`src/lib/photos.ts`** — `export async function processUpload(file: { buffer: Buffer; filename: string; contentType: string }, opts: { tripId: string; stopId: string }): Promise<{ webKey: string; thumbKey: string; originalKey: string; width: number; height: number }>`. Runs sharp (web ≤ 1600px long edge, thumb ≤ 400px), writes all three via `storage.save`, returns keys + web dimensions. Callers resolve URLs via `storage.url(key)`.

**`src/lib/api-client.ts`** — typed `fetch` wrappers matching every route in `api.md` (e.g. `createTrip`, `listTrips`, `getTrip`, `addStop`, `reorderStops`, `uploadPhotos`, `setCover`, `geocode`). Both frontend slices import these; the shapes equal `api.md`'s response types. **Phase-1.5 additions (frozen — all three theme slices code against these):**
```ts
export type StoryTheme = "cinematic" | "editorial" | "minimal" | "vintage"; // default "cinematic"
```
- `Trip.theme: StoryTheme` and `TripSummary.theme: StoryTheme` added to the response types.
- `CreateTripInput.theme?: StoryTheme` and `TripPatch.theme?: StoryTheme` added to the input types.
- Existing wrappers (`createTrip`, `updateTrip`, `getTrip`, `listTrips`) carry `theme` unchanged in signature — only the type shapes gain the field. `src/lib/api-client.ts` is edited **only** by `slice-theme-data-api`; the two frontend theme slices import `StoryTheme`/`Trip` from it (contract dependency, not a write).

**`src/lib/logger.ts`** — `export const log: { info; warn; error }` emitting single-line JSON `{ ts, level, msg, ...fields }` to stdout. Route handlers log `{ method, path, status, ms }` per request (observability from day one; no LLM tracing since there is no LLM).

**`src/middleware.ts`** — gates owner surfaces: redirects unauthenticated requests for `/`, `/trips/**` (any child) to `/login`, and returns `401` for owner `/api/**` writes without a valid session. Exempt: `/login`, `/api/auth/login`, `/health`, `/api/media/**`, and (P2) `/s/**` + `/api/public/**`. Verifies the session cookie via `src/lib/session.ts`.

---

## Architecture Notes / Assumptions

- **Storage swap (local → R2/S3).** All photo I/O goes through the `PhotoStorage` interface. The DB stores **opaque keys** (`webKey`, `thumbKey`, `originalKey`) — never absolute URLs — and URLs are resolved at read time via `storage.url(key)`. In P1, `LocalDiskStorage` writes under `PHOTO_STORAGE_DIR` and `url(key)` returns `/api/media/<key>` (streamed by `src/app/api/media/[...key]/route.ts`). In P3, `R2Storage.url(key)` returns the R2/S3 public URL and `save` uploads there — **no call site changes**, only `env.PHOTO_STORAGE_BACKEND` flips. This is why uploads must **not** live under `public/`.
- **No-AI decision.** The product owner explicitly excluded AI/LLM. Wanderline is pure CRUD + media; there is no agent graph, no model calls, and no provider keys. `agent.md` records this so the manifest's "agent file" requirement is satisfied without inventing a graph.
- **Superseded baseline.** `CLAUDE.md` describes a Python/FastAPI/LangGraph/uv skeleton and `harness/patterns/project-layout.md` assumes a Python `src/<package>/` tree. **Neither applies here.** This project is one Next.js app at the repo root using the Next `src/` convention (`src/app`, `src/lib`, `src/components`; `prisma/` for schema; `package.json`/`next.config.ts`/`tsconfig.json`/`tailwind.config.ts` at root). No Python is created. The generic rules in `harness/patterns/code.md` (types at boundaries, fail loud at startup, no hardcoding) still hold, adapted to TypeScript.
- **Ordered sequence only.** Stops and photos each carry an integer `order` with a per-parent unique constraint; reordering is a transactional bulk reassignment. Branching journeys are out of scope entirely.

## Deployment Model

A single long-running Next.js server: `pnpm build` then `pnpm start` (binds **8001**). SQLite file + photo directory live on the same host's disk (P1). Suitable for a small VPS or a container with a mounted volume. Health via `GET /health`. Moving to R2 (P3) removes the disk dependency for photos.
