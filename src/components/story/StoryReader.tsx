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
// It owns only view-local state (selected tags) over the already-loaded trip —
// no refetch, no reload. The frozen story DOM hooks (`[data-serpentine]`,
// `[data-stop-card]`, …) and the tag-filter chips are preserved for the E2E.

import { useState } from "react";
import type { Trip } from "@/lib/api-client";
import { StoryView } from "./StoryView";
import { getTheme } from "./themes";
import { withAlpha } from "./color";
import { MapOverview } from "@/components/mapoverview/MapOverview";
import { mapStyleForTheme } from "@/components/mapoverview/mapStyle";
import { TagFilter } from "@/components/tags/TagFilter";

export function StoryReader({ trip }: { trip: Trip }) {
  const theme = getTheme(trip.theme);
  const accent = theme.marker.color;
  const ground = (theme.rootStyle.backgroundColor as string | undefined) ?? "#faf6ee";
  const titleColor = (theme.headerTitleStyle?.color as string | undefined) ?? "#1c1917";

  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  const tileStyle = mapStyleForTheme(trip.theme);
  // The map hero is shown whenever at least one stop is located.
  const hasLocatedStop = trip.stops.some((s) => s.lat != null && s.lng != null);

  // Clicking a map pin jumps the story to that stop. If a tag filter is hiding
  // the target, clear it first so the stop is in the DOM, then smooth-scroll it
  // into view (double rAF lets the filtered stop render before we scroll).
  function handleSelectStop(stopId: string) {
    const visible = selectedTagIds.length === 0 ||
      trip.stops.some(
        (s) => s.id === stopId && s.tags.some((t) => selectedTagIds.includes(t.id)),
      );
    if (!visible) setSelectedTagIds([]);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const el = document.querySelector(`[data-stop-id="${stopId}"]`);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
      }),
    );
  }

  // Tag filter (ANY / union). An empty selection shows every stop. Passing fewer
  // stops re-derives the serpentine geometry cleanly (StoryView recomputes it).
  const filterActive = selectedTagIds.length > 0;
  const stopsShown = filterActive
    ? trip.stops.filter((s) => s.tags.some((t) => selectedTagIds.includes(t.id)))
    : trip.stops;

  return (
    <div className="pb-24">
      {/* Map hero — an always-on route map at the top of the story, framed and
          tiled in the ACTIVE theme's palette so it opens the narrative rather
          than sitting apart from it. Pins are interactive (click → jump to that
          stop). Only shown when the trip has at least one located stop. */}
      {hasLocatedStop && (
        <section aria-label="Route map" className="mx-auto mt-6 max-w-5xl px-4">
          <div
            className="isolate overflow-hidden rounded-2xl"
            style={{
              backgroundColor: ground,
              border: `1px solid ${withAlpha(accent, 0.35)}`,
              boxShadow: `0 18px 50px ${withAlpha(titleColor, 0.22)}`,
            }}
          >
            <div
              className="flex items-center gap-3 px-4 py-2.5"
              style={{ borderBottom: `1px solid ${withAlpha(titleColor, 0.12)}` }}
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: accent }}
                aria-hidden="true"
              />
              <h2 className="text-sm font-semibold" style={{ color: titleColor }}>
                Route map
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
              <span className="text-xs" style={{ color: withAlpha(titleColor, 0.6) }}>
                Click a pin to jump to that stop
              </span>
            </div>
            <MapOverview
              trip={trip}
              accent={accent}
              onSelect={handleSelectStop}
              tileStyle={tileStyle}
              height={360}
            />
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
