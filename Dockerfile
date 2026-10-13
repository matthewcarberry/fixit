# syntax=docker/dockerfile:1

# ---------- build ----------
# The full image ships python3, make and g++, which better-sqlite3 needs to compile.
FROM node:22-bookworm AS build
RUN corepack enable
WORKDIR /src

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY apps/e2e/package.json apps/e2e/
RUN pnpm install --frozen-lockfile

COPY packages packages
COPY apps apps
RUN pnpm build \
 && pnpm --filter @fixit/server deploy --prod --legacy /out \
 && cp -r apps/server/dist apps/server/drizzle /out/ \
 && cp -r apps/web/dist /out/public

# ---------- runtime ----------
FROM node:22-bookworm-slim

ARG VERSION=dev
ENV NODE_ENV=production \
    PORT=8080 \
    FIXIT_DATA_DIR=/config \
    FIXIT_WEB_DIR=/app/public \
    FIXIT_VERSION=${VERSION} \
    PUID=99 \
    PGID=100 \
    UMASK=022 \
    TZ=UTC

WORKDIR /app
COPY --from=build /out /app
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh && mkdir -p /config

LABEL org.opencontainers.image.title="Fixit" \
      org.opencontainers.image.description="A small, self-hosted help desk for the people in your home." \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.version="${VERSION}" \
      net.unraid.docker.webui="http://[IP]:[PORT:8080]/" \
      net.unraid.docker.icon="https://raw.githubusercontent.com/matthewcarberry/fixit/main/apps/web/public/icons/icon-512.png"

VOLUME /config
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["node", "dist/index.js"]
