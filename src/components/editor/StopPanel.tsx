"use client";

import { useState } from "react";
import { deleteStop, updateStop, type Stop } from "@/lib/api-client";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { ComingSoonPill } from "@/components/ui/Pill";
import { getErrorMessage } from "@/components/ui/errors";
import { LocationPicker, type LocationValue } from "@/components/map/LocationPicker";
import { PhotoUploader } from "@/components/photos/PhotoUploader";
import { fromDateTimeLocal, toDateTimeLocal } from "./format";

/**
 * Add/Edit Stop drawer. The parent creates the Stop row before opening (so the
 * uploader always has a real `stopId`) and passes it in as `stop`. Location,
 * date/time and entry are buffered locally and persisted on Save; photos persist
 * immediately (the live `stop.photos` come from the parent's refresh). Cancelling
 * a brand-new draft deletes the empty stop so nothing is left behind.
 *
 * Mount this with `key={stop.id}` so the local form state initialises per stop.
 */
export function StopPanel({
  stop,
  isNewDraft,
  onClose,
  onSaved,
  refresh,
}: {
  stop: Stop;
  isNewDraft: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
  refresh: () => Promise<void>;
}) {
  const [title, setTitle] = useState(stop.title ?? "");
  const [body, setBody] = useState(stop.body ?? "");
  const [occurredAtLocal, setOccurredAtLocal] = useState(toDateTimeLocal(stop.occurredAt));
  const [location, setLocation] = useState<LocationValue>({
    placeName: stop.placeName ?? "",
    lat: stop.lat,
    lng: stop.lng,
    locationPrecision: stop.locationPrecision,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await updateStop(stop.id, {
        title: title.trim() === "" ? null : title.trim(),
        placeName: location.placeName.trim() === "" ? null : location.placeName.trim(),
        lat: location.lat,
        lng: location.lng,
        locationPrecision: location.locationPrecision,
        occurredAt: fromDateTimeLocal(occurredAtLocal),
        body,
      });
      await onSaved();
    } catch (err) {
      setError(getErrorMessage(err, "Could not save this stop."));
      setSaving(false);
    }
  }

  async function handleCancel() {
    if (isNewDraft) {
      setCancelling(true);
      try {
        await deleteStop(stop.id);
        await refresh();
      } catch {
        // If cleanup fails the empty stop simply remains; harmless.
      }
    }
    onClose();
  }

  return (
    <Drawer
      open
      onClose={handleCancel}
      title={isNewDraft ? "Add stop" : "Edit stop"}
      testId="stop-panel"
    >
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-ink/10 bg-paper px-5 py-4">
        <h2 className="font-serif text-xl text-ink">{isNewDraft ? "Add a stop" : "Edit stop"}</h2>
        <button
          type="button"
          data-testid="stop-panel-close"
          onClick={handleCancel}
          aria-label="Close"
          className="rounded p-1 text-ink/50 hover:bg-ink/5 hover:text-ink"
        >
          ✕
        </button>
      </header>

      <div className="flex-1 space-y-5 px-5 py-4">
        <section>
          <label className="text-sm font-medium text-ink" htmlFor="stop-title">
            Stop title <span className="font-normal text-ink/40">(optional)</span>
          </label>
          <input
            id="stop-title"
            data-testid="stop-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Morning at the shrine"
            className="mt-1 w-full rounded-md border border-ink/20 px-3 py-2 text-sm outline-none focus:border-trail"
          />
        </section>

        <section>
          <p className="mb-2 text-sm font-medium text-ink">Location</p>
          <LocationPicker value={location} onChange={setLocation} />
        </section>

        <section>
          <label className="text-sm font-medium text-ink" htmlFor="stop-occurred-at">
            Date &amp; time
          </label>
          <input
            id="stop-occurred-at"
            data-testid="stop-occurred-at"
            type="datetime-local"
            value={occurredAtLocal}
            onChange={(e) => setOccurredAtLocal(e.target.value)}
            className="mt-1 block w-full rounded-md border border-ink/20 px-3 py-2 text-sm outline-none focus:border-trail sm:w-auto"
          />
        </section>

        <section>
          <div className="mb-1 flex items-center gap-2">
            <label className="text-sm font-medium text-ink" htmlFor="stop-body">
              Entry
            </label>
            <ComingSoonPill label="Markdown formatting" testId="markdown-coming-soon" />
          </div>
          <textarea
            id="stop-body"
            data-testid="stop-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            placeholder="Write about this stop… (plain text for now)"
            className="w-full resize-y rounded-md border border-ink/20 px-3 py-2 text-sm outline-none focus:border-trail"
          />
        </section>

        <section>
          <PhotoUploader stopId={stop.id} photos={stop.photos} refresh={refresh} />
        </section>
      </div>

      {error && (
        <p data-testid="stop-panel-error" className="px-5 text-sm text-red-600">
          {error}
        </p>
      )}

      <footer className="sticky bottom-0 z-10 flex items-center justify-end gap-2 border-t border-ink/10 bg-paper px-5 py-4">
        <Button
          data-testid="stop-panel-cancel"
          variant="ghost"
          onClick={handleCancel}
          disabled={saving || cancelling}
        >
          Cancel
        </Button>
        <Button data-testid="stop-panel-save" onClick={handleSave} disabled={saving || cancelling}>
          {saving ? "Saving…" : "Save stop"}
        </Button>
      </footer>
    </Drawer>
  );
}
