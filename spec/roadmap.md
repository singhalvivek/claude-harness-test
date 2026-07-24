# Roadmap

> Project working title: **Wanderline** — a visual trip journal.
> `Assumed:` the product was briefed without a name; "Wanderline" is a working title used across the spec and package name. Rename freely.

---

## What This Project Does

Wanderline is a personal, production-quality web app for documenting a trip as an ordered sequence of **stops**. Each stop pins a real-world **location**, a **day/time**, one or more **photos** with captions, and an optional **written entry**. The signature experience is the **reading view**: stops are laid out along a stylized **serpentine** (winding S-curve) path that snakes down the page. As the viewer scrolls, the path **draws itself** progressively, each stop **fades / slides / pops** into view, cover photos gain **parallax** depth, and an **animated marker** travels along the path. The owner writes and arranges the journey; anyone with the trip's secret link reads it (public sharing lands in Phase 2).

## Who Uses It

- **The owner** (single user) — authenticates with one password, creates and edits trips, adds and reorders stops, sets locations, uploads photos, and previews the story. The owner is the only person who can create or change anything.
- **Public visitors** (Phase 2) — reach a finished trip only through its unguessable share link and see a **read-only** rendering: no edit controls, no login.

## Core Problem

Off-the-shelf journaling and photo tools show trips as flat grids or generic timelines — they don't convey the *feeling of a journey unfolding*. Wanderline turns a trip into a scroll-driven visual narrative that the owner is proud to send to friends and family, while keeping authoring simple, robust, and non-destructive.

## Success Criteria

- [ ] The owner can log in with a password, and an unauthenticated visitor is redirected away from every editing surface.
- [ ] The owner can create a trip and add at least three **ordered** stops, each with a location (set via place-search, map-click, or manual entry), a date/time, a caption, and at least one uploaded photo — and can reorder the stops.
- [ ] Every uploaded photo is stored on local disk in two derived sizes (web-optimized + thumbnail) with the original retained, via a storage interface that can later be swapped for R2/S3 with no call-site changes.
- [ ] Opening a trip's **story view** renders the serpentine path drawing itself on scroll, stops animating into view, and cover photos with parallax — all driven by real data, not fixtures.
- [ ] The app boots on **port 8001**, `GET /health` returns HTTP 200 with JSON, and the Playwright smoke walks login → create trip → add stop with photo → open story and asserts the serpentine path + a stop + a photo actually render (not just a 200).

## Out of Scope

- **No AI / no LLM / no agent framework** — this is a pure CRUD + media web app (see `agent.md`).
- No multi-user accounts, roles, sharing between owners, or comments. Exactly one owner, one password.
- No branching journeys — a trip is **one ordered sequence** of stops (branching is an explicit non-goal, not even a later phase).
- No native mobile app; responsive web only.
- No real-time collaboration or concurrent editing.
- No server-side rendering of maps or tiles; maps use OpenStreetMap tiles client-side.
- Deferred to later phases (built as **clearly-labelled "coming soon" stubs** in Phase 1, never as broken UI): public share link, real-map overview toggle, mood/activity tags + filtering, cloud (R2/S3) photo storage, EXIF auto-location, rich (markdown) blog entries, PDF export.

## Key Constraints

- **Stack is fixed** (see `architecture.md#stack`): Next.js full-stack (App Router, TypeScript), SQLite via Prisma (SQLite **is** the production DB here — authoritative, not a substitute), Framer Motion + SVG + react-leaflet for the visuals, `sharp` for photos, `pnpm`. No separate backend service. The Python/LangGraph boilerplate baseline **does not apply** and is superseded.
- **Port 8001** for dev and start; live URL `http://localhost:8001`. `GET /health` must return 200 + JSON.
- **Must boot without secrets.** The app must start for local testing even if `OWNER_PASSWORD` / `SESSION_SECRET` are unset — safe dev defaults apply with a visible warning. To secure a real deployment the owner sets **`OWNER_PASSWORD`** (and `SESSION_SECRET`). See `architecture.md#external-dependencies` and `.env.example`.
- **No cloud credentials required in Phase 1** — photos live on local disk behind a storage interface designed for a later R2/S3 swap.
- **Nominatim usage policy** — geocoding is proxied server-side with a proper `User-Agent`, debounced client-side, kept to low personal-use volume (see `capabilities/stop-location.md`).
- **Non-destructive editing** — autosave-on-blur plus explicit save; never silently lose owner data.
- **Styled render** — the Phase-1 gate asserts the built Tailwind CSS contains real utility selectors (no unexpanded `@tailwind`).

---

## Phases of Development

> **Phase 1 is the smallest first-time-right user-testable win.** Real on the one core path (login → trip → ordered stops with location + photo → animated story view); everything else ships as clearly-labelled "coming soon" stubs that can never be mistaken for bugs. Later phases wire those stubs into real features.

All slices own **disjoint file paths** so `project-builder` can fan out one `code-generator` per slice concurrently. The only cross-slice coupling is a **contract dependency**: the API slice imports the foundation slice's frozen module signatures (`architecture.md#module-contracts`), and the two frontend slices code against the `api.md` contract. These are not build-order dependencies for authoring — every slice authors against signatures frozen in the spec, and all slices are present before the gate runs `pnpm build`.

### Phase 1 — The Living Story

- **Goal:** The owner logs in, creates a trip, adds a few **ordered** stops (each with a location set via place-search or map-click, a date/time, a caption, and at least one uploaded photo that is resized + thumbnailed on local disk), then opens the trip in the **animated serpentine story view** where the path draws itself on scroll, stops animate in, and cover photos have parallax.

- **Independent slices (parallel build units):**
  - `slice-foundation` (backend/infra) — project scaffold + all shared config + data + storage + shell. Owns `package.json`, `next.config.ts`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.mjs`, `.env.example`, `.gitignore`, `playwright.config.ts`, `prisma/` (schema + initial migration), `src/lib/db.ts`, `src/lib/env.ts`, `src/lib/logger.ts`, `src/lib/storage/**` (interface + LocalDiskStorage), `src/lib/photos.ts` (sharp pipeline), `src/lib/api-client.ts` (typed fetch wrappers), `src/app/layout.tsx`, `src/app/globals.css`, `src/app/health/route.ts`, `src/app/api/media/[...key]/route.ts`. **Deps: none.**
  - `slice-api` (backend) — every feature route handler + auth. Owns `src/middleware.ts`, `src/lib/auth.ts`, `src/lib/session.ts`, `src/lib/geocode.ts`, `src/app/api/auth/**`, `src/app/api/trips/**`, `src/app/api/stops/**`, `src/app/api/photos/**`, `src/app/api/geocode/**`, and `tests/e2e/api.smoke.spec.ts`. **Deps: contract-only** — imports `slice-foundation` modules by the frozen signatures in `architecture.md#module-contracts`.
  - `slice-editor` (frontend) — login + owner home + trip editor + location picker + photo uploader. Owns `src/app/page.tsx`, `src/app/login/page.tsx`, `src/app/trips/new/page.tsx`, `src/app/trips/[tripId]/edit/**`, `src/components/editor/**`, `src/components/map/**`, `src/components/photos/**`, `src/components/ui/**`, and `tests/e2e/editor.spec.ts`. **Deps: contract-only** — codes against `api.md`; imports `src/lib/api-client.ts` by its frozen signature.
  - `slice-story` (frontend) — the serpentine reading view. Owns `src/app/trips/[tripId]/story/**`, `src/components/story/**`, and `tests/e2e/story.spec.ts`. **Deps: contract-only** — codes against `api.md`; imports `src/lib/api-client.ts`.

  Route-collision check: `layout.tsx`/`globals.css`/`page.tsx` are single files owned by exactly one slice; `src/app/trips/[tripId]/edit/**` (editor) and `src/app/trips/[tripId]/story/**` (story) are disjoint child segments with **no shared `[tripId]/layout.tsx`**. No two slices write the same file.

- **Key surfaces / files:** `prisma/schema.prisma`; `src/lib/storage/*`, `src/lib/photos.ts`; `src/middleware.ts`, `src/app/api/**`; `src/app/login`, `src/app/trips/[tripId]/edit`, `src/components/editor`; `src/app/trips/[tripId]/story`, `src/components/story`; `src/app/health/route.ts`.

- **Gate command (single runnable command from repo root):**
  ```
  pnpm install && pnpm prisma migrate deploy && pnpm build && pnpm exec playwright test
  ```
  `playwright.config.ts` declares a `webServer` that runs `pnpm start` (→ `next start -p 8001`) and waits for `http://localhost:8001/health` to return 200 before the specs run — so this one command proves: migration applies to the SQLite prod DB, the app builds, it boots on **8001**, `/health` is 200 JSON, and the smokes assert the real journey. The gate runs against `file:./dev.db` (the production DB) and the real Nominatim service. `package.json` exposes it as `pnpm gate`.
  - Assertions inside the smokes (not just HTTP 200): login sets a session cookie and redirects into the app; creating a trip + stop + uploading a real JPEG fixture yields a `webUrl` whose `<img>` reports `naturalWidth > 0`; the story page contains an `svg path[data-serpentine]` whose `stroke-dashoffset` changes between top-of-page and scrolled; at least one stop card becomes visible on scroll; a known Tailwind-styled element reports a non-default computed style (proves the CSS bundle expanded — no unexpanded `@tailwind`).

- **How the user tests it (handoff seed):**
  1. From the repo root run `pnpm install`, then `pnpm prisma migrate deploy`, then `pnpm dev`. Open `http://localhost:8001`.
  2. You are redirected to `/login`. A yellow banner warns you are using the **dev default password** (`letmein`) because `OWNER_PASSWORD` is unset. Type `letmein`, click **Enter**. (To secure it later, set `OWNER_PASSWORD` in `.env`.)
  3. On the home page click **New trip**, give it a title. In the editor click **Add stop**: pick a location via the **Search** tab (type e.g. "Kyoto", choose a candidate) *or* the **Map** tab (click the map to drop a pin). Set a date/time. Drag-drop or select a **photo** (any large phone JPEG is fine). Add a caption. Add **two more stops** the same way. Use the **↑ / ↓** buttons to reorder them.
  4. Click **View story**. Scroll slowly: the winding path should **draw itself** as you scroll, each stop should **animate in**, the cover photo should **drift with parallax**, and a **marker** should travel down the path.
  5. **Real in this phase:** login/session, trip + stop create/edit/reorder, location via search + map-click + manual, photo upload with resize + thumbnail on disk, the serpentine story view.
  6. **Labelled "coming soon" stubs (expected, not bugs):** the **Share link** button, the **Map overview** toggle on the story, the **Tags** section, **EXIF auto-location**, **Cloud storage**, and **Export** — each renders a visible "coming soon" pill and is inert.

### Phase 2 — Publish, Map & Tags

- **Goal:** The owner publishes a trip to get an **unguessable public share link** that renders the same story **read-only** with no edit controls; turns on a **real-map overview** (Leaflet + OSM pins connected by a route line) toggleable from the story; and organizes stops with **mood/activity tags** that filter the editor and story. Wires three Phase-1 stubs into real features.

- **Independent slices (parallel build units):**
  - `slice-publish` (backend) — publish/unpublish + public read API. Owns `src/app/api/trips/[tripId]/publish/**`, `src/app/api/public/**`, and the public-read branch of session/middleware exemptions in `src/middleware.ts` (contract: coordinates the one shared middleware edit with `slice-tags` via a declared merge point — see deps). Adds `shareSlug` handling. **Deps: none** on other Phase-2 slices except the shared `middleware.ts` note below.
  - `slice-tags` (backend) — tag model + tag CRUD + filter query params on trip/stop reads. Owns `src/app/api/tags/**`, `src/app/api/stops/[stopId]/tags/**`, and the Phase-2 additive Prisma migration (`prisma/migrations/*_tags_and_publish`). **Deps: none.** `Assumed:` the single additive migration that adds both `shareSlug` publish fields and the `Tag`/`StopTag` tables is owned by `slice-tags` to avoid two slices writing migration files; `slice-publish` codes against those columns as frozen in `data.md`.
  - `slice-public-ui` (frontend) — public read-only story route + published-state affordances. Owns `src/app/s/[slug]/**`, `src/components/share/**`, `tests/e2e/public.spec.ts`. **Deps: contract-only** (`api.md`).
  - `slice-map-ui` (frontend) — real-map overview panel + tag filter UI. Owns `src/components/mapoverview/**`, `src/components/tags/**`, `tests/e2e/map-tags.spec.ts`, and wires the existing story/editor stub toggles (its own components only). **Deps: contract-only** (`api.md`).

  > **Declared dependency:** `src/middleware.ts` is touched by `slice-publish` only (to exempt `/s/**` and `/api/public/**` from owner auth). `slice-tags` does **not** edit middleware. This keeps the one shared root file single-owner.

- **Key surfaces / files:** `src/app/s/[slug]`, `src/app/api/public`, `src/app/api/trips/[tripId]/publish`, `src/app/api/tags`, `Tag`/`StopTag` models, `src/components/mapoverview`, `src/components/tags`.

- **Gate command:**
  ```
  pnpm prisma migrate deploy && pnpm build && pnpm exec playwright test tests/e2e/public.spec.ts tests/e2e/map-tags.spec.ts
  ```
  Runs against `file:./dev.db` and real OSM tiles/Nominatim. Assertions: publishing a trip returns a slug of ≥ 24 random chars; opening `/s/<slug>` in a **fresh browser context with no session cookie** renders the story and asserts **no edit controls / no "Add stop" button** are present; the map overview panel renders a Leaflet container with one marker per stop and a polyline; applying a tag filter hides non-matching stops in both editor and story.

- **How the user tests it (handoff seed):** Log in, open a trip, click **Publish** — copy the generated link, open it in a private/incognito window: you see the story with **no** edit controls and cannot log in from it. On the story, toggle **Map overview** — a real OpenStreetMap map appears with a pin per stop joined by a line. In the editor, add **tags** (e.g. `hiking`, `food`) to stops and use the **filter** to show only matching stops. Still stubbed: cloud storage, EXIF, rich entries, export.

### Phase 3 — Cloud Storage, Smart Import & Export

- **Goal:** Photos can be stored in **Cloudflare R2 / S3** by flipping an env var (same storage interface, no call-site changes); newly uploaded photos **auto-suggest their location and time from EXIF** GPS metadata; stop entries become **rich markdown**; and a trip can be **exported to a shareable PDF**. Turns the remaining Phase-1 stubs real; this is the final requirements phase (every capability active).

- **Independent slices (parallel build units):**
  - `slice-cloud-storage` (backend) — `R2Storage` implementing the `PhotoStorage` interface + backend selection by env. Owns `src/lib/storage/r2.ts`, `src/lib/storage/index.ts` (selector), `tests/storage.contract.test.ts`. **Deps: none** (implements the frozen interface from Phase 1). `Assumed:` R2 is exercised for real only when `R2_*` env vars are set; otherwise the contract test runs against LocalDiskStorage — both satisfy the same assertions.
  - `slice-exif` (backend) — EXIF GPS + timestamp extraction on upload. Owns `src/lib/exif.ts`, extends the photo-upload response with `suggestedLat/Lng/OccurredAt`, `tests/exif.test.ts`. **Deps: none.**
  - `slice-rich-export` (backend) — markdown storage/render helpers + PDF export route. Owns `src/lib/markdown.ts`, `src/app/api/trips/[tripId]/export/**`, `tests/export.test.ts`. **Deps: none.**
  - `slice-phase3-ui` (frontend) — EXIF "use suggested location" prompt, markdown editor + preview, export button. Owns `src/components/richtext/**`, `src/components/exif/**`, `src/components/export/**`, `tests/e2e/phase3.spec.ts`. **Deps: contract-only** (`api.md`).

- **Key surfaces / files:** `src/lib/storage/r2.ts`, `src/lib/storage/index.ts`, `src/lib/exif.ts`, `src/lib/markdown.ts`, `src/app/api/trips/[tripId]/export`, `src/components/richtext`, `src/components/exif`.

- **Gate command:**
  ```
  pnpm prisma migrate deploy && pnpm build && pnpm vitest run tests/storage.contract.test.ts tests/exif.test.ts tests/export.test.ts && pnpm exec playwright test tests/e2e/phase3.spec.ts
  ```
  The storage contract test runs against whichever backend `PHOTO_STORAGE_BACKEND` selects (real R2 when `R2_*` is set in `.env`; else local — both must pass identical assertions: `save` then `url` yields a fetchable object, `delete` removes it). EXIF test uses a real fixture JPEG carrying GPS EXIF and asserts extracted lat/lng within tolerance. Export test asserts a non-empty `application/pdf` byte stream containing the trip title.

- **How the user tests it (handoff seed):** (Optional) set `PHOTO_STORAGE_BACKEND=r2` and the `R2_*` vars in `.env`, restart — uploads now land in R2 and still display. Upload a photo taken on a phone with location on: the editor prompts "Use photo's location/time?" and pre-fills the pin and date. Write a stop entry with **markdown** (headings, bold, lists) and see it rendered in the story. Click **Export PDF** on a trip and open the downloaded file. Nothing remains stubbed.
