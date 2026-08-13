"use client";

import { useEffect, useState } from "react";
import { geocode, reverseGeocode, type GeocodeCandidate } from "@/lib/api-client";
import { MapTab } from "./MapTab";
import { Spinner } from "@/components/ui/Spinner";
import { getErrorStatus } from "@/components/ui/errors";

export type LocationPrecision = "exact" | "approximate" | "none";

export interface LocationValue {
  placeName: string;
  lat: number | null;
  lng: number | null;
  locationPrecision: LocationPrecision;
}

type Tab = "search" | "map" | "manual";

const tabs: { id: Tab; label: string }[] = [
  { id: "search", label: "Search" },
  { id: "map", label: "Map" },
  { id: "manual", label: "Manual" },
];

function tabTestId(t: Tab): string {
  return `loc-tab-${t}`;
}

export function LocationPicker({
  value,
  onChange,
}: {
  value: LocationValue;
  onChange: (v: LocationValue) => void;
}) {
  const [tab, setTab] = useState<Tab>("search");

  // --- Search tab (debounced Nominatim proxy) ---
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<GeocodeCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [geoError, setGeoError] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setCandidates([]);
      setGeoError(false);
      setSearching(false);
      return;
    }
    setSearching(true);
    setGeoError(false);
    // Debounce >= 400ms and only fire for >= 3 chars (Nominatim usage policy).
    const handle = window.setTimeout(async () => {
      try {
        const results = await geocode(q);
        setCandidates(results);
      } catch (err) {
        // 502 (or any upstream failure) => offer manual / text-only, never guess.
        void getErrorStatus(err);
        setGeoError(true);
        setCandidates([]);
      } finally {
        setSearching(false);
      }
    }, 450);
    return () => window.clearTimeout(handle);
  }, [query]);

  function pickCandidate(c: GeocodeCandidate) {
    onChange({
      placeName: c.displayName,
      lat: c.lat,
      lng: c.lng,
      locationPrecision: "exact",
    });
  }

  function saveTextOnly() {
    onChange({
      placeName: query.trim() || value.placeName,
      lat: null,
      lng: null,
      locationPrecision: "none",
    });
    setGeoError(false);
  }

  // --- Map tab ---
  async function handleMapPick(lat: number, lng: number) {
    onChange({ ...value, lat, lng, locationPrecision: "approximate" });
    try {
      const { displayName } = await reverseGeocode(lat, lng);
      if (displayName) onChange({ placeName: displayName, lat, lng, locationPrecision: "approximate" });
    } catch {
      // Keep the coordinates; a null name still allows an approximate save.
    }
  }

  // --- Manual tab (local string buffers so partial input like "-" is kept) ---
  const [latStr, setLatStr] = useState(value.lat != null ? String(value.lat) : "");
  const [lngStr, setLngStr] = useState(value.lng != null ? String(value.lng) : "");
  const [manualName, setManualName] = useState(value.placeName);

  function commitManual(nextName: string, nextLat: string, nextLng: string) {
    const latNum = nextLat.trim() === "" ? NaN : Number(nextLat);
    const lngNum = nextLng.trim() === "" ? NaN : Number(nextLng);
    const hasCoords = Number.isFinite(latNum) && Number.isFinite(lngNum);
    onChange({
      placeName: nextName.trim(),
      lat: hasCoords ? latNum : null,
      lng: hasCoords ? lngNum : null,
      locationPrecision: hasCoords ? "exact" : "none",
    });
  }

  const precisionLabel: Record<LocationPrecision, string> = {
    exact: "exact",
    approximate: "approximate",
    none: "text-only",
  };

  return (
    <div className="rounded-md border border-ink/10 bg-white/60 p-3">
      <div className="mb-3 inline-flex rounded-md border border-ink/15 p-0.5" role="tablist" aria-label="Location input method">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            data-testid={tabTestId(t.id)}
            onClick={() => setTab(t.id)}
            className={`rounded px-3 py-1 text-sm font-sans transition-colors ${
              tab === t.id ? "bg-trail text-paper" : "text-ink/70 hover:bg-ink/5"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "search" && (
        <div>
          <div className="flex items-center gap-2">
            <input
              data-testid="geocode-search-input"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search a place (e.g. Kyoto, Japan)"
              className="w-full rounded-md border border-ink/20 px-3 py-2 text-sm outline-none focus:border-trail"
            />
            {searching && <Spinner />}
          </div>
          {geoError && (
            <div data-testid="geocode-error" className="mt-2 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">
              <p>Geocoding unavailable — enter the location manually.</p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  data-testid="save-text-only"
                  onClick={saveTextOnly}
                  className="rounded border border-red-300 bg-white px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                >
                  Save as text-only location
                </button>
                <button
                  type="button"
                  onClick={() => setTab("manual")}
                  className="rounded border border-ink/20 px-2 py-1 text-xs font-medium text-ink/70 hover:bg-ink/5"
                >
                  Enter manually
                </button>
              </div>
            </div>
          )}
          {candidates.length > 0 && (
            <ul data-testid="geocode-candidates" className="mt-2 divide-y divide-ink/10 overflow-hidden rounded-md border border-ink/10">
              {candidates.map((c, i) => (
                <li key={`${c.lat},${c.lng},${i}`}>
                  <button
                    type="button"
                    data-testid="geocode-candidate"
                    onClick={() => pickCandidate(c)}
                    className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-trail/10"
                  >
                    <span className="font-medium text-ink">{c.displayName}</span>
                    <span className="text-xs text-ink/50">
                      {c.type} · {c.lat.toFixed(4)}, {c.lng.toFixed(4)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === "map" && <MapTab lat={value.lat} lng={value.lng} onPick={handleMapPick} />}

      {tab === "manual" && (
        <div className="grid grid-cols-2 gap-2">
          <label className="col-span-2 text-xs font-medium text-ink/60">
            Place name
            <input
              data-testid="manual-placename"
              type="text"
              value={manualName}
              onChange={(e) => {
                setManualName(e.target.value);
                commitManual(e.target.value, latStr, lngStr);
              }}
              placeholder="e.g. Fushimi Inari Shrine"
              className="mt-1 w-full rounded-md border border-ink/20 px-3 py-2 text-sm outline-none focus:border-trail"
            />
          </label>
          <label className="text-xs font-medium text-ink/60">
            Latitude
            <input
              data-testid="manual-lat"
              type="text"
              inputMode="decimal"
              value={latStr}
              onChange={(e) => {
                setLatStr(e.target.value);
                commitManual(manualName, e.target.value, lngStr);
              }}
              placeholder="35.0116"
              className="mt-1 w-full rounded-md border border-ink/20 px-3 py-2 text-sm outline-none focus:border-trail"
            />
          </label>
          <label className="text-xs font-medium text-ink/60">
            Longitude
            <input
              data-testid="manual-lng"
              type="text"
              inputMode="decimal"
              value={lngStr}
              onChange={(e) => {
                setLngStr(e.target.value);
                commitManual(manualName, latStr, e.target.value);
              }}
              placeholder="135.7681"
              className="mt-1 w-full rounded-md border border-ink/20 px-3 py-2 text-sm outline-none focus:border-trail"
            />
          </label>
          <p className="col-span-2 text-xs text-ink/50">
            Coordinates set an <span className="font-medium">exact</span> pin; a name alone saves a text-only location.
          </p>
        </div>
      )}

      <div
        data-testid="location-summary"
        className="mt-3 flex flex-wrap items-center gap-2 border-t border-ink/10 pt-2 text-xs text-ink/60"
      >
        <span className="font-medium text-ink/70">Selected:</span>
        <span>{value.placeName ? value.placeName : "— none —"}</span>
        {value.lat != null && value.lng != null && (
          <span>
            ({value.lat.toFixed(4)}, {value.lng.toFixed(4)})
          </span>
        )}
        <span className="rounded-full bg-ink/5 px-2 py-0.5">{precisionLabel[value.locationPrecision]}</span>
      </div>
    </div>
  );
}
