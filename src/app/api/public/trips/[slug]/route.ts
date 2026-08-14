// GET /api/public/trips/:slug — PUBLIC read (no session).
//
// Exempted from owner auth by src/middleware.ts. Returns the SAME full Trip
// shape as the owner GET /api/trips/:tripId (stops sorted by order, each with
// photos + tags, plus theme) ONLY when the slug matches a PUBLISHED trip.
// Unknown slug and unpublished/private trip both return an identical 404 so a
// private trip can't be probed via its slug.
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import type { Trip, Stop, Photo } from "@prisma/client";
import { prisma } from "@/lib/db";
import { storage } from "@/lib/storage";
import { log } from "@/lib/logger";
import type { FeelingPlacement, MediaKind } from "@/lib/api-client";

// The Tag/StopTag Prisma models are added by the parallel slice-tags migration;
// the generated client is regenerated at gate time. We type the tag join shape
// locally (per spec/data.md) so this file does not depend on regenerated
// @prisma/client tag types to compile.
type TagJoin = { tag: { id: string; label: string; kind: string } };
type StopWithRelations = Stop & { photos: Photo[]; tags: TagJoin[] };
type TripFull = Trip & { stops: StopWithRelations[] };

// Frozen FeelingPlacement enum (spec/api.md + spec/capabilities/feeling-cards.md).
const FEELING_PLACEMENTS = ["card", "inline", "none"] as const;

/** Unknown/absent placement falls back to "card" (feeling-cards.md). */
function readPlacement(value: unknown): FeelingPlacement {
  return (FEELING_PLACEMENTS as readonly string[]).includes(value as string)
    ? (value as FeelingPlacement)
    : "card";
}

/** Blank/whitespace-only feeling is not a feeling — it reads back as null. */
function normalizeFeeling(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// Full media shape frozen in spec/api.md: kind + posterUrl + durationSec on
// EVERY media item. thumbUrl safety rule (data.md): a video with a poster
// resolves thumbUrl to the poster; a video without one resolves it to webUrl.
function serializeMedia(p: Photo) {
  const kind: MediaKind = p.kind === "video" ? "video" : "photo";
  const webUrl = storage.url(p.webKey);
  const posterUrl =
    kind === "video" && p.posterKey ? storage.url(p.posterKey) : null;
  const durationSec =
    kind === "video" &&
    typeof p.durationSec === "number" &&
    Number.isFinite(p.durationSec)
      ? p.durationSec
      : null;
  return {
    id: p.id,
    order: p.order,
    isCover: p.isCover,
    kind,
    webUrl,
    thumbUrl: kind === "video" ? (posterUrl ?? webUrl) : storage.url(p.thumbKey),
    posterUrl,
    durationSec,
    width: p.width,
    height: p.height,
    caption: p.caption,
  };
}

function serializeStop(s: StopWithRelations) {
  return {
    id: s.id,
    order: s.order,
    title: s.title,
    placeName: s.placeName,
    lat: s.lat,
    lng: s.lng,
    locationPrecision: s.locationPrecision,
    occurredAt: s.occurredAt ? s.occurredAt.toISOString() : null,
    body: s.body,
    motif: s.motif,
    feeling: normalizeFeeling(s.feeling),
    feelingPlacement: readPlacement(s.feelingPlacement),
    tags: (s.tags ?? []).map(({ tag }) => ({
      id: tag.id,
      label: tag.label,
      kind: tag.kind,
    })),
    photos: [...s.photos].sort((a, b) => a.order - b.order).map(serializeMedia),
  };
}

// Same shape as the owner serializer. No owner-only fields beyond what the owner
// serializer already omits (no storage keys, no coverPhotoId, no timestamps).
function serializePublicTrip(t: TripFull) {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    theme: t.theme,
    isPublished: t.isPublished,
    shareSlug: t.shareSlug,
    stops: [...t.stops].sort((a, b) => a.order - b.order).map(serializeStop),
  };
}

function loadTripBySlug(slug: string) {
  return prisma.trip.findUnique({
    where: { shareSlug: slug },
    include: {
      stops: {
        orderBy: { order: "asc" },
        include: {
          photos: { orderBy: { order: "asc" } },
          // Resolved from the StopTag relation (each carries its `tag`); the
          // relation exists after the slice-tags migration + client regen.
          tags: { include: { tag: true } },
        },
      },
    },
  });
}

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const started = Date.now();
  const { slug } = await params;

  let res: NextResponse;
  try {
    const trip = (await loadTripBySlug(slug)) as unknown as TripFull | null;
    // Unknown OR unpublished → identical 404 (indistinguishable, so a private
    // trip can never be confirmed to exist via its slug).
    if (!trip || !trip.isPublished) {
      res = NextResponse.json({ error: "not found" }, { status: 404 });
    } else {
      res = NextResponse.json(serializePublicTrip(trip), { status: 200 });
    }
  } catch (err) {
    log.error("public trip read failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    res = NextResponse.json({ error: "internal error" }, { status: 500 });
  }

  log.info("request", {
    method: "GET",
    path: `/api/public/trips/${slug}`,
    status: res.status,
    ms: Date.now() - started,
  });
  return res;
}
