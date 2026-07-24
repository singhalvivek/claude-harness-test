import { test, expect, type Locator } from "@playwright/test";
import sharp from "sharp";
import { promises as fs } from "fs";
import os from "os";
import path from "path";

// Serpentine Story View smoke. Self-contained: it seeds its own trip (login →
// trip → >= 3 stops → a real JPEG per stop) via the API using the page's own
// request context (so the session cookie is shared with the browser), then
// asserts the *animated* view actually renders — path drawing, a stop card
// becoming visible, a real cover photo with parallax, and a marker that travels.

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

test("serpentine story view draws on scroll with cards, parallax cover and a traveling marker", async ({
  page,
  browser,
}) => {
  // --- Seed via the API (cookies land in the page's browser context) ---
  const login = await page.request.post("/api/auth/login", {
    data: { password: PASSWORD },
  });
  expect(login.ok(), `login failed: ${login.status()}`).toBeTruthy();

  const tripRes = await page.request.post("/api/trips", {
    data: {
      title: `Kyoto Journey ${Date.now()}`,
      description: "Five days winding through old Kyoto.",
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

  // --- Load the story (authenticated via the shared session cookie) ---
  await page.goto(`/trips/${tripId}/story`);
  await expect(page).toHaveURL(new RegExp(`/trips/${tripId}/story`));

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
