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

### Phase 1.5 — Story Themes

- **Goal:** The owner picks a **story theme** per trip in the editor (four looks: **cinematic** default, **editorial**, **minimal**, **vintage**) and the serpentine story view renders in that theme. Every theme fixes the shipped view's five weaknesses — dense spacing (down from the too-airy ~560px/segment), premium cards, larger photos, a filled/textured background, refined type + per-theme path/marker — while the **signature serpentine draw-on-scroll and traveling marker stay present and functional in all four**. Purely additive to shipped Phase 1: no capability is removed, no AI is introduced. See [`capabilities/story-themes.md`](capabilities/story-themes.md).

- **Independent slices (parallel build units — DISJOINT file paths, fan out one `code-generator` each):**
  - `slice-theme-data-api` (backend) — the `theme` column, migration, API, and the frozen api-client type. **Owns ONLY:** `prisma/schema.prisma` (add `theme String @default("cinematic")` to `Trip`); a new **additive** migration `prisma/migrations/<timestamp>_trip_theme/migration.sql` (pure `ALTER TABLE "Trip" ADD COLUMN "theme" TEXT NOT NULL DEFAULT 'cinematic'` — backfills existing rows, **no** table reset / data loss); `src/app/api/trips/route.ts` (create accepts optional `theme` zod-enum-validated + defaults `cinematic`; list returns `theme`); `src/app/api/trips/[tripId]/route.ts` (get returns `theme`; patch accepts optional `theme` zod-enum-validated, 400 on unknown); `src/lib/api-client.ts` (add `export type StoryTheme`, and `theme` on `Trip`/`TripSummary`/`CreateTripInput`/`TripPatch`). **Deps: none.**
  - `slice-theme-editor` (frontend) — the theme picker. **Owns ONLY:** `src/components/editor/ThemePicker.tsx` (new; four swatches/labels, live-saves via `updateTrip(tripId, { theme })`, uses **inline styles** for swatch colors — does **not** edit `tailwind.config.ts`), wires it into `src/app/trips/[tripId]/edit/page.tsx`, and `tests/e2e/theme-editor.spec.ts` (new; picks a non-default theme, reloads, asserts persistence). **Deps: contract-only** — imports `StoryTheme`/`Trip` from `src/lib/api-client.ts` per the frozen contract (`architecture.md#module-contracts`); does not write it.
  - `slice-theme-story` (frontend, largest) — the themed story render. **Owns ONLY:** `src/components/story/**` (introduce `themes/` — one module per theme supplying palette/typography/background/card/path+marker treatment + a densified segment height; make `StoryView`/`StopCard`/`serpentine` theme-aware; render `data-theme` + the filled themed background on the story root), `src/app/trips/[tripId]/story/page.tsx`, and — **sole editor this phase** — `tailwind.config.ts` + `src/app/globals.css`. Updates `tests/e2e/story.spec.ts` **in place** (keeps every Phase-1 serpentine/marker/parallax/card/reduced-motion assertion, adds theme assertions). Materially reduces dead vertical space (target ~380–440px/segment, tuned so cards never overlap), premium cards, larger photos, filled backgrounds, refined type + per-theme path/marker. **Deps: contract-only** — imports `StoryTheme`/`Trip` from `src/lib/api-client.ts`.

  > **Disjoint-file confirmation:** `slice-theme-data-api` owns schema + migration + the two `api/trips` route files + `src/lib/api-client.ts`. `slice-theme-editor` owns `src/components/editor/ThemePicker.tsx` + the edit page + `theme-editor.spec.ts`. `slice-theme-story` owns `src/components/story/**` + the story page + `story.spec.ts` + `tailwind.config.ts` + `globals.css`. **No two slices write the same file.** `src/lib/api-client.ts` is written **only** by `slice-theme-data-api`; both frontend slices import from it (contract dependency, not a write). `tailwind.config.ts`/`globals.css` are written **only** by `slice-theme-story`. The edit page (`slice-theme-editor`) and the story page (`slice-theme-story`) are disjoint route segments.

- **Key surfaces / files:** `prisma/schema.prisma` + `prisma/migrations/<ts>_trip_theme/`; `src/app/api/trips/route.ts`, `src/app/api/trips/[tripId]/route.ts`, `src/lib/api-client.ts`; `src/components/editor/ThemePicker.tsx`; `src/components/story/themes/**`, `src/components/story/StoryView.tsx`, `src/components/story/StopCard.tsx`, `src/components/story/serpentine.ts`, `tailwind.config.ts`, `src/app/globals.css`.

- **Gate command (single runnable command from repo root):**
  ```
  pnpm install && pnpm prisma migrate deploy && pnpm build && pnpm exec playwright test
  ```
  Runs against the existing `file:./dev.db` (the production DB) and real services via `playwright.config.ts`'s `webServer` (`pnpm start` on **8001**, `/health` readiness). **The gate must prove:**
  - **Additive migration applies non-destructively:** `pnpm prisma migrate deploy` applies the new migration to the existing `file:./dev.db` with no reset; the migration SQL is a pure additive `ADD COLUMN ... DEFAULT 'cinematic'`; a trip created **without** a theme reads back `theme: "cinematic"` (existing rows backfilled to `cinematic`).
  - **Build is clean:** `pnpm build` succeeds with **0 TypeScript errors**.
  - **All prior Phase-1 E2E still pass, un-weakened:** `api.smoke.spec.ts`, `editor.spec.ts`, and `story.spec.ts` keep their existing assertions — the serpentine draw-on-scroll (`svg path[data-serpentine]` dashoffset shrinks on scroll), the traveling marker advancing (`[data-story-marker]`), cover parallax (`[data-cover-photo]` transform changes), a stop card animating from hidden→visible (`[data-stop-card]`), the Tailwind-expanded computed-style check, and reduced-motion (path fully drawn + cards visible). **No assertion is weakened to pass.**
  - **New story assertions (added to `story.spec.ts`, not replacing):**
    - the default trip's story root renders `[data-theme="cinematic"]`;
    - a theme-signature element `[data-theme-signature]` is present in the rendered story;
    - the cover photo's (`[data-cover-photo]`) rendered box is materially larger than a thumbnail — assert a real min rendered width **> 340px** (cinematic default aims much larger / near-full-bleed);
    - the story root's **computed background** is non-default (not blank white, not `rgba(0,0,0,0)`, not `none`);
    - **all four** themes render their `data-theme` value + `[data-theme-signature]` when applied via the API seed (loop: `PATCH /api/trips/:id { theme }` for each of the four, reload the story, assert the root `data-theme` and the signature element per theme).
  - **New editor assertion (`tests/e2e/theme-editor.spec.ts`):** picking a **non-default** theme in the editor persists it — after a reload, the picker shows the chosen theme selected and `GET /api/trips/:id` returns it.

- **How the user tests it (handoff seed):**
  1. From the repo root run `pnpm prisma migrate deploy` (applies the additive `theme` column to your existing `dev.db` — your trips are preserved and default to **cinematic**), then `pnpm build` and `pnpm start` (serves on **8001**).
  2. Open a trip in the editor. Near the trip header you now have a **Story theme** picker with four swatches: **Cinematic**, **Editorial**, **Minimal**, **Vintage**. Pick one — it saves immediately (watch the "Saved ✓" indicator).
  3. Click **View story**. For each theme, go back to the editor, pick a different theme, and re-open the story. Confirm the look changes per theme: photos are **large**, the background is **filled/textured** (not blank), spacing between stops is **tight** (no big dead gaps), and — in every theme — the **serpentine still draws itself on scroll** with the marker travelling the route.
  4. **Real in this phase:** the four story themes + the editor theme picker, persisted per trip on the existing DB.
  5. **Still labelled "coming soon" stubs (expected, not bugs):** the **Share link** button, the **Map overview** toggle, the **Tags** section, **EXIF auto-location**, **Cloud storage**, and **Export** (Phases 2–3).

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

### Phase 2.5 — Video & Feeling

> Built against the **shipped, live-deployed** app (Vercel + **Neon Postgres** + **Cloudflare R2**). Purely additive: no shipped capability is removed or weakened, and **no AI/LLM is introduced** (see [`agent.md`](agent.md)).
>
> **Non-negotiable constraints this phase inherits** (every slice must comply):
> 1. **Never add the AWS SDK.** R2 access — including the poster object's presigned PUT — goes through **aws4fetch** only.
> 2. **Never add ffmpeg/ffprobe or any server-side video dependency.** Video width/height/duration **and** the poster frame are produced **client-side in the browser** (`<video>` metadata + `canvas.toBlob()`) and posted to `complete`. `sharp` must never see video bytes: `complete` doesn't call it, and the **legacy multipart route branches on MIME before `processUpload`** and returns 415 for video.
> 3. **Additive Prisma migration ONLY** — the live Neon DB holds the owner's real trips/stops/photos. Five `ADD COLUMN`s with defaults; no reset, no rename, no destructive change. Exact SQL in [`data.md`](data.md#phase-25-migration--20260814120000_media_kind_and_stop_feeling-additive-only).
> 4. **The gate runs against an isolated Neon schema** (`?schema=test_gate` appended to the real `DATABASE_URL` from `.env`), dropped with `DROP SCHEMA … CASCADE` afterwards. Docker is unavailable. **Never** run the destructive gate against `public`.
> 5. **Port 8001 is force-freed before any server start** — a stale server serves OLD code and silently green-lights a broken build.
> 6. **All 16 existing E2E assertions keep passing, UN-WEAKENED** (`api.smoke.spec.ts` ×4, `editor.spec.ts` ×1, `story.spec.ts` ×4, `theme-editor.spec.ts` ×1, `public.spec.ts` ×4, `map-tags.spec.ts` ×2). The frozen hooks `[data-serpentine]`, `[data-story-marker]`, `[data-cover-photo]`, `[data-stop-card]`, `[data-theme]`, `[data-theme-signature]` all still render and behave. **No assertion may be deleted or softened.**
> 7. Non-destructive editing + autosave-on-blur still apply. 8. The app must still boot with no secrets (dev password `letmein` + the visible warning).

- **Goal:** The owner uploads a **video** to a stop exactly like a photo — it takes its place in the ordered media list, can be set as the stop's **cover**, and plays in the story (muted autoplay when scrolled into view, tap to unmute, poster-backed, with a labelled fallback when a codec can't play) — **and** writes a one-line **feeling** per stop, choosing per stop whether it becomes its own big quote card standing on the serpentine as its own beat, or a pull-quote inside the stop card, rendered in a font, colour and surface that belong to that trip's theme. Delivers [`capabilities/video-media.md`](capabilities/video-media.md) + [`capabilities/feeling-cards.md`](capabilities/feeling-cards.md).

- **Independent slices (parallel build units — DISJOINT file paths, fan out one `code-generator` each):**

  - **`slice-media-data`** (data + shared contract + gate infra). **Owns ONLY:** `prisma/schema.prisma`; the **one** new migration `prisma/migrations/20260814120000_media_kind_and_stop_feeling/migration.sql` (exact SQL frozen in `data.md`); `src/lib/api-client.ts` (**all** Phase-2.5 additions — `MediaKind`, `FeelingPlacement`, `VIDEO_MIME_TYPES`, `MAX_FEELING_CHARS`, `Media`, the three `Photo` fields, the two `Stop`/`StopInput` fields, `isVideoFile`, `readVideoMetadata`, `uploadMediaDirect`, the `uploadPhotoDirect` alias — per `architecture.md#module-contracts`); `package.json` (adds `"gate:phase"`); `playwright.config.ts` (`reuseExistingServer: !process.env.CI && process.env.PLAYWRIGHT_REUSE_SERVER !== "0"` — **keeps its single `chromium` project exactly as shipped; do NOT add a `channel`**, see the fixture note below); `scripts/gate-phase.mjs`; `scripts/make-video-fixture.mjs` (**offline regeneration utility only — never invoked by the gate**); `tests/fixtures/**` *(new fixtures only)*; `tests/e2e/media-api.spec.ts`. **Deps: none.** **Does NOT create or overwrite `tests/fixtures/clip.mp4`** — that binary is already committed in the repo (see the fixture note); this slice may add *other* fixtures under `tests/fixtures/**` but must treat `clip.mp4` as read-only, pre-existing input.
  - **`slice-media-api`** (media routes). **Owns ONLY:** `src/app/api/stops/[stopId]/photos/presign/route.ts` (video MIME table + the second **poster** presign in one round-trip); `src/app/api/stops/[stopId]/photos/complete/route.ts` (`kind`/`posterKey`/`durationSec`, poster-key validation, still **no sharp**); `src/app/api/stops/[stopId]/photos/route.ts` (the **415 video branch before `processUpload`**); `src/app/api/photos/[photoId]/route.ts` (serializer + delete `posterKey`); `src/app/api/photos/[photoId]/cover/route.ts`; `src/app/api/trips/route.ts` (`coverThumbUrl` → the poster for a video cover); `src/app/api/media/[...key]/route.ts` (video content types + **HTTP Range/206**). **Deps: contract-only** — implements `api.md`; imports the frozen types from `src/lib/api-client.ts` (does **not** write it).
  - **`slice-feeling-api`** (stop + trip read routes). **Owns ONLY:** `src/app/api/stops/[stopId]/route.ts` (feeling zod + serializer + delete `posterKey`); `src/app/api/trips/[tripId]/stops/route.ts` (create + serializer); `src/app/api/trips/[tripId]/route.ts` (serializer + delete `posterKey`); `src/app/api/public/trips/[slug]/route.ts` (serializer); `tests/e2e/feeling-api.spec.ts`. Its serializers emit the **full** media shape (`kind`/`posterUrl`/`durationSec`) exactly as frozen in `api.md` — a contract, not a code dependency. **Deps: contract-only.**
  - **`slice-media-editor`** (authoring — media). **Owns ONLY:** `src/components/photos/PhotoUploader.tsx` (video accept/filter, stage labels, poster thumbnails + duration badge, film-strip placeholder, set-a-video-as-cover); `src/components/editor/StopList.tsx` (poster + ▶ badge on a video cover thumbnail); `tests/e2e/editor-media.spec.ts`. **Deps: contract-only** — imports `uploadMediaDirect`/`isVideoFile`/`Media` from `src/lib/api-client.ts`.
  - **`slice-feeling-editor`** (authoring — feeling). **Owns ONLY:** `src/components/editor/FeelingEditor.tsx` (**new** — textarea + counter + placement toggle, autosave-on-blur / live-save); `src/components/editor/StopPanel.tsx` (mounts it above the uploader; `Save stop` still never sends `feeling`); `tests/e2e/feeling-editor.spec.ts`. **Deps: contract-only.**
  - **`slice-story-video`** (reading — media). **Owns ONLY:** `src/components/story/CoverMedia.tsx` (**new** — the frozen `CoverMediaProps` component: `[data-cover-photo]` for both kinds, `[data-cover-video]`, IntersectionObserver autoplay/pause, `[data-video-mute-toggle]`, `[data-video-play]`, `[data-video-unplayable]`); `src/components/story/PhotoGallery.tsx` (playable poster-backed video slides); `tests/e2e/story-video.spec.ts`. **Deps: contract-only.**
  - **`slice-story-feeling`** (reading — feeling, geometry, fonts). **Owns ONLY:** `src/components/story/serpentine.ts` (the additive **beat** geometry); `src/components/story/StoryView.tsx` (render beats, not stops); `src/components/story/StopCard.tsx` (delegates the cover to `CoverMedia`, renders `[data-feeling-inline]`); `src/components/story/FeelingCard.tsx` (**new**); `src/components/story/themes/**` (the `feeling: FeelingTreatment` block on all four themes + `types.ts`); `src/app/layout.tsx` (**sole owner** — registers the four `next/font/google` faces as CSS variables); `tailwind.config.ts` and `src/app/globals.css` (**sole owner each**; expected to need **no change** — all feeling colour is inline style per the house pattern — but if a keyframe is required it goes in `globals.css` and nowhere else); `tests/e2e/story.spec.ts` (**edited in place, sole editor this phase** — every existing assertion kept verbatim, new ones appended); `tests/e2e/story-feeling.spec.ts`. **Deps: contract-only** — imports `CoverMedia` from `slice-story-video` by the frozen `CoverMediaProps` signature (`architecture.md#module-contracts`), never writes it.

  > **Why `src/app/layout.tsx` belongs to `slice-story-feeling`:** the four fonts exist solely to be consumed by `src/components/story/themes/*` — the registration (CSS variable) and the consumption (`quoteStyle.fontFamily`) must agree exactly, and no other slice needs the file this phase. Splitting them across two slices would create a real cross-slice coupling for zero benefit. `tailwind.config.ts`/`globals.css` follow the same owner for the same reason (and by the Phase-1.5 precedent).

  > **Disjoint-file confirmation — every owned path, checked for collisions:**
  >
  > | Path | Sole owner |
  > |------|-----------|
  > | `prisma/schema.prisma`, `prisma/migrations/20260814120000_media_kind_and_stop_feeling/migration.sql` | `slice-media-data` |
  > | `src/lib/api-client.ts` | `slice-media-data` |
  > | `package.json`, `playwright.config.ts`, `scripts/gate-phase.mjs`, `scripts/make-video-fixture.mjs`, `tests/fixtures/**` *(except the pre-committed `tests/fixtures/clip.mp4`, which no slice writes)* | `slice-media-data` |
  > | `tests/e2e/media-api.spec.ts` | `slice-media-data` |
  > | `src/app/api/stops/[stopId]/photos/presign/route.ts`, `…/complete/route.ts`, `…/photos/route.ts` | `slice-media-api` |
  > | `src/app/api/photos/[photoId]/route.ts`, `src/app/api/photos/[photoId]/cover/route.ts` | `slice-media-api` |
  > | `src/app/api/trips/route.ts`, `src/app/api/media/[...key]/route.ts` | `slice-media-api` |
  > | `src/app/api/stops/[stopId]/route.ts`, `src/app/api/trips/[tripId]/route.ts`, `src/app/api/trips/[tripId]/stops/route.ts`, `src/app/api/public/trips/[slug]/route.ts` | `slice-feeling-api` |
  > | `tests/e2e/feeling-api.spec.ts` | `slice-feeling-api` |
  > | `src/components/photos/PhotoUploader.tsx`, `src/components/editor/StopList.tsx`, `tests/e2e/editor-media.spec.ts` | `slice-media-editor` |
  > | `src/components/editor/FeelingEditor.tsx`, `src/components/editor/StopPanel.tsx`, `tests/e2e/feeling-editor.spec.ts` | `slice-feeling-editor` |
  > | `src/components/story/CoverMedia.tsx`, `src/components/story/PhotoGallery.tsx`, `tests/e2e/story-video.spec.ts` | `slice-story-video` |
  > | `src/components/story/serpentine.ts`, `StoryView.tsx`, `StopCard.tsx`, `FeelingCard.tsx`, `themes/**` | `slice-story-feeling` |
  > | `src/app/layout.tsx`, `tailwind.config.ts`, `src/app/globals.css` | `slice-story-feeling` |
  > | `tests/e2e/story.spec.ts` (in place), `tests/e2e/story-feeling.spec.ts` | `slice-story-feeling` |
  >
  > **No two slices write the same path.** The three read-only contract dependencies are: everyone *imports* `src/lib/api-client.ts` (written only by `slice-media-data`); `slice-story-feeling` *imports* `CoverMedia` (written only by `slice-story-video`); four slices *read* `tests/fixtures/clip.mp4`, which is a **pre-committed binary written by no slice at all** (see the fixture note) — so it is not even a cross-slice dependency, it is repo input. None is a build-order dependency for authoring — every slice codes against signatures frozen in `architecture.md#module-contracts` and `api.md`, and all slices are present before the gate runs. Route segments are disjoint: `src/app/api/photos/**` + `…/photos/presign|complete` (media) vs `src/app/api/stops/[stopId]/route.ts` + `trips/**` (feeling); `src/components/editor/StopList.tsx` (media-editor) vs `StopPanel.tsx`/`FeelingEditor.tsx` (feeling-editor) — `StopPanel` *renders* `PhotoUploader` but does not edit it. The 5 untouched story components (`AmbientDecor`, `StopMotifOrnament`, `StoryIntro`, `StoryOutro`, `StoryReader`, `color.ts`, `decor/config.ts`) are written by nobody.

  > `Assumed:` this phase carries **2** capabilities rather than the usual ≥ 3. It is a user-directed increment on a shipped, live product, and the two are the owner's complete ask; padding it with unrelated work would enlarge the blast radius against a production Neon DB and a live R2 bucket for no user value. The phase is still substantial — 7 parallel slices, a schema change, and the story's trickiest geometry work — and Phase 3 remains intact behind it.

- **Key surfaces / files:** `prisma/schema.prisma` + the one additive migration; `src/lib/api-client.ts`; `src/app/api/stops/[stopId]/photos/{presign,complete}/route.ts`, `src/app/api/media/[...key]/route.ts`; `src/app/api/stops/[stopId]/route.ts` + the trip/public serializers; `src/components/photos/PhotoUploader.tsx`, `src/components/editor/{StopPanel,FeelingEditor,StopList}.tsx`; `src/components/story/{CoverMedia,FeelingCard,StopCard,StoryView,PhotoGallery,serpentine}.*` + `src/components/story/themes/**`; `src/app/layout.tsx`; `scripts/gate-phase.mjs`.

- **Gate command (ONE runnable command from the repo root):**
  ```
  pnpm gate:phase
  ```
  `package.json` → `"gate:phase": "node scripts/gate-phase.mjs"`. The script is the gate; it fails loudly (non-zero exit) at the first red step and **always** tears the test schema down, including on Ctrl-C. In order it:
  1. Parses `.env` for the **real Neon `DATABASE_URL`** (no dotenv dependency; nothing is written back to `.env`). Aborts unless it is a `postgres://`/`postgresql://` URL.
  2. Derives `GATE_DATABASE_URL` by setting `schema=test_gate` on that URL, then **asserts** the resolved schema is exactly `test_gate` before executing any DDL — a resolved `public` aborts the run. Shell env beats `.env` for both the Prisma CLI and `next start`, so this URL is what every later step uses.
  3. **Force-frees port 8001** (`netstat -ano` + `taskkill /F /PID` on win32, `lsof -ti:8001 | xargs kill -9` elsewhere), tolerating "nothing listening".
  4. `prisma db execute --url <base> --stdin` ← `DROP SCHEMA IF EXISTS "test_gate" CASCADE; CREATE SCHEMA "test_gate";`
  5. `prisma db execute --url <gate> --file prisma/migrations/20260813000000_init/migration.sql` — builds the **pre-2.5** table shape.
  6. `prisma db execute --url <gate> --stdin` ← INSERTs **real pre-existing rows**: one `Trip` ("Legacy trip"), one `Stop`, one `Photo` — using only the pre-2.5 columns.
  7. `prisma migrate resolve --applied 20260813000000_init` (DATABASE_URL = gate) — marks init applied without re-running it.
  8. `prisma migrate deploy` (DATABASE_URL = gate) — applies **only** the new additive migration, **onto a database that already contains rows**.
  9. `prisma generate`, then `next build`.
  10. **Verifies the committed video fixture — it does NOT record one.** Asserts, in pure Node with no browser: `tests/fixtures/clip.mp4` **exists**, its size is **> 10 KB**, and bytes `4..8` of the file are exactly `ftyp` (the ISO-BMFF box type). Any failure exits non-zero with an actionable message — *"tests/fixtures/clip.mp4 is missing or not a real ISO-BMFF video. It is a committed binary fixture; restore it from git (`git checkout -- tests/fixtures/clip.mp4`) or regenerate it OFFLINE with `node scripts/make-video-fixture.mjs`, which requires real Microsoft Edge. The gate never records video."* — and **never** substitutes a stub, a zero-byte file, or a re-recording.
  11. `playwright test` (all specs) with `DATABASE_URL=<gate>`, `PLAYWRIGHT_REUSE_SERVER=0`, `PHOTO_STORAGE_BACKEND=local`, `PHOTO_STORAGE_DIR=./.gate-storage`.
  12. **Teardown (always):** `DROP SCHEMA IF EXISTS "test_gate" CASCADE;` against the base URL, and `rm -rf ./.gate-storage`.

  **The gate must prove — exact assertions:**
  - **Additive migration on a populated DB (`media-api.spec.ts`, via `PrismaClient` against the gate schema):** step 8 succeeded with **no reset**; the "Legacy trip"/stop/photo rows inserted at step 6 are **still present with their original values**; and they backfilled to `kind = "photo"`, `posterKey = null`, `durationSec = null`, `feeling = null`, `feelingPlacement = "card"`. The migration SQL file contains **only** `ADD COLUMN` statements (asserted by reading the file: no `DROP`, `RENAME`, `ALTER COLUMN … TYPE`, `TRUNCATE`).
  - **Clean build:** `next build` completes with **0 TypeScript errors** (step 9; a type error fails the build and the gate).
  - **All 16 prior E2E pass, un-weakened:** the full `playwright test` run includes `api.smoke.spec.ts`, `editor.spec.ts`, `story.spec.ts`, `theme-editor.spec.ts`, `public.spec.ts`, `map-tags.spec.ts` with **every** existing assertion intact — serpentine dashoffset shrinking on scroll, the traveling `[data-story-marker]` advancing, `[data-cover-photo]` parallax transform changing, a `[data-stop-card]` going hidden→visible, cover width > 340 px, the Tailwind computed-style check, all four `[data-theme]` + `[data-theme-signature]`, the reduced-motion branch, publish/public read-only, tags + map. `story.spec.ts` is edited **in place** by `slice-story-feeling` and additions may only be appended.
  - **Fixture integrity (step 10, before any browser starts):** `tests/fixtures/clip.mp4` exists, is **> 10 KB**, and bytes `4..8` are `ftyp`. The gate **records no video** and launches **no Edge**; every spec below consumes this committed file.
  - **Real video, end to end (`editor-media.spec.ts`, through the BROWSER, default `chromium` project — no `channel`):** `setInputFiles` the committed fixture `tests/fixtures/clip.mp4` on `[data-testid="photo-file-input"]` in the stop drawer → the browser runs `readVideoMetadata` + the canvas poster capture + presign + both PUTs + complete. Then `GET /api/trips/:id` reports that media item with `kind:"video"`, a **non-null `posterUrl`**, `durationSec > 0`, and `width > 0` — proving the poster/duration pipeline works with **no ffmpeg**. The editor tile shows the poster `<img>` with `naturalWidth > 0` plus the duration badge.
  - **API-level media contract (`media-api.spec.ts`):** presign with `{contentType:"video/mp4", kind:"video", posterContentType:"image/jpeg"}` returns both `uploadUrl` and `poster.uploadUrl` sharing one `<uuid>` prefix; presign with `{contentType:"video/quicktime", kind:"video", filename:"clip.mov"}` → **200** with a key ending `.mov` (the `.mov` path is proven at the **contract level** — no genuine QuickTime file exists on this machine, see the fixture note); presign with `contentType:"application/zip"` → **400**; `complete` with a `posterKey` outside the stop prefix → **400**; the **legacy multipart** route with a `video/mp4` part → **415** and `prisma.photo.count()` unchanged (sharp never ran); `GET /api/media/<video key>` returns `Accept-Ranges: bytes` and a **206** with a correct `Content-Range` for `Range: bytes=0-1023`.
  - **Video in the story (`story-video.spec.ts`, default `chromium` — bundled Chromium decodes this H.264 fixture, verified):** a stop whose cover is the committed `clip.mp4` renders **one element carrying BOTH `[data-cover-photo]` and `[data-cover-video]`**; after scrolling it into view it reports `videoWidth > 0` and `readyState >= 1`, `muted === true`, and `paused === false` (autoplaying in view); scrolling it out of view flips `paused` to `true`; `[data-video-mute-toggle]` is visible, and clicking it flips `muted` to `false` and the control's `data-muted` to `"false"`. A non-cover video renders a `[data-gallery-video]` slide with a poster. In a `reducedMotion: "reduce"` context the cover video is `paused` and `[data-video-play]` is visible.
  - **Feeling cards (`story-feeling.spec.ts`):** seed one stop with `feelingPlacement:"card"` and one with `"inline"`. The card stop renders a `[data-feeling-card]` containing its text that is **NOT** a descendant of any `[data-stop-card]` (asserted via `element.closest("[data-stop-card]") === null`); the inline stop renders `[data-stop-card] [data-feeling-inline]` with its text and contributes **no** `[data-feeling-card]`. After `page.reload()` both still render (persistence).
  - **Four distinct themed faces (`story-feeling.spec.ts`):** the four expected families live in **one** place — a `const FEELING_FACE = { cinematic: /Playfair[_ ]Display/i, editorial: /Bodoni[_ ]Moda/i, minimal: /Space[_ ]Grotesk/i, vintage: /Caveat/i }` map at the top of the spec file (the `[_ ]` alternation is required because `next/font` emits hashed families like `__Playfair_Display_a1b2c3`). Loop the four themes via `PATCH /api/trips/:id {theme}` and reload; for each, `await document.fonts.ready` then read `getComputedStyle` on `[data-feeling-card] [data-feeling-quote]` and assert:
    - `fontFamily` **matches its `FEELING_FACE` regex** — so the four faces are the ones specified, in four different type classes (dramatic display serif / didone / techno grotesque / cursive);
    - the four `fontFamily` values are **pairwise different**, and **none contains `Fraunces`** (nor `Inter`);
    - **the webfont actually loaded, not a fallback:** take the *first* family token of the computed `fontFamily`, strip quotes, assert it does **not** contain `Fallback`, and assert `document.fonts.check(\`40px "${firstFamily}"\`) === true`. (Hard-coding `document.fonts.check("40px 'Playfair Display'")` would always be **false** — the real family name is hashed by `next/font` — so it must be read off the element.)
    - a deliberate colour treatment per theme — `backgroundImage !== "none"` **or** (`color` is neither `rgb(0, 0, 0)` nor `rgb(255, 255, 255)`) — with the four `color`+`backgroundImage` pairs all distinct.

    The same four assertions run against `[data-feeling-inline] [data-feeling-quote]` for one theme, proving the inline pull-quote uses the same face at its smaller ~20 px size.
  - **Geometry still correct with feeling beats interleaved (`story-feeling.spec.ts`, all four themes):** `svg path[data-serpentine]` dashoffset shrinks between top and bottom of page; `[data-story-marker]` translateY increases; and **no two bounding boxes intersect** across the combined set of `[data-stop-card]` + `[data-feeling-card]` (pairwise rectangle-intersection check with a 0 px tolerance, run after scrolling to the bottom so every card has entered).
  - **Feeling API (`feeling-api.spec.ts`):** `PATCH /api/stops/:id {feeling}` round-trips; `{feelingPlacement:"nope"}` → **400**; a 201-character feeling → **400**; a blank feeling normalises to `null`; a `PATCH` sending only `{title}` leaves `feeling` untouched (non-destructive); `GET /api/public/trips/:slug` returns `feeling`/`feelingPlacement` on every stop.
  - **Feeling editor (`feeling-editor.spec.ts`):** typing in `[data-testid="stop-feeling"]` and blurring persists (verified by `GET /api/stops` state after reload); the counter shows `n/200`; clicking a `[data-testid="stop-feeling-placement"]` option live-saves and survives a reload; clicking **Save stop** afterwards does **not** clear the feeling.

  > **Video fixture — COMMITTED BINARY, NEVER RECORDED AT GATE TIME (`Assumed:`, revised on measured evidence).**
  >
  > `tests/fixtures/clip.mp4` is a **real H.264 MP4 already committed to the repo** — 640×360, 3.33 s, ~93.6 KB, header `ftypisom` — present *before any generator runs*. **No slice creates it, no slice overwrites it, and the gate does not record video.** This removes Microsoft Edge, `MediaRecorder` and browser codec-encoding support from the gate's dependency set entirely, making the gate deterministic and faster. The gate's only fixture work is the **existence + size + `ftyp` check** in step 10 above; if that check fails the gate stops with an actionable message rather than silently substituting a stub.
  >
  > **Measured fact — Playwright's bundled Chromium DECODES H.264 fine.** On this machine (Playwright 1.61.1, Windows 11) `video.canPlayType('video/mp4; codecs="avc1.42E01E"')` returns `"probably"`, and the committed fixture loads metadata (`videoWidth=640`, `videoHeight=360`, `duration=3.33`) and advances `currentTime` on `play()`. **Therefore every story/gallery `<video>` assertion runs in the DEFAULT `chromium` Playwright project and `playwright.config.ts` keeps its single chromium project — no `channel` is added to any test project.**
  >
  > > ⚠️ **TRAP — DO NOT "FIX" FIXTURE GENERATION BY MOVING IT INTO BUNDLED CHROMIUM.** Bundled Chromium **cannot encode MP4 and fails catastrophically rather than failing over**: `MediaRecorder.isTypeSupported('video/mp4')` and `('video/mp4;codecs=avc1.42E01E')` both return **`true`** (it lies), `MediaRecorder.start()` fires `onstart`, and then the **renderer hangs forever** — no `dataavailable`, no `onstop`, and even a `setTimeout` race *inside* `page.evaluate()` never resolves, so the `evaluate` promise never settles. A "prefer MP4, fall back to WebM" script therefore **hangs the whole gate indefinitely** instead of falling back. This is why recording was removed from the gate. Do not reintroduce it. (WebM VP8 *does* record in bundled Chromium, but an automatic-frame recording produced a degenerate file with `duration: 0` — useless for a duration assertion.)
  >
  > **`scripts/make-video-fixture.mjs` is an OFFLINE regeneration utility only** (owned by `slice-media-data`, **never invoked by `scripts/gate-phase.mjs`** and never referenced by any test). Its file header must document: run it **manually** only, when the fixture must be regenerated; it requires **real Microsoft Edge** via `chromium.launch({ channel: "msedge" })`, which does encode H.264 MP4 headless; the working recipe is `canvas.captureStream(0)` (0 = manual frame mode) + `track.requestFrame()` per drawn frame + `new MediaRecorder(stream, { mimeType: 'video/mp4;codecs=avc1.42E01E', videoBitsPerSecond: 800000 })`, ~90 frames at ~33 ms — `captureStream(25)` with automatic frames yields **0-byte chunks in Edge**, so the manual `requestFrame()` loop is required. The script must **hard-refuse to run under bundled Chromium** (guard: abort unless launched with `channel: "msedge"`), with the refusal message stating the reason: *MP4 recording hangs the renderer in bundled Chromium and `isTypeSupported` cannot be trusted there.*
  >
  > **`.mov` honesty.** A genuine QuickTime file cannot be produced on this machine without ffmpeg (banned by constraint 2), so the `video/quicktime` path is tested at the **contract level only** — see [`capabilities/video-media.md`](capabilities/video-media.md#test-fixture--coverage-honesty). No claim is made that a real iPhone HEVC `.mov` is covered end to end.

  > **Storage during the gate (`Assumed:`).** The gate forces `PHOTO_STORAGE_BACKEND=local` with a throwaway `PHOTO_STORAGE_DIR=./.gate-storage` so it never writes test objects into the **production R2 bucket** — while still exercising the identical presign → PUT → complete code path through the same `PhotoStorage` seam. The real-service rule is honoured where it matters: the gate runs against the **real Neon Postgres** with the production driver (in an isolated schema). Setting `GATE_USE_R2=1` runs the same gate against the real R2 credentials from `.env` and deletes the objects it created; run that once before shipping a storage change.

- **How the user tests it (handoff seed):**
  1. From the repo root: `pnpm install`, then `pnpm prisma migrate deploy` (applies the **additive** migration to your real Neon DB — your trips, stops and photos are preserved; every existing photo becomes `kind: "photo"` and every existing stop gets an empty feeling, so **nothing about your shipped stories changes**). Then `pnpm build` and `pnpm start` → `http://localhost:8001`. If port 8001 is already in use, kill it first — a stale server serves old code.
  2. **Video.** Open a trip → **Edit** a stop. The uploader is now **"Photos & video"**: drag in a phone video (`.mp4` or `.mov`) or use **Choose files**. Watch the stage label (*Reading video… → Uploading… → Poster… → Finishing…*). The tile appears with its **poster frame** and a **▶ 0:14** duration badge. Click **★ Cover** on it.
  3. Click **View story**. The stop's cover is now a **video**: it starts playing (silently) as it scrolls into view, pauses when it leaves, and the bottom-right speaker button **unmutes** it on tap (the icon shows the state). Open the stop to see the gallery — non-cover videos are playable poster tiles. If you upload a clip your browser can't decode (an HEVC iPhone `.mov` in Chrome is the usual case), you get the poster plus a clear *"This video can't play in this browser"* and a **Download** link — that is the designed fallback, not a bug.
  4. **Feeling.** Back in the stop drawer there is a new **Feeling** box. Type one line (up to 200 characters — there's a counter) and click outside it: it saves on blur. Under it choose the placement: **Its own card on the path** or **Inside the stop card** (or **Hidden**). Give one stop each so you can compare.
  5. Open the story again. The "own card" feeling stands as its **own beat on the serpentine**, opposite its stop, in **big display type with no photo** — and the path winds through it and the marker travels past it. The "inside" one is a pull-quote within the stop card.
  6. **The typography is the point.** Switch the trip theme (editor → **Story theme**) through all four and re-open the story. Four genuinely different *type classes*, not four flavours of the same idea — and none of them the app's normal Fraunces/Inter:
     - **cinematic** — a dramatic display serif (**Playfair Display**), gold gradient on dark glass, like a film title card;
     - **editorial** — a high-contrast magazine didone (**Bodoni Moda**), terracotta duotone on paper; deliberately *not* handwriting, because editorial's whole identity is print authority;
     - **minimal** — a geometric techno grotesque (**Space Grotesk**), restrained slate fade;
     - **vintage** — the one true cursive (**Caveat**), faded ink on a taped mat.

     Each face is also used, at a smaller size, for the "inside the stop card" pull-quote and in the editor's Feeling box, so what you type looks like what you get.
  7. **Real in this phase:** video upload/cover/playback everywhere a photo works, per-stop feelings in both placements with per-theme fonts and colours. Everything is live on the public share link too.
  8. **Still labelled "coming soon" stubs (expected, not bugs):** **EXIF auto-location**, **Cloud storage** (the pill in the uploader — R2 is already live in production; the pill is stale copy scheduled for Phase 3), **Markdown formatting**, and **Export** (Phase 3).

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
