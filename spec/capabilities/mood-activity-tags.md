# Capability: Mood / Activity Tags + Filter *(Phase 2)*

## What It Does
Lets the owner attach mood/activity tags to stops and filter the editor and story to show only matching stops.

## Inputs
| Input | Type | Source | Required |
|-------|------|--------|----------|
| tag assignment | `{ label, kind }` | Stop editor Tags section → `POST /api/stops/:id/tags` | — |
| filter selection | tag labels | Filter UI | — |

## Outputs
| Output | Type | Destination |
|--------|------|-------------|
| Tag / StopTag rows | Prisma records | SQLite (relation table — no scalar list on SQLite) |
| tag chips | UI | Editor + story |
| filtered view | subset of stops | Editor + story |

## External Calls
| System | Operation | On Failure |
|--------|-----------|------------|
| Prisma → SQLite | tag CRUD + filtered reads | 500 with message |

## Business Rules
- Tags are modeled as `Tag` + `StopTag` join (see [data.md](../data.md)); `kind` is `mood` or `activity`.
- Labels are unique and reusable across stops; the P2 additive migration (owned by `slice-tags`) adds the tables plus the publish columns.
- Filtering is client-driven over the loaded trip; an empty filter shows all stops.

## Success Criteria
- [ ] Adding tags to a stop persists them and shows chips in the editor and story.
- [ ] Filtering by a tag hides non-matching stops in both editor and story; clearing shows all.
- [ ] A reused label maps to one `Tag` row (no duplicates).
