# Capability: Video Media

## What It Does
Makes **video a first-class medium alongside photos** — a stop's ordered media list accepts videos, a video can be the stop's **cover**, and the story plays it (muted autoplay in view, tap-to-unmute) with a poster frame everywhere a still is expected.

## Domain rename: "photo" → "media"
The *domain* concept becomes **media** (a photo **or** a video). The **DB table stays `Photo`** and the API response type stays named `Photo` (aliased `Media`) — see [`../data.md`](../data.md) and [`../api.md`](../api.md). A single discriminator column `kind` (`"photo" | "video"`) plus `posterKey` and `durationSec` is added; **no parallel `Video` model**, so ordering, cover selection, captions, reorder, delete and gallery logic are reused unchanged and the migration stays a tiny additive `ADD COLUMN` (constraint: additive-only against the live Neon DB).

## Hard constraints this capability must respect
- **No AWS SDK.** All R2 access (including the poster object's presigned PUT) goes through the existing **aws4fetch** signer in `src/lib/storage/r2.ts`.
- **No ffmpeg / ffprobe / any server-side transcoding dependency.** Width, height, duration **and the poster frame** are derived **client-side in the browser** (`<video>` metadata + `canvas.toBlob()`) and posted to `complete`.
- **Video bytes never reach `sharp`.** The direct-upload `complete` route does not call `sharp` at all. The **legacy multipart** route `POST /api/stops/:stopId/photos` (kept for the Phase-1 tests, and the only route that runs `processUpload`) **branches on MIME before touching sharp** and rejects video with **415** — it never feeds video bytes to the image pipeline.
- **Additive migration only** — see [`../data.md`](../data.md).

## Inputs
| Input | Type | Source | Required |
|-------|------|--------|----------|
| media file | `File` (`image/*` **or** `video/mp4`, `video/quicktime`, `video/webm`) | Uploader drag-drop / picker | yes |
| intrinsic size + duration | `{ width, height, durationSec }` read from `<video>` metadata in the browser | client, before upload | yes for video (0/`null` on failure) |
| poster frame | JPEG `Blob` from `canvas.toBlob()` at ≈0.1 s | client, before upload | no (absent → labelled fallback) |
| cover choice | `photoId` | ★ Cover → `POST /api/photos/:id/cover` | — |
| caption / order / delete | as for photos | existing controls | — |

## Outputs
| Output | Type | Destination |
|--------|------|-------------|
| video object | the original bytes, unaltered | object storage (R2 via presigned PUT; local receiver in dev) |
| poster object | JPEG at `…/<uuid>/poster.jpg` | same storage prefix as its video |
| media row | `Photo` row with `kind:"video"`, `posterKey`, `durationSec`, `width`, `height` | Neon Postgres |
| resolved URLs | `webUrl` (the video), `posterUrl`, `thumbUrl` (= poster for videos) | API responses / UI |
| story render | `<video data-cover-photo data-cover-video>` cover; poster-backed playable gallery tiles | Reader browser |

## External Calls
| System | Operation | On Failure |
|--------|-----------|------------|
| `POST …/photos/presign` | mint the video key + (for video) a second poster key, both presigned | 400 unsupported type; 500 presign failure → per-file error chip with **Retry**; stop untouched |
| Presigned `PUT` (R2 via aws4fetch, or `/api/uploads/[...key]` locally) | upload the video bytes, then the poster bytes | video PUT fails → error chip + Retry, **no** DB row created; **poster** PUT fails → continue and `complete` **without** `posterKey` (the video still registers; UI shows the labelled no-poster tile) |
| `POST …/photos/complete` | create the media row from `{ key, kind, posterKey, durationSec, width, height }` | 400 invalid key/kind; 500 → error chip; the uploaded object is orphaned but harmless |
| Browser `<video>` decode / `canvas.toBlob` | read metadata + capture the poster | timeout (8 s) or decode error → `{ width:0, height:0, durationSec:null, poster:null }`; the upload still proceeds and the UI degrades to the labelled fallback — **never a silent failure** |
| `GET /api/media/[...key]` (local backend) | stream video bytes with the right `Content-Type` and **HTTP Range** support | 404 unknown key; a failed load → the labelled unplayable fallback |

## Business Rules
- **Accepted video types:** `video/mp4`, `video/quicktime` (`.mov`, the common iPhone case), `video/webm`. MIME parameters are stripped before matching (`video/mp4;codecs=avc1` → `video/mp4`). When `File.type` is empty the extension (`.mp4`/`.mov`/`.webm`) decides. Anything else → **400 unsupported media type** with a readable message.
- `kind` is the discriminator: `"photo"` (default, backfilled for every existing row) or `"video"`. Unknown values are rejected at the API boundary (zod enum → 400) and never persisted.
- **A video may be a cover.** Cover selection is unchanged (`isCover`, one per stop, transactional swap) and is `kind`-agnostic.
- **`thumbUrl` is always safe in an `<img>` when a poster exists:** for `kind:"video"` with a `posterKey`, `thumbUrl` resolves to the **poster**; `webUrl` always resolves to the **playable video object**. For a video with **no** poster, `thumbUrl` equals `webUrl` and consumers **must** branch on `kind` and render the labelled film-strip placeholder instead of an `<img>`.
- **Poster capture (client, exact):** create an off-DOM `<video muted playsInline preload="metadata">` over an object URL → await `loadedmetadata` (read `videoWidth`/`videoHeight`/`duration`) → set `currentTime = min(0.1, duration/2)` → await `seeked` → draw to a `<canvas>` sized to the intrinsic video size → `canvas.toBlob(…, "image/jpeg", 0.82)`. Whole operation is guarded by an 8 s timeout and always revokes the object URL.
- **Upload order:** presign (both keys in one round-trip) → `PUT` video → `PUT` poster → `complete`. The poster is uploaded **before** `complete`, so a registered `posterKey` always points at bytes that exist.
- **Cover video playback:** `muted loop playsInline preload="metadata" poster=<posterUrl>`; an **IntersectionObserver** (threshold `0.35`) plays it on entering the viewport and pauses it on leaving. A **tap-to-unmute** control is always present with a **visible** muted/unmuted state. A rejected `play()` promise (autoplay policy) degrades to a visible ▶ play control — never a frozen black frame.
- **Unplayable codec** (e.g. HEVC in a `.mov` on Chrome): detected via `canPlayType` returning `""` or the element's `error` event → render the **poster** plus a clear labelled chip *"This video can't play in this browser"* and a **Download** link to `webUrl`. Never a broken black box.
- **`prefers-reduced-motion`:** no autoplay anywhere; the cover shows its poster with an explicit ▶ play control, and the gallery uses native `controls`.
- **Deleting** a media row deletes `webKey`, `thumbKey`, `originalKey` **and `posterKey`** from storage (idempotent; a missing object is not an error).
- **Size:** the server never sees the bytes, so there is no server cap. The uploader shows an advisory notice above **200 MB** and keeps the upload allowed.
- Every frozen DOM hook survives: a video cover keeps **`[data-cover-photo]`** (so the shipped parallax/cover assertions hold) and **adds** `[data-cover-video]`.

## Test Fixture & Coverage Honesty

**The test fixture is a committed binary, not a generated one.** `tests/fixtures/clip.mp4` is a real H.264 MP4 (640×360, 3.33 s, ~93.6 KB, header `ftypisom`) **committed to the repo and present before any build work starts**. It is written by no slice and regenerated by no test. Verified on this machine: Playwright's bundled Chromium **decodes** it correctly (`canPlayType('video/mp4; codecs="avc1.42E01E"')` → `"probably"`; metadata reports `videoWidth=640 / videoHeight=360 / duration=3.33`; `play()` advances `currentTime`), so every assertion in this capability runs in the **default `chromium` Playwright project** — `playwright.config.ts` needs **no `channel`** and keeps its single project.

**The gate never records video.** Before any browser launches, the gate asserts the fixture is present and real: the file **exists**, its size is **> 10 KB**, and bytes `4..8` are `ftyp`. A failure aborts with an actionable message; a stub is **never** substituted. Full rationale, the measured facts, and the ⚠️ trap warning (bundled Chromium reports `MediaRecorder.isTypeSupported('video/mp4') === true` but then **hangs the renderer forever** on `start()`, so a "prefer MP4, fall back to WebM" script hangs the gate rather than failing over) live in [`../roadmap.md`](../roadmap.md#phase-25--video--feeling) under *Video fixture*. `scripts/make-video-fixture.mjs` exists **only** as a manual, offline regeneration utility requiring real Microsoft Edge; it must never be invoked by the gate and must hard-refuse to run under bundled Chromium.

**`video/quicktime` (.mov) is covered at the CONTRACT level only — stated plainly, not implied otherwise.** A genuine QuickTime file cannot be produced on this machine without ffmpeg (banned above), so the `.mov` path is proven by: (a) `presign` accepting `contentType: "video/quicktime"` and minting a `.mov` key, and (b) a copy of the ISO-BMFF fixture **served as `video/quicktime`** to exercise the render path — legitimate because QuickTime and MP4 share the ISO base media container, so `ftypisom` bytes are genuinely playable when labelled `video/quicktime`. **A real iPhone HEVC `.mov` is NOT covered end to end**; that device path is exercised only by the owner's manual test, and its unplayable-codec fallback (below) is the designed behaviour when it fails.

## Success Criteria
- [ ] `POST …/photos/presign` with `{ contentType: "video/mp4", kind: "video", posterContentType: "image/jpeg" }` returns a video `uploadUrl` **and** a `poster.uploadUrl`; with an unsupported type it returns **400**.
- [ ] `POST …/photos/presign` with `{ contentType: "video/quicktime", kind: "video", filename: "clip.mov" }` returns **200** with a key ending `.mov` (contract-level `.mov` coverage — see above).
- [ ] The committed fixture `tests/fixtures/clip.mp4` (real, decodable, non-zero intrinsic size) uploads end-to-end presign → PUT → PUT poster → complete and reads back from `GET /api/trips/:id` as `kind:"video"` with a non-null `posterUrl` and `durationSec > 0`.
- [ ] The fixture-integrity check passes before any browser starts: `tests/fixtures/clip.mp4` exists, is > 10 KB, and carries `ftyp` at bytes 4..8 — otherwise the gate fails loudly with an actionable message and substitutes nothing.
- [ ] The legacy multipart route `POST /api/stops/:id/photos` with a `video/*` part returns **415** and creates no row — `sharp` is never invoked on video bytes.
- [ ] In the story, a non-cover video renders as a poster-backed, playable gallery tile; clicking it plays.
- [ ] A video set as a stop's **cover** renders one element carrying **both** `[data-cover-photo]` and `[data-cover-video]`, reports `videoWidth > 0` after metadata, is `muted` and playing while in view, and exposes a working unmute control whose state is visible.
- [ ] With `prefers-reduced-motion`, the cover video does not autoplay and shows its poster plus an explicit play control.
- [ ] Deleting a video removes its poster object as well as the video object.
- [ ] Every existing photo assertion still passes unchanged (photos are untouched by the `kind` split; existing rows read back `kind:"photo"`, `posterUrl:null`, `durationSec:null`).
