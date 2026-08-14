"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  getTrip,
  updateStop,
  MAX_FEELING_CHARS,
  type FeelingPlacement,
  type Stop,
  type StoryTheme,
} from "@/lib/api-client";
import { type SaveStatus } from "@/components/editor/TripHeader";

/**
 * Per-stop **Feeling** editor (Phase 2.5) — the one-line feeling plus its
 * placement on the story. Lives at the top of the stop drawer, above the media
 * uploader.
 *
 * Save semantics (both are non-destructive: each PATCH carries ONLY the field
 * that actually changed, so they can never clobber each other or the drawer's
 * explicit **Save stop**, which never sends `feeling`/`feelingPlacement`):
 * - **text** → autosave **on blur** via `updateStop(stop.id, { feeling })`,
 *   and only when the trimmed value differs from what is already persisted;
 * - **placement** → **live-save on click** via
 *   `updateStop(stop.id, { feelingPlacement })`, mirroring `MotifPicker`'s
 *   optimistic-highlight UX.
 *
 * The textarea renders in the trip theme's feeling face at ~20 px, so what the
 * owner types looks like what the story will render (see `ui.md`). `StopPanel`
 * only ever receives a `Stop`, so the theme is resolved from the editor route
 * (`/trips/[tripId]/edit`) with a single best-effort `getTrip`; any failure
 * simply leaves the default face in place — this is styling, never a blocker.
 * Like `ThemePicker`, this file codes against the frozen `StoryTheme` enum and
 * does NOT import from the story slice.
 */

const DEFAULT_PLACEMENT: FeelingPlacement = "card";
const DEFAULT_THEME: StoryTheme = "cinematic";

/** Past this many characters the counter turns amber (ui.md). */
const WARN_AT_CHARS = MAX_FEELING_CHARS - 20;

/**
 * The four feeling faces, as CSS variable + its own-register fallback stack
 * (ui.md → *The four feeling faces*). The variables are registered by
 * `src/app/layout.tsx`; if one is missing the face degrades **within its own
 * type class** rather than to the app chrome.
 *
 * Each `var()` carries an in-var fallback (`var(--x, Georgia)`) on purpose: an
 * *undefined* custom property makes the whole `font-family` declaration invalid
 * at computed-value time, which would silently inherit the app's Fraunces/Inter
 * chrome — the one outcome this feature must never have.
 */
const FEELING_FACE: Record<StoryTheme, { fontFamily: string; fontWeight: number }> = {
  cinematic: {
    fontFamily: 'var(--font-feeling-cinematic, Georgia), Georgia, "Times New Roman", serif',
    fontWeight: 600,
  },
  editorial: {
    fontFamily:
      'var(--font-feeling-editorial, "Didot"), "Didot", "Bodoni MT", "Times New Roman", serif',
    fontWeight: 700,
  },
  minimal: {
    fontFamily:
      'var(--font-feeling-minimal, "Segoe UI"), "Segoe UI", Roboto, system-ui, sans-serif',
    fontWeight: 500,
  },
  vintage: {
    fontFamily:
      'var(--font-feeling-vintage, "Segoe Script"), "Segoe Script", "Bradley Hand", cursive',
    fontWeight: 600,
  },
};

type PlacementChoice = {
  id: FeelingPlacement;
  label: string;
  hint: string;
};

const PLACEMENT_CHOICES: PlacementChoice[] = [
  {
    id: "before",
    label: "Its own card, before this stop",
    hint: "The quote card leads into the stop. On stop 1 it opens the story.",
  },
  {
    id: "card",
    label: "Its own card, after this stop",
    hint: "A big quote card standing on the trail, just past this stop.",
  },
  {
    id: "inline",
    label: "Inside the stop card",
    hint: "A small pull-quote tucked into this stop's card.",
  },
  {
    id: "none",
    label: "Hidden",
    hint: "Keeps the words saved, shows them nowhere.",
  },
];

/** Trimmed value as the API stores it: blank becomes `null`. */
function normalizeFeeling(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** Tiny diagram-ish glyph per placement: quote card on the path / pull-quote inside a card / hidden. */
function PlacementGlyph({ placement }: { placement: FeelingPlacement }) {
  const common = {
    width: 34,
    height: 24,
    viewBox: "0 0 34 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (placement === "before") {
    // Same winding path, but the quote card sits ABOVE the stop card — the
    // mirror image of "card", so the two read as a matched pair at a glance.
    return (
      <svg {...common}>
        <path d="M17 1.5c0 4-6 4.5-6 9s6 5 6 9" strokeDasharray="3 2.5" />
        <rect x="22" y="2.5" width="10.5" height="9" rx="1.6" fill="currentColor" opacity="0.14" />
        <rect x="22" y="2.5" width="10.5" height="9" rx="1.6" />
        <path d="M24.6 5.9v2.4M27 5.9v2.4" />
        <rect x="1.5" y="14" width="8" height="7" rx="1.6" />
      </svg>
    );
  }
  if (placement === "card") {
    // A winding path with a stop card on one side and the quote card opposite.
    return (
      <svg {...common}>
        <path d="M17 1.5c0 4-6 4.5-6 9s6 5 6 9" strokeDasharray="3 2.5" />
        <rect x="1.5" y="3" width="8" height="7" rx="1.6" />
        <rect x="22" y="12" width="10.5" height="9" rx="1.6" fill="currentColor" opacity="0.14" />
        <rect x="22" y="12" width="10.5" height="9" rx="1.6" />
        <path d="M24.6 15.4v2.4M27 15.4v2.4" />
      </svg>
    );
  }
  if (placement === "inline") {
    // One stop card with the pull-quote as a line inside it.
    return (
      <svg {...common}>
        <path d="M17 1.5c0 4-6 4.5-6 9s6 5 6 9" strokeDasharray="3 2.5" />
        <rect x="20" y="3" width="12.5" height="18" rx="1.8" />
        <rect x="22.4" y="5.6" width="7.7" height="4.4" rx="1" fill="currentColor" opacity="0.14" />
        <path d="M22.4 13.6h7.7M22.4 16.6h5" />
      </svg>
    );
  }
  // Hidden: the card outline with a slash through it.
  return (
    <svg {...common}>
      <rect x="8" y="5" width="18" height="14" rx="2" opacity="0.55" />
      <path d="M6 20.5 28 3.5" />
    </svg>
  );
}

export function FeelingEditor({
  stop,
  refresh,
  onSaveStatus,
}: {
  stop: Stop;
  refresh: () => Promise<void>;
  onSaveStatus?: (status: SaveStatus) => void;
}) {
  const [text, setText] = useState(stop.feeling ?? "");
  const [status, setStatus] = useState<SaveStatus>("idle");
  // What the server currently holds. Blur compares against this so an unchanged
  // field is never re-sent (non-destructive editing).
  const persistedRef = useRef<string | null>(stop.feeling ?? null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Optimistic placement: wins over `stop.feelingPlacement` while a save is in
  // flight (and until the refreshed prop catches up), exactly like MotifPicker.
  const [optimisticPlacement, setOptimisticPlacement] = useState<FeelingPlacement | null>(null);
  const [busy, setBusy] = useState(false);

  const selectedPlacement: FeelingPlacement =
    optimisticPlacement ?? stop.feelingPlacement ?? DEFAULT_PLACEMENT;

  // Theme (styling only) — see the component doc above.
  const params = useParams<{ tripId?: string }>();
  const routeTripId = typeof params?.tripId === "string" ? params.tripId : undefined;
  const [theme, setTheme] = useState<StoryTheme>(DEFAULT_THEME);

  useEffect(() => {
    if (!routeTripId) return;
    let active = true;
    getTrip(routeTripId)
      .then((trip) => {
        if (active && trip.theme) setTheme(trip.theme);
      })
      .catch(() => {
        // Styling only — keep the default face.
      });
    return () => {
      active = false;
    };
  }, [routeTripId]);

  const face = FEELING_FACE[theme] ?? FEELING_FACE[DEFAULT_THEME];
  const count = text.length;
  const overWarn = count > WARN_AT_CHARS;

  function report(next: SaveStatus) {
    setStatus(next);
    onSaveStatus?.(next);
  }

  /** Autosave-on-blur — sends `{ feeling }` and nothing else, only when changed. */
  async function handleBlur() {
    const next = normalizeFeeling(text);
    if (next === persistedRef.current) return; // unchanged → send nothing at all

    report("saving");
    try {
      const updated = await updateStop(stop.id, { feeling: next });
      persistedRef.current = updated.feeling ?? null;
      // Show exactly what was stored (trimmed) — unless the owner is already
      // typing again, in which case their in-progress text wins.
      if (document.activeElement !== textareaRef.current) {
        setText(updated.feeling ?? "");
      }
      report("saved");
      await refresh();
    } catch {
      // The previous value stays in the DB; the typed text stays on screen so
      // nothing is lost. The drawer surfaces the message in its error slot.
      report("error");
    }
  }

  /** Live-save on click — sends `{ feelingPlacement }` and nothing else. */
  async function pickPlacement(placement: FeelingPlacement) {
    if (placement === selectedPlacement || busy) return;

    setOptimisticPlacement(placement); // optimistic highlight
    setBusy(true);
    report("saving");
    try {
      await updateStop(stop.id, { feelingPlacement: placement });
      await refresh();
      report("saved");
      setOptimisticPlacement(null); // the refreshed prop now carries it
    } catch {
      setOptimisticPlacement(null); // revert to the prior placement
      report("error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-testid="feeling-editor">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3">
        <label className="text-sm font-medium text-ink" htmlFor="stop-feeling">
          Feeling <span className="font-normal text-ink/40">(optional)</span>
        </label>
        <span
          data-testid="stop-feeling-status"
          aria-live="polite"
          className="text-xs text-ink/45"
        >
          {status === "saving" ? "Saving…" : status === "saved" ? "Saved ✓" : ""}
        </span>
      </div>
      <p className="mb-2 text-xs text-ink/50">
        One line about how this stop felt — shown in your story&rsquo;s own type. Saves when you
        click away.
      </p>

      <textarea
        id="stop-feeling"
        ref={textareaRef}
        data-testid="stop-feeling"
        value={text}
        maxLength={MAX_FEELING_CHARS}
        onChange={(e) => setText(e.target.value.slice(0, MAX_FEELING_CHARS))}
        onBlur={() => void handleBlur()}
        rows={3}
        placeholder="How did this stop feel? One line."
        aria-describedby="stop-feeling-count"
        className="w-full resize-y rounded-lg border border-ink/20 bg-paper px-3.5 py-2.5 text-ink outline-none transition focus:border-trail focus:ring-2 focus:ring-trail/25"
        style={{
          fontFamily: face.fontFamily,
          fontWeight: face.fontWeight,
          fontSize: "1.25rem",
          lineHeight: 1.55,
        }}
      />

      <div className="mt-1 flex items-baseline justify-end">
        <span
          id="stop-feeling-count"
          data-testid="stop-feeling-count"
          className={`text-xs tabular-nums ${overWarn ? "font-medium text-amber-600" : "text-ink/45"}`}
        >
          {count}/{MAX_FEELING_CHARS}
        </span>
      </div>

      <p className="mb-1.5 mt-3 text-xs font-medium text-ink/70">Where it shows in the story</p>
      {/* Four choices since Phase 2.6 ("before" joined "after"), so a 2×2 grid
          rather than four columns squeezed into the editor panel. */}
      <div role="group" aria-label="Feeling placement options" className="grid gap-2 sm:grid-cols-2">
        {PLACEMENT_CHOICES.map(({ id, label, hint }) => {
          const isSelected = id === selectedPlacement;
          return (
            <button
              key={id}
              type="button"
              data-testid="stop-feeling-placement"
              data-placement={id}
              data-placement-selected={isSelected ? "true" : "false"}
              aria-pressed={isSelected}
              aria-label={`${label} — ${hint}${isSelected ? " (selected)" : ""}`}
              disabled={busy && !isSelected}
              onClick={() => void pickPlacement(id)}
              className={`flex flex-col items-start gap-1 rounded-lg border bg-paper px-2.5 py-2 text-left transition focus:outline-none focus:ring-2 focus:ring-trail/40 disabled:cursor-not-allowed disabled:opacity-60 ${
                isSelected
                  ? "border-trail shadow-sm ring-2 ring-trail/50"
                  : "border-ink/15 hover:border-ink/30 hover:bg-trail/5"
              }`}
            >
              <span className={isSelected ? "text-trail" : "text-ink/45"}>
                <PlacementGlyph placement={id} />
              </span>
              <span className="text-xs font-medium leading-snug text-ink">{label}</span>
              <span className="text-[11px] leading-snug text-ink/50">{hint}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
