# Capability: Curated Story Space

## What It Does
Turns each trip's story into a curated, decorated space rather than a bare list. Two layers work together:

1. **Per-stop motif** — the owner picks one decorative **motif** per stop in the editor (from a frozen 14-item enum). The story then renders that motif as an **animated ornament on the serpentine** (near the stop's node/anchor on the route) **and a small accent on the stop card**, drawn in the trip's theme color so it never clashes with the chosen `StoryTheme`.
2. **Themed ambient space** — a theme-aware ambient background, a warm intro and closing moment framing the journey, and richer reveal animations as each stop scrolls into view. These are render-only touches layered on top of the existing themed serpentine (see [`story-themes.md`](story-themes.md)); they add no new data shape.

This file owns the **`Stop.motif` data contract**; the animated ornament + card-accent rendering is owned by the story slice.

## The frozen motif enum (default: `none`)
`motif` is one of exactly these 14 ids, in canonical picker order:

`none` (default) · `flower` · `mountain` · `tree` · `train` · `plane` · `boat` · `car` · `tent` · `camera` · `star` · `compass` · `sun` · `heart`

- `none` renders **no** ornament (the plain route/card) — it is the default and the "clear" choice.
- The other 13 are place/mood cues an owner attaches to a stop (a `mountain` for a hike, a `plane` for a flight leg, a `camera` for a photo spot, and so on).
- The list is **frozen**: `MOTIF_IDS` in `src/lib/api-client.ts` is the single source of truth (`StopMotif = (typeof MOTIF_IDS)[number]`), and the API's `zod` enum is built from it, so the picker, the type, and the validator can never drift.

## Inputs
| Input | Type | Source | Required |
|-------|------|--------|----------|
| chosen motif (editor picker) | `StopMotif` | Editor motif picker → `PATCH /api/stops/:id { motif }` (or `POST …/stops { motif }` on create) | yes to change (defaults `none`) |
| trip (ordered stops + photos) + each `stop.motif` | full-trip JSON | `GET /api/trips/:id` · `GET /api/public/trips/:slug` | yes |
| trip `theme` (for ornament color) | `StoryTheme` | same full-trip JSON | yes |
| scroll progress | number 0..1 | Framer Motion `useScroll` | yes |
| `prefers-reduced-motion` | boolean | media query | yes |

## Outputs
| Output | Type | Destination |
|--------|------|-------------|
| persisted motif | `Stop.motif` column | SQLite (via `POST`/`PATCH`) |
| animated ornament | rendered DOM/SVG near the stop's route anchor | Reader browser |
| card accent | small themed motif mark on `[data-stop-card]` | Reader browser |
| motif selection UI | 14 swatches/labels, live-saved per stop | Editor |

## External Calls
| System | Operation | On Failure |
|--------|-----------|------------|
| `PATCH /api/stops/:id` | persist `{ motif }` on pick | surface save error; keep prior motif (non-destructive) |
| `POST /api/trips/:id/stops` | persist `{ motif }` on stop create | surface create error |
| `GET /api/trips/:id` · `GET /api/public/trips/:slug` | read `motif` with each stop | absent/unknown value renders as `none` (no ornament) |

## Business Rules
- `motif` is one of the 14 frozen ids; unknown values are rejected by the API (`zod` enum → **400**) and never persisted, on both stop create and stop patch.
- Default is **`none`** via the DB column default; a stop created without a motif reads back `none` and renders no ornament.
- Adding the field is a **single additive migration** (`20260724120000_stop_motif`: `ALTER TABLE "Stop" ADD COLUMN "motif" TEXT NOT NULL DEFAULT 'none'`) — existing stops backfill to `none`, no table reset, no data loss.
- `motif` is returned on **every** serialized stop — owner trip GET, public trip GET (so shared links get motifs too), and stop create/patch responses — so the frontend can always read `stop.motif`.
- Motif is **styling-only**: it changes no data shape beyond the single `Stop.motif` field and touches no photo/tag/location data. Updates are non-destructive (patching `motif` alone leaves all other stop fields untouched).
- The ornament is **theme-colored**: it draws in the active `StoryTheme`'s palette and must not break the frozen story DOM hooks (`[data-serpentine]`, `[data-story-marker]`, `[data-cover-photo]`, `[data-stop-card]`).
- The ornament respects `prefers-reduced-motion`: it renders statically (no looping animation) when reduced motion is requested.

## Success Criteria
- [ ] A stop created without a motif reads back `motif: "none"` from `GET /api/trips/:id`.
- [ ] Setting a motif on a stop (create or `PATCH`) persists it and, after reload, the editor and story reflect the chosen motif.
- [ ] `POST`/`PATCH` with an unknown motif value returns **400** and does not persist (the stop's prior motif is unchanged).
- [ ] `motif` is present on every stop in the owner trip GET, the public trip GET, and the stop create/patch responses.
- [ ] A stop with a non-`none` motif renders its animated ornament on the serpentine and a card accent, in the trip's theme color; a `none` stop renders neither.
- [ ] With `prefers-reduced-motion`, the ornament renders statically without looping animation.

See `../api.md` (`StopMotif`), `../data.md` (`Stop.motif`), and [`story-themes.md`](story-themes.md).
