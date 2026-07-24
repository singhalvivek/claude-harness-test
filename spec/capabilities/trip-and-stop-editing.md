# Capability: Trip & Stop Editing

## What It Does
Lets the owner create and edit trips and their ordered stops (title, date/time, entry) and reorder stops non-destructively.

## Inputs
| Input | Type | Source | Required |
|-------|------|--------|----------|
| trip title / description | string | Editor header (autosave on blur) | title yes |
| stop fields | title?, occurredAt?, body? | Add/Edit Stop panel | all optional |
| stop order | ordered ID list | ↑/↓ reorder → `POST …/stops/reorder` | yes for reorder |

(Location + photos are separate capabilities: [stop-location](stop-location.md), [photo-gallery](photo-gallery.md).)

## Outputs
| Output | Type | Destination |
|--------|------|-------------|
| Trip / Stop rows | Prisma records | SQLite |
| editor state | trip list, ordered stop list | Owner UI |
| "Saving… / Saved ✓" | indicator | Editor |

## External Calls
| System | Operation | On Failure |
|--------|-----------|------------|
| Prisma → SQLite | create/update/delete/reorder in transactions | 500 with message; no partial clobber |

## Business Rules
- New stop gets `order = max(order)+1`; reorder reassigns `order` 0..n-1 in one transaction from the client's full ordered ID list. `@@unique([tripId, order])`.
- Editing is **non-destructive**: `PATCH` updates only supplied fields (autosave-on-blur + explicit Save); an interrupted edit never loses previously-saved data.
- Deleting a stop cascades its photos (and files); deleting a trip cascades everything.
- A trip can hold multiple stops on the same day — order is owner-controlled, never derived from `occurredAt`.
- Ordering is a single sequence; no branching.

## Success Criteria
- [ ] Creating a trip and adding three stops persists them and returns them sorted by `order`.
- [ ] Pressing ↓ on the first stop and reloading shows the new order persisted.
- [ ] Editing a stop's title via autosave, then editing its body, preserves both (no field clobber).
- [ ] Deleting a stop removes it and its photos; deleting the trip removes all its stops.
