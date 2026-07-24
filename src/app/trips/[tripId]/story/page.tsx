"use client";

// Owner-preview story route (Phase 1). Middleware already gates /trips/** so no
// auth code lives here. This is a client component because the story canvas
// measures the SVG path and binds to scroll. It loads the full trip via the
// frozen api-client and designs every state: loading, error, empty, and ideal.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getTrip, type Trip } from "@/lib/api-client";
import { StoryView } from "@/components/story/StoryView";
import { ComingSoonPill } from "@/components/story/ComingSoonPill";
import { getTheme } from "@/components/story/themes";
import { MapOverview } from "@/components/mapoverview/MapOverview";
import { TagFilter } from "@/components/tags/TagFilter";

type Status = "loading" | "error" | "ready";

// Default (paper) reader chrome shown while loading and in the error/empty
// states, before a trip's theme is known.
const DEFAULT_MAIN_BG = "hsl(43 40% 97%)";
const DEFAULT_HEADER_CLASS =
  "sticky top-0 z-50 flex items-center justify-between gap-3 border-b border-ink/10 bg-paper/85 px-4 py-3 text-ink backdrop-blur sm:px-6";
const DEFAULT_BACK_LINK_CLASS =
  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-ink/80 transition hover:bg-ink/5 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-trail";

export default function StoryPage() {
  const params = useParams<{ tripId: string }>();
  const tripId = params?.tripId ?? "";

  const [trip, setTrip] = useState<Trip | null>(null);
  const [status, setStatus] = useState<Status>("loading");

  // Phase-2 view-local state: the map-overview toggle and the tag filter. Both
  // are purely client-side over the already-loaded trip (no refetch, no reload).
  const [showMap, setShowMap] = useState(false);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  const load = useCallback(() => {
    let active = true;
    setStatus("loading");
    getTrip(tripId)
      .then((t) => {
        if (!active) return;
        setTrip(t);
        setStatus("ready");
      })
      .catch(() => {
        if (!active) return;
        setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [tripId]);

  useEffect(() => {
    if (!tripId) return;
    const cancel = load();
    return cancel;
  }, [tripId, load]);

  // Theme the reader chrome once the trip (and its theme) is known, so the top
  // bar never clashes with a dark/kraft story ground. The labelled "coming
  // soon" stubs stay legible on every theme.
  const treatment =
    status === "ready" && trip && trip.stops.length > 0 ? getTheme(trip.theme) : null;
  const mainBg = treatment?.rootStyle.backgroundColor ?? DEFAULT_MAIN_BG;
  const headerClassName = treatment?.chrome.headerClassName ?? DEFAULT_HEADER_CLASS;
  const backLinkClassName = treatment?.chrome.backLinkClassName ?? DEFAULT_BACK_LINK_CLASS;

  // The map toggle only makes sense once a trip with stops is loaded.
  const mapReady = status === "ready" && !!trip && trip.stops.length > 0;

  // Apply the tag filter (ANY / union) over the loaded trip; the empty selection
  // shows every stop. Passing FEWER stops re-derives the serpentine geometry
  // cleanly since StoryView recomputes everything from `trip.stops`.
  const filterActive = selectedTagIds.length > 0;
  const stopsShown =
    trip && filterActive
      ? trip.stops.filter((s) => s.tags.some((t) => selectedTagIds.includes(t.id)))
      : trip?.stops ?? [];

  return (
    <main className="min-h-screen" style={{ backgroundColor: mainBg }}>
      {/* Reader chrome: Back to editor + labelled "coming soon" stubs. */}
      <header className={headerClassName}>
        <Link href={`/trips/${tripId}/edit`} className={backLinkClassName}>
          <span aria-hidden="true">←</span> Back to editor
        </Link>
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-map-toggle
            aria-pressed={showMap}
            disabled={!mapReady}
            onClick={() => setShowMap((v) => !v)}
            title={
              mapReady
                ? "Show or hide the map overview"
                : "Map overview is available once the trip has stops"
            }
            className={
              showMap
                ? "inline-flex items-center gap-2 rounded-full border border-transparent bg-trail px-3 py-1.5 text-sm font-medium text-paper shadow-sm transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-trail focus-visible:ring-offset-2"
                : "inline-flex items-center gap-2 rounded-full border border-ink/15 bg-white/70 px-3 py-1.5 text-sm font-medium text-ink/70 backdrop-blur transition hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-trail disabled:cursor-not-allowed disabled:opacity-60"
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
            Map overview
          </button>
          <ComingSoonPill label="Share" />
        </div>
      </header>

      {status === "loading" && <LoadingState />}
      {status === "error" && <ErrorState tripId={tripId} onRetry={load} />}
      {status === "ready" && trip && trip.stops.length === 0 && (
        <EmptyState tripId={tripId} title={trip.title} />
      )}
      {status === "ready" && trip && trip.stops.length > 0 && (
        <div className="pb-24">
          {/* Map overview — a real Leaflet + OSM panel, toggled from the header.
              Always fed the FULL trip so every located stop is pinned, regardless
              of the tag filter applied to the story below. */}
          {showMap && (
            <section aria-label="Map overview" className="mx-auto mt-6 max-w-5xl px-4">
              <div className="isolate overflow-hidden rounded-2xl border border-ink/10 bg-white/85 shadow-xl backdrop-blur">
                <div className="flex items-center justify-between gap-3 border-b border-ink/10 px-4 py-2.5">
                  <h2 className="text-sm font-semibold text-ink/80">Map overview</h2>
                  <button
                    type="button"
                    onClick={() => setShowMap(false)}
                    className="rounded-full px-3 py-1 text-xs font-medium text-ink/60 transition hover:bg-ink/5 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-trail"
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
              <div className="rounded-2xl border border-ink/10 bg-white/85 px-6 py-10 text-center shadow-lg backdrop-blur">
                <p className="text-ink/75">No stops match the selected tags.</p>
                <button
                  type="button"
                  onClick={() => setSelectedTagIds([])}
                  className="mt-5 rounded-full bg-trail px-5 py-2 text-sm font-semibold text-paper shadow transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-trail"
                >
                  Clear filter
                </button>
              </div>
            </div>
          ) : (
            <StoryView trip={{ ...trip, stops: stopsShown }} />
          )}
        </div>
      )}
    </main>
  );
}

function LoadingState() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-24" aria-busy="true">
      <div className="mx-auto h-10 w-2/3 animate-pulse rounded-full bg-ink/10" />
      <div className="mx-auto mt-4 h-5 w-1/2 animate-pulse rounded-full bg-ink/10" />
      <p className="mt-8 text-center text-sm text-ink/50">Loading the story…</p>
      <div className="mt-16 space-y-10">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-64 animate-pulse rounded-2xl bg-ink/5 ring-1 ring-ink/10"
          />
        ))}
      </div>
    </div>
  );
}

function ErrorState({
  tripId,
  onRetry,
}: {
  tripId: string;
  onRetry: () => void;
}) {
  return (
    <div className="mx-auto max-w-lg px-6 py-24 text-center">
      <h2 className="font-serif text-3xl text-ink">Couldn&apos;t load this trip</h2>
      <p className="mt-3 text-ink/70">
        Something went wrong fetching the story. Check that you&apos;re signed in,
        then try again.
      </p>
      <div className="mt-8 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={onRetry}
          className="rounded-full bg-trail px-5 py-2 text-sm font-semibold text-paper shadow transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-trail focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
        >
          Try again
        </button>
        <Link
          href={`/trips/${tripId}/edit`}
          className="rounded-full px-5 py-2 text-sm font-medium text-ink/80 ring-1 ring-ink/15 transition hover:bg-ink/5"
        >
          Back to editor
        </Link>
      </div>
    </div>
  );
}

function EmptyState({ tripId, title }: { tripId: string; title: string }) {
  return (
    <div className="mx-auto max-w-lg px-6 py-24 text-center">
      <h1 className="font-serif text-4xl text-ink">{title}</h1>
      <p className="mt-6 text-lg text-ink/70">
        No stops yet — add some in the editor.
      </p>
      <Link
        href={`/trips/${tripId}/edit`}
        className="mt-8 inline-block rounded-full bg-trail px-6 py-2.5 text-sm font-semibold text-paper shadow transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-trail focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
      >
        Add your first stop
      </Link>
    </div>
  );
}
