"use client";

import { useRef, useState, type CSSProperties } from "react";
import { motion, useScroll, useTransform, AnimatePresence, type Variants } from "framer-motion";
import type { Stop } from "@/lib/api-client";
import { MotifGlyph, hasMotif } from "@/components/motifs/catalog";
import { PhotoGallery } from "./PhotoGallery";
import type { CardTreatment } from "./themes";

// One stop anchored along the serpentine path. It:
//  - is absolutely positioned at its node's vertical center, alternating
//    left/right (order-ascending is handled by the parent),
//  - reveals with a staggered entrance (photo first, then the text + a themed
//    accent) via Framer Motion variants + `whileInView`,
//  - gives its cover photo parallax depth (translateY tied to scroll) COMPOSED
//    with a slow ken-burns drift (scale),
//  - expands into the full photo gallery/carousel when clicked.
// The card's framing, sizing and typography come from the active theme's
// `CardTreatment` (cinematic overlays a glass caption over a hero photo;
// vintage adds a paper mat + slight rotation; all keep the [data-stop-card] and
// [data-cover-photo] hooks, the parallax cover, the enter animation, and the
// reduced-motion branch). With reduced motion the card is simply visible, the
// cover holds still (no parallax, no ken-burns) and nothing staggers.

interface StopCardProps {
  stop: Stop;
  side: "left" | "right";
  /** Vertical center (px) within the track where this card is anchored. */
  top: number;
  reduce: boolean;
  card: CardTreatment;
  /** Theme accent color — tints the small reveal accent (rule + motif). */
  accent: string;
}

const EASE = [0.22, 1, 0.36, 1] as const;

// Card container: rises + pops in, then staggers its children (cover → caption).
const container: Variants = {
  hidden: { opacity: 0, y: 46, scale: 0.95 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.6, ease: EASE, staggerChildren: 0.14, delayChildren: 0.08 },
  },
};
// Block children (cover, caption-below) rise into place.
const rise: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};
// Overlay caption (cinematic) fades only — a transform here would become the
// absolute caption's containing block and break the glass overlay positioning.
const fade: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.6, ease: EASE } },
};

export function StopCard({ stop, side, top, reduce, card, accent }: StopCardProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [coverBroken, setCoverBroken] = useState(false);

  const cover = stop.photos.find((p) => p.isCover) ?? stop.photos[0] ?? null;

  // Parallax: as the card travels through the viewport, drift the cover image
  // vertically inside its (overflow-hidden, oversized) frame for depth.
  const { scrollYProgress } = useScroll({
    target: wrapperRef,
    offset: ["start end", "end start"],
  });
  const coverY = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [-40, 40]);

  // Slight scrapbook rotation (vintage) — alternates by side; kept on the outer
  // wrapper so the Framer enter transform on the article stays independent.
  const rotate = card.rotateDeg ? (side === "left" ? -card.rotateDeg : card.rotateDeg) : 0;

  const wrapperStyle: CSSProperties = {
    top,
    transform: `translateY(-50%)${rotate ? ` rotate(${rotate}deg)` : ""}`,
    width: `${card.widthPct}%`,
    maxWidth: card.maxWidth,
    scrollMarginTop: 96,
  };
  const inset = `${card.sideInsetPct}%`;
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

  const label = stop.placeName ?? stop.title ?? "Untitled stop";

  const cover$ = (
    <div
      className={card.coverFrameClassName}
      style={{ aspectRatio: card.coverAspect, ...card.coverFrameStyle }}
    >
      {cover && !coverBroken ? (
        <motion.img
          data-cover-photo
          src={cover.webUrl}
          alt={label}
          onError={() => setCoverBroken(true)}
          style={{ y: coverY }}
          animate={reduce ? undefined : { scale: [1.06, 1.12, 1.06] }}
          transition={reduce ? undefined : { duration: 22, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -top-[8%] left-0 h-[116%] w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-black/10 to-black/20 text-black/40">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
            <path d="M21 15l-5-5L5 21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-xs">No photo yet</span>
        </div>
      )}
      <span className={card.badgeClassName} style={card.badgeStyle}>
        Stop {stop.order + 1}
      </span>
    </div>
  );

  // Small reveal accent: a themed hairline rule, prefixed by the stop's motif
  // glyph when it has one — tinted in the theme accent.
  const accent$ = (
    <div className="flex items-center gap-2" aria-hidden="true">
      {hasMotif(stop.motif) && (
        <span style={{ color: accent, lineHeight: 0 }}>
          <MotifGlyph motif={stop.motif} size={16} />
        </span>
      )}
      <span
        className="h-px flex-1"
        style={{ background: `linear-gradient(90deg, ${accent}, transparent)` }}
      />
    </div>
  );

  const caption$ = (
    <div className={card.captionClassName} style={card.captionStyle}>
      {accent$}
      <h3 className={card.titleClassName} style={card.titleStyle}>
        {label}
      </h3>
      {stop.occurredAt && (
        <time className={card.metaClassName} style={card.metaStyle}>
          {formatWhen(stop.occurredAt)}
        </time>
      )}
      {stop.body && (
        <p className={card.bodyClassName} style={card.bodyStyle}>
          {stop.body}
        </p>
      )}
      <span className={card.moreClassName} style={card.moreStyle}>
        {open ? "Hide photos ▲" : `View ${stop.photos.length} photo${stop.photos.length === 1 ? "" : "s"} ▼`}
      </span>
    </div>
  );

  // Stagger wrappers (skipped entirely under reduced motion so the card is just
  // present). The cover rises; the overlay caption fades (no transform).
  const coverBlock = reduce ? cover$ : <motion.div variants={rise}>{cover$}</motion.div>;
  const captionRise = reduce ? caption$ : <motion.div variants={rise}>{caption$}</motion.div>;
  const captionFade = reduce ? caption$ : <motion.div variants={fade}>{caption$}</motion.div>;

  return (
    <div ref={wrapperRef} data-stop-id={stop.id} className="absolute z-10" style={wrapperStyle}>
      <motion.article
        data-stop-card
        {...articleProps}
        className={card.cardClassName}
        style={card.cardStyle}
      >
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="block w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        >
          {card.overlayCaption ? (
            // Cinematic: hero photo with the caption floating as glass over it.
            <div className="relative">
              {coverBlock}
              {captionFade}
            </div>
          ) : card.matPadding ? (
            // Vintage: paper mat around the framed print, caption below.
            <>
              <div style={{ padding: card.matPadding }}>{coverBlock}</div>
              {captionRise}
            </>
          ) : (
            <>
              {coverBlock}
              {captionRise}
            </>
          )}
        </button>

        <AnimatePresence initial={false}>
          {open && <PhotoGallery key="gallery" photos={stop.photos} />}
        </AnimatePresence>
      </motion.article>

      {/* Vintage scrapbook accent: a strip of washi tape across the card's top. */}
      {card.tape && (
        <span aria-hidden="true" className={card.tapeClassName} style={card.tapeStyle} />
      )}
    </div>
  );
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
