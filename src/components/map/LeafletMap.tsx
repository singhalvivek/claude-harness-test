"use client";

// This module is imported ONLY via `next/dynamic({ ssr: false })` (see
// MapTab.tsx) so Leaflet never runs during SSR (`window`/`document` are absent
// on the server and would crash `next build`).
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useMemo } from "react";
import { MapContainer, Marker, TileLayer, useMapEvents } from "react-leaflet";

// Leaflet's default marker icon URLs resolve relative to the CSS by default,
// which breaks under a bundler. Point them at the pinned CDN assets so pins are
// always visible. Runs once at module load (client-only).
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

interface LeafletMapProps {
  lat: number | null;
  lng: number | null;
  onPick: (lat: number, lng: number) => void;
}

function ClickCapture({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function LeafletMap({ lat, lng, onPick }: LeafletMapProps) {
  const hasPin = lat != null && lng != null;
  const center = useMemo<[number, number]>(
    () => (hasPin ? [lat as number, lng as number] : [20, 0]),
    [hasPin, lat, lng],
  );

  return (
    <MapContainer
      center={center}
      zoom={hasPin ? 9 : 2}
      scrollWheelZoom
      style={{ height: 300, width: "100%" }}
      className="overflow-hidden rounded-md border border-ink/10"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ClickCapture onPick={onPick} />
      {hasPin && (
        <Marker
          position={[lat as number, lng as number]}
          draggable
          eventHandlers={{
            dragend(e) {
              const marker = e.target as L.Marker;
              const p = marker.getLatLng();
              onPick(p.lat, p.lng);
            },
          }}
        />
      )}
    </MapContainer>
  );
}
