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

/**
 * Per-theme treatment for the Phase-2.5 feeling surfaces (consumed by
 * `FeelingCard` for the standalone `[data-feeling-card]` beat and by `StopCard`
 * for the `[data-feeling-inline]` pull-quote). Pure data, same house style as
 * `CardTreatment`: structural utilities as Tailwind classNames, dynamic colour
 * inline. Each theme supplies exactly ONE display face, used at 40px on the
 * standalone card and ~20px inline.
 */
export interface FeelingTreatment {
  /** Height (px) a standalone feeling beat occupies on the path. */
  segmentHeight: number;
  /** Extra height (px) added to a STOP beat that renders an inline pull-quote. */
  inlineExtraHeight: number;
  /** Card footprint. Must satisfy widthPct <= card.widthPct and reuse
   *  card.sideInsetPct, so no new horizontal collision risk is introduced. */
  widthPct: number;
  maxWidth: number;
  sideInsetPct: number;
  /** Optional slight rotation (deg) for the scrapbook themes, applied on the
   *  NON-animated wrapper (exactly like `CardTreatment.rotateDeg`) so it never
   *  fights Framer's transform on the animated article. */
  rotateDeg?: number;
  /** The standalone [data-feeling-card] surface. */
  cardClassName: string;
  cardStyle?: CSSProperties;
  /** The [data-feeling-quote] display text. `quoteStyle.color` is ALWAYS the
   *  solid fallback ink and must be set. */
  quoteClassName: string;
  /** MUST include fontFamily: "var(--font-feeling-<theme>), <that theme's
   *  fallback stack>" — cinematic: Playfair Display / Georgia, "Times New
   *  Roman", serif · editorial: Bodoni Moda / "Didot", "Bodoni MT", "Times New
   *  Roman", serif · minimal: Space Grotesk / "Segoe UI", Roboto, system-ui,
   *  sans-serif · vintage: Caveat / "Segoe Script", "Bradley Hand", cursive.
   *  The fallback must stay in the SAME type class as the webfont, so a failed
   *  load never degrades into Fraunces. See ui.md. */
  quoteStyle: CSSProperties;
  /** Optional multi-colour ink. Applied as `backgroundImage` +
   *  background-clip:text + color:transparent ONLY when the browser reports
   *  support; otherwise quoteStyle.color shows. */
  quoteGradient?: string;
  /** Decorative opening quote mark. */
  markClassName: string;
  markStyle?: CSSProperties;
  /** The [data-feeling-inline] pull-quote inside a stop card. */
  inlineClassName: string;
  inlineStyle?: CSSProperties;
  inlineQuoteClassName: string;
  /** Same `fontFamily` as quoteStyle (one face per theme), at the smaller
   *  ~20px inline size — that size is a legibility constraint on the face
   *  choice, not an afterthought. */
  inlineQuoteStyle: CSSProperties;
  /** Theme flourish on the standalone card. */
  flourish: "rule" | "tape" | "none";
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
  /** Phase 2.5 — the theme's feeling face, colour treatment and beat budget. */
  feeling: FeelingTreatment;
  chrome: StoryChrome;
}
