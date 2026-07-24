"use client";

// Shared story READER experience (Phase 2 refinement). Used by BOTH the owner
// story page (`/trips/:id/story`) and the public share page (`/s/:slug`) so the
// reading experience — the serpentine story, the map overview, and the tag
// filter — is identical for the owner and for anyone opening a shared link.
//
// Before this component the map + filter lived only on the owner page, so a
// shared link rendered a bare story (no filter, no map). It also frames the map
// in the ACTIVE THEME's palette (dark for cinematic, kraft for vintage, …) so it
// reads as part of the story rather than a bolted-on white panel.
//
// It owns only view-local state (map open, selected tags) over the already-loaded
// trip — no refetch, no reload. The frozen story DOM hooks (`[data-serpentine]`,
// `[data-stop-card]`, …), the `[data-map-toggle]`, and the tag-filter chips are
// all preserved for the E2E.

import { useState } from "react";
import type { Trip } from "@/lib/api-client";
import { StoryView } from "./StoryView";
import { getTheme } from "./themes";
import { MapOverview } from "@/components/mapoverview/MapOverview";
import { TagFilter } from "@/components/tags/TagFilter";

/** Add alpha to a `#rgb`/`#rrggbb` color; pass through anything else unchanged. */
function withAlpha(color: string, a: number): string {
  const six = /^#([0-9a-f]{6})$/i.exec(color);
  if (six) {
    const n = parseInt(six[1], 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }
  const three = /^#([0-9a-f]{3})$/i.exec(color);
  if (three) {
    const [r, g, b] = three[1].split("").map((c) => parseInt(c + c, 16));
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  return color;
}

export function StoryReader({ trip }: { trip: Trip }) {
  const theme = getTheme(trip.theme);
  const accent = theme.marker.color;
  const ground = (theme.rootStyle.backgroundColor as string | undefined) ?? "#faf6ee";
  const titleColor = (theme.headerTitleStyle?.color as string | undefined) ?? "#1c1917";

  const [showMap, setShowMap] = useState(false);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  // Tag filter (ANY / union). An empty selection shows every stop. Passing fewer
  // stops re-derives the serpentine geometry cleanly (StoryView recomputes it).
  const filterActive = selectedTagIds.length > 0;
  const stopsShown = filterActive
    ? trip.stops.filter((s) => s.tags.some((t) => selectedTagIds.includes(t.id)))
    : trip.stops;

  return (
    <div className="pb-24">
      {/* Reader controls: a themed Map overview toggle, centered in the story column. */}
      <div className="mx-auto mt-6 flex max-w-5xl items-center justify-center px-4">
        <button
          type="button"
          data-map-toggle
          aria-pressed={showMap}
          onClick={() => setShowMap((v) => !v)}
          title="Show or hide the map overview"
          className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium shadow-sm transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          style={
            showMap
              ? {
                  backgroundColor: accent,
                  color: ground,
                  boxShadow: `0 2px 14px ${withAlpha(accent, 0.4)}`,
                }
              : {
                  backgroundColor: withAlpha(titleColor, 0.06),
                  color: titleColor,
                  border: `1px solid ${withAlpha(titleColor, 0.18)}`,
                }
          }
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M9 20l-5.5 2.5V6L9 3.5m0 16.5l6 2.5m-6-2.5V3.5m6 19l5.5-2.5V6L15 3.5m0 19V3.5m0 0L9 6"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {showMap ? "Hide map" : "Map overview"}
        </button>
      </div>

      {/* Map overview — framed in the active theme's palette so it belongs to the
          story. Always fed the FULL trip so every located stop is pinned. */}
      {showMap && (
        <section aria-label="Map overview" className="mx-auto mt-4 max-w-5xl px-4">
          <div
            className="isolate overflow-hidden rounded-2xl shadow-2xl"
            style={{
              backgroundColor: ground,
              border: `1px solid ${withAlpha(accent, 0.35)}`,
              boxShadow: `0 18px 50px ${withAlpha(titleColor, 0.22)}`,
            }}
          >
            <div
              className="flex items-center justify-between gap-3 px-4 py-2.5"
              style={{ borderBottom: `1px solid ${withAlpha(titleColor, 0.12)}` }}
            >
              <h2 className="text-sm font-semibold" style={{ color: titleColor }}>
                Map overview
              </h2>
              <span
                className="h-1.5 flex-1 rounded-full"
                style={{
                  background: `linear-gradient(90deg, ${withAlpha(accent, 0.5)} 0%, ${withAlpha(
                    accent,
                    0,
                  )} 100%)`,
                }}
                aria-hidden="true"
              />
              <button
                type="button"
                onClick={() => setShowMap(false)}
                className="rounded-full px-3 py-1 text-xs font-medium transition hover:brightness-125 focus:outline-none focus-visible:ring-2"
                style={{ color: withAlpha(titleColor, 0.7) }}
              >
                Close
              </button>
            </div>
            <MapOverview trip={trip} />
          </div>
        </section>
      )}

      {/* Tag filter — controlled here; applied by rendering a filtered trip. */}
      <TagFilter trip={trip} selected={selectedTagIds} onChange={setSelectedTagIds} />

      {filterActive && stopsShown.length === 0 ? (
        <div className="mx-auto mt-10 max-w-md px-6">
          <div
            className="rounded-2xl px-6 py-10 text-center shadow-lg"
            style={{
              backgroundColor: withAlpha(titleColor, 0.05),
              border: `1px solid ${withAlpha(titleColor, 0.12)}`,
              color: titleColor,
            }}
          >
            <p style={{ color: withAlpha(titleColor, 0.8) }}>No stops match the selected tags.</p>
            <button
              type="button"
              onClick={() => setSelectedTagIds([])}
              className="mt-5 rounded-full px-5 py-2 text-sm font-semibold shadow transition hover:brightness-110 focus:outline-none focus-visible:ring-2"
              style={{ backgroundColor: accent, color: ground }}
            >
              Clear filter
            </button>
          </div>
        </div>
      ) : (
        <StoryView trip={{ ...trip, stops: stopsShown }} />
      )}
    </div>
  );
}
