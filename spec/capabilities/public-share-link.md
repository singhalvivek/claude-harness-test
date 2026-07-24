# Capability: Public Share Link *(Phase 2)*

## What It Does
Publishes a finished trip to an unguessable URL that renders the story read-only, with no edit controls and no login.

## Inputs
| Input | Type | Source | Required |
|-------|------|--------|----------|
| publish action | tripId | Editor/home **Publish** → `POST /api/trips/:id/publish` | yes |
| slug | string (≥ 24 URL-safe chars) | visitor URL `/s/:slug` | yes (read) |

## Outputs
| Output | Type | Destination |
|--------|------|-------------|
| `shareSlug`, `isPublished` | Trip fields | SQLite |
| shareUrl | string | Owner UI (copyable) |
| read-only story | rendered page | `/s/:slug` (`slice-public-ui`) |

## External Calls
| System | Operation | On Failure |
|--------|-----------|------------|
| `node:crypto` | `randomBytes` slug generation | local; n/a |
| `/api/media` | photo streaming (public) | placeholder frame |

## Business Rules
- Slug is ≥ 24 URL-safe random chars from `crypto.randomBytes`; possession grants read-only access to that one trip only.
- `/s/:slug` and `/api/public/trips/:slug` are exempt from owner middleware and strip owner-only fields.
- Unknown **or** unpublished slug → 404 (indistinguishable, so unpublished trips can't be probed).
- Unpublish clears the slug + flag; re-publish mints a **fresh** slug, invalidating the old link.

## Success Criteria
- [ ] Publishing returns a ≥ 24-char slug and a working `/s/:slug` page.
- [ ] Opening `/s/:slug` in a context with **no session cookie** renders the story with no edit controls and no "Add stop".
- [ ] A random/unpublished slug returns 404.
- [ ] Unpublishing then re-publishing yields a different slug; the old one 404s.
