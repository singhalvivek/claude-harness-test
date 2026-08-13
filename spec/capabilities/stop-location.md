# Capability: Stop Location

## What It Does
Sets a stop's geographic location three ways — place-name search, interactive map click/drag, or manual entry — with candidate disambiguation and a graceful text-only fallback.

## Inputs
| Input | Type | Source | Required |
|-------|------|--------|----------|
| search query | string (≥ 3 chars, debounced) | Search tab → `GET /api/geocode` | one path required |
| map click / pin drag | lat, lng | Leaflet map (Map tab) → `GET /api/geocode/reverse` | — |
| manual entry | lat, lng, placeName | Manual tab | — |

## Outputs
| Output | Type | Destination |
|--------|------|-------------|
| stop location | `{ placeName, lat, lng, locationPrecision }` | Stop row (via `PATCH /api/stops/:id`) |
| candidate list | `[{ displayName, lat, lng, type, importance }]` | Search UI for owner to pick |

## External Calls
| System | Operation | On Failure |
|--------|-----------|------------|
| Nominatim (proxied) | forward search (`/api/geocode`) + reverse (`/api/geocode/reverse`) | 502 → inline error; offer **text-only** save (precision `none`), never a silent guess |

## Business Rules
- The proxy sets a proper `User-Agent` (`NOMINATIM_USER_AGENT`), `limit=5`; the client **debounces ≥ 400 ms** and fires only for ≥ 3-char queries — respecting Nominatim's low-volume personal-use policy.
- Ambiguous searches show **candidate matches**; the owner picks one → `precision=exact`.
- Map click / pin drag sets coordinates and reverse-geocodes a display name → `precision=approximate`; the owner can drag to correct.
- Manual entry: coords given → `precision=exact`; name only → `precision=none` (text-only, no pin).
- Never fabricate coordinates; on failure the stop keeps a text-only location.

## Success Criteria
- [ ] Searching "Kyoto" returns candidates; picking one stores non-null lat/lng, a placeName, and `precision=exact`.
- [ ] Clicking the map drops a pin, reverse-geocodes a name, and stores `precision=approximate`; dragging the pin updates the coords.
- [ ] Manual lat/lng stores `exact`; a name-only manual entry stores `precision=none` with null coords.
- [ ] With Nominatim forced to fail, the UI shows the error and lets the owner save a text-only location (no crash, no guessed pin).
