"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  motion,
  useScroll,
  useTransform,
  useMotionValue,
  useReducedMotion,
} from "framer-motion";
import type { Trip } from "@/lib/api-client";
import { StopCard } from "./StopCard";
import { buildGeometry, serpentinePathD, nodeAnchors } from "./serpentine";

// useLayoutEffect on the client, useEffect on the server (avoids the SSR
// warning). Measuring the path before paint prevents a full-drawn flash.
const useIsoLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function StoryView({ trip }: { trip: Trip }) {
  const reduce = useReducedMotion() ?? false;
  const trackRef = useRef<HTMLDivElement>(null);
  const pathRef = useRef<SVGPathElement>(null);

  const [width, setWidth] = useState(1024);
  const [pathLen, setPathLen] = useState(0);

  const stops = trip.stops;
  const geom = buildGeometry(width, stops.length);
  const d = serpentinePathD(geom);
  const anchors = nodeAnchors(geom);

  // Measure the track width (responsive) and re-measure on resize.
  useIsoLayoutEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Scroll progress across the whole track: 0 at the top, 1 once fully scrolled.
  const { scrollYProgress } = useScroll({
    target: trackRef,
    offset: ["start start", "end end"],
  });

  // Path length as a MotionValue so the derived draw/marker transforms recompute
  // the instant the measurement lands (and on every resize).
  const pathLenMV = useMotionValue(0);

  // Measure the rendered path length after the `d`/size changes. Because the
  // SVG viewBox equals its pixel size (preserveAspectRatio="none"),
  // getTotalLength()/getPointAtLength() return values in layout pixels.
  useIsoLayoutEffect(() => {
    const p = pathRef.current;
    if (!p) return;
    const len = p.getTotalLength();
    setPathLen(len);
    pathLenMV.set(len);
  }, [d, width, stops.length, pathLenMV]);

  // Draw-on-scroll: stroke-dashoffset interpolates from full length (hidden) at
  // the top to 0 (fully drawn) at the bottom.
  const dashOffset = useTransform(
    () => pathLenMV.get() * (1 - scrollYProgress.get()),
  );

  // Traveling marker: its point along the path at the current scroll progress.
  const markerX = useTransform(() => {
    const len = pathLenMV.get();
    if (!pathRef.current || len === 0) return geom.midX;
    return pathRef.current.getPointAtLength(scrollYProgress.get() * len).x;
  });
  const markerY = useTransform(() => {
    const len = pathLenMV.get();
    if (!pathRef.current || len === 0) return 0;
    return pathRef.current.getPointAtLength(scrollYProgress.get() * len).y;
  });

  const svgStyle: CSSProperties = { width: geom.width, height: geom.height };

  return (
    <div
      ref={trackRef}
      className="relative mx-auto w-full max-w-5xl px-4"
      style={{ height: geom.height }}
    >
      {/* The serpentine path, drawn behind the cards. */}
      <svg
        className="pointer-events-none absolute left-0 top-0"
        style={svgStyle}
        viewBox={`0 0 ${geom.width} ${geom.height}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          d={d}
          fill="none"
          stroke="hsl(18 62% 47% / 0.12)"
          strokeWidth={14}
          strokeLinecap="round"
        />
        <motion.path
          ref={pathRef}
          data-serpentine
          d={d}
          fill="none"
          stroke="hsl(18 62% 47%)"
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={pathLen || undefined}
          style={
            reduce
              ? { strokeDashoffset: 0, opacity: pathLen ? 1 : 0 }
              : { strokeDashoffset: dashOffset, opacity: pathLen ? 1 : 0 }
          }
        />
      </svg>

      {/* Story header over the first stretch of the path. */}
      <header
        className="pointer-events-none absolute left-1/2 top-0 z-10 w-full max-w-3xl -translate-x-1/2 px-6 pt-20 text-center"
        style={{ height: geom.headerHeight }}
      >
        <h1 className="font-serif text-5xl leading-tight text-ink sm:text-6xl">
          {trip.title}
        </h1>
        {trip.description && (
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-ink/70">
            {trip.description}
          </p>
        )}
        <p className="mt-10 text-sm font-medium uppercase tracking-[0.2em] text-trail">
          Scroll to follow the journey
        </p>
      </header>

      {/* Traveling marker — travels the route as scroll advances. */}
      <motion.div
        data-story-marker
        className="pointer-events-none absolute left-0 top-0 z-20"
        style={reduce ? { x: geom.midX, y: 0 } : { x: markerX, y: markerY }}
      >
        <div className="relative -ml-3.5 -mt-3.5 h-7 w-7 rounded-full bg-trail shadow-lg ring-4 ring-paper">
          <span className="absolute inset-0 animate-ping rounded-full bg-trail/40" />
        </div>
      </motion.div>

      {/* Stop cards anchored along the path, order-ascending, alternating side. */}
      {stops.map((stop, i) => {
        const anchor = anchors[i];
        return (
          <StopCard
            key={stop.id}
            stop={stop}
            side={anchor.side}
            top={anchor.cy}
            reduce={reduce}
          />
        );
      })}
    </div>
  );
}
