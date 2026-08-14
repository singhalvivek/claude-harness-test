import type { StoryThemeTreatment } from "./types";

// minimal — restrained neutral palette, clean sans type, large edge-to-edge card
// photos, a low-chrome hairline-border card, a thin quiet path + a small marker,
// and a subtle tonal / gridded ground (never empty white). Denser than shipped
// (400px) while keeping intentional breathing room. 46% cards at the shared 2%
// inset → a 4% center gap so caption-below cards never collide.

export const minimal: StoryThemeTreatment = {
  id: "minimal",
  segmentHeight: 400,
  rootStyle: {
    backgroundColor: "#f8fafc",
    backgroundImage: "linear-gradient(180deg, #f8fafc 0%, #eef2f6 100%)",
  },
  signatureStyle: {
    backgroundImage:
      "linear-gradient(rgba(100,116,139,0.09) 1px, transparent 1px), linear-gradient(90deg, rgba(100,116,139,0.09) 1px, transparent 1px)",
    backgroundSize: "44px 44px",
  },
  signatureClassName: "pointer-events-none absolute inset-0 z-0",
  headerTitleClassName:
    "font-sans text-5xl font-semibold leading-tight tracking-tight sm:text-6xl",
  headerTitleStyle: { color: "#0f172a" },
  headerDescClassName: "mx-auto mt-5 max-w-xl text-lg font-light leading-relaxed",
  headerDescStyle: { color: "#475569" },
  headerKickerClassName: "mt-10 text-sm font-medium uppercase tracking-[0.24em]",
  headerKickerStyle: { color: "#64748b" },
  underlayStroke: "rgba(100,116,139,0.12)",
  underlayWidth: 8,
  drawStroke: "#64748b",
  drawWidth: 2,
  marker: {
    size: 16,
    color: "#475569",
    ringColor: "#ffffff",
    round: true,
    ping: false,
  },
  card: {
    widthPct: 46,
    maxWidth: 460,
    sideInsetPct: 2,
    overlayCaption: false,
    coverAspect: "3 / 2",
    cardClassName: "overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-900/10",
    coverFrameClassName: "relative w-full overflow-hidden bg-slate-100",
    badgeClassName:
      "pointer-events-none absolute left-3 top-3 z-10 rounded-md px-2 py-0.5 text-xs font-medium",
    badgeStyle: { backgroundColor: "rgba(15,23,42,0.82)", color: "#f8fafc" },
    captionClassName: "space-y-2 px-5 py-4",
    titleClassName: "font-sans text-xl font-semibold leading-tight tracking-tight",
    titleStyle: { color: "#0f172a" },
    metaClassName: "block text-xs font-medium uppercase tracking-wide",
    metaStyle: { color: "#64748b" },
    bodyClassName: "line-clamp-3 whitespace-pre-line text-[0.925rem] font-light leading-relaxed",
    bodyStyle: { color: "#475569" },
    moreClassName: "inline-block pt-1 text-sm font-medium",
    moreStyle: { color: "#64748b" },
  },
  // Feeling — engineered restraint: Space Grotesk 500 (a geometric techno
  // grotesque) in a quiet vertical slate duotone on a white card with a
  // hairline top rule and maximal whitespace. 46% at the shared 2% inset keeps
  // the >= 4% horizontal centre gap, so opposite-side cards cannot collide.
  feeling: {
    segmentHeight: 320,
    inlineExtraHeight: 48,
    widthPct: 46,
    maxWidth: 460,
    sideInsetPct: 2,
    cardClassName:
      "relative overflow-hidden rounded-xl border-t px-7 py-7 shadow-sm ring-1 ring-slate-900/10",
    cardStyle: { backgroundColor: "#ffffff", borderTopColor: "rgba(15,23,42,0.14)" },
    quoteClassName: "line-clamp-5 whitespace-pre-line",
    quoteStyle: {
      fontFamily:
        'var(--font-feeling-minimal), "Segoe UI", Roboto, system-ui, sans-serif',
      fontWeight: 500,
      fontSize: "clamp(1.5rem, 4.2vw, 2.5rem)",
      lineHeight: 1.2,
      letterSpacing: "-0.02em",
      color: "#0f172a",
    },
    quoteGradient: "linear-gradient(180deg,#0f172a,#475569)",
    markClassName: "block select-none",
    markStyle: {
      fontFamily:
        'var(--font-feeling-minimal), "Segoe UI", Roboto, system-ui, sans-serif',
      fontSize: "2.5rem",
      lineHeight: 0.62,
      color: "rgba(100,116,139,0.5)",
    },
    inlineClassName: "mt-3 border-l pl-3",
    inlineStyle: { borderColor: "rgba(15,23,42,0.18)" },
    inlineQuoteClassName: "line-clamp-3 whitespace-pre-line",
    inlineQuoteStyle: {
      fontFamily:
        'var(--font-feeling-minimal), "Segoe UI", Roboto, system-ui, sans-serif',
      fontWeight: 500,
      fontSize: "1.25rem",
      lineHeight: 1.35,
      letterSpacing: "-0.01em",
      color: "#0f172a",
    },
    flourish: "rule",
  },
  chrome: {
    mainBg: "#f8fafc",
    headerClassName:
      "sticky top-0 z-50 flex items-center justify-between gap-3 border-b border-slate-900/10 bg-[rgba(248,250,252,0.85)] px-4 py-3 text-slate-900 backdrop-blur sm:px-6",
    backLinkClassName:
      "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-900/5 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400",
  },
};
