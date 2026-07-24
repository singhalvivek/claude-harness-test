// GET /api/geocode?q=<query> — forward-geocode via the server-side Nominatim
// proxy. Owner only.
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { search, GeocodeUpstreamError } from "@/lib/geocode";
import { requireOwner } from "@/lib/auth";
import { log } from "@/lib/logger";

async function handleGet(req: NextRequest): Promise<NextResponse> {
  const q = req.nextUrl.searchParams.get("q");
  if (!q || q.trim().length === 0) {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }

  try {
    const candidates = await search(q.trim());
    return NextResponse.json({ candidates }, { status: 200 });
  } catch (err) {
    if (err instanceof GeocodeUpstreamError) {
      log.error("geocode search upstream failed", { q, error: err.message });
      return NextResponse.json(
        { error: "geocoding unavailable" },
        { status: 502 },
      );
    }
    log.error("geocode search failed", {
      q,
      error: err instanceof Error ? err.message : String(err),
    });
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
    path: "/api/geocode",
    status: res.status,
    ms: Date.now() - started,
  });
  return res;
}
