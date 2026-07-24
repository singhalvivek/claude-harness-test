"use client";

import { useRef, useState, type CSSProperties } from "react";
import { motion, useScroll, useTransform, AnimatePresence } from "framer-motion";
import type { Stop } from "@/lib/api-client";
import { PhotoGallery } from "./PhotoGallery";

// One stop anchored along the serpentine path. It:
//  - is absolutely positioned at its node's vertical center, alternating
//    left/right (order-ascending is handled by the parent),
//  - fades + slides + pops into view via Framer Motion `whileInView`,
//  - gives its cover photo parallax depth (translateY tied to scroll),
//  - expands into the full photo gallery/carousel when clicked.
// With reduced motion the card is simply visible and the cover holds still.

interface StopCardProps {
  stop: Stop;
  side: "left" | "right";
  /** Vertical center (px) within the track where this card is anchored. */
  top: number;
  reduce: boolean;
}

export function StopCard({ stop, side, top, reduce }: StopCardProps) {
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

  const posStyle: CSSProperties = { top, transform: "translateY(-50%)" };
  if (side === "left") posStyle.left = "2%";
  else posStyle.right = "2%";

  const enterProps = reduce
    ? {}
    : {
        initial: { opacity: 0, y: 46, scale: 0.95 },
        whileInView: { opacity: 1, y: 0, scale: 1 },
        viewport: { once: true, amount: 0.3 },
        transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const },
      };

  return (
    <div ref={wrapperRef} className="absolute z-10 w-[46%] max-w-md" style={posStyle}>
      <motion.article
        data-stop-card
        {...enterProps}
        className="overflow-hidden rounded-2xl bg-white shadow-xl shadow-ink/10 ring-1 ring-ink/10"
      >
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="block w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-trail"
        >
          <div className="relative aspect-[4/3] overflow-hidden bg-ink/5">
            {cover && !coverBroken ? (
              <motion.img
                data-cover-photo
                src={cover.webUrl}
                alt={stop.placeName ?? stop.title ?? "Stop cover photo"}
                onError={() => setCoverBroken(true)}
                style={{ y: coverY }}
                className="absolute -top-[8%] left-0 h-[116%] w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-ink/5 to-ink/10 text-ink/40">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" />
                  <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
                  <path d="M21 15l-5-5L5 21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="text-xs">No photo yet</span>
              </div>
            )}
            <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-trail px-2.5 py-0.5 text-xs font-semibold text-paper shadow">
              Stop {stop.order + 1}
            </span>
          </div>

          <div className="space-y-2 p-5">
            <h3 className="font-serif text-2xl leading-tight text-ink">
              {stop.placeName ?? stop.title ?? "Untitled stop"}
            </h3>
            {stop.occurredAt && (
              <time className="block text-sm font-medium uppercase tracking-wide text-trail">
                {formatWhen(stop.occurredAt)}
              </time>
            )}
            {stop.body && (
              <p className="line-clamp-4 whitespace-pre-line text-[0.95rem] leading-relaxed text-ink/75">
                {stop.body}
              </p>
            )}
            <span className="inline-block pt-1 text-sm font-medium text-trail">
              {open ? "Hide photos ▲" : `View ${stop.photos.length} photo${stop.photos.length === 1 ? "" : "s"} ▼`}
            </span>
          </div>
        </button>

        <AnimatePresence initial={false}>
          {open && <PhotoGallery key="gallery" photos={stop.photos} />}
        </AnimatePresence>
      </motion.article>
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
