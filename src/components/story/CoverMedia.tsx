"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { motion, type MotionValue } from "framer-motion";
import type { Media } from "@/lib/api-client";
import { withAlpha } from "./color";

// The stop cover, for BOTH media kinds, behind ONE frozen prop signature
// (spec/architecture.md#module-contracts) so `StopCard` simply delegates.
//
// Frozen DOM hooks — a shipped spec and a new one depend on these:
//   [data-cover-photo]      on the cover element for BOTH kinds (the shipped
//                           parallax + "cover box > 340px" assertions keep
//                           passing un-weakened),
//   [data-cover-video]      added to the SAME element when the cover is a video,
//   [data-video-mute-toggle] with data-muted="true|false" (visible state),
//   [data-video-play]       explicit play control (reduced motion / blocked
//                           autoplay),
//   [data-video-unplayable] labelled fallback + Download link.
//
// Playback contract (spec/capabilities/video-media.md):
//   <video muted loop playsInline preload="metadata" poster>; an
//   IntersectionObserver (threshold 0.35) plays it in view and PAUSES it out of
//   view; autoplay is ALWAYS muted (browsers block unmuted autoplay) and
//   unmuting is user-gesture-only through the toggle; prefers-reduced-motion
//   never autoplays — it shows the poster plus the explicit play control; an
//   undecodable codec degrades to the poster + a labelled chip + a Download
//   link, never a broken black box.
//
// House style: pure Tailwind class strings for structure + inline CSSProperties
// for the themed colour (the accent tints every control). No new dependency:
// plain <video>, no player library, no ffmpeg.

export interface CoverMediaProps {
  media: Media; // kind "photo" | "video"
  alt: string;
  reduce: boolean; // prefers-reduced-motion
  y: MotionValue<number>; // parallax translateY supplied by StopCard
  accent: string; // theme accent, tints the mute/play controls
  /** Rendered instead of the media when the object fails to load. */
  fallback: ReactNode;
}

/** The shipped cover framing — kept verbatim so the cover keeps its hero size. */
const COVER_CLASS = "absolute -top-[8%] left-0 h-[116%] w-full object-cover";

/** Extensions we can map to a MIME with confidence. `.mov` is deliberately
 *  ABSENT: QuickTime and MP4 share the ISO base media container, so a `.mov`
 *  Chrome reports as unsupported *by MIME* is frequently decodable — for those
 *  the authoritative signal is the element's own `error` event. */
const CONFIDENT_MIME_BY_EXT: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/x-m4v",
  webm: "video/webm",
};

function extensionOf(url: string): string {
  let pathname = url;
  try {
    pathname = new URL(url, typeof window === "undefined" ? "http://localhost" : window.location.href)
      .pathname;
  } catch {
    /* keep the raw string */
  }
  const dot = pathname.lastIndexOf(".");
  return dot >= 0 ? pathname.slice(dot + 1).toLowerCase() : "";
}

/** A *negative-only* pre-check: true when the browser tells us outright it
 *  cannot play this container. Never guesses for unknown/QuickTime types. */
function cannotDecode(url: string, el: HTMLVideoElement): boolean {
  const mime = CONFIDENT_MIME_BY_EXT[extensionOf(url)];
  if (!mime) return false;
  return el.canPlayType(mime) === "";
}

export function CoverMedia({ media, alt, reduce, y, accent, fallback }: CoverMediaProps) {
  const isVideo = media.kind === "video";
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [broken, setBroken] = useState(false); // photo object failed to load
  const [unplayable, setUnplayable] = useState(false); // video cannot be decoded
  const [muted, setMuted] = useState(true); // autoplay is muted, always
  const [inView, setInView] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [blocked, setBlocked] = useState(false); // play() rejected by policy
  // Reduced motion never autoplays; the reader asks for playback explicitly.
  const [wantsPlay, setWantsPlay] = useState(!reduce);

  useEffect(() => {
    setWantsPlay(!reduce);
  }, [reduce]);

  // Ask the browser up front whether this container is decodable at all.
  useEffect(() => {
    if (!isVideo) return;
    const el = videoRef.current;
    if (!el) return;
    if (cannotDecode(media.webUrl, el)) setUnplayable(true);
  }, [isVideo, media.webUrl]);

  // Autoplay in view / pause out of view.
  useEffect(() => {
    if (!isVideo) return;
    const el = videoRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          // A cover taller than the viewport can never reach ratio 0.35, so a
          // large visible slab counts as "in view" too.
          const slab = entry.intersectionRect.height >= window.innerHeight * 0.6;
          setInView(entry.isIntersecting && (entry.intersectionRatio >= 0.35 || slab));
        }
      },
      { threshold: [0, 0.35, 0.7, 1] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [isVideo]);

  // Keep the DOM property in sync with our state: React does not emit a `muted`
  // ATTRIBUTE during SSR, and an unmuted element would have its autoplay blocked.
  useEffect(() => {
    const el = videoRef.current;
    if (el) el.muted = muted;
  }, [muted]);

  // The single play/pause driver.
  useEffect(() => {
    if (!isVideo) return;
    const el = videoRef.current;
    if (!el) return;
    if (unplayable) {
      if (!el.paused) el.pause();
      return;
    }
    let cancelled = false;
    if (inView && wantsPlay) {
      el.muted = muted;
      const started = el.play();
      if (started && typeof started.then === "function") {
        started
          .then(() => {
            if (!cancelled) setBlocked(false);
          })
          .catch(() => {
            // Autoplay policy said no — degrade to a visible play control
            // instead of a frozen frame.
            if (!cancelled) setBlocked(true);
          });
      }
    } else if (!el.paused) {
      el.pause();
    }
    return () => {
      cancelled = true;
    };
  }, [isVideo, inView, wantsPlay, unplayable, muted]);

  // ---- Photo cover (unchanged behaviour: parallax + ken-burns drift) --------
  if (!isVideo) {
    if (broken) return <>{fallback}</>;
    return (
      <motion.img
        data-cover-photo
        src={media.webUrl}
        alt={alt}
        onError={() => setBroken(true)}
        style={{ y }}
        animate={reduce ? undefined : { scale: [1.06, 1.12, 1.06] }}
        transition={reduce ? undefined : { duration: 22, repeat: Infinity, ease: "easeInOut" }}
        className={COVER_CLASS}
      />
    );
  }

  // ---- Video cover ---------------------------------------------------------
  // The cover lives inside the stop card's toggle button, so (a) every control
  // is a role="button" SPAN — a nested <button> is torn apart by the HTML parser
  // and would break hydration — and (b) each one swallows its own click so it
  // never opens/closes the gallery.
  const swallow = (event: MouseEvent | KeyboardEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const toggleMute = (event: MouseEvent | KeyboardEvent) => {
    swallow(event);
    const next = !muted;
    setMuted(next);
    const el = videoRef.current;
    if (el) {
      // Apply inside the user gesture so unmuted playback is permitted.
      el.muted = next;
      if (!next && !unplayable) {
        setWantsPlay(true);
        const started = el.play();
        if (started && typeof started.then === "function") started.catch(() => setBlocked(true));
      }
    }
  };

  const requestPlay = (event: MouseEvent | KeyboardEvent) => {
    swallow(event);
    setWantsPlay(true);
    const el = videoRef.current;
    if (!el || unplayable) return;
    el.muted = muted;
    const started = el.play();
    if (started && typeof started.then === "function") {
      started.then(() => setBlocked(false)).catch(() => setBlocked(true));
    }
  };

  const onKey = (handler: (e: KeyboardEvent) => void) => (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") handler(e);
  };

  const showPlay = !unplayable && !playing && (reduce || blocked);
  const showFilmStrip = !unplayable && !media.posterUrl && !playing;
  const chip: CSSProperties = {
    background: "rgba(0, 0, 0, 0.62)",
    color: "#ffffff",
    boxShadow: `0 0 0 1px ${withAlpha(accent, 0.6)}`,
  };

  return (
    <>
      <motion.video
        ref={videoRef}
        data-cover-photo
        data-cover-video
        src={media.webUrl}
        poster={media.posterUrl ?? undefined}
        muted
        loop
        playsInline
        preload="metadata"
        aria-label={alt}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onError={() => setUnplayable(true)}
        style={{ y }}
        className={COVER_CLASS}
      />

      {/* No poster at all → theme-tinted film-strip rather than a black box. */}
      {showFilmStrip && <FilmStrip accent={accent} />}

      {/* Explicit play control: reduced motion, or a rejected play(). Every
          control sits at z-30+ so it clears the themes' own overlays — cinematic
          floats a z-10 glass caption across the bottom of the cover — and is
          therefore never buried or click-intercepted. */}
      {showPlay && (
        <span
          data-video-play
          role="button"
          tabIndex={0}
          aria-label="Play video"
          title="Play"
          onClick={requestPlay}
          onKeyDown={onKey(requestPlay)}
          className="absolute left-1/2 top-1/2 z-30 inline-flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full backdrop-blur"
          style={chip}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 5v14l11-7z" fill="currentColor" />
          </svg>
        </span>
      )}

      {/* Tap to unmute — always present for a playable video, state visible. */}
      {!unplayable && (
        <span
          data-video-mute-toggle
          data-muted={muted ? "true" : "false"}
          role="button"
          tabIndex={0}
          aria-pressed={!muted}
          aria-label={muted ? "Unmute video" : "Mute video"}
          title={muted ? "Unmute" : "Mute"}
          onClick={toggleMute}
          onKeyDown={onKey(toggleMute)}
          className="absolute bottom-2 right-2 z-30 inline-flex cursor-pointer select-none items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium leading-none backdrop-blur"
          style={chip}
        >
          <SpeakerGlyph muted={muted} />
          {muted ? "Unmute" : "Mute"}
        </span>
      )}

      {/* Undecodable codec (the HEVC .mov-in-Chrome case): poster + a legible
          label + a Download link. Never a broken black box. */}
      {unplayable && (
        <div
          data-video-unplayable
          className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-2 px-3 text-center"
        >
          {media.posterUrl ? (
            <img
              src={media.posterUrl}
              alt={alt}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <FilmStrip accent={accent} />
          )}
          <span
            className="relative z-10 rounded-full px-3 py-1 text-[11px] font-medium leading-none backdrop-blur"
            style={chip}
          >
            {"This video can't play in this browser"}
          </span>
          <a
            href={media.webUrl}
            download
            onClick={(e) => e.stopPropagation()}
            className="relative z-10 rounded-full px-3 py-1 text-[11px] font-semibold leading-none underline underline-offset-2 backdrop-blur"
            style={chip}
          >
            Download
          </a>
        </div>
      )}
    </>
  );
}

function SpeakerGlyph({ muted }: { muted: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 9v6h4l5 4V5L8 9H4z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      {muted ? (
        <path
          d="M17 9.5l4 5M21 9.5l-4 5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      ) : (
        <path
          d="M16.5 8.8a4.5 4.5 0 010 6.4M19 6.5a8 8 0 010 11"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

/** Theme-tinted stand-in for a video with no poster frame. */
function FilmStrip({ accent }: { accent: string }) {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 flex flex-col items-center justify-center gap-2"
      style={{
        background: `linear-gradient(135deg, ${withAlpha(accent, 0.14)}, ${withAlpha(accent, 0.06)})`,
        color: withAlpha(accent, 0.7),
      }}
    >
      <svg width="38" height="38" viewBox="0 0 24 24" fill="none">
        <rect x="2.5" y="5" width="19" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M6.5 5v14M17.5 5v14" stroke="currentColor" strokeWidth="1.2" />
        <path d="M2.5 12h19" stroke="currentColor" strokeWidth="1.2" />
      </svg>
      <span className="text-xs">Video</span>
    </div>
  );
}
