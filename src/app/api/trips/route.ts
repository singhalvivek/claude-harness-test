// GET /api/trips (list) · POST /api/trips (create) — owner only.
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { storage } from "@/lib/storage";
import { requireOwner } from "@/lib/auth";
import { log } from "@/lib/logger";

type PhotoRow = {
  id: string;
  order: number;
  isCover: boolean;
  kind: string;
  thumbKey: string;
  posterKey: string | null;
};

type TripWithStops = {
  id: string;
  title: string;
  description: string | null;
  theme: string;
  coverPhotoId: string | null;
  isPublished: boolean;
  updatedAt: Date;
  stops: { order: number; photos: PhotoRow[] }[];
};

// `coverThumbUrl` is consumed by an <img> on the trip card, so it must always
// resolve to a STILL. For a video (P2.5) that still is the client-captured
// poster; a video with no poster has no usable thumbnail at all, so it yields
// null and the scan falls through to the next candidate rather than handing an
// .mp4 to an <img>. See the thumbUrl safety rule in spec/data.md.
function stillUrlFor(p: PhotoRow): string | null {
  if (p.kind === "video") {
    return p.posterKey ? storage.url(p.posterKey) : null;
  }
  return storage.url(p.thumbKey);
}

function deriveCoverThumbUrl(trip: TripWithStops): string | null {
  const stopsByOrder = [...trip.stops].sort((a, b) => a.order - b.order);
  if (trip.coverPhotoId) {
    for (const stop of stopsByOrder) {
      const explicit = stop.photos.find((p) => p.id === trip.coverPhotoId);
      if (explicit) {
        const url = stillUrlFor(explicit);
        if (url) return url;
        break; // explicit cover exists but has no still — fall back to the scan
      }
    }
  }
  for (const stop of stopsByOrder) {
    const photos = [...stop.photos].sort((a, b) => a.order - b.order);
    const cover = photos.find((p) => p.isCover) ?? photos[0];
    if (!cover) continue;
    const url = stillUrlFor(cover);
    if (url) return url;
  }
  return null;
}

// Frozen StoryTheme enum (see spec/api.md + spec/capabilities/story-themes.md).
const themeEnum = z.enum(["cinematic", "editorial", "minimal", "vintage"]);

const createSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().optional(),
  theme: themeEnum.optional(),
});

async function handleGet(): Promise<NextResponse> {
  const trips = await prisma.trip.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      stops: {
        orderBy: { order: "asc" },
        include: {
          photos: {
            orderBy: { order: "asc" },
            select: {
              id: true,
              order: true,
              isCover: true,
              kind: true,
              thumbKey: true,
              posterKey: true,
            },
          },
        },
      },
    },
  });

  const summaries = trips.map((trip) => ({
    id: trip.id,
    title: trip.title,
    description: trip.description,
    coverThumbUrl: deriveCoverThumbUrl(trip),
    stopCount: trip.stops.length,
    isPublished: trip.isPublished,
    updatedAt: trip.updatedAt.toISOString(),
    theme: trip.theme,
  }));

  return NextResponse.json({ trips: summaries }, { status: 200 });
}

async function handlePost(req: NextRequest): Promise<NextResponse> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid request body" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const trip = await prisma.trip.create({
    data: {
      title: parsed.data.title,
      description: parsed.data.description,
      // undefined → DB column default ('cinematic')
      theme: parsed.data.theme,
    },
  });

  return NextResponse.json(
    {
      id: trip.id,
      title: trip.title,
      description: trip.description,
      theme: trip.theme,
      isPublished: trip.isPublished,
      shareSlug: trip.shareSlug,
      stops: [],
    },
    { status: 201 },
  );
}

export async function GET(req: NextRequest) {
  const started = Date.now();
  if (!(await requireOwner(req))) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const res = await handleGet();
  log.info("request", {
    method: "GET",
    path: "/api/trips",
    status: res.status,
    ms: Date.now() - started,
  });
  return res;
}

export async function POST(req: NextRequest) {
  const started = Date.now();
  if (!(await requireOwner(req))) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const res = await handlePost(req);
  log.info("request", {
    method: "POST",
    path: "/api/trips",
    status: res.status,
    ms: Date.now() - started,
  });
  return res;
}
