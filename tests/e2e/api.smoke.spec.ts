// API smoke — exercises the hard Phase-1 backend path against the live server
// (webServer in playwright.config.ts boots `next start -p 8001`). Asserts real
// CONTENT, not just status codes: login/session, ownership gating, the full
// trip → stop → real-photo-upload → media-stream loop, the geocode proxy, and
// transactional reorder.

import { test, expect, request as playwrightRequest } from "@playwright/test";
import sharp from "sharp";
import os from "node:os";
import path from "node:path";
import { writeFile, unlink } from "node:fs/promises";

const BASE_URL = "http://localhost:8001";
const DEV_PASSWORD = "letmein"; // dev default (OWNER_PASSWORD unset in .env)

test("GET /health returns ok", async ({ request }) => {
  const res = await request.get("/health");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.status).toBe("ok");
});

test("login rejects a wrong password with 401", async ({ request }) => {
  const res = await request.post("/api/auth/login", {
    data: { password: "definitely-not-the-password" },
  });
  expect(res.status()).toBe(401);
  const body = await res.json();
  expect(body.error).toBe("invalid password");
});

test("unauthenticated write is rejected with 401", async () => {
  const ctx = await playwrightRequest.newContext({ baseURL: BASE_URL });
  try {
    const res = await ctx.post("/api/trips", { data: { title: "no session" } });
    expect(res.status()).toBe(401);
  } finally {
    await ctx.dispose();
  }
});

test("owner journey: login -> trip -> stop -> photo -> read -> geocode -> reorder", async ({
  request,
}) => {
  // --- login sets a session cookie ---
  const login = await request.post("/api/auth/login", {
    data: { password: DEV_PASSWORD },
  });
  expect(login.status()).toBe(200);
  expect(await login.json()).toEqual({ ok: true });
  const setCookies = login
    .headersArray()
    .filter((h) => h.name.toLowerCase() === "set-cookie");
  expect(setCookies.length).toBeGreaterThan(0);
  expect(setCookies.some((c) => c.value.includes("session="))).toBe(true);
  expect(setCookies.some((c) => /httponly/i.test(c.value))).toBe(true);

  // --- create a trip ---
  const tripRes = await request.post("/api/trips", {
    data: { title: "Kyoto in Spring", description: "cherry blossoms" },
  });
  expect(tripRes.status()).toBe(201);
  const trip = await tripRes.json();
  expect(typeof trip.id).toBe("string");
  expect(trip.title).toBe("Kyoto in Spring");
  expect(trip.stops).toEqual([]);

  // --- create the first stop (manual location, precision exact) ---
  const stop1Res = await request.post(`/api/trips/${trip.id}/stops`, {
    data: {
      title: "Fushimi Inari",
      placeName: "Kyoto, Japan",
      lat: 34.9671,
      lng: 135.7727,
      locationPrecision: "exact",
    },
  });
  expect(stop1Res.status()).toBe(201);
  const stop1 = await stop1Res.json();
  expect(typeof stop1.id).toBe("string");
  expect(stop1.order).toBe(0);
  expect(stop1.locationPrecision).toBe("exact");
  expect(stop1.lat).toBeCloseTo(34.9671, 3);
  expect(stop1.photos).toEqual([]);

  // --- generate a REAL JPEG at runtime and upload it (multipart) ---
  const jpegBuffer = await sharp({
    create: {
      width: 1200,
      height: 800,
      channels: 3,
      background: { r: 40, g: 120, b: 200 },
    },
  })
    .jpeg()
    .toBuffer();
  const jpegPath = path.join(os.tmpdir(), `wanderline-smoke-${Date.now()}.jpg`);
  await writeFile(jpegPath, jpegBuffer);

  const uploadRes = await request.post(`/api/stops/${stop1.id}/photos`, {
    multipart: {
      files: { name: "photo.jpg", mimeType: "image/jpeg", buffer: jpegBuffer },
    },
  });
  expect(uploadRes.status()).toBe(201);
  const uploadBody = await uploadRes.json();
  expect(Array.isArray(uploadBody.photos)).toBe(true);
  expect(uploadBody.photos).toHaveLength(1);
  const photo = uploadBody.photos[0];
  expect(photo.isCover).toBe(true); // first photo of the stop
  expect(photo.width).toBeGreaterThan(0);
  expect(photo.height).toBeGreaterThan(0);
  expect(typeof photo.webUrl).toBe("string");
  expect(photo.webUrl.length).toBeGreaterThan(0);

  // --- the webUrl streams real image bytes via /api/media ---
  const imgRes = await request.get(photo.webUrl);
  expect(imgRes.status()).toBe(200);
  expect(imgRes.headers()["content-type"]).toMatch(/^image\//);
  const imgBytes = await imgRes.body();
  expect(imgBytes.length).toBeGreaterThan(0);

  // --- read the full trip: stops + photos, sorted by order ---
  const fullRes = await request.get(`/api/trips/${trip.id}`);
  expect(fullRes.status()).toBe(200);
  const full = await fullRes.json();
  expect(full.id).toBe(trip.id);
  expect(full.stops).toHaveLength(1);
  expect(full.stops[0].id).toBe(stop1.id);
  expect(full.stops[0].photos).toHaveLength(1);
  expect(full.stops[0].photos[0].webUrl).toBe(photo.webUrl);
  expect(full.stops[0].photos[0].isCover).toBe(true);

  // --- geocode proxy: 200 with candidates OR a graceful 502, never a crash ---
  const geoRes = await request.get("/api/geocode?q=Kyoto");
  expect([200, 502]).toContain(geoRes.status());
  if (geoRes.status() === 200) {
    const geo = await geoRes.json();
    expect(Array.isArray(geo.candidates)).toBe(true);
    if (geo.candidates.length > 0) {
      const first = geo.candidates[0];
      expect(typeof first.lat).toBe("number");
      expect(typeof first.lng).toBe("number");
      expect(typeof first.displayName).toBe("string");
    }
  } else {
    expect((await geoRes.json()).error).toBeTruthy();
  }

  // --- add a second stop, then reorder (reversed) ---
  const stop2Res = await request.post(`/api/trips/${trip.id}/stops`, {
    data: {
      title: "Arashiyama Bamboo Grove",
      placeName: "Kyoto, Japan",
      lat: 35.0094,
      lng: 135.6667,
      locationPrecision: "exact",
    },
  });
  expect(stop2Res.status()).toBe(201);
  const stop2 = await stop2Res.json();
  expect(stop2.order).toBe(1);

  const reorderRes = await request.post(
    `/api/trips/${trip.id}/stops/reorder`,
    { data: { orderedStopIds: [stop2.id, stop1.id] } },
  );
  expect(reorderRes.status()).toBe(200);
  expect(await reorderRes.json()).toEqual({ ok: true });

  const afterRes = await request.get(`/api/trips/${trip.id}`);
  const after = await afterRes.json();
  expect(after.stops.map((s: { id: string }) => s.id)).toEqual([
    stop2.id,
    stop1.id,
  ]);
  expect(after.stops[0].order).toBe(0);
  expect(after.stops[1].order).toBe(1);

  // --- cleanup: cascade-delete the trip (exercises DELETE + file cleanup) ---
  const delRes = await request.delete(`/api/trips/${trip.id}`);
  expect(delRes.status()).toBe(204);
  await unlink(jpegPath).catch(() => {});
});
