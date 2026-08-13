"use client";

// Closing moment — a gentle "end of the journey" block rendered as an in-flow
// section AFTER the story track, just past where the serpentine terminates.
// Themed to match the story (accent flourish, a motif medallion, the trip
// title). Because it flows after the (fixed-height) track it never touches the
// track's geometry or the path measurement. It eases in when scrolled into
// view; under `prefers-reduced-motion` it is simply present. Exposes the
// `[data-story-outro]` hook for the E2E.

import { type CSSProperties } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { MotifGlyph } from "@/components/motifs/catalog";
import type { StoryThemeTreatment } from "./themes";
import { withAlpha } from "./color";

interface StoryOutroProps {
  theme: StoryThemeTreatment;
  title: string;
  /** A motif to crown the closing medallion (a real stop motif, or a fallback). */
  motif: string;
  accent: string;
  ground: string;
}

const EASE = [0.22, 1, 0.36, 1] as const;
const MEDALLION = 64;

export function StoryOutro({ theme, title, motif, accent, ground }: StoryOutroProps) {
  const reduce = useReducedMotion() ?? false;

  const titleColor = (theme.headerTitleStyle?.color as string | undefined) ?? "#1c1917";

  const revealProps = reduce
    ? {}
    : ({
        initial: { opacity: 0, y: 26, scale: 0.96 },
        whileInView: { opacity: 1, y: 0, scale: 1 },
        viewport: { once: true, amount: 0.4 },
        transition: { duration: 0.7, ease: EASE },
      } as const);

  const medallionStyle: CSSProperties = {
    width: MEDALLION,
    height: MEDALLION,
    backgroundColor: withAlpha(ground, 0.85),
    boxShadow: `0 0 0 1px ${withAlpha(accent, 0.45)}, 0 8px 24px ${withAlpha(
      accent,
      0.3,
    )}, 0 0 26px ${withAlpha(accent, 0.35)}`,
  };

  return (
    <motion.div
      data-story-outro
      className="relative z-[12] mx-auto -mt-24 w-full max-w-md px-6 pb-28 text-center"
      {...revealProps}
    >
      {/* Accent flourish rule with a centered gem. */}
      <div className="mx-auto flex items-center justify-center gap-3">
        <span className="h-px w-14" style={{ background: `linear-gradient(90deg, transparent, ${accent})` }} />
        <span
          className="inline-block h-2 w-2 rotate-45"
          style={{ backgroundColor: accent, boxShadow: `0 0 10px ${accent}` }}
        />
        <span className="h-px w-14" style={{ background: `linear-gradient(90deg, ${accent}, transparent)` }} />
      </div>

      {/* Motif medallion crowning the end of the route. */}
      <div className="mt-6 flex justify-center">
        <motion.div
          className="flex items-center justify-center rounded-full"
          style={medallionStyle}
          animate={reduce ? undefined : { y: [0, -5, 0] }}
          transition={reduce ? undefined : { duration: 6, repeat: Infinity, ease: "easeInOut" }}
        >
          <span style={{ color: accent, lineHeight: 0 }}>
            <MotifGlyph motif={motif} size={30} />
          </span>
        </motion.div>
      </div>

      <h2
        className={theme.headerTitleClassName}
        style={{ ...theme.headerTitleStyle, fontSize: "1.9rem", marginTop: "1.25rem" }}
      >
        The journey ends here <span style={{ color: accent }}>&#10022;</span>
      </h2>
      <p className="mt-2 text-sm font-medium uppercase tracking-[0.2em]" style={{ color: withAlpha(titleColor, 0.7) }}>
        {title}
      </p>
    </motion.div>
  );
}
