# Data Model

> Persistence: **SQLite** via **Prisma 5** (`file:./dev.db`). SQLite is the production database here. Photo **bytes** never live in the DB — the DB stores opaque storage **keys** resolved to URLs at read time (see `architecture.md#architecture-notes`). Schema lives at `prisma/schema.prisma`, owned by `slice-foundation`.

---

## Storage Technology

- **Relational data** (trips, stops, photos, and P2 tags): SQLite via Prisma. IDs are `cuid()` strings. Timestamps are `DateTime` with `@default(now())` / `@updatedAt`.
- **Photo files**: local disk in P1 (`PHOTO_STORAGE_DIR`), R2/S3 in P3 — always through the `PhotoStorage` interface. The DB references files only by opaque key.
- **Ordering**: explicit integer `order` per parent with a composite unique constraint; never inferred from timestamps (a trip can have several stops on one day, and order is owner-controlled).
- **No Prisma scalar-list columns** (`String[]`) — unsupported on SQLite. Tags (P2) use a relation table.

## Entities

### Entity: Trip

A single journey — an ordered collection of stops, authored by the owner.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | String (cuid) | yes | Primary key |
| title | String | yes | Trip title shown on home + story header |
| description | String? | no | Short intro/subtitle for the story |
| theme | String @default("cinematic") | yes | Per-trip story look. Enum of exactly four values: `cinematic` (default) · `editorial` · `minimal` · `vintage`. Drives the themed story render; see [`capabilities/story-themes.md`](capabilities/story-themes.md). Validated as the `StoryTheme` enum at the API boundary (unknown values → 400). **Added in Phase 1.5** by a single additive migration. |
| coverPhotoId | String? | no | Optional explicit hero photo; if null, derive from the first stop's cover |
| shareSlug | String? @unique | no | Unguessable public slug (≥ 24 random URL-safe chars). Null until published. **Column exists in P1** (nullable), populated in P2. |
| isPublished | Boolean @default(false) | yes | Whether the public share link is live (P2). Always false in P1. |
| createdAt | DateTime @default(now()) | yes | Creation time |
| updatedAt | DateTime @updatedAt | yes | Last modification |
| stops | Stop[] | — | Ordered stops (relation) |

> **Additive `theme` migration (Phase 1.5):** `theme` is added by a single **additive** Prisma migration — a pure `ALTER TABLE "Trip" ADD COLUMN "theme" TEXT NOT NULL DEFAULT 'cinematic'`. Existing rows **backfill to `cinematic`** via the column default; no table reset, no data loss, the existing `file:./dev.db` is preserved. Owned by `slice-theme-data-api` (see `../roadmap.md` → Phase 1.5).

### Entity: Stop

One point on the journey: a location, a moment, media, and an entry.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | String (cuid) | yes | Primary key |
| tripId | String | yes | FK → Trip.id (`onDelete: Cascade`) |
| order | Int | yes | Position in the ordered sequence (0-based). Unique per trip. |
| title | String? | no | Optional stop title/heading |
| placeName | String? | no | Display name (geocoded or manually entered) |
| lat | Float? | no | Latitude; null when precision = `none` |
| lng | Float? | no | Longitude; null when precision = `none` |
| locationPrecision | String @default("none") | yes | `exact` (search/manual coords) · `approximate` (map-click/reverse) · `none` (text-only fallback) |
| occurredAt | DateTime? | no | Combined day + time-of-day for the stop (owner-set). Ordering is `order`, not this. |
| body | String? | no | Written entry. Plain text in P1; rendered as markdown from P3. |
| createdAt | DateTime @default(now()) | yes | Creation time |
| updatedAt | DateTime @updatedAt | yes | Last modification |
| photos | Photo[] | — | Ordered gallery (relation) |
| tags | StopTag[] | — | (P2) mood/activity tags (relation) |

Constraint: `@@unique([tripId, order])`.

### Entity: Photo

One image in a stop's gallery. Stored in three derived forms; DB holds keys only.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | String (cuid) | yes | Primary key |
| stopId | String | yes | FK → Stop.id (`onDelete: Cascade`) |
| order | Int | yes | Position in the gallery (0-based). Unique per stop. |
| isCover | Boolean @default(false) | yes | Exactly one cover per stop (enforced in app logic within a transaction) |
| webKey | String | yes | Storage key of the web-optimized derivative (≤ 1600px long edge) |
| thumbKey | String | yes | Storage key of the thumbnail (≤ 400px long edge) |
| originalKey | String | yes | Storage key of the retained original upload |
| width | Int | yes | Web derivative width (for layout + parallax aspect) |
| height | Int | yes | Web derivative height |
| caption | String? | no | Optional caption shown in the gallery/story |
| createdAt | DateTime @default(now()) | yes | Upload time |

Constraint: `@@unique([stopId, order])`. URLs (`webUrl`, `thumbUrl`) are **not stored** — the API resolves them via `storage.url(key)` in responses.

### Entity: Tag & StopTag *(Phase 2)*

Mood/activity labels, many-to-many with stops (relation table because SQLite has no scalar lists).

**Tag**: `id` (cuid), `label` String @unique, `kind` String (`mood` | `activity`), `createdAt`. **StopTag**: `stopId` FK, `tagId` FK, `@@id([stopId, tagId])`. Added by the P2 additive migration (owned by `slice-tags`).

### Relationships

- `Trip 1—* Stop` (cascade delete). `Stop 1—* Photo` (cascade delete). `Stop *—* Tag` via `StopTag` (P2).
- `Trip.coverPhotoId` is a soft reference (no FK enforcement needed; resolved in app code, falls back to first stop's cover).

## Data Lifecycle

- **Create**: Trip on "New trip"; Stop on "Add stop" (order = current max + 1); Photo on upload (order = current max + 1; the **first** photo of a stop is auto-set `isCover=true`).
- **Update**: trip title/description and stop fields via autosave-on-blur + explicit save (non-destructive — no partial write clobbers unsent fields). Reorder = a transaction that reassigns `order` for the affected siblings from a client-supplied ordered ID list. Set-cover = a transaction that unsets the old cover and sets the new one.
- **Delete**: deleting a Stop cascades its Photos and (P2) StopTags; deleting a Photo also calls `storage.delete()` on its three keys; deleting a Trip cascades everything and removes all photo files. Deletes are explicit owner actions with a confirm.
- **Publish/unpublish (P2)**: sets/clears `shareSlug` + `isPublished`; unpublishing revokes the public link (generates a fresh slug on re-publish, invalidating the old one).
- No time-boxing/archival; data persists until the owner deletes it.

## Sensitive Data

- **`OWNER_PASSWORD`** and **`SESSION_SECRET`** live only in `.env` (gitignored), never in the DB. The password is compared in constant-ish time server-side; only a signed HMAC session token is set as an httpOnly cookie — the password is never stored or echoed.
- **`shareSlug`** is a capability URL (possession = read access), so it must be long and random (≥ 24 URL-safe chars from `crypto.randomBytes`); it grants read-only access to that one trip's content only.
- **Photo EXIF** (P3) may contain GPS/time metadata; it is read to *suggest* a location to the owner and is never exposed publicly beyond what the owner chooses to save as the stop location.
- No third-party PII; single-owner app.
