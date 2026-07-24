"use client";

import { useState } from "react";
import { updateTrip, type StoryTheme, type Trip } from "@/lib/api-client";
import { type SaveStatus } from "@/components/editor/TripHeader";

/**
 * Story theme picker (Phase 1.5). Four selectable swatches with labels; picking
 * one live-saves via `updateTrip(tripId, { theme })` and surfaces the shared
 * "Saving… / Saved ✓" indicator through `onSaveStatus`. The choice persists
 * across reload (the story view reads `Trip.theme`).
 *
 * Swatch colors use inline styles on purpose — this component previews each
 * theme's palette without adding any tokens to `tailwind.config.ts`.
 */

const DEFAULT_THEME: StoryTheme = "cinematic";

type ThemeMeta = {
  id: StoryTheme;
  name: string;
  /** One-line mood description shown under the swatch. */
  description: string;
  /** CSS background for the preview swatch (inline — no tailwind tokens). */
  swatch: string;
  /** Accent color for the selected-check badge. */
  accent: string;
};

/**
 * Inline theme metadata. Coded against the frozen `StoryTheme` enum — it does
 * NOT import from the story slice (which owns the actual rendered treatments).
 */
const THEMES: ThemeMeta[] = [
  {
    id: "cinematic",
    name: "Cinematic",
    description: "Dark, cinematic, full-bleed photos",
    swatch: "linear-gradient(135deg, #1c1917 0%, #292524 52%, #d97706 100%)",
    accent: "#f59e0b",
  },
  {
    id: "editorial",
    name: "Editorial",
    description: "Warm paper, refined serif",
    swatch: "linear-gradient(135deg, #f6ecd6 0%, #efe2c6 50%, #c96f45 100%)",
    accent: "#c96f45",
  },
  {
    id: "minimal",
    name: "Minimal",
    description: "Clean, neutral, airy",
    swatch: "linear-gradient(135deg, #f8fafc 0%, #eef2f6 52%, #64748b 100%)",
    accent: "#64748b",
  },
  {
    id: "vintage",
    name: "Vintage",
    description: "Scrapbook, kraft paper, dashed route",
    swatch: "linear-gradient(135deg, #cdb489 0%, #bb9d6c 52%, #b1372f 100%)",
    accent: "#b1372f",
  },
];

export function ThemePicker({
  trip,
  refresh,
  onSaveStatus,
}: {
  trip: Trip;
  refresh: () => Promise<void>;
  onSaveStatus?: (status: SaveStatus) => void;
}) {
  // Optimistic override: while a save is in flight (and until the refreshed prop
  // catches up) this wins over `trip.theme`; on success/failure it clears so the
  // (updated / prior) prop becomes the single source of truth again.
  const [optimistic, setOptimistic] = useState<StoryTheme | null>(null);
  const [busy, setBusy] = useState(false);

  const selected: StoryTheme = optimistic ?? trip.theme ?? DEFAULT_THEME;

  async function pick(theme: StoryTheme) {
    // Clicking the already-selected theme is a no-op; ignore clicks mid-save.
    if (theme === selected || busy) return;

    setOptimistic(theme); // optimistic highlight
    setBusy(true);
    onSaveStatus?.("saving");
    try {
      await updateTrip(trip.id, { theme });
      await refresh();
      onSaveStatus?.("saved");
      setOptimistic(null); // refreshed prop now carries the new theme
    } catch {
      setOptimistic(null); // revert the highlight to the prior theme
      onSaveStatus?.("error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      data-testid="theme-picker"
      aria-label="Story theme"
      className="rounded-xl border border-ink/10 bg-white/60 p-4 shadow-sm"
    >
      <div className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h2 className="font-serif text-xl text-ink">Story theme</h2>
        <p className="text-xs text-ink/50">Sets the look of your story view — saved instantly.</p>
      </div>

      <div
        role="group"
        aria-label="Story theme options"
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        {THEMES.map((t) => {
          const isSelected = t.id === selected;
          return (
            <button
              key={t.id}
              type="button"
              data-testid={`theme-option-${t.id}`}
              data-theme-selected={isSelected ? "true" : "false"}
              aria-pressed={isSelected}
              aria-current={isSelected ? "true" : undefined}
              aria-label={`${t.name} theme — ${t.description}${isSelected ? " (selected)" : ""}`}
              disabled={busy && !isSelected}
              onClick={() => void pick(t.id)}
              className={`group relative flex flex-col overflow-hidden rounded-lg border bg-paper text-left transition focus:outline-none focus:ring-2 focus:ring-trail/40 disabled:cursor-not-allowed ${
                isSelected
                  ? "border-trail shadow-md ring-2 ring-trail/50"
                  : "border-ink/15 hover:border-ink/30 hover:shadow-sm"
              }`}
            >
              <span
                aria-hidden="true"
                className="block h-16 w-full"
                style={{ background: t.swatch }}
              />
              {isSelected && (
                <span
                  aria-hidden="true"
                  className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold leading-none text-white shadow-sm ring-1 ring-white/50"
                  style={{ background: t.accent }}
                >
                  ✓
                </span>
              )}
              <span className="flex flex-col gap-0.5 px-2.5 py-2">
                <span className="text-sm font-medium text-ink">{t.name}</span>
                <span className="text-xs leading-snug text-ink/55">{t.description}</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
