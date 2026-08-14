import { test, expect, type Page } from "@playwright/test";

// Phase 2.6 — a feeling card can now stand BEFORE a stop, and the trip itself
// can carry an opening feeling that leads the whole story.
//
// Covers:
//   1. Trip opening feeling — PATCH /api/trips/:id { feeling } round-trips,
//      normalises blank → null, rejects > MAX_FEELING_CHARS, and is exposed on
//      the public (shared) read so a visitor sees the same first beat.
//   2. It renders as the story's FIRST beat: a [data-feeling-scope="trip"] card
//      positioned ABOVE every [data-stop-card] and above every stop feeling.
//   3. Per-stop "before" placement — stop 1's own feeling card sits ABOVE its
//      stop card, i.e. a card before the first stop; "card" still sits BELOW.
//   4. Both are additive: a trip with neither renders exactly the beats it did
//      before (no stray feeling cards, no extra track height).
//   5. No overlap once a leading beat shifts the whole side-alternation.

const PASSWORD = "letmein";
const MAX_FEELING_CHARS = 200;

const TRIP_FEELING = "We left in the rain and never once looked back.";
const BEFORE_FEELING = "Nervous, and far too early for the train.";
const AFTER_FEELING = "Then the quiet afterwards, which we had not expected.";

async function login(page: Page): Promise<void> {
  const res = await page.request.post("/api/auth/login", { data: { password: PASSWORD } });
  expect(res.ok(), `login failed: ${res.status()}`).toBeTruthy();
}

/**
 * A trip with an opening feeling plus two stops: stop 1's feeling LEADS
 * ("before"), stop 2's TRAILS ("card"). Beats should therefore be:
 *   [tripFeeling, feeling(stop1), stop1, stop2, feeling(stop2)]
 */
async function seedOpeningTrip(
  page: Page,
  opts: { tripFeeling?: string | null } = {},
): Promise<string> {
  await login(page);

  const tripRes = await page.request.post("/api/trips", {
    data: { title: `Opening beat ${Date.now()}`, description: "Phase 2.6 fixture." },
  });
  expect(tripRes.status(), await tripRes.text()).toBe(201);
  const tripId: string = (await tripRes.json()).id;

  const tripFeeling = opts.tripFeeling === undefined ? TRIP_FEELING : opts.tripFeeling;
  if (tripFeeling !== null) {
    const patch = await page.request.patch(`/api/trips/${tripId}`, {
      data: { feeling: tripFeeling },
    });
    expect(patch.ok(), await patch.text()).toBeTruthy();
    expect((await patch.json()).feeling).toBe(tripFeeling);
  }

  const stops = [
    { title: "Departure", feeling: BEFORE_FEELING, feelingPlacement: "before" },
    { title: "Arrival", feeling: AFTER_FEELING, feelingPlacement: "card" },
  ];
  for (let i = 0; i < stops.length; i++) {
    const s = stops[i];
    const res = await page.request.post(`/api/trips/${tripId}/stops`, {
      data: {
        title: s.title,
        placeName: "Kyoto, Japan",
        lat: 35.0116,
        lng: 135.7681,
        locationPrecision: "exact",
        occurredAt: new Date(Date.UTC(2026, 4, 1 + i, 9, 30)).toISOString(),
        body: "Body text.",
        feeling: s.feeling,
        feelingPlacement: s.feelingPlacement,
      },
    });
    expect(res.status(), await res.text()).toBe(201);
    const stop = await res.json();
    // The widened enum must be accepted by the CREATE route, not just PATCH.
    expect(stop.feelingPlacement).toBe(s.feelingPlacement);
    expect(stop.feeling).toBe(s.feeling);
  }
  return tripId;
}

/** Every card on the path, top-first, tagged with what it is. */
async function cardsTopFirst(page: Page) {
  return page.evaluate(() => {
    const out: { kind: string; scope: string | null; top: number; bottom: number; text: string }[] =
      [];
    for (const el of Array.from(document.querySelectorAll("[data-stop-card],[data-feeling-card]"))) {
      const r = (el as HTMLElement).getBoundingClientRect();
      out.push({
        kind: el.hasAttribute("data-feeling-card") ? "feeling" : "stop",
        scope: el.getAttribute("data-feeling-scope"),
        top: r.top + window.scrollY,
        bottom: r.bottom + window.scrollY,
        text: (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 80),
      });
    }
    return out.sort((a, b) => a.top - b.top);
  });
}

/** Scroll the whole page so every whileInView card has mounted + settled. */
async function revealAll(page: Page): Promise<void> {
  await page.waitForSelector("[data-stop-card]");
  const height = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < height; y += 400) {
    await page.evaluate((to) => window.scrollTo(0, to), y);
    await page.waitForTimeout(60);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(250);
}

test("trip opening feeling round-trips, normalises blank, and rejects overlong", async ({
  page,
}) => {
  await login(page);
  const tripRes = await page.request.post("/api/trips", {
    data: { title: `Trip feeling API ${Date.now()}` },
  });
  expect(tripRes.status()).toBe(201);
  const tripId: string = (await tripRes.json()).id;

  // Absent by default — a brand-new trip has no opening feeling.
  const initial = await page.request.get(`/api/trips/${tripId}`);
  expect((await initial.json()).feeling).toBeNull();

  // Set it.
  const set = await page.request.patch(`/api/trips/${tripId}`, {
    data: { feeling: `  ${TRIP_FEELING}  ` },
  });
  expect(set.ok(), await set.text()).toBeTruthy();
  expect((await set.json()).feeling).toBe(TRIP_FEELING); // trimmed

  // Untouched by an unrelated PATCH (non-destructive).
  await page.request.patch(`/api/trips/${tripId}`, { data: { title: "Renamed" } });
  expect((await (await page.request.get(`/api/trips/${tripId}`)).json()).feeling).toBe(
    TRIP_FEELING,
  );

  // Blank clears it to null rather than storing whitespace.
  const cleared = await page.request.patch(`/api/trips/${tripId}`, { data: { feeling: "   " } });
  expect(cleared.ok()).toBeTruthy();
  expect((await cleared.json()).feeling).toBeNull();

  // Overlong is a 400, not a silent truncation.
  const tooLong = await page.request.patch(`/api/trips/${tripId}`, {
    data: { feeling: "x".repeat(MAX_FEELING_CHARS + 1) },
  });
  expect(tooLong.status()).toBe(400);
});

test("the trip's opening feeling is the story's FIRST beat, above every stop", async ({ page }) => {
  const tripId = await seedOpeningTrip(page);
  await page.goto(`/trips/${tripId}/story`);
  await revealAll(page);

  const cards = await cardsTopFirst(page);

  // The very first card on the page is the trip-scoped feeling card.
  expect(cards.length).toBeGreaterThanOrEqual(5);
  expect(cards[0].kind).toBe("feeling");
  expect(cards[0].scope).toBe("trip");
  expect(cards[0].text).toContain("We left in the rain");

  // Exactly one trip-scoped card exists.
  expect(cards.filter((c) => c.scope === "trip")).toHaveLength(1);

  // It sits above EVERY stop card and every stop feeling.
  const firstStopTop = Math.min(...cards.filter((c) => c.kind === "stop").map((c) => c.top));
  expect(cards[0].bottom).toBeLessThanOrEqual(firstStopTop);
});

test('a stop\'s "before" feeling leads its stop; "card" still trails', async ({ page }) => {
  const tripId = await seedOpeningTrip(page, { tripFeeling: null });
  await page.goto(`/trips/${tripId}/story`);
  await revealAll(page);

  const cards = await cardsTopFirst(page);
  // No trip feeling this time, so the FIRST card is stop 1's leading feeling —
  // a feeling card before the first stop.
  expect(cards[0].kind).toBe("feeling");
  expect(cards[0].scope).toBe("stop");
  expect(cards[0].text).toContain("Nervous");

  const stopTops = cards.filter((c) => c.kind === "stop").map((c) => c.top);
  const leading = cards.find((c) => c.text.includes("Nervous"))!;
  const trailing = cards.find((c) => c.text.includes("quiet afterwards"))!;

  // Leading feeling is above the first stop card…
  expect(leading.bottom).toBeLessThanOrEqual(Math.min(...stopTops));
  // …and the trailing one is below the last stop card.
  expect(trailing.top).toBeGreaterThanOrEqual(Math.max(...stopTops));
});

test("a leading beat does not make any two cards overlap", async ({ page }) => {
  const tripId = await seedOpeningTrip(page);
  await page.goto(`/trips/${tripId}/story`);
  await revealAll(page);

  const boxes = await page.evaluate(() =>
    Array.from(document.querySelectorAll("[data-stop-card],[data-feeling-card]")).map((el) => {
      const r = (el as HTMLElement).getBoundingClientRect();
      return { x: r.left, y: r.top + window.scrollY, w: r.width, h: r.height };
    }),
  );
  expect(boxes.length).toBeGreaterThanOrEqual(5);

  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      const overlaps =
        a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
      expect(
        overlaps,
        `cards ${i} and ${j} overlap: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`,
      ).toBe(false);
    }
  }
});

test("a trip with no feelings anywhere renders no feeling cards at all", async ({ page }) => {
  await login(page);
  const tripRes = await page.request.post("/api/trips", {
    data: { title: `No feelings ${Date.now()}` },
  });
  const tripId: string = (await tripRes.json()).id;
  for (let i = 0; i < 2; i++) {
    const res = await page.request.post(`/api/trips/${tripId}/stops`, {
      data: {
        title: `Stop ${i + 1}`,
        placeName: "Kyoto, Japan",
        lat: 35.0116,
        lng: 135.7681,
        locationPrecision: "exact",
        body: "No feeling here.",
      },
    });
    expect(res.status()).toBe(201);
  }

  await page.goto(`/trips/${tripId}/story`);
  await revealAll(page);

  await expect(page.locator("[data-feeling-card]")).toHaveCount(0);
  await expect(page.locator("[data-feeling-inline]")).toHaveCount(0);
  await expect(page.locator("[data-stop-card]")).toHaveCount(2);
  // The signature serpentine is still there and still drawing.
  await expect(page.locator("svg path[data-serpentine]")).toBeVisible();
});

test("a published trip's opening feeling reaches the PUBLIC reader", async ({ page, browser }) => {
  const tripId = await seedOpeningTrip(page);
  const pub = await page.request.post(`/api/trips/${tripId}/publish`);
  expect(pub.ok(), await pub.text()).toBeTruthy();
  // The publish route returns { shareUrl } (not a bare slug) — take the last
  // path segment, which is what /s/:slug and /api/public/trips/:slug want.
  const shareUrl: string = (await pub.json()).shareUrl;
  expect(shareUrl, "publish should return a shareUrl").toBeTruthy();
  const slug = shareUrl.split("/").filter(Boolean).pop()!;
  expect(slug).toBeTruthy();

  // A fresh context with NO session cookie — a real visitor.
  const ctx = await browser.newContext();
  try {
    const api = await ctx.request.get(`/api/public/trips/${slug}`);
    expect(api.ok(), await api.text()).toBeTruthy();
    expect((await api.json()).feeling).toBe(TRIP_FEELING);

    const visitor = await ctx.newPage();
    await visitor.goto(`/s/${slug}`);
    await visitor.waitForSelector("[data-stop-card]");
    const opening = visitor.locator('[data-feeling-card][data-feeling-scope="trip"]');
    await expect(opening).toHaveCount(1);
    await expect(opening).toContainText("We left in the rain");
    // Still read-only.
    await expect(visitor.locator("text=Add stop")).toHaveCount(0);
    await visitor.close();
  } finally {
    await ctx.close();
  }
});

test("the editor saves a trip opening feeling and it persists across reload", async ({ page }) => {
  await login(page);
  const tripRes = await page.request.post("/api/trips", {
    data: { title: `Editor opening ${Date.now()}` },
  });
  const tripId: string = (await tripRes.json()).id;

  await page.goto(`/trips/${tripId}/edit`);
  const input = page.getByTestId("trip-feeling-input");
  await expect(input).toBeVisible();
  await input.fill(TRIP_FEELING);
  await input.blur();

  // Persisted server-side…
  await expect
    .poll(async () => (await (await page.request.get(`/api/trips/${tripId}`)).json()).feeling)
    .toBe(TRIP_FEELING);

  // …and still shown after a reload.
  await page.reload();
  await expect(page.getByTestId("trip-feeling-input")).toHaveValue(TRIP_FEELING);
});

test('the editor offers a "before" placement that persists', async ({ page }) => {
  await login(page);
  const tripRes = await page.request.post("/api/trips", {
    data: { title: `Editor before ${Date.now()}` },
  });
  const tripId: string = (await tripRes.json()).id;
  const stopRes = await page.request.post(`/api/trips/${tripId}/stops`, {
    data: {
      title: "Only stop",
      placeName: "Kyoto, Japan",
      lat: 35.0116,
      lng: 135.7681,
      locationPrecision: "exact",
      feeling: BEFORE_FEELING,
      feelingPlacement: "card",
    },
  });
  const stopId: string = (await stopRes.json()).id;

  await page.goto(`/trips/${tripId}/edit`);
  // Open the stop so its feeling editor is on screen.
  await page.getByTestId("stop-edit").first().click();

  const before = page.getByRole("button", { name: /before this stop/i }).first();
  await expect(before).toBeVisible();
  await before.click();

  await expect
    .poll(async () => {
      const trip = await (await page.request.get(`/api/trips/${tripId}`)).json();
      return trip.stops.find((s: { id: string }) => s.id === stopId)?.feelingPlacement;
    })
    .toBe("before");
});
