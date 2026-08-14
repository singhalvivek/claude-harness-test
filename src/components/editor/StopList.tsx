"use client";

import { type Stop } from "@/lib/api-client";
import { Button } from "@/components/ui/Button";
import { formatDateTime } from "./format";

/** Neutral film-strip mark for a video cover that has no poster frame. */
function FilmStripMark() {
  return (
    <svg
      viewBox="0 0 24 16"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className="h-4 w-6"
    >
      <rect x="1" y="1" width="22" height="14" rx="2" />
      <path d="M6.5 1v14M17.5 1v14" />
    </svg>
  );
}

function StopCard({
  stop,
  index,
  total,
  onMoveUp,
  onMoveDown,
  onEdit,
  onDelete,
}: {
  stop: Stop;
  index: number;
  total: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const cover = stop.photos.find((p) => p.isCover) ?? stop.photos[0];
  const label = stop.placeName || stop.title || "Untitled stop";
  const coverIsVideo = cover?.kind === "video";
  // A video's poster is the only image safe in an <img>; without one we show a
  // neutral film-strip tile rather than a broken image.
  const coverSrc = cover ? (coverIsVideo ? cover.posterUrl : cover.thumbUrl) : null;

  return (
    <li
      data-testid="stop-card"
      data-stop-id={stop.id}
      className="flex items-center gap-3 rounded-lg border border-ink/10 bg-white p-3"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-trail/10 text-sm font-semibold text-trail">
        {index + 1}
      </span>
      {cover ? (
        <span
          data-testid="stop-cover-thumb"
          data-media-kind={cover.kind}
          className="relative block h-14 w-14 shrink-0"
        >
          {coverSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              data-testid="stop-cover-image"
              src={coverSrc}
              alt=""
              className="h-14 w-14 rounded-md object-cover"
            />
          ) : (
            <span
              data-testid="stop-cover-filmstrip"
              title="Video — no preview frame"
              className="flex h-14 w-14 items-center justify-center rounded-md bg-ink/5 text-ink/40"
            >
              <FilmStripMark />
            </span>
          )}
          {coverIsVideo && (
            <span
              data-testid="stop-cover-video-badge"
              aria-label="Video cover"
              className="absolute bottom-0.5 right-0.5 rounded bg-ink/75 px-1 py-px text-[9px] font-semibold leading-none text-paper"
            >
              ▶
            </span>
          )}
        </span>
      ) : (
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-ink/5 text-[10px] text-ink/40">
          No photo
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p data-testid="stop-place-name" className="truncate font-serif text-lg text-ink">
          {label}
        </p>
        <p className="text-xs text-ink/50">{formatDateTime(stop.occurredAt)}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          data-testid="stop-move-up"
          variant="secondary"
          className="px-2 py-1"
          disabled={index === 0}
          onClick={onMoveUp}
          aria-label="Move stop up"
        >
          ↑
        </Button>
        <Button
          data-testid="stop-move-down"
          variant="secondary"
          className="px-2 py-1"
          disabled={index === total - 1}
          onClick={onMoveDown}
          aria-label="Move stop down"
        >
          ↓
        </Button>
        <Button data-testid="stop-edit" variant="ghost" className="px-2 py-1" onClick={onEdit}>
          Edit
        </Button>
        <Button data-testid="stop-delete" variant="danger" className="px-2 py-1" onClick={onDelete}>
          Delete
        </Button>
      </div>
    </li>
  );
}

/**
 * Ordered stop list with ↑/↓ reorder. Reordering computes the full new id order
 * and hands it to `onReorder` (which persists via `POST …/stops/reorder`).
 */
export function StopList({
  stops,
  onReorder,
  onEdit,
  onDelete,
}: {
  stops: Stop[];
  onReorder: (orderedStopIds: string[]) => void;
  onEdit: (stopId: string) => void;
  onDelete: (stopId: string) => void;
}) {
  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= stops.length) return;
    const ids = stops.map((s) => s.id);
    const tmp = ids[index];
    ids[index] = ids[target];
    ids[target] = tmp;
    onReorder(ids);
  }

  return (
    <ol data-testid="stop-list" className="space-y-2">
      {stops.map((s, i) => (
        <StopCard
          key={s.id}
          stop={s}
          index={i}
          total={stops.length}
          onMoveUp={() => move(i, -1)}
          onMoveDown={() => move(i, 1)}
          onEdit={() => onEdit(s.id)}
          onDelete={() => onDelete(s.id)}
        />
      ))}
    </ol>
  );
}
