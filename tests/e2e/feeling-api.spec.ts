// Feeling API contract (Phase 2.5, slice-feeling-api) — exercised against the
// live server (webServer in playwright.config.ts boots `next start -p 8001`)
// and the real production DB driver. Asserts the frozen contract in
// spec/api.md + spec/capabilities/feeling-cards.md:
//
//   (1) PATCH /api/stops/:id { feeling } round-trips (and create returns the
//       backfilled defaults feeling:null / feelingPlacement:"card").
//   (2) A blank / whitespace-only feeling normalises to null.
//   (3) An unknown feelingPlacement is rejected with 400 and never persisted.
//   (4) A feeling over MAX_FEELING_CHARS (200) is rejected with 400; exactly
//       200 characters is accepted (boundary).
//   (5) A PATCH sending only { title } leaves feeling/feelingPlacement
//       untouched — non-destructive editing.
//   (6) GET /api/public/trips/:slug returns feeling + feelingPlacement on
//       EVERY stop, read with no session cookie.
//   (7) These serializers emit the FULL media shape frozen in spec/api.md —
//       every media item carries kind / posterUrl / durationSec alongside the
//       Phase-1 fields, on the owner read AND the public read.
//
// Every test seeds and deletes its own trip, and every trip title carries a
// unique stamp, so nothing here depends on (or disturbs) another spec's data
// in the shared database.

import {
  test,
  expect,
  request as playwrightRequest,
  type APIRequestContext,
} from "@playwright/test";
import sharp from "sharp";

const BASE_URL = "http://localhost:8001";
const DEV_PASSWORD = "letmein"; // dev default (OWNER_PASSWORD unset in .env)

// Frozen in spec/api.md / spec/data.md. Kept as a literal here on purpose: the
// spec value is what the API must enforce, independent of the app's constant.
const MAX_FEELING_CHARS = 200;

const STAMP = `feeling-api-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const FEELING = "The rain smelled like cedar.";

// The media object frozen in spec/api.md — the exact key set every stop
// serializer in this slice must emit for EVERY media item, photo or video.
const MEDIA_KEYS = [
  "caption",
  "durationSec",
  "height",
  "id",
  "isCover",
  "kind",
  "order",
  "posterUrl",
  "thumbUrl",
  "webUrl",
  "width",
];

async function loginAsOwner(request: APIRequestContext): Promise<void> {
  const login = await request.post("/api/auth/login", {
    data: { password: DEV_PASSWORD },
  });
  expect(login.status(), await login.text()).toBe(200);
}

/** Seed an owned trip whose title is uniquely stamped to this spec run. */
async function createTrip(
  request: APIRequestContext,
  label: string,
): Promise<string> {
  const res = await request.post("/api/trips", {
    data: { title: `${STAMP} ${label}`, description: "feeling-api fixture" },
  });
  expect(res.status(), await res.text()).toBe(201);
  const trip = await res.json();
  expect(typeof trip.id).toBe("string");
  return trip.id as string;
}

async function createStop(
  request: APIRequestContext,
  tripId: string,
  data: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const res = await request.post(`/api/trips/${tripId}/stops`, { data });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()) as Record<string, unknown>;
}

async function readStop(
  request: APIRequestContext,
  tripId: string,
  stopId: string,
): Promise<Record<string, unknown>> {
  const res = await request.get(`/api/trips/${tripId}`);
  expect(res.status(), await res.text()).toBe(200);
  const trip = await res.json();
  const stop = (trip.stops as Record<string, unknown>[]).find(
    (s) => s.id === stopId,
  );
  expect(stop, `stop ${stopId} missing from GET /api/trips/${tripId}`).toBeTruthy();
  return stop as Record<string, unknown>;
}

test("a new stop reports the backfilled feeling defaults, and PATCH { feeling } round-trips", async ({
  request,
}) => {
  await loginAsOwner(request);
  const tripId = await createTrip(request, "round-trip");
  try {
    // Create with no feeling → the DB defaults surface in the response.
    const created = await createStop(request, tripId, { title: "Arrival" });
    expect(created.feeling).toBeNull();
    expect(created.feelingPlacement).toBe("card");
    const stopId = created.id as string;

    // PATCH { feeling } → echoed back on the PATCH response...
    const patch = await request.patch(`/api/stops/${stopId}`, {
      data: { feeling: FEELING },
    });
    expect(patch.status(), await patch.text()).toBe(200);
    const patched = await patch.json();
    expect(patched.feeling).toBe(FEELING);
    expect(patched.feelingPlacement).toBe("card");

    // ...and persisted, read back through the owner trip GET.
    const reread = await readStop(request, tripId, stopId);
    expect(reread.feeling).toBe(FEELING);
    expect(reread.feelingPlacement).toBe("card");

    // Placement is independently settable and round-trips too.
    const toInline = await request.patch(`/api/stops/${stopId}`, {
      data: { feelingPlacement: "inline" },
    });
    expect(toInline.status(), await toInline.text()).toBe(200);
    expect((await toInline.json()).feelingPlacement).toBe("inline");
    expect((await readStop(request, tripId, stopId)).feelingPlacement).toBe(
      "inline",
    );
  } finally {
    expect((await request.delete(`/api/trips/${tripId}`)).status()).toBe(204);
  }
});

test("a blank / whitespace-only feeling normalises to null", async ({
  request,
}) => {
  await loginAsOwner(request);
  const tripId = await createTrip(request, "blank-feeling");
  try {
    const created = await createStop(request, tripId, { title: "Blank" });
    const stopId = created.id as string;

    // Seed a real feeling first, so "null" can only come from normalisation.
    const seed = await request.patch(`/api/stops/${stopId}`, {
      data: { feeling: FEELING },
    });
    expect(seed.status()).toBe(200);
    expect((await seed.json()).feeling).toBe(FEELING);

    const blanked = await request.patch(`/api/stops/${stopId}`, {
      data: { feeling: "   \n\t  " },
    });
    expect(blanked.status(), await blanked.text()).toBe(200);
    expect((await blanked.json()).feeling).toBeNull();
    expect((await readStop(request, tripId, stopId)).feeling).toBeNull();

    // An explicit null clears it too, and the create path normalises as well.
    const clearedStop = await createStop(request, tripId, {
      title: "Created blank",
      feeling: "     ",
    });
    expect(clearedStop.feeling).toBeNull();
  } finally {
    expect((await request.delete(`/api/trips/${tripId}`)).status()).toBe(204);
  }
});

test("an unknown feelingPlacement is rejected with 400 and never persisted", async ({
  request,
}) => {
  await loginAsOwner(request);
  const tripId = await createTrip(request, "bad-placement");
  try {
    const created = await createStop(request, tripId, { title: "Placement" });
    const stopId = created.id as string;

    // Set a known-good placement so a silent write would be visible.
    expect(
      (
        await request.patch(`/api/stops/${stopId}`, {
          data: { feeling: FEELING, feelingPlacement: "inline" },
        })
      ).status(),
    ).toBe(200);

    const bad = await request.patch(`/api/stops/${stopId}`, {
      data: { feelingPlacement: "nope" },
    });
    expect(bad.status(), await bad.text()).toBe(400);
    expect((await bad.json()).error).toBeTruthy();

    // Nothing was written: the previous placement (and feeling) survive.
    const after = await readStop(request, tripId, stopId);
    expect(after.feelingPlacement).toBe("inline");
    expect(after.feeling).toBe(FEELING);

    // The create path enforces the same enum.
    const badCreate = await request.post(`/api/trips/${tripId}/stops`, {
      data: { title: "Bad create", feelingPlacement: "nope" },
    });
    expect(badCreate.status(), await badCreate.text()).toBe(400);
  } finally {
    expect((await request.delete(`/api/trips/${tripId}`)).status()).toBe(204);
  }
});

test(`a feeling longer than ${MAX_FEELING_CHARS} characters is rejected with 400 (and exactly ${MAX_FEELING_CHARS} is accepted)`, async ({
  request,
}) => {
  await loginAsOwner(request);
  const tripId = await createTrip(request, "too-long");
  try {
    const created = await createStop(request, tripId, { title: "Long" });
    const stopId = created.id as string;

    expect(
      (
        await request.patch(`/api/stops/${stopId}`, {
          data: { feeling: FEELING },
        })
      ).status(),
    ).toBe(200);

    const tooLong = "x".repeat(MAX_FEELING_CHARS + 1); // 201 characters
    expect(tooLong).toHaveLength(201);
    const rejected = await request.patch(`/api/stops/${stopId}`, {
      data: { feeling: tooLong },
    });
    expect(rejected.status(), await rejected.text()).toBe(400);
    expect((await rejected.json()).error).toBeTruthy();

    // Rejected means NOT persisted — the previous value is intact.
    expect((await readStop(request, tripId, stopId)).feeling).toBe(FEELING);

    // Boundary: exactly MAX_FEELING_CHARS is valid and round-trips.
    const atLimit = "y".repeat(MAX_FEELING_CHARS);
    const accepted = await request.patch(`/api/stops/${stopId}`, {
      data: { feeling: atLimit },
    });
    expect(accepted.status(), await accepted.text()).toBe(200);
    expect((await accepted.json()).feeling).toBe(atLimit);
    expect((await readStop(request, tripId, stopId)).feeling).toBe(atLimit);

    // The create path enforces the same limit.
    const badCreate = await request.post(`/api/trips/${tripId}/stops`, {
      data: { title: "Long create", feeling: tooLong },
    });
    expect(badCreate.status(), await badCreate.text()).toBe(400);
  } finally {
    expect((await request.delete(`/api/trips/${tripId}`)).status()).toBe(204);
  }
});

test("a PATCH sending only { title } leaves feeling and feelingPlacement untouched", async ({
  request,
}) => {
  await loginAsOwner(request);
  const tripId = await createTrip(request, "non-destructive");
  try {
    const created = await createStop(request, tripId, { title: "Before" });
    const stopId = created.id as string;

    const seeded = await request.patch(`/api/stops/${stopId}`, {
      data: { feeling: FEELING, feelingPlacement: "inline" },
    });
    expect(seeded.status(), await seeded.text()).toBe(200);

    // The drawer's explicit "Save stop" never sends feeling — it must not clobber it.
    const titleOnly = await request.patch(`/api/stops/${stopId}`, {
      data: { title: `${STAMP} After` },
    });
    expect(titleOnly.status(), await titleOnly.text()).toBe(200);
    const body = await titleOnly.json();
    expect(body.title).toBe(`${STAMP} After`);
    expect(body.feeling).toBe(FEELING);
    expect(body.feelingPlacement).toBe("inline");

    const reread = await readStop(request, tripId, stopId);
    expect(reread.title).toBe(`${STAMP} After`);
    expect(reread.feeling).toBe(FEELING);
    expect(reread.feelingPlacement).toBe("inline");

    // The converse also holds: a feeling-only PATCH does not clear the title.
    const feelingOnly = await request.patch(`/api/stops/${stopId}`, {
      data: { feeling: "Only the feeling changed." },
    });
    expect(feelingOnly.status(), await feelingOnly.text()).toBe(200);
    const after = await feelingOnly.json();
    expect(after.title).toBe(`${STAMP} After`);
    expect(after.feeling).toBe("Only the feeling changed.");
    expect(after.feelingPlacement).toBe("inline");
  } finally {
    expect((await request.delete(`/api/trips/${tripId}`)).status()).toBe(204);
  }
});

test("GET /api/public/trips/:slug returns feeling and feelingPlacement on every stop", async ({
  request,
}) => {
  await loginAsOwner(request);
  const tripId = await createTrip(request, "public-read");
  try {
    const cardStop = await createStop(request, tripId, {
      title: "Card feeling",
      feeling: FEELING,
      feelingPlacement: "card",
    });
    const inlineStop = await createStop(request, tripId, {
      title: "Inline feeling",
      feeling: "Ten thousand gates, one long breath.",
      feelingPlacement: "inline",
    });
    // A stop with NO feeling — it must still carry both fields (null / "card").
    const plainStop = await createStop(request, tripId, { title: "No feeling" });

    const publish = await request.post(`/api/trips/${tripId}/publish`);
    expect(publish.ok(), await publish.text()).toBeTruthy();
    const slug: string = (await (await request.get(`/api/trips/${tripId}`)).json())
      .shareSlug;
    expect(slug).toBeTruthy();

    // A real visitor: a fresh context with NO session cookie.
    const anon = await playwrightRequest.newContext({ baseURL: BASE_URL });
    try {
      const res = await anon.get(`/api/public/trips/${slug}`);
      expect(res.status(), await res.text()).toBe(200);
      const trip = await res.json();

      const stops = trip.stops as Record<string, unknown>[];
      expect(stops).toHaveLength(3);

      // EVERY stop carries both fields with a valid placement.
      for (const stop of stops) {
        expect(stop).toHaveProperty("feeling");
        expect(stop).toHaveProperty("feelingPlacement");
        expect(["card", "inline", "none"]).toContain(stop.feelingPlacement);
        expect(stop.feeling === null || typeof stop.feeling === "string").toBe(
          true,
        );
      }

      const byId = new Map(stops.map((s) => [s.id as string, s]));
      expect(byId.get(cardStop.id as string)?.feeling).toBe(FEELING);
      expect(byId.get(cardStop.id as string)?.feelingPlacement).toBe("card");
      expect(byId.get(inlineStop.id as string)?.feeling).toBe(
        "Ten thousand gates, one long breath.",
      );
      expect(byId.get(inlineStop.id as string)?.feelingPlacement).toBe("inline");
      expect(byId.get(plainStop.id as string)?.feeling).toBeNull();
      expect(byId.get(plainStop.id as string)?.feelingPlacement).toBe("card");
    } finally {
      await anon.dispose();
    }
  } finally {
    expect((await request.delete(`/api/trips/${tripId}`)).status()).toBe(204);
  }
});

test("the owner and public stop serializers emit the full media shape (kind / posterUrl / durationSec)", async ({
  request,
}) => {
  await loginAsOwner(request);
  const tripId = await createTrip(request, "media-shape");
  try {
    const stop = await createStop(request, tripId, {
      title: "Media shape",
      feeling: FEELING,
    });
    const stopId = stop.id as string;

    // A REAL JPEG through the shipped upload path, so the read routes have a
    // real media row to serialize.
    const jpeg = await sharp({
      create: {
        width: 800,
        height: 600,
        channels: 3,
        background: { r: 120, g: 90, b: 60 },
      },
    })
      .jpeg()
      .toBuffer();
    const upload = await request.post(`/api/stops/${stopId}/photos`, {
      multipart: {
        files: { name: "shape.jpg", mimeType: "image/jpeg", buffer: jpeg },
      },
    });
    expect(upload.status(), await upload.text()).toBe(201);

    // --- owner read ---
    const owned = await readStop(request, tripId, stopId);
    const ownedMedia = (owned.photos as Record<string, unknown>[])[0];
    expect(ownedMedia, "the uploaded media item is missing").toBeTruthy();
    // Byte-identical to the frozen contract: no field missing, none invented.
    expect(Object.keys(ownedMedia!).sort()).toEqual(MEDIA_KEYS);
    expect(ownedMedia!.kind).toBe("photo");
    expect(ownedMedia!.posterUrl).toBeNull();
    expect(ownedMedia!.durationSec).toBeNull();
    expect(typeof ownedMedia!.webUrl).toBe("string");
    expect(typeof ownedMedia!.thumbUrl).toBe("string");
    expect(ownedMedia!.width as number).toBeGreaterThan(0);
    expect(ownedMedia!.height as number).toBeGreaterThan(0);
    expect(ownedMedia!.isCover).toBe(true); // first media of the stop

    // --- public read: identical media shape, no session cookie ---
    const publish = await request.post(`/api/trips/${tripId}/publish`);
    expect(publish.ok(), await publish.text()).toBeTruthy();
    const slug: string = (await (await request.get(`/api/trips/${tripId}`)).json())
      .shareSlug;
    expect(slug).toBeTruthy();

    const anon = await playwrightRequest.newContext({ baseURL: BASE_URL });
    try {
      const res = await anon.get(`/api/public/trips/${slug}`);
      expect(res.status(), await res.text()).toBe(200);
      const publicTrip = await res.json();
      const publicStop = (publicTrip.stops as Record<string, unknown>[]).find(
        (s) => s.id === stopId,
      );
      expect(publicStop).toBeTruthy();
      expect(publicStop!.feeling).toBe(FEELING);
      const publicMedia = (publicStop!.photos as Record<string, unknown>[])[0];
      expect(Object.keys(publicMedia!).sort()).toEqual(MEDIA_KEYS);
      expect(publicMedia!.kind).toBe("photo");
      expect(publicMedia!.posterUrl).toBeNull();
      expect(publicMedia!.durationSec).toBeNull();
      // The public read resolves the same objects as the owner read.
      expect(publicMedia!.webUrl).toBe(ownedMedia!.webUrl);
      expect(publicMedia!.thumbUrl).toBe(ownedMedia!.thumbUrl);
    } finally {
      await anon.dispose();
    }
  } finally {
    expect((await request.delete(`/api/trips/${tripId}`)).status()).toBe(204);
  }
});
