import { test, expect, type Page } from "@playwright/test";
import sharp from "sharp";
import { promises as fs } from "fs";
import path from "path";

// Video in the story (Phase 2.5, `slice-story-video`).
//
// Proves the reading surface of `capabilities/video-media.md` against a REAL,
// decodable H.264 file — the pre-committed binary fixture `tests/fixtures/clip.mp4`
// (640x360, ~3.33 s). This spec NEVER records or regenerates that file: it is
// repo input, read-only. Playwright's bundled Chromium decodes it, so everything
// here runs in the DEFAULT `chromium` project — no `channel`.
//
// The seeded media goes through the real direct-upload pipeline the browser uses
// (presign -> PUT bytes -> PUT poster -> complete) via the page's own request
// context, so the session cookie is shared with the browser and the story page
// reads exactly what a real upload would have written.
//
// Asserted here:
//   1. ONE element carries BOTH [data-cover-photo] and [data-cover-video].
//   2. In view: videoWidth > 0, readyState >= 1, muted === true, paused === false.
//   3. Out of view: paused === true (IntersectionObserver pauses it).
//   4. [data-video-mute-toggle] is visible; clicking it flips the element's
//      `muted` to false and the control's data-muted to "false" (and does NOT
//      open the stop's gallery).
//   5. A NON-cover video renders a poster-backed, playable [data-gallery-video].
//   6. Under prefers-reduced-motion the cover video is paused and
//      [data-video-play] is visible — and that control starts playback.

const PASSWORD = "letmein";
const CLIP = path.resolve(__dirname, "../fixtures/clip.mp4");

interface SeededMedia {
  id: string;
  kind: string;
  isCover: boolean;
  posterUrl: string | null;
  durationSec: number | null;
  webUrl: string;
}

interface Seed {
  tripId: string;
  /** The stop whose COVER is the video. */
  coverStopId: string;
  /** The stop that owns a NON-cover video (gallery slide 0). */
  galleryStopId: string;
}

/** Read the committed fixture, failing loudly (never substituting a stub). */
async function readClip(): Promise<Buffer> {
  let bytes: Buffer;
  try {
    bytes = await fs.readFile(CLIP);
  } catch (err) {
    throw new Error(
      `cannot read the committed video fixture ${CLIP}: ${String(err)}. ` +
        "It is a committed binary; restore it with `git checkout -- tests/fixtures/clip.mp4`.",
    );
  }
  expect(
    bytes.length,
    `${CLIP} is too small to be a real video (${bytes.length} bytes)`,
  ).toBeGreaterThan(10_000);
  expect(bytes.subarray(4, 8).toString("latin1"), `${CLIP} is not a real ISO-BMFF video`).toBe(
    "ftyp",
  );
  return bytes;
}

/** A real JPEG standing in for the client-captured poster frame. */
async function makePoster(): Promise<Buffer> {
  return sharp({
    create: { width: 640, height: 360, channels: 3, background: { r: 24, g: 64, b: 120 } },
  })
    .jpeg({ quality: 82 })
    .toBuffer();
}

async function login(page: Page): Promise<void> {
  const res = await page.request.post("/api/auth/login", { data: { password: PASSWORD } });
  expect(res.ok(), `login failed: ${res.status()}`).toBeTruthy();
}

async function addStop(page: Page, tripId: string, title: string, order: number): Promise<string> {
  const res = await page.request.post(`/api/trips/${tripId}/stops`, {
    data: {
      title,
      placeName: `${title}, Kyoto`,
      lat: 35.0116 + order * 0.01,
      lng: 135.7681 + order * 0.01,
      locationPrecision: "exact",
      occurredAt: new Date(Date.UTC(2026, 4, 1 + order, 9, 30)).toISOString(),
      body: "A short note so the card has real text under its cover.",
    },
  });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()).id as string;
}

/** The real direct-upload path: presign -> PUT video -> PUT poster -> complete. */
async function uploadVideo(
  page: Page,
  stopId: string,
  video: Buffer,
  poster: Buffer,
): Promise<SeededMedia> {
  const presignRes = await page.request.post(`/api/stops/${stopId}/photos/presign`, {
    data: {
      filename: "clip.mp4",
      contentType: "video/mp4",
      kind: "video",
      posterContentType: "image/jpeg",
    },
  });
  expect(presignRes.status(), await presignRes.text()).toBe(200);
  const presign = await presignRes.json();
  expect(presign.key, "presign minted a video key").toBeTruthy();
  expect(presign.poster?.uploadUrl, "presign minted a poster target").toBeTruthy();

  const putVideo = await page.request.fetch(presign.uploadUrl, {
    method: "PUT",
    headers: { "content-type": "video/mp4" },
    data: video,
  });
  expect(putVideo.ok(), `video PUT failed: ${putVideo.status()}`).toBeTruthy();

  const putPoster = await page.request.fetch(presign.poster.uploadUrl, {
    method: "PUT",
    headers: { "content-type": "image/jpeg" },
    data: poster,
  });
  expect(putPoster.ok(), `poster PUT failed: ${putPoster.status()}`).toBeTruthy();

  const completeRes = await page.request.post(`/api/stops/${stopId}/photos/complete`, {
    data: {
      key: presign.key,
      kind: "video",
      posterKey: presign.poster.key,
      durationSec: 3.33,
      width: 640,
      height: 360,
    },
  });
  expect(completeRes.status(), await completeRes.text()).toBe(201);

  const media = (await completeRes.json()) as SeededMedia;
  expect(media.kind).toBe("video");
  expect(media.posterUrl, "the registered video has a poster").toBeTruthy();
  expect(media.durationSec ?? 0).toBeGreaterThan(0);
  return media;
}

/** A real JPEG through the shipped multipart route (photos are untouched by 2.5). */
async function uploadPhoto(page: Page, stopId: string, seed: number): Promise<SeededMedia> {
  const buffer = await sharp({
    create: {
      width: 1200,
      height: 800,
      channels: 3,
      background: { r: (seed * 70) % 255, g: (seed * 40 + 60) % 255, b: (seed * 25 + 120) % 255 },
    },
  })
    .jpeg({ quality: 82 })
    .toBuffer();

  const res = await page.request.post(`/api/stops/${stopId}/photos`, {
    multipart: { files: { name: `stop-${seed}.jpg`, mimeType: "image/jpeg", buffer } },
  });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()).photos[0] as SeededMedia;
}

/**
 * Seed a trip whose story exercises both video render paths:
 *   stop 1 — a video as the stop's COVER (it is the stop's only media),
 *   stop 2 — a video at order 0 that is NOT the cover (a photo is), so the
 *            gallery's first slide is the video,
 *   stops 3-4 — plain photo stops, so the page is tall enough to scroll the
 *            cover video fully out of view.
 */
async function seedVideoTrip(page: Page): Promise<Seed> {
  await login(page);

  const tripRes = await page.request.post("/api/trips", {
    data: {
      title: `Video journey ${Date.now()}`,
      description: "A trip where the covers move.",
    },
  });
  expect(tripRes.status(), await tripRes.text()).toBe(201);
  const tripId = (await tripRes.json()).id as string;

  const video = await readClip();
  const poster = await makePoster();

  const coverStopId = await addStop(page, tripId, "Arrival", 0);
  const coverVideo = await uploadVideo(page, coverStopId, video, poster);
  expect(coverVideo.isCover, "the stop's only media is its cover").toBe(true);

  const galleryStopId = await addStop(page, tripId, "Temple morning", 1);
  await uploadVideo(page, galleryStopId, video, poster);
  const stillCover = await uploadPhoto(page, galleryStopId, 2);
  const coverRes = await page.request.post(`/api/photos/${stillCover.id}/cover`);
  expect(coverRes.ok(), await coverRes.text()).toBeTruthy();

  for (let i = 2; i < 4; i++) {
    const stopId = await addStop(page, tripId, `Wandering ${i}`, i);
    await uploadPhoto(page, stopId, i + 1);
  }

  return { tripId, coverStopId, galleryStopId };
}

const videoState = (v: HTMLVideoElement) => ({
  videoWidth: v.videoWidth,
  readyState: v.readyState,
  muted: v.muted,
  paused: v.paused,
});

test("a video cover carries both frozen hooks, autoplays muted in view, pauses out of view and unmutes on tap", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const { tripId } = await seedVideoTrip(page);

  await page.goto(`/trips/${tripId}/story`);
  await expect(page).toHaveURL(new RegExp(`/trips/${tripId}/story`));

  // (1) ONE element carries BOTH the frozen cover hook and the video hook.
  const cover = page.locator("[data-cover-photo][data-cover-video]");
  await expect(cover).toHaveCount(1);
  await expect(page.locator("[data-cover-video]")).toHaveCount(1);
  await expect(cover).toHaveJSProperty("tagName", "VIDEO");
  // The poster is wired, so the frame is never a black box while it buffers.
  await expect(cover).toHaveAttribute("poster", /\/poster\.jpg/);
  // No labelled-unplayable fallback: bundled Chromium decodes this H.264 clip.
  await expect(page.locator("[data-video-unplayable]")).toHaveCount(0);

  // (2) In view: real decoded video, muted, and playing.
  await cover.scrollIntoViewIfNeeded();
  await expect
    .poll(async () => cover.evaluate(videoState), { timeout: 25_000 })
    .toMatchObject({ muted: true, paused: false });

  const inView = await cover.evaluate(videoState);
  expect(inView.videoWidth, "the fixture decoded (real intrinsic width)").toBeGreaterThan(0);
  expect(inView.readyState, "metadata loaded").toBeGreaterThanOrEqual(1);
  expect(inView.muted, "autoplay is always muted").toBe(true);
  expect(inView.paused, "autoplaying while in view").toBe(false);

  // The cover is still hero-scale (the shipped cover contract, for video too).
  const box = await cover.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(340);

  // (3) Out of view: the IntersectionObserver pauses it.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect
    .poll(async () => cover.evaluate((v: HTMLVideoElement) => v.paused), { timeout: 15_000 })
    .toBe(true);

  // (4) Tap to unmute — the state is visible on the control, not just implied.
  await cover.scrollIntoViewIfNeeded();
  const toggle = page.locator("[data-video-mute-toggle]");
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("data-muted", "true");
  await expect(toggle).toHaveText(/unmute/i);

  await toggle.click();

  await expect(toggle).toHaveAttribute("data-muted", "false");
  await expect
    .poll(async () => cover.evaluate((v: HTMLVideoElement) => v.muted), { timeout: 10_000 })
    .toBe(false);
  await expect(toggle).toHaveText(/^mute$/i);
  // Unmuting must not also expand the stop's gallery (the control swallows the
  // click that would otherwise reach the card's toggle button).
  await expect(page.locator("[data-photo-gallery]")).toHaveCount(0);
});

test("a non-cover video renders a poster-backed, playable gallery slide", async ({ page }) => {
  test.setTimeout(120_000);
  const { tripId, galleryStopId } = await seedVideoTrip(page);

  await page.goto(`/trips/${tripId}/story`);

  const card = page.locator(`[data-stop-id="${galleryStopId}"] [data-stop-card]`);
  await card.scrollIntoViewIfNeeded();
  await expect(card).toBeVisible();

  // That stop's cover is the STILL (the video sits at order 0 in the gallery).
  await expect(card.locator("[data-cover-video]")).toHaveCount(0);

  // Open the gallery.
  await card.locator("button[aria-expanded]").first().click();
  const gallery = page.locator("[data-photo-gallery]");
  await expect(gallery).toBeVisible();

  const galleryVideo = gallery.locator("[data-gallery-video]");
  await expect(galleryVideo).toHaveCount(1);
  await expect(galleryVideo).toBeVisible();
  // Poster-backed and natively controllable.
  await expect(galleryVideo).toHaveAttribute("poster", /\/poster\.jpg/);
  await expect(galleryVideo).toHaveJSProperty("controls", true);
  // The duration badge renders the client-read duration.
  await expect(gallery.locator("[data-gallery-video-duration]")).toHaveText(/0:03/);

  // It really decodes …
  await expect
    .poll(async () => galleryVideo.evaluate((v: HTMLVideoElement) => v.readyState), {
      timeout: 25_000,
    })
    .toBeGreaterThanOrEqual(1);
  expect(await galleryVideo.evaluate((v: HTMLVideoElement) => v.videoWidth)).toBeGreaterThan(0);

  // … and clicking it plays it (native controls, real user gesture).
  await galleryVideo.click();
  await expect
    .poll(async () => galleryVideo.evaluate((v: HTMLVideoElement) => v.paused), { timeout: 15_000 })
    .toBe(false);
});

test("with prefers-reduced-motion the cover video does not autoplay and offers an explicit play control", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const context = await browser.newContext({ reducedMotion: "reduce" });
  try {
    const page = await context.newPage();
    const { tripId } = await seedVideoTrip(page);

    await page.goto(`/trips/${tripId}/story`);

    const cover = page.locator("[data-cover-photo][data-cover-video]");
    await expect(cover).toHaveCount(1);
    await cover.scrollIntoViewIfNeeded();

    // Metadata still loads (the poster frame is real, not a black box) …
    await expect
      .poll(async () => cover.evaluate((v: HTMLVideoElement) => v.readyState), { timeout: 25_000 })
      .toBeGreaterThanOrEqual(1);

    // … but nothing ever starts on its own.
    const play = page.locator("[data-video-play]");
    await expect(play).toBeVisible();
    expect(await cover.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
    await page.waitForTimeout(1_000);
    expect(
      await cover.evaluate((v: HTMLVideoElement) => v.paused),
      "still paused a second later — no delayed autoplay",
    ).toBe(true);

    // The explicit control is the way in, and it works.
    await play.click();
    await expect
      .poll(async () => cover.evaluate((v: HTMLVideoElement) => v.paused), { timeout: 15_000 })
      .toBe(false);
  } finally {
    await context.close();
  }
});
