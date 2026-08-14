// Phase 2.5 — API-level media contract + the ADDITIVE migration on a populated
// database. No browser rendering here: everything below runs through the live
// HTTP API (Playwright's webServer boots `next start -p 8001`) and, for the
// migration assertions, through the production Prisma/Postgres driver against
// the isolated `test_gate` schema the gate creates.
//
// The video bytes used here are the COMMITTED fixture `tests/fixtures/clip.mp4`
// (a real 640×360 H.264 MP4). This spec never records, generates or overwrites
// it — it is read-only repo input, verified by the gate before any test starts.

import { test, expect, type APIRequestContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import { readFileSync } from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const FIXTURE_PATH = path.join(REPO_ROOT, "tests", "fixtures", "clip.mp4");
const MIGRATION_SQL_PATH = path.join(
  REPO_ROOT,
  "prisma",
  "migrations",
  "20260814120000_media_kind_and_stop_feeling",
  "migration.sql",
);

const OWNER_PASSWORD = process.env.OWNER_PASSWORD?.trim() || "letmein";

// The gate runs every spec with DATABASE_URL pointing at the isolated
// `test_gate` schema, which is where step 6 seeds the pre-2.5 "Legacy trip"
// rows the migration test reads. Outside the gate there is no such seed (and
// pointing this test at the production `public` schema would be meaningless),
// so that ONE test declares the gate as its precondition. Under `pnpm gate:phase`
// this is always true and the test always runs.
const GATE_SCHEMA_ACTIVE = (process.env.DATABASE_URL ?? "").includes("schema=test_gate");

/**
 * The schema `DATABASE_URL` selects, for use in RAW queries.
 *
 * Prisma Client schema-qualifies the SQL it generates for MODEL queries
 * (`"test_gate"."Trip"`), but it does NOT set the connection's `search_path`
 * — verified: it stays at the Postgres default `"$user", public`. So an
 * UNQUALIFIED `$queryRaw` resolves against `public`, i.e. the PRODUCTION
 * schema, even while every model query in the same test is correctly hitting
 * `test_gate`. Any raw query here must therefore be explicitly qualified.
 */
const DB_SCHEMA = (() => {
  try {
    return new URL(process.env.DATABASE_URL ?? "").searchParams.get("schema") || "public";
  } catch {
    return "public";
  }
})();

const prisma = new PrismaClient();

test.afterAll(async () => {
  await prisma.$disconnect();
});

async function loginAsOwner(request: APIRequestContext): Promise<void> {
  const res = await request.post("/api/auth/login", { data: { password: OWNER_PASSWORD } });
  expect(res.status(), "owner login").toBe(200);
}

/** A logged-in owner with a fresh trip + stop. Returns both ids. */
async function seedTripAndStop(
  request: APIRequestContext,
  title: string,
): Promise<{ tripId: string; stopId: string }> {
  await loginAsOwner(request);

  const tripRes = await request.post("/api/trips", { data: { title } });
  expect(tripRes.status(), "create trip").toBe(201);
  const trip = await tripRes.json();

  const stopRes = await request.post(`/api/trips/${trip.id}/stops`, {
    data: { title: "Media stop", placeName: "Kyoto, Japan", locationPrecision: "none" },
  });
  expect(stopRes.status(), "create stop").toBe(201);
  const stop = await stopRes.json();

  return { tripId: trip.id, stopId: stop.id };
}

async function deleteTrip(request: APIRequestContext, tripId: string): Promise<void> {
  const res = await request.delete(`/api/trips/${tripId}`);
  expect([204, 404]).toContain(res.status());
}

/** `trips/<tripId>/<stopId>/<uuid>` — the shared prefix of a media item. */
function uuidPrefixOf(key: string): string {
  return key.split("/").slice(0, 4).join("/");
}

// ─── presign ─────────────────────────────────────────────────────────────────

test("presign(video/mp4 + poster) returns BOTH targets under one uuid prefix", async ({
  request,
}) => {
  const { tripId, stopId } = await seedTripAndStop(request, "Presign video");

  const res = await request.post(`/api/stops/${stopId}/photos/presign`, {
    data: {
      filename: "clip.mp4",
      contentType: "video/mp4",
      kind: "video",
      posterContentType: "image/jpeg",
    },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();

  expect(body.key).toMatch(
    new RegExp(`^trips/${tripId}/${stopId}/[0-9a-fA-F-]{36}/original\\.mp4$`),
  );
  expect(typeof body.uploadUrl).toBe("string");
  expect(body.uploadUrl.length).toBeGreaterThan(0);
  expect(body.method).toBe("PUT");

  // The poster is a SECOND target minted in the SAME round-trip, under the SAME
  // <uuid> prefix — that is what makes /complete's prefix check and the delete
  // path hold.
  expect(body.poster, "poster target").not.toBeNull();
  expect(body.poster.key).toBe(`${uuidPrefixOf(body.key)}/poster.jpg`);
  expect(typeof body.poster.uploadUrl).toBe("string");
  expect(body.poster.uploadUrl.length).toBeGreaterThan(0);
  expect(body.poster.method).toBe("PUT");
  expect(uuidPrefixOf(body.poster.key)).toBe(uuidPrefixOf(body.key));

  await deleteTrip(request, tripId);
});

test("presign(video/quicktime) is accepted and mints a .mov key", async ({ request }) => {
  // CONTRACT-LEVEL coverage only: no genuine QuickTime file exists on this
  // machine (producing one would need ffmpeg, which is banned this phase), so
  // the .mov path is proven at the API boundary — see
  // spec/capabilities/video-media.md#test-fixture--coverage-honesty.
  const { tripId, stopId } = await seedTripAndStop(request, "Presign quicktime");

  const res = await request.post(`/api/stops/${stopId}/photos/presign`, {
    data: { filename: "clip.mov", contentType: "video/quicktime", kind: "video" },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.key.endsWith(".mov")).toBe(true);
  expect(body.key.startsWith(`trips/${tripId}/${stopId}/`)).toBe(true);
  // No posterContentType was asked for -> no poster target.
  expect(body.poster ?? null).toBeNull();

  await deleteTrip(request, tripId);
});

test("presign rejects a non-media content type with 400", async ({ request }) => {
  const { tripId, stopId } = await seedTripAndStop(request, "Presign zip");

  const asPhoto = await request.post(`/api/stops/${stopId}/photos/presign`, {
    data: { filename: "trip.zip", contentType: "application/zip" },
  });
  expect(asPhoto.status()).toBe(400);
  expect((await asPhoto.json()).error).toBeTruthy();

  const asVideo = await request.post(`/api/stops/${stopId}/photos/presign`, {
    data: { filename: "trip.zip", contentType: "application/zip", kind: "video" },
  });
  expect(asVideo.status()).toBe(400);

  // An unknown `kind` is rejected at the boundary and never persisted.
  const badKind = await request.post(`/api/stops/${stopId}/photos/presign`, {
    data: { filename: "clip.mp4", contentType: "video/mp4", kind: "movie" },
  });
  expect(badKind.status()).toBe(400);

  await deleteTrip(request, tripId);
});

// ─── complete ────────────────────────────────────────────────────────────────

test("complete rejects a posterKey outside the stop prefix with 400", async ({ request }) => {
  const { tripId, stopId } = await seedTripAndStop(request, "Complete bad poster");

  const presign = await request.post(`/api/stops/${stopId}/photos/presign`, {
    data: {
      filename: "clip.mp4",
      contentType: "video/mp4",
      kind: "video",
      posterContentType: "image/jpeg",
    },
  });
  expect(presign.status()).toBe(200);
  const { key } = await presign.json();

  const before = await prisma.photo.count({ where: { stopId } });

  const res = await request.post(`/api/stops/${stopId}/photos/complete`, {
    data: {
      key,
      width: 640,
      height: 360,
      kind: "video",
      // Another stop's prefix — must never be attachable to this stop.
      posterKey: "trips/someone-else/another-stop/00000000/poster.jpg",
      durationSec: 3.33,
    },
  });
  expect(res.status()).toBe(400);
  expect((await res.json()).error).toBe("invalid poster key");
  expect(await prisma.photo.count({ where: { stopId } })).toBe(before);

  await deleteTrip(request, tripId);
});

// ─── full direct upload + Range streaming ────────────────────────────────────

test("direct upload of the committed mp4 registers a video and streams with Range/206", async ({
  request,
}) => {
  const { tripId, stopId } = await seedTripAndStop(request, "Video upload");

  const videoBytes = readFileSync(FIXTURE_PATH);
  expect(videoBytes.subarray(4, 8).toString("latin1")).toBe("ftyp"); // read-only fixture
  const posterBytes = await sharp({
    create: { width: 640, height: 360, channels: 3, background: { r: 20, g: 40, b: 80 } },
  })
    .jpeg()
    .toBuffer();

  // 1) presign both targets
  const presign = await request.post(`/api/stops/${stopId}/photos/presign`, {
    data: {
      filename: "clip.mp4",
      contentType: "video/mp4",
      kind: "video",
      posterContentType: "image/jpeg",
    },
  });
  expect(presign.status()).toBe(200);
  const targets = await presign.json();

  // 2) PUT the video bytes, 3) PUT the poster bytes — both BEFORE complete, so a
  // registered posterKey always points at bytes that exist.
  const putVideo = await request.fetch(targets.uploadUrl, {
    method: "PUT",
    data: videoBytes,
    headers: { "Content-Type": "video/mp4" },
  });
  expect(putVideo.ok(), `PUT video -> ${putVideo.status()}`).toBe(true);

  const putPoster = await request.fetch(targets.poster.uploadUrl, {
    method: "PUT",
    data: posterBytes,
    headers: { "Content-Type": "image/jpeg" },
  });
  expect(putPoster.ok(), `PUT poster -> ${putPoster.status()}`).toBe(true);

  // 4) complete
  const complete = await request.post(`/api/stops/${stopId}/photos/complete`, {
    data: {
      key: targets.key,
      width: 640,
      height: 360,
      kind: "video",
      posterKey: targets.poster.key,
      durationSec: 3.33,
    },
  });
  expect(complete.status()).toBe(201);
  const media = await complete.json();

  expect(media.kind).toBe("video");
  expect(media.posterUrl).not.toBeNull();
  expect(media.durationSec).toBeGreaterThan(0);
  expect(media.width).toBe(640);
  expect(media.height).toBe(360);
  expect(media.isCover).toBe(true); // first media of the stop
  // thumbUrl safety rule: a video WITH a poster thumbs to the poster.
  expect(media.thumbUrl).toBe(media.posterUrl);
  expect(media.webUrl).not.toBe(media.posterUrl);

  // The row really is a video in the database, with the poster key recorded.
  const row = await prisma.photo.findUnique({ where: { id: media.id } });
  expect(row?.kind).toBe("video");
  expect(row?.posterKey).toBe(targets.poster.key);
  expect(row?.durationSec).toBeCloseTo(3.33, 2);

  // …and it reads back through the trip serializer.
  const tripRes = await request.get(`/api/trips/${tripId}`);
  expect(tripRes.status()).toBe(200);
  const trip = await tripRes.json();
  const serialized = trip.stops[0].photos.find((p: { id: string }) => p.id === media.id);
  expect(serialized).toBeTruthy();
  expect(serialized.kind).toBe("video");
  expect(serialized.posterUrl).not.toBeNull();
  expect(serialized.durationSec).toBeGreaterThan(0);

  // ── the media route must be seekable, or the browser cannot scrub/preload ──
  const whole = await request.get(media.webUrl);
  expect(whole.status()).toBe(200);
  expect(whole.headers()["content-type"]).toMatch(/^video\/mp4\b/);
  expect(whole.headers()["accept-ranges"]).toBe("bytes");
  expect((await whole.body()).length).toBe(videoBytes.length);

  const ranged = await request.get(media.webUrl, { headers: { Range: "bytes=0-1023" } });
  expect(ranged.status()).toBe(206);
  expect(ranged.headers()["accept-ranges"]).toBe("bytes");
  expect(ranged.headers()["content-range"]).toBe(`bytes 0-1023/${videoBytes.length}`);
  const rangedBody = await ranged.body();
  expect(rangedBody.length).toBe(1024);
  expect(rangedBody.equals(videoBytes.subarray(0, 1024))).toBe(true);

  await deleteTrip(request, tripId);
});

test("a .mov key is served as video/quicktime and is range-seekable", async ({ request }) => {
  // Contract-level `.mov` coverage (see video-media.md#test-fixture--coverage-honesty):
  // no genuine QuickTime file exists here, but MP4 and QuickTime share the ISO
  // base media container, so the committed ISO-BMFF bytes stored under a `.mov`
  // key are genuinely playable when labelled `video/quicktime`. A real iPhone
  // HEVC `.mov` is NOT covered end to end.
  const { tripId, stopId } = await seedTripAndStop(request, "Quicktime key");
  const videoBytes = readFileSync(FIXTURE_PATH);

  const presign = await request.post(`/api/stops/${stopId}/photos/presign`, {
    data: { filename: "clip.mov", contentType: "video/quicktime", kind: "video" },
  });
  expect(presign.status()).toBe(200);
  const targets = await presign.json();
  expect(targets.key.endsWith(".mov")).toBe(true);

  const put = await request.fetch(targets.uploadUrl, {
    method: "PUT",
    data: videoBytes,
    headers: { "Content-Type": "video/quicktime" },
  });
  expect(put.ok(), `PUT .mov -> ${put.status()}`).toBe(true);

  const complete = await request.post(`/api/stops/${stopId}/photos/complete`, {
    data: { key: targets.key, width: 640, height: 360, kind: "video", durationSec: 3.33 },
  });
  expect(complete.status()).toBe(201);
  const media = await complete.json();
  expect(media.kind).toBe("video");
  // No poster was captured -> no posterUrl, and thumbUrl falls back to the video
  // object itself (consumers MUST branch on `kind` — the thumbUrl safety rule).
  expect(media.posterUrl).toBeNull();
  expect(media.thumbUrl).toBe(media.webUrl);

  const ranged = await request.get(media.webUrl, { headers: { Range: "bytes=0-511" } });
  expect(ranged.status()).toBe(206);
  expect(ranged.headers()["content-type"]).toMatch(/^video\/quicktime\b/);
  expect(ranged.headers()["content-range"]).toBe(`bytes 0-511/${videoBytes.length}`);
  expect((await ranged.body()).length).toBe(512);

  await deleteTrip(request, tripId);
});

// ─── legacy multipart route: video is refused BEFORE sharp ───────────────────

test("legacy multipart upload of a video returns 415 and creates no row", async ({ request }) => {
  const { tripId, stopId } = await seedTripAndStop(request, "Legacy multipart video");

  const videoBytes = readFileSync(FIXTURE_PATH);
  const before = await prisma.photo.count();

  const res = await request.post(`/api/stops/${stopId}/photos`, {
    multipart: {
      files: { name: "clip.mp4", mimeType: "video/mp4", buffer: videoBytes },
    },
  });
  expect(res.status()).toBe(415);
  expect((await res.json()).error).toBe(
    "video uploads must use the direct upload path (presign → PUT → complete)",
  );

  // sharp never ran and nothing was persisted.
  expect(await prisma.photo.count()).toBe(before);
  expect(await prisma.photo.count({ where: { stopId } })).toBe(0);

  await deleteTrip(request, tripId);
});

// ─── the migration itself ────────────────────────────────────────────────────

test("the Phase-2.5 migration SQL is ADDITIVE ONLY", () => {
  const sql = readFileSync(MIGRATION_SQL_PATH, "utf8");
  // Strip `--` comments so prose can never satisfy (or trip) the scan.
  const code = sql
    .split(/\r?\n/)
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");

  const statements = code
    .split(";")
    .map((s) => s.trim().replace(/\s+/g, " "))
    .filter((s) => s.length > 0);

  expect(statements).toHaveLength(2);
  for (const statement of statements) {
    expect(statement).toMatch(/^ALTER TABLE "(Photo|Stop)" ADD COLUMN /i);
    // Every clause of a multi-clause ALTER must itself be an ADD COLUMN.
    for (const clause of statement.replace(/^ALTER TABLE "\w+" /i, "").split(",")) {
      expect(clause.trim()).toMatch(/^ADD COLUMN /i);
    }
  }

  // The live Neon DB holds the owner's real data: nothing destructive, ever.
  expect(code).not.toMatch(/\bDROP\b/i);
  expect(code).not.toMatch(/\bRENAME\b/i);
  expect(code).not.toMatch(/\bALTER\s+COLUMN\b/i);
  expect(code).not.toMatch(/\bTRUNCATE\b/i);
  expect(code).not.toMatch(/\bDELETE\s+FROM\b/i);
  expect(code).not.toMatch(/\bCREATE\s+TABLE\b/i);

  // …and it adds exactly the five documented columns.
  expect(code).toMatch(/ADD COLUMN\s+"kind" TEXT NOT NULL DEFAULT 'photo'/);
  expect(code).toMatch(/ADD COLUMN\s+"posterKey" TEXT/);
  expect(code).toMatch(/ADD COLUMN\s+"durationSec" DOUBLE PRECISION/);
  expect(code).toMatch(/ADD COLUMN\s+"feeling" TEXT/);
  expect(code).toMatch(/ADD COLUMN\s+"feelingPlacement" TEXT NOT NULL DEFAULT 'card'/);
  expect(code.match(/ADD COLUMN/gi) ?? []).toHaveLength(5);
});

test("the additive migration preserved pre-existing rows and backfilled the defaults", async () => {
  test.skip(
    !GATE_SCHEMA_ACTIVE,
    'requires the gate\'s isolated "test_gate" schema and its pre-2.5 seed rows — run `pnpm gate:phase` (the gate always sets DATABASE_URL=…schema=test_gate, so this never skips there)',
  );

  // Seeded at gate step 6 with PRE-2.5 columns only, then migrated at step 8
  // onto a database that already contained these rows.
  const trip = await prisma.trip.findUnique({ where: { id: "gate_legacy_trip" } });
  expect(trip, "the pre-existing trip survived the migration (no reset)").not.toBeNull();
  expect(trip!.title).toBe("Legacy trip");
  expect(trip!.description).toBe("shipped before Phase 2.5");
  expect(trip!.theme).toBe("cinematic");
  expect(trip!.isPublished).toBe(false);

  const stop = await prisma.stop.findUnique({ where: { id: "gate_legacy_stop" } });
  expect(stop, "the pre-existing stop survived the migration").not.toBeNull();
  expect(stop!.tripId).toBe("gate_legacy_trip");
  expect(stop!.title).toBe("Legacy stop");
  expect(stop!.placeName).toBe("Kyoto, Japan");
  expect(stop!.lat).toBeCloseTo(34.9671, 4);
  expect(stop!.lng).toBeCloseTo(135.7727, 4);
  expect(stop!.locationPrecision).toBe("exact");
  expect(stop!.motif).toBe("none");
  // …and backfilled the two new Stop columns.
  expect(stop!.feeling).toBeNull();
  expect(stop!.feelingPlacement).toBe("card");

  const photo = await prisma.photo.findUnique({ where: { id: "gate_legacy_photo" } });
  expect(photo, "the pre-existing photo survived the migration").not.toBeNull();
  expect(photo!.stopId).toBe("gate_legacy_stop");
  expect(photo!.order).toBe(0);
  expect(photo!.isCover).toBe(true);
  expect(photo!.width).toBe(1200);
  expect(photo!.height).toBe(800);
  expect(photo!.caption).toBe("a photo from before the video split");
  expect(photo!.webKey).toBe("trips/gate_legacy_trip/gate_legacy_stop/legacy/original.jpg");
  // …and backfilled the three new Photo columns.
  expect(photo!.kind).toBe("photo");
  expect(photo!.posterKey).toBeNull();
  expect(photo!.durationSec).toBeNull();

  // Both migrations are recorded as applied, and the additive one finished.
  // Qualified with DB_SCHEMA on purpose — unqualified this reads `public`
  // (production), which records only the pre-2.5 init migration. See DB_SCHEMA.
  const applied = await prisma.$queryRawUnsafe<
    { migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }[]
  >(
    `SELECT migration_name, finished_at, rolled_back_at
     FROM "${DB_SCHEMA}"."_prisma_migrations" ORDER BY migration_name`,
  );
  const names = applied.map((m) => m.migration_name);
  expect(names).toContain("20260813000000_init");
  expect(names).toContain("20260814120000_media_kind_and_stop_feeling");
  const additive = applied.find(
    (m) => m.migration_name === "20260814120000_media_kind_and_stop_feeling",
  )!;
  expect(additive.finished_at).not.toBeNull();
  expect(additive.rolled_back_at).toBeNull();
});

test("a pre-existing photo reads back through the API as kind:photo with null video fields", async ({
  request,
}) => {
  test.skip(
    !GATE_SCHEMA_ACTIVE,
    'requires the gate\'s isolated "test_gate" schema and its pre-2.5 seed rows — run `pnpm gate:phase`',
  );

  await loginAsOwner(request);
  const res = await request.get("/api/trips/gate_legacy_trip");
  expect(res.status()).toBe(200);
  const trip = await res.json();

  expect(trip.title).toBe("Legacy trip");
  expect(trip.stops).toHaveLength(1);
  const stop = trip.stops[0];
  expect(stop.feeling).toBeNull();
  expect(stop.feelingPlacement).toBe("card");
  expect(stop.photos).toHaveLength(1);

  const legacyPhoto = stop.photos[0];
  expect(legacyPhoto.kind).toBe("photo");
  expect(legacyPhoto.posterUrl).toBeNull();
  expect(legacyPhoto.durationSec).toBeNull();
  expect(legacyPhoto.webUrl).toBe(
    "/api/media/trips/gate_legacy_trip/gate_legacy_stop/legacy/original.jpg",
  );
  // A photo's thumb is the same object as its web object (no poster indirection).
  expect(legacyPhoto.thumbUrl).toBe(legacyPhoto.webUrl);
});
