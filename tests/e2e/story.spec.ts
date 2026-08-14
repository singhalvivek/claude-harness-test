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
        // Give the first stop a motif so the decorated "station" ornament renders.
        ...(i === 0 ? { motif: "mountain" } : {}),
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

test("story decor: ambient background, per-stop motif ornament and closing outro render (frozen contract intact)", async ({
  page,
}) => {
  // seedTrip gives the FIRST stop a "mountain" motif (see the seed helper).
  const tripId = await seedTrip(page);

  await page.goto(`/trips/${tripId}/story`);
  await expect(page).toHaveURL(new RegExp(`/trips/${tripId}/story`));

  // --- Frozen hooks survive the added decoration ---
  const path$ = page.locator("svg path[data-serpentine]");
  await expect(path$).toHaveCount(1);
  await expect(page.locator('[data-theme="cinematic"]')).toHaveCount(1);
  await expect(page.locator("[data-theme-signature]").first()).toBeVisible();

  // Path measured (draw-on-scroll contract holds: dashoffset == full at the top).
  await expect
    .poll(async () => path$.evaluate((el) => parseFloat(getComputedStyle(el).strokeDashoffset) || 0), {
      timeout: 15_000,
    })
    .toBeGreaterThan(50);

  // The cover photo is still real + hero-scale (> 340px), never a thumbnail.
  const cover = page.locator("[data-cover-photo]").first();
  await expect
    .poll(async () => cover.evaluate((el) => (el as HTMLImageElement).naturalWidth), { timeout: 15_000 })
    .toBeGreaterThan(0);
  const coverBox = await cover.boundingBox();
  expect(coverBox?.width ?? 0).toBeGreaterThan(340);

  // --- (2) Ambient decorated background layer is present and full-bleed ---
  const decor = page.locator("[data-ambient-decor]");
  await expect(decor).toHaveCount(1);
  await expect(decor).toBeVisible();
  const decorBox = await decor.boundingBox();
  expect(decorBox?.width ?? 0).toBeGreaterThan(340);

  // --- (1) A motif ornament renders for the motif'd stop and animates in ---
  const ornament = page.locator('[data-stop-motif="mountain"]');
  await expect(ornament).toHaveCount(1);
  // It scale+fades in when scrolled into view (the always-on map hero pushes the
  // first node below the fold, so bring it into view first).
  await ornament.scrollIntoViewIfNeeded();
  await expect
    .poll(async () => ornament.evaluate((el) => parseFloat(getComputedStyle(el).opacity)), {
      timeout: 10_000,
    })
    .toBeGreaterThan(0.5);
  // The catalog glyph actually rendered inside the ornament.
  await expect(ornament.locator("svg")).toHaveCount(1);

  // A stop card still starts hidden and animates in on scroll (frozen behavior).
  const lastCard = page.locator("[data-stop-card]").last();
  const lastCardOpacityTop = await lastCard.evaluate((el) => parseFloat(getComputedStyle(el).opacity));
  expect(lastCardOpacityTop).toBeLessThan(0.5);

  const dashTop = await path$.evaluate((el) => parseFloat(getComputedStyle(el).strokeDashoffset));

  // --- Scroll to the end → the path draws, the closing outro reveals ---
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(800);

  const dashBottom = await path$.evaluate((el) => parseFloat(getComputedStyle(el).strokeDashoffset));
  expect(dashBottom).toBeLessThan(dashTop);
  expect(Math.abs(dashTop - dashBottom)).toBeGreaterThan(1);

  await expect(lastCard).toBeVisible();

  // --- (3) The closing "end of the journey" block renders after the last stop ---
  const outro = page.locator("[data-story-outro]");
  await expect(outro).toHaveCount(1);
  await expect
    .poll(async () => outro.evaluate((el) => parseFloat(getComputedStyle(el).opacity)), {
      timeout: 10_000,
    })
    .toBeGreaterThan(0.5);
  await expect(outro).toContainText("The journey ends here");
});

// ─── Phase 2.5 additions (appended; nothing above is modified) ───────────────

test("a trip whose stops have no feeling renders exactly as before (no extra beats)", async ({
  page,
}) => {
  // seedTrip creates stops WITHOUT a feeling, so every stop backfills to
  // feeling = null / feelingPlacement = "card" — the shipped-story shape.
  const tripId = await seedTrip(page);

  // The API confirms the backfilled shape before we assert on the DOM.
  const getTrip = await page.request.get(`/api/trips/${tripId}`);
  expect(getTrip.ok(), await getTrip.text()).toBeTruthy();
  const trip = await getTrip.json();
  expect(trip.stops).toHaveLength(STOPS.length);
  for (const s of trip.stops) {
    expect(s.feeling).toBeNull();
    expect(s.feelingPlacement).toBe("card");
  }

  await page.goto(`/trips/${tripId}/story`);

  // No feeling → no beat, in EITHER placement, however the placement reads.
  await expect(page.locator("[data-feeling-card]")).toHaveCount(0);
  await expect(page.locator("[data-feeling-inline]")).toHaveCount(0);
  await expect(page.locator("[data-feeling-quote]")).toHaveCount(0);

  // One card per stop and nothing else: the beat list collapses to the stop
  // list exactly as it did before Phase 2.5.
  await expect(page.locator("[data-stop-card]")).toHaveCount(STOPS.length);

  // The frozen hooks are all still here and the path still draws on scroll.
  const path$ = page.locator("svg path[data-serpentine]");
  await expect(path$).toHaveCount(1);
  await expect(page.locator('[data-theme="cinematic"]')).toHaveCount(1);
  await expect(page.locator("[data-theme-signature]").first()).toBeVisible();
  await expect(page.locator("[data-story-marker]")).toHaveCount(1);
  await expect(page.locator("[data-cover-photo]").first()).toBeVisible();

  await expect
    .poll(async () => path$.evaluate((el) => parseFloat(getComputedStyle(el).strokeDashoffset) || 0), {
      timeout: 15_000,
    })
    .toBeGreaterThan(50);
  const dashTop = await path$.evaluate((el) => parseFloat(getComputedStyle(el).strokeDashoffset));

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(700);

  const dashBottom = await path$.evaluate((el) => parseFloat(getComputedStyle(el).strokeDashoffset));
  expect(dashBottom).toBeLessThan(dashTop);
});

test("a feeling card stands on the path as its own beat, and adds a beat to the track", async ({
  page,
}) => {
  const tripId = await seedTrip(page);

  // Measure the track height with NO feelings (3 stop beats).
  await page.goto(`/trips/${tripId}/story`);
  // The serpentine <svg> is sized to the geometry's total track height.
  const svg = page.locator("svg:has(path[data-serpentine])");
  await expect(svg).toHaveCount(1);
  const heightBefore = await svg.evaluate((el) => el.getBoundingClientRect().height);
  const lengthBefore = await page
    .locator("svg path[data-serpentine]")
    .evaluate((el) => (el as unknown as SVGPathElement).getTotalLength());

  // Give the FIRST stop a "card" feeling — it becomes a second beat.
  const stops = await (await page.request.get(`/api/trips/${tripId}`)).json();
  const patch = await page.request.patch(`/api/stops/${stops.stops[0].id}`, {
    data: { feeling: "The whole city smelled of rain and cedar.", feelingPlacement: "card" },
  });
  expect(patch.ok(), await patch.text()).toBeTruthy();

  await page.goto(`/trips/${tripId}/story`);
  await expect(page.locator("[data-feeling-card]")).toHaveCount(1);
  await expect(page.locator("[data-stop-card]")).toHaveCount(STOPS.length);

  // The extra beat lengthens BOTH the track and the drawn path — proof the
  // feeling card is on the serpentine, not floating beside it.
  const heightAfter = await page
    .locator("svg:has(path[data-serpentine])")
    .evaluate((el) => el.getBoundingClientRect().height);
  const lengthAfter = await page
    .locator("svg path[data-serpentine]")
    .evaluate((el) => (el as unknown as SVGPathElement).getTotalLength());
  expect(heightAfter).toBeGreaterThan(heightBefore);
  expect(lengthAfter).toBeGreaterThan(lengthBefore);

  // It sits on the side OPPOSITE its stop (beats alternate), and it is never a
  // descendant of a stop card.
  const firstStopBox = await page.locator("[data-stop-card]").first().boundingBox();
  const feelingBox = await page.locator("[data-feeling-card]").boundingBox();
  expect(firstStopBox).not.toBeNull();
  expect(feelingBox).not.toBeNull();
  const stopCentre = firstStopBox!.x + firstStopBox!.width / 2;
  const feelingCentre = feelingBox!.x + feelingBox!.width / 2;
  expect(Math.abs(feelingCentre - stopCentre)).toBeGreaterThan(100);
  expect(
    await page.locator("[data-feeling-card]").evaluate((el) => el.closest("[data-stop-card]") === null),
  ).toBe(true);
});
