"use client";

import { useRef, useState, type CSSProperties } from "react";
import { motion, useScroll, useTransform, AnimatePresence } from "framer-motion";
import type { Stop } from "@/lib/api-client";
import { PhotoGallery } from "./PhotoGallery";
import type { CardTreatment } from "./themes";

// One stop anchored along the serpentine path. It:
//  - is absolutely positioned at its node's vertical center, alternating
//    left/right (order-ascending is handled by the parent),
//  - fades + slides + pops into view via Framer Motion `whileInView`,
//  - gives its cover photo parallax depth (translateY tied to scroll),
//  - expands into the full photo gallery/carousel when clicked.
// The card's framing, sizing and typography come from the active theme's
// `CardTreatment` (cinematic overlays a glass caption over a hero photo;
// vintage adds a paper mat + slight rotation; all keep the [data-stop-card] and
// [data-cover-photo] hooks, the parallax cover, the enter animation, and the
// reduced-motion branch). With reduced motion the card is simply visible and
// the cover holds still.

interface StopCardProps {
  stop: Stop;
  side: "left" | "right";
  /** Vertical center (px) within the track where this card is anchored. */
  top: number;
  reduce: boolean;
  card: CardTreatment;
}

export function StopCard({ stop, side, top, reduce, card }: StopCardProps) {
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

  const enterProps = reduce
    ? {}
    : {
        initial: { opacity: 0, y: 46, scale: 0.95 },
        whileInView: { opacity: 1, y: 0, scale: 1 },
        viewport: { once: true, amount: 0.3 },
        transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const },
      };

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

  const caption$ = (
    <div className={card.captionClassName} style={card.captionStyle}>
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

  return (
    <div ref={wrapperRef} data-stop-id={stop.id} className="absolute z-10" style={wrapperStyle}>
      <motion.article
        data-stop-card
        {...enterProps}
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
              {cover$}
              {caption$}
            </div>
          ) : card.matPadding ? (
            // Vintage: paper mat around the framed print, caption below.
            <>
              <div style={{ padding: card.matPadding }}>{cover$}</div>
              {caption$}
            </>
          ) : (
            <>
              {cover$}
              {caption$}
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
