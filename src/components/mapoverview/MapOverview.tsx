"use client";

// Real-map overview for the story view (Phase 2 — capabilities/real-map-overview.md).
//
// Frozen prop shape: `MapOverview({ trip })`. Renders one marker per stop that has
// coordinates, joined by a polyline in stop order, auto-fit to bounds. Text-only
// stops (no lat/lng) are not pinned; a trip with zero located stops shows a clear
// "no mapped stops yet" state instead of an empty map.
//
// Leaflet touches `window`/`document`, so the actual map is loaded via
// `next/dynamic({ ssr: false })` — never server-rendered — matching the editor's
// map pattern (src/components/map/MapTab.tsx).

import dynamic from "next/dynamic";
import type { Trip } from "@/lib/api-client";
import type { MapPoint } from "./TripLeafletMap";

const TripLeafletMap = dynamic(() => import("./TripLeafletMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[420px] w-full items-center justify-center bg-ink/5 text-sm text-ink/50">
      Loading map…
    </div>
  ),
});

export function MapOverview({
  trip,
  accent,
  onSelect,
}: {
  trip: Trip;
  /** Active theme accent for pins + route line. */
  accent?: string;
  /** Called with a stop id when a pin/popup is clicked (jump to that stop). */
  onSelect?: (stopId: string) => void;
}) {
  // Keep only stops with real coordinates, in journey order (stops arrive
  // order-ascending from the API). Narrow lat/lng to non-null numbers.
  const points: MapPoint[] = trip.stops
    .filter((s): s is typeof s & { lat: number; lng: number } => s.lat != null && s.lng != null)
    .map((s) => ({
      id: s.id,
      order: s.order,
      label: s.placeName ?? s.title ?? `Stop ${s.order + 1}`,
      lat: s.lat,
      lng: s.lng,
    }));

  if (points.length === 0) {
    return (
      <div
        data-map-empty
        className="flex h-[280px] w-full flex-col items-center justify-center gap-3 bg-ink/5 px-6 text-center"
      >
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-ink/30">
          <path
            d="M9 20l-5.5 2.5V6L9 3.5m0 16.5l6 2.5m-6-2.5V3.5m6 19l5.5-2.5V6L15 3.5m0 19V3.5m0 0L9 6"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <p className="text-sm font-medium text-ink/70">No mapped stops yet</p>
        <p className="max-w-xs text-xs text-ink/50">
          Add a location to a stop in the editor and it will appear here, pinned on the map.
        </p>
      </div>
    );
  }

  return <TripLeafletMap stops={points} accent={accent} onSelect={onSelect} />;
}
