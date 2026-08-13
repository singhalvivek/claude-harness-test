"use client";

// Warm "welcome" intro — the enriched story header. Keeps the theme's existing
// title / description / kicker treatment but frames them as a warm invitation:
// a themed eyebrow ("A journey in N stops"), the title, the description, a small
// accent flourish rule, and the "scroll to follow" kicker. The whole block eases
// in with a gentle stagger on mount; under `prefers-reduced-motion` it is simply
// present. It renders INSIDE the existing header wrapper so the reserved header
// height (and therefore the path measurement) is unchanged.

import { motion, useReducedMotion } from "framer-motion";
import type { StoryThemeTreatment } from "./themes";

interface StoryIntroProps {
  theme: StoryThemeTreatment;
  title: string;
  description?: string | null;
  stopCount: number;
  accent: string;
}

const EASE = [0.22, 1, 0.36, 1] as const;

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12, delayChildren: 0.05 } },
};
const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
};

export function StoryIntro({ theme, title, description, stopCount, accent }: StoryIntroProps) {
  const reduce = useReducedMotion() ?? false;

  const eyebrow = `A journey in ${stopCount} ${stopCount === 1 ? "stop" : "stops"}`;
  const motionProps = reduce
    ? {}
    : ({ variants: container, initial: "hidden", animate: "show" } as const);
  const itemProps = reduce ? {} : ({ variants: item } as const);

  return (
    <motion.div {...motionProps}>
      <motion.p
        {...itemProps}
        className="text-xs font-semibold uppercase tracking-[0.32em]"
        style={{ color: accent }}
      >
        {eyebrow}
      </motion.p>

      <motion.h1 {...itemProps} className={theme.headerTitleClassName} style={theme.headerTitleStyle}>
        {title}
      </motion.h1>

      {description && (
        <motion.p {...itemProps} className={theme.headerDescClassName} style={theme.headerDescStyle}>
          {description}
        </motion.p>
      )}

      {/* Accent flourish rule: a themed hairline that fades out on both sides
          with a small accent gem at its center. */}
      <motion.div {...itemProps} className="mx-auto mt-8 flex items-center justify-center gap-3">
        <span
          className="h-px w-16 sm:w-24"
          style={{ background: `linear-gradient(90deg, transparent, ${accent})` }}
        />
        <span
          className="inline-block h-2 w-2 rotate-45"
          style={{ backgroundColor: accent, boxShadow: `0 0 10px ${accent}` }}
        />
        <span
          className="h-px w-16 sm:w-24"
          style={{ background: `linear-gradient(90deg, ${accent}, transparent)` }}
        />
      </motion.div>

      <motion.p
        {...itemProps}
        className={theme.headerKickerClassName}
        style={theme.headerKickerStyle}
      >
        Scroll to follow the journey
      </motion.p>
    </motion.div>
  );
}
