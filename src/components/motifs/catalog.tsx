// Shared motif catalog (story customization). One place that maps each
// `StopMotif` id (frozen in api-client) to a label + a themeable SVG glyph.
// Imported by BOTH the editor MotifPicker and the story ornaments, so the two
// never drift. Glyphs use `currentColor` so the story can tint them in the
// active theme's accent; the editor renders them in ink.

import type { CSSProperties } from "react";
import { MOTIF_IDS, type StopMotif } from "@/lib/api-client";

export { MOTIF_IDS };
export type { StopMotif };

interface GlyphProps {
  className?: string;
  style?: CSSProperties;
  /** Rendered pixel size (width = height). Defaults to 24. */
  size?: number;
  title?: string;
}

/** Wrap raw SVG children in a consistently-sized, currentColor <svg>. */
function svg(children: React.ReactNode) {
  return function Glyph({ className, style, size = 24, title }: GlyphProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        style={style}
        aria-hidden={title ? undefined : true}
        role={title ? "img" : undefined}
      >
        {title ? <title>{title}</title> : null}
        {children}
      </svg>
    );
  };
}

type GlyphComponent = (props: GlyphProps) => React.ReactElement | null;

const GLYPHS: Record<Exclude<StopMotif, "none">, GlyphComponent> = {
  flower: svg(
    <>
      <circle cx="12" cy="7" r="3" />
      <circle cx="17" cy="12" r="3" />
      <circle cx="12" cy="17" r="3" />
      <circle cx="7" cy="12" r="3" />
      <circle cx="12" cy="12" r="2.1" fill="currentColor" stroke="none" />
    </>,
  ),
  mountain: svg(
    <>
      <path d="M2 20 L8.5 8 L12.5 14 L15.5 9 L22 20 Z" />
      <path d="M6.7 11.2 L8.5 8 L10.3 11.2" />
    </>,
  ),
  tree: svg(
    <>
      <path d="M12 3 L6.6 12 H17.4 Z" />
      <path d="M12 8 L7 16 H17 Z" />
      <path d="M12 16 V21 M9.5 21 H14.5" />
    </>,
  ),
  train: svg(
    <>
      <rect x="6" y="4" width="12" height="12" rx="2.6" />
      <line x1="6" y1="10.5" x2="18" y2="10.5" />
      <circle cx="9.2" cy="19" r="1.4" />
      <circle cx="14.8" cy="19" r="1.4" />
      <path d="M8 16 L6.5 20 M16 16 L17.5 20" />
    </>,
  ),
  plane: svg(
    <>
      <path d="M21 4 L3 11.5 L10 13.5 L12.5 20 Z" />
      <path d="M10 13.5 L21 4" />
    </>,
  ),
  boat: svg(
    <>
      <path d="M4 16 H20 L18 20 H6 Z" />
      <path d="M12 4 V14 M12 6 L18 13 H12" />
    </>,
  ),
  car: svg(
    <>
      <path d="M3 15 V12 L5.4 8 H15.5 L19 12 L21 12.8 V15 Z" />
      <circle cx="7.2" cy="16" r="1.7" fill="currentColor" stroke="none" />
      <circle cx="16.2" cy="16" r="1.7" fill="currentColor" stroke="none" />
    </>,
  ),
  tent: svg(
    <>
      <path d="M3 20 L12 5 L21 20 Z" />
      <path d="M12 5 V20" />
      <path d="M9.4 20 A3 5 0 0 1 14.6 20" />
    </>,
  ),
  camera: svg(
    <>
      <rect x="3" y="7" width="18" height="12" rx="2.5" />
      <path d="M8 7 L9.5 5 H14.5 L16 7" />
      <circle cx="12" cy="13" r="3" />
    </>,
  ),
  star: svg(
    <path
      d="M12 3 L14.6 9.2 L21 9.8 L16.1 14 L17.7 20.4 L12 16.9 L6.3 20.4 L7.9 14 L3 9.8 L9.4 9.2 Z"
      fill="currentColor"
      stroke="none"
    />,
  ),
  compass: svg(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M15.6 8.4 L10.6 10.6 L8.4 15.6 L13.4 13.4 Z" fill="currentColor" stroke="none" />
    </>,
  ),
  sun: svg(
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2 V4 M12 20 V22 M2 12 H4 M20 12 H22 M4.9 4.9 L6.3 6.3 M17.7 17.7 L19.1 19.1 M19.1 4.9 L17.7 6.3 M6.3 17.7 L4.9 19.1" />
    </>,
  ),
  heart: svg(
    <path
      d="M12 20 C3.5 13.5 5.2 5.6 10 6.6 C11.2 6.9 12 8.1 12 8.1 C12 8.1 12.8 6.9 14 6.6 C18.8 5.6 20.5 13.5 12 20 Z"
      fill="currentColor"
      stroke="none"
    />,
  ),
};

export interface MotifDef {
  id: StopMotif;
  label: string;
}

/** Display labels for every motif (including `none`). */
export const MOTIF_META: Record<StopMotif, string> = {
  none: "None",
  flower: "Flower",
  mountain: "Mountain",
  tree: "Tree",
  train: "Train",
  plane: "Plane",
  boat: "Boat",
  car: "Car",
  tent: "Tent",
  camera: "Camera",
  star: "Star",
  compass: "Compass",
  sun: "Sun",
  heart: "Heart",
};

/** Ordered choices for a picker (includes `none`). */
export const MOTIF_CHOICES: MotifDef[] = MOTIF_IDS.map((id) => ({ id, label: MOTIF_META[id] }));

export function motifLabel(id: string | null | undefined): string {
  return MOTIF_META[(id ?? "none") as StopMotif] ?? "None";
}

/**
 * Render a motif's glyph. Returns null for `none` / unknown so callers can
 * simply drop it in. Inherits color via `currentColor`.
 */
export function MotifGlyph({
  motif,
  className,
  style,
  size = 24,
  title,
}: {
  motif: string | null | undefined;
  className?: string;
  style?: CSSProperties;
  size?: number;
  title?: string;
}) {
  const id = (motif ?? "none") as StopMotif;
  if (id === "none" || !(id in GLYPHS)) return null;
  const Glyph = GLYPHS[id as Exclude<StopMotif, "none">];
  return <Glyph className={className} style={style} size={size} title={title} />;
}

/** Whether a motif has a visible glyph (i.e. not `none`). */
export function hasMotif(motif: string | null | undefined): boolean {
  const id = (motif ?? "none") as StopMotif;
  return id !== "none" && id in GLYPHS;
}
