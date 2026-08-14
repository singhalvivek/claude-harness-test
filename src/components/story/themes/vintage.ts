import type { StoryThemeTreatment } from "./types";

// vintage — scrapbook / postcard. A textured kraft-paper ground; matted,
// slightly-rotated framed prints; a postage-stamp marker; handwritten-style
// headings (a cursive CSS font stack, no next/font wiring); and a DASHED route
// line. The dash is purely aesthetic and lives on the STATIC guide underlay —
// the animated `[data-serpentine]` path still draws itself solidly over it.
//
// Cards are 44% wide at the shared 2% inset (~8% center gap) so the rotated
// prints, whose corners swing out slightly, never collide across the rhythm.

const HAND = '"Segoe Script", "Bradley Hand", "Brush Script MT", "Comic Sans MS", cursive';

export const vintage: StoryThemeTreatment = {
  id: "vintage",
  segmentHeight: 420,
  rootStyle: {
    backgroundColor: "#cdb489",
    backgroundImage:
      "radial-gradient(120% 80% at 50% 0%, #d8c39c 0%, #cdb489 55%, #bb9d6c 100%)",
  },
  signatureStyle: {
    backgroundImage:
      "repeating-linear-gradient(45deg, rgba(120,85,45,0.05) 0px, rgba(120,85,45,0.05) 2px, rgba(120,85,45,0) 2px, rgba(120,85,45,0) 6px), repeating-linear-gradient(-45deg, rgba(120,85,45,0.04) 0px, rgba(120,85,45,0.04) 2px, rgba(120,85,45,0) 2px, rgba(120,85,45,0) 7px), radial-gradient(120% 90% at 50% 0%, rgba(90,60,30,0) 55%, rgba(90,60,30,0.13) 100%)",
  },
  signatureClassName: "pointer-events-none absolute inset-0 z-0",
  headerTitleClassName: "text-6xl leading-tight sm:text-7xl",
  headerTitleStyle: { color: "#5a3a22", fontFamily: HAND },
  headerDescClassName: "mx-auto mt-5 max-w-xl font-serif text-lg italic leading-relaxed",
  headerDescStyle: { color: "rgba(90,60,30,0.82)" },
  headerKickerClassName: "mt-10 text-lg tracking-wide",
  headerKickerStyle: { color: "#b1372f", fontFamily: HAND },
  underlayStroke: "rgba(177,55,47,0.5)",
  underlayWidth: 4,
  // Dashed AESTHETIC — the guide underlay only. The animated path is never dashed.
  underlayDash: "2 14",
  drawStroke: "#8a4b2f",
  drawWidth: 3,
  marker: {
    // A postage-stamp marker: solid red square (round: false) with a cream ring.
    size: 22,
    color: "#b1372f",
    ringColor: "#f4ead2",
    round: false,
    ping: false,
  },
  card: {
    widthPct: 44,
    maxWidth: 430,
    sideInsetPct: 2,
    overlayCaption: false,
    coverAspect: "4 / 3",
    matPadding: 14,
    rotateDeg: 2,
    cardClassName: "rounded-[3px] shadow-xl shadow-[#5a3a22]/25",
    cardStyle: { backgroundColor: "#fdf7e6" },
    coverFrameClassName: "relative w-full overflow-hidden rounded-[2px] bg-[#e7dcc0]",
    badgeClassName:
      "pointer-events-none absolute right-2 top-2 z-10 rounded-[2px] px-2 py-0.5 text-xs font-bold uppercase tracking-wide shadow",
    badgeStyle: { backgroundColor: "#b1372f", color: "#fdf7e6", transform: "rotate(-3deg)" },
    captionClassName: "space-y-1.5 px-4 pb-4 pt-3",
    titleClassName: "text-3xl leading-tight",
    titleStyle: { color: "#5a3a22", fontFamily: HAND },
    metaClassName: "block text-xs font-semibold uppercase tracking-wide",
    metaStyle: { color: "#b1372f" },
    bodyClassName: "line-clamp-3 whitespace-pre-line font-serif text-[0.9rem] leading-relaxed",
    bodyStyle: { color: "rgba(90,60,30,0.85)" },
    moreClassName: "inline-block pt-1 text-lg",
    moreStyle: { color: "#b1372f", fontFamily: HAND },
    // A strip of washi tape across the top edge — the scrapbook signature.
    tape: true,
    tapeClassName:
      "pointer-events-none absolute left-1/2 top-0 z-20 h-6 w-24 -translate-x-1/2 -translate-y-1/2 -rotate-3 shadow-sm ring-1 ring-black/5",
    tapeStyle: { backgroundColor: "rgba(226,214,178,0.72)" },
  },
  // Feeling — the set's one true cursive: Caveat 600 in faded-ink gradient on a
  // cream mat, tilted and taped like the rest of the scrapbook. The tilt rides
  // on the NON-animated wrapper (`rotateDeg`, exactly like the stop cards) so it
  // never fights Framer's enter transform on the card. 44% at the shared 2%
  // inset leaves a ~12% horizontal centre gap — far more than a 1.5deg tilt can
  // swing — so opposite-side cards cannot collide.
  feeling: {
    segmentHeight: 360,
    inlineExtraHeight: 56,
    widthPct: 44,
    maxWidth: 430,
    sideInsetPct: 2,
    rotateDeg: 1.5,
    cardClassName:
      "relative overflow-hidden rounded-[3px] px-6 py-7 shadow-xl shadow-[#5a3a22]/25",
    cardStyle: { backgroundColor: "#fdf7e6" },
    quoteClassName: "line-clamp-5 whitespace-pre-line",
    quoteStyle: {
      fontFamily: 'var(--font-feeling-vintage), "Segoe Script", "Bradley Hand", cursive',
      fontWeight: 600,
      fontSize: "clamp(1.5rem, 4.2vw, 2.5rem)",
      lineHeight: 1.22,
      color: "#5a3a22",
    },
    quoteGradient: "linear-gradient(96deg,#b1372f,#8a4b2f 55%,#5a3a22)",
    markClassName: "block select-none",
    markStyle: {
      fontFamily: 'var(--font-feeling-vintage), "Segoe Script", "Bradley Hand", cursive',
      fontSize: "3rem",
      lineHeight: 0.62,
      color: "rgba(177,55,47,0.45)",
    },
    inlineClassName: "mt-3 border-l-2 pl-3",
    inlineStyle: { borderColor: "rgba(177,55,47,0.55)" },
    inlineQuoteClassName: "line-clamp-3 whitespace-pre-line",
    inlineQuoteStyle: {
      fontFamily: 'var(--font-feeling-vintage), "Segoe Script", "Bradley Hand", cursive',
      fontWeight: 600,
      fontSize: "1.25rem",
      lineHeight: 1.35,
      color: "#5a3a22",
    },
    flourish: "tape",
  },
  chrome: {
    mainBg: "#cdb489",
    headerClassName:
      "sticky top-0 z-50 flex items-center justify-between gap-3 border-b border-[#5a3a22]/20 bg-[rgba(205,180,137,0.88)] px-4 py-3 text-[#5a3a22] backdrop-blur sm:px-6",
    backLinkClassName:
      "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-[#5a3a22]/85 transition hover:bg-[#5a3a22]/10 hover:text-[#5a3a22] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#b1372f]",
  },
};
