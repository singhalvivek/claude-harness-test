// Pure geometry helpers for the serpentine story path.
//
// The path is generated in *pixel* coordinates that match the SVG's viewBox
// (viewBox === rendered size, preserveAspectRatio="none"), so the values
// returned by getTotalLength()/getPointAtLength() on the rendered <path> map
// 1:1 to layout pixels inside the track. That lets StoryView position the
// traveling marker (an absolutely-positioned HTML element) directly from
// getPointAtLength() without any coordinate conversion.
//
// Phase 2.5 generalises the model from "one segment per stop" to an ordered
// list of **beats**. A beat is one thing standing on the path: either a stop
// card or a standalone feeling card. Beats have *heterogeneous* heights (a
// feeling card carries no photo, so it is shorter than a stop card), the total
// track height is the SUM of the beat heights, and sides alternate by BEAT
// index — so a stop's feeling card sits on the opposite side, just below it,
// and the path genuinely winds through it.
//
// The pixel-space contract is unchanged: `serpentinePathD` still threads cubics
// through the beat anchors in layout pixels, so the marker math keeps working.

import type { Stop } from "@/lib/api-client";

/** Vertical space (px) reserved at the top for the story header stretch. */
export const HEADER_HEIGHT = 380;
/**
 * Default vertical space (px) allotted to each stop segment. Themes override
 * this with a densified value (~380–440px) via `buildGeometry`'s third arg;
 * this default stays a sensible fallback when none is supplied.
 */
export const SEGMENT_HEIGHT = 440;
/** Default vertical space (px) allotted to a standalone feeling beat. */
export const FEELING_SEGMENT_HEIGHT = 360;
/** Extra breathing room (px) below the final stop. */
export const BOTTOM_PAD = 200;

/** Clamp band for a per-theme stop segment height. */
const SEGMENT_MIN = 320;
const SEGMENT_MAX = 640;
/** Clamp band for a per-theme feeling segment height (frozen in architecture.md). */
export const FEELING_SEGMENT_MIN = 200;
export const FEELING_SEGMENT_MAX = 420;
/** Clamp band for the extra height a stop beat gains from an inline pull-quote. */
const INLINE_EXTRA_MAX = 240;

/** What kind of thing stands on the path at a beat. */
export type BeatKind = "stop" | "feeling";

/** One beat in the story's ordered rhythm. `stopIndex` indexes the SHOWN stops. */
export interface Beat {
  kind: BeatKind;
  stopIndex: number;
}

/** A beat placed on the path: its side, its centre and its vertical allotment. */
export interface BeatLayout extends Beat {
  /** Position in the beat list (drives side alternation). */
  index: number;
  side: "left" | "right";
  /** Path x at this beat (px). */
  cx: number;
  /** Vertical centre of this beat / its card (px). */
  cy: number;
  /** Vertical space (px) this beat occupies on the track. */
  height: number;
}

export interface SerpentineGeometry {
  width: number;
  height: number;
  headerHeight: number;
  /** The (clamped) stop-beat segment height. */
  segmentHeight: number;
  /** Number of STOP beats — unchanged meaning for existing callers. */
  count: number;
  marginX: number;
  midX: number;
  leftX: number;
  rightX: number;
  /** Every beat on the path, in order, with its resolved anchor + height. */
  beats: BeatLayout[];
}

export interface NodeAnchor {
  index: number;
  side: "left" | "right";
  /** Path x at this node (px). */
  cx: number;
  /** Vertical center of this node / its card (px). */
  cy: number;
  /** Which kind of beat this anchor belongs to. */
  kind: BeatKind;
  /** The stop this beat belongs to (a feeling beat carries its stop's index). */
  stopIndex: number;
  /** Vertical space (px) allotted to this beat. */
  height: number;
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.min(Math.max(n, lo), hi);
}

/** Clamp a per-theme feeling segment height into the frozen 200–420px band. */
export function clampFeelingSegment(height: number): number {
  return clamp(height, FEELING_SEGMENT_MIN, FEELING_SEGMENT_MAX);
}

/** The visible feeling text for a stop, or null when there is nothing to show. */
export function feelingTextOf(stop: Pick<Stop, "feeling">): string | null {
  const t = (stop.feeling ?? "").trim();
  return t.length > 0 ? t : null;
}

/**
 * Does this stop contribute a standalone feeling beat? Only when the feeling is
 * non-blank AND the placement is "card". An absent/unknown placement falls back
 * to "card" (the product default), matching the API contract.
 */
export function rendersFeelingCard(
  stop: Pick<Stop, "feeling" | "feelingPlacement">,
): boolean {
  if (!feelingTextOf(stop)) return false;
  const p = stop.feelingPlacement;
  return p === "card" || p === undefined || p === null;
}

/** Does this stop render an inline pull-quote inside its own stop card? */
export function rendersFeelingInline(
  stop: Pick<Stop, "feeling" | "feelingPlacement">,
): boolean {
  return Boolean(feelingTextOf(stop)) && stop.feelingPlacement === "inline";
}

/**
 * [stop0, feeling0?, stop1, feeling1?, …] — a feeling beat is emitted only when
 * the stop's feeling is non-blank AND feelingPlacement === "card".
 */
export function buildBeats(
  stops: Pick<Stop, "feeling" | "feelingPlacement">[],
): Beat[] {
  const beats: Beat[] = [];
  stops.forEach((stop, stopIndex) => {
    beats.push({ kind: "stop", stopIndex });
    if (rendersFeelingCard(stop)) beats.push({ kind: "feeling", stopIndex });
  });
  return beats;
}

/**
 * Variable-height geometry. Stop beats get `segmentHeight` (+ `inlineExtra`
 * when that stop renders an inline pull-quote); feeling beats get
 * `feelingSegmentHeight` (clamped to 200–420px). Sides alternate by BEAT index;
 * `cy` is the running cumulative centre, so the total track height is the sum
 * of every beat's allotment plus the header + bottom padding.
 *
 * Anti-overlap is structural, not tuned: a card is vertically centred on its
 * beat, so adjacent centres are exactly `(h_i + h_{i+1}) / 2` apart. Every card
 * is rendered no taller than its own allotment (the feeling card enforces a
 * hard `maxHeight` + `overflow: hidden`), so adjacent cards always clear.
 */
export function buildBeatGeometry(
  width: number,
  beats: Beat[],
  opts: {
    segmentHeight: number;
    feelingSegmentHeight: number;
    inlineExtra: number;
    hasInline: (stopIndex: number) => boolean;
  },
): SerpentineGeometry {
  const safeWidth = Math.max(width, 320);
  // Clamp every per-theme height to a sane band so a bad value can never
  // collapse the geometry (or make cards overlap).
  const seg = clamp(opts.segmentHeight, SEGMENT_MIN, SEGMENT_MAX);
  const feelSeg = clampFeelingSegment(opts.feelingSegmentHeight);
  const inlineExtra = clamp(opts.inlineExtra, 0, INLINE_EXTRA_MAX);

  // Keep the winding within comfortable columns; clamp so it reads well on
  // both narrow and wide viewports.
  const marginX = Math.min(Math.max(safeWidth * 0.22, 60), 260);
  const leftX = marginX;
  const rightX = safeWidth - marginX;

  const layouts: BeatLayout[] = [];
  let y = HEADER_HEIGHT;
  let stopCount = 0;

  for (let i = 0; i < beats.length; i++) {
    const beat = beats[i];
    const side: "left" | "right" = i % 2 === 0 ? "left" : "right";
    let height: number;
    if (beat.kind === "feeling") {
      height = feelSeg;
    } else {
      stopCount += 1;
      height = seg + (opts.hasInline(beat.stopIndex) ? inlineExtra : 0);
    }
    layouts.push({
      kind: beat.kind,
      stopIndex: beat.stopIndex,
      index: i,
      side,
      cx: side === "left" ? leftX : rightX,
      cy: y + height / 2,
      height,
    });
    y += height;
  }

  return {
    width: safeWidth,
    height: y + BOTTOM_PAD,
    headerHeight: HEADER_HEIGHT,
    segmentHeight: seg,
    count: stopCount,
    marginX,
    midX: safeWidth / 2,
    leftX,
    rightX,
    beats: layouts,
  };
}

/**
 * Derive the full serpentine geometry from the measured track width and the
 * number of stops. Height is a deterministic function of the stop count so the
 * path spans exactly the (fixed-height) track and stays aligned with the
 * absolutely-positioned stop cards regardless of their content height.
 *
 * Unchanged signature and behaviour (uniform heights, one beat per stop) — it
 * is now a thin specialisation of `buildBeatGeometry` and also fills `beats`.
 */
export function buildGeometry(
  width: number,
  count: number,
  segmentHeight: number = SEGMENT_HEIGHT,
): SerpentineGeometry {
  const safeCount = Math.max(count, 0);
  const beats: Beat[] = [];
  for (let i = 0; i < safeCount; i++) beats.push({ kind: "stop", stopIndex: i });
  return buildBeatGeometry(width, beats, {
    segmentHeight,
    feelingSegmentHeight: FEELING_SEGMENT_HEIGHT,
    inlineExtra: 0,
    hasInline: () => false,
  });
}

/** The vertical center + side for each BEAT's node along the path. */
export function nodeAnchors(geom: SerpentineGeometry): NodeAnchor[] {
  return geom.beats.map((b) => ({
    index: b.index,
    side: b.side,
    cx: b.cx,
    cy: b.cy,
    kind: b.kind,
    stopIndex: b.stopIndex,
    height: b.height,
  }));
}

/**
 * Build the `d` attribute for the serpentine path: a smooth S-curve that starts
 * top-center, weaves through each beat node (alternating left/right), and ends
 * bottom-center. Cubic controls sit at the vertical midpoint of each span so the
 * tangents are vertical at every node — a clean, continuous serpentine.
 */
export function serpentinePathD(geom: SerpentineGeometry): string {
  const pts: Array<[number, number]> = [[geom.midX, 0]];
  for (const a of nodeAnchors(geom)) {
    pts.push([a.cx, a.cy]);
  }
  pts.push([geom.midX, geom.height]);

  let d = `M ${fmt(pts[0][0])} ${fmt(pts[0][1])}`;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    const c1y = ay + (by - ay) * 0.5;
    const c2y = by - (by - ay) * 0.5;
    d += ` C ${fmt(ax)} ${fmt(c1y)}, ${fmt(bx)} ${fmt(c2y)}, ${fmt(bx)} ${fmt(by)}`;
  }
  return d;
}

function fmt(n: number): string {
  return n.toFixed(2);
}
