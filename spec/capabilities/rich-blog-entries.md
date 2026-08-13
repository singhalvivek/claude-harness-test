# Capability: Rich (Markdown) Entries *(Phase 3)*

## What It Does
Upgrades stop entries from plain text to sanitized markdown with a live preview in the editor and rendered output in the story.

## Inputs
| Input | Type | Source | Required |
|-------|------|--------|----------|
| entry markdown | string | Stop editor body field | — |

## Outputs
| Output | Type | Destination |
|--------|------|-------------|
| stored markdown | `Stop.body` | SQLite (same column) |
| rendered HTML | sanitized | Editor preview + story |

## External Calls
| System | Operation | On Failure |
|--------|-----------|------------|
| `marked` + `dompurify` (or `react-markdown`) | render + sanitize markdown | render error → show raw text; never inject unsafe HTML |

## Business Rules
- Markdown is stored raw in the existing `Stop.body`; rendering happens at read time (no schema change).
- Output is **sanitized** — no raw HTML/script injection (important for the public P2 view).
- Supports headings, bold/italic, lists, links; plain-text entries from earlier phases render unchanged.

## Success Criteria
- [ ] Entering markdown (heading + bold + list) shows a live preview and renders as HTML in the story.
- [ ] A `<script>` in the body is stripped/escaped (sanitized), including on the public route.
- [ ] Pre-existing plain-text bodies still render correctly.
