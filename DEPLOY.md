# Deploying Wanderline (free, personal)

Recommended stack: **Vercel** (app) + **Neon** (Postgres database) + **Cloudflare R2** (photos).
All have free tiers that fit a personal journal. Photos are stored as **full-resolution originals** in R2.

Why these swaps: Vercel's filesystem is temporary, so the SQLite file and local photos don't
survive there. The database moves to Neon and photos move to R2 — both changes are already wired
behind env vars and the `PhotoStorage` interface.

---

## What you provide (all free accounts)

### 1. Cloudflare R2 (photos)
1. Create a Cloudflare account → **R2**.
2. Create a bucket, e.g. `wanderline-photos`.
3. **Settings → Public access**: enable the **r2.dev** public URL (or attach a custom domain).
   Copy that URL — it is `R2_PUBLIC_BASE_URL` (e.g. `https://pub-xxxxxxxx.r2.dev`).
4. **Manage R2 API Tokens → Create API token** (Object Read & Write). Copy the
   **Access Key ID** and **Secret Access Key**.
5. Your **Account ID** is on the R2 overview page.

Hand me / set in Vercel:
```
PHOTO_STORAGE_BACKEND=r2
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=wanderline-photos
R2_PUBLIC_BASE_URL=https://pub-xxxxxxxx.r2.dev
```

### 2. Neon (Postgres database)
1. Create a Neon account → **new project**.
2. Copy the **pooled** connection string (looks like
   `postgresql://user:pass@ep-xxxx-pooler.region.aws.neon.tech/dbname?sslmode=require`).

Hand me / set in Vercel:
```
DATABASE_URL=postgresql://...  (the pooled connection string)
```

### 3. Two secrets you choose
```
OWNER_PASSWORD=<the password you'll use to edit your journal>   # set it yourself, don't share it
SESSION_SECRET=<32-byte random hex>
```
Generate a session secret locally with:
```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 4. Vercel
1. Sign up at vercel.com and **Add New… → Project → Import** the GitHub repo
   `singhalvivek/claude-harness-test` (branch `wanderline`).
2. Framework preset: **Next.js** (auto-detected).
3. **Build Command** (override): `pnpm prisma migrate deploy && pnpm build`
   — this applies DB migrations on every deploy before building.
4. **Environment Variables**: paste everything from steps 1–3 above.
5. Deploy.

---

## Applying the Phase 2.5 migration (advisory-lock timeout)

`prisma migrate deploy` takes a Postgres **session advisory lock** (`72707369`)
before it touches `_prisma_migrations`. Against this Neon compute that lock query
times out after Prisma's fixed 10 s and the command dies with:

```
Error: P1002 … Timed out trying to acquire a postgres advisory lock
(SELECT pg_advisory_lock(72707369)). Elapsed: 10000ms.
```

This is **not** contention — it reproduces with the compute warm, no other
backend connected, and `pg_locks` empty. Because the Vercel **Build Command**
runs `pnpm prisma migrate deploy` on every deploy, this will fail the *deploy*,
not just a local run.

**Remedy — set this in Vercel → Settings → Environment Variables:**

```
PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=1
```

The lock's only job is to stop two `migrate deploy` runs racing each other. It
does not affect the migration's contents or safety, and the Phase 2.5 migration
is purely additive (`ADD COLUMN` with defaults). The one precaution: **don't
trigger two deploys simultaneously while a migration is still pending** — let
one finish before pushing again. The local gate (`pnpm gate:phase`) already sets
this flag for the same reason.

---

## The one code change that needs your DB URL

The database provider is still `sqlite` in `prisma/schema.prisma` so local dev/tests stay green.
Switching to Postgres requires a provider change + a fresh Postgres migration, which needs a real
`DATABASE_URL` to generate/verify. **Give me your Neon connection string and I will:**

1. Set `provider = "postgresql"` in `prisma/schema.prisma`.
2. Generate the initial Postgres migration (`prisma migrate dev`) against your Neon DB.
3. Verify a clean build + a real upload → R2 round-trip.

If you'd rather do it yourself:
```
# with DATABASE_URL pointed at Neon:
# 1) edit prisma/schema.prisma: datasource db { provider = "postgresql" ... }
pnpm prisma migrate dev --name init_postgres
pnpm prisma generate
```

---

## Local development is unchanged

Nothing above affects local dev. With no `PHOTO_STORAGE_BACKEND` (or `="local"`) and the default
`DATABASE_URL="file:./dev.db"`, the app runs on SQLite + local disk exactly as before:
```
pnpm install
pnpm prisma migrate deploy
pnpm dev            # http://localhost:8001
```

## Notes
- **Originals only:** uploads are stored and displayed at full resolution (no downscaling). On R2's
  free 10 GB with no egress fees this is fine for a personal journal; loads are a bit slower.
- **Costs:** Vercel Hobby is free for non-commercial use; Neon and R2 free tiers are ample here.
- **Photos are public** (served from R2's public URL), same as the local `/api/media` behavior.
