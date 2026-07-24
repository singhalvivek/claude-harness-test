# UI

> Next.js 15 + React 19 + Tailwind CSS. Framer Motion for enter/parallax; native SVG `stroke-dashoffset` for the draw-on-scroll path; react-leaflet for maps. Two frontend slices: `slice-editor` (authoring) and `slice-story` (reading). The **story view is the signature experience** and must feel polished in Phase 1.

---

## UI Type

Responsive web app. Two personas of surface: **owner authoring** (login, home, editor) and **reader** (serpentine story). Phase 1 story is an owner preview at `/trips/[tripId]/story`; Phase 2 adds the public read-only route `/s/[slug]`.

## Design language

Editorial and photographic: generous whitespace, large imagery, a warm serif for trip/stop titles paired with a clean sans for UI, subtle paper/gradient background behind the winding path. Motion is smooth and unobtrusive (respects `prefers-reduced-motion` — animations degrade to simple fades). Every deferred feature appears as a **clearly-labelled "coming soon" pill** so a stub never reads as a bug.

## Views / Screens

### Screen: Login (`/login`) — `slice-editor`
**Purpose:** authenticate the single owner.
**Key elements:** app wordmark; single password field; **Enter** button; a **yellow dev-default warning banner** shown when `GET /api/auth/session` reports `usingDevDefaults` ("Using the built-in dev password `letmein` — set `OWNER_PASSWORD` in `.env` to secure this app").
**Actions:** submit password → `POST /api/auth/login` → on success redirect to `/`; on 401 show inline "Incorrect password."

### Screen: Owner Home (`/`) — `slice-editor`
**Purpose:** list all trips and start a new one. (Middleware redirects here → `/login` if unauthenticated.)
**Key elements:** header with wordmark + **Log out**; **New trip** button; a responsive grid of **trip cards** (cover thumbnail from `coverThumbUrl`, title, description, stop count, updated date). Each card links to its editor and has a **View story** link.
**Actions:** New trip → `POST /api/trips` → redirect to its editor. Open editor. Open story.
**Labelled stubs:** a **"Share" pill = "coming soon"** and a disabled **Export** control on each card.

### Screen: Trip Editor (`/trips/[tripId]/edit`) — `slice-editor`
**Purpose:** author a trip: edit trip meta, add/edit/reorder/delete stops, set each stop's location and photos. Robust and non-destructive (autosave-on-blur + explicit **Save**; unsaved-change indicator).
**Key elements:**
- **Trip header:** inline-editable title + description (autosave on blur → `PATCH /api/trips/:id`). **View story** button.
- **Ordered stop list:** each stop card shows its index, place name, date/time, and a cover thumbnail, with **↑ / ↓** reorder buttons, **Edit**, and **Delete** (confirm). Reorder calls `POST /api/trips/:id/stops/reorder`. (`Assumed:` Phase 1 uses ↑/↓ buttons for robust, first-time-right reordering; drag-and-drop is a later nicety and not required for the gate.)
- **Add / Edit Stop panel** (drawer or inline form):
  - **Location picker** with three tabs:
    - **Search** — debounced (≥ 400 ms, ≥ 3 chars) text input → `GET /api/geocode` → candidate list; picking a candidate sets the pin + `placeName` + `precision=exact`.
    - **Map** — a Leaflet + OSM map; **click to drop** a pin (or **drag** to correct) → `GET /api/geocode/reverse` fills `placeName`; `precision=approximate`.
    - **Manual** — lat/lng + place-name fields (`precision=exact` when coords given, else `none` for a text-only location).
    - On geocode failure: an inline error and a **"Save as text-only location"** option (precision `none`, no pin) — never a silent guess.
  - **Date + time** pickers → `occurredAt`.
  - **Entry** textarea (`body`) — plain text in P1 (markdown from P3, shown as a labelled hint).
  - **Photo uploader** — drag-drop zone + file picker (multiple, large phone images OK) → `POST /api/stops/:id/photos`; shows per-file progress, then a gallery of thumbnails with: **★ Set as cover**, **↑/↓ reorder** (`Assumed:` ↑/↓ in P1), **caption** field, **Delete**. The current cover is badged.
  - **Save** persists; the panel closes and the stop list refreshes.
**Labelled stubs (inert "coming soon" pills):** **Tags** section, **EXIF auto-location** hint on the uploader, **Cloud storage** note, and a **Map overview** mention.

### Screen: Story View (`/trips/[tripId]/story`) — `slice-story` *(the signature)*
**Purpose:** read the journey as a scroll-driven visual narrative. Loads the full trip via `GET /api/trips/:id` (owner preview in P1).
**Key elements:**
- A full-bleed vertical canvas with a stylized **serpentine SVG path** (`<path data-serpentine>`) winding down the page. Its total length is measured (`getTotalLength`) and `stroke-dashoffset` is bound to scroll progress so the path **draws itself** as the reader scrolls.
- An **animated marker** (a dot/pin) positioned along the path at the current scroll progress (`getPointAtLength`), appearing to travel the route.
- **Stop cards** anchored to points along the path, alternating left/right. Each **fades + slides + pops** into view via Framer Motion `whileInView`. A card shows the cover photo, place name, date/time, and entry; opening it reveals the full **photo gallery/carousel**.
- **Cover photos** get **parallax** (translateY tied to scroll) for depth.
- **Story header:** trip title + description over the first stretch of path.
**Actions:** scroll to read; click a stop to expand its gallery; **Back to editor** (owner).
**Labelled stubs:** **Map overview** toggle (renders "coming soon" in P1) and **Share** button (coming soon).
**Reduced motion:** with `prefers-reduced-motion`, the path renders fully drawn and cards simply fade — no scroll-jacking.

### Screen: Public Story (`/s/[slug]`) — `slice-public-ui` *(Phase 2)*
Same story rendering as above but **read-only**: no header edit/Back-to-editor controls, no owner chrome, no login prompt. Served from `GET /api/public/trips/:slug`. In Phase 1 the **Share** button that would produce this link is a labelled stub.

## Error States

- **Auth:** wrong password → inline message; expired/absent session on a page → redirect to `/login`.
- **Geocoding down (502):** inline "Geocoding unavailable — enter the location manually," with the Manual tab and text-only save available.
- **Map tiles fail:** the map frame still renders; manual entry remains usable.
- **Upload failure (400/413/500):** per-file error chip with **Retry**; the stop and other photos are unaffected (non-destructive).
- **Loading:** skeletons for the trip grid and story cards; upload progress bars; a subtle "Saved ✓ / Saving…" indicator in the editor.
- **Empty states:** home with no trips → friendly "Start your first trip"; a trip with no stops in the story → "No stops yet — add some in the editor."

## Tech Stack

Next.js 15 (App Router) + React 19 + Tailwind CSS; Framer Motion (enter/parallax), native SVG (`stroke-dashoffset`, `getTotalLength`/`getPointAtLength`) for draw-on-scroll, react-leaflet + Leaflet + OSM tiles for maps. Client fetches go through `src/lib/api-client.ts`. See `architecture.md#stack`.
