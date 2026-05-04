# Chopped Ranking

> For entertainment purposes only.

A small full-stack toy: a FastAPI service wraps a face-attractiveness model, and an Expo (React Native + Web/PWA) client renders a chopped score with roasts.

## Layout

```
backend/   FastAPI service (Dockerized)
frontend/  Expo Router app — iOS, Android, Web/PWA
.github/   Release workflows (GHCR image + Android APK)
```

## Run with Docker (recommended)

```bash
docker compose up --build
```

- API: http://localhost:8000/health
- Web: http://localhost:8080

The API container preloads the model at build time so cold starts are fast.

### Environment variables (API)

| Variable             | Default            | Notes                                    |
| -------------------- | ------------------ | ---------------------------------------- |
| `MODEL_ID`           | dima806/...        | HuggingFace model id                     |
| `MAX_UPLOAD_BYTES`   | `10485760` (10 MB) | Reject larger uploads with 413           |
| `ALLOWED_ORIGINS`    | `*`                | Comma-separated CORS allowlist           |
| `RATE_LIMIT_RATE`    | `30/minute`        | Per-client rate limit on `/rate`         |
| `RATE_LIMIT_GLOBAL`  | `120/minute`       | Default per-client global limit          |
| `TORCH_NUM_THREADS`  | `1`                | CPU threads for torch                    |
| `ENV`                | `production`       | Set to `development` to enable docs      |
| `ENABLE_DOCS`        | `0` in prod        | Force-enable `/docs` and `/openapi.json` |

In production, `/docs`, `/redoc`, and `/openapi.json` are disabled.

### Backend safeguards

- Per-client rate limiting via `slowapi`
- Single concurrent `/rate` request per client (effectively serializes per device — MAC addresses aren't visible to a public web service, so we use the client IP / `X-Forwarded-For`)
- Image bytes capped, decoded with PIL in a context manager, model run in a worker thread (`asyncio.to_thread`) so the event loop stays responsive
- Runs as a non-root user inside the container

## Local dev

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
ENV=development uvicorn api:app --host 0.0.0.0 --port 8000 --reload
```

### Frontend

```bash
cd frontend
npm install
npm run web        # PWA
npm run android    # native dev build
```

The API base URL is configured in-app under **Settings**. Default:
`https://chopped.pianonic.ch`.

## PWA

`npm run build:web` outputs a static PWA to `frontend/dist`:

- web manifest at `/manifest.webmanifest`
- service worker at `/sw.js` (network-first for navigations, stale-while-revalidate for assets, never caches `/rate`)
- offline shell, installable on iOS/Android/desktop
- served by nginx in the `web` container with proper cache headers

`scripts/prepare-pwa.js` copies the existing app icon into PWA-named files. Replace those with proper 192/512/maskable PNGs before shipping.

## Releases

Two workflows fire on `release: published`:

1. **`docker-publish.yml`** — builds and pushes multi-arch (amd64/arm64) images to GHCR with provenance and SBOM:
   - `ghcr.io/<owner>/chopped-ranking` (API)
   - `ghcr.io/<owner>/chopped-ranking-web` (PWA)
   Tags: `latest`, the release tag, semver variants, and short SHA.
2. **`android-release.yml`** — `expo prebuild` + `gradlew assembleRelease`, then attaches `chopped-<version>.apk` as a release asset.

Both can also be triggered manually via `workflow_dispatch`.

### Cutting a release

```bash
git tag v1.0.0
git push origin v1.0.0
# then on GitHub: Releases → Draft a new release → choose the tag → Publish
```

The published event fires both workflows. The APK lands on the release page; the images land in GHCR. To make GHCR images public, open the package settings on GitHub and set visibility to public.
