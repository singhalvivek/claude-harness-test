"use client";

// Public, read-only story reader (Phase 2). Reached only via a trip's unguessable
// share slug — this route is exempt from owner auth in `src/middleware.ts`, so it
// never triggers a login redirect. It loads the published trip through the PUBLIC
// endpoint (`getPublicTrip(slug)` → `/api/public/trips/:slug`) and renders the
// SAME themed serpentine story the owner sees, with NO owner chrome: no "Back to
// editor", no "Add stop", no edit controls, no theme picker — purely the story.
//
// Every state is designed: loading, not-available (unknown OR unpublished slug →
// an indistinguishable friendly 404, with NO login prompt), and ready.

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getPublicTrip, type Trip } from "@/lib/api-client";
import { StoryView } from "@/components/story/StoryView";
import { getTheme } from "@/components/story/themes";

type Status = "loading" | "not-available" | "ready";

// Neutral (paper) chrome shown before a trip's theme is known.
const DEFAULT_MAIN_BG = "hsl(43 40% 97%)";

export default function PublicStoryPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";

  const [trip, setTrip] = useState<Trip | null>(null);
  const [status, setStatus] = useState<Status>("loading");

  const load = useCallback(() => {
    let active = true;
    setStatus("loading");
    getPublicTrip(slug)
      .then((t) => {
        if (!active) return;
        setTrip(t);
        setStatus("ready");
      })
      .catch(() => {
        // Unknown, unpublished, or revoked slug all resolve to the same friendly
        // "not available" page — an unpublished trip must be indistinguishable
        // from a nonexistent one so it can't be probed.
        if (!active) return;
        setTrip(null);
        setStatus("not-available");
      });
    return () => {
      active = false;
    };
  }, [slug]);

  useEffect(() => {
    if (!slug) {
      setStatus("not-available");
      return;
    }
    const cancel = load();
    return cancel;
  }, [slug, load]);

  // Theme the minimal top bar to match the story ground once known.
  const treatment =
    status === "ready" && trip && trip.stops.length > 0 ? getTheme(trip.theme) : null;
  const mainBg = treatment?.rootStyle.backgroundColor ?? DEFAULT_MAIN_BG;

  return (
    <main className="min-h-screen" style={{ backgroundColor: mainBg }}>
      {status === "loading" && <LoadingState />}
      {status === "not-available" && <NotAvailableState />}
      {status === "ready" && trip && (
        <>
          {/* Minimal public top bar: just the trip title. No owner chrome. */}
          <header
            data-testid="public-story-header"
            className={
              treatment?.chrome.headerClassName ??
              "sticky top-0 z-50 flex items-center justify-center gap-3 border-b border-ink/10 bg-paper/85 px-4 py-3 text-ink backdrop-blur sm:px-6"
            }
          >
            <span className="truncate text-center font-serif text-base font-semibold sm:text-lg">
              {trip.title}
            </span>
          </header>

          {trip.stops.length === 0 ? (
            <EmptyState title={trip.title} />
          ) : (
            <div className="pb-24">
              <StoryView trip={trip} />
            </div>
          )}
        </>
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

function NotAvailableState() {
  return (
    <div
      data-testid="public-not-available"
      className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-6 py-24 text-center"
    >
      <div
        aria-hidden="true"
        className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-ink/5 text-2xl"
      >
        🧭
      </div>
      <h1 className="font-serif text-3xl text-ink">This trip isn&apos;t available</h1>
      <p className="mt-3 text-ink/70">
        The link may be incorrect, or the owner has unpublished this trip. There&apos;s
        nothing to see here.
      </p>
    </div>
  );
}

function EmptyState({ title }: { title: string }) {
  return (
    <div className="mx-auto max-w-lg px-6 py-24 text-center">
      <h1 className="font-serif text-4xl text-ink">{title}</h1>
      <p className="mt-6 text-lg text-ink/70">This trip has no stops yet.</p>
    </div>
  );
}
