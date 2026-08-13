import { test, expect } from "@playwright/test";

/**
 * slice-theme-editor E2E against the live production server (http://localhost:8001).
 *
 * Deterministic and scoped to a unique trip: the trip is seeded via the page's
 * own request context (so the session cookie is shared with the browser, exactly
 * like story.spec.ts). Asserts the Story-theme picker renders all four options,
 * defaults to `cinematic`, live-saves a non-default pick, and persists it across
 * a full reload — verified both in the UI and via `GET /api/trips/:id`.
 */

const PASSWORD = "letmein";
const THEMES = ["cinematic", "editorial", "minimal", "vintage"] as const;

test("owner picks a story theme in the editor and it persists across reload", async ({ page }) => {
  // --- Seed a trip via the API (cookies land in the page's browser context) ---
  const login = await page.request.post("/api/auth/login", {
    data: { password: PASSWORD },
  });
  expect(login.ok(), `login failed: ${login.status()}`).toBeTruthy();

  const tripRes = await page.request.post("/api/trips", {
    data: { title: `Theme Editor E2E ${Date.now()}` },
  });
  expect(tripRes.status(), await tripRes.text()).toBe(201);
  const tripId: string = (await tripRes.json()).id;
  expect(tripId).toBeTruthy();

  // --- Open the editor (authenticated via the shared session cookie) ---
  await page.goto(`/trips/${tripId}/edit`);
  await expect(page).toHaveURL(new RegExp(`/trips/${tripId}/edit`));

  // The picker and all four options render.
  await expect(page.getByTestId("theme-picker")).toBeVisible();
  for (const id of THEMES) {
    await expect(page.getByTestId(`theme-option-${id}`)).toBeVisible();
  }

  // Default selection is cinematic (a trip created without a theme).
  await expect(page.getByTestId("theme-option-cinematic")).toHaveAttribute(
    "data-theme-selected",
    "true",
  );

  // --- Pick a non-default theme: vintage ---
  await page.getByTestId("theme-option-vintage").click();

  // Optimistic highlight flips immediately; the previous default deselects.
  await expect(page.getByTestId("theme-option-vintage")).toHaveAttribute(
    "data-theme-selected",
    "true",
  );
  await expect(page.getByTestId("theme-option-cinematic")).toHaveAttribute(
    "data-theme-selected",
    "false",
  );

  // The shared save indicator reaches "Saved ✓" once the PATCH + refresh settle.
  await expect(page.getByTestId("save-indicator")).toHaveText("Saved ✓");

  // --- Reload the page: the choice persists (read back from Trip.theme) ---
  await page.reload();
  await expect(page.getByTestId("theme-picker")).toBeVisible();
  await expect(page.getByTestId("theme-option-vintage")).toHaveAttribute(
    "data-theme-selected",
    "true",
  );
  await expect(page.getByTestId("theme-option-cinematic")).toHaveAttribute(
    "data-theme-selected",
    "false",
  );

  // --- The API confirms the persisted theme ---
  const persisted = await page.request.get(`/api/trips/${tripId}`);
  expect(persisted.ok(), `GET trip failed: ${persisted.status()}`).toBeTruthy();
  expect((await persisted.json()).theme).toBe("vintage");
});
