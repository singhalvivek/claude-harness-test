"use client";

// Ambient decorated background — a theme-aware decorative layer that fills the
// empty space on either side of the serpentine so the story reads as a curated,
// lived-in space rather than a bare timeline. It sits BEHIND the path and the
// cards (z-0, pointer-events-none, low opacity) and drifts with subtle scroll
// parallax across three depth bands. Under `prefers-reduced-motion` it is fully
// static. The per-theme recipe (orbs / paper scraps / ink flourishes / quiet
// geometry) lives in `decor/config`. Exposes the frozen `[data-ambient-decor]`
// hook for the E2E.

import { type CSSProperties } from "react";
import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";
import type { StoryTheme } from "@/lib/api-client";
import { getDecor, type DecorSprite } from "./decor/config";
import { withAlpha } from "./color";

interface AmbientDecorProps {
  theme: StoryTheme;
  accent: string;
  ink: string;
  ground: string;
}

export function AmbientDecor({ theme, accent, ink, ground }: AmbientDecorProps) {
  const reduce = useReducedMotion() ?? false;

  // Page scroll progress drives a gentle differential drift. Three fixed bands
  // keep the hook count stable regardless of how many sprites a theme defines.
  const { scrollYProgress } = useScroll();
  const yFar = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [0, -70]);
  const yMid = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [0, -30]);
  const yNear = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [0, 44]);
  const bands = [yFar, yMid, yNear];

  const sprites = getDecor(theme, { accent, ink, ground });

  return (
    <div
      data-ambient-decor
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
    >
      {sprites.map((s) => (
        <motion.div
          key={s.id}
          className="absolute"
          style={{
            left: `${s.left}%`,
            top: `${s.top}%`,
            width: s.size,
            height: s.size,
            opacity: s.opacity,
            rotate: s.rotate ?? 0,
            y: bands[s.depth],
            willChange: "transform",
          }}
        >
          {renderSprite(s)}
        </motion.div>
      ))}
    </div>
  );
}

/** Render a single sprite by kind. Colors are pre-resolved from the palette. */
function renderSprite(s: DecorSprite) {
  const c = s.color;
  const full: CSSProperties = { width: "100%", height: "100%" };

  switch (s.kind) {
    case "orb":
      return (
        <div
          style={{
            ...full,
            borderRadius: "9999px",
            background: `radial-gradient(circle at 50% 50%, ${withAlpha(c, 0.9)} 0%, ${withAlpha(c, 0)} 70%)`,
            filter: "blur(2px)",
          }}
        />
      );
    case "dot":
      return <div style={{ ...full, borderRadius: "9999px", backgroundColor: c }} />;
    case "ring":
      return (
        <div
          style={{ ...full, borderRadius: "9999px", border: `2px solid ${c}`, background: "transparent" }}
        />
      );
    case "square":
      return <div style={{ ...full, border: `2px solid ${c}`, borderRadius: 3 }} />;
    case "plus":
      return (
        <svg viewBox="0 0 24 24" style={full} fill="none" stroke={c} strokeWidth={1.6} strokeLinecap="round">
          <line x1="12" y1="3" x2="12" y2="21" />
          <line x1="3" y1="12" x2="21" y2="12" />
        </svg>
      );
    case "scrap":
      return (
        <div
          style={{
            width: "100%",
            height: "72%",
            borderRadius: 2,
            backgroundColor: withAlpha(c, 0.1),
            border: `1px solid ${withAlpha(c, 0.5)}`,
            boxShadow: `0 2px 6px ${withAlpha(c, 0.18)}`,
          }}
        />
      );
    case "stamp":
      return (
        <div
          style={{
            ...full,
            borderRadius: 2,
            border: `2px dashed ${c}`,
            backgroundColor: withAlpha(c, 0.07),
          }}
        />
      );
    case "leaf":
      return (
        <svg viewBox="0 0 24 24" style={full} fill="none" stroke={c} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 20 C 6 10, 14 4, 20 4 C 20 12, 14 18, 4 20 Z" />
          <path d="M6 18 C 10 14, 14 10, 18 6" />
        </svg>
      );
    case "flourish":
      return (
        <svg viewBox="0 0 48 24" style={full} fill="none" stroke={c} strokeWidth={1.3} strokeLinecap="round">
          <path d="M1 14 C 8 2, 14 2, 18 12 C 22 22, 28 22, 32 12 C 35 5, 42 4, 47 10" />
        </svg>
      );
    default:
      return null;
  }
}
