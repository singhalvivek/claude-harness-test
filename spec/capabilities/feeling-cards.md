# Capability: Feeling Cards

## What It Does
Lets the owner write one short **feeling** per stop and choose, **per stop**, whether it becomes its own quote-styled **card standing on the serpentine path as its own beat** (big display type, no photo) or a **pull-quote inside the stop's card** — rendered in a font, colour and surface that belong to the trip's theme.

## Inputs
| Input | Type | Source | Required |
|-------|------|--------|----------|
| feeling text | string, ≤ 200 chars (trimmed; empty → `null`) | Stop editor textarea, autosave-on-blur → `PATCH /api/stops/:id { feeling }` | no |
| placement | `"card" \| "inline" \| "none"` (default `"card"`) | Stop editor segmented toggle, live-save → `PATCH /api/stops/:id { feelingPlacement }` | no |
| trip theme | `StoryTheme` | `Trip.theme` | yes (drives the treatment) |
| `prefers-reduced-motion` | boolean | media query | yes |

## Outputs
| Output | Type | Destination |
|--------|------|-------------|
| persisted feeling | `Stop.feeling`, `Stop.feelingPlacement` | Neon Postgres |
| standalone beat | `[data-feeling-card]` element anchored on the serpentine | Reader browser (owner story + public share page) |
| inline pull-quote | `[data-feeling-inline]` block **inside** `[data-stop-card]` | Reader browser |
| authoring UI | textarea + live counter + placement toggle in the stop drawer | Editor |

## External Calls
| System | Operation | On Failure |
|--------|-----------|------------|
| `PATCH /api/stops/:id` | persist `{ feeling }` on blur / `{ feelingPlacement }` on toggle | surface the error in the drawer's shared error slot; keep the previous value (non-destructive) |
| `GET /api/trips/:id` · `GET /api/public/trips/:slug` | read `feeling` + `feelingPlacement` with every stop | absent/unknown placement falls back to `"card"`; a null feeling renders nothing |

## Business Rules
- **Nothing renders when `feeling` is null or blank**, whatever the placement — so every existing stop (backfilled to `feeling = NULL`, `feelingPlacement = 'card'`) looks exactly as it does today.
- `feelingPlacement` is one of `card | inline | none`; unknown values are rejected at the API boundary (zod enum → 400) and never persisted. `"none"` keeps the text saved but renders nothing (a "hide without deleting" escape hatch).
- Exactly **one** rendering per stop: `card` → the standalone beat only; `inline` → the pull-quote only.
- **`card` is a real beat on the path.** The serpentine is built from an ordered list of **beats**, not stops: a stop with `feelingPlacement === "card"` and a non-blank feeling contributes a **second beat immediately after its own**. Beats alternate sides exactly as stops do today, so a feeling card sits on the opposite side of, and just below, its stop. The path, the traveling marker, and the total track height all flow through it. See the geometry contract in [`../architecture.md#module-contracts`](../architecture.md#module-contracts).
- **Cards can never overlap.** Guaranteed structurally, not by tuning:
  - each beat is allotted a per-theme height (`card.segmentHeight` for a stop beat, `feeling.segmentHeight` for a feeling beat, `+ feeling.inlineExtraHeight` for a stop beat carrying an inline pull-quote);
  - a card is vertically centred on its beat, so the gap between two adjacent card centres is exactly `(h_i + h_{i+1}) / 2`;
  - the feeling card carries a hard `maxHeight = feeling.segmentHeight − 32` with `overflow: hidden` and a 5-line clamp, so its rendered height can never exceed its allotment;
  - therefore adjacent cards always clear each other by ≥ 24 px. The gate asserts non-intersecting bounding boxes across **all** `[data-stop-card]` and `[data-feeling-card]` elements.
- **A feeling card carries no photo** — it is a quote surface only: an opening quote mark, the feeling in the theme's display face, and a small themed rule/flourish.
- **Typography and colour are per-theme, expressive, and readable.** Each theme gets its own display face, and the four faces come from **four different type classes** — a dramatic display serif, a high-contrast didone, a geometric techno grotesque, and one cursive — so no two themes read as variants of each other, and none reads as the app's normal chrome. Two constraints are binding: **no theme may use more than one face** (the standalone card, the inline pull-quote and the editor textarea all use the theme's single face, at 40/24/20 px), and **`editorial` is never set in a script** — its identity is printed typographic authority. See [`../ui.md`](../ui.md) for the four faces, weights, CSS variables, fallback stacks and the colour treatments. Multi-colour (gradient-clipped) text must always degrade to a solid themed colour where `background-clip: text` is unsupported.
- **A face must stay legible at its smallest rendered size, not just its largest** — the inline pull-quote and the editor textarea render at ≈20 px, which is what disqualifies hairline copperplate scripts; this is a rule about the *choice* of face, not a runtime behaviour.
- **The card surface matches its theme** — cinematic's dark glass, editorial's paper with a terracotta rule, minimal's restraint, vintage's taped mat. No fifth look is invented; every colour comes from the theme's existing palette.
- **`prefers-reduced-motion`:** the feeling card is simply present and fully visible — no enter animation, no drift.
- Authoring follows the shipped conventions: **autosave-on-blur** for the text, live-save on toggle for the placement, non-destructive (`PATCH` omits every field it does not change; the drawer's explicit **Save stop** never sends `feeling`, so it can never clobber an autosaved value).

## Frozen DOM hooks
- `[data-feeling-card]` — the standalone beat. It is **never** a descendant of `[data-stop-card]`.
- `[data-feeling-quote]` — the quote **text node** (what the gate measures `font-family` / colour on). It carries the theme's feeling face directly, and appears in **both** placements: inside `[data-feeling-card]`, and inside `[data-feeling-inline]`.
- `[data-feeling-inline]` — the pull-quote block, **always** inside `[data-stop-card]`; its text node is a `[data-feeling-quote]` at the smaller ≈20 px size.
- The Phase-1/1.5/2 hooks are unaffected and keep working: `[data-serpentine]`, `[data-story-marker]`, `[data-cover-photo]`, `[data-stop-card]`, `[data-theme]`, `[data-theme-signature]`.

## Success Criteria
- [ ] Typing a feeling in the stop drawer and blurring persists it; reopening the drawer and reloading the page both show it. The counter blocks/flags input past 200 characters and the API returns **400** for a longer value.
- [ ] A stop with `feelingPlacement:"card"` renders a **separate** `[data-feeling-card]` on the story that is **not** inside any `[data-stop-card]`, and contains the feeling text.
- [ ] A stop with `feelingPlacement:"inline"` renders `[data-stop-card] [data-feeling-inline]` containing the feeling text, and renders **no** `[data-feeling-card]` for that stop.
- [ ] Switching placement and reloading shows the other rendering; `"none"` renders neither.
- [ ] All four themes render `[data-feeling-quote]` with a **different computed `font-family`** from each other and from the app default (`Fraunces` / `Inter`), and each resolves to its specified face — cinematic **Playfair Display**, editorial **Bodoni Moda**, minimal **Space Grotesk**, vintage **Caveat** — matched against the `next/font` hashed family name (e.g. `__Playfair_Display_…`).
- [ ] The face that renders is the **real webfont, not a metrics fallback**: after `document.fonts.ready`, the first family token of the computed `font-family` does not contain `Fallback` and `document.fonts.check()` returns true for it.
- [ ] Each theme's `[data-feeling-quote]` carries a deliberate non-default colour treatment (a themed solid ink or a gradient-clipped fill), and the four `color` + `backgroundImage` pairs are all distinct.
- [ ] The inline pull-quote uses the **same** face as its theme's standalone card (same computed `font-family`, smaller `font-size`).
- [ ] With feeling cards interleaved, the serpentine still draws on scroll (`stroke-dashoffset` shrinks), the marker still travels, and **no two** `[data-stop-card]`/`[data-feeling-card]` bounding boxes intersect.
- [ ] A stop with no feeling renders exactly as before (no extra beat, no layout change).
- [ ] With `prefers-reduced-motion`, feeling cards are fully visible without scrolling.
