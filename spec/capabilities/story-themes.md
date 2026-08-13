# Capability: Story Themes

## What It Does
Lets the owner pick one of four visual **themes** per trip in the editor; the serpentine story view then renders that trip in the chosen theme (default **cinematic**), while keeping the signature draw-on-scroll serpentine + traveling marker present and functional in every theme.

## Why (the five complaints this fixes)
Testing the Phase-1 story, the owner found the single look weak: (1) too much empty vertical space between stops, (2) plain cards, (3) small photos, (4) colors/fonts/path styling felt off, (5) an empty background. Chosen direction: **multiple story looks, selected per trip to match a place's mood** — not one restyle. Every theme below is designed to fix **all five** complaints (dense spacing, premium cards, large photos, a filled/rich background, refined type + path).

## The four themes (default: `cinematic`)

Each theme is a self-contained treatment (palette, typography, background, card style, path + marker styling, and a densified segment height). All four keep stops alternating left/right along the serpentine and preserve reduced-motion behavior.

### `cinematic` (DEFAULT)
- **Look:** dark, immersive canvas; large **near-full-bleed** cover photo as a hero per stop; glassy translucent (frosted) caption cards floating over the imagery.
- **Fixes:** *spacing* — dense segment rhythm; *cards* — glass/translucent premium cards with soft shadow + border glow; *photos* — hero-scale, the largest of any theme; *type/path* — bright display type over dark ground, a **glowing** path (bright stroke + blur/soft-glow) and a glowing marker; *background* — dark ground with a subtle vignette/gradient fill (never blank).

### `editorial`
- **Look:** the current warm paper + terracotta feel, **refined and densified** — tighter vertical rhythm, richer cards, better serif typography.
- **Fixes:** *spacing* — materially tighter than the shipped ~560px segment; *cards* — richer bordered cards with a warm tint and stronger shadow; *photos* — larger than shipped; *type/path* — a refined serif scale and the existing terracotta path/marker, kept warm; *background* — a **textured/tinted** paper background (not the current blank off-white).

### `minimal`
- **Look:** airy but intentional — restrained neutral palette, clean sans-serif, generous but purposeful whitespace.
- **Fixes:** *spacing* — intentional (still denser than shipped, tuned so cards never overlap); *cards* — clean, low-chrome cards with a hairline border and larger photos; *photos* — large, edge-to-edge within the card; *type/path* — neutral sans typography and a **thin, understated** path + small quiet marker; *background* — a **subtle tonal / gridded** ground (not empty white).

### `vintage`
- **Look:** scrapbook / postcard — taped or framed photos, stamp accents, handwritten-style headings.
- **Fixes:** *spacing* — dense scrapbook layout; *cards* — postcard/taped-frame cards with a paper mat and slight rotation; *photos* — large framed prints; *type/path* — handwritten-style display headings and a **dashed** route line with a stamp-style marker; *background* — a **textured kraft-paper** ground.

## Invariant: the serpentine survives in every theme
The signature interaction is **unchanged across all four themes** — only styling differs:
- The draw-on-scroll SVG path stays a single `<path data-serpentine>` whose `stroke-dashoffset` is bound to scroll progress (path draws itself as you scroll).
- The traveling marker stays `[data-story-marker]` and travels the route on scroll.
- Cover photos keep parallax; stop cards keep the fade + slide + pop enter.
- Per theme, only the **look** of these elements changes: glowing (cinematic), terracotta (editorial), thin/neutral (minimal), dashed (vintage). Geometry (`serpentinePathD`, `nodeAnchors`) is shared; each theme supplies a **densified segment height** (the shipped ~560px/segment is too airy — themes target roughly the **380–440px** range, tuned per theme so cards never overlap).

## Root contract (frozen DOM hooks)
- The story root renders `data-theme="<theme>"` (one of the four values) so the styling cascade and the E2E can select `[data-theme="cinematic"]`. The themed **filled background** lives on that same story root (its computed background is never blank white / transparent / `none`).
- The rendered story exposes a per-theme **signature element** `[data-theme-signature]` (owned by the story slice, one per theme — e.g. the glow layer, the paper texture, the kraft ground) so the E2E can deterministically assert each theme rendered.
- The Phase-1 hooks stay frozen and functional in every theme: `[data-serpentine]`, `[data-story-marker]`, `[data-cover-photo]`, `[data-stop-card]`.

See `../api.md` (`StoryTheme`) and `../architecture.md#module-contracts`.

## Inputs
| Input | Type | Source | Required |
|-------|------|--------|----------|
| trip (ordered stops + photos) + `theme` | full-trip JSON | `GET /api/trips/:id` | yes |
| chosen theme (editor picker) | `StoryTheme` | Editor ThemePicker → `PATCH /api/trips/:id { theme }` | yes to change (defaults `cinematic`) |
| scroll progress | number 0..1 | Framer Motion `useScroll` | yes |
| `prefers-reduced-motion` | boolean | media query | yes |

## Outputs
| Output | Type | Destination |
|--------|------|-------------|
| themed story | rendered DOM/SVG under `[data-theme]` | Reader browser |
| persisted theme | `Trip.theme` column | SQLite (via `PATCH`/`POST`) |
| theme selection UI | 4 swatches/labels, live-saved | Editor |

## External Calls
| System | Operation | On Failure |
|--------|-----------|------------|
| `PATCH /api/trips/:id` | persist `{ theme }` on pick | surface save error; keep prior theme (non-destructive) |
| `GET /api/trips/:id` | read `theme` with the trip | absent/unknown value falls back to `cinematic` |
| `/api/media/[...key]` | stream cover + gallery photos | broken image → placeholder frame; layout intact |

## Business Rules
- `theme` is one of `cinematic | editorial | minimal | vintage`; unknown values are rejected by the API (zod enum → 400) and never persisted.
- Default is **`cinematic`** via the DB column default; a trip created without a theme reads back `cinematic`.
- Adding the theme is a **single additive migration** (`ALTER TABLE ... ADD COLUMN theme ... DEFAULT 'cinematic'`) — existing trips backfill to `cinematic`, no table reset, no data loss.
- Every theme keeps the serpentine path (`[data-serpentine]`), the traveling marker (`[data-story-marker]`), parallax cover (`[data-cover-photo]`), and stop cards (`[data-stop-card]`) present and functional — those DOM hooks are frozen and the Phase-1 story E2E keeps asserting them.
- Every theme **materially reduces** the dead vertical space between stops relative to the shipped ~560px/segment, uses premium cards, larger photos, and a **filled** background.
- Every theme respects `prefers-reduced-motion`: the path renders fully drawn and cards simply fade — no scroll-jacking, in every theme.
- Theme is styling-only: it changes no data shape beyond the single `Trip.theme` field and touches no stop/photo data.

## Success Criteria
- [ ] A trip created without a theme reads back `theme: "cinematic"` from `GET /api/trips/:id`, and its story root renders `[data-theme="cinematic"]`.
- [ ] Picking each of the four themes in the editor persists it (`PATCH` succeeds) and, after reload, the editor and story reflect the chosen theme.
- [ ] For all four themes, the story renders its `data-theme` value plus the `[data-theme-signature]` element, keeps `svg path[data-serpentine]` drawing on scroll (dashoffset changes) and a stop card animating in.
- [ ] The rendered cover photo box is materially larger than a thumbnail (rendered width > 340px; cinematic aims much larger / near-full-bleed).
- [ ] The story root's computed background is non-default (not blank white, not `rgba(0,0,0,0)`, not `none`) in every theme.
- [ ] `PATCH`/`POST` with an unknown theme value returns 400 and does not persist.
- [ ] With `prefers-reduced-motion`, every theme shows the path fully drawn and cards visible without scroll animation.
