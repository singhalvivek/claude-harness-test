import { test, expect, type Locator, type Page } from "@playwright/test";
import sharp from "sharp";
import { promises as fs } from "fs";
import os from "os";
import path from "path";

// Serpentine Story View smoke. Self-contained: it seeds its own trip (login →
// trip → >= 3 stops → a real JPEG per stop) via the API using the page's own
// request context (so the session cookie is shared with the browser), then
// asserts the *animated* view actually renders — path drawing, a stop card
// becoming visible, a real cover photo with parallax, and a marker that travels.
//
// Phase-1.5 (Story Themes) adds: the default trip renders [data-theme="cinematic"]
// with its [data-theme-signature]; the rendered cover box is materially larger
// than a thumbnail; the story root's background is non-default; and switching a
// trip's theme (PATCH { theme }) re-renders the story in that theme.

const PASSWORD = "letmein";

const STOPS = [
  { title: "Arrival", placeName: "Kyoto, Japan", lat: 35.0116, lng: 135.7681, body: "Stepped off the train into lantern light." },
  { title: "Temple morning", placeName: "Fushimi Inari, Kyoto", lat: 34.9671, lng: 135.7727, body: "Ten thousand vermilion gates climbing the hill." },
  { title: "Last supper", placeName: "Pontocho Alley, Kyoto", lat: 35.0037, lng: 135.7709, body: "River breeze, grilled skewers, one more toast." },
];

/** Read the translateY (px) out of an element's computed transform matrix. */
async function translateY(loc: Locator): Promise<number> {
  return loc.evaluate((el) => {
    const t = getComputedStyle(el as Element).transform;
    if (!t || t === "none") return 0;
    const m2 = t.match(/matrix\(([^)]+)\)/);
    if (m2) return Number(m2[1].split(",")[5]);
    const m3 = t.match(/matrix3d\(([^)]+)\)/);
    if (m3) return Number(m3[1].split(",")[13]);
    return 0;
  });
}

async function makeJpeg(seed: number): Promise<Buffer> {
  const filePath = path.join(os.tmpdir(), `wanderline-story-${Date.now()}-${seed}.jpg`);
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
 * Optionally passes a starting `theme` on trip creation. Returns the trip id.
 */
async function seedTrip(page: Page, opts?: { theme?: string }): Promise<string> {
  const login = await page.request.post("/api/auth/login", {
    data: { password: PASSWORD },
  });
  expect(login.ok(), `login failed: ${login.status()}`).toBeTruthy();

  const tripRes = await page.request.post("/api/trips", {
    data: {
      title: `Kyoto Journey ${Date.now()}`,
      description: "Five days winding through old Kyoto.",
      ...(opts?.theme ? { theme: opts.theme } : {}),
    },
  });
  expect(tripRes.status(), await tripRes.text()).toBe(201);
  const trip = await tripRes.json();
  const tripId: string = trip.id;
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
      multipart: {
        files: { name: `stop-${i + 1}.jpg`, mimeType: "image/jpeg", buffer },
      },
    });
    expect(photoRes.status(), await photoRes.text()).toBe(201);
  }

  return tripId;
}

test("serpentine story view draws on scroll with cards, parallax cover and a traveling marker", async ({
  page,
  browser,
}) => {
  const tripId = await seedTrip(page);

  // A trip created without a theme reads back the default (cinematic).
  const getTrip = await page.request.get(`/api/trips/${tripId}`);
  expect(getTrip.ok(), await getTrip.text()).toBeTruthy();
  expect((await getTrip.json()).theme).toBe("cinematic");

  // --- Load the story (authenticated via the shared session cookie) ---
  await page.goto(`/trips/${tripId}/story`);
  await expect(page).toHaveURL(new RegExp(`/trips/${tripId}/story`));

  // --- Story Themes: the default trip renders the cinematic theme + signature ---
  const themeRoot = page.locator('[data-theme="cinematic"]');
  await expect(themeRoot).toHaveCount(1);
  await expect(page.locator("[data-theme-signature]").first()).toBeVisible();

  const path$ = page.locator("svg path[data-serpentine]");
  await expect(path$).toHaveCount(1);
  const marker = page.locator("[data-story-marker]");
  const cover = page.locator("[data-cover-photo]").first();
  const lastCard = page.locator("[data-stop-card]").last();

  // Wait until the path is measured (dashoffset == full length while at the top).
  await expect
    .poll(async () => path$.evaluate((el) => parseFloat(getComputedStyle(el).strokeDashoffset) || 0), {
      timeout: 15_000,
    })
    .toBeGreaterThan(50);

  // Real cover photo actually decoded.
  await expect
    .poll(async () => cover.evaluate((el) => (el as HTMLImageElement).naturalWidth), {
      timeout: 15_000,
    })
    .toBeGreaterThan(0);

  // The rendered cover box is materially larger than a thumbnail (theme photos
  // are hero-scale; cinematic aims largest).
  const coverBox = await cover.boundingBox();
  expect(coverBox?.width ?? 0).toBeGreaterThan(340);

  // The story root's filled background is non-default (never blank/transparent).
  const rootBg = await themeRoot.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(rootBg).not.toBe("rgb(255, 255, 255)");
  expect(rootBg).not.toBe("rgba(0, 0, 0, 0)");
  expect(rootBg).not.toBe("none");

  // --- Capture top-of-page metrics ---
  const dashTop = await path$.evaluate((el) => parseFloat(getComputedStyle(el).strokeDashoffset));
  const markerTopY = await translateY(marker);
  const coverTransformTop = await cover.evaluate((el) => getComputedStyle(el).transform);
  const lastCardOpacityTop = await lastCard.evaluate((el) => parseFloat(getComputedStyle(el).opacity));

  // --- Scroll to the bottom and let Framer Motion settle ---
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(700);

  const dashBottom = await path$.evaluate((el) => parseFloat(getComputedStyle(el).strokeDashoffset));
  const markerBottomY = await translateY(marker);
  const coverTransformBottom = await cover.evaluate((el) => getComputedStyle(el).transform);

  // Path draws itself: dashoffset shrinks toward 0 as we scroll.
  expect(dashBottom).toBeLessThan(dashTop);
  expect(Math.abs(dashTop - dashBottom)).toBeGreaterThan(1);

  // Marker travels down the route as scroll progress increases.
  expect(markerBottomY).toBeGreaterThan(markerTopY);

  // Cover photo has parallax: its transform shifts as the page scrolls.
  expect(coverTransformBottom).not.toBe(coverTransformTop);

  // A stop card that started hidden transitions to visible on scroll.
  expect(lastCardOpacityTop).toBeLessThan(0.5);
  await lastCard.scrollIntoViewIfNeeded();
  await expect
    .poll(async () => lastCard.evaluate((el) => parseFloat(getComputedStyle(el).opacity)), {
      timeout: 10_000,
    })
    .toBeGreaterThan(0.9);
  await expect(lastCard).toBeVisible();

  // A styled-with-Tailwind element reports a non-default computed style
  // (proves the CSS bundle expanded — no unexpanded @tailwind).
  const markerColor = await marker
    .locator("div")
    .first()
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(markerColor).not.toBe("rgba(0, 0, 0, 0)");

  // --- Reduced motion: path fully drawn, cards visible without scrolling ---
  await test.step("prefers-reduced-motion renders the path drawn and cards visible", async () => {
    const rmCtx = await browser.newContext({ reducedMotion: "reduce" });
    const rmPage = await rmCtx.newPage();
    const rmLogin = await rmPage.request.post("/api/auth/login", {
      data: { password: PASSWORD },
    });
    expect(rmLogin.ok()).toBeTruthy();

    await rmPage.goto(`/trips/${tripId}/story`);
    const rmPath = rmPage.locator("svg path[data-serpentine]");
    await expect(rmPath).toHaveCount(1);

    // Fully drawn (offset ~0) without any scrolling.
    await expect
      .poll(async () => rmPath.evaluate((el) => parseFloat(getComputedStyle(el).strokeDashoffset)), {
        timeout: 10_000,
      })
      .toBeLessThan(2);

    // Cards are simply visible — no scroll animation required.
    const firstCard = rmPage.locator("[data-stop-card]").first();
    await expect(firstCard).toBeVisible();
    const op = await firstCard.evaluate((el) => parseFloat(getComputedStyle(el).opacity));
    expect(op).toBeGreaterThan(0.9);

    await rmCtx.close();
  });
});

test("switching a trip's theme re-renders the story in that theme", async ({ page }) => {
  const tripId = await seedTrip(page);

  // Persist a new theme via the editor's save path (PATCH /api/trips/:id).
  const patch = await page.request.patch(`/api/trips/${tripId}`, {
    data: { theme: "vintage" },
  });
  expect(patch.ok(), await patch.text()).toBeTruthy();
  expect((await patch.json()).theme).toBe("vintage");

  // Reload the story: it now renders the chosen theme + that theme's signature.
  await page.goto(`/trips/${tripId}/story`);
  const vintageRoot = page.locator('[data-theme="vintage"]');
  await expect(vintageRoot).toHaveCount(1);
  await expect(page.locator("[data-theme-signature]").first()).toBeVisible();

  // The serpentine survives the theme swap and still draws on scroll.
  const path$ = page.locator("svg path[data-serpentine]");
  await expect(path$).toHaveCount(1);
  await expect
    .poll(async () => path$.evaluate((el) => parseFloat(getComputedStyle(el).strokeDashoffset) || 0), {
      timeout: 15_000,
    })
    .toBeGreaterThan(50);

  // A stop card and its real cover render under the new theme.
  const cover = page.locator("[data-cover-photo]").first();
  await expect
    .poll(async () => cover.evaluate((el) => (el as HTMLImageElement).naturalWidth), {
      timeout: 15_000,
    })
    .toBeGreaterThan(0);
  const coverBox = await cover.boundingBox();
  expect(coverBox?.width ?? 0).toBeGreaterThan(340);

  // The kraft ground is a real, non-default background.
  const rootBg = await vintageRoot.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(rootBg).not.toBe("rgb(255, 255, 255)");
  expect(rootBg).not.toBe("rgba(0, 0, 0, 0)");
  expect(rootBg).not.toBe("none");
});

test("all four themes render their data-theme value, signature and serpentine", async ({
  page,
}) => {
  const tripId = await seedTrip(page);

  // Apply each theme via the API seed (the editor's save path) and confirm the
  // story re-renders in that theme: the single [data-theme] root, its signature
  // layer, a filled (non-default) background, and the surviving serpentine.
  for (const theme of ["cinematic", "editorial", "minimal", "vintage"] as const) {
    const patch = await page.request.patch(`/api/trips/${tripId}`, { data: { theme } });
    expect(patch.ok(), await patch.text()).toBeTruthy();
    expect((await patch.json()).theme).toBe(theme);

    await page.goto(`/trips/${tripId}/story`);

    const root = page.locator(`[data-theme="${theme}"]`);
    await expect(root, `theme=${theme}: exactly one themed root`).toHaveCount(1);
    await expect(
      page.locator("[data-theme-signature]").first(),
      `theme=${theme}: signature layer present`,
    ).toBeVisible();

    // The serpentine draw-on-scroll survives the theme swap in every theme.
    const path$ = page.locator("svg path[data-serpentine]");
    await expect(path$).toHaveCount(1);
    await expect
      .poll(
        async () => path$.evaluate((el) => parseFloat(getComputedStyle(el).strokeDashoffset) || 0),
        { timeout: 15_000 },
      )
      .toBeGreaterThan(50);

    // The themed ground is a real, non-default fill (never blank white / none).
    const rootBg = await root.evaluate((el) => {
      const s = getComputedStyle(el);
      return { color: s.backgroundColor, image: s.backgroundImage };
    });
    const transparent =
      rootBg.color === "rgba(0, 0, 0, 0)" || rootBg.color === "transparent";
    expect(
      transparent && rootBg.image === "none",
      `theme=${theme}: root has a filled background`,
    ).toBeFalsy();
  }
});
