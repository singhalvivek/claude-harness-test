# Capability: Cloud Photo Storage (R2/S3) *(Phase 3)*

## What It Does
Stores photo derivatives in Cloudflare R2 / S3 instead of local disk by flipping an env var — same `PhotoStorage` interface, no call-site changes.

## Inputs
| Input | Type | Source | Required |
|-------|------|--------|----------|
| `PHOTO_STORAGE_BACKEND` | `local` \| `r2` | `.env` | yes |
| `R2_*` credentials | strings | `.env` | when backend = r2 |
| photo bytes + key | Buffer, string | `processUpload` / media reads | yes |

## Outputs
| Output | Type | Destination |
|--------|------|-------------|
| stored objects | web/thumb/original | R2/S3 bucket |
| public URL | string via `storage.url(key)` | API responses (R2 URL, bypassing `/api/media`) |

## External Calls
| System | Operation | On Failure |
|--------|-----------|------------|
| R2/S3 (`@aws-sdk/client-s3`) | `PutObject` / `DeleteObject` | 500 with message; retry; the interface contract is identical to local |

## Business Rules
- `R2Storage` implements the frozen `PhotoStorage` interface (`architecture.md#module-contracts`); `src/lib/storage/index.ts` selects the backend by env.
- The DB already stores opaque keys, so **no call site changes** — only the selector and env flip.
- `save` then `url` yields a fetchable object; `delete` removes it. Identical assertions hold for both backends.

## Success Criteria
- [ ] With `PHOTO_STORAGE_BACKEND=r2` and `R2_*` set, an uploaded photo lands in the bucket and displays via its R2 URL.
- [ ] The storage contract test passes against **both** backends (save→url fetchable, delete removes) with no change to upload/serve call sites.
- [ ] Flipping back to `local` still serves existing local-keyed photos.
