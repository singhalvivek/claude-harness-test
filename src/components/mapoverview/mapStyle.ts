// Per-theme map tile styling (Phase 2 refinement — the map "belongs" to the
// active story theme instead of looking like a generic OpenStreetMap drop-in).
//
// Pure data — NO `leaflet` import — so it is safe to import from server-evaluated
// client components (e.g. StoryReader) without breaking the ssr:false isolation
// that keeps Leaflet out of the SSR bundle.
//
// Base tiles are CARTO's keyless basemaps (dark / light) — free for light use,
// attribution required. A CSS `filter` (applied to the tile pane only) tints the
// light base into the warm/sepia grounds for the paper themes.

import type { StoryTheme } from "@/lib/api-client";

export interface MapTileStyle {
  url: string;
  attribution: string;
  /** Optional CSS filter applied to the tile pane only (not markers/route). */
  filter?: string;
}

const CARTO_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

const CARTO_DARK = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const CARTO_LIGHT = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";

export function mapStyleForTheme(theme: StoryTheme): MapTileStyle {
  switch (theme) {
    case "cinematic":
      // Dark basemap to sit on the black cinematic ground.
      return { url: CARTO_DARK, attribution: CARTO_ATTR };
    case "minimal":
      // Clean muted grey.
      return { url: CARTO_LIGHT, attribution: CARTO_ATTR };
    case "vintage":
      // Sepia/kraft wash over the light base.
      return {
        url: CARTO_LIGHT,
        attribution: CARTO_ATTR,
        filter: "sepia(0.55) saturate(1.25) hue-rotate(-12deg) brightness(0.99)",
      };
    case "editorial":
      // Warm paper tint over the light base.
      return {
        url: CARTO_LIGHT,
        attribution: CARTO_ATTR,
        filter: "sepia(0.28) saturate(1.12) brightness(1.02)",
      };
    default:
      return { url: CARTO_LIGHT, attribution: CARTO_ATTR };
  }
}
