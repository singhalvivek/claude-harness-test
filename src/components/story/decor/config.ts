// Per-theme ambient decor recipe. A data module (no JSX) that describes the
// decorative sprites drifting behind each theme's story — cinematic warm light
// orbs/bokeh + faint star specks, vintage paper scraps + postage stamps + dotted
// marks, editorial ink flourishes + leaves + dots, minimal quiet geometry.
//
// Sprites are generated DENSELY and DETERMINISTICALLY (a seeded hash of the
// index — same on server + client, so no hydration mismatch and no use of
// Date/Math.random) and spread across the full story height so the margins on
// both sides of the serpentine feel curated and lived-in rather than blank.
// `AmbientDecor` renders each one low-opacity, pointer-events none, BEHIND the
// path + cards, drifting with subtle scroll parallax (static under reduced-motion).

import type { StoryTheme } from "@/lib/api-client";

export type DecorKind =
  | "orb" // soft radial glow disc (cinematic)
  | "dot" // small filled dot (star speck / vintage dot / minimal)
  | "ring" // hollow circle (minimal)
  | "square" // rotated hollow square (minimal)
  | "plus" // small plus / cross mark (minimal)
  | "scrap" // torn paper rectangle (vintage)
  | "stamp" // dashed-edge postage square (vintage)
  | "leaf" // leaf silhouette (editorial)
  | "flourish"; // ink swirl stroke (editorial)

export interface DecorSprite {
  id: string;
  kind: DecorKind;
  /** Left position as a percentage of the story box. */
  left: number;
  /** Top position as a percentage of the story box. */
  top: number;
  /** Base pixel size (width = height for most kinds). */
  size: number;
  /** Parallax band: 0 = far/slow, 1 = mid, 2 = near/fast. */
  depth: 0 | 1 | 2;
  /** Element opacity (kept modest so legibility is never harmed). */
  opacity: number;
  /** Static rotation (deg). */
  rotate?: number;
  /** Rendered color (already resolved from the theme palette). */
  color: string;
}

export interface DecorPalette {
  accent: string;
  ink: string;
  ground: string;
}

/** Deterministic 0..1 pseudo-random from an index + salt (SSR-safe). */
function seeded(i: number, salt: number): number {
  const x = Math.sin((i + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

interface KindSpec {
  kind: DecorKind;
  /** Weight in the mix. */
  w: number;
  sizeMin: number;
  sizeMax: number;
  opMin: number;
  opMax: number;
  /** 0 → accent, 1 → ink, 2 → alternate by index. */
  color: 0 | 1 | 2;
}

interface Recipe {
  count: number;
  specs: KindSpec[];
}

const RECIPES: Record<StoryTheme, Recipe> = {
  cinematic: {
    count: 34,
    specs: [
      { kind: "orb", w: 5, sizeMin: 70, sizeMax: 260, opMin: 0.1, opMax: 0.2, color: 0 },
      { kind: "dot", w: 6, sizeMin: 3, sizeMax: 7, opMin: 0.35, opMax: 0.75, color: 0 }, // star specks
    ],
  },
  vintage: {
    count: 30,
    specs: [
      { kind: "scrap", w: 3, sizeMin: 44, sizeMax: 96, opMin: 0.26, opMax: 0.46, color: 2 },
      { kind: "stamp", w: 2, sizeMin: 40, sizeMax: 66, opMin: 0.3, opMax: 0.5, color: 0 },
      { kind: "dot", w: 3, sizeMin: 6, sizeMax: 14, opMin: 0.32, opMax: 0.5, color: 2 },
      { kind: "plus", w: 1, sizeMin: 16, sizeMax: 26, opMin: 0.3, opMax: 0.45, color: 1 },
    ],
  },
  editorial: {
    count: 28,
    specs: [
      { kind: "leaf", w: 3, sizeMin: 44, sizeMax: 84, opMin: 0.16, opMax: 0.3, color: 2 },
      { kind: "flourish", w: 2, sizeMin: 90, sizeMax: 150, opMin: 0.14, opMax: 0.26, color: 2 },
      { kind: "dot", w: 3, sizeMin: 5, sizeMax: 11, opMin: 0.2, opMax: 0.4, color: 2 },
    ],
  },
  minimal: {
    count: 30,
    specs: [
      { kind: "ring", w: 3, sizeMin: 30, sizeMax: 66, opMin: 0.32, opMax: 0.5, color: 2 },
      { kind: "square", w: 2, sizeMin: 30, sizeMax: 56, opMin: 0.3, opMax: 0.48, color: 2 },
      { kind: "plus", w: 2, sizeMin: 20, sizeMax: 34, opMin: 0.32, opMax: 0.5, color: 2 },
      { kind: "dot", w: 3, sizeMin: 5, sizeMax: 12, opMin: 0.3, opMax: 0.5, color: 1 },
    ],
  },
};

/** Pick a kind spec by the weighted mix using a 0..1 roll. */
function pickSpec(specs: KindSpec[], roll: number): KindSpec {
  const total = specs.reduce((s, k) => s + k.w, 0);
  let acc = roll * total;
  for (const s of specs) {
    acc -= s.w;
    if (acc <= 0) return s;
  }
  return specs[specs.length - 1];
}

/**
 * The decorative sprite set for a theme, resolved against its live palette and
 * spread densely down the full story height (both margins) so the space feels
 * curated. Deterministic → identical on server and client.
 */
export function getDecor(theme: StoryTheme, p: DecorPalette): DecorSprite[] {
  const recipe = RECIPES[theme] ?? RECIPES.minimal;
  const out: DecorSprite[] = [];
  const n = recipe.count;

  for (let i = 0; i < n; i++) {
    const r1 = seeded(i, 1);
    const r2 = seeded(i, 2);
    const r3 = seeded(i, 3);
    const r4 = seeded(i, 4);
    const r5 = seeded(i, 5);
    const spec = pickSpec(recipe.specs, r1);

    // Even vertical distribution across the full height, with gentle jitter.
    const band = 100 / n;
    const top = Math.min(99, Math.max(1, (i + 0.5) * band + (r2 - 0.5) * band * 0.9));

    // Bias horizontally toward the side margins (where the empty space lives),
    // but allow the full width; decor behind an opaque card is simply hidden.
    const edge = r3 < 0.5;
    const left = edge ? 1 + r4 * 26 : 73 + r4 * 26;

    const size = Math.round(spec.sizeMin + r5 * (spec.sizeMax - spec.sizeMin));
    const opacity = +(spec.opMin + seeded(i, 6) * (spec.opMax - spec.opMin)).toFixed(3);
    const color = spec.color === 0 ? p.accent : spec.color === 1 ? p.ink : i % 2 === 0 ? p.accent : p.ink;
    const rotate = Math.round((seeded(i, 7) - 0.5) * 40);

    out.push({
      id: `${theme}-${i}`,
      kind: spec.kind,
      left: +left.toFixed(2),
      top: +top.toFixed(2),
      size,
      depth: (i % 3) as 0 | 1 | 2,
      opacity,
      rotate,
      color,
    });
  }

  return out;
}
