# Data Model

> Persistence: **PostgreSQL** via **Prisma 5** — **Neon** in the live deployment (`datasource db { provider = "postgresql" }`), and the same Postgres driver locally. *(Phase 1/1.5 text below still says "SQLite" in places; the datasource was moved to Postgres when the app was deployed to Vercel + Neon. Postgres is authoritative — every migration from Phase 2 onward is written as Postgres DDL, and the destructive-gate rule in `../roadmap.md` applies: gates run against an **isolated `test_gate` schema**, never `public`.)* Photo **bytes** never live in the DB — the DB stores opaque storage **keys** resolved to URLs at read time (see `architecture.md#architecture-notes`). Schema lives at `prisma/schema.prisma`, owned by `slice-foundation`.

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
| feeling | String? | no | One short line of how this stop **felt** — rendered as a themed quote in the story. Max **200 characters** (zod-validated at the API boundary; longer → 400). Blank/whitespace is normalised to `null`. Null → nothing renders. **Added in Phase 2.5**; see [`capabilities/feeling-cards.md`](capabilities/feeling-cards.md). |
| feelingPlacement | String @default("card") | yes | How the feeling renders: `card` (default — its **own** quote card standing on the serpentine as its own beat) · `inline` (a pull-quote inside the stop's card) · `none` (kept but hidden). Validated as the `FeelingPlacement` enum at the API boundary (unknown → 400). **Added in Phase 2.5.** |
| motif | String @default("none") | yes | Per-stop decorative motif the owner picks; rendered as an animated ornament on the serpentine + a card accent (theme-colored). Enum of exactly 14 values: `none` (default) · `flower` · `mountain` · `tree` · `train` · `plane` · `boat` · `car` · `tent` · `camera` · `star` · `compass` · `sun` · `heart`. Validated as the `StopMotif` enum at the API boundary (unknown values → 400). **Added by a single additive migration** (`20260724120000_stop_motif`); see [`capabilities/story-decor.md`](capabilities/story-decor.md). |
| createdAt | DateTime @default(now()) | yes | Creation time |
| updatedAt | DateTime @updatedAt | yes | Last modification |
| photos | Photo[] | — | Ordered gallery (relation) |
| tags | StopTag[] | — | (P2) mood/activity tags (relation) |

Constraint: `@@unique([tripId, order])`.

> **Additive `motif` migration:** `motif` is added by a single **additive** Prisma migration (`20260724120000_stop_motif`) — a pure `ALTER TABLE "Stop" ADD COLUMN "motif" TEXT NOT NULL DEFAULT 'none'`. Existing stops **backfill to `none`** via the column default; no table rebuild, no data loss, the existing `file:./dev.db` is preserved.

### Entity: Photo *(domain concept: **Media** — a photo **or** a video)*

One item in a stop's ordered media gallery. The **table name stays `Photo`** (no rename migration, no data loss); from Phase 2.5 the row is discriminated by `kind` so a **video is a first-class medium** reusing the identical ordering / cover / caption / reorder / delete logic. There is deliberately **no parallel `Video` model** — see [`capabilities/video-media.md`](capabilities/video-media.md). DB holds keys only.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | String (cuid) | yes | Primary key |
| stopId | String | yes | FK → Stop.id (`onDelete: Cascade`) |
| order | Int | yes | Position in the gallery (0-based). Unique per stop. |
| isCover | Boolean @default(false) | yes | Exactly one cover per stop (enforced in app logic within a transaction). **`kind`-agnostic — a video can be the cover.** |
| kind | String @default("photo") | yes | Media discriminator: `photo` (default) · `video`. Validated as the `MediaKind` enum at the API boundary (unknown → 400). **Added in Phase 2.5**; every existing row backfills to `photo`. |
| webKey | String | yes | `photo`: storage key of the *displayed* image — the full-resolution original itself (browser-renderable formats), else a full-res JPEG fallback. No downscaling. `video`: storage key of the **playable video object** (the uploaded original, unaltered). |
| thumbKey | String | yes | `photo`: same object as `webKey`. `video`: the **poster** key when one exists, else the video key (consumers must branch on `kind` — see the rule below). |
| originalKey | String | yes | Storage key of the retained original upload |
| posterKey | String? | no | `video` only: storage key of the client-captured poster JPEG at `…/<uuid>/poster.jpg`. Null for photos and for a video whose poster capture failed. **Added in Phase 2.5.** |
| durationSec | Float? | no | `video` only: duration in seconds, read from `<video>.duration` in the **browser** (never server-side — no ffmpeg). Null for photos / unknown. **Added in Phase 2.5.** |
| width | Int | yes | Intrinsic width (for layout + parallax aspect). For video: `videoWidth`. `0` when it could not be read. |
| height | Int | yes | Intrinsic height. For video: `videoHeight`. |
| caption | String? | no | Optional caption shown in the gallery/story |
| createdAt | DateTime @default(now()) | yes | Upload time |

Constraint: `@@unique([stopId, order])`. URLs (`webUrl`, `thumbUrl`, `posterUrl`) are **not stored** — the API resolves them via `storage.url(key)` in responses.

> **`thumbUrl` safety rule.** For `kind:"video"` **with** a `posterKey`, `thumbUrl` resolves to the poster, so every existing `<img src={thumbUrl}>` call site keeps rendering a real still. For a video **without** a poster, `thumbUrl` equals `webUrl` and the consumer **must** branch on `kind` and render the labelled film-strip placeholder instead of an `<img>`. `webUrl` always resolves to the playable object.

### Phase 2.5 migration — `20260814120000_media_kind_and_stop_feeling` (ADDITIVE ONLY)

The live Neon database holds the owner's **real** trips, stops and photos. This migration is **purely additive** — five `ADD COLUMN`s with defaults / nullability, no table rebuild, no rename, no type change, no destructive statement, no reset. Existing rows backfill through the column defaults (`kind='photo'`, `posterKey=NULL`, `durationSec=NULL`, `feeling=NULL`, `feelingPlacement='card'` — and a null feeling renders nothing, so shipped stories are pixel-identical). Owned by **`slice-media-data`**; it is the **only** migration this phase.

`prisma/migrations/20260814120000_media_kind_and_stop_feeling/migration.sql`:

```sql
-- AlterTable: Photo becomes MEDIA (photo | video). Additive only — existing rows
-- backfill to kind='photo' with a null poster/duration.
ALTER TABLE "Photo" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'photo',
ADD COLUMN     "posterKey" TEXT,
ADD COLUMN     "durationSec" DOUBLE PRECISION;

-- AlterTable: per-stop "feeling" quote + how it renders. Additive only —
-- existing stops backfill to feeling=NULL (nothing renders) with the default
-- placement, so every shipped story is unchanged.
ALTER TABLE "Stop" ADD COLUMN     "feeling" TEXT,
ADD COLUMN     "feelingPlacement" TEXT NOT NULL DEFAULT 'card';
```

Matching `prisma/schema.prisma` deltas (no other model or attribute changes):

```prisma
model Stop {
  // …unchanged fields…
  feeling          String?
  // "card" | "inline" | "none"
  feelingPlacement String  @default("card")
}

model Photo {
  // …unchanged fields…
  // "photo" | "video" — the media discriminator (table name intentionally kept)
  kind        String  @default("photo")
  posterKey   String?
  durationSec Float?
}
```

### Entity: Tag & StopTag *(Phase 2)*

Mood/activity labels, many-to-many with stops (relation table because SQLite has no scalar lists).

**Tag**: `id` (cuid), `label` String @unique, `kind` String (`mood` | `activity`), `createdAt`. **StopTag**: `stopId` FK, `tagId` FK, `@@id([stopId, tagId])`. Added by the P2 additive migration (owned by `slice-tags`).

### Relationships

- `Trip 1—* Stop` (cascade delete). `Stop 1—* Photo` (cascade delete). `Stop *—* Tag` via `StopTag` (P2).
- `Trip.coverPhotoId` is a soft reference (no FK enforcement needed; resolved in app code, falls back to first stop's cover).

## Data Lifecycle

- **Create**: Trip on "New trip"; Stop on "Add stop" (order = current max + 1); Photo on upload (order = current max + 1; the **first** photo of a stop is auto-set `isCover=true`).
- **Update**: trip title/description and stop fields via autosave-on-blur + explicit save (non-destructive — no partial write clobbers unsent fields). Reorder = a transaction that reassigns `order` for the affected siblings from a client-supplied ordered ID list. Set-cover = a transaction that unsets the old cover and sets the new one.
- **Delete**: deleting a Stop cascades its Photos and (P2) StopTags; deleting a Photo/Media calls `storage.delete()` on its three keys **plus `posterKey` when non-null** (P2.5); deleting a Trip cascades everything and removes all media files (posters included). Deletes are explicit owner actions with a confirm; `storage.delete` is idempotent, so a missing object is not an error.
- **Feeling (P2.5)**: written on the stop drawer's textarea, persisted **autosave-on-blur** (`PATCH /api/stops/:id { feeling }`); the placement toggle live-saves `{ feelingPlacement }`. The drawer's explicit **Save stop** never includes `feeling`/`feelingPlacement`, so it can never clobber an autosaved value.
- **Publish/unpublish (P2)**: sets/clears `shareSlug` + `isPublished`; unpublishing revokes the public link (generates a fresh slug on re-publish, invalidating the old one).
- No time-boxing/archival; data persists until the owner deletes it.

## Sensitive Data

- **`OWNER_PASSWORD`** and **`SESSION_SECRET`** live only in `.env` (gitignored), never in the DB. The password is compared in constant-ish time server-side; only a signed HMAC session token is set as an httpOnly cookie — the password is never stored or echoed.
- **`shareSlug`** is a capability URL (possession = read access), so it must be long and random (≥ 24 URL-safe chars from `crypto.randomBytes`); it grants read-only access to that one trip's content only.
- **Photo EXIF** (P3) may contain GPS/time metadata; it is read to *suggest* a location to the owner and is never exposed publicly beyond what the owner chooses to save as the stop location.
- No third-party PII; single-owner app.
