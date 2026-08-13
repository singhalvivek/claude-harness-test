# Capability: Trip PDF Export *(Phase 3)*

## What It Does
Exports a trip to a downloadable PDF containing its stops, locations, dates, entries, and cover photos.

## Inputs
| Input | Type | Source | Required |
|-------|------|--------|----------|
| tripId | string | Editor/home **Export PDF** → `GET /api/trips/:id/export` | yes |

## Outputs
| Output | Type | Destination |
|--------|------|-------------|
| PDF document | `application/pdf` byte stream | Browser download |

## External Calls
| System | Operation | On Failure |
|--------|-----------|------------|
| PDF renderer (server-side) | compose trip → PDF | 500 with message; download not started |
| `/api/media` / storage | fetch cover photos to embed | missing photo → placeholder in PDF |

## Business Rules
- The PDF lists stops in `order` with place name, date/time, entry, and cover photo per stop, plus a title page.
- Export is an owner action; `Assumed:` the renderer is a server-side library (e.g. `pdfkit` or headless Chromium via Playwright's chromium already installed) — chosen at build time; the spec only fixes the route + output contract.

## Success Criteria
- [ ] `GET /api/trips/:id/export` returns a non-empty `application/pdf` stream containing the trip title.
- [ ] The PDF includes each stop's place name and at least the cover photo.
- [ ] Exporting an unknown trip returns 404.
