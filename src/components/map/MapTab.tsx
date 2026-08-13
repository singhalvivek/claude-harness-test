"use client";

import dynamic from "next/dynamic";
import { Spinner } from "@/components/ui/Spinner";

// Client-only import: react-leaflet touches `window`/`document`, so it must not
// be server-rendered. `ssr: false` keeps `next build` from evaluating it on the
// server.
const LeafletMap = dynamic(() => import("./LeafletMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[300px] w-full items-center justify-center rounded-md border border-ink/10 bg-ink/5">
      <Spinner />
    </div>
  ),
});

export function MapTab({
  lat,
  lng,
  onPick,
}: {
  lat: number | null;
  lng: number | null;
  onPick: (lat: number, lng: number) => void;
}) {
  return (
    <div>
      <LeafletMap lat={lat} lng={lng} onPick={onPick} />
      <p className="mt-1.5 text-xs text-ink/50">Click the map to drop a pin, or drag the pin to fine-tune.</p>
    </div>
  );
}
