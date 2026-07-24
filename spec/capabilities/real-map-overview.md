# Capability: Real-Map Overview *(Phase 2)*

## What It Does
Shows all of a trip's located stops as pins on a real OpenStreetMap map, connected by a route line, toggleable from the story view.

## Inputs
| Input | Type | Source | Required |
|-------|------|--------|----------|
| trip stops with coords | `[{ lat, lng, order, placeName }]` | full-trip JSON | yes |
| toggle | boolean | story "Map overview" control | yes |

## Outputs
| Output | Type | Destination |
|--------|------|-------------|
| map panel | Leaflet map + markers + polyline | Story overlay (`slice-map-ui`) |

## External Calls
| System | Operation | On Failure |
|--------|-----------|------------|
| OSM tile server | Leaflet tiles | map frame renders without tiles; markers/line still positioned |

## Business Rules
- One marker per stop that has coordinates (precision `exact`/`approximate`); text-only stops (`none`) are listed but not pinned.
- A polyline connects pins in stop `order`, mirroring the serpentine sequence.
- Toggling returns to the serpentine story without reload; state is view-local.

## Success Criteria
- [ ] Toggling **Map overview** renders a Leaflet container with one marker per located stop and a connecting polyline.
- [ ] A text-only stop produces no marker but is noted.
- [ ] Toggling back restores the serpentine story.
