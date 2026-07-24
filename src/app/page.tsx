"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listTrips, logout, type TripSummary } from "@/lib/api-client";
import { Button, buttonClasses } from "@/components/ui/Button";
import { ComingSoonPill } from "@/components/ui/Pill";
import { Skeleton } from "@/components/ui/Spinner";
import { getErrorMessage } from "@/components/ui/errors";
import { formatDate } from "@/components/editor/format";

export default function HomePage() {
  const router = useRouter();
  const [trips, setTrips] = useState<TripSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listTrips()
      .then((t) => {
        if (active) {
          setTrips(t);
          setError(null);
        }
      })
      .catch((err) => {
        if (active) setError(getErrorMessage(err, "Could not load your trips."));
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleLogout() {
    try {
      await logout();
    } catch {
      /* proceed to login regardless */
    }
    router.push("/login");
    router.refresh();
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-8 flex items-center justify-between">
        <Link href="/" className="font-serif text-2xl font-semibold text-ink">
          Wanderline
        </Link>
        <div className="flex items-center gap-2">
          <Link href="/trips/new" data-testid="new-trip-button" className={buttonClasses("primary")}>
            + New trip
          </Link>
          <Button data-testid="logout-button" variant="ghost" onClick={handleLogout}>
            Log out
          </Button>
        </div>
      </header>

      {error && (
        <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {trips === null && !error && (
        <div data-testid="trip-grid-skeleton" className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-3 rounded-lg border border-ink/10 p-3">
              <Skeleton className="aspect-[3/2] w-full" />
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-full" />
            </div>
          ))}
        </div>
      )}

      {trips !== null && trips.length === 0 && (
        <div
          data-testid="empty-state"
          className="rounded-xl border border-dashed border-ink/20 bg-white/50 px-6 py-16 text-center"
        >
          <p className="font-serif text-2xl text-ink">Start your first trip</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-ink/50">
            Capture a journey as a winding, photographic story. Add stops, drop photos, and watch the
            trail draw itself.
          </p>
          <Link
            href="/trips/new"
            className={buttonClasses("primary", "mt-5")}
            data-testid="empty-new-trip"
          >
            + New trip
          </Link>
        </div>
      )}

      {trips !== null && trips.length > 0 && (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {trips.map((trip) => (
            <article
              key={trip.id}
              data-testid="trip-card"
              data-trip-id={trip.id}
              className="flex flex-col overflow-hidden rounded-lg border border-ink/10 bg-white shadow-sm transition-shadow hover:shadow-md"
            >
              <Link href={`/trips/${trip.id}/edit`} className="block">
                {trip.coverThumbUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={trip.coverThumbUrl}
                    alt=""
                    className="aspect-[3/2] w-full object-cover"
                  />
                ) : (
                  <div className="flex aspect-[3/2] w-full items-center justify-center bg-gradient-to-br from-trail/10 to-ink/5 text-sm text-ink/40">
                    No cover yet
                  </div>
                )}
                <div className="p-4">
                  <h3 className="truncate font-serif text-xl text-ink">{trip.title}</h3>
                  {trip.description && (
                    <p className="mt-1 line-clamp-2 text-sm text-ink/60">{trip.description}</p>
                  )}
                  <p className="mt-2 text-xs text-ink/45">
                    {trip.stopCount} {trip.stopCount === 1 ? "stop" : "stops"} · Updated{" "}
                    {formatDate(trip.updatedAt)}
                  </p>
                </div>
              </Link>
              <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-ink/10 px-4 py-3">
                <Link
                  href={`/trips/${trip.id}/story`}
                  data-testid="view-story-link"
                  className={buttonClasses("secondary", "px-3 py-1.5 text-xs")}
                >
                  View story
                </Link>
                <ComingSoonPill label="Share" testId="share-coming-soon" />
                <button
                  type="button"
                  data-testid="export-button"
                  disabled
                  title="Coming soon"
                  className="ml-auto cursor-not-allowed rounded-md border border-ink/15 px-3 py-1.5 text-xs text-ink/40"
                >
                  Export
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
