// Per-theme ambient decor recipe. A tiny data module (no JSX) that describes the
// handful of decorative sprites drifting behind each theme's story — cinematic
// warm light orbs/bokeh, vintage paper scraps + postage stamps + dotted marks,
// editorial ink flourishes + leaf shapes, minimal quiet floating geometry.
//
// `AmbientDecor` reads this and renders each sprite low-opacity, pointer-events
// none, BEHIND the path + cards, drifting with subtle scroll parallax (static
// under reduced-motion). Kept to ~8–10 elements per theme for performance.

import type { StoryTheme } from "@/lib/api-client";

export type DecorKind =
  | "orb" // soft radial glow disc (cinematic)
  | "dot" // small filled dot (vintage / minimal)
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
  /** Element opacity (kept low so legibility is never harmed). */
  opacity: number;
  /** Static rotation (deg). */
  rotate?: number;
  /** Rendered color (already resolved from the theme palette). */
  color: string;
}

export interface DecorPalette {
  /** Theme accent (marker color). */
  accent: string;
  /** Theme ink / heading color. */
  ink: string;
  /** Theme ground background color. */
  ground: string;
}

/**
 * The decorative sprite set for a theme, resolved against its live palette.
 * Positions are spread down the full story height so the empty margins on both
 * sides of the serpentine feel lived-in rather than blank.
 */
export function getDecor(theme: StoryTheme, p: DecorPalette): DecorSprite[] {
  switch (theme) {
    case "cinematic":
      // Warm light orbs / bokeh, all in the amber accent, drifting slowly.
      return [
        { id: "c1", kind: "orb", left: 8, top: 6, size: 220, depth: 0, opacity: 0.16, color: p.accent },
        { id: "c2", kind: "orb", left: 82, top: 12, size: 150, depth: 2, opacity: 0.14, color: p.accent },
        { id: "c3", kind: "orb", left: 68, top: 30, size: 90, depth: 1, opacity: 0.18, color: p.accent },
        { id: "c4", kind: "orb", left: 14, top: 44, size: 120, depth: 2, opacity: 0.13, color: p.accent },
        { id: "c5", kind: "orb", left: 88, top: 58, size: 200, depth: 0, opacity: 0.12, color: p.accent },
        { id: "c6", kind: "orb", left: 6, top: 70, size: 80, depth: 1, opacity: 0.2, color: p.accent },
        { id: "c7", kind: "orb", left: 74, top: 82, size: 160, depth: 2, opacity: 0.13, color: p.accent },
        { id: "c8", kind: "orb", left: 22, top: 92, size: 110, depth: 1, opacity: 0.15, color: p.accent },
      ];
    case "vintage":
      // Faint paper scraps, postage stamps and dotted marks in ink brown.
      return [
        { id: "v1", kind: "scrap", left: 6, top: 8, size: 66, depth: 1, opacity: 0.22, rotate: -8, color: p.ink },
        { id: "v2", kind: "stamp", left: 84, top: 14, size: 52, depth: 2, opacity: 0.26, rotate: 6, color: p.accent },
        { id: "v3", kind: "dot", left: 72, top: 26, size: 10, depth: 0, opacity: 0.32, color: p.ink },
        { id: "v4", kind: "scrap", left: 88, top: 40, size: 54, depth: 0, opacity: 0.2, rotate: 7, color: p.ink },
        { id: "v5", kind: "dot", left: 12, top: 50, size: 8, depth: 2, opacity: 0.34, color: p.accent },
        { id: "v6", kind: "stamp", left: 8, top: 64, size: 46, depth: 1, opacity: 0.24, rotate: -5, color: p.ink },
        { id: "v7", kind: "dot", left: 80, top: 72, size: 12, depth: 1, opacity: 0.3, color: p.ink },
        { id: "v8", kind: "scrap", left: 20, top: 86, size: 60, depth: 2, opacity: 0.2, rotate: 5, color: p.accent },
      ];
    case "editorial":
      // Light ink flourishes + leaf shapes in the terracotta accent / brown ink.
      return [
        { id: "e1", kind: "leaf", left: 7, top: 9, size: 68, depth: 1, opacity: 0.18, rotate: -18, color: p.accent },
        { id: "e2", kind: "flourish", left: 80, top: 16, size: 130, depth: 2, opacity: 0.16, rotate: 8, color: p.accent },
        { id: "e3", kind: "leaf", left: 86, top: 36, size: 56, depth: 0, opacity: 0.16, rotate: 24, color: p.ink },
        { id: "e4", kind: "flourish", left: 10, top: 48, size: 120, depth: 2, opacity: 0.14, rotate: -10, color: p.ink },
        { id: "e5", kind: "leaf", left: 74, top: 62, size: 62, depth: 1, opacity: 0.18, rotate: -30, color: p.accent },
        { id: "e6", kind: "flourish", left: 12, top: 74, size: 110, depth: 0, opacity: 0.15, rotate: 12, color: p.accent },
        { id: "e7", kind: "leaf", left: 84, top: 88, size: 58, depth: 2, opacity: 0.16, rotate: 16, color: p.ink },
      ];
    case "minimal":
    default:
      // Quiet floating geometric marks in slate.
      return [
        { id: "m1", kind: "ring", left: 9, top: 8, size: 64, depth: 1, opacity: 0.5, color: p.accent },
        { id: "m2", kind: "square", left: 82, top: 15, size: 44, depth: 2, opacity: 0.45, rotate: 12, color: p.ink },
        { id: "m3", kind: "plus", left: 70, top: 30, size: 30, depth: 0, opacity: 0.5, color: p.accent },
        { id: "m4", kind: "ring", left: 88, top: 46, size: 40, depth: 2, opacity: 0.45, color: p.ink },
        { id: "m5", kind: "plus", left: 12, top: 54, size: 26, depth: 1, opacity: 0.5, color: p.ink },
        { id: "m6", kind: "square", left: 8, top: 70, size: 52, depth: 0, opacity: 0.4, rotate: -8, color: p.accent },
        { id: "m7", kind: "ring", left: 78, top: 80, size: 56, depth: 1, opacity: 0.45, color: p.accent },
        { id: "m8", kind: "plus", left: 24, top: 90, size: 28, depth: 2, opacity: 0.5, color: p.ink },
      ];
  }
}
