# syntax=docker/dockerfile:1.7

# ---------- builder ----------
FROM node:20-alpine AS builder
WORKDIR /app

ENV CI=1 EXPO_NO_TELEMETRY=1

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build:web

# ---------- runtime ----------
FROM nginx:1.27-alpine AS runtime

RUN rm -rf /usr/share/nginx/html/*
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1

LABEL org.opencontainers.image.title="chopped-ranking-web" \
      org.opencontainers.image.description="Chopped Scanner PWA" \
      org.opencontainers.image.source="https://github.com/PianoNic/chopped-ranking" \
      org.opencontainers.image.licenses="MIT"
