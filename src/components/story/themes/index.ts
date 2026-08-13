// Per-theme visual treatments for the serpentine story view (Phase 1.5).
//
// One self-contained module per `StoryTheme` value (cinematic / editorial /
// minimal / vintage), each supplying a filled story-root background, a signature
// texture/glow layer, header + path + marker styling, a densified segment height
// (390–440px, down from the shipped 560), a collision-safe card treatment, and
// the reader-chrome colors consumed by the story page. Geometry math stays shared
// in `serpentine.ts`; only the *look* differs — the serpentine, marker, parallax
// and stop cards remain present and functional in every theme.

import type { StoryTheme } from "@/lib/api-client";
import type { StoryThemeTreatment } from "./types";
import { cinematic } from "./cinematic";
import { editorial } from "./editorial";
import { minimal } from "./minimal";
import { vintage } from "./vintage";

export type {
  StoryThemeTreatment,
  CardTreatment,
  MarkerTreatment,
  StoryChrome,
} from "./types";

const TREATMENTS: Record<StoryTheme, StoryThemeTreatment> = {
  cinematic,
  editorial,
  minimal,
  vintage,
};

/** All four themes in stable order, for any UI that enumerates them. */
export const STORY_THEMES: StoryTheme[] = ["cinematic", "editorial", "minimal", "vintage"];

/**
 * Resolve a `StoryTheme` to its treatment. An unknown / missing value falls back
 * to `cinematic` (the product default), matching the API — the DB column
 * defaults to `cinematic` and unknown values are rejected before they persist.
 */
export function getTheme(theme?: string | null): StoryThemeTreatment {
  if (theme && Object.prototype.hasOwnProperty.call(TREATMENTS, theme)) {
    return TREATMENTS[theme as StoryTheme];
  }
  return cinematic;
}
