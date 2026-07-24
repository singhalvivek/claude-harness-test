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

type Status = "loading" | "error" | "ready";

export default function StoryPage() {
  const params = useParams<{ tripId: string }>();
  const tripId = params?.tripId ?? "";

  const [trip, setTrip] = useState<Trip | null>(null);
  const [status, setStatus] = useState<Status>("loading");

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

  return (
    <main className="min-h-screen bg-paper text-ink">
      {/* Reader chrome: Back to editor + labelled "coming soon" stubs. */}
      <header className="sticky top-0 z-50 flex items-center justify-between gap-3 border-b border-ink/10 bg-paper/85 px-4 py-3 backdrop-blur sm:px-6">
        <Link
          href={`/trips/${tripId}/edit`}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-ink/80 transition hover:bg-ink/5 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-trail"
        >
          <span aria-hidden="true">←</span> Back to editor
        </Link>
        <div className="flex items-center gap-2">
          <ComingSoonPill label="Map overview" />
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
          <StoryView trip={trip} />
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
