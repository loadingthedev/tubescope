FROM oven/bun:1.4.5-slim AS build
WORKDIR /app
COPY package.json bun.lock tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/shared/package.json ./packages/shared/package.json
RUN bun install --frozen-lockfile --ignore-scripts
COPY apps/web ./apps/web
COPY packages/shared ./packages/shared
RUN bun run build

FROM oven/bun:1.4.5-slim AS runtime
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/shared/package.json ./packages/shared/package.json
RUN bun install --frozen-lockfile --production --ignore-scripts
COPY apps/api ./apps/api
COPY packages/shared ./packages/shared
COPY --from=build /app/apps/web/dist ./apps/web/dist
ENV NODE_ENV=production PORT=4949 TUBESCOPE_DATA_DIR=/data HOME=/tmp TUBESCOPE_NO_AUTOCONNECT=1 TUBESCOPE_NO_PUBLIC=1
RUN mkdir /data && chown bun:bun /data
USER bun
EXPOSE 4949
CMD ["bun", "apps/api/src/server.ts"]
