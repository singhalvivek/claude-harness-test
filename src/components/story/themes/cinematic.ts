import type { StoryThemeTreatment } from "./types";

// cinematic (DEFAULT) — dark immersive canvas, near-full-bleed hero photos (the
// LARGEST of any theme), glassy translucent caption cards floating over the
// imagery, a glowing amber path + marker, and a vignette/gradient-filled dark
// ground. The wide hero cards stay short (16/10) so that, at a dense 440px
// segment, opposite-side cards never overlap despite the wide 58% footprint.

export const cinematic: StoryThemeTreatment = {
  id: "cinematic",
  segmentHeight: 440,
  rootStyle: {
    backgroundColor: "#1c1917",
    backgroundImage:
      "radial-gradient(120% 80% at 50% -10%, #292524 0%, #1c1917 62%), radial-gradient(80% 55% at 50% 108%, rgba(245,158,11,0.10) 0%, rgba(28,25,23,0) 70%)",
  },
  signatureStyle: {
    backgroundImage:
      "radial-gradient(55% 38% at 50% 6%, rgba(245,158,11,0.16) 0%, rgba(245,158,11,0) 70%), radial-gradient(120% 100% at 50% 50%, rgba(0,0,0,0) 52%, rgba(0,0,0,0.55) 100%)",
  },
  // Pin the vignette + glow to the viewport so it frames every scroll position.
  signatureClassName: "pointer-events-none z-0",
  signatureFixed: true,
  headerTitleClassName: "font-serif text-5xl leading-tight sm:text-6xl",
  headerTitleStyle: { color: "#fef3c7", textShadow: "0 2px 34px rgba(245,158,11,0.35)" },
  headerDescClassName: "mx-auto mt-5 max-w-xl text-lg leading-relaxed",
  headerDescStyle: { color: "rgba(250,240,230,0.75)" },
  headerKickerClassName: "mt-10 text-sm font-medium uppercase tracking-[0.22em]",
  headerKickerStyle: { color: "#f59e0b" },
  underlayStroke: "rgba(245,158,11,0.16)",
  underlayWidth: 16,
  drawStroke: "#fbbf24",
  drawWidth: 3,
  drawFilter:
    "drop-shadow(0 0 6px rgba(245,158,11,0.9)) drop-shadow(0 0 15px rgba(245,158,11,0.5))",
  marker: {
    size: 26,
    color: "#fbbf24",
    ringColor: "rgba(255,255,255,0.55)",
    glow: "0 0 14px 3px rgba(245,158,11,0.7), 0 0 34px 7px rgba(245,158,11,0.35)",
    round: true,
    ping: true,
  },
  card: {
    // Widest cover of any theme (near-full-bleed hero). A short 16/10 aspect
    // keeps the card height (~371px) under the 440px segment → no vertical
    // overlap, so the wide 58% cards never collide though they alternate sides.
    widthPct: 58,
    maxWidth: 640,
    sideInsetPct: 2,
    overlayCaption: true,
    coverAspect: "16 / 10",
    cardClassName:
      "overflow-hidden rounded-2xl shadow-2xl shadow-black/60 ring-1 ring-amber-300/20",
    coverFrameClassName: "relative w-full overflow-hidden bg-black",
    badgeClassName:
      "pointer-events-none absolute left-3 top-3 z-10 rounded-full px-2.5 py-0.5 text-xs font-semibold shadow",
    badgeStyle: { backgroundColor: "rgba(245,158,11,0.92)", color: "#1c1917" },
    captionClassName:
      "absolute inset-x-0 bottom-0 z-10 space-y-1.5 p-5 pt-10 backdrop-blur-md",
    captionStyle: {
      background:
        "linear-gradient(to top, rgba(10,8,6,0.9) 0%, rgba(10,8,6,0.55) 55%, rgba(10,8,6,0) 100%)",
    },
    titleClassName: "font-serif text-2xl leading-tight",
    titleStyle: { color: "#fdf6e3" },
    metaClassName: "block text-sm font-medium uppercase tracking-wide",
    metaStyle: { color: "#f59e0b" },
    bodyClassName: "line-clamp-2 whitespace-pre-line text-[0.95rem] leading-relaxed",
    bodyStyle: { color: "rgba(250,240,230,0.82)" },
    moreClassName: "inline-block pt-1 text-sm font-medium",
    moreStyle: { color: "#fbbf24" },
  },
  chrome: {
    mainBg: "#1c1917",
    headerClassName:
      "sticky top-0 z-50 flex items-center justify-between gap-3 border-b border-white/10 bg-[rgba(28,25,23,0.82)] px-4 py-3 text-amber-50 backdrop-blur sm:px-6",
    backLinkClassName:
      "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-amber-50/85 transition hover:bg-white/10 hover:text-amber-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400",
  },
};
