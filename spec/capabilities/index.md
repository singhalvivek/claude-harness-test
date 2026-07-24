# Capabilities Index

> One file per capability. Each describes one discrete thing Wanderline can do. Phase mapping is in `../roadmap.md`.

---

## What Is a Capability?

A single, discrete behavior the app performs (e.g. "authenticate the owner", "set a stop's location", "render the serpentine story").

## Capabilities in This Project

| Capability | Phase | File |
|-----------|-------|------|
| Owner authentication | 1 (core) | [owner-authentication.md](owner-authentication.md) |
| Trip & stop editing | 1 (core) | [trip-and-stop-editing.md](trip-and-stop-editing.md) |
| Stop location (search / map / manual) | 1 (core) | [stop-location.md](stop-location.md) |
| Photo gallery (upload / resize / cover) | 1 (core) | [photo-gallery.md](photo-gallery.md) |
| Serpentine story view | 1 (core) | [serpentine-story-view.md](serpentine-story-view.md) |
| Public share link | 2 | [public-share-link.md](public-share-link.md) |
| Real-map overview | 2 | [real-map-overview.md](real-map-overview.md) |
| Mood / activity tags + filter | 2 | [mood-activity-tags.md](mood-activity-tags.md) |
| Cloud photo storage (R2/S3) | 3 | [cloud-photo-storage.md](cloud-photo-storage.md) |
| EXIF auto-location | 3 | [exif-auto-location.md](exif-auto-location.md) |
| Rich (markdown) entries | 3 | [rich-blog-entries.md](rich-blog-entries.md) |
| Trip PDF export | 3 | [trip-export.md](trip-export.md) |

> `Assumed:` Phase 1 carries **5** core capabilities (one over the soft 4-cap). This is requirement-driven: the serpentine story view is the product's signature and cannot be deferred, and the other four (auth, trip/stop editing, location, photos) are each a distinct, independently-testable segment of the single primary journey. Phase 1 is still the *smallest* journey — no secondary features — just decomposed honestly.

## How to Add a New Capability

Run `/zero-shot-build [description]` on the existing spec. The spec-writer creates `<name>.md` (no number prefix), updates this index, flags dependencies, and self-reviews fit against `architecture.md` + `data.md`.
