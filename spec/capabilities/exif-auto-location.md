# Capability: EXIF Auto-Location *(Phase 3)*

## What It Does
Reads GPS and timestamp EXIF from an uploaded photo and offers to pre-fill the stop's location and date/time.

## Inputs
| Input | Type | Source | Required |
|-------|------|--------|----------|
| uploaded image | file with EXIF | `POST /api/stops/:id/photos` | yes |

## Outputs
| Output | Type | Destination |
|--------|------|-------------|
| suggestions | `{ suggestedLat, suggestedLng, suggestedOccurredAt }` | photo upload response → editor prompt |

## External Calls
| System | Operation | On Failure |
|--------|-----------|------------|
| `exifr` | parse EXIF GPS + DateTimeOriginal | no/invalid EXIF → suggestions null; upload still succeeds |

## Business Rules
- EXIF is read server-side during `processUpload`; suggestions are **offered**, never auto-applied — the owner clicks "Use photo's location/time?".
- Applying sets the stop's coords (`precision=exact`) and `occurredAt`; declining leaves the stop unchanged.
- Photos without GPS return null suggestions with no error.

## Success Criteria
- [ ] Uploading a fixture JPEG with GPS EXIF returns `suggestedLat`/`suggestedLng` within tolerance and a `suggestedOccurredAt`.
- [ ] The editor prompts to use them; applying updates the stop's location + time.
- [ ] A photo without EXIF GPS uploads normally with null suggestions.
