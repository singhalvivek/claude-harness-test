"use client";

import { useRef, useState } from "react";
import {
  deletePhoto,
  isVideoFile,
  reorderPhotos,
  setCover,
  updatePhoto,
  uploadMediaDirect,
  VIDEO_MIME_TYPES,
  type Media,
} from "@/lib/api-client";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { ComingSoonPill } from "@/components/ui/Pill";
import { getErrorMessage } from "@/components/ui/errors";

/** Stage reported by `uploadMediaDirect` while one media item is in flight. */
type UploadStage = "reading" | "uploading" | "poster" | "finishing";

/** Video shows the full four-stage story; a photo has no video read and no
 *  poster step, so its "reading" (intrinsic size) reads as plain "Uploading…". */
const VIDEO_STAGE_LABEL: Record<UploadStage, string> = {
  reading: "Reading video…",
  uploading: "Uploading…",
  poster: "Poster…",
  finishing: "Finishing…",
};

const PHOTO_STAGE_LABEL: Record<UploadStage, string> = {
  reading: "Uploading…",
  uploading: "Uploading…",
  poster: "Uploading…",
  finishing: "Finishing…",
};

function stageLabel(stage: UploadStage, isVideo: boolean): string {
  return (isVideo ? VIDEO_STAGE_LABEL : PHOTO_STAGE_LABEL)[stage];
}

/** Advisory (never blocking) threshold — 200 MB. */
const LARGE_FILE_BYTES = 200 * 1024 * 1024;

const REJECTED_MESSAGE = "Only images and MP4/MOV/WebM video can be uploaded.";

/** `image/*` plus the three accepted video types, for the picker's accept list. */
const ACCEPT_ATTR = ["image/*", ...VIDEO_MIME_TYPES].join(",");

interface UploadItem {
  id: string;
  name: string;
  status: "uploading" | "error";
  stage: UploadStage;
  isVideo: boolean;
  file: File;
  message?: string;
  advisory?: string;
}

/** `0:03`, `1:24`, `1:02:05` — the duration badge's text. */
function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

function formatSize(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

/** Best-effort display name for a stored object (media rows carry no filename). */
function fileNameFromUrl(url: string): string {
  const segment = url.split("?")[0].split("/").filter(Boolean).pop();
  if (!segment) return "video";
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** Neutral film-strip mark — used wherever a poster image does not exist yet. */
function FilmStripMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 16"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className={className ?? "h-4 w-6"}
    >
      <rect x="1" y="1" width="22" height="14" rx="2" />
      <path d="M6.5 1v14M17.5 1v14" />
    </svg>
  );
}

/**
 * Media uploader + gallery for a single stop — photos **and** video. Each file is
 * uploaded in its own request so one failure produces a per-file error chip with
 * Retry and never affects the stop or the other media (non-destructive).
 *
 * Video metadata (width/height/duration) and the poster frame are produced in the
 * BROWSER by `readVideoMetadata` inside `uploadMediaDirect` — there is no ffmpeg
 * and the server never decodes video. When the browser cannot decode a clip the
 * upload still completes and the tile degrades to a labelled film-strip
 * placeholder rather than a broken image.
 */
export function PhotoUploader({
  stopId,
  photos,
  refresh,
}: {
  stopId: string;
  photos: Media[];
  refresh: () => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);

  function patchUpload(id: string, patch: Partial<UploadItem>) {
    setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));
  }

  async function uploadOne(file: File) {
    const video = isVideoFile(file);
    const item: UploadItem = {
      id: crypto.randomUUID(),
      name: file.name,
      status: "uploading",
      // A video starts by being read in the browser; a photo goes straight up.
      stage: video ? "reading" : "uploading",
      isVideo: video,
      file,
      advisory:
        file.size > LARGE_FILE_BYTES
          ? `Large file (${formatSize(file.size)}) — this may take a while.`
          : undefined,
    };
    setUploads((prev) => [...prev, item]);
    try {
      // Direct-to-storage upload (presign → PUT → PUT poster → complete) so
      // full-resolution originals and long videos of any size work, bypassing
      // the serverless body-size limit.
      await uploadMediaDirect(stopId, file, (stage) => patchUpload(item.id, { stage }));
      await refresh();
      setUploads((prev) => prev.filter((u) => u.id !== item.id));
    } catch (err) {
      const message = getErrorMessage(err, "Upload failed");
      patchUpload(item.id, { status: "error", message });
    }
  }

  /** An unsupported file gets the same per-file error chip + Retry as a failure. */
  function rejectFile(file: File) {
    setUploads((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name: file.name,
        status: "error",
        stage: "uploading",
        isVideo: false,
        file,
        message: REJECTED_MESSAGE,
      },
    ]);
  }

  function isAccepted(file: File): boolean {
    return file.type.startsWith("image/") || isVideoFile(file);
  }

  function handleFiles(files: FileList | File[]) {
    for (const f of Array.from(files)) {
      if (isAccepted(f)) void uploadOne(f);
      else rejectFile(f);
    }
  }

  function retry(item: UploadItem) {
    setUploads((prev) => prev.filter((u) => u.id !== item.id));
    handleFiles([item.file]);
  }

  async function handleSetCover(photoId: string) {
    setBusy(true);
    try {
      await setCover(photoId);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function movePhoto(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= photos.length) return;
    const ids = photos.map((p) => p.id);
    const tmp = ids[index];
    ids[index] = ids[target];
    ids[target] = tmp;
    setBusy(true);
    try {
      await reorderPhotos(stopId, ids);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function saveCaption(photoId: string, caption: string) {
    try {
      await updatePhoto(photoId, { caption });
      await refresh();
    } catch {
      // Caption is a soft edit; leave the field value as typed on failure.
    }
  }

  async function removePhoto(photoId: string, isVideo: boolean) {
    const what = isVideo ? "video" : "photo";
    if (!window.confirm(`Delete this ${what}? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await deletePhoto(photoId);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h4 data-testid="media-uploader-heading" className="text-sm font-semibold text-ink">
          Photos &amp; video
        </h4>
        <ComingSoonPill label="EXIF auto-location" testId="exif-coming-soon" />
        <ComingSoonPill label="Cloud storage" testId="cloud-storage-coming-soon" />
      </div>

      <div
        data-testid="photo-dropzone"
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files);
        }}
        className={`flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-6 text-center transition-colors ${
          dragOver ? "border-trail bg-trail/5" : "border-ink/20 bg-ink/[0.02]"
        }`}
      >
        <p className="text-sm text-ink/60">Drag &amp; drop photos or video here, or</p>
        <Button variant="secondary" onClick={() => inputRef.current?.click()}>
          Choose files
        </Button>
        <p className="text-xs text-ink/40">
          JPEG, PNG, WebP, HEIC — or MP4, MOV, WebM video. Large phone files are fine.
        </p>
        <input
          ref={inputRef}
          data-testid="photo-file-input"
          type="file"
          accept={ACCEPT_ATTR}
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {uploads.length > 0 && (
        <ul className="space-y-1.5">
          {uploads.map((u) => (
            <li
              key={u.id}
              data-testid={u.status === "error" ? "photo-error" : "photo-uploading"}
              data-media-kind={u.isVideo ? "video" : "photo"}
              className={`flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm ${
                u.status === "error"
                  ? "border-red-200 bg-red-50 text-red-700"
                  : "border-ink/10 bg-ink/[0.02] text-ink/70"
              }`}
            >
              <span className="flex min-w-0 items-center gap-2">
                {u.status === "error" ? (
                  <span aria-hidden="true">⚠</span>
                ) : u.isVideo ? (
                  // Film-strip placeholder while the poster frame is produced.
                  <span
                    data-testid="media-filmstrip-pending"
                    title="Preparing the poster frame…"
                    className="flex h-7 w-10 shrink-0 items-center justify-center rounded bg-ink/10 text-ink/45"
                  >
                    <FilmStripMark />
                  </span>
                ) : (
                  <Spinner />
                )}
                <span className="min-w-0">
                  <span className="block truncate">{u.name}</span>
                  {u.advisory && (
                    <span data-testid="media-large-advisory" className="block text-xs text-ink/45">
                      {u.advisory}
                    </span>
                  )}
                </span>
              </span>
              {u.status === "uploading" ? (
                <span className="flex shrink-0 items-center gap-2">
                  {u.isVideo && <Spinner />}
                  <span data-testid="media-stage" className="text-xs text-ink/50">
                    {stageLabel(u.stage, u.isVideo)}
                  </span>
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <span className="text-xs">{u.message}</span>
                  <button
                    type="button"
                    data-testid="photo-retry"
                    onClick={() => retry(u)}
                    className="rounded border border-red-300 bg-white px-2 py-0.5 text-xs font-medium text-red-700 hover:bg-red-100"
                  >
                    Retry
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {photos.length > 0 && (
        <ul data-testid="photo-gallery" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((p, i) => {
            const isVideo = p.kind === "video";
            // A video's poster is the only image safe to put in an <img>; a photo
            // always has a thumb. No poster → the labelled film-strip placeholder.
            const imageSrc = isVideo ? p.posterUrl : p.thumbUrl;
            const durationLabel =
              p.durationSec != null && p.durationSec > 0 ? formatDuration(p.durationSec) : "Video";

            return (
              <li
                key={p.id}
                data-testid="photo-item"
                data-photo-id={p.id}
                data-media-kind={p.kind}
                className="flex flex-col gap-1.5 rounded-md border border-ink/10 bg-white p-2"
              >
                <div className="relative">
                  {imageSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      data-testid="photo-thumb"
                      data-media-kind={p.kind}
                      src={imageSrc}
                      alt={p.caption ?? (isVideo ? "Video poster frame" : "Stop photo")}
                      className="aspect-[4/3] w-full rounded object-cover"
                    />
                  ) : (
                    <div
                      data-testid="media-filmstrip"
                      title={`${fileNameFromUrl(p.webUrl)} — no preview frame could be captured in this browser.`}
                      className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-1 rounded bg-ink/5 px-2 text-center text-ink/45"
                    >
                      <FilmStripMark className="h-5 w-8" />
                      <span className="text-[10px] font-medium">No preview</span>
                      <span className="w-full truncate text-[10px] text-ink/40">
                        {fileNameFromUrl(p.webUrl)}
                      </span>
                    </div>
                  )}
                  {isVideo && (
                    <span
                      data-testid="media-duration"
                      className="absolute bottom-1 right-1 rounded bg-ink/75 px-1.5 py-0.5 text-[10px] font-semibold text-paper"
                    >
                      ▶ {durationLabel}
                    </span>
                  )}
                  {p.isCover && (
                    <span
                      data-testid="photo-cover-badge"
                      className="absolute left-1 top-1 rounded-full bg-trail px-2 py-0.5 text-[10px] font-semibold text-paper"
                    >
                      ★ Cover
                    </span>
                  )}
                </div>
                <input
                  data-testid="photo-caption"
                  type="text"
                  defaultValue={p.caption ?? ""}
                  placeholder="Add a caption…"
                  onBlur={(e) => {
                    if (e.target.value !== (p.caption ?? "")) {
                      void saveCaption(p.id, e.target.value);
                    }
                  }}
                  className="w-full rounded border border-ink/15 px-2 py-1 text-xs outline-none focus:border-trail"
                />
                <div className="flex flex-wrap items-center gap-1">
                  <button
                    type="button"
                    data-testid="photo-set-cover"
                    disabled={busy || p.isCover}
                    onClick={() => handleSetCover(p.id)}
                    title={isVideo ? "Set this video as the cover" : "Set as cover"}
                    className="rounded border border-ink/15 px-1.5 py-0.5 text-xs text-ink/70 hover:bg-ink/5 disabled:opacity-40"
                  >
                    ★ Cover
                  </button>
                  <button
                    type="button"
                    data-testid="photo-move-up"
                    disabled={busy || i === 0}
                    onClick={() => movePhoto(i, -1)}
                    title="Move earlier"
                    className="rounded border border-ink/15 px-1.5 py-0.5 text-xs text-ink/70 hover:bg-ink/5 disabled:opacity-40"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    data-testid="photo-move-down"
                    disabled={busy || i === photos.length - 1}
                    onClick={() => movePhoto(i, 1)}
                    title="Move later"
                    className="rounded border border-ink/15 px-1.5 py-0.5 text-xs text-ink/70 hover:bg-ink/5 disabled:opacity-40"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    data-testid="photo-delete"
                    disabled={busy}
                    onClick={() => removePhoto(p.id, isVideo)}
                    title={isVideo ? "Delete video" : "Delete photo"}
                    className="rounded border border-red-200 px-1.5 py-0.5 text-xs text-red-700 hover:bg-red-50 disabled:opacity-40"
                  >
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
