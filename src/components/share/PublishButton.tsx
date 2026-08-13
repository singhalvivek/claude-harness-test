"use client";

import { useEffect, useState } from "react";
import { publishTrip, unpublishTrip, type Trip } from "@/lib/api-client";
import { Button } from "@/components/ui/Button";
import { type SaveStatus } from "@/components/editor/TripHeader";
import { getErrorMessage } from "@/components/ui/errors";

/**
 * Publish / share panel (Phase 2). Turns the Phase-1 "Share — coming soon" stub
 * into the real feature:
 *
 *  - Unpublished → a single **Publish** action that mints an unguessable public
 *    link via `publishTrip(tripId)` and reveals it.
 *  - Published → the copyable public `/s/<slug>` URL with a **Copy** button and
 *    an **Unpublish** action (which revokes the link; re-publishing mints a
 *    fresh one).
 *
 * Persistence + refresh follow the shared editor pattern: every mutation drives
 * `onSaveStatus` ("saving" → "saved"/"error") and calls the passed `refresh()`
 * so the parent re-reads `trip.isPublished` / `trip.shareSlug`.
 *
 * Frozen prop shape: `PublishButton({ trip, refresh, onSaveStatus? })`.
 */
export function PublishButton({
  trip,
  refresh,
  onSaveStatus,
}: {
  trip: Trip;
  refresh: () => Promise<void>;
  onSaveStatus?: (status: SaveStatus) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Captured after mount so the copyable link is an absolute, shareable URL
  // without risking an SSR/CSR hydration mismatch on `window`.
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const slug = trip.shareSlug;
  const published = trip.isPublished && !!slug;
  const shareUrl = slug ? `${origin}/s/${slug}` : "";

  async function handlePublish() {
    setBusy(true);
    setError(null);
    onSaveStatus?.("saving");
    try {
      await publishTrip(trip.id);
      await refresh();
      onSaveStatus?.("saved");
    } catch (err) {
      onSaveStatus?.("error");
      setError(getErrorMessage(err, "Could not publish this trip."));
    } finally {
      setBusy(false);
    }
  }

  async function handleUnpublish() {
    if (
      !window.confirm(
        "Unpublish this trip? The current public link stops working immediately.",
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    onSaveStatus?.("saving");
    try {
      await unpublishTrip(trip.id);
      await refresh();
      onSaveStatus?.("saved");
    } catch (err) {
      onSaveStatus?.("error");
      setError(getErrorMessage(err, "Could not unpublish this trip."));
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (e.g. insecure context) — the URL stays selectable in
      // the readonly field so it can be copied manually.
      setError("Couldn't copy automatically — select the link and copy it.");
    }
  }

  return (
    <section
      data-testid="publish-panel"
      data-published={published ? "true" : "false"}
      aria-label="Share this trip"
      className="rounded-xl border border-ink/10 bg-white/60 p-4 shadow-sm"
    >
      <div className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h2 className="font-serif text-xl text-ink">Share link</h2>
        <p className="text-xs text-ink/50">
          {published
            ? "Anyone with this link can read the story — no login needed."
            : "Publish to get an unguessable, read-only public link."}
        </p>
      </div>

      {!published ? (
        <div className="flex items-center gap-3">
          <Button
            data-testid="publish-button"
            onClick={() => void handlePublish()}
            disabled={busy}
          >
            {busy ? "Publishing…" : "Publish"}
          </Button>
          <span className="text-xs text-ink/50">This trip is private.</span>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              data-testid="share-url"
              readOnly
              value={shareUrl}
              aria-label="Public share link"
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded-md border border-ink/20 bg-paper px-3 py-2 font-mono text-xs text-ink outline-none focus:border-trail"
            />
            <div className="flex items-center gap-2">
              <Button
                data-testid="copy-link-button"
                variant="secondary"
                onClick={() => void handleCopy()}
                disabled={!shareUrl}
              >
                {copied ? "Copied ✓" : "Copy"}
              </Button>
              <a
                data-testid="open-share-link"
                href={shareUrl || "#"}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-medium text-trail underline underline-offset-2 hover:brightness-110"
              >
                Open
              </a>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button
              data-testid="unpublish-button"
              variant="ghost"
              onClick={() => void handleUnpublish()}
              disabled={busy}
            >
              {busy ? "Working…" : "Unpublish"}
            </Button>
            <span className="inline-flex items-center gap-1.5 text-xs text-ink/50">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
              Published
            </span>
          </div>
        </div>
      )}

      {error && (
        <p data-testid="publish-error" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      )}
    </section>
  );
}
