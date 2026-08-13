"use client";

import { useRef, useState } from "react";
import {
  deletePhoto,
  reorderPhotos,
  setCover,
  updatePhoto,
  uploadPhotos,
  type Photo,
} from "@/lib/api-client";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { ComingSoonPill } from "@/components/ui/Pill";
import { getErrorMessage } from "@/components/ui/errors";

interface UploadItem {
  id: string;
  name: string;
  status: "uploading" | "error";
  file: File;
  message?: string;
}

/**
 * Photo uploader + gallery for a single stop. Each file is uploaded in its own
 * request so one failure produces a per-file error chip with Retry and never
 * affects the stop or the other photos (non-destructive).
 */
export function PhotoUploader({
  stopId,
  photos,
  refresh,
}: {
  stopId: string;
  photos: Photo[];
  refresh: () => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);

  async function uploadOne(file: File) {
    const item: UploadItem = {
      id: crypto.randomUUID(),
      name: file.name,
      status: "uploading",
      file,
    };
    setUploads((prev) => [...prev, item]);
    try {
      await uploadPhotos(stopId, [file]);
      await refresh();
      setUploads((prev) => prev.filter((u) => u.id !== item.id));
    } catch (err) {
      const message = getErrorMessage(err, "Upload failed");
      setUploads((prev) =>
        prev.map((u) => (u.id === item.id ? { ...u, status: "error", message } : u)),
      );
    }
  }

  function handleFiles(files: FileList | File[]) {
    const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
    for (const f of arr) void uploadOne(f);
  }

  function retry(item: UploadItem) {
    setUploads((prev) => prev.filter((u) => u.id !== item.id));
    void uploadOne(item.file);
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

  async function removePhoto(photoId: string) {
    if (!window.confirm("Delete this photo? This cannot be undone.")) return;
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
        <h4 className="text-sm font-semibold text-ink">Photos</h4>
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
        <p className="text-sm text-ink/60">Drag &amp; drop photos here, or</p>
        <Button variant="secondary" onClick={() => inputRef.current?.click()}>
          Choose files
        </Button>
        <p className="text-xs text-ink/40">JPEG, PNG, WebP or HEIC — large phone photos are fine.</p>
        <input
          ref={inputRef}
          data-testid="photo-file-input"
          type="file"
          accept="image/*"
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
              className={`flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm ${
                u.status === "error"
                  ? "border-red-200 bg-red-50 text-red-700"
                  : "border-ink/10 bg-ink/[0.02] text-ink/70"
              }`}
            >
              <span className="flex min-w-0 items-center gap-2">
                {u.status === "uploading" ? <Spinner /> : <span aria-hidden="true">⚠</span>}
                <span className="truncate">{u.name}</span>
              </span>
              {u.status === "uploading" ? (
                <span className="text-xs text-ink/50">Uploading…</span>
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
          {photos.map((p, i) => (
            <li
              key={p.id}
              data-testid="photo-item"
              data-photo-id={p.id}
              className="flex flex-col gap-1.5 rounded-md border border-ink/10 bg-white p-2"
            >
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  data-testid="photo-thumb"
                  src={p.thumbUrl}
                  alt={p.caption ?? "Stop photo"}
                  className="aspect-[4/3] w-full rounded object-cover"
                />
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
                  if (e.target.value !== (p.caption ?? "")) void saveCaption(p.id, e.target.value);
                }}
                className="w-full rounded border border-ink/15 px-2 py-1 text-xs outline-none focus:border-trail"
              />
              <div className="flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  data-testid="photo-set-cover"
                  disabled={busy || p.isCover}
                  onClick={() => handleSetCover(p.id)}
                  title="Set as cover"
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
                  onClick={() => removePhoto(p.id)}
                  title="Delete photo"
                  className="rounded border border-red-200 px-1.5 py-0.5 text-xs text-red-700 hover:bg-red-50 disabled:opacity-40"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
