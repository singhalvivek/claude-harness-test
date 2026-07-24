"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { addStop, deleteStop, getTrip, reorderStops, type Trip } from "@/lib/api-client";
import { TripHeader, type SaveStatus } from "@/components/editor/TripHeader";
import { StopList } from "@/components/editor/StopList";
import { StopPanel } from "@/components/editor/StopPanel";
import { Button } from "@/components/ui/Button";
import { ComingSoonPill } from "@/components/ui/Pill";
import { Skeleton } from "@/components/ui/Spinner";
import { getErrorMessage } from "@/components/ui/errors";

function SaveIndicator({ status }: { status: SaveStatus }) {
  const text =
    status === "saving"
      ? "Saving…"
      : status === "saved"
        ? "Saved ✓"
        : status === "error"
          ? "Save failed"
          : "";
  return (
    <span
      data-testid="save-indicator"
      className={`text-xs ${status === "error" ? "text-red-600" : "text-ink/50"}`}
    >
      {text}
    </span>
  );
}

export default function EditorPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [panelStopId, setPanelStopId] = useState<string | null>(null);
  const [newDraftId, setNewDraftId] = useState<string | null>(null);
  const [addBusy, setAddBusy] = useState(false);

  const refresh = useCallback(async () => {
    const t = await getTrip(tripId);
    setTrip(t);
  }, [tripId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getTrip(tripId)
      .then((t) => {
        if (active) {
          setTrip(t);
          setLoadError(null);
        }
      })
      .catch((err) => {
        if (active) setLoadError(getErrorMessage(err, "Could not load this trip."));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [tripId]);

  async function handleAddStop() {
    setAddBusy(true);
    try {
      const created = await addStop(tripId, {});
      await refresh();
      setNewDraftId(created.id);
      setPanelStopId(created.id);
    } catch (err) {
      setSaveStatus("error");
      setLoadError(getErrorMessage(err, "Could not add a stop."));
    } finally {
      setAddBusy(false);
    }
  }

  function handleEditStop(stopId: string) {
    setNewDraftId(null);
    setPanelStopId(stopId);
  }

  async function handleDeleteStop(stopId: string) {
    if (!window.confirm("Delete this stop and its photos? This cannot be undone.")) return;
    try {
      await deleteStop(stopId);
      await refresh();
    } catch (err) {
      setLoadError(getErrorMessage(err, "Could not delete the stop."));
    }
  }

  async function handleReorder(orderedStopIds: string[]) {
    // Optimistic reorder so the list responds instantly.
    setTrip((prev) => {
      if (!prev) return prev;
      const byId = new Map(prev.stops.map((s) => [s.id, s]));
      const next = orderedStopIds
        .map((id, i) => {
          const s = byId.get(id);
          return s ? { ...s, order: i } : null;
        })
        .filter((s): s is NonNullable<typeof s> => s !== null);
      return { ...prev, stops: next };
    });
    try {
      await reorderStops(tripId, orderedStopIds);
      await refresh();
    } catch {
      await refresh();
    }
  }

  function closePanel() {
    setPanelStopId(null);
    setNewDraftId(null);
  }

  async function handlePanelSaved() {
    setSaveStatus("saving");
    await refresh();
    setPanelStopId(null);
    setNewDraftId(null);
    setSaveStatus("saved");
  }

  const panelStop = trip?.stops.find((s) => s.id === panelStopId) ?? null;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/" className="text-sm text-ink/50 hover:text-ink">
          ← All trips
        </Link>
        <SaveIndicator status={saveStatus} />
      </div>

      {loading && (
        <div className="space-y-4">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      )}

      {!loading && loadError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {loadError}
        </div>
      )}

      {!loading && trip && (
        <>
          <TripHeader trip={trip} onSaveStatus={setSaveStatus} refresh={refresh} />

          <section className="mt-8">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h2 className="font-serif text-2xl text-ink">Stops</h2>
              <ComingSoonPill label="Map overview" testId="map-overview-coming-soon" />
              <Button
                data-testid="add-stop-button"
                onClick={handleAddStop}
                disabled={addBusy}
                className="ml-auto"
              >
                {addBusy ? "Adding…" : "+ Add stop"}
              </Button>
            </div>

            {trip.stops.length === 0 ? (
              <div
                data-testid="stops-empty"
                className="rounded-lg border border-dashed border-ink/20 bg-white/50 px-4 py-10 text-center text-sm text-ink/50"
              >
                No stops yet — add your first one to start the trail.
              </div>
            ) : (
              <StopList
                stops={trip.stops}
                onReorder={handleReorder}
                onEdit={handleEditStop}
                onDelete={handleDeleteStop}
              />
            )}
          </section>
        </>
      )}

      {panelStop && (
        <StopPanel
          key={panelStop.id}
          stop={panelStop}
          isNewDraft={panelStop.id === newDraftId}
          onClose={closePanel}
          onSaved={handlePanelSaved}
          refresh={refresh}
        />
      )}
    </main>
  );
}
