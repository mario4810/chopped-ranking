# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A small full-stack toy: a FastAPI service wraps a face-attractiveness HuggingFace model and scores uploaded photos ("chopped score"), returning a joke label + roasts. An Expo (React Native + Web/PWA) client lets users create/join groups, submit selfies, and view group leaderboards. For entertainment purposes only.

```
backend/   FastAPI service (Dockerized) — api.py (scoring), groups.py (users/groups/entries), db.py (SQLAlchemy models)
frontend/  Expo Router app — iOS, Android, Web/PWA
.github/   Release workflows (GHCR image + Android APK), fire on `release: published`
```

## Commands

### Backend (from `backend/`)

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
ENV=development uvicorn api:app --host 0.0.0.0 --port 8000 --reload
```

There is no backend test suite or linter configured — verify changes by running the server and hitting endpoints (`/health`, `/rate`, `/groups`, etc.) directly, or with `docker compose up --build`.

### Frontend (from `frontend/`)

```bash
npm install
npm run web        # PWA dev server (expo start --web)
npm run android     # native dev build
npm run ios
npm run lint        # expo lint (eslint-config-expo, flat config)
npm run build:web   # static PWA export to frontend/dist
```

There is no frontend test suite. `npm run lint` is the only automated check.

### Full stack via Docker

```bash
docker compose up --build
```
API on `http://localhost:8000/health`, web on `http://localhost:8080`. The API image preloads the HF model at build time (see `backend/Dockerfile` model-warmup stage) so cold starts are fast.

## Architecture

### Backend (`backend/`)

Two route groups share one FastAPI app (`api.py`):

- **`api.py`** — app setup, CORS, rate limiting (`slowapi`), the HF classifier (`Classifier`, loaded once at startup in `lifespan`), the anonymous `/rate` endpoint (score-only, no persistence), and the shared `build_label`/`build_roasts` joke generators consumed by both `/rate` and `groups.py`.
- **`groups.py`** — the persistent flow: token-based pseudo-auth (`current_user` reads `Authorization: Bearer <token>`, matched against a SHA-256 hash stored per user — there are no passwords, the client generates a random 256-bit token on first launch and self-registers via `POST /users`), groups with unguessable join codes, memberships, and entries (image upload → score via the same classifier → persisted to disk + DB). Imports `classifier`/`build_label`/`build_roasts` from `api.py` lazily inside the request handler to avoid a circular import at module load time.
- **`db.py`** — SQLAlchemy models (`User`, `Group`, `Membership`, `Entry`) and a sync SQLite engine. `DATA_DIR` (default `/data`) holds `chopped.db` and `uploads/`; both are created on import. `init_db()` runs in the FastAPI `lifespan` on startup.
- Uploaded images are decoded with PIL (EXIF-orientation-corrected via `ImageOps.exif_transpose`), converted to RGB, and re-saved as JPEG under `UPLOADS_DIR`; entry images are served back through a capability-URL-style route (`GET /entries/{id}/image`) — the entry ID itself (UUIDv4) is the only credential, since it's only ever revealed via an authenticated leaderboard response.
- The classifier runs in a worker thread (`asyncio.to_thread`) so the event loop isn't blocked; there is a per-client (IP-based) in-flight lock limiting `/rate` to one concurrent request per client, on top of the `slowapi` rate limits.
- Config is env-var driven throughout (see README's "Environment variables (API)" table) — `MODEL_ID`, `MAX_UPLOAD_BYTES`, `ALLOWED_ORIGINS`, `RATE_LIMIT_RATE`/`RATE_LIMIT_GLOBAL`, `TORCH_NUM_THREADS`, `ENV`, `ENABLE_DOCS`. `/docs`/`/redoc`/`/openapi.json` are only served when `ENABLE_DOCS=1` or `ENV=development`.

### Frontend (`frontend/`)

Expo Router app (file-based routing under `app/`). Key screens: `app/index.tsx` (home/rate flow), `app/groups/index.tsx` (group list/create/join), `app/groups/[id].tsx` (leaderboard + submit entry), `app/settings.tsx` (API base URL + accent color).

State is provided via two top-level React contexts wired in `app/_layout.tsx` (`SettingsProvider` → `IdentityProvider` → `AuthBootstrap` → the themed `Stack`):

- **`lib/identity.tsx`** — generates and persists (AsyncStorage) a per-device anonymous identity: a UUID, a random 256-bit hex token, and a whimsical random display name (adjective + animal). This is the entire auth model — no accounts, no passwords.
- **`lib/settings.tsx`** — persists the API base URL and accent color. `DEFAULT_API_BASE_URL` is `/api` on web (same-origin behind the nginx reverse proxy, see `frontend/nginx.conf`) and empty on native (user must set an absolute `https://` URL in Settings before anything works).
- **`lib/auth-bootstrap.tsx`** — `AuthBootstrap` is a headless component that calls `POST /users` (upsert) whenever identity or API URL changes, so the bearer token is registered before any authenticated call is made; failures are swallowed silently (auth errors surface naturally on the next real call).
- **`lib/api.ts`** — thin fetch wrapper (`safeFetch`) for every backend endpoint; throws on non-OK responses using the backend's `detail`/`error` field. Image upload (`submitGroupEntry`) branches on `Platform.OS === 'web'` (blob via `fetch(uri).then(r => r.blob())`) vs. native (`{ uri, name, type }` FormData part).

Path alias `@/*` maps to the `frontend/` root (see `tsconfig.json`).

### Web/PWA

`npm run build:web` exports a static PWA to `frontend/dist`, served by nginx in the `web` Docker container (see `frontend/nginx.conf`, `frontend/Dockerfile`). Service worker (`/sw.js`) is network-first for navigations, stale-while-revalidate for assets, and never caches `/rate`. `scripts/prepare-pwa.js` copies the app icon into PWA-named icon files — replace with real 192/512/maskable PNGs before shipping.

## Releases

Two workflows fire on `release: published` (also triggerable via `workflow_dispatch`):

1. `docker-publish.yml` — multi-arch (amd64/arm64) images to GHCR: `ghcr.io/<owner>/chopped-ranking` (API) and `ghcr.io/<owner>/chopped-ranking-web` (PWA), tagged `latest`/release tag/semver variants/short SHA.
2. `android-release.yml` — `expo prebuild` + `gradlew assembleDebug`, attaches `chopped-<version>.apk` to the release.

```bash
git tag v1.0.0
git push origin v1.0.0
# then on GitHub: Releases → Draft a new release → choose the tag → Publish
```
