import { test, expect, type Page } from "@playwright/test";
import sharp from "sharp";
import { promises as fs } from "fs";
import os from "os";
import path from "path";

// Public-share + tags smoke (Phase 2, slice-public-ui). Self-contained: each test
// seeds its own authenticated trip (login → trip → 3 stops → a real JPEG each) via
// the page's request context, then exercises the slice's surfaces:
//
//   (1) Owner tags a stop in the editor and the tag persists across reload.
//   (2) Publishing yields an unguessable /s/<slug> that renders the SAME themed
//       story in a FRESH context with no session cookie — no login, no edit
//       controls (no "Add stop", no "Back to editor", no theme picker).
//   (3) An unknown slug 404s (public API + friendly page), and an unpublished
//       (revoked) slug is indistinguishable — it 404s too, so it can't be probed.

const PASSWORD = "letmein";

const STOPS = [
  { title: "Arrival", placeName: "Kyoto, Japan", lat: 35.0116, lng: 135.7681, body: "Stepped off the train into lantern light." },
  { title: "Temple morning", placeName: "Fushimi Inari, Kyoto", lat: 34.9671, lng: 135.7727, body: "Ten thousand vermilion gates climbing the hill." },
  { title: "Last supper", placeName: "Pontocho Alley, Kyoto", lat: 35.0037, lng: 135.7709, body: "River breeze, grilled skewers, one more toast." },
];

async function makeJpeg(seed: number): Promise<Buffer> {
  const filePath = path.join(os.tmpdir(), `wanderline-public-${Date.now()}-${seed}.jpg`);
  await sharp({
    create: {
      width: 1200,
      height: 800,
      channels: 3,
      background: { r: (seed * 70) % 255, g: (seed * 40 + 60) % 255, b: (seed * 25 + 120) % 255 },
    },
  })
    .jpeg({ quality: 82 })
    .toFile(filePath);
  return fs.readFile(filePath);
}

/**
 * Seed a fresh authenticated trip (login → trip → 3 stops → a real JPEG each)
 * via the page's request context, so the browser shares the session cookie.
 * Returns the created trip id.
 */
async function seedTrip(page: Page): Promise<string> {
  const login = await page.request.post("/api/auth/login", { data: { password: PASSWORD } });
  expect(login.ok(), `login failed: ${login.status()}`).toBeTruthy();

  const tripRes = await page.request.post("/api/trips", {
    data: {
      title: `Kyoto Journey ${Date.now()}`,
      description: "Five days winding through old Kyoto.",
    },
  });
  expect(tripRes.status(), await tripRes.text()).toBe(201);
  const tripId: string = (await tripRes.json()).id;
  expect(tripId).toBeTruthy();

  for (let i = 0; i < STOPS.length; i++) {
    const s = STOPS[i];
    const stopRes = await page.request.post(`/api/trips/${tripId}/stops`, {
      data: {
        title: s.title,
        placeName: s.placeName,
        lat: s.lat,
        lng: s.lng,
        locationPrecision: "exact",
        occurredAt: new Date(Date.UTC(2026, 4, 1 + i, 9 + i, 30)).toISOString(),
        body: s.body,
      },
    });
    expect(stopRes.status(), await stopRes.text()).toBe(201);
    const stop = await stopRes.json();

    const buffer = await makeJpeg(i + 1);
    const photoRes = await page.request.post(`/api/stops/${stop.id}/photos`, {
      multipart: { files: { name: `stop-${i + 1}.jpg`, mimeType: "image/jpeg", buffer } },
    });
    expect(photoRes.status(), await photoRes.text()).toBe(201);
  }

  return tripId;
}

/** Publish via the owner API and read back the freshly-minted share slug. */
async function publishAndGetSlug(page: Page, tripId: string): Promise<string> {
  const pub = await page.request.post(`/api/trips/${tripId}/publish`);
  expect(pub.ok(), await pub.text()).toBeTruthy();

  const trip = await (await page.request.get(`/api/trips/${tripId}`)).json();
  expect(trip.isPublished).toBe(true);
  const slug: string = trip.shareSlug;
  expect(slug, "publish should mint a share slug").toBeTruthy();
  expect(slug.length, "slug is an unguessable >= 24-char token").toBeGreaterThanOrEqual(24);
  return slug;
}

test("owner tags a stop and the tag persists across reload", async ({ page }) => {
  const tripId = await seedTrip(page);
  const label = `hiking${Date.now()}`;

  await page.goto(`/trips/${tripId}/edit`);

  // Scope to the first stop's tags editor.
  const row = page.locator('[data-testid="stop-tags-row"]').first();
  await expect(row).toBeVisible();

  await row.locator('[data-testid="tag-label-input"]').fill(label);
  await row.locator('[data-testid="tag-kind-select"]').selectOption("activity");
  await row.locator('[data-testid="tag-add-button"]').click();

  // The chip appears in that row after the save + refresh round-trip.
  const chip = row.locator(`[data-testid="stop-tag-chip"][data-tag-label="${label}"]`);
  await expect(chip).toBeVisible();

  // Persistence: reload and confirm the chip is still there (read from the DB).
  await page.reload();
  const rowAfter = page.locator('[data-testid="stop-tags-row"]').first();
  await expect(
    rowAfter.locator(`[data-testid="stop-tag-chip"][data-tag-label="${label}"]`),
  ).toBeVisible();
});

test("published trip renders read-only at /s/<slug> with no edit controls in a fresh context", async ({
  page,
  browser,
}) => {
  const tripId = await seedTrip(page);
  const slug = await publishAndGetSlug(page, tripId);

  // Fresh context: no session cookie, no owner storage state. Reduced motion so
  // the themed cards render visible without needing a scroll animation.
  const ctx = await browser.newContext({ reducedMotion: "reduce" });
  const pub = await ctx.newPage();
  try {
    await pub.goto(`/s/${slug}`);

    // Not redirected to /login — the public route is exempt from owner auth.
    await expect(pub).toHaveURL(new RegExp(`/s/${slug}$`));

    // The SAME themed serpentine story renders, driven by real published data.
    await expect(pub.locator("[data-theme]").first()).toBeVisible();
    await expect(pub.locator("svg path[data-serpentine]")).toHaveCount(1);
    const card = pub.locator("[data-stop-card]").first();
    await expect(card).toBeVisible();

    // A real cover photo is served through the public /api/media route.
    const cover = pub.locator("[data-cover-photo]").first();
    await expect
      .poll(async () => cover.evaluate((el) => (el as HTMLImageElement).naturalWidth), {
        timeout: 15_000,
      })
      .toBeGreaterThan(0);

    // NO owner chrome anywhere: no add-stop, no back-to-editor, no theme picker,
    // no share/publish panel.
    await expect(pub.locator('[data-testid="add-stop-button"]')).toHaveCount(0);
    await expect(pub.locator('[data-testid="theme-picker"]')).toHaveCount(0);
    await expect(pub.locator('[data-testid="publish-panel"]')).toHaveCount(0);
    await expect(pub.getByText("Back to editor")).toHaveCount(0);
    await expect(pub.getByText("Add stop", { exact: false })).toHaveCount(0);
  } finally {
    await ctx.close();
  }
});

test("shared /s/<slug> reader has a working tag filter (parity with the owner story)", async ({
  page,
  browser,
}) => {
  const tripId = await seedTrip(page);

  // Tag ONLY the first stop, via the owner API, then publish.
  const trip = await (await page.request.get(`/api/trips/${tripId}`)).json();
  const firstStopId: string = trip.stops[0].id;
  const label = `hiking${Date.now()}`;
  const tagRes = await page.request.post(`/api/stops/${firstStopId}/tags`, {
    data: { label, kind: "activity" },
  });
  expect(tagRes.ok(), await tagRes.text()).toBeTruthy();

  const slug = await publishAndGetSlug(page, tripId);

  // Fresh, cookieless context — a real visitor opening the shared link.
  const ctx = await browser.newContext({ reducedMotion: "reduce" });
  const pub = await ctx.newPage();
  try {
    await pub.goto(`/s/${slug}`);

    // The filter is present on the shared page and all three stops show initially.
    await expect(pub.locator("[data-tag-filter]")).toBeVisible();
    await expect(pub.locator("[data-stop-card]")).toHaveCount(3);

    // Selecting the tag hides the two untagged stops (only the tagged one remains).
    await pub.locator(`[data-tag-chip="${label}"]`).click();
    await expect(pub.locator("[data-stop-card]")).toHaveCount(1);

    // Clearing restores all three.
    await pub.locator("[data-tag-clear]").click();
    await expect(pub.locator("[data-stop-card]")).toHaveCount(3);
  } finally {
    await ctx.close();
  }
});

test("unknown and unpublished slugs are indistinguishable 404s (not probeable)", async ({
  page,
  browser,
}) => {
  // (a) A random/unknown slug 404s from the public API and shows the friendly page.
  const badSlug = "definitelynotarealshareslug0000000000";
  const badApi = await page.request.get(`/api/public/trips/${badSlug}`);
  expect(badApi.status()).toBe(404);

  const anon1 = await browser.newContext();
  const badPage = await anon1.newPage();
  try {
    await badPage.goto(`/s/${badSlug}`);
    await expect(badPage).toHaveURL(new RegExp(`/s/${badSlug}$`)); // no login redirect
    await expect(badPage.locator('[data-testid="public-not-available"]')).toBeVisible();
    await expect(badPage.locator("svg path[data-serpentine]")).toHaveCount(0);
  } finally {
    await anon1.close();
  }

  // (b) An UNPUBLISHED trip's slug is not readable: publish to mint a slug, then
  // unpublish — the same slug must now 404 (indistinguishable from unknown).
  const tripId = await seedTrip(page);
  const slug = await publishAndGetSlug(page, tripId);

  // Sanity: while published it reads back through the public API.
  expect((await page.request.get(`/api/public/trips/${slug}`)).status()).toBe(200);

  const unpub = await page.request.post(`/api/trips/${tripId}/unpublish`);
  expect(unpub.ok(), await unpub.text()).toBeTruthy();

  // Revoked slug now 404s from the public API...
  expect((await page.request.get(`/api/public/trips/${slug}`)).status()).toBe(404);

  // ...and the reader shows the same friendly "not available" page.
  const anon2 = await browser.newContext();
  const revokedPage = await anon2.newPage();
  try {
    await revokedPage.goto(`/s/${slug}`);
    await expect(revokedPage.locator('[data-testid="public-not-available"]')).toBeVisible();
    await expect(revokedPage.locator("svg path[data-serpentine]")).toHaveCount(0);
  } finally {
    await anon2.close();
  }
});
