#!/usr/bin/env node
/**
 * OFFLINE, MANUAL regeneration utility for `tests/fixtures/clip.mp4`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * READ THIS BEFORE RUNNING OR EDITING.
 *
 * `tests/fixtures/clip.mp4` is a COMMITTED BINARY (real H.264 MP4, 640×360,
 * ~3.33 s, ~93.6 KB, header `ftypisom`). It is repo input:
 *
 *   • The gate (`scripts/gate-phase.mjs`) NEVER invokes this script and NEVER
 *     records video. Its only fixture work is a pure-Node integrity check
 *     (exists / > 10 KB / bytes 4..8 === "ftyp").
 *   • NO test references this script.
 *   • Run it BY HAND, offline, only when the fixture must genuinely be
 *     regenerated (e.g. it was lost and cannot be restored with
 *     `git checkout -- tests/fixtures/clip.mp4`).
 *
 * ─── It requires REAL Microsoft Edge ─────────────────────────────────────────
 *
 * Launch is hard-wired to `chromium.launch({ channel: "msedge" })`. Real Edge
 * ships the proprietary H.264/AAC encoders and DOES produce a playable MP4
 * headlessly. The script REFUSES to run under Playwright's bundled Chromium.
 *
 * ⚠️ THE TRAP — DO NOT "FIX" THIS BY FALLING BACK TO BUNDLED CHROMIUM.
 * In Playwright's bundled Chromium, `MediaRecorder.isTypeSupported('video/mp4')`
 * and `…('video/mp4;codecs=avc1.42E01E')` both return **true** — it lies — and
 * `MediaRecorder.start()` fires `onstart` and then **hangs the renderer
 * forever**: no `dataavailable`, no `onstop`, and even a `setTimeout` race
 * placed INSIDE `page.evaluate()` never resolves, so the evaluate promise never
 * settles. A "prefer MP4, fall back to WebM" script therefore hangs the caller
 * indefinitely instead of failing over. That is exactly why recording was
 * removed from the gate and why this script refuses to run there. (WebM VP8
 * does record in bundled Chromium, but an automatic-frame recording produced a
 * degenerate file with `duration: 0` — useless for a duration assertion.)
 *
 * ─── The measured working recipe (Edge, Windows 11, Playwright 1.61.1) ───────
 *
 *   const stream = canvas.captureStream(0);   // 0 = MANUAL frame mode
 *   const track  = stream.getVideoTracks()[0];
 *   const rec = new MediaRecorder(stream, {
 *     mimeType: 'video/mp4;codecs=avc1.42E01E',
 *     videoBitsPerSecond: 800_000,
 *   });
 *   // …draw a frame, then track.requestFrame() — ~90 frames at ~33 ms.
 *
 * `canvas.captureStream(25)` (automatic frame capture) yields **0-byte chunks
 * in Edge**, so the manual `requestFrame()` loop per drawn frame is REQUIRED.
 * Everything is additionally guarded by a Node-side timeout, because an
 * in-page timeout cannot rescue a hung renderer.
 *
 * ─── Usage ───────────────────────────────────────────────────────────────────
 *
 *   node scripts/make-video-fixture.mjs [outPath] [--force]
 *
 * Default `outPath` is `tests/fixtures/clip.mp4`. The script REFUSES to
 * overwrite an existing file unless `--force` is passed, so it can never
 * clobber the committed fixture by accident.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { existsSync, mkdirSync, writeFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const REQUIRED_CHANNEL = "msedge";
const WIDTH = 640;
const HEIGHT = 360;
const FRAMES = 90;
const FRAME_MS = 33;
const MIME = "video/mp4;codecs=avc1.42E01E";
const BITRATE = 800_000;
// Generous, but finite: a hung renderer must kill the process, not wedge it.
const RECORD_TIMEOUT_MS = 120_000;

const REFUSAL =
  "REFUSING TO RECORD: this utility requires REAL Microsoft Edge " +
  '(chromium.launch({ channel: "msedge" })). MP4 recording HANGS THE RENDERER ' +
  "FOREVER in Playwright's bundled Chromium, and MediaRecorder.isTypeSupported() " +
  "cannot be trusted there (it returns true for video/mp4 and then never emits a " +
  "single dataavailable event). Install Microsoft Edge and re-run, or restore the " +
  "committed fixture with `git checkout -- tests/fixtures/clip.mp4`.";

function die(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

const args = process.argv.slice(2);
const force = args.includes("--force");
const outArg = args.find((a) => !a.startsWith("--")) ?? "tests/fixtures/clip.mp4";
const outPath = path.resolve(ROOT, outArg);

if (existsSync(outPath) && !force) {
  die(
    `${outArg} already exists and is a COMMITTED binary fixture — refusing to overwrite it.\n` +
      "Pass --force only if you are deliberately regenerating it (and re-verify size + `ftyp`).",
  );
}

const { chromium } = await import("@playwright/test");

console.log(`Launching Microsoft Edge (channel: "${REQUIRED_CHANNEL}")…`);
let browser;
try {
  browser = await chromium.launch({ channel: REQUIRED_CHANNEL });
} catch (err) {
  die(`${REFUSAL}\n\nLaunch error: ${err?.message ?? err}`);
}

try {
  const page = await browser.newPage();

  // Guard: prove we really are in Edge, not bundled Chromium. A bundled build
  // would happily claim MP4 support and then hang, so we bail out BEFORE
  // touching MediaRecorder.
  const ua = await page.evaluate(() => navigator.userAgent);
  if (!/\bEdg\//.test(ua)) {
    die(`${REFUSAL}\n\nDetected user agent: ${ua}`);
  }
  console.log(`   Edge confirmed: ${ua}`);

  const recorded = await Promise.race([
    page.evaluate(
      async ({ width, height, frames, frameMs, mime, bitrate }) => {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("no 2d context");

        // captureStream(0) = MANUAL frame mode. captureStream(25) yields
        // 0-byte chunks in Edge — do not change this.
        const stream = canvas.captureStream(0);
        const track = stream.getVideoTracks()[0];

        const chunks = [];
        const rec = new MediaRecorder(stream, {
          mimeType: mime,
          videoBitsPerSecond: bitrate,
        });
        rec.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) chunks.push(e.data);
        };
        const stopped = new Promise((resolve) => {
          rec.onstop = () => resolve();
        });

        rec.start();

        for (let i = 0; i < frames; i += 1) {
          const t = i / frames;
          // A moving, high-contrast scene: motion is what makes the encoder
          // emit real frames instead of collapsing the whole clip.
          ctx.fillStyle = `hsl(${Math.round(t * 320)}, 70%, 22%)`;
          ctx.fillRect(0, 0, width, height);
          ctx.fillStyle = "#ffd166";
          const x = 40 + t * (width - 200);
          ctx.fillRect(x, height / 2 - 60, 160, 120);
          ctx.fillStyle = "#ffffff";
          ctx.font = "bold 40px sans-serif";
          ctx.fillText(`wanderline ${i}`, 30, 60);

          track.requestFrame(); // REQUIRED in manual mode — one per drawn frame
          await new Promise((r) => setTimeout(r, frameMs));
        }

        rec.stop();
        await stopped;

        const blob = new Blob(chunks, { type: "video/mp4" });
        const buf = await blob.arrayBuffer();
        let binary = "";
        const bytes = new Uint8Array(buf);
        for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
        return btoa(binary);
      },
      { width: WIDTH, height: HEIGHT, frames: FRAMES, frameMs: FRAME_MS, mime: MIME, bitrate: BITRATE },
    ),
    new Promise((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              `recording did not finish within ${RECORD_TIMEOUT_MS} ms — the renderer is hung. ` +
                "This is the documented bundled-Chromium MP4 failure mode; only real Edge can encode MP4.",
            ),
          ),
        RECORD_TIMEOUT_MS,
      ),
    ),
  ]);

  const buffer = Buffer.from(recorded, "base64");
  if (buffer.length < 10 * 1024 || buffer.subarray(4, 8).toString("latin1") !== "ftyp") {
    die(
      `the recorder produced ${buffer.length} bytes with box type ` +
        `"${buffer.subarray(4, 8).toString("latin1")}" — not a usable ISO-BMFF MP4. Nothing was written.`,
    );
  }

  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, buffer);
  console.log(
    `\nWrote ${outArg} — ${statSync(outPath).size} bytes, box type "ftyp". ` +
      "Verify it plays, then commit it as a binary fixture.",
  );
} catch (err) {
  die(`Recording failed: ${err?.message ?? err}`);
} finally {
  await browser.close().catch(() => {});
}
