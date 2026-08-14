#!/usr/bin/env node
/**
 * Phase 2.5 gate — ONE runnable command: `pnpm gate:phase`.
 *
 * Proves the phase against REAL services: the real Neon Postgres from `.env`
 * (production Prisma driver, never SQLite), a real `next build`, and the real
 * browser. It is deliberately paranoid about two things:
 *
 *   1. **It never touches the `public` schema.** Every destructive statement and
 *      every migration runs inside an isolated `test_gate` schema derived from
 *      the real DATABASE_URL. The resolved schema is ASSERTED to be exactly
 *      "test_gate" before a single DDL statement is executed; a resolved
 *      "public" aborts the run.
 *   2. **It never records video.** `tests/fixtures/clip.mp4` is a COMMITTED
 *      binary. Step 10 verifies it in pure Node (exists / > 10 KB / `ftyp` at
 *      bytes 4..8) and fails loudly rather than substituting a stub. Recording
 *      MP4 in Playwright's bundled Chromium hangs the renderer forever — see
 *      scripts/make-video-fixture.mjs and spec/roadmap.md.
 *
 * Steps (fails loudly, non-zero, at the first red one):
 *    1. parse `.env` for the real Neon DATABASE_URL (no dotenv dependency)
 *    2. derive + ASSERT the `test_gate` URL
 *    3. force-free port 8001 (a stale server serves OLD code)
 *    4. DROP + CREATE the test_gate schema (against the BASE url)
 *    5. apply the pre-2.5 init migration SQL  -> the OLD table shape
 *    6. INSERT real pre-existing rows using ONLY pre-2.5 columns
 *    7. `prisma migrate resolve --applied 20260813000000_init`
 *    8. `prisma migrate deploy`  -> the additive migration onto a POPULATED db
 *    9. `prisma generate` + `next build`  (0 TypeScript errors)
 *   10. verify the committed video fixture (pure Node, no browser)
 *   11. `playwright test` (all specs) against the gate schema + local storage
 *   12. teardown: DROP SCHEMA … CASCADE + rm -rf ./.gate-storage — ALWAYS,
 *       including on Ctrl-C and on any thrown error.
 *
 * Storage: forced to the local backend with a throwaway PHOTO_STORAGE_DIR so the
 * gate never writes test objects into the production R2 bucket, while still
 * exercising the identical presign -> PUT -> complete path through the same
 * PhotoStorage seam. `GATE_USE_R2=1` runs the same gate against the real R2
 * credentials in `.env` instead (the specs delete the trips they create, and a
 * trip delete cascades storage.delete on every object).
 *
 * Secrets: `.env` is read for DATABASE_URL only, nothing is written back, and no
 * value is ever printed — URLs are redacted before logging.
 */

import { spawnSync, execSync } from "node:child_process";
import { existsSync, openSync, readSync, closeSync, statSync, rmSync } from "node:fs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GATE_SCHEMA = "test_gate";
const PORT = 8001;
const GATE_STORAGE_DIR = "./.gate-storage";
const INIT_MIGRATION = "prisma/migrations/20260813000000_init/migration.sql";
const FIXTURE = "tests/fixtures/clip.mp4";
const MIN_FIXTURE_BYTES = 10 * 1024;

const useR2 = process.env.GATE_USE_R2 === "1";

let stepNo = 0;
function step(title) {
  stepNo += 1;
  console.log(`\n[36m── step ${stepNo}: ${title}[0m`);
}
function fail(message) {
  throw new Error(message);
}

/** Never print a connection string: keep the scheme/host shape only. */
function redact(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//***@${u.host}${u.pathname}?schema=${u.searchParams.get("schema") ?? "(none)"}`;
  } catch {
    return "(unparseable url)";
  }
}

// ─── 1. parse .env ───────────────────────────────────────────────────────────
/**
 * Minimal `.env` reader — no dotenv dependency, nothing written back.
 * Handles `KEY=value`, `KEY="value"`, `KEY='value'` and an optional `export`
 * prefix. Quoted values are taken verbatim (inline `#` is NOT treated as a
 * comment inside a value, because a password may legitimately contain one).
 */
function parseEnvFile(file) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const rawLine of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    out[m[1]] = value;
  }
  return out;
}

// ─── child-process helpers ───────────────────────────────────────────────────
function run(command, { input, env: extraEnv, label } = {}) {
  console.log(`   $ ${label ?? command}`);
  const res = spawnSync(command, {
    cwd: ROOT,
    shell: true,
    input,
    stdio: [input === undefined ? "inherit" : "pipe", "inherit", "inherit"],
    env: { ...process.env, ...extraEnv },
  });
  if (res.error) fail(`failed to start: ${label ?? command}\n${res.error.message}`);
  if (res.status !== 0) fail(`command failed (exit ${res.status}): ${label ?? command}`);
}

// ─── teardown (always) ───────────────────────────────────────────────────────
let baseUrl = null;
let tornDown = false;

function teardown(reason) {
  if (tornDown) return;
  tornDown = true;
  console.log(`\n[36m── teardown (${reason})[0m`);

  if (baseUrl) {
    const sql = `DROP SCHEMA IF EXISTS "${GATE_SCHEMA}" CASCADE;`;
    const res = spawnSync(`pnpm exec prisma db execute --url "${baseUrl}" --stdin`, {
      cwd: ROOT,
      shell: true,
      input: sql,
      stdio: ["pipe", "inherit", "inherit"],
      env: process.env,
    });
    if (res.status === 0) {
      console.log(`   dropped schema "${GATE_SCHEMA}"`);
    } else {
      console.error(
        `   [31mWARNING: could not drop schema "${GATE_SCHEMA}" — drop it by hand:[0m\n` +
          `   DROP SCHEMA IF EXISTS "${GATE_SCHEMA}" CASCADE;`,
      );
    }
  }

  try {
    const dir = path.join(ROOT, GATE_STORAGE_DIR);
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
      console.log(`   removed ${GATE_STORAGE_DIR}`);
    }
  } catch (err) {
    console.error(`   WARNING: could not remove ${GATE_STORAGE_DIR}: ${err.message}`);
  }
}

process.on("SIGINT", () => {
  console.log("\n[33mInterrupted (SIGINT).[0m");
  teardown("SIGINT");
  process.exit(130);
});
process.on("SIGTERM", () => {
  teardown("SIGTERM");
  process.exit(143);
});

// ─── port 8001 ───────────────────────────────────────────────────────────────
function freePort(port) {
  if (process.platform === "win32") {
    let out = "";
    try {
      out = execSync(`netstat -ano | findstr :${port}`, { encoding: "utf8" });
    } catch {
      out = ""; // findstr exits 1 when nothing matches — nothing is listening.
    }
    const pids = new Set();
    for (const line of out.split(/\r?\n/)) {
      if (!/LISTENING/i.test(line)) continue;
      const cols = line.trim().split(/\s+/);
      const local = cols[1] ?? "";
      if (!local.endsWith(`:${port}`)) continue;
      const pid = cols[cols.length - 1];
      if (/^\d+$/.test(pid) && pid !== "0") pids.add(pid);
    }
    if (pids.size === 0) {
      console.log(`   nothing listening on :${port}`);
      return;
    }
    for (const pid of pids) {
      try {
        execSync(`taskkill /F /PID ${pid}`, { stdio: "inherit" });
      } catch {
        console.log(`   pid ${pid} already gone`);
      }
    }
  } else {
    try {
      execSync(`lsof -ti:${port} | xargs -r kill -9`, { stdio: "inherit", shell: "/bin/sh" });
    } catch {
      console.log(`   nothing listening on :${port}`);
    }
  }
}

// ─── main ────────────────────────────────────────────────────────────────────
function main() {
  console.log("[1mWanderline — Phase 2.5 gate[0m");

  // 1 ── real Neon DATABASE_URL from .env
  step("read the real DATABASE_URL from .env");
  const envFile = path.join(ROOT, ".env");
  if (!existsSync(envFile)) {
    fail(".env not found. The gate needs the real Neon DATABASE_URL (copy .env.example and fill it in).");
  }
  const dotenv = parseEnvFile(envFile);
  const rawDbUrl = (process.env.GATE_BASE_DATABASE_URL || dotenv.DATABASE_URL || "").trim();
  if (!rawDbUrl) fail("DATABASE_URL is not set in .env.");
  if (!/^postgres(ql)?:\/\//.test(rawDbUrl)) {
    fail(
      "DATABASE_URL is not a Postgres URL. This gate runs destructive DDL in an isolated " +
        "Postgres schema and refuses to run against anything else (never SQLite). " +
        `Received scheme: "${rawDbUrl.split(":")[0]}:".`,
    );
  }
  baseUrl = rawDbUrl;
  console.log(`   base: ${redact(baseUrl)}`);

  // 2 ── derive + ASSERT the gate URL
  step(`derive the isolated "${GATE_SCHEMA}" schema URL`);
  const gate = new URL(baseUrl);
  gate.searchParams.set("schema", GATE_SCHEMA);
  const gateUrl = gate.toString();
  const resolvedSchema = new URL(gateUrl).searchParams.get("schema");
  if (resolvedSchema !== GATE_SCHEMA) {
    fail(
      `refusing to run: the resolved schema is "${resolvedSchema}", not "${GATE_SCHEMA}". ` +
        "The gate executes destructive DDL and must NEVER touch the production schema.",
    );
  }
  if (resolvedSchema === "public") {
    fail('refusing to run: resolved schema is "public".');
  }
  console.log(`   gate: ${redact(gateUrl)}`);

  const gateEnv = {
    DATABASE_URL: gateUrl,
    // Prisma's migrate commands take a session advisory lock (72707369) before
    // touching _prisma_migrations. Against this Neon compute that lock query
    // reliably times out after Prisma's fixed 10s (P1002) even with the compute
    // warm, no other backend connected and pg_locks empty — verified directly.
    // The lock exists ONLY to stop two concurrent migrate runs racing; the gate
    // is a single process against its own isolated `test_gate` schema, so there
    // is nothing to race. Disabling it does NOT weaken the proof: `prisma
    // migrate deploy` still really runs, and still really applies the additive
    // migration onto a POPULATED database (steps 5–8).
    // NOTE: applying this migration to PRODUCTION needs the same flag — see
    // DEPLOY.md ("Applying the Phase 2.5 migration").
    PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK: "1",
    ...(useR2
      ? {}
      : { PHOTO_STORAGE_BACKEND: "local", PHOTO_STORAGE_DIR: GATE_STORAGE_DIR }),
  };
  if (useR2) {
    console.log(
      "   [33mGATE_USE_R2=1 — running against the REAL R2 bucket from .env; the specs " +
        "delete the trips they create and a trip delete cascades storage.delete.[0m",
    );
  }

  // 3 ── free port 8001
  step(`force-free port ${PORT} (a stale server serves OLD code)`);
  freePort(PORT);

  // 4 ── fresh gate schema
  step(`create a fresh "${GATE_SCHEMA}" schema`);
  run(`pnpm exec prisma db execute --url "${baseUrl}" --stdin`, {
    input: `DROP SCHEMA IF EXISTS "${GATE_SCHEMA}" CASCADE;\nCREATE SCHEMA "${GATE_SCHEMA}";\n`,
    label: "prisma db execute --url <base> --stdin  (DROP + CREATE SCHEMA)",
  });

  // 5 ── the PRE-2.5 table shape
  step("apply the pre-2.5 init migration (the OLD table shape)");
  if (!existsSync(path.join(ROOT, INIT_MIGRATION))) {
    fail(`missing ${INIT_MIGRATION} — the gate needs the pre-2.5 schema to migrate FROM.`);
  }
  run(`pnpm exec prisma db execute --url "${gateUrl}" --file ${INIT_MIGRATION}`, {
    label: `prisma db execute --url <gate> --file ${INIT_MIGRATION}`,
  });

  // 6 ── real pre-existing rows, pre-2.5 columns ONLY
  step("insert REAL pre-existing rows (pre-2.5 columns only)");
  const seedSql = `
INSERT INTO "Trip" ("id", "title", "description", "theme", "isPublished", "createdAt", "updatedAt")
VALUES ('gate_legacy_trip', 'Legacy trip', 'shipped before Phase 2.5', 'cinematic', false, NOW(), NOW());

INSERT INTO "Stop" ("id", "tripId", "order", "title", "placeName", "lat", "lng", "locationPrecision", "motif", "createdAt", "updatedAt")
VALUES ('gate_legacy_stop', 'gate_legacy_trip', 0, 'Legacy stop', 'Kyoto, Japan', 34.9671, 135.7727, 'exact', 'none', NOW(), NOW());

INSERT INTO "Photo" ("id", "stopId", "order", "isCover", "webKey", "thumbKey", "originalKey", "width", "height", "caption", "createdAt")
VALUES ('gate_legacy_photo', 'gate_legacy_stop', 0, true,
        'trips/gate_legacy_trip/gate_legacy_stop/legacy/original.jpg',
        'trips/gate_legacy_trip/gate_legacy_stop/legacy/original.jpg',
        'trips/gate_legacy_trip/gate_legacy_stop/legacy/original.jpg',
        1200, 800, 'a photo from before the video split', NOW());
`;
  run(`pnpm exec prisma db execute --url "${gateUrl}" --stdin`, {
    input: seedSql,
    label: "prisma db execute --url <gate> --stdin  (Legacy trip / stop / photo)",
  });

  // 7 ── mark init as applied (do NOT re-run it)
  step("mark the init migration applied");
  run("pnpm exec prisma migrate resolve --applied 20260813000000_init", { env: gateEnv });

  // 8 ── the ADDITIVE migration onto a POPULATED database
  step("apply the additive Phase-2.5 migration onto a POPULATED database");
  run("pnpm exec prisma migrate deploy", { env: gateEnv });

  // 9 ── generate + build (0 TypeScript errors)
  step("prisma generate + next build (0 TypeScript errors)");
  run("pnpm exec prisma generate", { env: gateEnv });
  run("pnpm run build", { env: gateEnv });

  // 10 ── the committed fixture — pure Node, NO browser, NO recording
  step("verify the committed video fixture (pure Node — no browser, no recording)");
  verifyFixture();

  // 11 ── the whole E2E suite against the gate schema
  step("playwright test (all specs) against the gate schema");
  run("pnpm exec playwright test", {
    env: {
      ...gateEnv,
      PLAYWRIGHT_REUSE_SERVER: "0",
    },
  });
}

function verifyFixture() {
  const fixturePath = path.join(ROOT, FIXTURE);
  const actionable =
    `${FIXTURE} is missing or not a real ISO-BMFF video. It is a committed binary fixture; ` +
    "restore it from git (`git checkout -- tests/fixtures/clip.mp4`) or regenerate it OFFLINE " +
    "with `node scripts/make-video-fixture.mjs`, which requires real Microsoft Edge. " +
    "The gate never records video.";

  if (!existsSync(fixturePath)) fail(`${actionable}\n  (file does not exist)`);

  const size = statSync(fixturePath).size;
  if (size <= MIN_FIXTURE_BYTES) {
    fail(`${actionable}\n  (size is ${size} bytes, expected > ${MIN_FIXTURE_BYTES})`);
  }

  const head = Buffer.alloc(12);
  const fd = openSync(fixturePath, "r");
  let read = 0;
  try {
    read = readSync(fd, head, 0, 12, 0);
  } finally {
    closeSync(fd);
  }
  const boxType = read >= 8 ? head.subarray(4, 8).toString("latin1") : "";
  if (boxType !== "ftyp") {
    fail(`${actionable}\n  (bytes 4..8 are ${JSON.stringify(boxType)}, expected "ftyp")`);
  }

  console.log(
    `   ${FIXTURE}: ${size} bytes, box type "${boxType}", brand "${head.subarray(8, 12).toString("latin1")}" — OK`,
  );
}

let exitCode = 0;
try {
  main();
  console.log("\n[32m✔ Phase 2.5 gate PASSED[0m");
} catch (err) {
  exitCode = 1;
  console.error(`\n[31m✘ Phase 2.5 gate FAILED[0m\n${err?.message ?? err}`);
} finally {
  teardown(exitCode === 0 ? "success" : "failure");
}
process.exit(exitCode);
