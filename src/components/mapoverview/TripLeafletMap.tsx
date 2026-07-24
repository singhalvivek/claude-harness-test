"use client";

// Client-only Leaflet map for the story's Map overview panel.
//
// This module is imported ONLY via `next/dynamic({ ssr: false })` (see
// MapOverview.tsx) so Leaflet never runs during SSR — `window`/`document` are
// absent on the server and evaluating `leaflet` there would crash `next build`.
// The Leaflet stylesheet is imported here (client-side) for the same reason.
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useMemo } from "react";
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";

const TRAIL = "hsl(18 62% 47%)"; // matches the `trail` Tailwind token.

/** One located stop rendered as a numbered pin on the map. */
export interface MapPoint {
  id: string;
  /** Zero-based stop order; the pin shows `order + 1`. */
  order: number;
  label: string;
  lat: number;
  lng: number;
}

// Leaflet's packaged default marker icon resolves its image URLs relative to the
// CSS, which breaks under a bundler (pins render blank). We sidestep that entirely
// by drawing every marker as a self-contained `L.divIcon` — an inline-styled,
// numbered pin that needs no external image asset.
function numberedIcon(order: number): L.DivIcon {
  return L.divIcon({
    className: "wanderline-map-pin",
    html:
      `<span style="display:flex;align-items:center;justify-content:center;` +
      `width:28px;height:28px;border-radius:9999px;background:${TRAIL};color:#fff;` +
      `font-weight:600;font-size:13px;line-height:1;border:2px solid #fff;` +
      `box-shadow:0 1px 4px rgba(0,0,0,0.45)">${order + 1}</span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

/** Fit the map to show every located stop (or center on the sole one). */
function FitToStops({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  const key = positions.map((p) => p.join(",")).join("|");
  useEffect(() => {
    if (positions.length === 0) return;
    if (positions.length === 1) {
      map.setView(positions[0], 10);
      return;
    }
    map.fitBounds(L.latLngBounds(positions), { padding: [48, 48] });
    // `key` captures the positions identity without re-running on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);
  return null;
}

export default function TripLeafletMap({ stops }: { stops: MapPoint[] }) {
  const positions = useMemo<[number, number][]>(
    () => stops.map((s) => [s.lat, s.lng]),
    [stops],
  );
  const center = positions[0] ?? [20, 0];

  return (
    <MapContainer
      center={center}
      zoom={5}
      scrollWheelZoom
      style={{ height: 420, width: "100%" }}
      className="z-0"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {/* The route line connects stops in their journey order, mirroring the
          serpentine sequence. (Needs >= 2 points to render an SVG path.) */}
      {positions.length >= 2 && (
        <Polyline
          positions={positions}
          pathOptions={{ color: TRAIL, weight: 3, opacity: 0.85, dashArray: "1 10", lineCap: "round" }}
        />
      )}

      {stops.map((s) => (
        <Marker key={s.id} position={[s.lat, s.lng]} icon={numberedIcon(s.order)}>
          <Tooltip direction="top" offset={[0, -14]}>
            {s.label}
          </Tooltip>
        </Marker>
      ))}

      <FitToStops positions={positions} />
    </MapContainer>
  );
}
