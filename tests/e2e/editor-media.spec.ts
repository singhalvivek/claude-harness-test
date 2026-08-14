import { test, expect, type Page } from "@playwright/test";
import sharp from "sharp";
import { existsSync, mkdtempSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * slice-media-editor — real video, end to end, through the BROWSER.
 *
 * Runs in the default `chromium` project (no `channel`): Playwright's bundled
 * Chromium decodes the committed H.264 fixture, so `setInputFiles` on the real
 * file input makes the browser genuinely run `readVideoMetadata` (intrinsic size
 * + duration) → canvas poster capture → presign → PUT video → PUT poster →
 * complete. No ffmpeg, no server-side decode, no stubbing.
 *
 * House style follows tests/e2e/editor.spec.ts: unique stamped titles so the
 * shared DB stays safe, and the Manual location tab so Nominatim is never hit.
 */

const STAMP = Date.now();
const PASSWORD = "letmein";

/** Pre-committed, read-only binary fixture — never created or regenerated here. */
const CLIP = resolve(__dirname, "../fixtures/clip.mp4");

/** Fail loudly on a missing/truncated fixture rather than testing nothing. */
function assertFixture() {
  expect(
    existsSync(CLIP),
    `missing ${CLIP}. It is a committed binary fixture; restore it with \`git checkout -- tests/fixtures/clip.mp4\`.`,
  ).toBe(true);
  expect(statSync(CLIP).size).toBeGreaterThan(10_000);
}

/** Log in through the UI and land on the owner home. */
async function login(page: Page) {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await page.getByTestId("login-password").fill(PASSWORD);
  await page.getByTestId("login-submit").click();
  await page.waitForURL((url) => url.pathname === "/");
}

/** Create a trip through the UI and return its id (read off the editor URL). */
async function createTrip(page: Page, title: string): Promise<string> {
  await page.getByTestId("new-trip-button").click();
  await page.waitForURL((url) => url.pathname === "/trips/new");
  await page.getByTestId("new-trip-title").fill(title);
  await page.getByTestId("new-trip-create").click();
  await page.waitForURL(/\/trips\/[^/]+\/edit$/);
  const match = /\/trips\/([^/]+)\/edit/.exec(page.url());
  expect(match, `could not read a trip id out of ${page.url()}`).not.toBeNull();
  return match![1];
}

/** Open the Add-Stop drawer, pick Manual, set a place name. */
async function addStopViaManual(page: Page, placeName: string) {
  await page.getByTestId("add-stop-button").click();
  await expect(page.getByTestId("stop-panel")).toBeVisible();
  await page.getByTestId("loc-tab-manual").click();
  await page.getByTestId("manual-placename").fill(placeName);
}

/** A real JPEG on disk (same technique as editor.spec.ts). */
async function makeJpeg(name: string): Promise<string> {
  const buffer = await sharp({
    create: { width: 900, height: 600, channels: 3, background: { r: 62, g: 116, b: 198 } },
  })
    .jpeg({ quality: 80 })
    .toBuffer();
  const file = join(mkdtempSync(join(tmpdir(), "wl-media-e2e-")), name);
  writeFileSync(file, buffer);
  return file;
}

interface ApiMedia {
  id: string;
  kind: "photo" | "video";
  isCover: boolean;
  posterUrl: string | null;
  durationSec: number | null;
  width: number;
  height: number;
  webUrl: string;
  thumbUrl: string;
}

test("owner uploads a real video: browser-made poster + duration, and it can be the cover", async ({
  page,
}) => {
  // Poster capture + two PUTs + a reload can outrun the default budget.
  test.setTimeout(180_000);
  page.on("dialog", (d) => d.accept());
  assertFixture();

  await login(page);
  const tripId = await createTrip(page, `Media E2E ${STAMP}`);
  await addStopViaManual(page, `Vista ${STAMP}`);

  // The uploader is widened to media, not just photos.
  await expect(page.getByTestId("media-uploader-heading")).toHaveText(/Photos\s*&\s*video/);
  const input = page.getByTestId("photo-file-input");
  const accept = await input.getAttribute("accept");
  expect(accept).toContain("image/*");
  expect(accept).toContain("video/mp4");
  expect(accept).toContain("video/quicktime");
  expect(accept).toContain("video/webm");

  // ── A photo first, so it takes the automatic cover (first media wins) ───────
  await input.setInputFiles(await makeJpeg(`still-${STAMP}.jpg`));
  const photoTile = page.locator('[data-testid="photo-item"][data-media-kind="photo"]');
  await expect(photoTile).toHaveCount(1, { timeout: 60_000 });
  await expect(photoTile.getByTestId("photo-cover-badge")).toBeVisible();
  // Edge case: a photo carries no video affordances.
  await expect(photoTile.getByTestId("media-duration")).toHaveCount(0);

  // ── Upload the real video through the same widened input ───────────────────
  await input.setInputFiles(CLIP);

  const videoTile = page.locator('[data-testid="photo-item"][data-media-kind="video"]');
  await expect(videoTile).toHaveCount(1, { timeout: 120_000 });
  await expect(page.getByTestId("photo-item")).toHaveCount(2);

  // The tile shows the POSTER the browser produced — a real, decoded image, not
  // the film-strip fallback.
  await expect(videoTile.getByTestId("media-filmstrip")).toHaveCount(0);
  const poster = videoTile.locator('img[data-testid="photo-thumb"]');
  await expect(poster).toBeVisible();
  await expect
    .poll(async () => poster.evaluate((el) => (el as HTMLImageElement).naturalWidth), {
      timeout: 30_000,
    })
    .toBeGreaterThan(0);
  // It is the poster object in the <img>, never the video bytes.
  await expect(poster).not.toHaveAttribute("src", /\.mp4($|\?)/);

  // …plus the duration badge, e.g. "▶ 0:03".
  const badge = videoTile.getByTestId("media-duration");
  await expect(badge).toBeVisible();
  await expect(badge).toHaveText(/▶\s*\d+:\d{2}/);

  // ── A video can be made the cover, exactly like a photo ────────────────────
  await videoTile.getByTestId("photo-set-cover").click();
  await expect(videoTile.getByTestId("photo-cover-badge")).toBeVisible();
  await expect(photoTile.getByTestId("photo-cover-badge")).toHaveCount(0);

  await page.getByTestId("stop-panel-save").click();
  await expect(page.getByTestId("stop-panel")).toBeHidden();

  // ── The API agrees: kind/poster/duration/size all came from the browser ────
  const res = await page.request.get(`/api/trips/${tripId}`);
  expect(res.status(), await res.text()).toBe(200);
  const trip = (await res.json()) as { stops: { photos: ApiMedia[] }[] };
  const media = trip.stops.flatMap((s) => s.photos);

  const video = media.find((m) => m.kind === "video");
  expect(video, `no kind:"video" media in GET /api/trips/${tripId}`).toBeTruthy();
  expect(video!.posterUrl).not.toBeNull();
  expect(video!.durationSec).not.toBeNull();
  expect(video!.durationSec!).toBeGreaterThan(0);
  expect(video!.width).toBeGreaterThan(0);
  expect(video!.height).toBeGreaterThan(0);
  expect(video!.isCover).toBe(true);

  // The photo is untouched by the kind split.
  const photo = media.find((m) => m.kind === "photo");
  expect(photo, 'the JPEG did not register as kind:"photo"').toBeTruthy();
  expect(photo!.posterUrl).toBeNull();
  expect(photo!.durationSec).toBeNull();
  expect(photo!.isCover).toBe(false);

  // ── The stop list shows the poster + a ▶ badge for the video cover ─────────
  const stopCard = page.getByTestId("stop-card").first();
  await expect(stopCard.getByTestId("stop-cover-video-badge")).toBeVisible();
  const listThumb = stopCard.getByTestId("stop-cover-image");
  await expect(listThumb).toBeVisible();
  await expect
    .poll(async () => listThumb.evaluate((el) => (el as HTMLImageElement).naturalWidth), {
      timeout: 30_000,
    })
    .toBeGreaterThan(0);

  // …and it survives a reload (persisted, not local state).
  await page.reload();
  await expect(
    page.getByTestId("stop-card").first().getByTestId("stop-cover-video-badge"),
  ).toBeVisible();
});

test("a video upload shows its staged progress and a film-strip placeholder while in flight", async ({
  page,
}) => {
  test.setTimeout(180_000);
  page.on("dialog", (d) => d.accept());
  assertFixture();

  await login(page);
  await createTrip(page, `Media stages E2E ${STAMP}`);
  await addStopViaManual(page, `Stages ${STAMP}`);

  // Hold the REAL presign response back (it is still served by the real route,
  // just later) so the in-flight UI is observable rather than a race.
  await page.route("**/photos/presign", async (route) => {
    await new Promise((r) => setTimeout(r, 5_000));
    await route.continue();
  });

  await page.getByTestId("photo-file-input").setInputFiles(CLIP);

  // While the browser is reading the clip: the video stage label and the
  // film-strip placeholder standing in for the not-yet-captured poster.
  const row = page.getByTestId("photo-uploading");
  await expect(row).toHaveCount(1);
  await expect(row).toHaveAttribute("data-media-kind", "video");
  await expect(row.getByTestId("media-filmstrip-pending")).toBeVisible();
  await expect(row.getByTestId("media-stage")).toHaveText(/Reading video…|Uploading…|Poster…/);

  // It still finishes (only the one presign was delayed), and the in-flight row
  // is replaced by the real tile.
  const videoTile = page.locator('[data-testid="photo-item"][data-media-kind="video"]');
  await expect(videoTile).toHaveCount(1, { timeout: 120_000 });
  await expect(videoTile.getByTestId("media-duration")).toBeVisible();
  await expect(page.getByTestId("photo-uploading")).toHaveCount(0);
});

test("an unsupported file is rejected with a labelled chip and creates no media", async ({
  page,
}) => {
  test.setTimeout(120_000);
  page.on("dialog", (d) => d.accept());

  await login(page);
  const tripId = await createTrip(page, `Media reject E2E ${STAMP}`);
  await addStopViaManual(page, `Rejected ${STAMP}`);

  const bogus = join(mkdtempSync(join(tmpdir(), "wl-media-e2e-")), `notes-${STAMP}.txt`);
  writeFileSync(bogus, "this is not media");

  await page.getByTestId("photo-file-input").setInputFiles(bogus);

  const chip = page.getByTestId("photo-error");
  await expect(chip).toHaveCount(1);
  await expect(chip).toContainText("Only images and MP4/MOV/WebM video can be uploaded.");
  await expect(chip.getByTestId("photo-retry")).toBeVisible();

  // Nothing was uploaded: no tile in the grid, and no media row on the server.
  await expect(page.getByTestId("photo-item")).toHaveCount(0);

  await page.getByTestId("stop-panel-save").click();
  await expect(page.getByTestId("stop-panel")).toBeHidden();

  const res = await page.request.get(`/api/trips/${tripId}`);
  expect(res.status(), await res.text()).toBe(200);
  const trip = (await res.json()) as { stops: { photos: ApiMedia[] }[] };
  expect(trip.stops.flatMap((s) => s.photos)).toHaveLength(0);
});
