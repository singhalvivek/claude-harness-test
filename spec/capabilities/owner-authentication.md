# Capability: Owner Authentication

## What It Does
Authenticates the single owner with one password and gates every authoring surface behind a signed session cookie, while booting safely even when no secrets are configured.

## Inputs
| Input | Type | Source | Required |
|-------|------|--------|----------|
| password | string | Login form → `POST /api/auth/login` | yes |
| session cookie | signed HMAC token | Browser cookie on every request | no (absence = unauthenticated) |
| `OWNER_PASSWORD` | string (env) | `.env` / safe dev default `letmein` | no (defaults) |
| `SESSION_SECRET` | string (env) | `.env` / safe dev default | no (defaults) |

## Outputs
| Output | Type | Destination |
|--------|------|-------------|
| `session` cookie | httpOnly, SameSite=Lax signed token | Browser (set on login, cleared on logout) |
| session state | `{ owner, usingDevDefaults }` | `GET /api/auth/session` → login banner |
| access decision | redirect to `/login` (pages) / 401 (owner APIs) | `src/middleware.ts` |

## External Calls
| System | Operation | On Failure |
|--------|-----------|------------|
| none | HMAC sign/verify is local (`node:crypto`) | verify failure → treat as unauthenticated |

## Business Rules
- Compare the submitted password to `env.OWNER_PASSWORD` server-side only; never store, log, or echo it.
- On match, issue an HMAC-signed session token (`SESSION_SECRET`) as an httpOnly, SameSite=Lax cookie (`Secure` in production).
- The app **must boot without** `OWNER_PASSWORD`/`SESSION_SECRET`: fall back to documented dev defaults, set `usingDevDefaults=true`, and `console.warn`. The login page shows a warning banner in that state.
- Middleware protects `/`, `/trips/**`, and owner `/api/**` writes; it exempts `/login`, `/api/auth/login`, `/health`, `/api/media/**` (and P2 public routes).
- Only the owner can create/edit; there is no signup, no roles, no third-party auth.

## Success Criteria
- [ ] With no `.env`, the app boots and `/login` shows the dev-default warning; logging in with `letmein` succeeds and redirects to `/`.
- [ ] Setting `OWNER_PASSWORD` makes `letmein` fail with 401 and the correct value succeed; the warning banner disappears.
- [ ] Requesting `/` or any `/trips/**` page without a valid session redirects to `/login`; an owner API write without a session returns 401.
- [ ] The session cookie is httpOnly (not readable from `document.cookie`) and logout clears it.
