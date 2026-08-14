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
- **Story theme picker** (Phase 1.5, `src/components/editor/ThemePicker.tsx`, lives in the editor near the trip header): four selectable **swatches with labels** — **Cinematic** (default), **Editorial**, **Minimal**, **Vintage** — each swatch previewing its palette/mood via inline swatch styling (the picker uses inline styles for swatch colors and does **not** edit the Tailwind config). Picking a theme **live-saves** immediately via `updateTrip(tripId, { theme })`, shows the shared "Saving… / Saved ✓" indicator, and the choice persists across reload. The currently-selected theme is visibly marked. See [`capabilities/story-themes.md`](capabilities/story-themes.md).
- **Ordered stop list:** each stop card shows its index, place name, date/time, and a cover thumbnail (for a **video** cover the thumbnail is the **poster** with a small **▶** badge; with no poster, the neutral film-strip tile), with **↑ / ↓** reorder buttons, **Edit**, and **Delete** (confirm). Reorder calls `POST /api/trips/:id/stops/reorder`. (`Assumed:` Phase 1 uses ↑/↓ buttons for robust, first-time-right reordering; drag-and-drop is a later nicety and not required for the gate.)
- **Add / Edit Stop panel** (drawer or inline form):
  - **Location picker** with three tabs:
    - **Search** — debounced (≥ 400 ms, ≥ 3 chars) text input → `GET /api/geocode` → candidate list; picking a candidate sets the pin + `placeName` + `precision=exact`.
    - **Map** — a Leaflet + OSM map; **click to drop** a pin (or **drag** to correct) → `GET /api/geocode/reverse` fills `placeName`; `precision=approximate`.
    - **Manual** — lat/lng + place-name fields (`precision=exact` when coords given, else `none` for a text-only location).
    - On geocode failure: an inline error and a **"Save as text-only location"** option (precision `none`, no pin) — never a silent guess.
  - **Date + time** pickers → `occurredAt`.
  - **Entry** textarea (`body`) — plain text in P1 (markdown from P3, shown as a labelled hint).
  - **Photo uploader** — drag-drop zone + file picker (multiple, large phone images OK) → the direct upload path (presign → PUT → complete); shows per-file progress, then a gallery of thumbnails with: **★ Set as cover**, **↑/↓ reorder** (`Assumed:` ↑/↓ in P1), **caption** field, **Delete**. The current cover is badged.
  - **Media uploader — video (Phase 2.5)**, same component (`src/components/photos/PhotoUploader.tsx`), retitled **"Photos & video"**:
    - `accept="image/*,video/mp4,video/quicktime,video/webm"` on the picker; the drag-drop filter accepts an image **or** an accepted video (MIME, else `.mp4`/`.mov`/`.webm` extension). Helper line: *"JPEG, PNG, WebP, HEIC — or MP4, MOV, WebM video. Large phone files are fine."*
    - Per-file stage label while uploading: **Reading video… → Uploading… → Poster… → Finishing…**, then the item appears in the grid. An advisory (non-blocking) note appears for files over **200 MB**.
    - A video tile shows its **poster** as the thumbnail plus a **▶ badge with the duration** (`▶ 0:14`). When no poster could be captured it shows a neutral **film-strip placeholder** with the filename — never a broken `<img>`.
    - **★ Set as cover** works identically for a video.
    - Unsupported file → the existing per-file error chip with **Retry**: *"Only images and MP4/MOV/WebM video can be uploaded."*
  - **Feeling (Phase 2.5)** — a section above the media uploader, deliberately the most pleasant field in the drawer:
    - a large **textarea** (`data-testid="stop-feeling"`, 3 rows, generous line-height, rendered in the trip theme's feeling face at ~1.25rem ≈ 20 px so what you type looks like what you'll get — this 20 px rendering is one of the sizes that decided the per-theme faces, see *The four feeling faces* below), placeholder *"How did this stop feel? One line."*, with a live **counter** `n/200` that turns amber past 180 and blocks input at 200. Persists **autosave-on-blur** → `updateStop(stop.id, { feeling })`.
    - a **placement toggle** (`data-testid="stop-feeling-placement"`), three segmented options that live-save on click: **Its own card on the path** (default) · **Inside the stop card** · **Hidden**. Each option carries a one-line hint and a tiny diagram-ish glyph. Selection is visibly marked.
    - Errors surface in the drawer's existing shared error slot; the previous value is kept (non-destructive). The explicit **Save stop** button never sends `feeling`/`feelingPlacement`.
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
**Themed rendering (Phase 1.5):** the story root carries `data-theme="<theme>"` (from `Trip.theme`) and renders in one of four looks — each fixing the shipped view's weak spacing/cards/photos/background/type while keeping the serpentine, marker, parallax, and cards intact (only *styling* differs). The four looks:
- **Cinematic** (default) — dark immersive canvas, near-full-bleed hero cover photos, glassy translucent caption cards, a **glowing** path + marker, a vignette/gradient-filled dark background.
- **Editorial** — the warm paper + terracotta feel **refined and densified**: tighter rhythm, richer cards, better serif type, larger photos, a textured/tinted paper background (the terracotta path/marker stay).
- **Minimal** — restrained neutral palette, clean sans type, large edge-to-edge card photos, a **thin** understated path + small marker, a subtle tonal/gridded background.
- **Vintage** — scrapbook/postcard: kraft-paper textured background, taped/framed photos, stamp accents, handwritten-style headings, a **dashed** route line.
Every theme materially **tightens** the vertical spacing between stops vs. the shipped view. See [`capabilities/story-themes.md`](capabilities/story-themes.md).
**Labelled stubs:** **Map overview** toggle (renders "coming soon" in P1) and **Share** button (coming soon).
**Reduced motion:** with `prefers-reduced-motion`, the path renders fully drawn and cards simply fade — no scroll-jacking, in every theme.

### Story surfaces added in Phase 2.5 — `slice-story-video` + `slice-story-feeling`

Both surfaces render identically on the owner story (`/trips/[tripId]/story`) and the public share page (`/s/[slug]`), because both go through `StoryReader → StoryView`.

#### Cover video (`src/components/story/CoverMedia.tsx`)
- A video cover renders `<video muted loop playsInline preload="metadata" poster={posterUrl}>` carrying **both** `data-cover-photo` (frozen hook — parallax + cover assertions keep working) and `data-cover-video`, with the same parallax `translateY` as a photo cover.
- **Autoplay in view / pause out of view** via `IntersectionObserver` (threshold `0.35`). A rejected `play()` shows a centred **▶** control (`[data-video-play]`).
- **Tap to unmute:** a always-present control at the cover's bottom-right (`[data-video-mute-toggle]`, `data-muted="true|false"`, `aria-pressed`, label *"Unmute" / "Mute"*, tinted with the theme accent) — the mute state is **visible**, not implied.
- **Can't play in this browser** (e.g. HEVC `.mov` on Chrome): `[data-video-unplayable]` shows the poster, a legible chip *"This video can't play in this browser"*, and a **Download** link — never a black box.
- **Reduced motion:** no autoplay; poster + the explicit ▶ control.
- No poster at all → the theme-tinted film-strip placeholder plus the play control.

#### Gallery video (`src/components/story/PhotoGallery.tsx`)
Inside the expandable carousel a video slide renders `<video controls playsInline preload="metadata" poster>` (`[data-gallery-video]`) with a duration badge; click plays it with native controls. Photo slides are unchanged. The `[data-photo-gallery]` hook is preserved.

#### Feeling card (`src/components/story/FeelingCard.tsx`)
- **`placement:"card"`** → a standalone quote card anchored on the serpentine as **its own beat**, on the side opposite its stop: an oversized opening quote mark, the feeling in the theme's display face at `clamp(1.5rem, 4.2vw, 2.5rem)`, a themed flourish, **no photo**. Hooks: `[data-feeling-card]` (never inside a stop card) with `[data-feeling-quote]` for the text. Clamped to **5 lines** with a hard `maxHeight = feeling.segmentHeight − 32` and `overflow:hidden`, which is what makes overlap structurally impossible.
- **`placement:"inline"`** → `[data-feeling-inline]` inside `[data-stop-card]`, directly below the caption body and above the "View N photos" link: a smaller pull-quote (≈1.25rem, `line-clamp-3`; `line-clamp-2` in overlay-caption themes) with the theme's rule/accent.
- Enter animation matches the stop cards (rise + fade via `whileInView`); with `prefers-reduced-motion` it is simply visible.

#### The four feeling faces (`next/font/google`, registered in `src/app/layout.tsx`)
Each theme gets its **own** display face, and the four are deliberately drawn from **four different type classes** — *elegant display serif · high-contrast didone · geometric techno grotesque · cursive handwriting*. No two share a register, and none shares a register with the app chrome (Fraunces, a soft old-style serif, + Inter). All are loaded `subsets: ["latin"], display: "swap"` with **exactly one weight each**, so the whole feature costs four small latin WOFF2 files.

| Theme | Google font | Register (type class) | CSS variable | Weight | Fallback stack (after the variable) |
|-------|-------------|-----------------------|--------------|--------|--------------------------------------|
| cinematic | **Playfair Display** | dramatic display serif — transitional, bracketed serifs, ball terminals | `--font-feeling-cinematic` | **600** | `Georgia, "Times New Roman", serif` |
| editorial | **Bodoni Moda** | high-contrast **didone** — flat unbracketed hairline serifs, vertical stress | `--font-feeling-editorial` | **700** | `"Didot", "Bodoni MT", "Times New Roman", serif` |
| minimal | **Space Grotesk** | geometric **techno** grotesque — squared terminals, mono-derived detailing | `--font-feeling-minimal` | **500** | `"Segoe UI", Roboto, system-ui, sans-serif` |
| vintage | **Caveat** | **cursive** handwriting — the set's one and only script | `--font-feeling-vintage` | **600** | `"Segoe Script", "Bradley Hand", cursive` |

**Why each face — decided against the theme's real palette (`src/components/story/themes/*.ts`), not in the abstract:**

- **cinematic → Playfair Display 600.** Cinematic's quote is light amber ink (`#fde68a → #fbbf24`) sitting on `#1c1917` behind `backdrop-blur(14px)` dark glass, inside a ground that already carries amber `drop-shadow` glow on the path. Light-on-dark **halation** thickens counters and eats fine strokes, so this theme needs the face with the most stem mass and the largest x-height of the four. Playfair at 600 has both, and reads exactly like a film title card. **Cormorant Garamond was considered and rejected here:** its small x-height (≈0.36 em vs Playfair's ≈0.52 em) and very fine SemiBold hairlines go wispy against a glowing dark ground, and it would set optically two steps small at the clamp **minimum** of 24 px and at the 20 px inline size — the same failure mode rejected for vintage below. Cormorant is the more *elegant* face; Playfair is the one that survives this specific ground.
- **editorial → Bodoni Moda 700.** Editorial is dark ink on light paper (`#fffaf1` card on the `#f6ecd6` textured ground, terracotta `#c96f45` accents) — the one theme with **no** halation risk, which is precisely where extreme didone contrast is at its best. Bodoni Moda supplies the magazine-masthead authority editorial's identity is built on. It is separated from cinematic's Playfair by class, not by degree: flat unbracketed hairline serifs vs bracketed serifs with ball terminals, far higher stroke contrast, and one step heavier (700 vs 600). **A script is the wrong register here and is explicitly out** — editorial's identity is paper-and-print typographic authority, not handwriting.
- **minimal → Space Grotesk 500** *(kept)*. The "robotic/techno" voice the owner welcomed: engineered, squared terminals, mono-derived detail, still restrained enough for minimal's white card and slate fade. Chosen over JetBrains Mono, which sets gappy and cramped at display size.
- **vintage → Caveat 600** *(kept — Pinyon Script checked and rejected on measured legibility)*. Caveat is the set's **only** cursive/handwritten face now that editorial has moved to a serif, so the "one true cursive" slot is filled and unambiguous. Pinyon Script is the more period-authentic copperplate, but the feeling face is rendered at **three** sizes and the binding one is not the card maximum:
  1. standalone quote `clamp(1.5rem, 4.2vw, 2.5rem)` → **24 px at mobile widths**, 40 px only on a wide viewport;
  2. inline pull-quote ≈ **20 px** (`line-clamp-3`);
  3. the editor textarea, which renders the same face at ≈ **20 px** while the owner types.

  Pinyon's x-height is ≈0.31 em → an effective x-height of ~7.4 px at 24 px and ~6.2 px at 20 px, below the ~9 px floor at which a script stays readable; its hairlines land under 1 CSS px at those sizes and are then washed out by vintage's faded-ink gradient (`#b1372f → #5a3a22`) against the `#fdf7e6` cream mat. The content is up to **200 characters over 5 clamped lines** — running text, not a two-word flourish. Caveat (x-height ≈0.47 em, marker-weight strokes) holds at all three sizes, and still replaces vintage's system-`cursive` `HAND` stack with a real, consistent face.

  > **Assumed:** the Pinyon-vs-Caveat call was made from the faces' published metrics against the exact rendered sizes this spec specifies (24 px / 20 px / 20 px above), not from a rendered screenshot. If the owner wants the copperplate look badly enough to trade legibility, the *only* safe swap is Pinyon Script at the standalone card **plus** keeping Caveat for the inline + editor renderings — which breaks "one face per theme" and is therefore not specified here.

**Registration (`src/app/layout.tsx`)** mirrors the shipped `--font-serif` / `--font-sans` pattern exactly: four `next/font/google` calls, each with `subsets: ["latin"]`, `display: "swap"`, its `variable` from the table, and its single `weight` as a string (`"600"` / `"700"` / `"500"` / `"600"`). All four `.variable` class names are appended to the existing `<html>` className. **Do not declare an `axes` option** for Bodoni Moda (a variable font with an `opsz` axis) — the default optical-size instance is what keeps its hairlines sturdy enough for the 20 px inline pull-quote, and it is what the gate expects.

Each theme's `feeling.quoteStyle.fontFamily` is `"var(--font-feeling-<theme>), <its fallback stack from the table>"`, so a face that fails to load degrades **within its own register** rather than falling back to Fraunces.

> **Assumed:** if `next/font/google` cannot resolve **Bodoni Moda** at `weight: "700"` on the pinned Next version, the sanctioned substitute is **Instrument Serif** at `weight: "400"` (same didone-adjacent editorial register, no `opsz` axis). Taking it requires exactly **one** other edit — the `FEELING_FACE` map in `tests/e2e/story-feeling.spec.ts` (see the gate in [`roadmap.md`](roadmap.md)), which is the single place the expected family names are written down. No other font may be substituted.

#### Colour treatment per theme (multi-colour where it suits, always legible)
`quoteStyle.color` is **always** a solid themed ink; `quoteGradient` is layered on top only when the browser reports `CSS.supports("-webkit-background-clip","text")` — otherwise (and during SSR / the first paint) the solid colour shows. Text can never render invisible.

| Theme | Card surface (from the theme's existing palette) | Ink |
|-------|--------------------------------------------------|-----|
| cinematic | dark glass — `rgba(10,8,6,0.62)` + `backdrop-blur(14px)`, amber hairline `rgba(245,158,11,0.28)`, deep shadow, `rounded-2xl` | gradient `linear-gradient(100deg,#fde68a,#fbbf24 45%,#fef3c7)`; solid fallback `#fde68a` |
| editorial | warm paper `#fffaf1`, terracotta ring `rgba(201,111,69,0.30)`, **4 px terracotta left rule** (`flourish:"rule"`), `shadow-xl` | duotone `linear-gradient(92deg,#c96f45,#8a4b2f 60%,#b1372f)`; solid fallback `#a1522f` |
| minimal | white `#ffffff`, `ring-1 ring-slate-900/10`, `rounded-xl`, `shadow-sm`, hairline top rule; maximal whitespace | restrained vertical duotone `linear-gradient(180deg,#0f172a,#475569)`; solid fallback `#0f172a` |
| vintage | cream mat `#fdf7e6`, `rotate(-1.5deg)`, `shadow-xl shadow-[#5a3a22]/25`, **washi tape strip** (`flourish:"tape"`, reusing the shipped tape treatment) | faded-ink gradient `linear-gradient(96deg,#b1372f,#8a4b2f 55%,#5a3a22)`; solid fallback `#5a3a22` |

No fifth look is invented — every colour above already exists in that theme's palette.

#### Beat heights (the anti-overlap budget)
| Theme | stop beat (`card.segmentHeight`, unchanged) | feeling beat | inline extra | feeling card max width |
|-------|--------------------------------------------|--------------|--------------|------------------------|
| cinematic | 440 | **380** | **+64** | `52%` / 620 px (≤ the 58% stop card) |
| editorial | 410 | **360** | **+56** | `46%` / 460 px |
| minimal | 400 | **320** | **+48** | `46%` / 460 px |
| vintage | 420 | **360** | **+56** | `44%` / 430 px |

Only **cinematic** has horizontally overlapping opposite-side cards (58% at a 2% inset), so it is the one theme whose safety depends on vertical clearance: adjacent centres are `(440+380)/2 = 410 px` apart while the two half-heights sum to at most `(371+348)/2 ≈ 360 px` — a ≥ 50 px gap. The other three keep a ≥ 4% horizontal centre gap, so they cannot collide at all.

### Screen: Public Story (`/s/[slug]`) — `slice-public-ui` *(Phase 2)*
Same story rendering as above but **read-only**: no header edit/Back-to-editor controls, no owner chrome, no login prompt. Served from `GET /api/public/trips/:slug`. In Phase 1 the **Share** button that would produce this link is a labelled stub.

## Error States

- **Auth:** wrong password → inline message; expired/absent session on a page → redirect to `/login`.
- **Geocoding down (502):** inline "Geocoding unavailable — enter the location manually," with the Manual tab and text-only save available.
- **Map tiles fail:** the map frame still renders; manual entry remains usable.
- **Upload failure (400/413/415/500):** per-file error chip with **Retry**; the stop and other media are unaffected (non-destructive). A video sent to the legacy multipart route returns **415** with the message *"video uploads must use the direct upload path"* (an internal guard the UI never triggers).
- **Video without a usable poster:** film-strip placeholder tile + filename (editor) / theme-tinted placeholder + ▶ (story). Never a broken image.
- **Video the browser can't decode:** poster + *"This video can't play in this browser"* + **Download**. Never a black box.
- **Feeling over 200 characters:** the textarea blocks input at the cap and the counter turns amber past 180; a 400 from the API surfaces in the drawer's error slot with the previous value retained.
- **Loading:** skeletons for the trip grid and story cards; upload progress bars; a subtle "Saved ✓ / Saving…" indicator in the editor.
- **Empty states:** home with no trips → friendly "Start your first trip"; a trip with no stops in the story → "No stops yet — add some in the editor."

## Tech Stack

Next.js 15 (App Router) + React 19 + Tailwind CSS; Framer Motion (enter/parallax), native SVG (`stroke-dashoffset`, `getTotalLength`/`getPointAtLength`) for draw-on-scroll, react-leaflet + Leaflet + OSM tiles for maps. Client fetches go through `src/lib/api-client.ts`. See `architecture.md#stack`.
