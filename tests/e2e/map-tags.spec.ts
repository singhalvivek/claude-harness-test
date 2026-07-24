import { test, expect, type Page } from "@playwright/test";
import sharp from "sharp";
import { promises as fs } from "fs";
import os from "os";
import path from "path";

// Phase-2 (slice-map-ui) smoke for the story view's Map overview + tag filter.
// Self-contained: it seeds its own trip (login → trip → 3 located stops → a real
// JPEG each → one activity tag on the first stop) via the page's request context
// so the browser shares the session cookie, then drives the two Phase-2 controls:
//
//   1. toggling Map overview renders a real Leaflet container with one marker per
//      located stop and a connecting route polyline;
//   2. selecting a tag filters the story to matching stops (fewer cards shown),
//      and clearing it restores every stop.

const PASSWORD = "letmein";

const STOPS = [
  { title: "Arrival", placeName: "Kyoto, Japan", lat: 35.0116, lng: 135.7681, body: "Stepped off the train into lantern light." },
  { title: "Temple morning", placeName: "Fushimi Inari, Kyoto", lat: 34.9671, lng: 135.7727, body: "Ten thousand vermilion gates climbing the hill." },
  { title: "Last supper", placeName: "Pontocho Alley, Kyoto", lat: 35.0037, lng: 135.7709, body: "River breeze, grilled skewers, one more toast." },
];

const TAG_LABEL = "hiking";

async function makeJpeg(seed: number): Promise<Buffer> {
  const filePath = path.join(os.tmpdir(), `wanderline-maptags-${Date.now()}-${seed}.jpg`);
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
 * Seed a fresh authenticated trip: login → trip → 3 located stops (each with a
 * real JPEG) → one `activity` tag ("hiking") on the FIRST stop only. Returns the
 * trip id and the stop ids in order.
 */
async function seedTrip(page: Page): Promise<{ tripId: string; stopIds: string[] }> {
  const login = await page.request.post("/api/auth/login", { data: { password: PASSWORD } });
  expect(login.ok(), `login failed: ${login.status()}`).toBeTruthy();

  const tripRes = await page.request.post("/api/trips", {
    data: { title: `Kyoto Map Journey ${Date.now()}`, description: "Winding through old Kyoto." },
  });
  expect(tripRes.status(), await tripRes.text()).toBe(201);
  const tripId: string = (await tripRes.json()).id;
  expect(tripId).toBeTruthy();

  const stopIds: string[] = [];
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
    stopIds.push(stop.id);

    const buffer = await makeJpeg(i + 1);
    const photoRes = await page.request.post(`/api/stops/${stop.id}/photos`, {
      multipart: { files: { name: `stop-${i + 1}.jpg`, mimeType: "image/jpeg", buffer } },
    });
    expect(photoRes.status(), await photoRes.text()).toBe(201);
  }

  // Attach one activity tag to the FIRST stop only, so a filter on it hides the
  // other two stops in the story.
  const tagRes = await page.request.post(`/api/stops/${stopIds[0]}/tags`, {
    data: { label: TAG_LABEL, kind: "activity" },
  });
  expect(tagRes.status(), await tagRes.text()).toBeLessThan(300);

  return { tripId, stopIds };
}

test("map hero renders a themed Leaflet map with a marker per located stop, a route line, and interactive pins", async ({
  page,
}) => {
  const { tripId } = await seedTrip(page);

  await page.goto(`/trips/${tripId}/story`);
  await expect(page).toHaveURL(new RegExp(`/trips/${tripId}/story`));

  // The map hero is ALWAYS on at the top of the story (no toggle) and mounts a
  // real Leaflet map (dynamically imported, client-only).
  const map = page.locator(".leaflet-container");
  await expect(map).toBeVisible({ timeout: 15_000 });

  // Every stop card renders below the map.
  await expect(page.locator("[data-stop-card]")).toHaveCount(STOPS.length);

  // One marker per located stop (all three stops carry coords).
  await expect(page.locator(".leaflet-marker-icon")).toHaveCount(STOPS.length);

  // A route polyline connects the pins (Leaflet renders it as an SVG <path> in
  // the overlay pane).
  await expect
    .poll(async () => page.locator(".leaflet-overlay-pane path").count(), { timeout: 15_000 })
    .toBeGreaterThan(0);

  // Pins are interactive: clicking one opens a popup with a "go to this stop"
  // button (which jumps the story to that stop).
  await page.locator(".leaflet-marker-icon").first().click();
  await expect(page.locator(".leaflet-popup")).toBeVisible();
  await expect(page.locator("[data-map-goto]")).toHaveCount(1);

  // The serpentine story renders below the map hero.
  await expect(page.locator("svg path[data-serpentine]")).toHaveCount(1);
});

test("tag filter hides non-matching stops in the story and clearing restores them", async ({
  page,
}) => {
  const { tripId } = await seedTrip(page);

  await page.goto(`/trips/${tripId}/story`);

  const cards = page.locator("[data-stop-card]");
  await expect(cards).toHaveCount(STOPS.length);
  const total = await cards.count();

  // The filter bar surfaces the trip's one tag as a chip.
  const chip = page.locator(`[data-tag-chip="${TAG_LABEL}"]`);
  await expect(chip).toBeVisible();

  // Applying the filter hides every stop that lacks the tag (only the first stop
  // carries it), so fewer cards remain than the total.
  await chip.click();
  await expect(chip).toHaveAttribute("aria-pressed", "true");
  await expect(cards).toHaveCount(1);
  expect(await cards.count()).toBeLessThan(total);

  // The one surviving stop still renders its real cover photo under the filter.
  const cover = page.locator("[data-cover-photo]").first();
  await expect
    .poll(async () => cover.evaluate((el) => (el as HTMLImageElement).naturalWidth), {
      timeout: 15_000,
    })
    .toBeGreaterThan(0);

  // Clearing the filter restores the full story.
  await page.locator("[data-tag-clear]").click();
  await expect(cards).toHaveCount(total);

  // The serpentine survives the filter round-trip.
  await expect(page.locator("svg path[data-serpentine]")).toHaveCount(1);
});
