// Pure geometry helpers for the serpentine story path.
//
// The path is generated in *pixel* coordinates that match the SVG's viewBox
// (viewBox === rendered size, preserveAspectRatio="none"), so the values
// returned by getTotalLength()/getPointAtLength() on the rendered <path> map
// 1:1 to layout pixels inside the track. That lets StoryView position the
// traveling marker (an absolutely-positioned HTML element) directly from
// getPointAtLength() without any coordinate conversion.

/** Vertical space (px) reserved at the top for the story header stretch. */
export const HEADER_HEIGHT = 380;
/** Vertical space (px) allotted to each stop segment. */
export const SEGMENT_HEIGHT = 560;
/** Extra breathing room (px) below the final stop. */
export const BOTTOM_PAD = 200;

export interface SerpentineGeometry {
  width: number;
  height: number;
  headerHeight: number;
  segmentHeight: number;
  count: number;
  marginX: number;
  midX: number;
  leftX: number;
  rightX: number;
}

export interface NodeAnchor {
  index: number;
  side: "left" | "right";
  /** Path x at this node (px). */
  cx: number;
  /** Vertical center of this node / its card (px). */
  cy: number;
}

/**
 * Derive the full serpentine geometry from the measured track width and the
 * number of stops. Height is a deterministic function of the stop count so the
 * path spans exactly the (fixed-height) track and stays aligned with the
 * absolutely-positioned stop cards regardless of their content height.
 */
export function buildGeometry(width: number, count: number): SerpentineGeometry {
  const safeWidth = Math.max(width, 320);
  const safeCount = Math.max(count, 0);
  // Keep the winding within comfortable columns; clamp so it reads well on
  // both narrow and wide viewports.
  const marginX = Math.min(Math.max(safeWidth * 0.22, 60), 260);
  const height = HEADER_HEIGHT + safeCount * SEGMENT_HEIGHT + BOTTOM_PAD;
  return {
    width: safeWidth,
    height,
    headerHeight: HEADER_HEIGHT,
    segmentHeight: SEGMENT_HEIGHT,
    count: safeCount,
    marginX,
    midX: safeWidth / 2,
    leftX: marginX,
    rightX: safeWidth - marginX,
  };
}

/** The vertical center + side for each stop's node along the path. */
export function nodeAnchors(geom: SerpentineGeometry): NodeAnchor[] {
  const anchors: NodeAnchor[] = [];
  for (let i = 0; i < geom.count; i++) {
    const side: "left" | "right" = i % 2 === 0 ? "left" : "right";
    anchors.push({
      index: i,
      side,
      cx: side === "left" ? geom.leftX : geom.rightX,
      cy: geom.headerHeight + i * geom.segmentHeight + geom.segmentHeight / 2,
    });
  }
  return anchors;
}

/**
 * Build the `d` attribute for the serpentine path: a smooth S-curve that starts
 * top-center, weaves through each stop node (alternating left/right), and ends
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
