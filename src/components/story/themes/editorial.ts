import type { StoryThemeTreatment } from "./types";

// editorial — the shipped warm paper + terracotta look, REFINED and DENSIFIED:
// a tighter 410px rhythm (down from 560), richer warm-tinted bordered cards with
// a stronger shadow, a better serif scale, larger 4/3 photos, a textured/tinted
// paper background (no longer blank off-white), and the terracotta path/marker.
// 46% cards at the shared 2% inset → a 4% center gap, so the tall caption-below
// cards never collide across the dense rhythm.

export const editorial: StoryThemeTreatment = {
  id: "editorial",
  segmentHeight: 410,
  rootStyle: {
    backgroundColor: "#f6ecd6",
    backgroundImage: "radial-gradient(120% 65% at 50% 0%, #efe2c6 0%, #f6ecd6 55%)",
  },
  signatureStyle: {
    backgroundImage:
      "repeating-linear-gradient(0deg, rgba(120,80,40,0.035) 0px, rgba(120,80,40,0.035) 1px, rgba(120,80,40,0) 1px, rgba(120,80,40,0) 4px), radial-gradient(120% 80% at 50% 0%, rgba(120,80,40,0) 58%, rgba(120,80,40,0.08) 100%)",
  },
  signatureClassName: "pointer-events-none absolute inset-0 z-0",
  headerTitleClassName: "font-serif text-5xl leading-tight sm:text-6xl",
  headerTitleStyle: { color: "#3b2a1a" },
  headerDescClassName: "mx-auto mt-5 max-w-xl font-serif text-lg leading-relaxed",
  headerDescStyle: { color: "rgba(59,42,26,0.72)" },
  headerKickerClassName: "mt-10 text-sm font-medium uppercase tracking-[0.2em]",
  headerKickerStyle: { color: "#c96f45" },
  underlayStroke: "rgba(201,111,69,0.14)",
  underlayWidth: 14,
  drawStroke: "#c96f45",
  drawWidth: 4,
  marker: {
    size: 26,
    color: "#c96f45",
    ringColor: "#f6ecd6",
    round: true,
    ping: true,
  },
  card: {
    widthPct: 46,
    maxWidth: 460,
    sideInsetPct: 2,
    overlayCaption: false,
    coverAspect: "4 / 3",
    cardClassName:
      "overflow-hidden rounded-2xl shadow-xl shadow-[#3b2a1a]/15 ring-1 ring-[#c96f45]/25",
    cardStyle: { backgroundColor: "#fffaf1" },
    coverFrameClassName: "relative w-full overflow-hidden bg-black/5",
    badgeClassName:
      "pointer-events-none absolute right-3 top-3 z-10 rounded-full px-2.5 py-0.5 text-xs font-semibold shadow",
    badgeStyle: { backgroundColor: "#c96f45", color: "#fffaf1" },
    captionClassName: "space-y-2 p-5",
    titleClassName: "font-serif text-2xl leading-tight",
    titleStyle: { color: "#3b2a1a" },
    metaClassName: "block text-sm font-medium uppercase tracking-wide",
    metaStyle: { color: "#c96f45" },
    bodyClassName: "line-clamp-4 whitespace-pre-line font-serif text-[0.95rem] leading-relaxed",
    bodyStyle: { color: "rgba(59,42,26,0.78)" },
    moreClassName: "inline-block pt-1 text-sm font-medium",
    moreStyle: { color: "#c96f45" },
  },
  // Feeling — magazine authority: Bodoni Moda 700 (a high-contrast didone,
  // deliberately NOT a script) in a terracotta duotone on the theme's warm
  // paper, with the 4px terracotta left rule. 46% at the shared 2% inset keeps
  // the >= 4% horizontal centre gap, so opposite-side cards cannot collide.
  feeling: {
    segmentHeight: 360,
    inlineExtraHeight: 56,
    widthPct: 46,
    maxWidth: 460,
    sideInsetPct: 2,
    cardClassName:
      "relative overflow-hidden rounded-2xl border border-l-4 px-7 py-7 shadow-xl shadow-[#3b2a1a]/15",
    cardStyle: {
      backgroundColor: "#fffaf1",
      borderColor: "rgba(201,111,69,0.30)",
      borderLeftColor: "#c96f45",
    },
    quoteClassName: "line-clamp-5 whitespace-pre-line",
    quoteStyle: {
      fontFamily:
        'var(--font-feeling-editorial), "Didot", "Bodoni MT", "Times New Roman", serif',
      fontWeight: 700,
      fontSize: "clamp(1.5rem, 4.2vw, 2.5rem)",
      lineHeight: 1.16,
      color: "#a1522f",
    },
    quoteGradient: "linear-gradient(92deg,#c96f45,#8a4b2f 60%,#b1372f)",
    markClassName: "block select-none",
    markStyle: {
      fontFamily:
        'var(--font-feeling-editorial), "Didot", "Bodoni MT", "Times New Roman", serif',
      fontSize: "3rem",
      lineHeight: 0.62,
      color: "rgba(201,111,69,0.45)",
    },
    inlineClassName: "mt-3 border-l-4 pl-3",
    inlineStyle: { borderColor: "#c96f45" },
    inlineQuoteClassName: "line-clamp-3 whitespace-pre-line",
    inlineQuoteStyle: {
      fontFamily:
        'var(--font-feeling-editorial), "Didot", "Bodoni MT", "Times New Roman", serif',
      fontWeight: 700,
      fontSize: "1.25rem",
      lineHeight: 1.32,
      color: "#a1522f",
    },
    flourish: "rule",
  },
  chrome: {
    mainBg: "#f6ecd6",
    headerClassName:
      "sticky top-0 z-50 flex items-center justify-between gap-3 border-b border-[#3b2a1a]/15 bg-[rgba(246,236,214,0.85)] px-4 py-3 text-[#3b2a1a] backdrop-blur sm:px-6",
    backLinkClassName:
      "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-[#3b2a1a]/80 transition hover:bg-[#3b2a1a]/5 hover:text-[#3b2a1a] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c96f45]",
  },
};
