"use client";

import Link from "next/link";
import { useState } from "react";
import { updateTrip, type Trip } from "@/lib/api-client";
import { buttonClasses } from "@/components/ui/Button";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * Inline-editable trip title + description. Autosaves each field on blur
 * (non-destructive `PATCH` of just that field). The title never autosaves empty
 * (the API rejects an empty title).
 */
export function TripHeader({
  trip,
  onSaveStatus,
  refresh,
}: {
  trip: Trip;
  onSaveStatus: (status: SaveStatus) => void;
  refresh: () => Promise<void>;
}) {
  const [title, setTitle] = useState(trip.title);
  const [description, setDescription] = useState(trip.description ?? "");

  async function save(patch: { title?: string; description?: string }) {
    onSaveStatus("saving");
    try {
      await updateTrip(trip.id, patch);
      await refresh();
      onSaveStatus("saved");
    } catch {
      onSaveStatus("error");
    }
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1">
        <input
          data-testid="trip-title-input"
          aria-label="Trip title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => {
            const next = title.trim();
            if (next && next !== trip.title) void save({ title: next });
          }}
          placeholder="Untitled trip"
          className="w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 font-serif text-3xl font-semibold text-ink outline-none hover:border-ink/10 focus:border-trail"
        />
        <textarea
          data-testid="trip-description-input"
          aria-label="Trip description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => {
            if (description !== (trip.description ?? "")) void save({ description });
          }}
          placeholder="Add a short description of this journey…"
          rows={2}
          className="mt-1 w-full resize-none rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm text-ink/70 outline-none hover:border-ink/10 focus:border-trail"
        />
      </div>
      <Link
        href={`/trips/${trip.id}/story`}
        data-testid="view-story-button"
        className={buttonClasses("secondary", "shrink-0 whitespace-nowrap")}
      >
        View story →
      </Link>
    </div>
  );
}
