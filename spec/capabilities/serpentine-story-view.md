# Capability: Serpentine Story View

## What It Does
Renders a trip as a scroll-driven visual narrative: a winding SVG path draws itself as the reader scrolls, stops animate into view along it, cover photos gain parallax depth, and a marker travels the route.

## Inputs
| Input | Type | Source | Required |
|-------|------|--------|----------|
| trip (ordered stops + photos) | full-trip JSON | `GET /api/trips/:id` (owner preview P1) | yes |
| scroll progress | number 0..1 | window scroll listener / Framer Motion `useScroll` | yes |

## Outputs
| Output | Type | Destination |
|--------|------|-------------|
| animated story | rendered DOM/SVG | Reader browser |
| path draw | `stroke-dashoffset` bound to scroll | `<path data-serpentine>` |
| marker position | point via `getPointAtLength(progress·total)` | traveling marker element |

## External Calls
| System | Operation | On Failure |
|--------|-----------|------------|
| `/api/media/[...key]` | stream cover + gallery photos | broken image → placeholder frame; layout intact |

## Business Rules
- Stops render in `order` ascending, alternating left/right along the path.
- Path length is measured with `getTotalLength()`; `stroke-dashoffset` interpolates from full-length (hidden) to 0 (fully drawn) across scroll — the path **draws itself**.
- Each stop card enters via a viewport-triggered animation (fade + slide + pop) as it scrolls into view; cover photos translate on scroll for parallax depth.
- Respects `prefers-reduced-motion`: path renders fully drawn, cards simply fade, no scroll-jacking.
- Read-only rendering — no edit controls appear in the story (owner has a "Back to editor" affordance in P1; the public P2 view has none).
- Deferred controls (**Map overview**, **Share**) render as labelled "coming soon" stubs, never broken.

## Success Criteria
- [ ] Opening a trip with ≥ 3 stops renders an `svg path[data-serpentine]` whose `stroke-dashoffset` differs between top-of-page and after scrolling (path is drawing).
- [ ] Scrolling brings at least one stop card into its visible state (opacity transitions to 1 as it enters the viewport).
- [ ] A cover photo `<img>` loads with `naturalWidth > 0` and shifts (parallax transform) as the page scrolls.
- [ ] The traveling marker's position advances as scroll progress increases.
- [ ] With `prefers-reduced-motion`, the path shows fully drawn and cards are visible without scroll animation.
