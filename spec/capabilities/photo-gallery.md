# Capability: Photo Gallery

## What It Does
Uploads multiple photos per stop, produces web-optimized + thumbnail derivatives on local disk (retaining the original) via a swappable storage interface, and lets the owner reorder, caption, and pick one cover.

## Inputs
| Input | Type | Source | Required |
|-------|------|--------|----------|
| image files | multipart `files[]` (JPEG/PNG/WebP/HEIC, large phone images) | Uploader → `POST /api/stops/:id/photos` | yes |
| photo order | ordered ID list | ↑/↓ reorder → `POST …/photos/reorder` | — |
| cover choice | photoId | ★ → `POST /api/photos/:id/cover` | — |
| caption | string | caption field → `PATCH /api/photos/:id` | — |

## Outputs
| Output | Type | Destination |
|--------|------|-------------|
| derivatives | web (≤ 1600px) + thumb (≤ 400px) + original | `PhotoStorage` (local disk P1) |
| Photo rows | `{ webKey, thumbKey, originalKey, width, height, order, isCover, caption }` | SQLite |
| resolved URLs | `webUrl`, `thumbUrl` via `storage.url(key)` | API responses / UI |

## External Calls
| System | Operation | On Failure |
|--------|-----------|------------|
| `sharp` | decode → resize → encode web + thumb | 400 unsupported type; 500 processing error (stop preserved) |
| `PhotoStorage` (local disk) | `save(key,data)` / `delete(key)` | 500 with message; retry available; stop + other photos unaffected |

## Business Rules
- The DB stores **opaque keys only**, never URLs — URLs resolved at read via `storage.url(key)` so a later R2/S3 swap changes no call site (see [cloud-photo-storage](cloud-photo-storage.md)).
- New photo → `order = max+1`; the **first** photo of a stop becomes `isCover=true` automatically. Exactly one cover per stop (set-cover unsets the previous in a transaction).
- Files never live under `public/`; they stream via `GET /api/media/[...key]`.
- Deleting a photo also deletes its three stored objects; if it was the cover and others remain, the next by order becomes cover.
- Per-file size cap (default 25 MB) → 413.

## Success Criteria
- [ ] Uploading a large ( > 3000px) JPEG produces a web derivative ≤ 1600px and a thumb ≤ 400px on disk, plus a retained original; the Photo row stores three keys + width/height.
- [ ] The first uploaded photo is the cover; choosing ★ on another moves the cover (only one cover remains).
- [ ] `<img src=webUrl>` in the browser loads with `naturalWidth > 0` (streamed via `/api/media`).
- [ ] Reordering photos and reloading shows the new order; deleting a photo removes its files.
