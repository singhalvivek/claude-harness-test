"use client";

import { useState } from "react";
import { updateStop, type Stop, type StopMotif } from "@/lib/api-client";
import { MOTIF_CHOICES, MotifGlyph } from "@/components/motifs/catalog";
import { type SaveStatus } from "@/components/editor/TripHeader";

/**
 * Per-stop motif picker (story decor). An intuitive grid of the frozen
 * `MOTIF_CHOICES` (including `none`): each option shows its themeable glyph plus
 * label, and picking one live-saves via `updateStop(stopId, { motif })` — mirroring
 * `ThemePicker`'s optimistic-highlight + shared save-status UX. Glyphs inherit color
 * from `currentColor`; the editor renders them in ink.
 *
 * Frozen prop shape: `MotifPicker({ stop, refresh, onSaveStatus? })`.
 */

const DEFAULT_MOTIF: StopMotif = "none";

/** Subtle "no motif" tile glyph (circle-slash) shown for the `none` choice. */
function NoneGlyph({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="8.5" />
      <line x1="6.3" y1="6.3" x2="17.7" y2="17.7" />
    </svg>
  );
}

export function MotifPicker({
  stop,
  refresh,
  onSaveStatus,
}: {
  stop: Stop;
  refresh: () => Promise<void>;
  onSaveStatus?: (status: SaveStatus) => void;
}) {
  // Optimistic override: wins over `stop.motif` while a save is in flight (and
  // until the refreshed prop catches up); cleared on success/failure so the
  // (updated / prior) prop becomes the single source of truth again.
  const [optimistic, setOptimistic] = useState<StopMotif | null>(null);
  const [busy, setBusy] = useState(false);

  const selected: StopMotif = optimistic ?? stop.motif ?? DEFAULT_MOTIF;

  async function pick(motif: StopMotif) {
    // Clicking the already-selected motif is a no-op; ignore clicks mid-save.
    if (motif === selected || busy) return;

    setOptimistic(motif); // optimistic highlight
    setBusy(true);
    onSaveStatus?.("saving");
    try {
      await updateStop(stop.id, { motif });
      await refresh();
      onSaveStatus?.("saved");
      setOptimistic(null); // refreshed prop now carries the new motif
    } catch {
      setOptimistic(null); // revert the highlight to the prior motif
      onSaveStatus?.("error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      data-testid="motif-picker"
      role="group"
      aria-label="Stop motif options"
      className="grid grid-cols-4 gap-2 text-ink sm:grid-cols-5"
    >
      {MOTIF_CHOICES.map(({ id, label }) => {
        const isSelected = id === selected;
        const isNone = id === "none";
        return (
          <button
            key={id}
            type="button"
            data-testid={`motif-option-${id}`}
            data-motif-selected={isSelected ? "true" : "false"}
            aria-pressed={isSelected}
            aria-label={`${label} motif${isSelected ? " (selected)" : ""}`}
            disabled={busy && !isSelected}
            onClick={() => void pick(id)}
            className={`flex flex-col items-center gap-1 rounded-lg border bg-paper px-1.5 py-2 transition focus:outline-none focus:ring-2 focus:ring-trail/40 disabled:cursor-not-allowed disabled:opacity-60 ${
              isSelected
                ? "border-trail shadow-sm ring-2 ring-trail/50"
                : "border-ink/15 hover:border-ink/30 hover:bg-trail/5"
            }`}
          >
            <span
              className={`flex h-7 w-7 items-center justify-center ${
                isNone ? "text-ink/40" : "text-ink"
              }`}
            >
              {isNone ? <NoneGlyph size={22} /> : <MotifGlyph motif={id} size={22} />}
            </span>
            <span className="text-[11px] leading-none text-ink/70">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
