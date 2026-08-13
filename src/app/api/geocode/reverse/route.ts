// GET /api/geocode/reverse?lat=<lat>&lng=<lng> — reverse-geocode a map click
// via the server-side Nominatim proxy. Owner only.
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { reverse, GeocodeUpstreamError } from "@/lib/geocode";
import { requireOwner } from "@/lib/auth";
import { log } from "@/lib/logger";

async function handleGet(req: NextRequest): Promise<NextResponse> {
  const latRaw = req.nextUrl.searchParams.get("lat");
  const lngRaw = req.nextUrl.searchParams.get("lng");
  const lat = Number(latRaw);
  const lng = Number(lngRaw);

  if (
    latRaw === null ||
    lngRaw === null ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return NextResponse.json(
      { error: "valid lat and lng are required" },
      { status: 400 },
    );
  }

  try {
    const result = await reverse(lat, lng);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    if (err instanceof GeocodeUpstreamError) {
      log.error("geocode reverse upstream failed", {
        lat,
        lng,
        error: err.message,
      });
    } else {
      log.error("geocode reverse failed", {
        lat,
        lng,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return NextResponse.json(
      { error: "geocoding unavailable" },
      { status: 502 },
    );
  }
}

export async function GET(req: NextRequest) {
  const started = Date.now();
  if (!(await requireOwner(req))) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const res = await handleGet(req);
  log.info("request", {
    method: "GET",
    path: "/api/geocode/reverse",
    status: res.status,
    ms: Date.now() - started,
  });
  return res;
}
