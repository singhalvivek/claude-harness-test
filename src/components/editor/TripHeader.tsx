"use client";

import Link from "next/link";
import { useState } from "react";
import { updateTrip, MAX_FEELING_CHARS, type Trip } from "@/lib/api-client";
import { buttonClasses } from "@/components/ui/Button";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * Inline-editable trip title + description + opening feeling. Autosaves each
 * field on blur (non-destructive `PATCH` of just that field). The title never
 * autosaves empty (the API rejects an empty title); the opening feeling MAY be
 * cleared to blank, which the API normalises to null so the card disappears.
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
  const [feeling, setFeeling] = useState(trip.feeling ?? "");

  async function save(patch: {
    title?: string;
    description?: string;
    feeling?: string | null;
  }) {
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

        {/* Phase 2.6 — the trip's opening feeling. Renders as the story's FIRST
            beat, in the theme's display face, before any stop card. Blank
            clears it (the API normalises "" → null), so it is never sticky. */}
        <div className="mt-2">
          <label
            htmlFor="trip-feeling"
            className="px-1 text-xs font-medium uppercase tracking-wide text-ink/50"
          >
            Opening feeling
          </label>
          <input
            id="trip-feeling"
            data-testid="trip-feeling-input"
            aria-label="Trip opening feeling"
            value={feeling}
            maxLength={MAX_FEELING_CHARS}
            onChange={(e) => setFeeling(e.target.value)}
            onBlur={() => {
              if (feeling.trim() !== (trip.feeling ?? "")) void save({ feeling });
            }}
            placeholder="How did this whole journey feel? (opens the story)"
            className="mt-0.5 w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 font-serif text-base italic text-ink/80 outline-none hover:border-ink/10 focus:border-trail"
          />
        </div>
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
