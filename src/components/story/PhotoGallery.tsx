"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import type { Photo } from "@/lib/api-client";

// The expandable gallery revealed when a stop card is opened. Shows the stop's
// photos in order as a simple, keyboard-accessible carousel. A broken image
// degrades to a placeholder frame so the layout never collapses.

export function PhotoGallery({ photos }: { photos: Photo[] }) {
  const [index, setIndex] = useState(0);
  const [broken, setBroken] = useState<Record<string, boolean>>({});

  if (photos.length === 0) {
    return (
      <motion.div
        data-photo-gallery
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: "auto", opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        transition={{ duration: 0.3 }}
        className="overflow-hidden"
      >
        <p className="px-4 py-3 text-sm text-ink/60">No photos in this stop yet.</p>
      </motion.div>
    );
  }

  const clamped = Math.min(index, photos.length - 1);
  const photo = photos[clamped];
  const isBroken = broken[photo.id];
  const go = (delta: number) =>
    setIndex((i) => (i + delta + photos.length) % photos.length);

  return (
    <motion.section
      data-photo-gallery
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="overflow-hidden border-t border-ink/10"
    >
      <div className="relative aspect-[3/2] bg-ink/5">
        {isBroken ? (
          <PlaceholderFrame />
        ) : (
          <img
            src={photo.webUrl}
            alt={photo.caption ?? "Trip photo"}
            onError={() => setBroken((b) => ({ ...b, [photo.id]: true }))}
            className="h-full w-full object-cover"
          />
        )}

        {photos.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Previous photo"
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-paper/90 px-3 py-1.5 text-lg text-ink shadow ring-1 ring-ink/10 transition hover:bg-paper"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Next photo"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-paper/90 px-3 py-1.5 text-lg text-ink shadow ring-1 ring-ink/10 transition hover:bg-paper"
            >
              ›
            </button>
          </>
        )}
      </div>

      <div className="flex items-center justify-between px-4 py-3">
        <p className="text-sm text-ink/70">{photo.caption ?? ""}</p>
        <span className="shrink-0 pl-3 text-xs font-medium uppercase tracking-wide text-ink/50">
          {clamped + 1} / {photos.length}
        </span>
      </div>
    </motion.section>
  );
}

function PlaceholderFrame() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-ink/5 to-ink/10 text-ink/40">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
        <path d="M21 15l-5-5L5 21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="text-xs">Image unavailable</span>
    </div>
  );
}
