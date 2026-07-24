"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addStopTag,
  listTags,
  removeStopTag,
  type Stop,
  type Tag,
} from "@/lib/api-client";
import { Button } from "@/components/ui/Button";
import { type SaveStatus } from "@/components/editor/TripHeader";
import { getErrorMessage } from "@/components/ui/errors";

/**
 * Per-stop mood / activity tag assignment (Phase 2). Turns the Phase-1
 * "Tags — coming soon" stub into the real editor for one stop:
 *
 *  - Lists the stop's current tags as removable chips (`removeStopTag`).
 *  - An add control that (a) offers existing workspace tags not yet on the stop
 *    (one-tap add via `addStopTag({ tagId })`) and (b) lets you type a brand-new
 *    label + kind, created-or-found via `addStopTag({ label, kind })`.
 *
 * Source of truth for the rendered chips is the `stop.tags` prop; every mutation
 * calls the passed `refresh()` so the parent re-reads the trip, and drives the
 * shared `onSaveStatus` indicator. A reused label maps to one `Tag` row (the API
 * create-or-finds), so no duplicates appear.
 *
 * Frozen prop shape: `StopTagsEditor({ stop, refresh, onSaveStatus? })`.
 */

type TagKind = "mood" | "activity";

const KINDS: { value: TagKind; label: string }[] = [
  { value: "activity", label: "Activity" },
  { value: "mood", label: "Mood" },
];

export function StopTagsEditor({
  stop,
  refresh,
  onSaveStatus,
}: {
  stop: Stop;
  refresh: () => Promise<void>;
  onSaveStatus?: (status: SaveStatus) => void;
}) {
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<TagKind>("activity");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = stop.tags;

  const loadAllTags = useCallback(async () => {
    try {
      setAllTags(await listTags());
    } catch {
      // Suggestions are a convenience; a failure here still lets the owner type
      // a new label. Keep whatever we had.
    }
  }, []);

  useEffect(() => {
    void loadAllTags();
  }, [loadAllTags]);

  // Existing workspace tags the stop doesn't already carry — offered as one-tap
  // suggestions so labels stay reused (no accidental duplicates).
  const suggestions = useMemo(() => {
    const onStop = new Set(current.map((t) => t.id));
    return allTags.filter((t) => !onStop.has(t.id));
  }, [allTags, current]);

  async function runMutation(op: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    onSaveStatus?.("saving");
    try {
      await op();
      await refresh();
      await loadAllTags();
      onSaveStatus?.("saved");
      return true;
    } catch (err) {
      onSaveStatus?.("error");
      setError(getErrorMessage(err, "Could not update tags."));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleAddNew() {
    const trimmed = label.trim();
    if (!trimmed || busy) return;
    // If the typed label matches an existing tag, reuse its kind so a reused
    // label always maps to the same row regardless of the selected kind.
    const match = allTags.find(
      (t) => t.label.toLowerCase() === trimmed.toLowerCase(),
    );
    const ok = await runMutation(() =>
      match
        ? addStopTag(stop.id, { tagId: match.id })
        : addStopTag(stop.id, { label: trimmed, kind }),
    );
    if (ok) setLabel("");
  }

  async function handleAddExisting(tag: Tag) {
    if (busy) return;
    await runMutation(() => addStopTag(stop.id, { tagId: tag.id }));
  }

  async function handleRemove(tag: Tag) {
    if (busy) return;
    await runMutation(() => removeStopTag(stop.id, tag.id));
  }

  const listId = `tag-suggestions-${stop.id}`;

  return (
    <div
      data-testid="stop-tags-editor"
      data-stop-id={stop.id}
      className="space-y-3"
    >
      {/* Current tags — removable chips. */}
      {current.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label="Assigned tags">
          {current.map((tag) => (
            <li key={tag.id}>
              <span
                data-testid="stop-tag-chip"
                data-tag-label={tag.label}
                data-tag-kind={tag.kind}
                className="inline-flex items-center gap-1.5 rounded-full border border-trail/25 bg-trail/10 py-0.5 pl-2.5 pr-1 text-xs font-medium text-ink"
              >
                <span
                  aria-hidden="true"
                  className={`h-1.5 w-1.5 rounded-full ${
                    tag.kind === "mood" ? "bg-rose-500" : "bg-trail"
                  }`}
                />
                {tag.label}
                <button
                  type="button"
                  data-testid="stop-tag-remove"
                  aria-label={`Remove ${tag.label} tag`}
                  disabled={busy}
                  onClick={() => void handleRemove(tag)}
                  className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full text-ink/50 transition hover:bg-ink/10 hover:text-ink disabled:opacity-50"
                >
                  ✕
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-ink/40">No tags yet — add mood or activity tags below.</p>
      )}

      {/* Add control: type a new label + kind. */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          data-testid="tag-label-input"
          value={label}
          list={listId}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleAddNew();
            }
          }}
          placeholder="Add a tag (e.g. hiking, food)…"
          aria-label="New tag label"
          className="min-w-0 flex-1 rounded-md border border-ink/20 px-2.5 py-1.5 text-sm outline-none focus:border-trail"
        />
        <datalist id={listId}>
          {allTags.map((t) => (
            <option key={t.id} value={t.label} />
          ))}
        </datalist>
        <select
          data-testid="tag-kind-select"
          value={kind}
          onChange={(e) => setKind(e.target.value as TagKind)}
          aria-label="New tag kind"
          className="rounded-md border border-ink/20 bg-paper px-2 py-1.5 text-sm text-ink outline-none focus:border-trail"
        >
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
        <Button
          data-testid="tag-add-button"
          variant="secondary"
          className="px-3 py-1.5"
          disabled={busy || label.trim() === ""}
          onClick={() => void handleAddNew()}
        >
          Add
        </Button>
      </div>

      {/* One-tap suggestions from existing workspace tags. */}
      {suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[0.7rem] uppercase tracking-wide text-ink/40">Existing:</span>
          {suggestions.map((tag) => (
            <button
              key={tag.id}
              type="button"
              data-testid="tag-suggestion"
              data-tag-label={tag.label}
              disabled={busy}
              onClick={() => void handleAddExisting(tag)}
              className="inline-flex items-center gap-1 rounded-full border border-ink/15 bg-white/70 px-2 py-0.5 text-xs text-ink/70 transition hover:border-trail/40 hover:text-ink disabled:opacity-50"
            >
              <span aria-hidden="true">+</span>
              {tag.label}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p data-testid="stop-tags-error" className="text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
