"use client";

// Mood / activity tag filter for the story view (Phase 2 — capabilities/mood-activity-tags.md).
//
// Frozen prop shape: `TagFilter({ trip, selected, onChange })`. It surfaces the
// distinct tags present across the trip's stops as toggle chips and reports the
// currently-selected tag ids back through `onChange` — the story page owns
// APPLYING the filter (it derives the shown stops). This component holds no
// filter state of its own; `selected` is fully controlled by the parent.
//
// Filter semantics: **ANY / union** — a stop matches when it carries at least one
// of the selected tags. An empty selection shows all stops (the parent enforces
// this). Chips are rendered as light frosted pills so they stay legible on every
// story theme ground, including the dark cinematic canvas (same treatment the
// header's "coming soon" pills already use across all themes).

import type { Tag, Trip } from "@/lib/api-client";

interface TagFilterProps {
  trip: Trip;
  /** Currently-selected tag ids (controlled by the parent). */
  selected: string[];
  /** Report the next selection; the parent re-derives the shown stops. */
  onChange: (selectedTagIds: string[]) => void;
}

/** Distinct tags across all of the trip's stops, ordered kind→label for a stable UI. */
function collectTripTags(trip: Trip): Tag[] {
  const byId = new Map<string, Tag>();
  for (const stop of trip.stops) {
    for (const tag of stop.tags ?? []) {
      if (!byId.has(tag.id)) byId.set(tag.id, tag);
    }
  }
  return [...byId.values()].sort((a, b) =>
    a.kind === b.kind ? a.label.localeCompare(b.label) : a.kind.localeCompare(b.kind),
  );
}

const KIND_DOT: Record<Tag["kind"], string> = {
  mood: "#d6489b", // rose
  activity: "#0f9d8b", // teal
};

export function TagFilter({ trip, selected, onChange }: TagFilterProps) {
  const tags = collectTripTags(trip);

  // Nothing to filter by — render nothing so the story reads clean.
  if (tags.length === 0) return null;

  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  };

  return (
    <div
      data-tag-filter
      className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-2 px-4 pb-1 pt-8"
    >
      <span className="inline-flex items-center rounded-full border border-ink/10 bg-white/70 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-ink/55 backdrop-blur">
        Filter by tag
      </span>

      {tags.map((tag) => {
        const on = selected.includes(tag.id);
        return (
          <button
            key={tag.id}
            type="button"
            aria-pressed={on}
            data-tag-chip={tag.label}
            onClick={() => toggle(tag.id)}
            className={
              on
                ? "inline-flex items-center gap-1.5 rounded-full border border-transparent bg-trail px-3 py-1.5 text-sm font-medium text-paper shadow-sm transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-trail focus-visible:ring-offset-2"
                : "inline-flex items-center gap-1.5 rounded-full border border-ink/15 bg-white/70 px-3 py-1.5 text-sm font-medium text-ink/70 backdrop-blur transition hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-trail"
            }
          >
            <span
              aria-hidden="true"
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: on ? "rgba(255,255,255,0.85)" : KIND_DOT[tag.kind] }}
            />
            {tag.label}
          </button>
        );
      })}

      {selected.length > 0 && (
        <button
          type="button"
          data-tag-clear
          onClick={() => onChange([])}
          className="inline-flex items-center rounded-full px-3 py-1.5 text-sm font-medium text-ink/60 underline decoration-ink/20 underline-offset-4 transition hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-trail"
        >
          Clear
        </button>
      )}
    </div>
  );
}
