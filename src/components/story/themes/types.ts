import type { CSSProperties } from "react";
import type { StoryTheme } from "@/lib/api-client";

// The per-theme visual contract for the serpentine story (Phase 1.5).
//
// A theme is pure data: className strings + inline `style` objects + a few
// flags, consumed by the shared StoryView / StopCard / story page. Dynamic
// per-theme COLORS, gradients and backgrounds are expressed as inline styles
// (not Tailwind arbitrary values) so they are robust regardless of the CSS
// build, while structural utilities stay as Tailwind classes. Every theme keeps
// the frozen DOM hooks rendered by the shared components — only the *look*
// differs: `[data-serpentine]`, `[data-story-marker]`, `[data-cover-photo]`,
// `[data-stop-card]`, `[data-theme]`, `[data-theme-signature]`.

/** Cover framing + card typography for a theme (consumed by StopCard). */
export interface CardTreatment {
  /** Card width as a percentage of the track width. Tuned per theme so that,
   *  given the theme's card height and segment rhythm, opposite-side cards
   *  never collide (short hero cards may run wider than tall caption-below ones). */
  widthPct: number;
  /** Hard px cap on the card width. */
  maxWidth: number;
  /** Horizontal inset (%) from the track edge for each card's near side. */
  sideInsetPct: number;
  /** Cinematic floats the caption as glass over the hero photo. */
  overlayCaption: boolean;
  /** CSS aspect-ratio for the cover frame, e.g. "16 / 10". */
  coverAspect: string;
  /** Optional paper-mat padding (px) around the cover (vintage). */
  matPadding?: number;
  /** Optional slight rotation (deg), alternated by side; applied on the
   *  NON-animated wrapper so it never fights Framer's transform on the article. */
  rotateDeg?: number;
  /** Card container (the animated `[data-stop-card]` article) classes. */
  cardClassName: string;
  cardStyle?: CSSProperties;
  /** Cover frame styling (inside the card / mat). */
  coverFrameClassName: string;
  coverFrameStyle?: CSSProperties;
  /** "Stop N" badge. */
  badgeClassName: string;
  badgeStyle?: CSSProperties;
  /** Caption region (below the cover, or the glass overlay when `overlayCaption`). */
  captionClassName: string;
  captionStyle?: CSSProperties;
  titleClassName: string;
  titleStyle?: CSSProperties;
  metaClassName: string;
  metaStyle?: CSSProperties;
  bodyClassName: string;
  bodyStyle?: CSSProperties;
  moreClassName: string;
  moreStyle?: CSSProperties;
  /** Optional decorative accent (vintage washi tape) rendered on the wrapper. */
  tape?: boolean;
  tapeClassName?: string;
  tapeStyle?: CSSProperties;
}

/** Styling for the traveling `[data-story-marker]` inner dot (kept solid in
 *  every theme so the frozen "marker has a non-transparent bg" check holds). */
export interface MarkerTreatment {
  /** Dot / stamp diameter (px). */
  size: number;
  /** Solid fill of the inner dot. */
  color: string;
  /** Ring color around the dot. */
  ringColor: string;
  /** Extra box-shadow appended after the ring (cinematic glow). */
  glow?: string;
  /** false → a sharp, dashed-edge postage-stamp square (vintage). */
  round: boolean;
  /** Whether to render the pulsing ping ring behind the dot. */
  ping: boolean;
}

/** Reader-chrome colors for the story page's `<main>` + sticky header, so the
 *  top bar stays legible on each theme's ground (esp. dark cinematic). */
export interface StoryChrome {
  /** Fills `<main>` behind the sticky header and the bottom padding. */
  mainBg: string;
  /** Full className for the sticky `<header>` (layout + themed color). */
  headerClassName: string;
  /** Full className for the "Back to editor" link. */
  backLinkClassName: string;
}

export interface StoryThemeTreatment {
  id: StoryTheme;
  /** Densified per-theme segment height (px) passed into `buildGeometry`. */
  segmentHeight: number;

  // Story root (carries `data-theme` + the filled background).
  rootStyle: CSSProperties;
  /** The `[data-theme-signature]` layer's background. */
  signatureStyle: CSSProperties;
  /** Positioning classes for the signature layer. */
  signatureClassName: string;
  /** Pin the signature to the viewport (cinematic vignette) vs. tile the page. */
  signatureFixed?: boolean;

  // Story header (title block over the first stretch of path).
  headerTitleClassName: string;
  headerTitleStyle?: CSSProperties;
  headerDescClassName: string;
  headerDescStyle?: CSSProperties;
  headerKickerClassName: string;
  headerKickerStyle?: CSSProperties;

  // Serpentine path.
  underlayStroke: string;
  underlayWidth: number;
  /** Dash pattern for the STATIC guide underlay ONLY (never the animated path). */
  underlayDash?: string;
  drawStroke: string;
  drawWidth: number;
  /** CSS filter applied to the animated path (cinematic glow). */
  drawFilter?: string;

  marker: MarkerTreatment;
  card: CardTreatment;
  chrome: StoryChrome;
}
