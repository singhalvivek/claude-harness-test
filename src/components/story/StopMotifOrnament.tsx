"use client";

// Per-stop motif ornament — a small decorative "station" that sits ON the
// serpentine at a stop's node (cx / cy from `serpentine.nodeAnchors`). It shows
// the stop's motif glyph (from the shared catalog) tinted in the theme accent on
// a soft themed disc/glow, so the traveling marker visits a decorated station at
// every stop. It scales+fades in when it enters view and, unless the reader
// prefers reduced motion, breathes with a gentle idle float. Rendered only when
// the stop actually has a motif. Exposes the `[data-stop-motif]` hook for the E2E.

import { motion, useReducedMotion } from "framer-motion";
import { MotifGlyph } from "@/components/motifs/catalog";
import { withAlpha } from "./color";

interface StopMotifOrnamentProps {
  motif: string;
  /** Path x at this node (px within the track). */
  cx: number;
  /** Vertical center of this node (px within the track). */
  cy: number;
  /** Theme accent color (tints the glyph + glow). */
  accent: string;
  /** Theme ground color (the soft disc backing). */
  ground: string;
}

const DISC = 54;
const EASE = [0.22, 1, 0.36, 1] as const;

export function StopMotifOrnament({ motif, cx, cy, accent, ground }: StopMotifOrnamentProps) {
  const reduce = useReducedMotion() ?? false;

  const discStyle = {
    width: DISC,
    height: DISC,
    backgroundColor: withAlpha(ground, 0.82),
    boxShadow: `0 0 0 1px ${withAlpha(accent, 0.4)}, 0 6px 18px ${withAlpha(
      accent,
      0.28,
    )}, 0 0 22px ${withAlpha(accent, 0.35)}`,
  } as const;

  return (
    // Outer: pinned to the node, centered on the path point (translate keeps the
    // reveal scale + idle float composing about the node center).
    <div
      className="pointer-events-none absolute z-[15]"
      style={{ left: cx, top: cy, transform: "translate(-50%, -50%)" }}
    >
      <motion.div
        data-stop-motif={motif}
        aria-hidden="true"
        initial={reduce ? false : { opacity: 0, scale: 0.35 }}
        whileInView={reduce ? undefined : { opacity: 1, scale: 1 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.55, ease: EASE }}
      >
        <motion.div
          className="flex items-center justify-center rounded-full"
          style={discStyle}
          animate={reduce ? undefined : { y: [0, -5, 0] }}
          transition={reduce ? undefined : { duration: 5.5, repeat: Infinity, ease: "easeInOut" }}
        >
          <span style={{ color: accent, lineHeight: 0 }}>
            <MotifGlyph motif={motif} size={26} />
          </span>
        </motion.div>
      </motion.div>
    </div>
  );
}
