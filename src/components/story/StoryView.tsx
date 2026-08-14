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
import { hasMotif } from "@/components/motifs/catalog";
import { StopCard } from "./StopCard";
import { FeelingCard } from "./FeelingCard";
import {
  buildBeatGeometry,
  buildBeats,
  feelingTextOf,
  nodeAnchors,
  rendersFeelingInline,
  serpentinePathD,
} from "./serpentine";
import { getTheme } from "./themes";
import { AmbientDecor } from "./AmbientDecor";
import { StopMotifOrnament } from "./StopMotifOrnament";
import { StoryIntro } from "./StoryIntro";
import { StoryOutro } from "./StoryOutro";

// useLayoutEffect on the client, useEffect on the server (avoids the SSR
// warning). Measuring the path before paint prevents a full-drawn flash.
const useIsoLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function StoryView({ trip }: { trip: Trip }) {
  const reduce = useReducedMotion() ?? false;
  const trackRef = useRef<HTMLDivElement>(null);
  const pathRef = useRef<SVGPathElement>(null);

  // Resolve the trip's theme (unknown / missing → cinematic).
  const theme = getTheme(trip.theme);
  // Themed palette shared by the decorative layers (ambient decor, motif
  // ornaments, intro/outro flourishes).
  const accent = theme.marker.color;
  const ground = (theme.rootStyle.backgroundColor as string | undefined) ?? "#faf6ee";
  const ink = (theme.headerTitleStyle?.color as string | undefined) ?? "#1c1917";

  const [width, setWidth] = useState(1024);
  const [pathLen, setPathLen] = useState(0);

  const stops = trip.stops;

  // The path is built from an ordered list of BEATS, not stops: a stop whose
  // feeling is non-blank with placement "card" contributes a second beat right
  // after its own, so its feeling card stands on the path opposite it and the
  // path, the marker and the total track height all flow through it. Beats have
  // heterogeneous heights (a feeling card has no photo, so it is shorter) and a
  // stop carrying an inline pull-quote is allotted extra room.
  // Phase 2.6: a non-blank TRIP feeling contributes the story's opening beat,
  // standing on the path before any stop; a stop whose placement is "before"
  // puts its own card ahead of its stop instead of after it.
  const beats = buildBeats(stops, trip.feeling);
  const geom = buildBeatGeometry(width, beats, {
    segmentHeight: theme.segmentHeight,
    feelingSegmentHeight: theme.feeling.segmentHeight,
    inlineExtra: theme.feeling.inlineExtraHeight,
    hasInline: (stopIndex) => {
      const s = stops[stopIndex];
      return Boolean(s) && rendersFeelingInline(s);
    },
  });
  const d = serpentinePathD(geom);
  const anchors = nodeAnchors(geom);
  // Motif ornaments pin to the STOP beat's node, never a feeling beat's.
  const stopAnchors = new Map(
    anchors.filter((a) => a.kind === "stop").map((a) => [a.stopIndex, a]),
  );

  // Crown the closing block with the last motif'd stop's motif (a personal
  // touch), falling back to a star flourish when no stop carries a motif.
  const lastMotif = [...stops].reverse().find((s) => hasMotif(s.motif))?.motif ?? "star";

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

  const m = theme.marker;
  const markerDotStyle: CSSProperties = {
    width: m.size,
    height: m.size,
    marginLeft: -m.size / 2,
    marginTop: -m.size / 2,
    backgroundColor: m.color,
    borderRadius: m.round ? "9999px" : "3px",
    boxShadow: `0 0 0 4px ${m.ringColor}${m.glow ? `, ${m.glow}` : ""}`,
    // Non-round → a postage-stamp: slight tilt + a dashed perforation edge.
    ...(m.round
      ? {}
      : { transform: "rotate(-7deg)", outline: `2px dashed ${m.ringColor}`, outlineOffset: "-4px" }),
  };

  return (
    // Themed story root: carries data-theme + the filled background; the
    // signature layer + centered track sit on top.
    <div
      data-theme={theme.id}
      className="relative w-full overflow-hidden"
      style={{ ...theme.rootStyle, minHeight: geom.height }}
    >
      {/* Per-theme signature layer (glow / paper / grid / kraft). Cinematic pins
          its vignette to the viewport (signatureFixed); the rest tile the page. */}
      <div
        data-theme-signature
        aria-hidden="true"
        className={`${theme.signatureClassName}${theme.signatureFixed ? " fixed inset-0" : ""}`}
        style={theme.signatureStyle}
      />

      {/* Ambient decorated background — a theme-aware decorative layer that fills
          the empty margins and drifts with subtle scroll parallax, BEHIND the
          path + cards. Static under reduced motion. */}
      <AmbientDecor theme={theme.id} accent={accent} ink={ink} ground={ground} />

      <div
        ref={trackRef}
        className="relative z-10 mx-auto w-full max-w-5xl px-4"
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
            stroke={theme.underlayStroke}
            strokeWidth={theme.underlayWidth}
            strokeLinecap="round"
            strokeDasharray={theme.underlayDash}
          />
          <motion.path
            ref={pathRef}
            data-serpentine
            d={d}
            fill="none"
            stroke={theme.drawStroke}
            strokeWidth={theme.drawWidth}
            strokeLinecap="round"
            strokeDasharray={pathLen || undefined}
            style={
              reduce
                ? { strokeDashoffset: 0, opacity: pathLen ? 1 : 0, filter: theme.drawFilter }
                : { strokeDashoffset: dashOffset, opacity: pathLen ? 1 : 0, filter: theme.drawFilter }
            }
          />
        </svg>

        {/* Story header over the first stretch of the path — a warm, themed
            "welcome" intro. Rendered inside the reserved header height so the
            path measurement is unchanged. */}
        <header
          className="pointer-events-none absolute left-1/2 top-0 z-10 w-full max-w-3xl -translate-x-1/2 px-6 pt-20 text-center"
          style={{ height: geom.headerHeight }}
        >
          <StoryIntro
            theme={theme}
            title={trip.title}
            description={trip.description}
            stopCount={stops.length}
            accent={accent}
          />
        </header>

        {/* Traveling marker — travels the route as scroll advances. */}
        <motion.div
          data-story-marker
          className="pointer-events-none absolute left-0 top-0 z-20"
          style={reduce ? { x: geom.midX, y: 0 } : { x: markerX, y: markerY }}
        >
          <div className="relative" style={markerDotStyle}>
            {m.ping && (
              <span
                className="absolute inset-0 animate-ping"
                style={{
                  backgroundColor: m.color,
                  opacity: 0.4,
                  borderRadius: m.round ? "9999px" : "3px",
                }}
              />
            )}
          </div>
        </motion.div>

        {/* One card per BEAT along the path, order-ascending, alternating side:
            a stop card, or that stop's standalone feeling card. */}
        {anchors.map((anchor) => {
          // The trip's opening feeling belongs to no stop — render it first and
          // independently of the stops array.
          if (anchor.scope === "trip") {
            const text = feelingTextOf({ feeling: trip.feeling });
            if (!text) return null;
            return (
              <FeelingCard
                key="feeling-trip"
                text={text}
                stopId={`trip-${trip.id}`}
                side={anchor.side}
                top={anchor.cy}
                reduce={reduce}
                theme={theme}
                accent={accent}
                scope="trip"
              />
            );
          }
          const stop = stops[anchor.stopIndex];
          if (!stop) return null;
          if (anchor.kind === "feeling") {
            const text = feelingTextOf(stop);
            if (!text) return null;
            return (
              <FeelingCard
                key={`feeling-${stop.id}`}
                text={text}
                stopId={stop.id}
                side={anchor.side}
                top={anchor.cy}
                reduce={reduce}
                theme={theme}
                accent={accent}
              />
            );
          }
          return (
            <StopCard
              key={stop.id}
              stop={stop}
              side={anchor.side}
              top={anchor.cy}
              reduce={reduce}
              card={theme.card}
              feeling={theme.feeling}
              accent={accent}
            />
          );
        })}

        {/* Per-stop motif ornaments — decorated "stations" pinned on the path at
            each motif'd stop node. Skipped for stops with no motif. */}
        {stops.map((stop, i) => {
          const anchor = stopAnchors.get(i);
          return hasMotif(stop.motif) && anchor ? (
            <StopMotifOrnament
              key={`motif-${stop.id}`}
              motif={stop.motif}
              cx={anchor.cx}
              cy={anchor.cy}
              accent={accent}
              ground={ground}
            />
          ) : null;
        })}
      </div>

      {/* Closing moment — a themed "end of the journey" block after the track,
          just past where the serpentine terminates. */}
      <StoryOutro
        theme={theme}
        title={trip.title}
        motif={lastMotif}
        accent={accent}
        ground={ground}
      />
    </div>
  );
}
