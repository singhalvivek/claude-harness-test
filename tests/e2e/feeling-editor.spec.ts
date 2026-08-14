import { test, expect, type Page } from "@playwright/test";

/**
 * slice-feeling-editor E2E against the live production server (http://localhost:8001).
 *
 * Deterministic and scoped to its own trip: the trip is seeded through the page's
 * request context (the session cookie is shared with the browser, exactly like
 * `theme-editor.spec.ts`), and every stop is located via the **Manual** tab so
 * nothing here depends on Nominatim. Titles carry a unique stamp because the DB
 * is shared across specs.
 *
 * What it proves (capabilities/feeling-cards.md → *Authoring*):
 *  1. happy path — typing a feeling and blurring autosaves it, the counter reads
 *     `n/200`, the placement toggle live-saves, and both survive a full reload;
 *  2. the **save semantics** — the blur PATCH carries ONLY `{feeling}`, the
 *     placement PATCH carries ONLY `{feelingPlacement}`, and the explicit
 *     **Save stop** PATCH carries NEITHER, so it can never clobber an autosaved
 *     feeling (asserted on the real request bodies, not just the end state);
 *  3. edge case — input is blocked at the 200-character cap;
 *  4. error/escape path — clearing the text back to blank persists as `null`,
 *     and `Hidden` keeps the text while suppressing the rendering.
 */

const PASSWORD = "letmein";
const STAMP = Date.now();

type StopState = { feeling: string | null; feelingPlacement: string };

/** Log in + create an empty trip; returns its id. */
async function seedTrip(page: Page, title: string): Promise<string> {
  const login = await page.request.post("/api/auth/login", { data: { password: PASSWORD } });
  expect(login.ok(), `login failed: ${login.status()}`).toBeTruthy();

  const res = await page.request.post("/api/trips", { data: { title } });
  expect(res.status(), await res.text()).toBe(201);
  const tripId: string = (await res.json()).id;
  expect(tripId).toBeTruthy();
  return tripId;
}

/** Read the first stop's feeling state straight from the API. */
async function readStopState(page: Page, tripId: string): Promise<StopState> {
  const res = await page.request.get(`/api/trips/${tripId}`);
  expect(res.ok(), `GET trip failed: ${res.status()}`).toBeTruthy();
  const trip = await res.json();
  expect(trip.stops.length, "expected exactly one seeded stop").toBe(1);
  return {
    feeling: trip.stops[0].feeling ?? null,
    feelingPlacement: trip.stops[0].feelingPlacement,
  };
}

/** Open the Add-stop drawer and give the new stop a manual place name. */
async function openNewStopDrawer(page: Page, placeName: string) {
  await page.getByTestId("add-stop-button").click();
  await expect(page.getByTestId("stop-panel")).toBeVisible();
  await page.getByTestId("loc-tab-manual").click();
  await page.getByTestId("manual-placename").fill(placeName);
}

/** One placement option of the segmented toggle. */
function placementOption(page: Page, id: "card" | "inline" | "none") {
  return page.locator(`[data-testid="stop-feeling-placement"][data-placement="${id}"]`);
}

/**
 * Run `action` and return the JSON body of the `PATCH /api/stops/:id` it fires.
 * Asserting on the body is the only way to prove *which* fields were sent —
 * the non-destructive-editing contract is about the request, not the result.
 */
async function patchBodyOf(
  page: Page,
  action: () => Promise<void>,
): Promise<Record<string, unknown>> {
  const isStopPatch = (url: string) => /\/api\/stops\/[^/]+$/.test(new URL(url).pathname);
  const [response] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === "PATCH" && isStopPatch(r.url())),
    action(),
  ]);
  expect(response.status(), await response.text()).toBe(200);
  const raw = response.request().postData();
  expect(raw, "PATCH /api/stops/:id sent no body").toBeTruthy();
  return JSON.parse(raw as string) as Record<string, unknown>;
}

test("feeling autosaves on blur, placement live-saves, and Save stop never clears it", async ({
  page,
}) => {
  page.on("dialog", (d) => d.accept());

  const FEELING = `Cold air, warm tea, nobody else on the ridge ${STAMP}`;
  const tripId = await seedTrip(page, `Feeling Editor E2E ${STAMP}`);

  await page.goto(`/trips/${tripId}/edit`);
  await expect(page.getByTestId("trip-title-input")).toHaveValue(`Feeling Editor E2E ${STAMP}`);

  // --- The Feeling box renders in the drawer, above the media uploader ---
  await openNewStopDrawer(page, `Ridge ${STAMP}`);

  const textarea = page.getByTestId("stop-feeling");
  await expect(textarea).toBeVisible();
  await expect(textarea).toHaveValue("");
  await expect(page.getByTestId("stop-feeling-count")).toHaveText("0/200");

  // It sits above the media uploader (ui.md → the Feeling section's placement).
  // Compared in DOM order, not by bounding box: the uploader's file input is
  // owned by another slice and may be visually hidden.
  const feelingPrecedesUploader = await textarea.evaluate((el) => {
    const uploader = document.querySelector('[data-testid="photo-file-input"]');
    if (!uploader) return null;
    // DOCUMENT_POSITION_FOLLOWING === the uploader comes after the textarea.
    return (el.compareDocumentPosition(uploader) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
  });
  expect(feelingPrecedesUploader, "photo uploader not found in the drawer").not.toBeNull();
  expect(feelingPrecedesUploader).toBe(true);

  // "What you type looks like what you get": ~20 px, and never the app chrome.
  const typeStyle = await textarea.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { fontSize: cs.fontSize, fontFamily: cs.fontFamily };
  });
  expect(typeStyle.fontSize).toBe("20px");
  expect(typeStyle.fontFamily).not.toMatch(/Fraunces/i);
  expect(typeStyle.fontFamily).not.toMatch(/Inter/i);

  // --- Type: the counter tracks live ---
  await textarea.fill(FEELING);
  await expect(page.getByTestId("stop-feeling-count")).toHaveText(`${FEELING.length}/200`);

  // --- Blur: autosaves, sending ONLY { feeling } ---
  const blurBody = await patchBodyOf(page, async () => {
    await textarea.blur();
  });
  expect(Object.keys(blurBody).sort()).toEqual(["feeling"]);
  expect(blurBody.feeling).toBe(FEELING);
  await expect(page.getByTestId("stop-feeling-status")).toHaveText("Saved ✓");

  // --- Placement: three options, `card` selected by default ---
  await expect(page.getByTestId("stop-feeling-placement")).toHaveCount(3);
  await expect(placementOption(page, "card")).toHaveAttribute("data-placement-selected", "true");

  // Clicking `inline` live-saves, sending ONLY { feelingPlacement }.
  const placementBody = await patchBodyOf(page, async () => {
    await placementOption(page, "inline").click();
  });
  expect(Object.keys(placementBody).sort()).toEqual(["feelingPlacement"]);
  expect(placementBody.feelingPlacement).toBe("inline");
  await expect(placementOption(page, "inline")).toHaveAttribute("data-placement-selected", "true");
  await expect(placementOption(page, "card")).toHaveAttribute("data-placement-selected", "false");

  // Both are persisted before anything else touches the stop.
  expect(await readStopState(page, tripId)).toEqual({
    feeling: FEELING,
    feelingPlacement: "inline",
  });

  // --- The hard constraint: `Save stop` must NEVER send feeling/placement ---
  await page.getByTestId("stop-title").fill(`Ridge title ${STAMP}`);
  const saveBody = await patchBodyOf(page, async () => {
    await page.getByTestId("stop-panel-save").click();
  });
  expect(saveBody).not.toHaveProperty("feeling");
  expect(saveBody).not.toHaveProperty("feelingPlacement");
  expect(saveBody.title).toBe(`Ridge title ${STAMP}`);
  await expect(page.getByTestId("stop-panel")).toBeHidden();

  // …and the autosaved feeling is still there afterwards.
  expect(await readStopState(page, tripId)).toEqual({
    feeling: FEELING,
    feelingPlacement: "inline",
  });

  // --- Survives a full reload, in the UI as well as the API ---
  await page.reload();
  await expect(page.getByTestId("stop-card")).toHaveCount(1);
  await page.getByTestId("stop-edit").first().click();
  await expect(page.getByTestId("stop-panel")).toBeVisible();
  await expect(page.getByTestId("stop-feeling")).toHaveValue(FEELING);
  await expect(page.getByTestId("stop-feeling-count")).toHaveText(`${FEELING.length}/200`);
  await expect(placementOption(page, "inline")).toHaveAttribute("data-placement-selected", "true");
});

test("the feeling is capped at 200 characters, can be hidden, and can be cleared", async ({
  page,
}) => {
  page.on("dialog", (d) => d.accept());

  const tripId = await seedTrip(page, `Feeling Cap E2E ${STAMP}`);
  await page.goto(`/trips/${tripId}/edit`);
  await expect(page.getByTestId("trip-title-input")).toHaveValue(`Feeling Cap E2E ${STAMP}`);

  await openNewStopDrawer(page, `Overflow ${STAMP}`);
  const textarea = page.getByTestId("stop-feeling");

  // --- Edge case: 250 characters of input are blocked at the 200 cap ---
  const LONG = "x".repeat(250);
  await textarea.fill(LONG);
  await expect(textarea).toHaveValue("x".repeat(200));
  await expect(page.getByTestId("stop-feeling-count")).toHaveText("200/200");

  const capBody = await patchBodyOf(page, async () => {
    await textarea.blur();
  });
  expect(Object.keys(capBody).sort()).toEqual(["feeling"]);
  expect((capBody.feeling as string).length).toBe(200);
  expect(await readStopState(page, tripId)).toEqual({
    feeling: "x".repeat(200),
    feelingPlacement: "card",
  });

  // --- `Hidden` keeps the words but suppresses the rendering ---
  const hiddenBody = await patchBodyOf(page, async () => {
    await placementOption(page, "none").click();
  });
  expect(Object.keys(hiddenBody).sort()).toEqual(["feelingPlacement"]);
  expect(hiddenBody.feelingPlacement).toBe("none");
  expect(await readStopState(page, tripId)).toEqual({
    feeling: "x".repeat(200),
    feelingPlacement: "none",
  });

  // --- Clearing the text back to blank persists as null (and keeps placement) ---
  await textarea.fill("   ");
  const clearBody = await patchBodyOf(page, async () => {
    await textarea.blur();
  });
  expect(Object.keys(clearBody).sort()).toEqual(["feeling"]);
  expect(clearBody.feeling).toBeNull(); // blank normalises to null before it is sent
  expect(await readStopState(page, tripId)).toEqual({ feeling: null, feelingPlacement: "none" });

  // The cleared state survives a reload, with `Hidden` still selected.
  await page.reload();
  await page.getByTestId("stop-edit").first().click();
  await expect(page.getByTestId("stop-panel")).toBeVisible();
  await expect(page.getByTestId("stop-feeling")).toHaveValue("");
  await expect(page.getByTestId("stop-feeling-count")).toHaveText("0/200");
  await expect(placementOption(page, "none")).toHaveAttribute("data-placement-selected", "true");
});
