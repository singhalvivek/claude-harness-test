"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { motion, type Variants } from "framer-motion";
import { clampFeelingSegment } from "./serpentine";
import type { StoryThemeTreatment } from "./themes";

// The standalone feeling beat — a stop's one-line feeling standing on the
// serpentine as its OWN beat, on the side opposite its stop card.
//
// It is a quote surface only: an oversized opening quote mark, the feeling in
// the theme's single display face, and a themed flourish. It carries NO photo,
// and it is never a descendant of a [data-stop-card].
//
// Anti-overlap is structural, not tuned. `serpentine.ts` allots this beat
// `feeling.segmentHeight` px on the track and centres the card on it; here we
// cap the rendered card at `segmentHeight - 32` with `overflow: hidden` and a
// 5-line clamp, so the card can never grow past its allotment and therefore can
// never reach its neighbour.
//
// Colour: `quoteStyle.color` is ALWAYS a solid themed ink and is what paints on
// the server, on the first client paint, and in any browser without
// `background-clip: text`. The multi-colour gradient ink is layered on only
// after mount, and only when the browser reports support — so the text can
// never render invisible.

/** Vertical breathing room (px) subtracted from the beat allotment. */
const HEIGHT_SLACK = 32;

const EASE = [0.22, 1, 0.36, 1] as const;

const container: Variants = {
  hidden: { opacity: 0, y: 46 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
};

interface FeelingCardProps {
  /** The trimmed, non-blank feeling text. */
  text: string;
  /** Id of the stop this feeling belongs to (for debugging / test targeting). */
  stopId: string;
  side: "left" | "right";
  /** Vertical center (px) within the track where this card is anchored. */
  top: number;
  reduce: boolean;
  theme: StoryThemeTreatment;
  /** Theme accent color — tints the flourish rule. */
  accent: string;
}

export function FeelingCard({
  text,
  stopId,
  side,
  top,
  reduce,
  theme,
  accent,
}: FeelingCardProps) {
  const f = theme.feeling;

  // Gradient-clipped ink is opt-in, post-mount, support-gated (frozen mechanism
  // in architecture.md#module-contracts). SSR + first paint show the solid ink.
  const [clipSupported, setClipSupported] = useState(false);
  useEffect(() => {
    if (
      typeof CSS !== "undefined" &&
      typeof CSS.supports === "function" &&
      CSS.supports("-webkit-background-clip", "text")
    ) {
      setClipSupported(true);
    }
  }, []);

  const quoteStyle: CSSProperties = {
    ...f.quoteStyle,
    ...(clipSupported && f.quoteGradient
      ? {
          backgroundImage: f.quoteGradient,
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
        }
      : {}),
  };

  // Slight scrapbook rotation (vintage) — alternates by side and lives on the
  // NON-animated wrapper, so Framer's enter transform on the card is untouched.
  const rotate = f.rotateDeg ? (side === "left" ? -f.rotateDeg : f.rotateDeg) : 0;

  const wrapperStyle: CSSProperties = {
    top,
    transform: `translateY(-50%)${rotate ? ` rotate(${rotate}deg)` : ""}`,
    width: `${f.widthPct}%`,
    maxWidth: f.maxWidth,
    scrollMarginTop: 96,
  };
  const inset = `${f.sideInsetPct}%`;
  if (side === "left") wrapperStyle.left = inset;
  else wrapperStyle.right = inset;

  const articleProps = reduce
    ? {}
    : ({
        variants: container,
        initial: "hidden",
        whileInView: "show",
        viewport: { once: true, amount: 0.3 },
      } as const);

  return (
    <div
      data-feeling-stop-id={stopId}
      className="absolute z-10"
      style={wrapperStyle}
    >
      <motion.figure
        data-feeling-card
        {...articleProps}
        className={f.cardClassName}
        style={{
          ...f.cardStyle,
          // The structural anti-overlap guarantee.
          maxHeight: clampFeelingSegment(f.segmentHeight) - HEIGHT_SLACK,
          overflow: "hidden",
        }}
      >
        <span aria-hidden="true" className={f.markClassName} style={f.markStyle}>
          &ldquo;
        </span>

        <blockquote className="m-0">
          <p data-feeling-quote className={f.quoteClassName} style={quoteStyle}>
            {text}
          </p>
        </blockquote>

        {f.flourish === "rule" && (
          <span
            aria-hidden="true"
            className="mt-5 block h-px w-full"
            style={{ background: `linear-gradient(90deg, ${accent}, transparent)` }}
          />
        )}
      </motion.figure>

      {/* Vintage scrapbook accent: a strip of washi tape across the mat's top —
          the same treatment the stop cards use, so no fifth look is invented. */}
      {f.flourish === "tape" && theme.card.tapeClassName && (
        <span
          aria-hidden="true"
          className={theme.card.tapeClassName}
          style={theme.card.tapeStyle}
        />
      )}
    </div>
  );
}
