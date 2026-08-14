import { test, expect, type Page } from "@playwright/test";

// Phase 2.5 — Feeling cards on the story (slice-story-feeling).
//
// Covers the three roadmap bullets:
//   1. Feeling cards — "card" renders a standalone [data-feeling-card] that is
//      NOT inside any stop card; "inline" renders [data-stop-card]
//      [data-feeling-inline] and contributes NO standalone card; both survive a
//      reload (persistence).
//   2. Four distinct themed faces — each theme's [data-feeling-quote] resolves
//      to ITS specified webfont (really loaded, not a metrics fallback), the
//      four families are pairwise different and never Fraunces/Inter, and each
//      carries a deliberate, distinct colour treatment. Re-checked on the
//      inline pull-quote.
//   3. Geometry with feeling beats interleaved — in ALL FOUR themes the
//      serpentine still draws on scroll, the marker still travels, and NO TWO
//      bounding boxes intersect across the combined [data-stop-card] +
//      [data-feeling-card] set (0px tolerance).

const PASSWORD = "letmein";

const THEMES = ["cinematic", "editorial", "minimal", "vintage"] as const;
type Theme = (typeof THEMES)[number];

/**
 * The four expected feeling faces — the SINGLE place the family names are
 * written down. The `[_ ]` alternation is REQUIRED: `next/font` emits hashed
 * families like `__Playfair_Display_a1b2c3`, not `Playfair Display`.
 */
const FEELING_FACE: Record<Theme, RegExp> = {
  cinematic: /Playfair[_ ]Display/i,
  editorial: /Bodoni[_ ]Moda/i,
  minimal: /Space[_ ]Grotesk/i,
  vintage: /Caveat/i,
};

/**
 * A trip that INTERLEAVES both placements across several stops — the mixed
 * layout is where collisions actually surface, not a uniform one. 6 stops →
 * 9 beats (3 standalone feeling cards) with two inline pull-quotes and one
 * feeling-free stop mixed in.
 */
const SEED_STOPS: Array<{
  title: string;
  placeName: string;
  lat: number;
  lng: number;
  body: string;
  feeling: string | null;
  feelingPlacement: "card" | "inline" | "none";
}> = [
  {
    title: "Arrival",
    placeName: "Kyoto, Japan",
    lat: 35.0116,
    lng: 135.7681,
    body: "Stepped off the train into lantern light.",
    feeling: "The whole city smelled of rain and cedar.",
    feelingPlacement: "card",
  },
  {
    title: "Temple morning",
    placeName: "Fushimi Inari, Kyoto",
    lat: 34.9671,
    lng: 135.7727,
    body: "Ten thousand vermilion gates climbing the hill.",
    feeling: "I stopped counting the gates and just kept climbing.",
    feelingPlacement: "inline",
  },
  {
    title: "Bamboo hour",
    placeName: "Arashiyama, Kyoto",
    lat: 35.0094,
    lng: 135.6668,
    body: "Green light, and a sound like the sea overhead.",
    // Deliberately NOT a copy of `body`: the spec asserts a "card" feeling's
    // text never appears inside a [data-stop-card], so it must be a string that
    // exists nowhere else on the page.
    feeling: "Somewhere above me the whole grove was breathing.",
    feelingPlacement: "card",
  },
  {
    title: "The quiet street",
    placeName: "Gion, Kyoto",
    lat: 35.0037,
    lng: 135.7752,
    body: "Wooden fronts, one lit window, nobody about.",
    // No feeling at all: this stop must render exactly as before.
    feeling: null,
    feelingPlacement: "card",
  },
  {
    title: "River evening",
    placeName: "Kamo River, Kyoto",
    lat: 35.0116,
    lng: 135.7727,
    body: "Everyone sat on the bank, spaced exactly the same.",
    feeling: "Everyone sat exactly the same distance apart. Nobody arranged it.",
    feelingPlacement: "inline",
  },
  {
    title: "Last supper",
    placeName: "Pontocho Alley, Kyoto",
    lat: 35.0037,
    lng: 135.7709,
    body: "River breeze, grilled skewers, one more toast.",
    feeling: "One more toast, and then the long way home.",
    feelingPlacement: "card",
  },
];

const CARD_STOPS = SEED_STOPS.filter((s) => s.feeling && s.feelingPlacement === "card");
const INLINE_STOPS = SEED_STOPS.filter((s) => s.feeling && s.feelingPlacement === "inline");

/** Seed a fresh authenticated trip with the interleaved feeling placements. */
async function seedFeelingTrip(page: Page): Promise<string> {
  const login = await page.request.post("/api/auth/login", { data: { password: PASSWORD } });
  expect(login.ok(), `login failed: ${login.status()}`).toBeTruthy();

  const tripRes = await page.request.post("/api/trips", {
    data: {
      title: `Kyoto Feelings ${Date.now()}`,
      description: "Six stops, three of them with a feeling of their own.",
    },
  });
  expect(tripRes.status(), await tripRes.text()).toBe(201);
  const tripId: string = (await tripRes.json()).id;
  expect(tripId).toBeTruthy();

  for (let i = 0; i < SEED_STOPS.length; i++) {
    const s = SEED_STOPS[i];
    const stopRes = await page.request.post(`/api/trips/${tripId}/stops`, {
      data: {
        title: s.title,
        placeName: s.placeName,
        lat: s.lat,
        lng: s.lng,
        locationPrecision: "exact",
        occurredAt: new Date(Date.UTC(2026, 4, 1 + i, 9, 30)).toISOString(),
        body: s.body,
        feeling: s.feeling,
        feelingPlacement: s.feelingPlacement,
      },
    });
    expect(stopRes.status(), await stopRes.text()).toBe(201);
    const stop = await stopRes.json();
    // The API round-trips what we asked for (blank feelings normalise to null).
    expect(stop.feeling).toBe(s.feeling);
    expect(stop.feelingPlacement).toBe(s.feelingPlacement);
  }

  return tripId;
}

async function setTheme(page: Page, tripId: string, theme: Theme): Promise<void> {
  const patch = await page.request.patch(`/api/trips/${tripId}`, { data: { theme } });
  expect(patch.ok(), await patch.text()).toBeTruthy();
  expect((await patch.json()).theme).toBe(theme);
}

/** Read the translateY (px) out of an element's computed transform matrix. */
async function markerTranslateY(page: Page): Promise<number> {
  return page.locator("[data-story-marker]").evaluate((el) => {
    const t = getComputedStyle(el as Element).transform;
    if (!t || t === "none") return 0;
    const m2 = t.match(/matrix\(([^)]+)\)/);
    if (m2) return Number(m2[1].split(",")[5]);
    const m3 = t.match(/matrix3d\(([^)]+)\)/);
    if (m3) return Number(m3[1].split(",")[13]);
    return 0;
  });
}

interface CardRect {
  kind: "stop" | "feeling";
  label: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
  opacity: number;
}

/**
 * Step-scroll the whole page (instant jumps, so `scroll-behavior: smooth` can
 * never leave us mid-flight) so EVERY `whileInView` card enters and settles at
 * its final transform, then return every card's rect in DOCUMENT coordinates.
 */
async function enterEveryCardAndCollectRects(page: Page): Promise<CardRect[]> {
  const step = await page.evaluate(() => Math.floor(window.innerHeight * 0.7));
  const total = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y <= total; y += step) {
    await page.evaluate((yy) => window.scrollTo({ top: yy, behavior: "instant" as ScrollBehavior }), y);
    await page.waitForTimeout(160);
  }
  await page.evaluate(() =>
    window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" as ScrollBehavior }),
  );
  // Let the last entrance animations finish before measuring.
  await page.waitForTimeout(1200);

  return page.evaluate(() => {
    const els = Array.from(
      document.querySelectorAll("[data-stop-card], [data-feeling-card]"),
    ) as HTMLElement[];
    const sx = window.scrollX;
    const sy = window.scrollY;
    return els.map((el) => {
      const r = el.getBoundingClientRect();
      const isFeeling = el.hasAttribute("data-feeling-card");
      return {
        kind: (isFeeling ? "feeling" : "stop") as "stop" | "feeling",
        label: (el.textContent ?? "").trim().slice(0, 40),
        left: r.left + sx,
        top: r.top + sy,
        right: r.right + sx,
        bottom: r.bottom + sy,
        opacity: parseFloat(getComputedStyle(el).opacity),
      };
    });
  });
}

/** Pairwise rectangle intersection with a 0px tolerance. */
function intersects(a: CardRect, b: CardRect): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

interface QuoteStyle {
  fontFamily: string;
  firstFamily: string;
  color: string;
  backgroundImage: string;
  fontSize: number;
  webfontLoaded: boolean;
}

/** Read the computed feeling-face state off a `[data-feeling-quote]`. */
async function readQuoteStyle(page: Page, selector: string): Promise<QuoteStyle> {
  return page.locator(selector).first().evaluate(async (el) => {
    await document.fonts.ready;
    const cs = getComputedStyle(el as Element);
    const firstFamily = cs.fontFamily.split(",")[0].trim().replace(/^["']|["']$/g, "");
    return {
      fontFamily: cs.fontFamily,
      firstFamily,
      color: cs.color,
      backgroundImage: cs.backgroundImage,
      fontSize: parseFloat(cs.fontSize),
      // The REAL webfont must be loaded — the family name is hashed by
      // next/font, so it has to be read off the element, never hard-coded.
      webfontLoaded: document.fonts.check(`40px "${firstFamily}"`),
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────

test("feeling placements render in the right place and survive a reload", async ({ page }) => {
  const tripId = await seedFeelingTrip(page);
  await page.goto(`/trips/${tripId}/story`);

  const feelingCards = page.locator("[data-feeling-card]");
  const inlineQuotes = page.locator("[data-stop-card] [data-feeling-inline]");

  for (const pass of ["first load", "after reload"] as const) {
    // Exactly one standalone card per "card" stop, one pull-quote per "inline"
    // stop — and the feeling-free stop contributes neither.
    await expect(feelingCards, `${pass}: one [data-feeling-card] per card stop`).toHaveCount(
      CARD_STOPS.length,
    );
    await expect(inlineQuotes, `${pass}: one inline pull-quote per inline stop`).toHaveCount(
      INLINE_STOPS.length,
    );

    // Each "card" feeling's TEXT is on a standalone card that is NOT inside a
    // stop card, and appears nowhere inside one.
    for (const s of CARD_STOPS) {
      const card = feelingCards.filter({ hasText: s.feeling! });
      await expect(card, `${pass}: "${s.title}" has its own feeling card`).toHaveCount(1);
      const escapedInside = await card.evaluate(
        (el) => el.closest("[data-stop-card]") === null,
      );
      expect(escapedInside, `${pass}: "${s.title}" feeling card is NOT inside a stop card`).toBe(
        true,
      );
      await expect(
        page.locator("[data-stop-card]").filter({ hasText: s.feeling! }),
        `${pass}: "${s.title}" feeling text never appears inside a stop card`,
      ).toHaveCount(0);
    }

    // Each "inline" feeling's text is inside a stop card, and contributes NO
    // standalone feeling card.
    for (const s of INLINE_STOPS) {
      await expect(
        page.locator("[data-stop-card] [data-feeling-inline]").filter({ hasText: s.feeling! }),
        `${pass}: "${s.title}" renders an inline pull-quote inside its stop card`,
      ).toHaveCount(1);
      await expect(
        feelingCards.filter({ hasText: s.feeling! }),
        `${pass}: "${s.title}" contributes no standalone feeling card`,
      ).toHaveCount(0);
    }

    // The quote text node hook exists in BOTH placements.
    await expect(page.locator("[data-feeling-card] [data-feeling-quote]")).toHaveCount(
      CARD_STOPS.length,
    );
    await expect(page.locator("[data-feeling-inline] [data-feeling-quote]")).toHaveCount(
      INLINE_STOPS.length,
    );

    if (pass === "first load") await page.reload();
  }

  // A stop with no feeling renders exactly as before: still a stop card, with
  // no feeling markup of any kind inside it.
  // The card renders `placeName ?? title`, so match on the place, not the title.
  const plainCard = page.locator("[data-stop-card]").filter({ hasText: "Gion, Kyoto" });
  await expect(plainCard).toHaveCount(1);
  await expect(plainCard.locator("[data-feeling-inline]")).toHaveCount(0);
  await expect(plainCard.locator("[data-feeling-quote]")).toHaveCount(0);
});

test("each theme renders the feeling quote in its own real webfont and colour treatment", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const tripId = await seedFeelingTrip(page);

  const standalone: Record<string, QuoteStyle> = {};
  const inline: Record<string, QuoteStyle> = {};

  for (const theme of THEMES) {
    await setTheme(page, tripId, theme);
    await page.goto(`/trips/${tripId}/story`);
    await expect(page.locator(`[data-theme="${theme}"]`)).toHaveCount(1);
    await expect(page.locator("[data-feeling-card]").first()).toHaveCount(1);

    // Poll: `display: swap` means the real face can land a tick after paint.
    await expect
      .poll(
        async () =>
          (await readQuoteStyle(page, "[data-feeling-card] [data-feeling-quote]")).webfontLoaded,
        { timeout: 20_000, message: `theme=${theme}: the feeling webfont loads` },
      )
      .toBe(true);

    const q = await readQuoteStyle(page, "[data-feeling-card] [data-feeling-quote]");
    standalone[theme] = q;

    // The face is the one this theme specifies.
    expect(q.fontFamily, `theme=${theme}: font-family matches its specified face`).toMatch(
      FEELING_FACE[theme],
    );
    // …and it is the REAL webfont, not next/font's metrics fallback.
    expect(q.firstFamily, `theme=${theme}: first family is not a metrics fallback`).not.toContain(
      "Fallback",
    );
    expect(q.webfontLoaded, `theme=${theme}: document.fonts.check("${q.firstFamily}")`).toBe(true);
    // Never the app chrome.
    expect(q.fontFamily, `theme=${theme}: not Fraunces`).not.toMatch(/Fraunces/i);
    expect(q.fontFamily, `theme=${theme}: not Inter`).not.toMatch(/Inter/i);

    // A deliberate colour treatment: a gradient ink, or a themed solid ink that
    // is neither pure black nor pure white.
    const deliberate =
      q.backgroundImage !== "none" &&
      q.backgroundImage.length > 0
        ? true
        : q.color !== "rgb(0, 0, 0)" && q.color !== "rgb(255, 255, 255)";
    expect(deliberate, `theme=${theme}: deliberate colour treatment (got ${q.color} / ${q.backgroundImage})`).toBe(
      true,
    );

    // The inline pull-quote uses the SAME face at a smaller size.
    const inlineQ = await readQuoteStyle(page, "[data-feeling-inline] [data-feeling-quote]");
    inline[theme] = inlineQ;
    expect(inlineQ.fontFamily, `theme=${theme}: inline uses its specified face`).toMatch(
      FEELING_FACE[theme],
    );
    expect(inlineQ.firstFamily, `theme=${theme}: inline is not a metrics fallback`).not.toContain(
      "Fallback",
    );
    expect(inlineQ.webfontLoaded, `theme=${theme}: inline webfont loaded`).toBe(true);
    expect(inlineQ.fontFamily, `theme=${theme}: inline is not Fraunces`).not.toMatch(/Fraunces/i);
    expect(inlineQ.fontFamily, `theme=${theme}: inline is not Inter`).not.toMatch(/Inter/i);
    expect(
      inlineQ.firstFamily,
      `theme=${theme}: one face per theme — inline matches the standalone card`,
    ).toBe(q.firstFamily);
    expect(inlineQ.fontSize, `theme=${theme}: inline sets smaller than the standalone card`).toBeLessThan(
      q.fontSize,
    );
    const inlineDeliberate =
      inlineQ.backgroundImage !== "none" && inlineQ.backgroundImage.length > 0
        ? true
        : inlineQ.color !== "rgb(0, 0, 0)" && inlineQ.color !== "rgb(255, 255, 255)";
    expect(inlineDeliberate, `theme=${theme}: inline has a deliberate colour treatment`).toBe(true);
  }

  // The four faces are pairwise DIFFERENT — four type classes, not four
  // flavours of one idea.
  const families = THEMES.map((t) => standalone[t].firstFamily);
  expect(new Set(families).size, `four distinct faces, got ${families.join(" | ")}`).toBe(4);

  // …and the four colour treatments are pairwise distinct too.
  const treatments = THEMES.map((t) => `${standalone[t].color}::${standalone[t].backgroundImage}`);
  expect(
    new Set(treatments).size,
    `four distinct colour treatments, got:\n${treatments.join("\n")}`,
  ).toBe(4);

  const inlineTreatments = THEMES.map((t) => `${inline[t].color}::${inline[t].backgroundImage}`);
  expect(new Set(inlineTreatments).size, "four distinct inline colour treatments").toBe(4);
});

test("geometry stays correct with feeling beats interleaved, in all four themes", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const tripId = await seedFeelingTrip(page);

  for (const theme of THEMES) {
    await setTheme(page, tripId, theme);
    await page.goto(`/trips/${tripId}/story`);
    await expect(page.locator(`[data-theme="${theme}"]`)).toHaveCount(1);

    const path$ = page.locator("svg path[data-serpentine]");
    await expect(path$).toHaveCount(1);

    // Every beat is on the path: 6 stop cards + 3 standalone feeling cards.
    await expect(page.locator("[data-stop-card]"), `theme=${theme}: stop cards`).toHaveCount(
      SEED_STOPS.length,
    );
    await expect(page.locator("[data-feeling-card]"), `theme=${theme}: feeling cards`).toHaveCount(
      CARD_STOPS.length,
    );

    // Path measured (dashoffset == full length while at the top).
    await expect
      .poll(
        async () => path$.evaluate((el) => parseFloat(getComputedStyle(el).strokeDashoffset) || 0),
        { timeout: 20_000, message: `theme=${theme}: serpentine measured` },
      )
      .toBeGreaterThan(50);

    const dashTop = await path$.evaluate((el) => parseFloat(getComputedStyle(el).strokeDashoffset));
    const markerTop = await markerTranslateY(page);

    const rects = await enterEveryCardAndCollectRects(page);

    const dashBottom = await path$.evaluate((el) =>
      parseFloat(getComputedStyle(el).strokeDashoffset),
    );
    const markerBottom = await markerTranslateY(page);

    // The path still draws itself as we scroll…
    expect(dashBottom, `theme=${theme}: dashoffset shrinks top -> bottom`).toBeLessThan(dashTop);
    expect(Math.abs(dashTop - dashBottom)).toBeGreaterThan(1);
    // …and the marker still travels down the (now longer) route.
    expect(markerBottom, `theme=${theme}: marker travels down`).toBeGreaterThan(markerTop);

    // Every card actually entered, so the rects below are final, not mid-animation.
    expect(rects.length, `theme=${theme}: measured every card`).toBe(
      SEED_STOPS.length + CARD_STOPS.length,
    );
    for (const r of rects) {
      expect(r.opacity, `theme=${theme}: "${r.label}" has entered`).toBeGreaterThan(0.9);
    }

    // NO TWO cards overlap — 0px tolerance, across the combined set.
    const collisions: string[] = [];
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        if (intersects(rects[i], rects[j])) {
          collisions.push(
            `${rects[i].kind}[${i}] "${rects[i].label}" ` +
              `(${rects[i].left.toFixed(1)},${rects[i].top.toFixed(1)})-(${rects[i].right.toFixed(1)},${rects[i].bottom.toFixed(1)})` +
              ` ∩ ${rects[j].kind}[${j}] "${rects[j].label}" ` +
              `(${rects[j].left.toFixed(1)},${rects[j].top.toFixed(1)})-(${rects[j].right.toFixed(1)},${rects[j].bottom.toFixed(1)})`,
          );
        }
      }
    }
    expect(collisions, `theme=${theme}: no two cards overlap\n${collisions.join("\n")}`).toEqual([]);
  }
});
