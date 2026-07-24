import { test, expect, type Page } from "@playwright/test";
import sharp from "sharp";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * slice-editor UI smoke against the live production server (http://localhost:8001).
 * Deterministic: locations are set via the Manual tab (no Nominatim dependency),
 * and a real JPEG is generated with sharp at runtime for the photo upload.
 * Assertions are scoped to the trip this spec creates (the DB is shared across
 * specs) via a unique title + unique stop place-names.
 */

const STAMP = Date.now();
const TRIP_TITLE = `Editor E2E ${STAMP}`;
const PLACE_A = `Alpha ${STAMP}`;
const PLACE_B = `Beta ${STAMP}`;
const PLACE_C = `Gamma ${STAMP}`;

/** Generate a real ~1200x800 JPEG on disk and return its path. */
async function makeJpeg(): Promise<string> {
  const buffer = await sharp({
    create: {
      width: 1200,
      height: 800,
      channels: 3,
      background: { r: 198, g: 116, b: 62 },
    },
  })
    .jpeg({ quality: 82 })
    .toBuffer();
  const dir = mkdtempSync(join(tmpdir(), "wl-editor-e2e-"));
  const file = join(dir, `photo-${STAMP}.jpg`);
  writeFileSync(file, buffer);
  return file;
}

/** Open the Add-Stop drawer, pick Manual, set a place name (+ optional coords). */
async function addStopViaManual(
  page: Page,
  placeName: string,
  coords?: { lat: string; lng: string },
) {
  await page.getByTestId("add-stop-button").click();
  await expect(page.getByTestId("stop-panel")).toBeVisible();
  await page.getByTestId("loc-tab-manual").click();
  await page.getByTestId("manual-placename").fill(placeName);
  if (coords) {
    await page.getByTestId("manual-lat").fill(coords.lat);
    await page.getByTestId("manual-lng").fill(coords.lng);
  }
}

test("owner can log in, author a trip with stops/photos, and reorder", async ({ page }) => {
  // Never let a stray confirm() block the run (none expected on this path).
  page.on("dialog", (d) => d.accept());

  // 1. Unauthenticated visit to home is redirected to /login by middleware.
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);

  // Dev-default warning banner is visible (no OWNER_PASSWORD set).
  await expect(page.getByTestId("dev-default-banner")).toBeVisible();

  // 2. Styled-CSS assertion: the login button has a real (expanded) Tailwind
  //    background — proves the CSS bundle is not an unexpanded @tailwind.
  const loginBtn = page.getByTestId("login-submit");
  const bg = await loginBtn.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg).not.toBe("rgba(0, 0, 0, 0)");
  expect(bg).not.toBe("transparent");

  // 3. Log in with the dev password → land on the owner home.
  await page.getByTestId("login-password").fill("letmein");
  await loginBtn.click();
  await page.waitForURL((url) => url.pathname === "/");

  // 4. Create a new trip.
  await page.getByTestId("new-trip-button").click();
  await page.waitForURL((url) => url.pathname === "/trips/new");
  await page.getByTestId("new-trip-title").fill(TRIP_TITLE);
  await page.getByTestId("new-trip-create").click();
  await page.waitForURL(/\/trips\/[^/]+\/edit$/);
  await expect(page.getByTestId("trip-title-input")).toHaveValue(TRIP_TITLE);

  // 5. First stop: Manual location + date/time + a real photo + caption.
  await addStopViaManual(page, PLACE_A, { lat: "35.0116", lng: "135.7681" });
  await page.getByTestId("stop-occurred-at").fill("2026-05-01T09:30");

  const jpegPath = await makeJpeg();
  await page.getByTestId("photo-file-input").setInputFiles(jpegPath);

  // A gallery thumbnail <img> renders and actually loads (streamed via /api/media).
  const thumb = page.getByTestId("photo-thumb").first();
  await expect(thumb).toBeVisible();
  await expect
    .poll(async () => thumb.evaluate((el) => (el as HTMLImageElement).naturalWidth), {
      timeout: 20_000,
    })
    .toBeGreaterThan(0);

  await page.getByTestId("photo-caption").first().fill("Torii gate at dusk");
  await page.getByTestId("photo-caption").first().blur();

  await page.getByTestId("stop-panel-save").click();
  await expect(page.getByTestId("stop-panel")).toBeHidden();
  await expect(page.getByTestId("stop-card")).toHaveCount(1);

  // 6. Two more stops (place-name only) → three total.
  await addStopViaManual(page, PLACE_B);
  await page.getByTestId("stop-panel-save").click();
  await expect(page.getByTestId("stop-panel")).toBeHidden();

  await addStopViaManual(page, PLACE_C);
  await page.getByTestId("stop-panel-save").click();
  await expect(page.getByTestId("stop-panel")).toBeHidden();

  await expect(page.getByTestId("stop-card")).toHaveCount(3);

  // Order is [Alpha, Beta, Gamma] by creation order.
  const namesBefore = await page.getByTestId("stop-place-name").allTextContents();
  expect(namesBefore[0]).toContain("Alpha");
  expect(namesBefore[1]).toContain("Beta");

  // 7. Reorder: push the first stop down and assert the visible order changed.
  await page.getByTestId("stop-move-down").first().click();
  await expect
    .poll(async () => {
      const t = await page.getByTestId("stop-place-name").first().textContent();
      return t ?? "";
    })
    .toContain("Beta");

  const namesAfter = await page.getByTestId("stop-place-name").allTextContents();
  expect(namesAfter[0]).toContain("Beta");
  expect(namesAfter[1]).toContain("Alpha");

  // ↑ also works: move Alpha (now index 1) back up.
  await page.getByTestId("stop-move-up").nth(1).click();
  await expect
    .poll(async () => {
      const t = await page.getByTestId("stop-place-name").first().textContent();
      return t ?? "";
    })
    .toContain("Alpha");

  // 8. A labelled "coming soon" stub is visible and inert (a non-interactive span).
  const stub = page.getByTestId("map-overview-coming-soon");
  await expect(stub).toBeVisible();
  await expect(stub).toContainText(/coming soon/i);
  expect(await stub.evaluate((el) => el.tagName.toLowerCase())).toBe("span");
});
