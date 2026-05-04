# syntax=docker/dockerfile:1.7

# ---------- Stage 1: builder ----------
FROM python:3.11-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /build

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./

# Install into an isolated prefix we can copy in stage 2
RUN pip install --prefix=/install --no-cache-dir -r requirements.txt

# ---------- Stage 2: model warmup ----------
# Pre-download the HuggingFace model so the runtime image starts instantly
FROM python:3.11-slim AS model

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HF_HOME=/models \
    TRANSFORMERS_CACHE=/models

COPY --from=builder /install /usr/local

RUN python -c "from transformers import AutoImageProcessor, AutoModelForImageClassification; \
MODEL_ID='dima806/attractive_faces_celebs_detection'; \
AutoImageProcessor.from_pretrained(MODEL_ID); \
AutoModelForImageClassification.from_pretrained(MODEL_ID)"

# ---------- Stage 3: runtime ----------
FROM python:3.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HF_HOME=/models \
    TRANSFORMERS_CACHE=/models \
    PORT=8000

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system app \
    && useradd --system --gid app --home /app --shell /usr/sbin/nologin app \
    && mkdir -p /data/uploads \
    && chown -R app:app /data

WORKDIR /app

COPY --from=builder /install /usr/local
COPY --from=model --chown=app:app /models /models
COPY --chown=app:app *.py ./

USER app

VOLUME ["/data"]

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://127.0.0.1:${PORT}/health || exit 1

LABEL org.opencontainers.image.title="chopped-ranking-api" \
      org.opencontainers.image.description="Chopped Rating FastAPI service" \
      org.opencontainers.image.source="https://github.com/PianoNic/chopped-ranking" \
      org.opencontainers.image.licenses="MIT"

CMD ["sh", "-c", "uvicorn api:app --host 0.0.0.0 --port ${PORT}"]
